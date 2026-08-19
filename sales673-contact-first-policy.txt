/*
 * DPRO SALESNAVI V67.3
 * Version: SALESNAVI-67.3-CONTACT-FIRST-POLICY-20260819
 *
 * Policy overlay for V67.2 real-sales drawer.
 * New prospecting priority:
 *   CONTACT -> Instagram -> other appropriate public channel.
 * - Removes public email from the new-sales selector.
 * - Keeps existing-relation LINE only for an established relationship / consent.
 * - Keeps phone only as a fallback.
 * - Clarifies that email is for replies / requested materials after contact.
 * - Normalizes the sender name to "DPRO SHOP" in outreach copy.
 *
 * No Worker / SQL / DB schema change.
 */
(() => {
  'use strict';

  const VERSION = 'SALESNAVI-67.3-CONTACT-FIRST-POLICY-20260819';
  let timer = null;
  let lastRoot = null;

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

  function ensurePolicyNote(root) {
    if (root.querySelector('[data-sales673-email-note]')) return;
    const check = root.querySelector('.sales672-check');
    if (!check) return;
    const note = document.createElement('div');
    note.setAttribute('data-sales673-email-note', '1');
    note.className = 'sales673-email-note';
    note.textContent = 'メールは新規営業の基本窓口には使いません。CONTACT等で反応があり、相手から資料送付・返信を希望された後の通常連絡に使用します。';
    check.insertAdjacentElement('afterend', note);
  }

  function apply(root) {
    if (!root) return;

    root.dataset.sales673 = '1';

    const ver = root.querySelector('.sales672-ver');
    if (ver) ver.textContent = 'V67.3';

    const head = root.querySelector('.sales672-head h4');
    if (head) head.textContent = 'CONTACT中心 営業ナビ';

    const lead = root.querySelector('.sales672-lead');
    if (lead) {
      lead.textContent = '相手の営業時間を邪魔せず、CONTACTを最優先に、短い文章＋提案LPを1本だけ届ける新規営業フローです。';
    }

    const policy = root.querySelector('.sales672-policy');
    if (policy) {
      policy.innerHTML = '<b>新規営業の基本：</b> CONTACT → Instagram DM → その他適切な公開窓口。個人LINEは既存関係・了承ありの場合のみ。電話は補助手段です。';
    }

    const select = root.querySelector('[data-channel]');
    if (select) {
      const email = select.querySelector('option[value="email"]');
      if (email) email.remove();

      const order = ['contact', 'instagram', 'other', 'line_existing'];
      order.forEach(value => {
        const option = select.querySelector(`option[value="${value}"]`);
        if (option) select.appendChild(option);
      });

      const labels = {
        contact: 'WEB CONTACT／問い合わせフォーム（最優先）',
        instagram: 'Instagram DM',
        other: 'その他の適切な公開窓口',
        line_existing: '個人LINE（既存関係・了承あり）'
      };
      Object.entries(labels).forEach(([value, label]) => {
        const option = select.querySelector(`option[value="${value}"]`);
        if (option) option.textContent = label;
      });

      if (!order.includes(select.value)) {
        select.value = 'contact';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }

      if (!select.dataset.sales673Bound) {
        select.dataset.sales673Bound = '1';
        select.addEventListener('change', () => {
          window.setTimeout(() => normalizeTemplate(root), 0);
          window.setTimeout(() => normalizeTemplate(root), 80);
        }, true);
      }
    }

    const labels = [...root.querySelectorAll('label')];
    const methodLabel = labels.find(el => /今回の送信方法|今回の連絡方法/.test(el.textContent || ''));
    if (methodLabel) methodLabel.textContent = '今回の連絡方法';

    const check = root.querySelector('.sales672-check');
    if (check) {
      check.textContent = '送信前：営業・勧誘禁止の窓口には送らない／予約専用フォームなど不適切な窓口には送らない／同じ店舗へ重複送信しない／最初はLPを1本だけ送る。';
    }

    ensurePolicyNote(root);
    normalizeTemplate(root);
  }

  function ensureStyle() {
    if (document.getElementById('sales673Style')) return;
    const style = document.createElement('style');
    style.id = 'sales673Style';
    style.textContent = `
      .sales673-email-note{
        margin-top:9px;padding:10px 11px;border:1px solid #d8e4ec;background:#f7fafc;
        border-radius:10px;color:#5b6f80;font-size:12px;line-height:1.65
      }
      #sales672[data-sales673="1"] .sales672-policy b{color:#087553}
    `;
    document.head.appendChild(style);
  }

  function pulse() {
    const root = document.getElementById('sales672');
    if (!root) {
      lastRoot = null;
      return;
    }
    if (root !== lastRoot || root.dataset.sales673 !== '1') {
      lastRoot = root;
      apply(root);
      return;
    }
    normalizeTemplate(root);
  }

  function start() {
    ensureStyle();
    if (timer) clearInterval(timer);
    timer = setInterval(pulse, 350);
    pulse();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.DPRO_SALES673 = Object.freeze({ version: VERSION });
})();
