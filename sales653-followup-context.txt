/**
 * DPRO SALESNAVI V65.3
 * Version: SALESNAVI-65.3-FOLLOWUP-CONTEXT-20260815
 *
 * Purpose:
 * Preserve V65.2 behavior while making a generic pending reply-check readable
 * when the nearest recent activity clearly shows that a LINE proposal LP was sent.
 *
 * Important:
 * - Display/context correction only.
 * - Does not write or mutate DB data.
 * - Does not change Cloudflare Worker.
 * - Does not change Supabase SQL.
 * - Does not duplicate activities or follow-up records.
 */
(() => {
  "use strict";

  const VERSION = "SALESNAVI-65.3-FOLLOWUP-CONTEXT-20260815";
  const GENERIC_REPLY_RE = /^(次回の確認・連絡を行う。?|次回確認|確認・連絡)$/u;
  const MAX_CONTEXT_DAYS = 7;
  const DAY_MS = 24 * 60 * 60 * 1000;

  if (window.__DPRO_SALES653_FOLLOWUP_CONTEXT__) return;
  if (typeof window.fetch !== "function") return;

  const nativeFetch = window.fetch.bind(window);

  function activityText(a) {
    return [
      a?.summary,
      a?.details,
      a?.notes,
      a?.memo,
      a?.result_code
    ].filter(Boolean).join(" ");
  }

  function isLineActivity(a) {
    return String(a?.activity_type || "").toLowerCase() === "line"
      || /^outreach_line_/i.test(String(a?.result_code || ""));
  }

  function isLpActivity(a) {
    const text = activityText(a);
    return /(?:^|[^A-Z])LP(?:[^A-Z]|$)|提案LP|営業LP|ご案内ページ/i.test(text)
      || String(a?.result_code || "") === "outreach_line_sent";
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

  function latestRecentActivityBeforeDue(detail, dueDate) {
    const dueMs = dateMs(dueDate);
    if (!Number.isFinite(dueMs)) return null;

    return (detail?.activities || [])
      .map(a => {
        const d = jstDateText(a?.activity_at);
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

  function shouldClarifyReplyCheck(detail, action) {
    if (!action) return false;

    const status = String(action.status || "");
    if (!["pending", "snoozed"].includes(status)) return false;

    const actionType = String(action.action_type || action.actionType || "");
    if (actionType !== "reply_check") return false;

    const description = String(action.description || "").trim();
    if (!GENERIC_REPLY_RE.test(description)) return false;

    const latest = latestRecentActivityBeforeDue(detail, action.due_date || action.dueDate);
    return !!latest && isLineActivity(latest) && isLpActivity(latest);
  }

  function enhanceSalesDetail(detail) {
    if (!detail || !Array.isArray(detail.nextActions)) return detail;

    detail.nextActions.forEach(action => {
      if (shouldClarifyReplyCheck(detail, action)) {
        action.description = "LINE送付LPの反応・返信確認";
      }
    });

    return detail;
  }

  function isSalesDetailUrl(input) {
    const url = typeof input === "string"
      ? input
      : String(input?.url || "");
    return /\/api\/prospects\/[^/?#]+\/sales-detail(?:[?#]|$)/.test(url);
  }

  window.fetch = async function(input, init) {
    const response = await nativeFetch(input, init);

    if (!response?.ok || !isSalesDetailUrl(input)) {
      return response;
    }

    try {
      const data = await response.clone().json();
      const enhanced = enhanceSalesDetail(data);

      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");

      return new Response(JSON.stringify(enhanced), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (e) {
      console.warn("[V65.3] follow-up context enhancement skipped:", e);
      return response;
    }
  };

  function markVersionBadge() {
    document.querySelectorAll("#sales65Command .sales65-title span").forEach(el => {
      if (el.textContent !== "V65.3") el.textContent = "V65.3";
      el.title = VERSION;
    });
  }

  function initBadgeObserver() {
    markVersionBadge();
    if (!document.documentElement || typeof MutationObserver !== "function") return;

    const observer = new MutationObserver(() => {
      queueMicrotask(markVersionBadge);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBadgeObserver, { once: true });
  } else {
    initBadgeObserver();
  }

  window.__DPRO_SALES653_FOLLOWUP_CONTEXT__ = true;
  window.DPRO_SALES653 = Object.freeze({ version: VERSION });
})();
