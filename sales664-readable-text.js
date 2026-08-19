/*
 * DPRO SALESNAVI V66.4
 * Version: SALESNAVI-66.4-READABLE-TEXT-20260819
 *
 * Readability patch:
 * - Increase small labels/help text/buttons/table text.
 * - Preserve existing layout and responsive behavior.
 * - Desktop-first, but remains usable on tablets/mobile.
 *
 * No Worker / SQL / DB change.
 */
(() => {
  "use strict";

  const VERSION = "SALESNAVI-66.4-READABLE-TEXT-20260819";

  function ensureStyle() {
    if (document.getElementById("sales664ReadableText")) return;

    const style = document.createElement("style");
    style.id = "sales664ReadableText";
    style.textContent = `
      /* =========================
         V66.4 READABILITY
         ========================= */

      html, body {
        font-size: 16px;
      }

      /* Top / page headings */
      .top-title h1 {
        font-size: 21px !important;
      }
      .top-title p,
      .page-head p {
        font-size: 13px !important;
        line-height: 1.65 !important;
      }
      .page-head h2 {
        font-size: 25px !important;
        line-height: 1.35 !important;
      }

      /* Sidebar */
      .sidebar-brand strong {
        font-size: 18px !important;
      }
      .sidebar-brand small,
      .sidebar-user strong {
        font-size: 12px !important;
      }
      .sidebar-user small {
        font-size: 11px !important;
      }
      .nav-label {
        font-size: 11px !important;
      }
      .nav-btn {
        font-size: 14px !important;
        line-height: 1.45 !important;
      }
      .nav-count {
        font-size: 11px !important;
      }

      /* Panels */
      .panel-head h3 {
        font-size: 16px !important;
      }
      .panel-head .hint {
        font-size: 12px !important;
        line-height: 1.55 !important;
      }

      /* Inputs */
      .field label {
        font-size: 14px !important;
        line-height: 1.5 !important;
      }
      .field input,
      .field select,
      .field textarea {
        font-size: 14px !important;
        line-height: 1.5 !important;
        padding-top: 13px !important;
        padding-bottom: 13px !important;
      }

      /* Buttons */
      .btn {
        font-size: 13px !important;
        line-height: 1.35 !important;
      }
      .btn-sm {
        font-size: 12px !important;
      }

      /* Generic small/assistive text */
      .empty small,
      .metric .sub,
      .action-main small,
      .queue-main .meta,
      .login-note {
        font-size: 12px !important;
        line-height: 1.6 !important;
      }

      /* Search UI V66 */
      .sales66-mode-label {
        font-size: 13px !important;
      }
      .sales66-mode-btn {
        font-size: 13px !important;
        padding: 12px 11px !important;
      }
      .sales66-mode-btn small {
        font-size: 11px !important;
        line-height: 1.5 !important;
      }
      .sales66-mode-note {
        font-size: 12px !important;
        line-height: 1.7 !important;
        padding: 11px 12px !important;
      }
      .sales66-direct-hint,
      .sales66-area-helper span,
      .sales66-area-helper button {
        font-size: 11px !important;
      }

      /* Search origin UI V66.2 */
      .sales662-origin-title {
        font-size: 13px !important;
      }
      .sales662-origin-btn {
        font-size: 12px !important;
        padding: 11px 10px !important;
      }
      .sales662-origin-btn small {
        font-size: 10px !important;
        line-height: 1.5 !important;
      }
      .sales662-current-box b {
        font-size: 12px !important;
      }
      .sales662-location-status {
        font-size: 11px !important;
        line-height: 1.55 !important;
      }
      .sales662-locate {
        font-size: 11px !important;
        padding: 8px 10px !important;
      }
      .sales662-radius label {
        font-size: 11px !important;
      }
      .sales662-radius select {
        font-size: 12px !important;
      }
      .sales662-origin-note,
      .sales662-place-note {
        font-size: 11px !important;
        line-height: 1.65 !important;
      }

      /* V66.3 current location visibility */
      .sales663-current-summary b {
        font-size: 12px !important;
      }
      .sales663-current-summary span {
        font-size: 11px !important;
        line-height: 1.6 !important;
      }
      .sales663-maplink {
        font-size: 11px !important;
        padding: 7px 10px !important;
      }

      /* Search results table */
      #searchResults table {
        font-size: 13px !important;
      }
      #searchResults table th {
        font-size: 12px !important;
        line-height: 1.45 !important;
        padding-top: 11px !important;
        padding-bottom: 11px !important;
      }
      #searchResults table td {
        font-size: 13px !important;
        line-height: 1.55 !important;
        padding-top: 12px !important;
        padding-bottom: 12px !important;
      }
      #searchResults .business-cell strong {
        font-size: 14px !important;
        line-height: 1.45 !important;
      }
      #searchResults .business-cell small {
        font-size: 11px !important;
        line-height: 1.55 !important;
      }

      /* Status / badges / result utilities */
      .badge,
      .priority-badge,
      .sales662-distance,
      .sales662-rank,
      .sales661-near,
      .sales661-rank {
        font-size: 11px !important;
      }

      .sales662-result-toolbar button,
      .sales661-toolbar button {
        font-size: 12px !important;
        padding: 9px 11px !important;
      }

      /* Search summary / helper boxes */
      #searchSummary,
      .search-summary {
        font-size: 12px !important;
        line-height: 1.6 !important;
      }

      /* Slightly more breathing room for left search panel */
      #view-search .field,
      #viewSearch .field {
        margin-bottom: 18px !important;
      }

      /* Avoid tiny text on medium desktop widths */
      @media (min-width: 901px) and (max-width: 1500px) {
        .content {
          padding-left: 24px !important;
          padding-right: 24px !important;
        }
        #searchResults table {
          font-size: 12.5px !important;
        }
      }

      /* Mobile/tablet: keep readable, avoid overgrowth */
      @media (max-width: 900px) {
        .nav-btn {
          font-size: 13px !important;
        }
        .field label {
          font-size: 13px !important;
        }
        .field input,
        .field select,
        .field textarea {
          font-size: 14px !important;
        }
        .sales66-mode-btn,
        .sales662-origin-btn {
          font-size: 12px !important;
        }
      }
    `;

    document.head.appendChild(style);
    document.documentElement.dataset.sales664 = VERSION;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureStyle, { once: true });
  } else {
    ensureStyle();
  }
})();
