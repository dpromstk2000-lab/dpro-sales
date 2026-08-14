/**
 * DPRO SALESNAVI-63 — ACTIVITY METHOD HANDOFF
 * Version: SALESNAVI-63-ACTIVITY-METHOD-HANDOFF-20260814
 *
 * Purpose:
 *   Keep the sales method shown in today's sales queue and the
 *   "営業結果を記録" activity method in sync.
 *
 * Example:
 *   営業キュー: 電話
 *   -> 結果を記録
 *   -> 活動方法: 電話
 */
(() => {
  "use strict";

  const VERSION = "SALESNAVI-63-ACTIVITY-METHOD-HANDOFF-20260814";
  let pending = null;

  const methodMap = new Map([
    ["訪問", "visit"],
    ["電話", "phone"],
    ["line", "line"],
    ["メール", "email"],
    ["email", "email"],
    ["資料", "material"],
    ["資料送付", "material"],
    ["デモ", "demo"],
    ["demo", "demo"],
    ["見積", "quote"],
    ["見積提出", "quote"],
  ]);

  function clean(v) {
    return String(v || "").replace(/\s+/g, " ").trim();
  }

  function normalizeLabel(label) {
    const raw = clean(label);
    if (!raw) return null;
    const lower = raw.toLowerCase();

    if (methodMap.has(raw)) return methodMap.get(raw);
    if (methodMap.has(lower)) return methodMap.get(lower);

    if (raw.includes("電話")) return "phone";
    if (raw.includes("訪問")) return "visit";
    if (lower.includes("line")) return "line";
    if (raw.includes("メール") || lower.includes("email")) return "email";
    if (raw.includes("資料")) return "material";
    if (raw.includes("デモ") || lower.includes("demo")) return "demo";
    if (raw.includes("見積")) return "quote";

    // Native activity API accepts "other" for channels not represented
    // by the result modal select (HP form / Instagram etc.).
    return "other";
  }

  function labelFromValue(value, originalLabel) {
    const labels = {
      visit: "訪問",
      phone: "電話",
      line: "LINE",
      email: "メール",
      material: "資料",
      demo: "デモ",
      quote: "見積",
      other: originalLabel || "その他",
    };
    return labels[value] || originalLabel || "その他";
  }

  function findQueueContainer(button) {
    return button.closest(".queue-card, #sales1110Next, .sales1110-next") || null;
  }

  function readQueueMethod(button) {
    const box = findQueueContainer(button);
    if (!box) return null;

    const metaBlocks = [...box.querySelectorAll(".sales1110-meta > div")];
    for (const block of metaBlocks) {
      const span = block.querySelector("span");
      const b = block.querySelector("b");
      if (clean(span?.textContent) === "営業手段" && clean(b?.textContent)) {
        const label = clean(b.textContent);
        return {
          label,
          value: normalizeLabel(label),
          queueId: button.dataset.queueId || "",
          prospectId: button.dataset.recordActivity || "",
        };
      }
    }
    return null;
  }

  function removeOldHint(form) {
    form.querySelectorAll("[data-sales63-method-hint]").forEach(el => el.remove());
  }

  function applyToOpenModal() {
    if (!pending) return false;

    const form = document.querySelector("#activityForm");
    if (!form) return false;

    const select = form.querySelector('select[name="activityType"]');
    if (!select) return false;

    // Make sure the mapped value exists in the native form.
    const allowed = [...select.options].some(opt => opt.value === pending.value);
    if (!allowed) pending.value = "other";

    select.value = pending.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));

    removeOldHint(form);
    const field = select.closest(".field");
    if (field) {
      const hint = document.createElement("div");
      hint.dataset.sales63MethodHint = VERSION;
      hint.style.cssText =
        "margin-top:7px;padding:8px 10px;border:1px solid #bfe1d3;" +
        "background:#f1fbf7;border-radius:9px;color:#315d4e;" +
        "font-size:11px;line-height:1.55;";
      hint.innerHTML =
        '営業キューの営業手段 <b>' +
        escapeHtml(pending.label) +
        "</b> を活動方法へ引き継ぎました。";
      field.appendChild(hint);
    }

    form.dataset.sales63ActivityMethod = pending.value;
    form.dataset.sales63QueueMethod = pending.label;
    pending = null;
    return true;
  }

  function escapeHtml(v) {
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Capture phase runs before the native owner's document click handler.
  // We read the queue's visible sales method first, then the native code opens
  // the modal, and the microtask applies the method to that modal.
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-record-activity]");
    if (!button) return;

    const info = readQueueMethod(button);
    if (!info || !info.value) {
      pending = null;
      return;
    }

    pending = info;
    queueMicrotask(() => {
      if (!applyToOpenModal()) {
        setTimeout(applyToOpenModal, 0);
      }
    });
  }, true);

  // Recovery for modal rendering timing differences.
  const observer = new MutationObserver(() => {
    if (pending) applyToOpenModal();
  });

  function startObserver() {
    const root = document.querySelector("#modalBackdrop") || document.body;
    if (!root) return;
    observer.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }

  window.DPRO_SALES63_ACTIVITY_METHOD = Object.freeze({
    version: VERSION,
  });
})();
