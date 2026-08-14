/**
 * DPRO SALESNAVI V65
 * Version: SALESNAVI-65-QUICK-SALES-20260814
 *
 * Purpose:
 * Compress real sales operations into one store detail drawer.
 *
 * Adds:
 * - "本番営業クイック操作" command panel in store detail.
 * - 提案LPを開く.
 * - LINEでLP送付済み -> activity + 3-day reply check + today queue completion.
 * - 今日の営業へ追加 -> reuses V64-R1 method picker.
 * - 結果を記録 -> reuses native result form/V63 handoff.
 * - フォローを見る.
 * - After Google Places import, "今登録した店舗を開く" shortcut.
 *
 * No SQL change. No Worker change.
 */
(() => {
  "use strict";

  const VERSION = "SALESNAVI-65-QUICK-SALES-20260814";
  const ACTIVE_QUEUE = new Set(["queued", "planned", "in_progress"]);
  const sentLocks = new Set();
  let injecting = false;
  let lastImportNames = [];

  function cfg() {
    return window.DPRO_CONFIG || {};
  }

  function session() {
    try {
      return JSON.parse(localStorage.getItem(cfg().sessionStorageKey || "dpro_sales_session_v3") || "null");
    } catch {
      return null;
    }
  }

  function token() {
    return session()?.token || "";
  }

  function todayJst() {
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const o = Object.fromEntries(p.map(x => [x.type, x.value]));
    return `${o.year}-${o.month}-${o.day}`;
  }

  function addDays(dateText, days) {
    const d = new Date(`${dateText}T12:00:00+09:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function fmtDate(dateText) {
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        month: "numeric",
        day: "numeric",
        weekday: "short"
      }).format(new Date(`${dateText}T00:00:00+09:00`));
    } catch {
      return dateText;
    }
  }

  function isTodayJst(value) {
    if (!value) return false;
    try {
      const p = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date(value));
      const o = Object.fromEntries(p.map(x => [x.type, x.value]));
      return `${o.year}-${o.month}-${o.day}` === todayJst();
    } catch {
      return false;
    }
  }

  async function request(path, { method = "GET", body = null } = {}) {
    const headers = { Accept: "application/json" };
    if (body !== null) headers["Content-Type"] = "application/json; charset=utf-8";
    if (token()) headers.Authorization = `Bearer ${token()}`;

    const res = await fetch(String(cfg().apiBaseUrl || "") + path, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body),
      credentials: "omit",
      cache: "no-store"
    });

    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || data.error || `APIエラー (${res.status})`);
    }
    return data;
  }

  function toast(message, type = "success") {
    const stack = document.querySelector("#toastStack");
    if (stack) {
      const el = document.createElement("div");
      el.className = `toast ${type}`;
      el.textContent = message;
      stack.appendChild(el);
      setTimeout(() => el.remove(), 5200);
      return;
    }
    console[type === "error" ? "error" : "log"](`[V65] ${message}`);
  }

  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function navByText(text) {
    return [...document.querySelectorAll(".nav-btn[data-view]")]
      .find(x => x.textContent.includes(text));
  }

  function currentProspectId() {
    return document.querySelector("#drawerBody .detail-hero [data-record-activity]")?.dataset.recordActivity || "";
  }

  function currentProspectName() {
    return document.querySelector("#drawerBody .detail-hero h2")?.textContent?.trim() || "この営業先";
  }

  function findLpHref() {
    const links = [...document.querySelectorAll("#drawerBody a[href]")];
    const hit = links.find(a => /提案LP|営業LP/.test(a.textContent || ""));
    return hit?.href || "";
  }

  function findPhoneHref() {
    return document.querySelector('#drawerBody .detail-hero a[href^="tel:"]')?.href || "";
  }

  function readNextActionText() {
    const boxes = [...document.querySelectorAll("#drawerBody .detail-box")];
    const box = boxes.find(x => x.querySelector("h4")?.textContent?.trim() === "次回予定");
    return box?.querySelector("p")?.textContent?.replace(/\s+/g, " ").trim() || "未設定";
  }

  function ensureStyle() {
    if (document.querySelector("#sales65Style")) return;
    const style = document.createElement("style");
    style.id = "sales65Style";
    style.textContent = `
      .sales65-command{
        margin:14px 0 4px;border:2px solid #91d3bb;background:linear-gradient(180deg,#f3fcf8,#eef9f5);
        border-radius:16px;padding:15px;
      }
      .sales65-title{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px}
      .sales65-title h4{margin:0;color:#087553;font-size:16px}
      .sales65-title span{font-size:10px;color:#477466;background:#fff;border:1px solid #cce8dd;padding:4px 7px;border-radius:999px}
      .sales65-lead{margin:0 0 12px;color:#526779;font-size:11px;line-height:1.65}
      .sales65-status{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0 0 11px}
      .sales65-status>div{background:#fff;border:1px solid #dcebe5;border-radius:10px;padding:9px 10px}
      .sales65-status small{display:block;color:#758797;font-size:9px}.sales65-status b{display:block;margin-top:3px;font-size:11px;color:#2d4b40}
      .sales65-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .sales65-actions .btn{width:100%;min-height:42px;font-size:12px}
      .sales65-line-sent{background:linear-gradient(135deg,#148e69,#087354)!important;color:#fff!important;border:0!important}
      .sales65-primary{grid-column:1/-1}
      .sales65-import-next{
        margin:10px 0 14px;padding:13px 14px;border:2px solid #a8ddca;background:#f2fbf7;
        border-radius:13px;display:flex;align-items:center;justify-content:space-between;gap:12px;
      }
      .sales65-import-next b{display:block;color:#087553;font-size:13px}
      .sales65-import-next p{margin:3px 0 0;color:#5d7169;font-size:11px}
      .sales65-import-actions{display:flex;gap:7px;flex-wrap:wrap}
      @media(max-width:640px){
        .sales65-actions{grid-template-columns:1fr}.sales65-primary{grid-column:auto}
        .sales65-import-next{display:block}.sales65-import-actions{margin-top:10px}
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

  function activeQueueFor(items, prospectId) {
    return (items || []).find(q =>
      q?.prospect_id === prospectId &&
      ACTIVE_QUEUE.has(String(q.queue_status || "queued"))
    ) || null;
  }

  function hasLineSentToday(detail) {
    return (detail?.activities || []).some(a =>
      a?.result_code === "outreach_line_sent" && isTodayJst(a.activity_at)
    );
  }

  function hasPendingReplyCheck(detail) {
    return (detail?.nextActions || []).some(a =>
      ["pending", "snoozed"].includes(String(a?.status || "")) &&
      String(a?.action_type || "") === "reply_check"
    );
  }

  async function recordLineLpSent(id) {
    if (!id || sentLocks.has(id)) return;

    const name = currentProspectName();
    const due = addDays(todayJst(), 3);
    if (!confirm(
      `${name}\n\n実際にLINEで提案LPを送付済みですか？\n\n` +
      `「LINEでLP送付済み」として記録し、${fmtDate(due)}に反応・返信確認を作成します。`
    )) return;

    sentLocks.add(id);
    const button = document.querySelector(`[data-sales65-line-sent="${CSS.escape(id)}"]`);
    if (button) {
      button.disabled = true;
      button.textContent = "記録中…";
    }

    try {
      const [detail, queue] = await Promise.all([fetchDetail(id), fetchTodayQueue()]);

      if (hasLineSentToday(detail)) {
        toast("本日はすでにLINE送付済みとして記録されています。重複登録しません。");
        injectCommandPanel();
        return;
      }

      const queueItem = activeQueueFor(queue, id);
      const body = {
        activityType: "line",
        resultCode: "outreach_line_sent",
        summary: "LINEで提案LPを送付",
        details: "LINEから提案LPを送付。返信・反応待ち。",
        isOwnerContact: false,
        applyRule: false,
        completeQueue: true,
        metadata: {
          sales65: true,
          version: VERSION,
          channel: "line",
          material: "sales_lp",
          followDays: 3
        }
      };

      if (queueItem?.id) body.queueItemId = queueItem.id;

      if (!hasPendingReplyCheck(detail)) {
        body.nextAction = {
          actionType: "reply_check",
          dueDate: due,
          description: "LINE送付LPの反応・返信確認",
          priority: "normal",
          isPrimary: true,
          metadata: {
            sales65: true,
            channel: "line",
            material: "sales_lp"
          }
        };
      }

      await request(`/api/prospects/${encodeURIComponent(id)}/record-activity`, {
        method: "POST",
        body
      });

      toast(`LINEでLP送付済みを記録しました。反応確認：${fmtDate(due)}`);
      await updateCommandStatus(id);
    } catch (e) {
      toast(e.message || "LINE送付済みを記録できませんでした。", "error");
    } finally {
      sentLocks.delete(id);
      if (button) {
        button.disabled = false;
        button.textContent = "LINEでLP送付済み";
      }
    }
  }

  async function updateCommandStatus(id) {
    const root = document.querySelector("#sales65Command");
    if (!root || root.dataset.prospectId !== id) return;
    try {
      const [detail, queue] = await Promise.all([fetchDetail(id), fetchTodayQueue()]);
      const active = activeQueueFor(queue, id);
      const sent = hasLineSentToday(detail);
      const next = (detail.nextActions || [])
        .filter(a => ["pending", "snoozed"].includes(String(a?.status || "")))
        .sort((a,b) => String(a.due_date || "").localeCompare(String(b.due_date || "")))[0];

      const q = root.querySelector("[data-sales65-status-queue]");
      const a = root.querySelector("[data-sales65-status-activity]");
      if (q) q.textContent = active ? "今日の営業に登録済み" : "今日の営業は未登録";
      if (a) {
        a.textContent = sent
          ? "本日 LINEでLP送付済み"
          : next
            ? `${fmtDate(next.due_date)} ${next.description || "次回確認"}`
            : "次回予定なし";
      }
    } catch {}
  }

  function injectCommandPanel() {
    if (injecting) return;
    const body = document.querySelector("#drawerBody");
    const hero = body?.querySelector(".detail-hero");
    const prospectId = currentProspectId();
    if (!body || !hero || !prospectId) return;

    injecting = true;
    try {
      ensureStyle();
      const lp = findLpHref();
      const phone = findPhoneHref();
      const next = readNextActionText();

      let root = body.querySelector("#sales65Command");
      const signature = JSON.stringify({ prospectId, lp, phone, next });
      if (root?.dataset.signature === signature) return;

      if (!root) {
        root = document.createElement("section");
        root.id = "sales65Command";
        hero.insertAdjacentElement("afterend", root);
      }

      root.className = "sales65-command";
      root.dataset.prospectId = prospectId;
      root.dataset.signature = signature;
      root.innerHTML = `
        <div class="sales65-title">
          <h4>本番営業クイック操作</h4>
          <span>V65</span>
        </div>
        <p class="sales65-lead">店舗詳細から、素材確認・今日の営業・送付記録・フォローまで進めます。</p>
        <div class="sales65-status">
          <div><small>今日の営業</small><b data-sales65-status-queue>確認中…</b></div>
          <div><small>次の行動</small><b data-sales65-status-activity>${esc(next)}</b></div>
        </div>
        <div class="sales65-actions">
          <button type="button" class="btn btn-outline" data-sales65-open-lp ${lp ? "" : "disabled"}>提案LPを開く</button>
          ${phone
            ? `<a class="btn btn-outline" href="${esc(phone)}">電話する</a>`
            : `<button type="button" class="btn btn-outline" disabled>電話番号なし</button>`}
          <button type="button" class="btn btn-outline" data-sales65-queue="${esc(prospectId)}">今日の営業へ追加</button>
          <button type="button" class="btn btn-outline" data-sales65-result="${esc(prospectId)}">結果を記録</button>
          <button type="button" class="btn sales65-line-sent sales65-primary" data-sales65-line-sent="${esc(prospectId)}">LINEでLP送付済み</button>
          <button type="button" class="btn btn-secondary sales65-primary" data-sales65-followup>フォローアップを確認</button>
        </div>
      `;

      updateCommandStatus(prospectId);
    } finally {
      injecting = false;
    }
  }

  function captureImportSelection() {
    const checked = [...document.querySelectorAll("#searchResults .result-check:checked")];
    lastImportNames = checked.map(cb =>
      cb.closest("tr")?.querySelector(".business-cell strong")?.textContent?.trim()
    ).filter(Boolean);
  }

  function showImportShortcut() {
    if (!lastImportNames.length) return;
    const summary = document.querySelector("#searchSummary");
    if (!summary) return;

    document.querySelector("#sales65ImportNext")?.remove();
    const name = lastImportNames[0];
    const box = document.createElement("div");
    box.id = "sales65ImportNext";
    box.className = "sales65-import-next";
    box.innerHTML = `
      <div>
        <b>次の操作：登録した店舗からそのまま営業できます</b>
        <p>${esc(lastImportNames.length === 1 ? name : `${lastImportNames.length}店舗を登録`)}</p>
      </div>
      <div class="sales65-import-actions">
        <button type="button" class="btn btn-primary btn-sm" data-sales65-open-imported="${esc(name)}">今登録した店舗を開く</button>
        <button type="button" class="btn btn-secondary btn-sm" data-sales65-dismiss-import>あとで</button>
      </div>
    `;
    summary.parentElement?.insertBefore(box, summary.nextSibling);
  }

  function openImported(name) {
    const nav = navByText("営業パイプライン");
    nav?.click();

    setTimeout(() => {
      const input = document.querySelector("#pipelineSearch");
      if (!input) return;
      input.value = name;
      input.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true
      }));
    }, 180);

    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const buttons = [...document.querySelectorAll('#view-pipeline [data-prospect]')];
      const target = buttons.find(b => b.textContent.trim() === name)
        || buttons.find(b => b.textContent.includes(name));
      if (target) {
        clearInterval(timer);
        target.click();
      } else if (tries >= 12) {
        clearInterval(timer);
        toast("営業パイプラインを店舗名で絞り込みました。該当店舗を開いてください。");
      }
    }, 250);
  }

  function observeNativeToasts() {
    const stack = document.querySelector("#toastStack");
    if (!stack) return;
    new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          const text = n.textContent?.trim() || "";
          if (/^\d+件を営業先へ登録しました$/.test(text) && !n.classList.contains("error")) {
            setTimeout(showImportShortcut, 80);
          }
        }
      }
    }).observe(stack, { childList: true });
  }

  function bindClicks() {
    document.addEventListener("click", e => {
      if (e.target.closest("#importSelectedBtn")) {
        captureImportSelection();
      }

      const line = e.target.closest("[data-sales65-line-sent]");
      if (line) {
        e.preventDefault();
        e.stopPropagation();
        recordLineLpSent(line.dataset.sales65LineSent);
        return;
      }

      if (e.target.closest("[data-sales65-open-lp]")) {
        const href = findLpHref();
        if (href) window.open(href, "_blank", "noopener");
        else toast("提案LPを確認できませんでした。営業素材欄を確認してください。", "error");
        return;
      }

      const q = e.target.closest("[data-sales65-queue]");
      if (q) {
        const v64 = document.querySelector(
          `#drawerBody [data-sales64-direct-queue="${CSS.escape(q.dataset.sales65Queue)}"]`
        );
        if (v64) v64.click();
        else toast("「今日の営業へ追加」を準備できませんでした。画面を再読込してください。", "error");
        return;
      }

      const r = e.target.closest("[data-sales65-result]");
      if (r) {
        const nativeButton = document.querySelector(
          `#drawerBody .detail-hero [data-record-activity="${CSS.escape(r.dataset.sales65Result)}"]`
        );
        nativeButton?.click();
        return;
      }

      if (e.target.closest("[data-sales65-followup]")) {
        document.querySelector("#drawerClose")?.click();
        navByText("フォローアップ")?.click();
        return;
      }

      const open = e.target.closest("[data-sales65-open-imported]");
      if (open) {
        openImported(open.dataset.sales65OpenImported);
        return;
      }

      if (e.target.closest("[data-sales65-dismiss-import]")) {
        document.querySelector("#sales65ImportNext")?.remove();
      }
    }, true);
  }

  function bindDrawerObserver() {
    const body = document.querySelector("#drawerBody");
    if (!body) return;
    let timer = null;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(injectCommandPanel, 60);
    }).observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    injectCommandPanel();
  }

  function init() {
    ensureStyle();
    bindClicks();
    bindDrawerObserver();
    observeNativeToasts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.DPRO_SALES65 = Object.freeze({ version: VERSION });
})();
