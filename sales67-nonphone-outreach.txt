/*
 * DPRO SALESNAVI V67
 * Version: SALESNAVI-67.1-DRAWER-LATE-MOUNT-FIX-20260819
 *
 * Goal:
 * - Make non-phone outreach the default sales workflow.
 * - CONTACT / Email / Instagram / existing-relationship LINE / Other.
 * - Generate channel-specific short sales copy focused on "まず見てもらう".
 * - Keep one primary LP link; avoid sending many links at once.
 * - Record actual send only after the user confirms it was sent.
 * - Create a 4-day reply/reaction follow-up and complete today's queue item.
 * - Phone remains available only as a secondary fallback.
 *
 * No Worker / SQL / DB schema change.
 */
(() => {
  'use strict';

  const VERSION = 'SALESNAVI-67.1-DRAWER-LATE-MOUNT-FIX-20260819';
  const ACTIVE_QUEUE = new Set(['queued', 'planned', 'in_progress']);
  const sentLocks = new Set();
  let injecting = false;
  let drawerTimer = null;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function cfg() { return window.DPRO_CONFIG || {}; }

  function session() {
    try {
      return JSON.parse(localStorage.getItem(cfg().sessionStorageKey || 'dpro_sales_session_v3') || 'null');
    } catch { return null; }
  }

  function token() { return session()?.token || ''; }

  function todayJst() {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const o = Object.fromEntries(p.map(x => [x.type, x.value]));
    return `${o.year}-${o.month}-${o.day}`;
  }

  function addDays(dateText, days) {
    const d = new Date(`${dateText}T12:00:00+09:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function fmtDate(dateText) {
    try {
      return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })
        .format(new Date(`${dateText}T00:00:00+09:00`));
    } catch { return dateText; }
  }

  async function request(path, { method = 'GET', body = null } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== null) headers['Content-Type'] = 'application/json; charset=utf-8';
    if (token()) headers.Authorization = `Bearer ${token()}`;

    const res = await fetch(String(cfg().apiBaseUrl || '') + path, {
      method, headers,
      body: body === null ? undefined : JSON.stringify(body),
      credentials: 'omit', cache: 'no-store'
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
    console[type === 'error' ? 'error' : 'log'](`[V67] ${message}`);
  }

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  async function copyText(text) {
    const value = String(text || '');
    if (!value) return false;
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  function currentProspectId() {
    return $('#drawerBody .detail-hero [data-record-activity]')?.dataset.recordActivity || '';
  }

  function currentProspectName() {
    return $('#drawerBody .detail-hero h2')?.textContent?.trim() || 'この店舗';
  }

  function findLpHref() {
    const links = $$('#drawerBody a[href]');
    const hit = links.find(a => /提案LP|営業LP/.test(a.textContent || ''));
    return hit?.href || '';
  }

  function findWebsiteHref() {
    const heroLinks = $$('#drawerBody .detail-hero a[href]');
    const byText = heroLinks.find(a => /WEBサイト|Webサイト|ホームページ|公式サイト/.test(a.textContent || ''));
    if (byText?.href) return byText.href;

    const all = $$('#drawerBody a[href^="http"]');
    return all.find(a => {
      const href = String(a.href || '');
      const text = String(a.textContent || '');
      return !/google\.com\/maps|maps\.google|提案LP|営業LP/.test(href + ' ' + text);
    })?.href || '';
  }

  function findEmailHref() {
    return $('#drawerBody a[href^="mailto:"]')?.href || '';
  }

  function findPhoneHref() {
    return $('#drawerBody .detail-hero a[href^="tel:"]')?.href || '';
  }

  function detailBoxByTitle(pattern) {
    return $$('#drawerBody .detail-box').find(box => pattern.test(box.querySelector('h4')?.textContent?.trim() || '')) || null;
  }

  function findProductName() {
    const box = detailBoxByTitle(/提案するDPROシステム/);
    if (!box) return 'DPROの店舗向けシステム';
    const p = box.querySelector('p');
    if (!p) return 'DPROの店舗向けシステム';
    const lines = String(p.innerText || p.textContent || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
    return lines[0] || 'DPROの店舗向けシステム';
  }

  function findFeatures() {
    const box = detailBoxByTitle(/店舗に響く機能|響く機能/);
    if (!box) return [];
    const lis = $$('#drawerBody .detail-box li').filter(li => box.contains(li));
    return lis.map(li => li.textContent.trim()).filter(Boolean).slice(0, 4);
  }

  function websiteDomain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  }

  function instagramSearchUrl(name) {
    return `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com "${name}"`)}`;
  }

  function contactSearchUrl(name, website) {
    const domain = websiteDomain(website);
    const q = domain ? `site:${domain} お問い合わせ contact` : `${name} お問い合わせ contact`;
    return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }

  function emailSearchUrl(name, website) {
    const domain = websiteDomain(website);
    const q = domain ? `site:${domain} メール お問い合わせ` : `${name} メール お問い合わせ`;
    return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }

  const CHANNELS = Object.freeze({
    contact: {
      label: 'WEB CONTACT／問い合わせフォーム',
      activityType: 'other', resultCode: 'outreach_contact_sent',
      summary: 'CONTACTフォームで提案LP送付',
      follow: 'CONTACT送信の反応・返信確認'
    },
    email: {
      label: '公開メール',
      activityType: 'email', resultCode: 'outreach_email_sent',
      summary: 'メールで提案LP送付',
      follow: 'メール送付の反応・返信確認'
    },
    instagram: {
      label: 'Instagram DM',
      activityType: 'other', resultCode: 'outreach_instagram_sent',
      summary: 'Instagram DMで提案LP送付',
      follow: 'Instagram DM送付の反応・返信確認'
    },
    line_existing: {
      label: '個人LINE（既存関係・了承あり）',
      activityType: 'line', resultCode: 'outreach_line_existing_sent',
      summary: '既存関係LINEで提案LP送付',
      follow: 'LINE送付の反応・返信確認'
    },
    other: {
      label: 'その他の公開窓口',
      activityType: 'other', resultCode: 'outreach_other_sent',
      summary: '公開窓口から提案LP送付',
      follow: '送付先の反応・返信確認'
    }
  });

  function templateFor(channel) {
    const name = currentProspectName();
    const product = findProductName();
    const lp = findLpHref();
    const features = findFeatures();
    const featureText = features.length ? features.slice(0, 3).join('・') : '予約や再来店フォローなどの店舗運営機能';
    const lpLine = lp || '【提案LP URL】';

    if (channel === 'instagram') {
      return `突然のDM失礼いたします。DPROです。\n\n${name}様にもご覧いただけそうな、店舗向けの「${product}」を制作しています。${featureText}などをまとめています。\n\nお電話での営業ではなく、お時間のある時に1分ほどで実際の画面だけご覧いただければと思いお送りしました。\n${lpLine}\n\nご興味がなければご返信は不要です。`;
    }

    if (channel === 'email') {
      return `件名：${name}様へ｜${product}のご案内\n\n${name} ご担当者様\n\n突然のご連絡失礼いたします。DPROです。\n\n店舗向けに「${product}」を制作しており、${featureText}などをまとめています。\n営業のお電話ではなく、お時間のある際に実際の画面だけご覧いただければと思い、ご案内をお送りしました。\n\n▼ご案内\n${lpLine}\n\nご興味がなければご返信は不要です。店舗運営の参考になる部分だけでもご覧いただけましたら幸いです。`;
    }

    if (channel === 'line_existing') {
      return `突然すみません。DPROで、店舗向けに「${product}」というシステムを作りました。\n\n${featureText}などをまとめています。もし興味があれば、お時間のある時にこちらだけ見てみてください。\n${lpLine}\n\n無理に返信は大丈夫です。`;
    }

    if (channel === 'other') {
      return `突然のご連絡失礼いたします。DPROです。\n\n${name}様に合いそうな店舗向けの「${product}」をご案内したく、ご連絡しました。${featureText}などをまとめています。\n\nお時間のある際に、実際の画面をこちらからご覧いただけます。\n${lpLine}\n\nご興味がなければご返信は不要です。`;
    }

    return `突然のご連絡失礼いたします。DPROです。\n\n${name}様にもご覧いただけそうな店舗向けの「${product}」を制作しています。${featureText}などをまとめています。\n\n営業のお電話ではなく、お時間のある際に実際の画面だけご覧いただければと思い、ご連絡しました。\n\n▼ご案内\n${lpLine}\n\nご興味がなければご返信は不要です。店舗運営の参考になる部分だけでもご覧いただけましたら幸いです。`;
  }

  function recommendedChannel() {
    const website = findWebsiteHref();
    const email = findEmailHref();
    if (website && !/instagram\.com/i.test(website)) return 'contact';
    if (email) return 'email';
    if (website && /instagram\.com/i.test(website)) return 'instagram';
    return 'instagram';
  }

  function channelOpenConfig(channel) {
    const name = currentProspectName();
    const website = findWebsiteHref();
    const email = findEmailHref();

    if (channel === 'contact') {
      return {
        primaryLabel: website ? 'WEBサイトを開く' : 'CONTACT候補を探す',
        primaryUrl: website || contactSearchUrl(name, website),
        secondaryLabel: 'CONTACTを検索', secondaryUrl: contactSearchUrl(name, website)
      };
    }
    if (channel === 'email') {
      return {
        primaryLabel: email ? 'メール作成を開く' : '公開メールを探す',
        primaryUrl: email || emailSearchUrl(name, website),
        secondaryLabel: website ? 'WEBサイトを開く' : '', secondaryUrl: website || ''
      };
    }
    if (channel === 'instagram') {
      const directInstagram = website && /instagram\.com/i.test(website) ? website : '';
      return {
        primaryLabel: directInstagram ? 'Instagramを開く' : 'Instagram候補を探す',
        primaryUrl: directInstagram || instagramSearchUrl(name),
        secondaryLabel: website && !directInstagram ? 'WEBサイトを開く' : '', secondaryUrl: website && !directInstagram ? website : ''
      };
    }
    if (channel === 'line_existing') {
      return { primaryLabel: '個人LINEは手動で開く', primaryUrl: '', secondaryLabel: '', secondaryUrl: '' };
    }
    return {
      primaryLabel: website ? 'WEBサイトを開く' : '送信先候補を探す',
      primaryUrl: website || `https://www.google.com/search?q=${encodeURIComponent(name + ' お問い合わせ')}`,
      secondaryLabel: '', secondaryUrl: ''
    };
  }

  function ensureStyle() {
    if ($('#sales67Style')) return;
    const style = document.createElement('style');
    style.id = 'sales67Style';
    style.textContent = `
      /* Hide the old phone/LINE-centered quick panel; V67 supersedes it. */
      #sales65Command{display:none!important}
      .sales67-legacy-flow-hidden{display:none!important}

      .sales67-command{
        margin:14px 0 4px;border:2px solid #7ec9ac;background:linear-gradient(180deg,#f5fcf9,#edf9f4);
        border-radius:17px;padding:16px
      }
      .sales67-title{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px}
      .sales67-title h4{margin:0;color:#087553;font-size:18px}
      .sales67-title span{font-size:11px;color:#477466;background:#fff;border:1px solid #cce8dd;padding:5px 8px;border-radius:999px}
      .sales67-lead{margin:0 0 12px;color:#526779;font-size:13px;line-height:1.7}
      .sales67-principle{margin:0 0 12px;padding:10px 11px;border:1px solid #cfe7dc;background:#fff;border-radius:11px;font-size:12px;line-height:1.7;color:#3f5c51}
      .sales67-principle b{color:#087553}
      .sales67-status{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px}
      .sales67-status>div{background:#fff;border:1px solid #dcebe5;border-radius:10px;padding:10px 11px}
      .sales67-status small{display:block;color:#758797;font-size:11px}.sales67-status b{display:block;margin-top:3px;font-size:13px;color:#2d4b40}
      .sales67-channel{display:grid;gap:8px;margin-bottom:11px}
      .sales67-channel label{font-size:13px;font-weight:800;color:#40556a}
      .sales67-channel select{width:100%;border:1px solid #c9d8e3;background:#fff;border-radius:11px;padding:12px 13px;font:inherit;font-size:14px;color:#253a50}
      .sales67-warning{display:none;padding:9px 10px;border:1px solid #ebd39c;background:#fff9e9;border-radius:10px;font-size:11px;line-height:1.6;color:#735a22;margin-bottom:10px}
      .sales67-warning.show{display:block}
      .sales67-open-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
      .sales67-open-actions .btn{font-size:12px;min-height:40px}
      .sales67-copybox{background:#fff;border:1px solid #dce7e2;border-radius:12px;padding:11px;margin-bottom:10px}
      .sales67-copybox .head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:7px}
      .sales67-copybox .head b{font-size:13px;color:#314e43}.sales67-copybox .head small{font-size:10px;color:#7a8998}
      .sales67-copybox textarea{width:100%;min-height:190px;border:1px solid #ccd8e4;border-radius:10px;padding:11px 12px;font:inherit;font-size:13px;line-height:1.7;color:#263950;resize:vertical;background:#fbfdfc}
      .sales67-main-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .sales67-main-actions .btn{width:100%;min-height:43px;font-size:13px}
      .sales67-primary{grid-column:1/-1;background:linear-gradient(135deg,#148e69,#087354)!important;color:#fff!important}
      .sales67-checklist{margin-top:11px;padding:10px 11px;background:#f8fafb;border:1px solid #dfe7ec;border-radius:10px;color:#66788a;font-size:11px;line-height:1.65}
      .sales67-checklist b{color:#40556a}.sales67-checklist ul{margin:5px 0 0;padding-left:18px}
      .sales67-fallback{margin-top:9px;padding-top:9px;border-top:1px dashed #cbd9d3;display:flex;gap:7px;align-items:center;flex-wrap:wrap;color:#7a8998;font-size:11px}
      .sales67-sent{background:#e3f4ed!important;color:#356154!important;border:1px solid #b9d5ca!important;box-shadow:none!important}
      @media(max-width:640px){
        .sales67-status,.sales67-main-actions{grid-template-columns:1fr}.sales67-primary{grid-column:auto}
        .sales67-copybox textarea{min-height:220px}
      }
    `;
    document.head.appendChild(style);
  }

  async function fetchDetail(id) {
    return request(`/api/prospects/${encodeURIComponent(id)}/sales-detail`);
  }

  async function fetchTodayQueue() {
    const d = await request(`/api/sales-queue?date=${encodeURIComponent(todayJst())}`);
    return Array.isArray(d.queueItems) ? d.queueItems : [];
  }

  function todayQueueFor(items, prospectId) {
    return (items || []).find(q => q?.prospect_id === prospectId) || null;
  }

  function activeQueueFor(items, prospectId) {
    return (items || []).find(q => q?.prospect_id === prospectId && ACTIVE_QUEUE.has(String(q.queue_status || 'queued'))) || null;
  }

  function latestPendingAction(detail) {
    return (detail?.nextActions || [])
      .filter(a => ['pending', 'snoozed'].includes(String(a?.status || '')))
      .sort((a,b) => String(a.due_date || '').localeCompare(String(b.due_date || '')))[0] || null;
  }

  function hasPendingReplyCheck(detail) {
    return (detail?.nextActions || []).some(a =>
      ['pending', 'snoozed'].includes(String(a?.status || '')) && String(a?.action_type || '') === 'reply_check'
    );
  }

  function todaysSentActivities(detail) {
    const today = todayJst();
    return (detail?.activities || []).filter(a => {
      if (!a?.activity_at) return false;
      let date = '';
      try {
        const p = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit' })
          .formatToParts(new Date(a.activity_at));
        const o = Object.fromEntries(p.map(x => [x.type, x.value]));
        date = `${o.year}-${o.month}-${o.day}`;
      } catch {}
      return date === today && /^outreach_(contact|email|instagram|line_existing|other)_sent$/i.test(String(a.result_code || ''));
    });
  }

  function sentLabel(detail) {
    const acts = todaysSentActivities(detail);
    if (!acts.length) return '本日の送信記録なし';
    const labels = acts.map(a => {
      const code = String(a.result_code || '');
      if (code.includes('contact')) return 'CONTACT';
      if (code.includes('email')) return 'メール';
      if (code.includes('instagram')) return 'Instagram';
      if (code.includes('line_existing')) return '既存関係LINE';
      return 'その他';
    });
    return `本日送信済み｜${[...new Set(labels)].join('・')}`;
  }

  function nextLabel(detail) {
    const next = latestPendingAction(detail);
    if (!next) return '次回予定なし';
    return `${fmtDate(next.due_date)} ${String(next.description || '反応確認')}`;
  }

  function deemphasizeLegacyFlow() {
    const body = $('#drawerBody');
    if (!body) return;
    for (const h of $$('h3,h4', body)) {
      if (/営業実行フロー/.test(h.textContent || '')) {
        const target = h.closest('section') || h.closest('.detail-box') || h.parentElement;
        if (target && target.id !== 'sales67Command') target.classList.add('sales67-legacy-flow-hidden');
      }
    }
  }

  function renderChannelState(root, channel) {
    const textarea = root.querySelector('[data-sales67-template]');
    const warning = root.querySelector('[data-sales67-warning]');
    const open1 = root.querySelector('[data-sales67-open-primary]');
    const open2 = root.querySelector('[data-sales67-open-secondary]');
    const record = root.querySelector('[data-sales67-record]');
    const copy = root.querySelector('[data-sales67-copy]');

    if (textarea) textarea.value = templateFor(channel);

    if (warning) {
      warning.classList.toggle('show', channel === 'line_existing');
      warning.textContent = channel === 'line_existing'
        ? '個人LINEは一斉営業には使わず、既存の個人的な関係があり、相手が案内を受けてもよい場合だけ使用してください。'
        : '';
    }

    const open = channelOpenConfig(channel);
    if (open1) {
      open1.textContent = open.primaryLabel;
      open1.dataset.href = open.primaryUrl || '';
      open1.disabled = !open.primaryUrl;
    }
    if (open2) {
      open2.textContent = open.secondaryLabel || '';
      open2.dataset.href = open.secondaryUrl || '';
      open2.classList.toggle('hidden', !open.secondaryUrl);
    }
    if (record) {
      record.textContent = `${CHANNELS[channel]?.label || '送信'}を送信済みとして記録`;
      record.dataset.channel = channel;
    }
    if (copy) copy.textContent = 'この営業文をコピー';
  }

  async function updateStatus(id) {
    const root = $('#sales67Command');
    if (!root || root.dataset.prospectId !== id) return;
    try {
      const [detail, queue] = await Promise.all([fetchDetail(id), fetchTodayQueue()]);
      const q = todayQueueFor(queue, id);
      const sent = root.querySelector('[data-sales67-status-sent]');
      const next = root.querySelector('[data-sales67-status-next]');
      if (sent) sent.textContent = sentLabel(detail);
      if (next) next.textContent = nextLabel(detail);

      const queueBtn = root.querySelector('[data-sales67-queue]');
      if (queueBtn) {
        const status = String(q?.queue_status || '');
        if (todaysSentActivities(detail).length || status === 'completed') {
          queueBtn.disabled = true;
          queueBtn.textContent = '本日の営業は完了';
        } else if (q && ACTIVE_QUEUE.has(status || 'queued')) {
          queueBtn.disabled = true;
          queueBtn.textContent = '今日の営業に登録済み';
        } else {
          queueBtn.disabled = false;
          queueBtn.textContent = '今日の営業へ追加';
        }
      }
    } catch (e) {
      console.warn('[V67] status update failed', e);
    }
  }

  async function recordSent(id, channel) {
    const info = CHANNELS[channel];
    if (!id || !info || sentLocks.has(id)) return;

    const name = currentProspectName();
    const due = addDays(todayJst(), 4);
    if (!confirm(
      `${name}\n\n実際に「${info.label}」から提案LPを送信済みですか？\n\n` +
      `送信済みとして記録し、${fmtDate(due)}に反応・返信確認を作成します。`
    )) return;

    sentLocks.add(id);
    const root = $('#sales67Command');
    const button = root?.querySelector('[data-sales67-record]');
    if (button) { button.disabled = true; button.textContent = '記録中…'; }

    try {
      const [detail, queue] = await Promise.all([fetchDetail(id), fetchTodayQueue()]);
      const duplicate = todaysSentActivities(detail).some(a => String(a.result_code || '') === info.resultCode);
      if (duplicate) {
        toast(`本日はすでに${info.label}の送信記録があります。重複登録しません。`);
        await updateStatus(id);
        return;
      }

      const queueItem = activeQueueFor(queue, id);
      const body = {
        activityType: info.activityType,
        resultCode: info.resultCode,
        summary: info.summary,
        details: `${info.label}から提案LPを送付。相手の都合のよい時間に確認してもらう非電話営業。`,
        isOwnerContact: false,
        applyRule: false,
        completeQueue: true,
        metadata: {
          sales67: true,
          version: VERSION,
          channel,
          material: 'sales_lp',
          nonPhone: true,
          followDays: 4
        }
      };

      if (queueItem?.id) body.queueItemId = queueItem.id;

      if (!hasPendingReplyCheck(detail)) {
        body.nextAction = {
          actionType: 'reply_check',
          dueDate: due,
          description: info.follow,
          priority: 'normal',
          isPrimary: true,
          metadata: { sales67: true, channel, material: 'sales_lp' }
        };
      }

      await request(`/api/prospects/${encodeURIComponent(id)}/record-activity`, { method:'POST', body });
      toast(`${info.label}の送信済みを記録しました。反応確認：${fmtDate(due)}`);
      await updateStatus(id);
    } catch (e) {
      toast(e.message || '送信済みを記録できませんでした。', 'error');
    } finally {
      sentLocks.delete(id);
      const selected = root?.querySelector('[data-sales67-channel]')?.value || channel;
      if (button) button.disabled = false;
      if (root) renderChannelState(root, selected);
    }
  }

  function injectPanel() {
    if (injecting) return;
    const body = $('#drawerBody');
    const hero = body?.querySelector('.detail-hero');
    const id = currentProspectId();
    if (!body || !hero || !id) return;

    injecting = true;
    try {
      ensureStyle();
      deemphasizeLegacyFlow();

      const lp = findLpHref();
      const website = findWebsiteHref();
      const email = findEmailHref();
      const phone = findPhoneHref();
      const product = findProductName();
      const recommended = recommendedChannel();
      const signature = JSON.stringify({ id, lp, website, email, phone, product });

      let root = $('#sales67Command');
      if (root?.dataset.signature === signature) {
        deemphasizeLegacyFlow();
        return;
      }
      if (!root) {
        root = document.createElement('section');
        root.id = 'sales67Command';
        hero.insertAdjacentElement('afterend', root);
      }

      root.className = 'sales67-command';
      root.dataset.prospectId = id;
      root.dataset.signature = signature;
      root.innerHTML = `
        <div class="sales67-title">
          <h4>非電話営業ナビ</h4><span>V67</span>
        </div>
        <p class="sales67-lead">相手の営業時間を邪魔せず、見たくなる短い文章＋提案LPを1本だけ届ける営業フローです。</p>
        <div class="sales67-principle"><b>基本：</b> CONTACT → 公開メール → Instagram DM → その他公開窓口。個人LINEは既存関係・了承ありの場合のみ。電話は補助手段です。</div>
        <div class="sales67-status">
          <div><small>今日の送信</small><b data-sales67-status-sent>確認中…</b></div>
          <div><small>次の確認</small><b data-sales67-status-next>確認中…</b></div>
        </div>
        <div class="sales67-channel">
          <label for="sales67Channel">今回の送信方法</label>
          <select id="sales67Channel" data-sales67-channel>
            <option value="contact">WEB CONTACT／問い合わせフォーム</option>
            <option value="email">公開メール</option>
            <option value="instagram">Instagram DM</option>
            <option value="line_existing">個人LINE（既存関係・了承あり）</option>
            <option value="other">その他の公開窓口</option>
          </select>
        </div>
        <div class="sales67-warning" data-sales67-warning></div>
        <div class="sales67-open-actions">
          <button type="button" class="btn btn-outline" data-sales67-open-primary></button>
          <button type="button" class="btn btn-outline hidden" data-sales67-open-secondary></button>
          <button type="button" class="btn btn-outline" data-sales67-open-lp ${lp ? '' : 'disabled'}>提案LPを確認</button>
        </div>
        <div class="sales67-copybox">
          <div class="head"><b>送信文</b><small>そのままでも、送る前に編集してもOK</small></div>
          <textarea data-sales67-template></textarea>
        </div>
        <div class="sales67-main-actions">
          <button type="button" class="btn btn-outline" data-sales67-copy>この営業文をコピー</button>
          <button type="button" class="btn btn-outline" data-sales67-queue="${esc(id)}">今日の営業へ追加</button>
          <button type="button" class="btn sales67-primary" data-sales67-record data-channel="${esc(recommended)}">送信済みとして記録</button>
          <button type="button" class="btn btn-secondary" data-sales67-followup>フォローアップを確認</button>
        </div>
        <div class="sales67-checklist">
          <b>送信前チェック</b>
          <ul>
            <li>営業・勧誘禁止の記載がある窓口には送らない</li>
            <li>同じ店舗へ同じ内容を重複送信しない</li>
            <li>最初はLPを1本だけ。公式サイトやチラシを一度に大量送付しない</li>
          </ul>
        </div>
        <div class="sales67-fallback">
          <span>補助手段：</span>
          ${phone ? `<a class="btn btn-outline btn-sm" href="${esc(phone)}">必要な場合だけ電話</a>` : '<span>電話番号未取得</span>'}
          ${website ? `<a class="btn btn-outline btn-sm" href="${esc(website)}" target="_blank" rel="noopener">WEBサイト</a>` : ''}
        </div>
      `;

      const select = root.querySelector('[data-sales67-channel]');
      select.value = recommended;
      renderChannelState(root, recommended);
      updateStatus(id);
      deemphasizeLegacyFlow();
    } finally {
      injecting = false;
    }
  }

  function bindClicks() {
    document.addEventListener('change', e => {
      const select = e.target.closest('[data-sales67-channel]');
      if (!select) return;
      const root = select.closest('#sales67Command');
      if (root) renderChannelState(root, select.value);
    }, true);

    document.addEventListener('click', async e => {
      const open = e.target.closest('[data-sales67-open-primary],[data-sales67-open-secondary]');
      if (open) {
        e.preventDefault();
        const href = open.dataset.href || '';
        if (href) window.open(href, '_blank', 'noopener');
        else toast('この送信先は手動で開いてください。');
        return;
      }

      if (e.target.closest('[data-sales67-open-lp]')) {
        const href = findLpHref();
        if (href) window.open(href, '_blank', 'noopener');
        else toast('提案LPを確認できませんでした。', 'error');
        return;
      }

      const copy = e.target.closest('[data-sales67-copy]');
      if (copy) {
        const root = copy.closest('#sales67Command');
        const text = root?.querySelector('[data-sales67-template]')?.value || '';
        const ok = await copyText(text);
        toast(ok ? '営業文をコピーしました。送る前に内容を確認してください。' : 'コピーできませんでした。', ok ? 'success' : 'error');
        return;
      }

      const record = e.target.closest('[data-sales67-record]');
      if (record) {
        const root = record.closest('#sales67Command');
        const id = root?.dataset.prospectId || currentProspectId();
        const channel = root?.querySelector('[data-sales67-channel]')?.value || record.dataset.channel || 'contact';
        recordSent(id, channel);
        return;
      }

      const q = e.target.closest('[data-sales67-queue]');
      if (q) {
        const v64 = document.querySelector(`#drawerBody [data-sales64-direct-queue="${CSS.escape(q.dataset.sales67Queue)}"]`);
        if (v64) v64.click();
        else toast('「今日の営業へ追加」を準備できませんでした。', 'error');
        return;
      }

      if (e.target.closest('[data-sales67-followup]')) {
        $('#drawerClose')?.click();
        const nav = $$('.nav-btn[data-view]').find(x => (x.textContent || '').includes('フォローアップ'));
        nav?.click();
      }
    }, true);
  }

  let drawerObserver = null;
  let drawerBootstrapObserver = null;

  function bindDrawerObserver() {
    const body = $('#drawerBody');
    if (!body) return false;
    if (body.dataset.sales67DrawerBound === '1') {
      injectPanel();
      return true;
    }

    body.dataset.sales67DrawerBound = '1';
    drawerObserver = new MutationObserver(() => {
      clearTimeout(drawerTimer);
      drawerTimer = setTimeout(() => {
        injectPanel();
        deemphasizeLegacyFlow();
      }, 80);
    });
    drawerObserver.observe(body, {
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:['href','class','data-record-activity']
    });

    injectPanel();
    deemphasizeLegacyFlow();
    return true;
  }

  function waitForDrawerBody() {
    if (bindDrawerObserver()) return;

    if (drawerBootstrapObserver) return;
    drawerBootstrapObserver = new MutationObserver(() => {
      if (bindDrawerObserver()) {
        drawerBootstrapObserver.disconnect();
        drawerBootstrapObserver = null;
      }
    });
    drawerBootstrapObserver.observe(document.documentElement, {
      childList:true,
      subtree:true
    });

    // Safety stop: do not leave a page-wide observer alive forever.
    setTimeout(() => {
      if (drawerBootstrapObserver) {
        drawerBootstrapObserver.disconnect();
        drawerBootstrapObserver = null;
      }
    }, 60000);
  }

  function init() {
    ensureStyle();
    bindClicks();
    waitForDrawerBody();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  window.DPRO_SALES67 = Object.freeze({ version: VERSION });
})();
