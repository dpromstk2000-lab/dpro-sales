/**
 * DPRO SALESNAVI V65.8
 * Version: SALESNAVI-65.8-STALE-QUEUE-RECOVERY-20260815
 *
 * Purpose
 * -------
 * V65.7 fixed the future queueItemId handoff path, but the already-existing
 * Umidobutsu Clinic mismatch still remained visible on "今日の営業":
 *
 *   店舗詳細      = 本日営業済み
 *   活動履歴      = 電話するも応答なし
 *   次回予定      = 8/18 電話不通のため再架電
 *   今日のキュー  = 1件 / 対応中
 *
 * V65.8 adds a robust, dashboard-level recovery path and a second guard for
 * future activity forms.
 *
 * Safety
 * ------
 * - No SQL change.
 * - No Worker change.
 * - No activity creation.
 * - No follow-up creation.
 * - No queue creation.
 * - Never auto-completes a queue item on page load.
 * - Existing stale queue completion requires an explicit user click.
 * - Immediately before the PATCH, V65.8 re-checks:
 *     (a) the queue item is still active
 *     (b) the same prospect has a real sales activity today
 */
(() => {
  "use strict";

  const VERSION = "SALESNAVI-65.8-STALE-QUEUE-RECOVERY-20260815";
  const ACTIVE = new Set(["queued", "planned", "in_progress"]);
  const SALES_ACTIVITY_TYPES = new Set([
    "visit", "phone", "line", "email", "material", "demo", "quote", "other"
  ]);
  const METHOD_RE = /\[DPRO-SALES-METHOD:(visit|phone|line|email)\]/i;
  const METHOD_LABELS = Object.freeze({
    visit: "訪問",
    phone: "電話",
    line: "LINE",
    email: "メール"
  });

  if (window.__DPRO_SALES658_STALE_QUEUE_RECOVERY__) return;

  let scanTimer = null;
  let scanBusy = false;
  let formHydrateBusy = false;

  function cfg() {
    return window.DPRO_CONFIG || {};
  }

  function storedSession() {
    try {
      return JSON.parse(
        localStorage.getItem(cfg().sessionStorageKey || "dpro_sales_session_v3") || "null"
      );
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
    console[type === "error" ? "error" : "log"](`[V65.8] ${message}`);
  }

  function readMethod(notes) {
    const hit = String(notes || "").match(METHOD_RE);
    return hit && METHOD_LABELS[hit[1].toLowerCase()] ? hit[1].toLowerCase() : "";
  }

  async function loadTodayQueue() {
    const d = await request(`/api/sales-queue?date=${encodeURIComponent(todayJst())}`);
    return Array.isArray(d.queueItems) ? d.queueItems : [];
  }

  async function loadActivities() {
    const d = await request("/api/activities?limit=1000");
    return Array.isArray(d.activities) ? d.activities : [];
  }

  function activityProspectId(a) {
    return String(a?.prospect_id || a?.prospectId || a?.prospect?.id || "");
  }

  function isRealSalesActivityToday(a) {
    const type = String(a?.activity_type || a?.activityType || "").toLowerCase();
    const at = a?.activity_at || a?.activityAt || a?.created_at || a?.createdAt;
    if (!isTodayJst(at)) return false;
    if (!SALES_ACTIVITY_TYPES.has(type)) return false;

    const hasMeaning =
      String(a?.result_code || a?.resultCode || "").trim() ||
      String(a?.summary || "").trim() ||
      String(a?.details || "").trim();

    return !!hasMeaning;
  }

  function todaySalesProspectIds(activities) {
    return new Set(
      (activities || [])
        .filter(isRealSalesActivityToday)
        .map(activityProspectId)
        .filter(Boolean)
    );
  }

  function activeQueue(items, prospectId, queueId = "") {
    const exact = queueId
      ? (items || []).find(q =>
          String(q?.id || "") === String(queueId) &&
          ACTIVE.has(String(q?.queue_status || "queued"))
        )
      : null;
    if (exact) return exact;

    return (items || []).find(q =>
      String(q?.prospect_id || "") === String(prospectId || "") &&
      ACTIVE.has(String(q?.queue_status || "queued"))
    ) || null;
  }

  function ensureStyle() {
    if (document.querySelector("#sales658Style")) return;
    const style = document.createElement("style");
    style.id = "sales658Style";
    style.textContent = `
      .sales658-sync-btn{
        border:1px solid #d6a54a!important;
        background:#fff8e9!important;
        color:#74500c!important;
        box-shadow:none!important
      }
      .sales658-saved-btn,
      .sales658-saved-btn:disabled{
        background:#eef3f6!important;
        color:#67798b!important;
        border:1px solid #d7e0e7!important;
        opacity:1!important;
        cursor:default!important;
        box-shadow:none!important
      }
      .sales658-guard{
        margin-top:7px;padding:8px 10px;border:1px solid #8fd4bc;
        background:#eefaf5;border-radius:9px;color:#245b49;
        font-size:11px;line-height:1.55
      }
      #sales65Command .sales65-title span{
        font-size:0!important;min-width:46px;text-align:center
      }
      #sales65Command .sales65-title span::after{
        content:"V65.8"!important;font-size:10px!important
      }
    `;
    document.head.appendChild(style);
  }

  function queueActionButtons() {
    return [...document.querySelectorAll('[data-record-activity][data-queue-id]')];
  }

  function clearStaleDecorations() {
    document.querySelectorAll("[data-sales658-sync]").forEach(x => x.remove());
    document.querySelectorAll("[data-sales658-original-result]").forEach(btn => {
      btn.disabled = false;
      btn.classList.remove("sales658-saved-btn");
      btn.textContent = btn.dataset.sales658OriginalResult || "結果を記録";
      delete btn.dataset.sales658OriginalResult;
    });
  }

  function decorateStaleQueueButton(button) {
    if (!button?.dataset?.queueId || !button?.dataset?.recordActivity) return;

    const parent = button.parentElement;
    if (!parent) return;

    if (!button.dataset.sales658OriginalResult) {
      button.dataset.sales658OriginalResult = button.textContent?.trim() || "結果を記録";
    }
    button.textContent = "営業結果保存済み";
    button.disabled = true;
    button.classList.add("sales658-saved-btn");

    if (parent.querySelector(`[data-sales658-sync="${CSS.escape(button.dataset.queueId)}"]`)) {
      return;
    }

    const sync = document.createElement("button");
    sync.type = "button";
    sync.className = "btn btn-outline btn-sm sales658-sync-btn";
    sync.dataset.sales658Sync = button.dataset.queueId;
    sync.dataset.sales658Prospect = button.dataset.recordActivity;
    sync.textContent = "キューだけ完了";
    parent.insertBefore(sync, button);
  }

  async function scanVisibleQueue() {
    if (scanBusy || !token()) return;
    const buttons = queueActionButtons();
    if (!buttons.length) return;

    scanBusy = true;
    try {
      const [items, activities] = await Promise.all([
        loadTodayQueue(),
        loadActivities()
      ]);
      const doneProspects = todaySalesProspectIds(activities);

      // Reset only currently visible queue buttons, then re-mark real mismatches.
      for (const btn of buttons) {
        const pid = String(btn.dataset.recordActivity || "");
        const qid = String(btn.dataset.queueId || "");
        const stale = !!activeQueue(items, pid, qid) && doneProspects.has(pid);

        if (stale) {
          decorateStaleQueueButton(btn);
        } else if (btn.dataset.sales658OriginalResult) {
          btn.disabled = false;
          btn.classList.remove("sales658-saved-btn");
          btn.textContent = btn.dataset.sales658OriginalResult;
          delete btn.dataset.sales658OriginalResult;
          btn.parentElement?.querySelector(`[data-sales658-sync="${CSS.escape(qid)}"]`)?.remove();
        }
      }
    } catch (e) {
      console.warn("[V65.8] visible queue scan:", e);
    } finally {
      scanBusy = false;
    }
  }

  function scheduleScan(delay = 160) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanVisibleQueue, delay);
  }

  async function reconcileQueue(button) {
    const queueId = String(button?.dataset?.sales658Sync || "");
    const prospectId = String(button?.dataset?.sales658Prospect || "");
    if (!queueId || !prospectId) return;

    button.disabled = true;
    button.textContent = "確認中…";

    try {
      // Re-check immediately before write.
      const [items, activities] = await Promise.all([
        loadTodayQueue(),
        loadActivities()
      ]);
      const q = activeQueue(items, prospectId, queueId);
      const hasTodaySales = activities.some(a =>
        activityProspectId(a) === prospectId && isRealSalesActivityToday(a)
      );

      if (!q?.id) {
        throw new Error("この営業キューはすでに完了または状態変更されています。");
      }
      if (!hasTodaySales) {
        throw new Error("本日の営業活動を確認できないため、キュー同期を中止しました。");
      }

      await request(`/api/sales-queue/${encodeURIComponent(queueId)}`, {
        method: "PATCH",
        body: { status: "completed" }
      });

      toast("活動履歴は増やさず、今日の営業キューだけを完了へ同期しました。");

      // Reuse the application's normal refresh route.
      document.querySelector("#refreshBtn")?.click();
      setTimeout(() => scheduleScan(300), 450);
    } catch (e) {
      toast(e.message || "営業キューを完了へ同期できませんでした。", "error");
      button.disabled = false;
      button.textContent = "キューだけ完了";
    }
  }

  async function hydrateActivityForm() {
    if (formHydrateBusy || !token()) return;
    const form = document.querySelector("#activityForm");
    if (!form) return;

    const prospectId = String(
      form.querySelector('[name="prospectId"]')?.value || ""
    );
    const queueInput = form.querySelector('[name="queueItemId"]');
    if (!prospectId || !queueInput) return;

    // If the native queue card already supplied the id, V65.8 only restores
    // the sales method and guard text.
    formHydrateBusy = true;
    try {
      const items = await loadTodayQueue();
      const q = activeQueue(items, prospectId, queueInput.value || "");
      if (!q?.id) return;

      queueInput.value = q.id;

      const method = readMethod(q.notes);
      const select = form.querySelector('[name="activityType"]');
      if (select && method && [...select.options].some(o => o.value === method)) {
        select.value = method;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }

      if (!form.querySelector("[data-sales658-guard]")) {
        const anchor = select?.closest(".field");
        if (anchor) {
          const guard = document.createElement("div");
          guard.dataset.sales658Guard = "1";
          guard.className = "sales658-guard";
          guard.textContent =
            `今日の営業キューIDを確認済み${method ? `／営業手段「${METHOD_LABELS[method]}」を引継ぎ` : ""}。` +
            "この結果保存でキュー完了まで連動します。";
          anchor.appendChild(guard);
        }
      }
    } catch (e) {
      console.warn("[V65.8] activity form hydrate:", e);
    } finally {
      formHydrateBusy = false;
    }
  }

  function bind() {
    ensureStyle();

    document.addEventListener("click", e => {
      const sync = e.target.closest("[data-sales658-sync]");
      if (sync) {
        e.preventDefault();
        e.stopPropagation();
        reconcileQueue(sync);
        return;
      }

      if (e.target.closest("[data-record-activity]") || e.target.closest("[data-sales65-result]")) {
        setTimeout(hydrateActivityForm, 0);
        setTimeout(hydrateActivityForm, 120);
        setTimeout(hydrateActivityForm, 320);
      }

      const nav = e.target.closest(".nav-btn[data-view]");
      if (nav && /今日の営業|営業キュー/.test(nav.textContent || "")) {
        scheduleScan(280);
      }

      if (e.target.closest("#refreshBtn") || e.target.closest("#queueReload")) {
        scheduleScan(420);
      }
    }, true);

    if (typeof MutationObserver === "function" && document.body) {
      new MutationObserver(() => {
        if (document.querySelector("#activityForm")) {
          setTimeout(hydrateActivityForm, 20);
        }
        if (queueActionButtons().length) {
          scheduleScan(180);
        }
      }).observe(document.body, { childList: true, subtree: true });
    }

    scheduleScan(500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }

  window.__DPRO_SALES658_STALE_QUEUE_RECOVERY__ = true;
  window.DPRO_SALES658 = Object.freeze({
    version: VERSION,
    readMethod,
    isRealSalesActivityToday,
    activeQueue
  });
})();
