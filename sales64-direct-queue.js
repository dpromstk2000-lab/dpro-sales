/**
 * DPRO SALESNAVI V64
 * Version: SALESNAVI-64-R1-QUEUE-SPINNER-FIX-20260814
 *
 * GitHub-side fixes:
 * 1) Registered prospect detail -> "今日の営業へ追加" direct button.
 * 2) Explicit sales method selection: 訪問 / 電話 / LINE / メール.
 * 3) Selected method is persisted in the existing queue notes field.
 *    No DB schema change is required.
 * 4) Queue UI restores the persisted method after reload.
 *    V63 then hands the visible method to "営業結果を記録".
 * 5) Google Places import success becomes a persistent green confirmation banner.
 */
(() => {
  "use strict";

  const VERSION = "SALESNAVI-64-R1-QUEUE-SPINNER-FIX-20260814";
  const ACTIVE = new Set(["queued", "planned", "in_progress"]);
  const METHODS = Object.freeze({
    visit: "訪問",
    phone: "電話",
    line: "LINE",
    email: "メール",
  });
  const MARKER_RE = /\[DPRO-SALES-METHOD:(visit|phone|line|email)\]/i;
  const HUMAN_METHOD_RE = /^営業手段:\s*(訪問|電話|LINE|メール)\s*$/gmi;

  let queueCache = [];
  let queueLoadedAt = 0;
  let queueLoadPromise = null;
  let queueRefreshTimer = null;
  let applyingQueueMethods = false;

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
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const obj = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return `${obj.year}-${obj.month}-${obj.day}`;
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
      cache: "no-store",
    });

    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || data.error || `APIエラー (${res.status})`);
    }
    return data;
  }

  function showToast(message, type = "success") {
    const stack = document.querySelector("#toastStack");
    if (stack) {
      const el = document.createElement("div");
      el.className = `toast ${type}`;
      el.textContent = message;
      stack.appendChild(el);
      setTimeout(() => el.remove(), 4800);
      return;
    }
    console[type === "error" ? "error" : "log"](`[V64] ${message}`);
  }

  function escapeHtml(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function readMethod(notes) {
    const hit = String(notes || "").match(MARKER_RE);
    return hit && METHODS[hit[1].toLowerCase()] ? hit[1].toLowerCase() : "";
  }

  function mergeMethodNotes(notes, method) {
    const label = METHODS[method];
    let rest = String(notes || "")
      .replace(MARKER_RE, "")
      .replace(HUMAN_METHOD_RE, "")
      .replace(/^\s+|\s+$/g, "")
      .replace(/\n{3,}/g, "\n\n");
    const head = `[DPRO-SALES-METHOD:${method}]\n営業手段: ${label}`;
    return rest ? `${head}\n${rest}`.slice(0, 5000) : head;
  }

  function prospectNameFromDrawer() {
    return document.querySelector("#drawerBody .detail-hero h2")?.textContent?.trim() || "この営業先";
  }

  async function loadQueue(force = false) {
    if (!token()) return [];
    const age = Date.now() - queueLoadedAt;
    if (!force && queueCache.length && age < 15000) return queueCache;
    if (!force && queueLoadPromise) return queueLoadPromise;

    queueLoadPromise = request(`/api/sales-queue?date=${encodeURIComponent(todayJst())}`)
      .then(d => {
        queueCache = Array.isArray(d.queueItems) ? d.queueItems : [];
        queueLoadedAt = Date.now();
        return queueCache;
      })
      .finally(() => { queueLoadPromise = null; });

    return queueLoadPromise;
  }

  function activeQueueItem(items, prospectId) {
    return (items || [])
      .filter(q => q?.prospect_id === prospectId && ACTIVE.has(String(q.queue_status || "queued")))
      .sort((a, b) => Number(a.queue_order || 99999) - Number(b.queue_order || 99999))[0] || null;
  }

  function methodLabel(method) {
    return METHODS[method] || "未確認";
  }

  function setMethodInContainer(container, label) {
    if (!container) return;
    [...container.querySelectorAll(".sales1110-meta > div")].forEach(block => {
      const span = block.querySelector("span");
      const b = block.querySelector("b");
      if (span?.textContent?.trim() === "営業手段" && b) {
        // V64-R1: only mutate the DOM when the visible value actually changes.
        // The queue MutationObserver watches childList changes, so writing the
        // same text repeatedly can retrigger the observer forever and leave
        // the native loading overlay spinning.
        if (b.textContent?.trim() !== label) {
          b.textContent = label;
        }
        if (b.dataset.sales64Method !== "1") {
          b.dataset.sales64Method = "1";
        }
      }
    });
  }

  function applyQueueMethodsFromCache() {
    if (!queueCache.length || applyingQueueMethods) return;
    applyingQueueMethods = true;
    try {
      queueCache.forEach(q => {
        const method = readMethod(q.notes);
        if (!method) return;
        const label = methodLabel(method);
        document.querySelectorAll(`[data-queue-id="${q.id}"]`).forEach(el => {
          const container = el.closest(".sales1110-next, .queue-card");
          setMethodInContainer(container, label);
        });
      });
    } finally {
      applyingQueueMethods = false;
    }
  }

  function queueViewVisible() {
    return document.querySelector("#view-queue")?.classList.contains("active");
  }

  function scheduleQueueRefresh(force = false) {
    clearTimeout(queueRefreshTimer);
    queueRefreshTimer = setTimeout(async () => {
      if (!queueViewVisible()) return;
      try {
        await loadQueue(force);
        applyQueueMethodsFromCache();
      } catch (e) {
        console.warn("[V64] queue method refresh:", e);
      }
    }, 180);
  }

  function ensureStyle() {
    if (document.querySelector("#sales64Style")) return;
    const style = document.createElement("style");
    style.id = "sales64Style";
    style.textContent = `
      .sales64-queue-btn{background:#0b8060!important;color:#fff!important;border:1px solid #0b8060!important}
      .sales64-modal{position:fixed;inset:0;z-index:10050;background:rgba(15,35,61,.58);display:grid;place-items:center;padding:20px}
      .sales64-card{width:min(520px,100%);background:#fff;border-radius:20px;box-shadow:0 30px 90px rgba(0,0,0,.28);overflow:hidden;border:1px solid #dce6ee}
      .sales64-head{padding:20px 22px 14px;border-bottom:1px solid #e5ebf0}
      .sales64-head h3{margin:0 0 6px;font-size:20px;color:#162337}.sales64-head p{margin:0;color:#68778c;font-size:12px;line-height:1.6}
      .sales64-body{padding:20px 22px}.sales64-field{display:grid;gap:7px;margin-bottom:16px}.sales64-field label{font-size:12px;font-weight:800;color:#40526a}
      .sales64-field select{width:100%;min-height:48px;border:1px solid #cbd7e2;border-radius:11px;padding:10px 12px;background:#fff}
      .sales64-note{padding:11px 12px;border-radius:11px;background:#f2faf7;border:1px solid #c6e7da;font-size:12px;line-height:1.65;color:#315d4e}
      .sales64-check{display:flex;align-items:center;gap:8px;margin-top:14px;font-size:12px;color:#52647b}
      .sales64-foot{padding:14px 22px 20px;display:flex;justify-content:flex-end;gap:9px}
      .sales64-import-banner{margin:10px 0 14px;padding:13px 14px;border:1px solid #9ed9c3;background:#eefaf5;border-radius:12px;color:#185d49;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;line-height:1.6}
      .sales64-import-banner strong{display:block;color:#087553;font-size:13px}
      @media(max-width:640px){.sales64-modal{padding:10px}.sales64-foot{display:grid;grid-template-columns:1fr 1fr}.sales64-foot .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function closeModal64() {
    document.querySelector("#sales64Modal")?.remove();
  }

  async function openModal64(prospectId) {
    ensureStyle();
    let items = [];
    try { items = await loadQueue(true); } catch {}
    const existing = activeQueueItem(items, prospectId);
    const existingMethod = existing ? readMethod(existing.notes) : "";
    const name = prospectNameFromDrawer();

    closeModal64();
    const overlay = document.createElement("div");
    overlay.id = "sales64Modal";
    overlay.className = "sales64-modal";
    overlay.innerHTML = `
      <div class="sales64-card" role="dialog" aria-modal="true" aria-labelledby="sales64Title">
        <div class="sales64-head">
          <h3 id="sales64Title">${existing ? "今日の営業・営業手段を設定" : "今日の営業へ追加"}</h3>
          <p>${escapeHtml(name)}</p>
        </div>
        <form id="sales64Form">
          <div class="sales64-body">
            <input type="hidden" name="prospectId" value="${escapeHtml(prospectId)}">
            <div class="sales64-field">
              <label for="sales64Method">営業手段</label>
              <select id="sales64Method" name="method" required>
                <option value="">営業手段を選択してください</option>
                <option value="visit" ${existingMethod === "visit" ? "selected" : ""}>訪問</option>
                <option value="phone" ${existingMethod === "phone" ? "selected" : ""}>電話</option>
                <option value="line" ${existingMethod === "line" ? "selected" : ""}>LINE</option>
                <option value="email" ${existingMethod === "email" ? "selected" : ""}>メール</option>
              </select>
            </div>
            <div class="sales64-note">
              ${existing
                ? "この営業先は今日の営業キューに入っています。ここでは営業手段を正しく保存できます。"
                : "実際に使う営業手段を選んでから追加します。選択した営業手段は、結果記録画面にも引き継がれます。"}
            </div>
            <label class="sales64-check">
              <input type="checkbox" name="openQueue" checked>
              保存後に営業キューを開く
            </label>
          </div>
          <div class="sales64-foot">
            <button type="button" class="btn btn-secondary" data-sales64-cancel>キャンセル</button>
            <button type="submit" class="btn btn-primary">${existing ? "営業手段を保存" : "今日の営業へ追加"}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", e => {
      if (e.target === overlay || e.target.closest("[data-sales64-cancel]")) closeModal64();
    });

    overlay.querySelector("#sales64Form").addEventListener("submit", async e => {
      e.preventDefault();
      const form = e.currentTarget;
      const method = form.method.value;
      const openQueue = form.openQueue.checked;
      if (!METHODS[method]) {
        showToast("営業手段を選択してください。", "error");
        return;
      }

      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = "保存中…";

      try {
        let queue = await loadQueue(true);
        let item = activeQueueItem(queue, prospectId);

        if (!item) {
          await request("/api/sales-queue/enqueue", {
            method: "POST",
            body: {
              prospectIds: [prospectId],
              autoSelect: false,
              queueDate: todayJst(),
              sourceType: "manual",
              limit: 1,
            },
          });
          queue = await loadQueue(true);
          item = activeQueueItem(queue, prospectId);
        }

        if (!item?.id) {
          throw new Error("営業キューへの追加結果を確認できませんでした。");
        }

        await request(`/api/sales-queue/${encodeURIComponent(item.id)}`, {
          method: "PATCH",
          body: {
            notes: mergeMethodNotes(item.notes, method),
          },
        });

        queue = await loadQueue(true);
        applyQueueMethodsFromCache();
        showToast(`${name}：営業手段「${METHODS[method]}」で今日の営業に保存しました。`);
        closeModal64();

        if (openQueue) {
          document.querySelector("#drawerClose")?.click();
          const nav = [...document.querySelectorAll(".nav-btn[data-view]")]
            .find(x => x.textContent.includes("営業キュー"));
          nav?.click();
          setTimeout(() => scheduleQueueRefresh(true), 350);
          setTimeout(() => scheduleQueueRefresh(true), 1100);
        }
      } catch (err) {
        showToast(err.message || "今日の営業へ追加できませんでした。", "error");
        submit.disabled = false;
        submit.textContent = existing ? "営業手段を保存" : "今日の営業へ追加";
      }
    });
  }

  function injectDrawerQueueButton() {
    const body = document.querySelector("#drawerBody");
    if (!body) return;
    const actions = body.querySelector(".detail-hero .detail-actions");
    const record = actions?.querySelector("[data-record-activity]");
    const prospectId = record?.dataset.recordActivity;
    if (!actions || !prospectId) return;

    let btn = actions.querySelector("[data-sales64-direct-queue]");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sales64-queue-btn";
      btn.dataset.sales64DirectQueue = prospectId;
      btn.textContent = "今日の営業へ追加";
      actions.appendChild(btn);
    } else {
      btn.dataset.sales64DirectQueue = prospectId;
    }
  }

  function showImportBanner(message) {
    const summary = document.querySelector("#searchSummary");
    if (!summary) return;
    document.querySelector("#sales64ImportBanner")?.remove();

    const box = document.createElement("div");
    box.id = "sales64ImportBanner";
    box.className = "sales64-import-banner";
    box.innerHTML = `
      <div><strong>営業先への登録が完了しました</strong>${escapeHtml(message)}。営業パイプラインの店舗詳細から「今日の営業へ追加」できます。</div>
      <button type="button" class="btn btn-primary btn-sm" data-sales64-open-pipeline>営業パイプラインを開く</button>
    `;
    summary.parentElement?.insertBefore(box, summary.nextSibling);
  }

  function observeNativeToasts() {
    const stack = document.querySelector("#toastStack");
    if (!stack) return;
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const text = node.textContent?.trim() || "";
          if (/^\d+件を営業先へ登録しました$/.test(text) && !node.classList.contains("error")) {
            showImportBanner(text);
          }
        }
      }
    });
    observer.observe(stack, { childList: true });
  }

  function bind() {
    ensureStyle();

    document.addEventListener("click", e => {
      const q = e.target.closest("[data-sales64-direct-queue]");
      if (q) {
        e.preventDefault();
        e.stopPropagation();
        openModal64(q.dataset.sales64DirectQueue);
        return;
      }

      if (e.target.closest("[data-sales64-open-pipeline]")) {
        const nav = [...document.querySelectorAll(".nav-btn[data-view]")]
          .find(x => x.textContent.includes("営業パイプライン"));
        nav?.click();
      }

      const navQueue = e.target.closest(".nav-btn[data-view]");
      if (navQueue && navQueue.textContent.includes("営業キュー")) {
        scheduleQueueRefresh(true);
      }

      if (e.target.closest("#queueReload")) {
        scheduleQueueRefresh(true);
      }
    }, true);

    const drawer = document.querySelector("#drawerBody");
    if (drawer) {
      new MutationObserver(() => injectDrawerQueueButton())
        .observe(drawer, { childList: true, subtree: true });
      injectDrawerQueueButton();
    }

    const next = document.querySelector("#sales1110Next");
    const list = document.querySelector("#queueList");
    const queueObserver = new MutationObserver(() => {
      applyQueueMethodsFromCache();
      if (queueViewVisible() && !queueCache.length) scheduleQueueRefresh(false);
    });
    if (next) queueObserver.observe(next, { childList: true, subtree: true });
    if (list) queueObserver.observe(list, { childList: true, subtree: true });

    observeNativeToasts();

    if (queueViewVisible()) scheduleQueueRefresh(true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }

  window.DPRO_SALES64 = Object.freeze({
    version: VERSION,
    readMethod,
  });
})();
