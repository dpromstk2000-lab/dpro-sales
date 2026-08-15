/**
 * DPRO SALESNAVI V65.7
 * Version: SALESNAVI-65.7-QUEUE-COMPLETE-HANDOFF-20260815
 *
 * Real-sales finding:
 * - A sales activity can be saved successfully from the store-detail quick
 *   operation while the day's queue item remains "in_progress".
 *
 * Root cause:
 * - Native activity submit completes a queue item only when activityForm
 *   receives queueItemId.
 * - Queue cards pass data-queue-id, but V65.2 store-detail "結果を記録"
 *   reuses the hero [data-record-activity] button, which has no queue id.
 *
 * V65.7:
 * 1) Before activity save, re-read today's queue by prospect id and inject
 *    the active queue item's id into activityForm.queueItemId.
 * 2) Re-apply the persisted queue sales method at the same time.
 * 3) Detect an already-existing stale mismatch (today activity exists while
 *    queue remains active) and show an EXPLICIT one-click reconciliation
 *    button. It PATCHes queue status only; it never creates another activity.
 * 4) Keep V65.6 visual version state stable as V65.7.
 *
 * Safety:
 * - No SQL change.
 * - No Cloudflare Worker change.
 * - No automatic activity creation.
 * - No automatic follow-up creation.
 * - No automatic queue completion on page load.
 * - Existing stale queue completion requires an explicit user click.
 */
(() => {
  "use strict";

  const VERSION = "SALESNAVI-65.7-QUEUE-COMPLETE-HANDOFF-20260815";
  const ACTIVE = new Set(["queued", "planned", "in_progress"]);
  const METHOD_RE = /\[DPRO-SALES-METHOD:(visit|phone|line|email)\]/i;
  const METHOD_LABEL = Object.freeze({
    visit: "訪問",
    phone: "電話",
    line: "LINE",
    email: "メール"
  });

  if (window.__DPRO_SALES657_QUEUE_COMPLETE__) return;

  function cfg() {
    return window.DPRO_CONFIG || {};
  }

  function storedSession() {
    try {
      return JSON.parse(localStorage.getItem(cfg().sessionStorageKey || "dpro_sales_session_v3") || "null");
    } catch {
      return null;
    }
  }

  function token() {
    return storedSession()?.token || "";
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
    console[type === "error" ? "error" : "log"](`[V65.7] ${message}`);
  }

  function readMethod(notes) {
    const hit = String(notes || "").match(METHOD_RE);
    return hit && METHOD_LABEL[hit[1].toLowerCase()] ? hit[1].toLowerCase() : "";
  }

  function currentProspectId() {
    return document.querySelector("#drawerBody .detail-hero [data-record-activity]")?.dataset.recordActivity || "";
  }

  function currentProspectName() {
    return document.querySelector("#drawerBody .detail-hero h2")?.textContent?.trim() || "営業先";
  }

  async function todayQueue() {
    const d = await request(`/api/sales-queue?date=${encodeURIComponent(todayJst())}`);
    return Array.isArray(d.queueItems) ? d.queueItems : [];
  }

  function queueForProspect(items, prospectId) {
    return (items || [])
      .filter(q => String(q?.prospect_id || "") === String(prospectId || ""))
      .sort((a, b) => {
        const rank = { in_progress: 0, queued: 1, planned: 1, completed: 3, skipped: 4, cancelled: 5 };
        const ar = rank[String(a?.queue_status || "queued")] ?? 2;
        const br = rank[String(b?.queue_status || "queued")] ?? 2;
        return ar - br || Number(a?.queue_order || 99999) - Number(b?.queue_order || 99999);
      })[0] || null;
  }

  function activeQueueForProspect(items, prospectId) {
    return (items || []).find(q =>
      String(q?.prospect_id || "") === String(prospectId || "") &&
      ACTIVE.has(String(q?.queue_status || "queued"))
    ) || null;
  }

  async function waitForActivityForm(tries = 40) {
    for (let i = 0; i < tries; i++) {
      const form = document.querySelector("#activityForm");
      if (form) return form;
      await new Promise(r => setTimeout(r, 40));
    }
    return null;
  }

  function addHandoffHint(form, queue, method) {
    form.querySelectorAll("[data-sales657-queue-hint]").forEach(x => x.remove());

    const select = form.querySelector('select[name="activityType"]');
    const field = select?.closest(".field");
    if (!field) return;

    const hint = document.createElement("div");
    hint.dataset.sales657QueueHint = "1";
    hint.className = "sales657-queue-hint";

    const parts = [];
    if (queue?.id) parts.push("今日の営業キューIDを引き継ぎました");
    if (method && METHOD_LABEL[method]) parts.push(`営業手段「${METHOD_LABEL[method]}」を引き継ぎました`);
    hint.textContent = parts.join("。") + "。";
    field.appendChild(hint);
  }

  function applyMethod(form, method) {
    if (!method) return;
    const select = form.querySelector('select[name="activityType"]');
    if (!select) return;
    if (![...select.options].some(o => o.value === method)) return;

    select.value = method;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function handoffQueueToActivity(button) {
    const prospectId = button?.dataset?.recordActivity || currentProspectId();
    if (!prospectId) return;

    try {
      const [items, form] = await Promise.all([
        todayQueue(),
        waitForActivityForm()
      ]);
      if (!form) return;

      const explicitQueueId = button?.dataset?.queueId || "";
      const queue = (explicitQueueId
        ? items.find(q => String(q?.id || "") === String(explicitQueueId))
        : null) || activeQueueForProspect(items, prospectId) || queueForProspect(items, prospectId);

      if (!queue?.id) return;

      const hidden = form.querySelector('input[name="queueItemId"]');
      if (hidden) hidden.value = queue.id;

      const method = readMethod(queue.notes);
      applyMethod(form, method);
      addHandoffHint(form, queue, method);

      form.dataset.sales657QueueItemId = queue.id;
      form.dataset.sales657ProspectId = prospectId;
    } catch (e) {
      console.warn("[V65.7] queue -> activity handoff:", e);
    }
  }

  function todayActivitiesFromDetail(detail) {
    return (detail?.activities || []).filter(a => isTodayJst(
      a?.activity_at || a?.activityAt || a?.created_at || a?.createdAt
    ));
  }

  async function currentDetail() {
    const id = currentProspectId();
    if (!id) return null;
    return request(`/api/prospects/${encodeURIComponent(id)}/sales-detail`);
  }

  function ensureStyle() {
    if (document.querySelector("#sales657Style")) return;
    const style = document.createElement("style");
    style.id = "sales657Style";
    style.textContent = `
      .sales657-queue-hint{
        margin-top:7px;padding:8px 10px;border:1px solid #8fd4bc;
        background:#eefaf5;border-radius:9px;color:#245b49;
        font-size:11px;line-height:1.55
      }
      .sales657-reconcile{
        margin-top:10px;padding:10px 12px;border:1px solid #e4bd6b;
        background:#fff8e9;border-radius:11px;
        display:flex;align-items:center;justify-content:space-between;gap:10px;
        font-size:11px;color:#76520e;line-height:1.55
      }
      .sales657-reconcile b{display:block;color:#684608;margin-bottom:2px}
      .sales657-reconcile button{
        flex:0 0 auto;border:1px solid #d3a64a;background:#fff;color:#6d4a0b;
        border-radius:9px;padding:8px 11px;font-weight:800;cursor:pointer
      }
      #sales65Command .sales65-title span{
        font-size:0!important;min-width:46px;text-align:center
      }
      #sales65Command .sales65-title span::after{
        content:"V65.7";font-size:10px!important
      }
      @media(max-width:640px){
        .sales657-reconcile{display:block}
        .sales657-reconcile button{width:100%;margin-top:8px}
      }
    `;
    document.head.appendChild(style);
  }

  function removeReconcile() {
    document.querySelector("#sales657Reconcile")?.remove();
  }

  async function injectReconcileIfNeeded() {
    const command = document.querySelector("#sales65Command");
    const prospectId = currentProspectId();
    if (!command || !prospectId) {
      removeReconcile();
      return;
    }

    try {
      const [detail, items] = await Promise.all([currentDetail(), todayQueue()]);
      if (!detail) return;

      const activities = todayActivitiesFromDetail(detail);
      const active = activeQueueForProspect(items, prospectId);

      if (!activities.length || !active?.id) {
        removeReconcile();
        return;
      }

      let box = document.querySelector("#sales657Reconcile");
      if (!box) {
        box = document.createElement("div");
        box.id = "sales657Reconcile";
        box.className = "sales657-reconcile";
        command.appendChild(box);
      }

      box.dataset.queueId = active.id;
      box.dataset.prospectId = prospectId;
      box.innerHTML = `
        <div>
          <b>営業結果は保存済みですが、今日の営業キューだけ未完了です</b>
          活動履歴は追加せず、キュー状態だけ「完了」へ同期できます。
        </div>
        <button type="button" data-sales657-reconcile>営業キューを完了へ同期</button>
      `;
    } catch (e) {
      console.warn("[V65.7] reconcile check:", e);
    }
  }

  async function reconcileCurrentQueue(button) {
    const box = button.closest("#sales657Reconcile");
    const queueId = box?.dataset?.queueId || "";
    const prospectId = box?.dataset?.prospectId || "";
    if (!queueId || !prospectId) return;

    button.disabled = true;
    button.textContent = "同期中…";

    try {
      // Re-validate immediately before write:
      // today activity must exist AND this queue must still be active.
      const [detail, items] = await Promise.all([currentDetail(), todayQueue()]);
      const active = activeQueueForProspect(items, prospectId);
      const activities = todayActivitiesFromDetail(detail);

      if (!activities.length) {
        throw new Error("本日の活動履歴を確認できないため、同期を中止しました。");
      }
      if (!active?.id || String(active.id) !== String(queueId)) {
        throw new Error("営業キューはすでに完了または状態変更されています。");
      }

      await request(`/api/sales-queue/${encodeURIComponent(queueId)}`, {
        method: "PATCH",
        body: { status: "completed" }
      });

      toast(`${currentProspectName()}：営業キューだけを完了へ同期しました。`);
      removeReconcile();

      // Refresh visible detail without creating any activity.
      const proxy = document.createElement("button");
      proxy.type = "button";
      proxy.hidden = true;
      proxy.dataset.prospect = prospectId;
      document.body.appendChild(proxy);
      proxy.click();
      proxy.remove();
    } catch (e) {
      toast(e.message || "営業キューを同期できませんでした。", "error");
      button.disabled = false;
      button.textContent = "営業キューを完了へ同期";
    }
  }

  function bindClicks() {
    document.addEventListener("click", e => {
      const native = e.target.closest("[data-record-activity]");
      if (native) {
        setTimeout(() => handoffQueueToActivity(native), 0);
      }

      const reconcile = e.target.closest("[data-sales657-reconcile]");
      if (reconcile) {
        e.preventDefault();
        e.stopPropagation();
        reconcileCurrentQueue(reconcile);
      }
    }, true);
  }

  function observeUi() {
    if (typeof MutationObserver !== "function" || !document.body) return;

    let detailTimer = null;
    new MutationObserver(() => {
      clearTimeout(detailTimer);
      detailTimer = setTimeout(() => {
        if (document.querySelector("#sales65Command") && currentProspectId()) {
          injectReconcileIfNeeded();
        }
      }, 180);
    }).observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    ensureStyle();
    bindClicks();
    observeUi();
    setTimeout(injectReconcileIfNeeded, 350);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.__DPRO_SALES657_QUEUE_COMPLETE__ = true;
  window.DPRO_SALES657 = Object.freeze({
    version: VERSION,
    readMethod,
    activeQueueForProspect,
    todayActivitiesFromDetail
  });
})();
