/*
 * DPRO SALESNAVI V66
 * Version: SALESNAVI-66-REAL-SALES-SEARCH-BRUSHUP-20260819
 *
 * Purpose:
 * - Make "候補を探す" usable for real sales work.
 * - Keep the existing Google Places API / import flow untouched.
 * - Add two clear search modes:
 *   1) 周辺からまとめて探す
 *   2) 店舗名で直接探す
 * - Remember the last sales area locally for repeated nearby prospecting.
 *
 * No Worker change. No SQL change. No data-model change.
 */
(() => {
  "use strict";

  const VERSION = "SALESNAVI-66-REAL-SALES-SEARCH-BRUSHUP-20260819";
  const CFG = window.DPRO_CONFIG || {};
  const AREA_KEY = `${CFG.sessionStorageKey || "dpro_sales_session"}_search_last_area_v66`;
  const MODE_KEY = `${CFG.sessionStorageKey || "dpro_sales_session"}_search_mode_v66`;

  let mode = "area";
  let areaQueryDraft = "";
  let built = false;

  const $ = (s, r = document) => r.querySelector(s);

  function safeGet(key) {
    try { return localStorage.getItem(key) || ""; } catch { return ""; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, String(value || "")); } catch {}
  }

  function ensureStyle() {
    if ($("#sales66Style")) return;
    const style = document.createElement("style");
    style.id = "sales66Style";
    style.textContent = `
      .sales66-mode-card{
        border:1px solid #cfe5dc;background:#f5fbf8;border-radius:14px;padding:11px;margin-bottom:15px
      }
      .sales66-mode-label{font-size:11px;font-weight:800;color:#526779;margin-bottom:8px}
      .sales66-mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .sales66-mode-btn{
        border:1px solid #cfdae3;background:#fff;color:#334b63;border-radius:11px;padding:10px 9px;
        font:inherit;font-size:11px;font-weight:800;cursor:pointer;text-align:left;line-height:1.35
      }
      .sales66-mode-btn small{display:block;font-size:9px;font-weight:600;color:#7b8998;margin-top:3px;line-height:1.45}
      .sales66-mode-btn.active{border-color:#58b18f;background:#eaf8f2;color:#087553;box-shadow:0 0 0 2px rgba(19,138,102,.07)}
      .sales66-mode-btn.active small{color:#4f7568}
      .sales66-direct-field{margin-bottom:17px}
      .sales66-area-helper{margin:-7px 0 15px;display:flex;gap:7px;align-items:center;flex-wrap:wrap}
      .sales66-area-helper button{border:1px solid #d1dce5;background:#fff;color:#496075;border-radius:999px;padding:6px 9px;font:inherit;font-size:9px;font-weight:800;cursor:pointer}
      .sales66-area-helper span{font-size:9px;color:#7b8998;line-height:1.4}
      .sales66-mode-note{margin:0 0 13px;padding:9px 11px;border:1px solid #d8e6df;background:#f8fcfa;border-radius:10px;color:#536b61;font-size:10px;line-height:1.6}
      .sales66-mode-note b{color:#087553}
      .sales66-direct-hint{display:block;margin-top:6px;color:#7a8998;font-size:9px;line-height:1.55}
      .sales66-hidden{display:none!important}
      @media(max-width:640px){.sales66-mode-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function setFieldLabel(field, text) {
    const label = field?.querySelector("label");
    if (label) label.textContent = text;
  }

  function updatePageLead() {
    const p = $("#view-search .page-head p");
    if (!p) return;
    p.textContent = mode === "direct"
      ? "店舗名が分かっている場合は、店名と地域を指定してGoogle Placesから直接探します。"
      : "DPRO商品と地域を選び、周辺の営業候補をGoogle Placesからまとめて探します。";
  }

  function updateModeNote() {
    const note = $("#sales66ModeNote");
    if (!note) return;
    note.innerHTML = mode === "direct"
      ? "<b>店舗名検索：</b> 店名が分かっている営業先を探すモードです。DPRO商品は、検索後の提案LP・優先度判定に使用します。"
      : "<b>周辺検索：</b> 地域内の新しい営業候補をまとめて発掘するモードです。まず20件程度から試す使い方に向いています。";
  }

  function applyMode(nextMode, { persist = true } = {}) {
    mode = nextMode === "direct" ? "direct" : "area";
    if (persist) safeSet(MODE_KEY, mode);

    const storeField = $("#sales66StoreField");
    const queryField = $("#searchQuery")?.closest(".field");
    const productField = $("#searchProduct")?.closest(".field");
    const areaField = $("#searchArea")?.closest(".field");
    const max = $("#searchMax");
    const pages = $("#searchPages");
    const query = $("#searchQuery");

    $("#sales66ModeArea")?.classList.toggle("active", mode === "area");
    $("#sales66ModeDirect")?.classList.toggle("active", mode === "direct");

    if (mode === "direct") {
      if (query) areaQueryDraft = query.value || areaQueryDraft;
      storeField?.classList.remove("sales66-hidden");
      queryField?.classList.add("sales66-hidden");
      setFieldLabel(productField, "DPRO商品（提案LP・判定用）");
      setFieldLabel(areaField, "営業エリア（同名店の判別用）");
      if (max) max.value = "10";
      if (pages) pages.value = "1";
    } else {
      storeField?.classList.add("sales66-hidden");
      queryField?.classList.remove("sales66-hidden");
      setFieldLabel(productField, "DPRO商品");
      setFieldLabel(areaField, "営業エリア");
      if (query && query.dataset.sales66DirectValue === "1") {
        query.value = areaQueryDraft;
        delete query.dataset.sales66DirectValue;
      }
    }

    updatePageLead();
    updateModeNote();
  }

  function buildAreaHelper(areaInput) {
    if ($("#sales66AreaHelper")) return;
    const helper = document.createElement("div");
    helper.id = "sales66AreaHelper";
    helper.className = "sales66-area-helper";

    const lastArea = safeGet(AREA_KEY);
    if (lastArea) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `前回のエリア：${lastArea}`;
      btn.addEventListener("click", () => {
        areaInput.value = lastArea;
        areaInput.dispatchEvent(new Event("input", { bubbles: true }));
        areaInput.focus();
      });
      helper.appendChild(btn);
    }

    const hint = document.createElement("span");
    hint.textContent = "入力した営業エリアは次回も自動で保持します。";
    helper.appendChild(hint);

    const field = areaInput.closest(".field");
    field?.insertAdjacentElement("afterend", helper);
  }

  function build() {
    if (built || $("#sales66SearchMode")) return true;

    const form = $("#placesSearchForm");
    const product = $("#searchProduct");
    const area = $("#searchArea");
    const query = $("#searchQuery");
    if (!form || !product || !area || !query) return false;

    built = true;
    ensureStyle();

    const modeCard = document.createElement("div");
    modeCard.id = "sales66SearchMode";
    modeCard.className = "sales66-mode-card";
    modeCard.innerHTML = `
      <div class="sales66-mode-label">どうやって営業先を探しますか？</div>
      <div class="sales66-mode-grid">
        <button id="sales66ModeArea" class="sales66-mode-btn" type="button">
          周辺からまとめて探す
          <small>地域 × DPRO商品で新規候補を発掘</small>
        </button>
        <button id="sales66ModeDirect" class="sales66-mode-btn" type="button">
          店舗名で直接探す
          <small>店名が分かっている1店舗を素早く検索</small>
        </button>
      </div>
    `;
    form.prepend(modeCard);

    const storeField = document.createElement("div");
    storeField.id = "sales66StoreField";
    storeField.className = "field sales66-direct-field sales66-hidden";
    storeField.innerHTML = `
      <label for="sales66StoreName">店舗名</label>
      <input id="sales66StoreName" autocomplete="off" placeholder="例：美容室 ナチュラ 志免">
      <small class="sales66-direct-hint">Googleマップ等で見つけた店舗名をそのまま入力できます。</small>
    `;

    const areaField = area.closest(".field");
    areaField?.insertAdjacentElement("afterend", storeField);

    const note = document.createElement("div");
    note.id = "sales66ModeNote";
    note.className = "sales66-mode-note";
    modeCard.insertAdjacentElement("afterend", note);

    area.placeholder = "例：福岡県糟屋郡志免町田富";

    const lastArea = safeGet(AREA_KEY);
    if (!area.value.trim() && lastArea) area.value = lastArea;
    buildAreaHelper(area);

    area.addEventListener("change", () => {
      const value = area.value.trim();
      if (value) safeSet(AREA_KEY, value);
    });

    $("#sales66ModeArea").addEventListener("click", () => applyMode("area"));
    $("#sales66ModeDirect").addEventListener("click", () => {
      applyMode("direct");
      setTimeout(() => $("#sales66StoreName")?.focus(), 0);
    });

    form.addEventListener("submit", (event) => {
      const areaValue = area.value.trim();
      if (areaValue) safeSet(AREA_KEY, areaValue);

      if (mode !== "direct") {
        areaQueryDraft = query.value;
        return;
      }

      const store = $("#sales66StoreName");
      const name = store?.value.trim() || "";
      if (!name) {
        event.preventDefault();
        event.stopImmediatePropagation();
        store?.setCustomValidity("店舗名を入力してください");
        store?.reportValidity();
        store?.focus();
        return;
      }

      store.setCustomValidity("");
      query.value = name;
      query.dataset.sales66DirectValue = "1";
      const max = $("#searchMax");
      const pages = $("#searchPages");
      if (max) max.value = "10";
      if (pages) pages.value = "1";
    }, true);

    $("#sales66StoreName")?.addEventListener("input", e => e.target.setCustomValidity(""));

    applyMode(safeGet(MODE_KEY) || "area", { persist: false });

    document.documentElement.dataset.sales66 = VERSION;
    return true;
  }

  function start() {
    if (build()) return;
    const observer = new MutationObserver(() => {
      if (build()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
