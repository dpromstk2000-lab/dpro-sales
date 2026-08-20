/*
 * DPRO SALESNAVI V67.4
 * Version: SALESNAVI-67.4-LINE-OFFICIAL-LAST-CHANNEL-20260820
 *
 * CONTACT-first real-sales policy overlay for the V67.2 drawer.
 *
 * New prospecting priority:
 *   CONTACT -> Instagram DM -> LINE公式（一般問い合わせ可） -> その他の適切な公開窓口
 *
 * Changes from V67.3:
 * - Adds a formal LINE公式 channel for stores that publicly accept general inquiries.
 * - Keeps 個人LINE separate and limited to an established relationship / consent.
 * - Records LINE公式 outreach as its own result/activity and creates a 4-day reply check.
 * - Re-opens a sent prospect with the most recently recorded outreach channel selected.
 * - Keeps public email out of the new-sales selector.
 * - Keeps phone only as a fallback.
 * - Normalizes sender name to "DPRO SHOP".
 *
 * No Worker / SQL / DB schema change.
 */
(() => {
  'use strict';

  const VERSION = 'SALESNAVI-67.4-LINE-OFFICIAL-LAST-CHANNEL-20260820';
  const ACTIVE_QUEUE = new Set(['queued', 'planned', 'in_progress']);
  const sentLocks = new Set();
  let timer = null;
  let lastRoot = null;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function cfg() { return window.DPRO_CONFIG || {}; }

  function session() {
    try {
      return JSON.parse(localStorage.getItem(cfg().sessionStorageKey || 'dpro_sales_session_v3') || 'null');
    } catch {
      return null;
    }
  }

  function token() { return session()?.token || ''; }

  async function request(path, { method = 'GET', body = null } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== null) headers['Content-Type'] = 'application/json; charset=utf-8';
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const res = await fetch(String(cfg().apiBaseUrl || '') + path, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body),
      credentials: 'omit',
      cache: 'no-store'
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || data.error || `APIエラー (${res.status})`);
    }
    return data;
  }

  function toast(message, type = 'success') {
    const stack = $('#toastStack');
    if (stack) {
      const el = document.createElement('div');
      el.className = `toast ${type}`;
      el.textContent = message;
      stack.appendChild(el);
      setTimeout(() => el.remove(), 5200);
      return;
    }
    console[type === 'error' ? 'error' : 'log']('[V67.4]', message);
  }

  function todayJst() {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const o = Object.fromEntries(p.map(x => [x.type, x.value]));
    return `${o.year}-${o.month}-${o.day}`;
  }

  function addDays(dateText, days) {
    const d = new Date(`${dateText}T12:00:00+09:00`);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function fmtDate(dateText) {
    try {
      return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        weekday: 'short'
      }).format(new Date(`${dateText}T00:00:00+09:00`));
    } catch {
      return dateText;
    }
  }

  function prospectName() {
    return $('#drawerBody .detail-hero h2')?.textContent?.trim() || 'この店舗';
  }

  function websiteHref() {
    const hero = $$('#drawerBody .detail-hero a[href]');
    return hero.find(a => /WEBサイト|Webサイト|ホームページ|公式サイト/.test(a.textContent || ''))?.href || '';
  }

  function lpHref() {
    return $$('#drawerBody a[href]').find(a => /営業LP|提案LP/.test(a.textContent || ''))?.href || '';
  }

  function productBox() {
    return $$('#drawerBody .detail-box').find(
      b => /提案するDPROシステム/.test(b.querySelector('h4')?.textContent || '')
    ) || null;
  }

  function featureBox() {
    return $$('#drawerBody .detail-box').find(
      b => /店舗に響く機能/.test(b.querySelector('h4')?.textContent || '')
    ) || null;
  }

  function productName() {
    const txt = productBox()?.querySelector('p')?.innerText || '';
    return txt.split(/\n+/).map(x => x.trim()).filter(Boolean)[0] || 'DPROの店舗向けシステム';
  }

  function features() {
    return featureBox()
      ? $$('li', featureBox()).map(li => li.textContent.trim()).filter(Boolean).slice(0, 3)
      : [];
  }

  function normalizeSender(text) {
    return String(text || '')
      .replace(/DPROです。/g, 'DPRO SHOPです。')
      .replace(/DPROで店舗向け/g, 'DPRO SHOPで店舗向け');
  }

  function normalizeTemplate(root) {
    const ta = root?.querySelector('[data-template]');
    if (!ta) return;
    const next = normalizeSender(ta.value);
    if (next !== ta.value) ta.value = next;
  }

  function lineOfficialTemplate() {
    const name = prospectName();
    const product = productName();
    const lp = lpHref() || '【提案LP URL】';
    const fs = features();
    const feature = fs.length ? fs.join('・') : '予約や再来店フォローなどの店舗運営機能';

    return `突然のメッセージ失礼いたします。DPRO SHOPです。

${name}様にもご覧いただけそうな店舗向けの「${product}」を制作しています。${feature}などをまとめています。

お時間のある際に、実際の画面を1分ほどご覧いただけましたら幸いです。
${lp}

ご興味がなければご返信は不要です。
DPRO SHOP`;
  }

  function ensurePolicyNote(root) {
    const check = root.querySelector('.sales672-check');
    if (!check) return;

    check.textContent =
      '送信前：営業・勧誘禁止の窓口には送らない／予約専用フォーム・予約専用LINEなど不適切な窓口には送らない／同じ店舗へ重複送信しない／最初はLPを1本だけ送る。';

    let note = root.querySelector('[data-sales674-email-note]');
    if (!note) {
      note = document.createElement('div');
      note.setAttribute('data-sales674-email-note', '1');
      note.className = 'sales674-note';
      check.insertAdjacentElement('afterend', note);
    }
    note.textContent =
      'メールは新規営業の基本窓口には使いません。CONTACT等で反応があり、相手から資料送付・返信を希望された後の通常連絡に使用します。';
  }

  function ensureStyle() {
    if ($('#sales674Style')) return;
    const s = document.createElement('style');
    s.id = 'sales674Style';
    s.textContent = `
      .sales674-note{
        margin-top:9px;padding:10px 11px;border:1px solid #d8e4ec;background:#f7fafc;
        border-radius:10px;color:#5b6f80;font-size:12px;line-height:1.65
      }
      #sales672[data-sales674="1"] [data-channel]{display:none!important}
      #sales672[data-sales674="1"] [data-sales674-channel]{display:block}
      #sales672[data-sales674="1"] .sales672-policy b{color:#087553}
    `;
    document.head.appendChild(s);
  }

  function customSelect(root) {
    return root.querySelector('[data-sales674-channel]');
  }

  function baseSelect(root) {
    return root.querySelector('[data-channel]');
  }

  function ensureCustomSelect(root) {
    const base = baseSelect(root);
    if (!base) return null;

    let select = customSelect(root);
    if (select) return select;

    select = document.createElement('select');
    select.setAttribute('data-sales674-channel', '1');
    select.innerHTML = `
      <option value="contact">WEB CONTACT／問い合わせフォーム（最優先）</option>
      <option value="instagram">Instagram DM</option>
      <option value="line_official">LINE公式（一般問い合わせ可）</option>
      <option value="other">その他の適切な公開窓口</option>
      <option value="line_existing">個人LINE（既存関係・了承あり）</option>
    `;
    base.insertAdjacentElement('afterend', select);

    const initial = ['contact', 'instagram', 'other', 'line_existing'].includes(base.value)
      ? base.value
      : 'contact';
    select.value = initial;

    select.addEventListener('change', () => switchChannel(root, select.value, true));

    root.addEventListener('click', e => {
      const btn = e.target.closest('[data-sales674-record-line-official]');
      if (!btn) return;
      recordLineOfficial(root.dataset.prospectId);
    });

    return select;
  }

  function resetRecordButton(root) {
    const btn = root.querySelector('[data-sales674-record-line-official]');
    if (!btn) return;
    btn.removeAttribute('data-sales674-record-line-official');
    btn.setAttribute('data-record-sent', '');
  }

  function setLineOfficialRecordButton(root) {
    const btn = root.querySelector('[data-record-sent], [data-sales674-record-line-official]');
    if (!btn) return;
    btn.removeAttribute('data-record-sent');
    btn.setAttribute('data-sales674-record-line-official', '1');
    btn.textContent = 'LINE公式で送信済みとして記録';
  }

  function setLineOfficialUi(root) {
    const ta = root.querySelector('[data-template]');
    if (ta) ta.value = lineOfficialTemplate();

    const primary = root.querySelector('[data-open-primary]');
    if (primary) {
      primary.textContent = 'LINE公式は手動で開く';
      primary.dataset.href = '';
      primary.disabled = false;
    }

    const second = root.querySelector('[data-open-second]');
    const web = websiteHref();
    if (second) {
      if (web) {
        second.textContent = 'WEBサイトを開く';
        second.dataset.href = web;
        second.classList.remove('hidden');
      } else {
        second.textContent = '';
        second.dataset.href = '';
        second.classList.add('hidden');
      }
    }

    const warn = root.querySelector('[data-warn]');
    if (warn) {
      warn.classList.add('show');
      warn.textContent =
        'LINE公式は、店舗が公開しており一般問い合わせを受け付けている場合だけ使用してください。予約専用・自動受付専用・営業禁止のLINEには送らないでください。';
    }

    setLineOfficialRecordButton(root);
  }

  function switchChannel(root, channel, fromUser = false) {
    const select = customSelect(root);
    const base = baseSelect(root);
    if (!select || !base) return;

    if (select.value !== channel) select.value = channel;

    if (channel === 'line_official') {
      // Keep the hidden base channel on a known value so V67.2 never receives an unknown channel.
      base.value = 'other';
      setLineOfficialUi(root);
      return;
    }

    resetRecordButton(root);
    base.value = channel;
    base.dispatchEvent(new Event('change', { bubbles: true }));

    setTimeout(() => {
      normalizeTemplate(root);
      if (fromUser && customSelect(root)?.value !== channel) {
        customSelect(root).value = channel;
      }
    }, 0);
    setTimeout(() => normalizeTemplate(root), 90);
  }

  async function fetchDetail(id) {
    return request(`/api/prospects/${encodeURIComponent(id)}/sales-detail`);
  }

  async function fetchQueue() {
    const d = await request(`/api/sales-queue?date=${encodeURIComponent(todayJst())}`);
    return Array.isArray(d.queueItems) ? d.queueItems : [];
  }

  function activeQueue(items, id) {
    return items.find(q =>
      q?.prospect_id === id && ACTIVE_QUEUE.has(String(q.queue_status || 'queued'))
    ) || null;
  }

  function pendingReply(detail) {
    return (detail?.nextActions || []).some(a =>
      ['pending', 'snoozed'].includes(String(a?.status || '')) &&
      String(a?.action_type || '') === 'reply_check'
    );
  }

  function activityTime(a) {
    const raw = a?.occurred_at || a?.activity_at || a?.created_at || a?.updated_at || '';
    const n = Date.parse(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function channelFromActivity(a) {
    const code = String(a?.result_code || '');
    const metaChannel = a?.metadata?.channel || a?.metadata_json?.channel || '';
    const summary = String(a?.summary || '');

    if (metaChannel === 'line_official' || code === 'outreach_line_official_sent' || /LINE公式/.test(summary)) {
      return 'line_official';
    }
    if (metaChannel === 'instagram' || code === 'outreach_instagram_sent' || /Instagram DM/.test(summary)) {
      return 'instagram';
    }
    if (metaChannel === 'contact' || code === 'outreach_contact_sent' || /CONTACTフォーム/.test(summary)) {
      return 'contact';
    }
    if (metaChannel === 'line_existing' || code === 'outreach_line_existing_sent' || /既存関係LINE/.test(summary)) {
      return 'line_existing';
    }
    if (metaChannel === 'other' || code === 'outreach_other_sent' || /公開窓口/.test(summary)) {
      return 'other';
    }
    return '';
  }

  function lastRecordedChannel(detail) {
    const acts = [...(detail?.activities || [])]
      .map((a, index) => ({ a, index, channel: channelFromActivity(a) }))
      .filter(x => x.channel);

    if (!acts.length) return '';

    acts.sort((x, y) => {
      const dt = activityTime(y.a) - activityTime(x.a);
      return dt || x.index - y.index;
    });
    return acts[0].channel;
  }

  async function restoreLastChannel(root, force = false) {
    const id = root?.dataset?.prospectId || '';
    if (!id) return;
    if (!force && root.dataset.sales674Restored === id) return;

    root.dataset.sales674Restored = id;
    try {
      const detail = await fetchDetail(id);
      if ($('#sales672') !== root || root.dataset.prospectId !== id) return;

      const last = lastRecordedChannel(detail);
      if (last) switchChannel(root, last, false);
      else {
        const base = baseSelect(root);
        const current = ['contact', 'instagram', 'other', 'line_existing'].includes(base?.value)
          ? base.value
          : (websiteHref() ? 'contact' : 'instagram');
        switchChannel(root, current, false);
      }

      updateStatusFromDetail(root, detail);
    } catch (e) {
      console.warn('[V67.4] restore channel', e);
    }
  }

  function updateStatusFromDetail(root, detail) {
    const acts = (detail?.activities || []).filter(a =>
      String(a?.result_code || '').startsWith('outreach_')
    );
    const status = root.querySelector('[data-status]');
    if (status) status.textContent = acts.length ? '送信記録あり' : '本日の送信記録なし';

    const next = (detail?.nextActions || [])
      .filter(a => ['pending', 'snoozed'].includes(String(a?.status || '')))
      .sort((a, b) => String(a?.due_date || '').localeCompare(String(b?.due_date || '')))[0];

    const nextEl = root.querySelector('[data-next]');
    if (nextEl) {
      nextEl.textContent = next
        ? `${fmtDate(next.due_date)} ${next.description || '反応確認'}`
        : '次回予定なし';
    }
  }

  async function recordLineOfficial(id) {
    const root = $('#sales672');
    if (!root || !id || sentLocks.has(id)) return;

    const due = addDays(todayJst(), 4);
    if (!confirm(
      `${prospectName()}\n\n実際に「LINE公式」から提案LPを送信済みですか？\n\n送信済みとして記録し、${fmtDate(due)}に反応・返信確認を作成します。`
    )) return;

    sentLocks.add(id);
    const btn = root.querySelector('[data-sales674-record-line-official]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '記録中…';
    }

    try {
      const [detail, queue] = await Promise.all([fetchDetail(id), fetchQueue()]);
      const q = activeQueue(queue, id);

      const body = {
        activityType: 'line',
        resultCode: 'outreach_line_official_sent',
        summary: 'LINE公式で提案LP送付',
        details: '店舗公開のLINE公式（一般問い合わせ可）から提案LPを送付。非電話営業。',
        isOwnerContact: false,
        applyRule: false,
        completeQueue: true,
        metadata: {
          sales674: true,
          version: VERSION,
          channel: 'line_official',
          material: 'sales_lp',
          nonPhone: true,
          followDays: 4
        }
      };

      if (q?.id) body.queueItemId = q.id;

      if (!pendingReply(detail)) {
        body.nextAction = {
          actionType: 'reply_check',
          dueDate: due,
          description: 'LINE公式送付の反応・返信確認',
          priority: 'normal',
          isPrimary: true,
          metadata: {
            sales674: true,
            channel: 'line_official',
            material: 'sales_lp'
          }
        };
      }

      await request(`/api/prospects/${encodeURIComponent(id)}/record-activity`, {
        method: 'POST',
        body
      });

      toast(`LINE公式の送信済みを記録しました。反応確認：${fmtDate(due)}`);
      const fresh = await fetchDetail(id);
      if ($('#sales672') === root) {
        updateStatusFromDetail(root, fresh);
        switchChannel(root, 'line_official', false);
      }
    } catch (e) {
      toast(e.message || 'LINE公式の送信済みを記録できませんでした。', 'error');
    } finally {
      sentLocks.delete(id);
      const current = $('#sales672');
      if (current === root) {
        const b = root.querySelector('[data-sales674-record-line-official]');
        if (b) {
          b.disabled = false;
          b.textContent = 'LINE公式で送信済みとして記録';
        }
      }
    }
  }

  function apply(root) {
    if (!root) return;
    root.dataset.sales674 = '1';

    const ver = root.querySelector('.sales672-ver');
    if (ver) ver.textContent = 'V67.4';

    const head = root.querySelector('.sales672-head h4');
    if (head) head.textContent = 'CONTACT中心 営業ナビ';

    const lead = root.querySelector('.sales672-lead');
    if (lead) {
      lead.textContent =
        '相手の営業時間を邪魔せず、CONTACTを最優先に、短い文章＋提案LPを1本だけ届ける新規営業フローです。';
    }

    const policy = root.querySelector('.sales672-policy');
    if (policy) {
      policy.innerHTML =
        '<b>新規営業の基本：</b> CONTACT → Instagram DM → LINE公式（一般問い合わせ可） → その他適切な公開窓口。個人LINEは既存関係・了承ありの場合のみ。電話は補助手段です。';
    }

    const labels = $$('label', root);
    const methodLabel = labels.find(el =>
      /今回の送信方法|今回の連絡方法/.test(el.textContent || '')
    );
    if (methodLabel) methodLabel.textContent = '今回の連絡方法';

    ensurePolicyNote(root);
    ensureCustomSelect(root);
    normalizeTemplate(root);

    if (root.dataset.sales674Restored !== root.dataset.prospectId) {
      restoreLastChannel(root);
    }
  }

  function pulse() {
    const root = $('#sales672');
    if (!root) {
      lastRoot = null;
      return;
    }

    if (root !== lastRoot) {
      lastRoot = root;
      apply(root);
      return;
    }

    apply(root);
  }

  function bindBaseRecordRefresh() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('#sales672 [data-record-sent]');
      if (!btn) return;
      const root = $('#sales672');
      if (!root) return;

      // V67.2 records asynchronously. Re-read the server state after it has had time to finish.
      setTimeout(() => restoreLastChannel(root, true), 1200);
      setTimeout(() => restoreLastChannel(root, true), 2600);
    }, false);
  }

  function start() {
    ensureStyle();
    bindBaseRecordRefresh();
    if (timer) clearInterval(timer);
    timer = setInterval(pulse, 320);
    pulse();
    document.documentElement.dataset.sales674 = VERSION;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.DPRO_SALES674 = Object.freeze({ version: VERSION });
})();
