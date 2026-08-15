/**
 * DPRO SALESNAVI V65.4
 * Version: SALESNAVI-65.4-FOLLOWUP-CONTEXT-R2-20260815
 *
 * Purpose:
 * Correct V65.3's overly strict condition for legacy follow-up records.
 *
 * Background:
 * Legacy next-action records can carry a generic description such as
 * "次回の確認・連絡を行う。" without action_type="reply_check".
 * Therefore V65.3 could load successfully but fail to clarify the text.
 *
 * V65.4 rule:
 * - pending/snoozed next action
 * - generic follow-up description
 * - due date exists
 * - the nearest recent activity before that due date is LINE + proposal LP
 * - that activity is within 7 days before due date
 *
 * Display/context correction only:
 * - No DB mutation
 * - No activity creation
 * - No next-action creation
 * - No queue update
 * - No Worker change
 * - No SQL change
 */
(() => {
  "use strict";

  const VERSION = "SALESNAVI-65.4-FOLLOWUP-CONTEXT-R2-20260815";
  const GENERIC_FOLLOWUP_RE = /^(次回の確認・連絡を行う。?|次回確認|確認・連絡)$/u;
  const MAX_CONTEXT_DAYS = 7;
  const DAY_MS = 24 * 60 * 60 * 1000;

  if (window.__DPRO_SALES654_FOLLOWUP_CONTEXT__) return;
  if (typeof window.fetch !== "function") return;

  const nativeFetch = window.fetch.bind(window);

  function activityText(a) {
    return [
      a?.summary,
      a?.details,
      a?.notes,
      a?.memo,
      a?.result_code,
      a?.metadata?.material,
      a?.metadata?.channel
    ].filter(Boolean).join(" ");
  }

  function isLineActivity(a) {
    const type = String(a?.activity_type || a?.activityType || "").toLowerCase();
    const code = String(a?.result_code || a?.resultCode || "");
    const text = activityText(a);
    return type === "line"
      || /^outreach_line_/i.test(code)
      || /(?:^|\s)LINE(?:\s|$)/i.test(text);
  }

  function isLpActivity(a) {
    const code = String(a?.result_code || a?.resultCode || "");
    const text = activityText(a);
    return /(?:^|[^A-Z])LP(?:[^A-Z]|$)|提案LP|営業LP|ご案内ページ/i.test(text)
      || code === "outreach_line_sent"
      || String(a?.metadata?.material || "") === "sales_lp";
  }

  function jstDateText(value) {
    if (!value) return "";
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date(value));
      const o = Object.fromEntries(parts.map(x => [x.type, x.value]));
      return `${o.year}-${o.month}-${o.day}`;
    } catch {
      return "";
    }
  }

  function dateMs(dateText) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText || ""))) return NaN;
    return new Date(`${dateText}T12:00:00+09:00`).getTime();
  }

  function actionDueDate(action) {
    return String(action?.due_date || action?.dueDate || "").slice(0, 10);
  }

  function activityAt(activity) {
    return activity?.activity_at || activity?.activityAt || activity?.created_at || activity?.createdAt || "";
  }

  function nearestRecentActivityBeforeDue(detail, dueDate) {
    const dueMs = dateMs(dueDate);
    if (!Number.isFinite(dueMs)) return null;

    return (detail?.activities || [])
      .map(a => {
        const d = jstDateText(activityAt(a));
        const ms = dateMs(d);
        return { a, ms };
      })
      .filter(x =>
        Number.isFinite(x.ms) &&
        x.ms <= dueMs &&
        (dueMs - x.ms) <= MAX_CONTEXT_DAYS * DAY_MS
      )
      .sort((x, y) => y.ms - x.ms)[0]?.a || null;
  }

  function shouldClarify(detail, action) {
    if (!action) return false;

    const status = String(action.status || "").toLowerCase();
    if (!["pending", "snoozed"].includes(status)) return false;

    const description = String(action.description || "").trim();
    if (!GENERIC_FOLLOWUP_RE.test(description)) return false;

    const dueDate = actionDueDate(action);
    if (!dueDate) return false;

    const nearest = nearestRecentActivityBeforeDue(detail, dueDate);
    return !!nearest && isLineActivity(nearest) && isLpActivity(nearest);
  }

  function enhanceSalesDetail(detail) {
    if (!detail || !Array.isArray(detail.nextActions)) return detail;

    for (const action of detail.nextActions) {
      if (shouldClarify(detail, action)) {
        action.description = "LINE送付LPの反応・返信確認";
      }
    }
    return detail;
  }

  function isSalesDetailUrl(input) {
    const url = typeof input === "string" ? input : String(input?.url || "");
    return /\/api\/prospects\/[^/?#]+\/sales-detail(?:[?#]|$)/.test(url);
  }

  window.fetch = async function(input, init) {
    const response = await nativeFetch(input, init);

    if (!response?.ok || !isSalesDetailUrl(input)) return response;

    try {
      const data = await response.clone().json();

      // Support either direct detail object or wrapped payloads, without assuming one API shape.
      if (Array.isArray(data?.nextActions)) {
        enhanceSalesDetail(data);
      } else if (data?.detail && Array.isArray(data.detail.nextActions)) {
        enhanceSalesDetail(data.detail);
      } else if (data?.salesDetail && Array.isArray(data.salesDetail.nextActions)) {
        enhanceSalesDetail(data.salesDetail);
      }

      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");

      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (e) {
      console.warn("[V65.4] follow-up context enhancement skipped:", e);
      return response;
    }
  };

  function markVersionBadge() {
    document.querySelectorAll("#sales65Command .sales65-title span").forEach(el => {
      if (el.textContent !== "V65.4") el.textContent = "V65.4";
      el.title = VERSION;
    });
  }

  function initBadgeObserver() {
    markVersionBadge();
    if (!document.documentElement || typeof MutationObserver !== "function") return;

    const observer = new MutationObserver(() => queueMicrotask(markVersionBadge));
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBadgeObserver, { once: true });
  } else {
    initBadgeObserver();
  }

  window.__DPRO_SALES654_FOLLOWUP_CONTEXT__ = true;
  window.DPRO_SALES654 = Object.freeze({ version: VERSION });
})();
