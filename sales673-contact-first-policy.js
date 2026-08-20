/*
 * DPRO SALESNAVI V67.6 PACKAGE
 * Includes V67.4 CONTACT/LINE official drawer + V67.5 recent-batch view + V67.6 pipeline sales-state filter.
 *
 * DPRO SALESNAVI V67.5 PACKAGE
 * Includes V67.4 CONTACT/LINE official drawer + V67.5 recent-candidate pipeline filter.
 *
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
/*
 * ============================================================
 * DPRO SALESNAVI V67.5
 * Version: SALESNAVI-67.5-RECENT-BATCH-UNSENT-FILTER-20260820
 *
 * Pipeline usability add-on:
 * - Remembers the latest candidate import batch from "候補を探す".
 * - Shows "前回登録した候補" as a dedicated quick list.
 * - Shows "未営業だけ" with one click.
 * - Displays sent/unsent state, last outreach channel and next reply-check.
 * - Can infer the most recent already-imported batch from prospect timestamps/search-run metadata
 *   when V67.5 was installed after the import.
 * - No Worker / SQL / DB schema change.
 * ============================================================
 */
(() => {
  'use strict';

  const VERSION = 'SALESNAVI-67.5-RECENT-BATCH-UNSENT-FILTER-20260820';
  const STORAGE_KEY = 'dpro_sales_v675_last_import_batch';
  const MAX_INFER = 20;
  const DETAIL_CONCURRENCY = 4;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let timer = null;
  let refreshSeq = 0;
  let currentMode = 'recent'; // recent | unsent | normal
  let cachedRows = [];
  let lastVisible = false;
  let importResolveTimers = [];

  function cfg() { return window.DPRO_CONFIG || {}; }

  function session() {
    try {
      return JSON.parse(localStorage.getItem(cfg().sessionStorageKey || 'dpro_sales_session_v3') || 'null');
    } catch {
      return null;
    }
  }

  function token() { return session()?.token || ''; }

  function safeParse(text, fallback = null) {
    try { return JSON.parse(text); } catch { return fallback; }
  }

  function loadStoredBatch() {
    try {
      const data = safeParse(localStorage.getItem(STORAGE_KEY) || '', null);
      return data && typeof data === 'object' ? data : null;
    } catch {
      return null;
    }
  }

  function saveStoredBatch(batch) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(batch)); } catch {}
  }

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function arr(v) { return Array.isArray(v) ? v : []; }

  async function request(path) {
    const headers = { Accept: 'application/json' };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const res = await fetch(String(cfg().apiBaseUrl || '') + path, {
      method: 'GET',
      headers,
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
    console[type === 'error' ? 'error' : 'log']('[V67.5]', message);
  }

  function normalizeName(v) {
    return String(v || '').toLowerCase().replace(/\s+/g, '').replace(/[‐‑‒–—―ー\-・･]/g, '');
  }

  function normalizeAddress(v) {
    return String(v || '').toLowerCase().replace(/\s+/g, '').replace(/[〒,，]/g, '');
  }

  function prospectPlaceId(p) {
    return String(
      p?.google_place_id ??
      p?.googlePlaceId ??
      p?.place_id ??
      p?.placeId ??
      p?.source_place_id ??
      p?.sourcePlaceId ??
      ''
    );
  }

  function prospectTimeText(p) {
    return String(
      p?.imported_at ??
      p?.importedAt ??
      p?.registered_at ??
      p?.registeredAt ??
      p?.created_at ??
      p?.createdAt ??
      p?.inserted_at ??
      p?.insertedAt ??
      ''
    );
  }

  function prospectTimeMs(p) {
    const n = Date.parse(prospectTimeText(p));
    return Number.isFinite(n) ? n : 0;
  }

  function prospectRunKey(p) {
    return String(
      p?.search_run_id ??
      p?.searchRunId ??
      p?.source_search_run_id ??
      p?.sourceSearchRunId ??
      p?.import_run_id ??
      p?.importRunId ??
      p?.source_run_id ??
      p?.sourceRunId ??
      ''
    );
  }

  function prospectName(p) {
    return String(p?.business_name ?? p?.businessName ?? p?.name ?? '');
  }

  function prospectAddress(p) {
    return String(p?.address ?? p?.formatted_address ?? p?.formattedAddress ?? p?.area ?? '');
  }

  function activityTimeMs(a) {
    const raw = a?.activity_at ?? a?.occurred_at ?? a?.created_at ?? a?.updated_at ?? '';
    const n = Date.parse(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function outreachChannel(a) {
    const code = String(a?.result_code || '');
    const summary = String(a?.summary || '');
    const meta = a?.metadata || a?.metadata_json || {};
    const ch = String(meta?.channel || '');

    if (ch === 'line_official' || code === 'outreach_line_official_sent' || /LINE公式/.test(summary)) return 'LINE公式';
    if (ch === 'instagram' || code === 'outreach_instagram_sent' || /Instagram DM/.test(summary)) return 'Instagram DM';
    if (ch === 'contact' || code === 'outreach_contact_sent' || /CONTACT/.test(summary)) return 'CONTACT';
    if (ch === 'line_existing' || code === 'outreach_line_existing_sent' || /既存関係LINE/.test(summary)) return '個人LINE';
    if (ch === 'other' || code === 'outreach_other_sent' || /公開窓口/.test(summary)) return 'その他公開窓口';
    if (/^outreach_/.test(code)) return '営業送信';
    return '';
  }

  function outreachInfo(detail) {
    const acts = arr(detail?.activities)
      .map(a => ({ a, channel: outreachChannel(a), time: activityTimeMs(a) }))
      .filter(x => x.channel)
      .sort((x, y) => y.time - x.time);

    const latest = acts[0] || null;
    const next = arr(detail?.nextActions)
      .filter(a =>
        ['pending', 'snoozed'].includes(String(a?.status || '')) &&
        String(a?.action_type || '') === 'reply_check'
      )
      .sort((a, b) => String(a?.due_date || '').localeCompare(String(b?.due_date || '')))[0] || null;

    return {
      sent: acts.length > 0,
      channel: latest?.channel || '',
      sentAt: latest?.time || 0,
      nextDate: String(next?.due_date || ''),
      nextDescription: String(next?.description || '')
    };
  }

  function fmtDate(v) {
    if (!v) return '';
    try {
      return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        weekday: 'short'
      }).format(new Date(`${String(v).slice(0, 10)}T00:00:00+09:00`));
    } catch {
      return String(v);
    }
  }

  function captureSelectedImport() {
    const checks = $$('#searchResults .result-check:checked:not(:disabled)');
    if (!checks.length) return;

    const entries = checks.map(ch => {
      const row = ch.closest('tr');
      return {
        placeId: String(ch.value || ''),
        name: row?.querySelector('.business-cell strong')?.textContent?.trim() || '',
        address: row?.querySelector('.business-cell small')?.textContent?.trim() || ''
      };
    });

    const pending = {
      version: VERSION,
      capturedAt: new Date().toISOString(),
      source: 'candidate-import',
      pending: true,
      entries,
      prospectIds: []
    };
    saveStoredBatch(pending);

    importResolveTimers.forEach(clearTimeout);
    importResolveTimers = [
      setTimeout(resolveStoredBatch, 1200),
      setTimeout(resolveStoredBatch, 2600),
      setTimeout(resolveStoredBatch, 5200)
    ];
  }

  function matchStoredEntries(prospects, stored) {
    const entries = arr(stored?.entries);
    if (!entries.length) return [];

    const byPlace = new Map();
    const byName = new Map();

    prospects.forEach(p => {
      const pid = prospectPlaceId(p);
      if (pid) byPlace.set(pid, p);
      const nk = normalizeName(prospectName(p));
      if (nk) {
        if (!byName.has(nk)) byName.set(nk, []);
        byName.get(nk).push(p);
      }
    });

    const matched = [];
    const seen = new Set();

    for (const e of entries) {
      let p = e.placeId ? byPlace.get(String(e.placeId)) : null;

      if (!p && e.name) {
        const candidates = byName.get(normalizeName(e.name)) || [];
        if (candidates.length === 1) p = candidates[0];
        else if (candidates.length > 1 && e.address) {
          const ea = normalizeAddress(e.address);
          p = candidates.find(x => {
            const pa = normalizeAddress(prospectAddress(x));
            return pa && ea && (pa.includes(ea) || ea.includes(pa));
          }) || candidates[0];
        }
      }

      if (p?.id && !seen.has(String(p.id))) {
        seen.add(String(p.id));
        matched.push(p);
      }
    }

    return matched;
  }

  function inferLatestBatch(prospects) {
    const timed = prospects
      .filter(p => p?.id && prospectTimeMs(p) > 0)
      .sort((a, b) => prospectTimeMs(b) - prospectTimeMs(a));

    if (!timed.length) return [];

    const newest = timed[0];
    const runKey = prospectRunKey(newest);

    if (runKey) {
      const sameRun = timed.filter(p => prospectRunKey(p) === runKey).slice(0, MAX_INFER);
      if (sameRun.length) return sameRun;
    }

    // Search imports are normally inserted together within seconds.
    // Use a conservative 20-minute cluster around the newest registration.
    const newestMs = prospectTimeMs(newest);
    const cluster = timed.filter(p => newestMs - prospectTimeMs(p) <= 20 * 60 * 1000).slice(0, MAX_INFER);
    if (cluster.length) return cluster;

    return timed.slice(0, Math.min(5, MAX_INFER));
  }

  async function loadProspects() {
    const d = await request('/api/prospects?limit=500&order=score');
    return arr(d.prospects);
  }

  async function resolveStoredBatch() {
    try {
      const stored = loadStoredBatch();
      if (!stored?.pending) return;
      const prospects = await loadProspects();
      const matched = matchStoredEntries(prospects, stored);
      if (!matched.length) return;

      const next = {
        ...stored,
        pending: matched.length < arr(stored.entries).length,
        resolvedAt: new Date().toISOString(),
        prospectIds: matched.map(p => String(p.id))
      };
      saveStoredBatch(next);

      if ($('#view-pipeline')?.classList.contains('active')) refresh(true);
    } catch (e) {
      console.warn('[V67.5] resolve import batch', e);
    }
  }

  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;

    async function worker() {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        try { out[index] = await fn(items[index], index); }
        catch (e) { out[index] = { __error: e }; }
      }
    }

    const count = Math.min(Math.max(1, limit), items.length || 1);
    await Promise.all(Array.from({ length: count }, worker));
    return out;
  }

  async function enrichRows(batch) {
    const details = await mapLimit(batch, DETAIL_CONCURRENCY, async p => {
      const d = await request(`/api/prospects/${encodeURIComponent(p.id)}/sales-detail`);
      return d;
    });

    return batch.map((p, i) => {
      const detail = details[i]?.__error ? null : details[i];
      const info = outreachInfo(detail);
      return {
        id: String(p.id),
        name: prospectName(p) || '店舗名未取得',
        address: prospectAddress(p),
        priority: String(p?.manual_priority_grade || p?.priority_grade || ''),
        stage: String(p?.pipeline_stage || ''),
        registeredAt: prospectTimeText(p),
        ...info,
        detailError: Boolean(details[i]?.__error)
      };
    });
  }

  function ensureStyle() {
    if ($('#sales675Style')) return;
    const s = document.createElement('style');
    s.id = 'sales675Style';
    s.textContent = `
      .sales675-panel{
        margin:0 0 16px;border:2px solid #74c7a7;background:linear-gradient(180deg,#f7fcfa,#edf9f4);
        border-radius:16px;padding:15px;box-shadow:0 4px 16px rgba(15,35,61,.04)
      }
      .sales675-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .sales675-head h3{margin:0;color:#087553;font-size:17px}
      .sales675-head p{margin:5px 0 0;color:#637589;font-size:11px;line-height:1.6}
      .sales675-ver{font-size:10px;color:#477466;background:#fff;border:1px solid #cce8dd;padding:5px 8px;border-radius:999px}
      .sales675-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}
      .sales675-stat{background:#fff;border:1px solid #d9ebe3;border-radius:11px;padding:10px}
      .sales675-stat small{display:block;color:#748697;font-size:10px}
      .sales675-stat b{display:block;margin-top:3px;color:#28493d;font-size:18px}
      .sales675-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}
      .sales675-actions button{
        border:1px solid #cbd9e3;background:#fff;color:#30485f;border-radius:10px;padding:9px 12px;
        font:inherit;font-size:11px;font-weight:800;cursor:pointer
      }
      .sales675-actions button.active{border-color:#15906c;background:#0f8b67;color:#fff}
      .sales675-actions button.refresh{margin-left:auto}
      .sales675-list{display:grid;gap:8px;margin-top:12px}
      .sales675-row{
        display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;
        background:#fff;border:1px solid #dbe6ec;border-radius:12px;padding:11px 12px
      }
      .sales675-row.sent{border-left:4px solid #45a986}.sales675-row.unsent{border-left:4px solid #e7a72d}
      .sales675-row strong{display:block;font-size:13px;color:#1c334b}
      .sales675-row .addr{display:block;margin-top:3px;color:#7a8998;font-size:9px;line-height:1.45}
      .sales675-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
      .sales675-pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:800;background:#eef3f7;color:#53677b}
      .sales675-pill.ok{background:#e8f7f0;color:#087553}.sales675-pill.wait{background:#fff4dd;color:#8d5a05}
      .sales675-open{
        border:1px solid #afd8c9;background:#f1faf6;color:#087553;border-radius:9px;padding:8px 10px;
        font:inherit;font-size:10px;font-weight:850;cursor:pointer;white-space:nowrap
      }
      .sales675-empty{margin-top:12px;padding:22px 12px;text-align:center;border:1px dashed #cad9e2;border-radius:12px;background:#fff;color:#718295;font-size:11px;line-height:1.7}
      .sales675-note{margin-top:9px;color:#718295;font-size:9px;line-height:1.55}
      #kanban.sales675-hidden{display:none!important}
      @media(max-width:700px){
        .sales675-summary{grid-template-columns:1fr}
        .sales675-row{grid-template-columns:1fr}
        .sales675-open{width:100%}
        .sales675-actions button.refresh{margin-left:0}
      }
    `;
    document.head.appendChild(s);
  }

  function ensurePanel() {
    const view = $('#view-pipeline');
    const kanban = $('#kanban');
    if (!view || !kanban) return null;

    let panel = $('#sales675Panel');
    if (panel) return panel;

    panel = document.createElement('section');
    panel.id = 'sales675Panel';
    panel.className = 'sales675-panel';
    panel.innerHTML = `
      <div class="sales675-head">
        <div>
          <h3>前回登録した候補</h3>
          <p>前回まとめて登録した店舗を、営業済み／未営業まで含めてすぐ確認できます。</p>
        </div>
        <span class="sales675-ver">V67.5</span>
      </div>
      <div class="sales675-summary">
        <div class="sales675-stat"><small>前回登録</small><b data-sales675-total>—</b></div>
        <div class="sales675-stat"><small>未営業</small><b data-sales675-unsent>—</b></div>
        <div class="sales675-stat"><small>営業済み</small><b data-sales675-sent>—</b></div>
      </div>
      <div class="sales675-actions">
        <button type="button" data-sales675-mode="recent">前回登録を表示</button>
        <button type="button" data-sales675-mode="unsent">未営業だけ</button>
        <button type="button" data-sales675-mode="normal">通常のパイプライン</button>
        <button type="button" class="refresh" data-sales675-refresh>状態を更新</button>
      </div>
      <div class="sales675-list" data-sales675-list></div>
      <div class="sales675-note" data-sales675-note>読み込み中…</div>
    `;
    kanban.insertAdjacentElement('beforebegin', panel);

    panel.addEventListener('click', e => {
      const modeBtn = e.target.closest('[data-sales675-mode]');
      if (modeBtn) {
        currentMode = modeBtn.dataset.sales675Mode || 'recent';
        render();
        return;
      }

      if (e.target.closest('[data-sales675-refresh]')) {
        refresh(true);
        return;
      }

      const open = e.target.closest('[data-sales675-open]');
      if (open?.dataset.sales675Open) {
        // Use the native owner's data-prospect click contract.
        const bridge = document.createElement('button');
        bridge.type = 'button';
        bridge.dataset.prospect = open.dataset.sales675Open;
        bridge.style.display = 'none';
        panel.appendChild(bridge);
        bridge.click();
        bridge.remove();
      }
    });

    return panel;
  }

  function render() {
    const panel = ensurePanel();
    const kanban = $('#kanban');
    if (!panel || !kanban) return;

    const total = cachedRows.length;
    const unsent = cachedRows.filter(x => !x.sent).length;
    const sent = total - unsent;

    panel.querySelector('[data-sales675-total]').textContent = String(total);
    panel.querySelector('[data-sales675-unsent]').textContent = String(unsent);
    panel.querySelector('[data-sales675-sent]').textContent = String(sent);

    $$('[data-sales675-mode]', panel).forEach(b => {
      b.classList.toggle('active', b.dataset.sales675Mode === currentMode);
    });

    const list = panel.querySelector('[data-sales675-list]');
    const note = panel.querySelector('[data-sales675-note]');

    if (currentMode === 'normal') {
      kanban.classList.remove('sales675-hidden');
      list.innerHTML = '';
      note.textContent = total
        ? `前回登録 ${total}件を記憶しています。「前回登録を表示」または「未営業だけ」でいつでも戻れます。`
        : '通常の営業パイプラインを表示しています。';
      return;
    }

    kanban.classList.add('sales675-hidden');
    const rows = currentMode === 'unsent' ? cachedRows.filter(x => !x.sent) : cachedRows;

    if (!rows.length) {
      list.innerHTML = `<div class="sales675-empty">${
        total
          ? (currentMode === 'unsent'
              ? '前回登録した候補はすべて営業済みです。<br>次に「候補を探す」から新しい店舗を登録すると、この一覧が自動で切り替わります。'
              : '前回登録した候補がありません。')
          : '前回登録した候補をまだ特定できません。<br>次回「候補を探す」からまとめて登録すると自動で記憶します。'
      }</div>`;
    } else {
      list.innerHTML = rows.map(r => {
        const status = r.sent ? '営業済み' : '未営業';
        const follow = r.nextDate
          ? `次回 ${fmtDate(r.nextDate)} ${r.nextDescription || '反応・返信確認'}`
          : '';
        return `
          <div class="sales675-row ${r.sent ? 'sent' : 'unsent'}">
            <div>
              <strong>${r.sent ? '✅' : '▶'} ${esc(r.name)}</strong>
              ${r.address ? `<span class="addr">${esc(r.address)}</span>` : ''}
              <div class="sales675-meta">
                <span class="sales675-pill ${r.sent ? 'ok' : 'wait'}">${status}</span>
                ${r.priority ? `<span class="sales675-pill">優先度 ${esc(r.priority)}</span>` : ''}
                ${r.channel ? `<span class="sales675-pill">${esc(r.channel)}</span>` : ''}
                ${follow ? `<span class="sales675-pill">${esc(follow)}</span>` : ''}
                ${r.detailError ? `<span class="sales675-pill wait">状態取得要確認</span>` : ''}
              </div>
            </div>
            <button type="button" class="sales675-open" data-sales675-open="${esc(r.id)}">店舗営業詳細を開く</button>
          </div>
        `;
      }).join('');
    }

    note.textContent = currentMode === 'unsent'
      ? `未営業 ${unsent}件だけを表示しています。店舗を開けば、そのままV67.4のCONTACT中心営業ナビで営業できます。`
      : `前回登録した ${total}件を表示しています。営業済みは✅、未営業は▶で表示します。`;
  }

  async function refresh(force = false) {
    const seq = ++refreshSeq;
    const panel = ensurePanel();
    if (!panel) return;

    const note = panel.querySelector('[data-sales675-note]');
    if (note) note.textContent = '前回登録候補と営業状態を確認しています…';

    try {
      const prospects = await loadProspects();
      if (seq !== refreshSeq) return;

      const stored = loadStoredBatch();
      let batch = [];

      if (stored?.prospectIds?.length) {
        const idSet = new Set(stored.prospectIds.map(String));
        batch = prospects.filter(p => idSet.has(String(p.id)));

        // Preserve original import order when possible.
        const order = new Map(stored.prospectIds.map((id, i) => [String(id), i]));
        batch.sort((a, b) => (order.get(String(a.id)) ?? 9999) - (order.get(String(b.id)) ?? 9999));
      }

      if (!batch.length && stored?.entries?.length) {
        batch = matchStoredEntries(prospects, stored);
        if (batch.length) {
          saveStoredBatch({
            ...stored,
            pending: false,
            resolvedAt: new Date().toISOString(),
            prospectIds: batch.map(p => String(p.id))
          });
        }
      }

      if (!batch.length) {
        batch = inferLatestBatch(prospects);
        if (batch.length) {
          saveStoredBatch({
            version: VERSION,
            capturedAt: new Date().toISOString(),
            source: 'inferred-latest-batch',
            pending: false,
            entries: batch.map(p => ({
              placeId: prospectPlaceId(p),
              name: prospectName(p),
              address: prospectAddress(p)
            })),
            prospectIds: batch.map(p => String(p.id))
          });
        }
      }

      const rows = batch.length ? await enrichRows(batch) : [];
      if (seq !== refreshSeq) return;

      cachedRows = rows;
      render();
    } catch (e) {
      if (seq !== refreshSeq) return;
      cachedRows = [];
      render();
      if (note) note.textContent = `前回登録候補を取得できませんでした：${e.message || '通信エラー'}`;
      console.warn('[V67.5] refresh', e);
    }
  }

  function pipelineVisible() {
    return Boolean($('#view-pipeline')?.classList.contains('active'));
  }

  function pulse() {
    const visible = pipelineVisible();

    if (visible) {
      ensurePanel();
      if (!lastVisible) {
        lastVisible = true;
        refresh(false);
      }
    } else {
      lastVisible = false;
    }
  }

  function bindImportCapture() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('#importSelectedBtn');
      if (!btn || btn.disabled) return;
      captureSelectedImport();
    }, true);
  }

  function start() {
    ensureStyle();
    bindImportCapture();

    if (timer) clearInterval(timer);
    timer = setInterval(pulse, 350);
    pulse();

    document.documentElement.dataset.sales675 = VERSION;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.DPRO_SALES675 = Object.freeze({
    version: VERSION,
    refresh: () => refresh(true),
    getLastBatch: () => loadStoredBatch()
  });
})();

/*
 * ============================================================
 * DPRO SALESNAVI V67.6
 * Version: SALESNAVI-67.6-PIPELINE-SALES-STATE-FILTER-20260820
 *
 * Normal pipeline usability:
 * - Adds a sales execution filter to the native pipeline:
 *     全営業状態 / 未営業 / 営業済み
 * - Shows an "未営業 / 営業済み" badge on every normal pipeline card.
 * - Uses recorded sales activities plus pipeline progress to judge state.
 * - Keeps existing search / campaign / priority / status filters working.
 * - Hides this control while V67.5's "前回登録した候補" quick list is shown.
 * - No Worker / SQL / DB schema change.
 * ============================================================
 */
(() => {
  'use strict';

  const VERSION = 'SALESNAVI-67.6-PIPELINE-SALES-STATE-FILTER-20260820';
  const MODE_KEY = 'dpro_sales_v676_pipeline_sales_state';
  const REFRESH_MS = 30000;

  const SENT_STAGES = new Set([
    'visited_absent',
    'contacted',
    'material_delivered',
    'demo_sent',
    'revisit_scheduled',
    'quote_sent',
    'considering',
    'won',
    'lost'
  ]);

  const EXCLUDED_STAGES = new Set(['excluded']);

  const SALES_RESULT_CODES = new Set([
    'owner_absent',
    'staff_only',
    'owner_contacted',
    'material_delivered',
    'demo_sent',
    'quote_sent',
    'considering',
    'revisit_scheduled',
    'callback_requested',
    'phone_no_answer',
    'line_sent',
    'email_sent',
    'won',
    'not_interested',
    'closed',
    'other_follow_up'
  ]);

  const SALES_ACTIVITY_TYPES = new Set([
    'visit',
    'phone',
    'line',
    'email',
    'material',
    'demo',
    'quote'
  ]);

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let statusByProspect = new Map();
  let loadedAt = 0;
  let loading = false;
  let lastPipelineVisible = false;
  let pulseTimer = null;

  function cfg() { return window.DPRO_CONFIG || {}; }

  function session() {
    try {
      return JSON.parse(localStorage.getItem(cfg().sessionStorageKey || 'dpro_sales_session_v3') || 'null');
    } catch {
      return null;
    }
  }

  function token() { return session()?.token || ''; }

  function safeGet(key) {
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, String(value ?? '')); } catch {}
  }

  function arr(v) { return Array.isArray(v) ? v : []; }

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function currentMode() {
    const v = safeGet(MODE_KEY);
    return ['all', 'unsent', 'sent'].includes(v) ? v : 'all';
  }

  function setMode(v) {
    const next = ['all', 'unsent', 'sent'].includes(v) ? v : 'all';
    safeSet(MODE_KEY, next);
    const sel = $('#sales676Filter');
    if (sel && sel.value !== next) sel.value = next;
    applyFilter();
  }

  async function request(path) {
    const headers = { Accept: 'application/json' };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const res = await fetch(String(cfg().apiBaseUrl || '') + path, {
      method: 'GET',
      headers,
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
      setTimeout(() => el.remove(), 4800);
      return;
    }
    console[type === 'error' ? 'error' : 'log']('[V67.6]', message);
  }

  function isSalesActivity(a) {
    const code = String(a?.result_code || '');
    const type = String(a?.activity_type || '');

    if (code.startsWith('outreach_')) return true;
    if (SALES_RESULT_CODES.has(code)) return true;
    if (SALES_ACTIVITY_TYPES.has(type)) return true;

    const meta = a?.metadata || a?.metadata_json || {};
    if (meta?.nonPhone === true || meta?.sales672 || meta?.sales674) return true;

    return false;
  }

  function classify(stage, hasSalesActivity) {
    const s = String(stage || '');
    if (EXCLUDED_STAGES.has(s)) return 'excluded';
    if (hasSalesActivity || SENT_STAGES.has(s)) return 'sent';
    return 'unsent';
  }

  async function refreshData(showToast = false) {
    if (loading) return;
    loading = true;
    setLoadingUi(true);

    try {
      const [prospectRes, activityRes] = await Promise.all([
        request('/api/prospects?limit=500&order=score'),
        request('/api/activities?limit=1000')
      ]);

      const prospects = arr(prospectRes?.prospects);
      const activities = arr(activityRes?.activities);

      const activityProspectIds = new Set(
        activities
          .filter(isSalesActivity)
          .map(a => String(a?.prospect_id || ''))
          .filter(Boolean)
      );

      const next = new Map();
      prospects.forEach(p => {
        const id = String(p?.id || '');
        if (!id) return;
        next.set(id, classify(
          p?.pipeline_stage,
          activityProspectIds.has(id)
        ));
      });

      statusByProspect = next;
      loadedAt = Date.now();
      applyFilter();
      if (showToast) toast('営業状態を更新しました。');
    } catch (e) {
      console.warn('[V67.6] refresh', e);
      if (showToast) toast(e.message || '営業状態を更新できませんでした。', 'error');
    } finally {
      loading = false;
      setLoadingUi(false);
    }
  }

  function ensureStyle() {
    if ($('#sales676Style')) return;
    const s = document.createElement('style');
    s.id = 'sales676Style';
    s.textContent = `
      .sales676-filter-wrap{
        display:inline-flex;align-items:center;gap:7px;padding:4px 5px 4px 9px;
        border:1px solid #cfe0d9;background:#f4fbf8;border-radius:11px
      }
      .sales676-filter-wrap label{
        font-size:10px;font-weight:850;color:#087553;white-space:nowrap
      }
      .sales676-filter-wrap select{
        min-width:118px;border:1px solid #c8d8e2;background:#fff;border-radius:9px;
        padding:8px 30px 8px 10px;color:#294057;font:inherit;font-size:11px;font-weight:750
      }
      .sales676-filter-wrap button{
        border:1px solid #bdd7cd;background:#fff;color:#087553;border-radius:9px;
        padding:8px 10px;font:inherit;font-size:10px;font-weight:850;cursor:pointer
      }
      .sales676-filter-wrap button:disabled{opacity:.55;cursor:wait}
      .sales676-ver{
        display:inline-flex;align-items:center;padding:4px 7px;border-radius:999px;
        border:1px solid #cce8dd;background:#fff;color:#477466;font-size:9px;font-weight:800
      }
      .sales676-counts{
        display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0 0;
        color:#66798b;font-size:10px
      }
      .sales676-counts b{color:#29485c}
      .sales676-card-state{
        display:inline-flex;align-items:center;border-radius:999px;padding:4px 7px;
        font-size:9px;font-weight:850;border:1px solid transparent
      }
      .sales676-card-state.sent{background:#e8f7f0;color:#087553;border-color:#c7eadc}
      .sales676-card-state.unsent{background:#fff4dd;color:#8d5a05;border-color:#f0ddb5}
      .sales676-card-state.excluded{background:#f0f2f5;color:#718092;border-color:#dde3e8}
      .sales676-filter-hidden{display:none!important}
      .sales676-filter-empty{
        margin:8px;padding:18px 10px;text-align:center;border:1px dashed #d5dfe6;
        border-radius:11px;background:#fbfcfd;color:#8190a0;font-size:10px
      }
      @media(max-width:820px){
        .sales676-filter-wrap{width:100%;flex-wrap:wrap}
        .sales676-filter-wrap select{flex:1;min-width:150px}
      }
    `;
    document.head.appendChild(s);
  }

  function ensureControls() {
    const view = $('#view-pipeline');
    const toolbar = view?.querySelector('.toolbar');
    if (!view || !toolbar) return null;

    let wrap = $('#sales676FilterWrap');
    if (wrap) return wrap;

    wrap = document.createElement('div');
    wrap.id = 'sales676FilterWrap';
    wrap.className = 'sales676-filter-wrap';
    wrap.innerHTML = `
      <label for="sales676Filter">営業実行</label>
      <select id="sales676Filter" aria-label="営業実行状態">
        <option value="all">全営業状態</option>
        <option value="unsent">未営業</option>
        <option value="sent">営業済み</option>
      </select>
      <button id="sales676Refresh" type="button">状態更新</button>
      <span class="sales676-ver">V67.6</span>
    `;

    const nativeReload = $('#pipelineReload');
    if (nativeReload) toolbar.insertBefore(wrap, nativeReload);
    else toolbar.appendChild(wrap);

    const counts = document.createElement('div');
    counts.id = 'sales676Counts';
    counts.className = 'sales676-counts';
    toolbar.insertAdjacentElement('afterend', counts);

    $('#sales676Filter').value = currentMode();
    $('#sales676Filter').addEventListener('change', e => setMode(e.target.value));
    $('#sales676Refresh').addEventListener('click', () => refreshData(true));

    // Native reload/search/filter operations may re-render the kanban.
    $('#pipelineReload')?.addEventListener('click', () => {
      setTimeout(() => refreshData(false), 500);
    });

    ['#pipelineCampaign', '#pipelinePriority', '#pipelineStage'].forEach(sel => {
      $(sel)?.addEventListener('change', () => {
        setTimeout(applyFilter, 250);
        setTimeout(applyFilter, 700);
      });
    });

    $('#pipelineSearch')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        setTimeout(applyFilter, 350);
        setTimeout(applyFilter, 850);
      }
    });

    return wrap;
  }

  function setLoadingUi(flag) {
    const btn = $('#sales676Refresh');
    if (!btn) return;
    btn.disabled = Boolean(flag);
    btn.textContent = flag ? '確認中…' : '状態更新';
  }

  function pipelineQuickListActive() {
    return $('#kanban')?.classList.contains('sales675-hidden') || false;
  }

  function updateControlVisibility() {
    const wrap = $('#sales676FilterWrap');
    const counts = $('#sales676Counts');
    const hide = pipelineQuickListActive();
    if (wrap) wrap.style.display = hide ? 'none' : '';
    if (counts) counts.style.display = hide ? 'none' : '';
  }

  function stateLabel(state) {
    if (state === 'sent') return '営業済み';
    if (state === 'excluded') return '対象外';
    return '未営業';
  }

  function decorateCard(card, state) {
    card.classList.remove('sales676-sent', 'sales676-unsent', 'sales676-excluded');
    card.classList.add(`sales676-${state}`);

    const foot = card.querySelector('.foot') || card;
    let badge = card.querySelector('.sales676-card-state');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'sales676-card-state';
      foot.appendChild(badge);
    }

    badge.className = `sales676-card-state ${state}`;
    badge.textContent = stateLabel(state);
  }

  function updateCounts(cards) {
    let all = 0, unsent = 0, sent = 0, excluded = 0;

    cards.forEach(card => {
      all++;
      const id = String(card.dataset.prospect || '');
      const state = statusByProspect.get(id) || 'unsent';
      if (state === 'sent') sent++;
      else if (state === 'excluded') excluded++;
      else unsent++;
    });

    const counts = $('#sales676Counts');
    if (counts) {
      counts.innerHTML =
        `通常パイプライン内：<b>${all}</b>件 ／ 未営業 <b>${unsent}</b> ／ 営業済み <b>${sent}</b>` +
        (excluded ? ` ／ 対象外 <b>${excluded}</b>` : '');
    }
  }

  function applyFilter() {
    const kanban = $('#kanban');
    if (!kanban) return;

    ensureControls();
    updateControlVisibility();

    if (pipelineQuickListActive()) return;

    const mode = currentMode();
    const cards = $$('#kanban .prospect-card[data-prospect]');
    updateCounts(cards);

    cards.forEach(card => {
      const id = String(card.dataset.prospect || '');
      const state = statusByProspect.get(id) || 'unsent';
      decorateCard(card, state);

      const show =
        mode === 'all' ||
        (mode === 'unsent' && state === 'unsent') ||
        (mode === 'sent' && state === 'sent');

      card.classList.toggle('sales676-filter-hidden', !show);
    });

    $$('#kanban .kanban-col').forEach(col => {
      col.querySelectorAll('.sales676-filter-empty').forEach(x => x.remove());

      const colCards = $$('.prospect-card[data-prospect]', col);
      const visible = colCards.filter(c => !c.classList.contains('sales676-filter-hidden'));

      const countBadge = col.querySelector('.kanban-title .badge');
      if (countBadge) countBadge.textContent = String(visible.length);

      if (mode !== 'all' && colCards.length && !visible.length) {
        const empty = document.createElement('div');
        empty.className = 'sales676-filter-empty';
        empty.textContent = mode === 'unsent' ? '未営業の店舗はありません' : '営業済みの店舗はありません';
        col.appendChild(empty);
      }
    });
  }

  function pipelineVisible() {
    return Boolean($('#view-pipeline')?.classList.contains('active'));
  }

  function pulse() {
    const visible = pipelineVisible();

    if (!visible) {
      lastPipelineVisible = false;
      return;
    }

    ensureControls();
    updateControlVisibility();
    applyFilter();

    if (!lastPipelineVisible) {
      lastPipelineVisible = true;
      refreshData(false);
      return;
    }

    if (!loading && Date.now() - loadedAt > REFRESH_MS) {
      refreshData(false);
    }
  }

  function start() {
    ensureStyle();
    pulseTimer = setInterval(pulse, 450);
    pulse();
    document.documentElement.dataset.sales676 = VERSION;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.DPRO_SALES676 = Object.freeze({
    version: VERSION,
    refresh: () => refreshData(true),
    setMode
  });
})();
