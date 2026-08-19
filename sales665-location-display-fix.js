/*
 * DPRO SALESNAVI V66.5
 * Version: SALESNAVI-66.5-LOCATION-DISPLAY-FIX-20260819
 *
 * Fix:
 * - Current location acquisition was successful but the acquired point was not obvious.
 * - In current-location mode, the Sales Area field now visibly says "現在地を使用中".
 * - After location acquisition, latitude / longitude / accuracy are displayed directly below Sales Area.
 * - A Google Maps confirmation link is shown.
 * - Office/custom modes restore normal address behavior.
 *
 * No Worker / SQL / DB change.
 */
(() => {
  "use strict";

  const VERSION = "SALESNAVI-66.5-LOCATION-DISPLAY-FIX-20260819";
  const OFFICE_ADDRESS = "福岡県糟屋郡志免町田富1-17-7";
  const CURRENT_LABEL = "現在地を使用中";
  let latest = null;
  let acquiring = false;

  const $ = (s, r = document) => r.querySelector(s);

  function isCurrentMode() {
    return $("#sales662OriginCurrent")?.classList.contains("active") === true;
  }
  function isOfficeMode() {
    return $("#sales662OriginOffice")?.classList.contains("active") === true;
  }
  function isCustomMode() {
    return $("#sales662OriginCustom")?.classList.contains("active") === true;
  }

  function ensureStyle() {
    if ($("#sales665Style")) return;
    const style = document.createElement("style");
    style.id = "sales665Style";
    style.textContent = `
      #searchArea.sales665-current-area{
        background:#edf9f4!important;
        color:#087553!important;
        border-color:#9ed2bd!important;
        font-weight:850!important;
        opacity:1!important;
      }
      .sales665-location-display{
        margin:-8px 0 16px;
        padding:11px 12px;
        border:1px solid #b8dfcf;
        background:#f5fcf9;
        border-radius:11px;
        display:none;
      }
      .sales665-location-display.show{display:block}
      .sales665-location-display .title{
        font-size:12px;
        font-weight:850;
        color:#087553;
        margin-bottom:5px;
      }
      .sales665-location-display .detail{
        font-size:12px;
        line-height:1.65;
        color:#425a6f;
      }
      .sales665-location-display .detail strong{
        color:#173c5b;
      }
      .sales665-location-display .actions{
        margin-top:8px;
        display:flex;
        gap:7px;
        flex-wrap:wrap;
      }
      .sales665-location-display a,
      .sales665-location-display button{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        border:1px solid #9bcfba;
        background:#fff;
        color:#087553;
        border-radius:9px;
        padding:7px 10px;
        font:inherit;
        font-size:11px;
        font-weight:850;
        text-decoration:none;
        cursor:pointer;
      }
      .sales665-location-display .warning{
        margin-top:6px;
        font-size:11px;
        line-height:1.55;
        color:#7b6a37;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureDisplay() {
    let box = $("#sales665LocationDisplay");
    if (box) return box;

    const area = $("#searchArea");
    const field = area?.closest(".field");
    if (!field) return null;

    box = document.createElement("div");
    box.id = "sales665LocationDisplay";
    box.className = "sales665-location-display";
    box.innerHTML = `
      <div class="title">📍 使用する現在地</div>
      <div id="sales665LocationDetail" class="detail">現在地を取得すると、ここに取得位置が表示されます。</div>
      <div class="actions">
        <a id="sales665MapLink" href="#" target="_blank" rel="noopener">Google Mapsで現在地を確認</a>
        <button id="sales665Reacquire" type="button">現在地を再取得</button>
      </div>
      <div class="warning">※ PCではGPS・Wi-Fi等から位置を推定するため、精度は端末や環境により変わります。</div>
    `;
    field.insertAdjacentElement("afterend", box);

    $("#sales665Reacquire")?.addEventListener("click", () => acquireAndDisplay(true));
    return box;
  }

  function setAreaCurrent() {
    const area = $("#searchArea");
    if (!area || !isCurrentMode()) return;

    if (area.value && area.value !== CURRENT_LABEL && area.value !== OFFICE_ADDRESS) {
      area.dataset.sales665Custom = area.value;
    }
    area.value = CURRENT_LABEL;
    area.placeholder = CURRENT_LABEL;
    area.readOnly = true;
    area.required = false;
    area.classList.add("sales665-current-area");
  }

  function restoreArea() {
    const area = $("#searchArea");
    if (!area || isCurrentMode()) return;

    area.classList.remove("sales665-current-area");

    if (isOfficeMode()) {
      area.value = OFFICE_ADDRESS;
      area.readOnly = true;
      area.required = true;
      return;
    }

    if (isCustomMode()) {
      area.readOnly = false;
      area.required = true;
      if (area.value === CURRENT_LABEL || area.value === OFFICE_ADDRESS) {
        area.value = area.dataset.sales665Custom || "";
      }
    }
  }

  function showLocation(pos) {
    if (!pos?.coords) return;

    latest = {
      latitude: Number(pos.coords.latitude),
      longitude: Number(pos.coords.longitude),
      accuracy: Number(pos.coords.accuracy || 0)
    };

    const box = ensureDisplay();
    const detail = $("#sales665LocationDetail");
    const link = $("#sales665MapLink");
    if (!box || !detail || !link) return;

    box.classList.add("show");

    const accuracyText = latest.accuracy > 0
      ? `精度 約${Math.round(latest.accuracy)}m`
      : "精度情報なし";

    detail.innerHTML =
      `<strong>緯度 ${latest.latitude.toFixed(5)} ／ 経度 ${latest.longitude.toFixed(5)}</strong><br>` +
      `${accuracyText}　— この地点を中心に営業先を検索します。`;

    link.href =
      `https://www.google.com/maps?q=${encodeURIComponent(latest.latitude + "," + latest.longitude)}`;

    setAreaCurrent();

    const status = $("#sales662LocationStatus");
    if (status) {
      status.textContent = `現在地を取得しました／${accuracyText}`;
      status.classList.add("ok");
    }
  }

  function showError(message) {
    const box = ensureDisplay();
    const detail = $("#sales665LocationDetail");
    if (box && detail) {
      box.classList.add("show");
      detail.textContent = message;
    }
  }

  function acquireAndDisplay(force = false) {
    if (acquiring) return;
    if (!navigator.geolocation) {
      showError("このブラウザは現在地取得に対応していません。");
      return;
    }
    if (!window.isSecureContext) {
      showError("現在地取得にはHTTPS接続が必要です。");
      return;
    }

    acquiring = true;
    setAreaCurrent();

    const status = $("#sales662LocationStatus");
    if (status) status.textContent = "現在地を取得しています…";

    navigator.geolocation.getCurrentPosition(
      pos => {
        acquiring = false;
        showLocation(pos);
      },
      err => {
        acquiring = false;
        let msg = "現在地を取得できませんでした。";
        if (err?.code === 1) msg = "位置情報が許可されていません。ブラウザで位置情報を許可してください。";
        else if (err?.code === 2) msg = "現在地を判定できませんでした。Wi-Fiや位置情報サービスを確認してください。";
        else if (err?.code === 3) msg = "現在地の取得がタイムアウトしました。もう一度お試しください。";
        showError(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: force ? 0 : 60000
      }
    );
  }

  function bind() {
    const locate = $("#sales662Locate");
    if (locate && locate.dataset.sales665Bound !== "1") {
      locate.dataset.sales665Bound = "1";
      locate.addEventListener("click", () => {
        // V66.2 also acquires location. This second acquisition guarantees
        // that the visible coordinate panel is populated on every browser.
        setTimeout(() => acquireAndDisplay(true), 30);
      });
    }

    const current = $("#sales662OriginCurrent");
    if (current && current.dataset.sales665Bound !== "1") {
      current.dataset.sales665Bound = "1";
      current.addEventListener("click", () => {
        setTimeout(() => {
          setAreaCurrent();
          ensureDisplay();
          if (latest) {
            $("#sales665LocationDisplay")?.classList.add("show");
          }
        }, 0);
      });
    }

    for (const selector of ["#sales662OriginOffice", "#sales662OriginCustom"]) {
      const btn = $(selector);
      if (btn && btn.dataset.sales665Bound !== "1") {
        btn.dataset.sales665Bound = "1";
        btn.addEventListener("click", () => {
          setTimeout(() => {
            restoreArea();
            $("#sales665LocationDisplay")?.classList.remove("show");
          }, 0);
        });
      }
    }
  }

  function process() {
    ensureStyle();
    ensureDisplay();
    bind();

    if (isCurrentMode()) setAreaCurrent();
    else restoreArea();

    // If V66.2 already reports success but coordinates are not visible,
    // automatically perform one visible acquisition.
    const status = $("#sales662LocationStatus")?.textContent || "";
    const boxVisible = $("#sales665LocationDisplay")?.classList.contains("show");
    if (isCurrentMode() && status.includes("現在地を取得しました") && !latest && !boxVisible && !acquiring) {
      setTimeout(() => acquireAndDisplay(false), 80);
    }
  }

  function start() {
    process();
    const observer = new MutationObserver(process);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.documentElement.dataset.sales665 = VERSION;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
