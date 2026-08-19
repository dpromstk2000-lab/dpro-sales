/*
 * DPRO SALESNAVI V66.2
 * Version: SALESNAVI-66.2-CURRENT-LOCATION-SEARCH-20260819
 *
 * Purpose:
 * - PC / notebook can search from the device's CURRENT location.
 * - Keep office and arbitrary-address search as fallbacks.
 * - Reuse the existing DPRO SALES Worker center/radiusM support.
 * - No Worker / SQL / DB schema change.
 *
 * Search origin modes:
 *   current : browser Geolocation -> Worker center + radiusM, areaText is blank
 *   office  : DPRO office address -> normal area text search
 *   custom  : user-entered address -> normal area text search
 *
 * Current-location results:
 * - Google Places search itself uses the existing Worker distance preference.
 * - Candidate latitude/longitude returned by Worker are used to show straight-line distance.
 * - The visible list is sorted by straight-line distance, then DPRO priority/score.
 * - "現在地からルート" opens Google Maps directions.
 */
(() => {
  "use strict";

  const VERSION = "SALESNAVI-66.2-CURRENT-LOCATION-SEARCH-20260819";
  const CFG = window.DPRO_CONFIG || {};
  const OFFICE_ADDRESS = "福岡県糟屋郡志免町田富1-17-7";
  const BASE_KEY = `${CFG.sessionStorageKey || "dpro_sales_session"}_v662_origin_mode`;
  const RADIUS_KEY = `${CFG.sessionStorageKey || "dpro_sales_session"}_v662_radius_m`;
  const CUSTOM_KEY = `${CFG.sessionStorageKey || "dpro_sales_session"}_v662_custom_address`;

  let originMode = safeGet(BASE_KEY) || "current";
  let currentPosition = null;
  let positionPromise = null;
  let lastSearchPayload = null;
  let lastSearchResponse = null;
  let observer = null;
  let processing = false;

  const nativeFetch = window.fetch.bind(window);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function safeGet(key) {
    try { return localStorage.getItem(key) || ""; } catch { return ""; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, String(value ?? "")); } catch {}
  }
  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }
  function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  function normalizeMode(v) {
    return ["current", "office", "custom"].includes(v) ? v : "current";
  }
  function selectedRadius() {
    const el = $("#sales662Radius");
    return Number(el?.value || safeGet(RADIUS_KEY) || 5000);
  }

  function locationErrorMessage(error) {
    if (!error) return "現在地を取得できませんでした。";
    if (error.code === 1) return "位置情報が許可されていません。ブラウザの位置情報を許可してください。";
    if (error.code === 2) return "現在地を判定できませんでした。Wi-Fiなどの位置情報サービスを確認してください。";
    if (error.code === 3) return "現在地の取得がタイムアウトしました。もう一度お試しください。";
    return "現在地を取得できませんでした。";
  }

  function setLocationStatus(text, kind = "") {
    const el = $("#sales662LocationStatus");
    if (!el) return;
    el.textContent = text;
    el.className = `sales662-location-status ${kind}`.trim();
  }

  async function acquireCurrentPosition(force = false) {
    if (!navigator.geolocation) {
      throw new Error("このブラウザでは現在地取得に対応していません。");
    }
    if (!window.isSecureContext) {
      throw new Error("現在地取得にはHTTPS接続が必要です。");
    }
    if (currentPosition && !force) return currentPosition;
    if (positionPromise && !force) return positionPromise;

    setLocationStatus("現在地を取得しています…", "loading");

    positionPromise = new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        pos => {
          currentPosition = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy || 0),
            capturedAt: Date.now()
          };
          const acc = currentPosition.accuracy
            ? `／精度 約${currentPosition.accuracy}m`
            : "";
          setLocationStatus(`現在地を取得しました${acc}`, "ok");
          resolve(currentPosition);
        },
        error => {
          const message = locationErrorMessage(error);
          setLocationStatus(message, "error");
          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: force ? 0 : 60000
        }
      );
    }).finally(() => {
      positionPromise = null;
    });

    return positionPromise;
  }

  function ensureStyle() {
    if ($("#sales662Style")) return;
    const style = document.createElement("style");
    style.id = "sales662Style";
    style.textContent = `
      .sales662-origin{
        margin:0 0 15px;padding:12px;border:1px solid #cfe5dc;background:#f6fbf9;border-radius:14px
      }
      .sales662-origin-title{font-size:11px;font-weight:850;color:#526779;margin-bottom:8px}
      .sales662-origin-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
      .sales662-origin-btn{
        border:1px solid #cfdae3;background:#fff;color:#334b63;border-radius:11px;padding:9px 10px;
        font:inherit;font-size:10px;font-weight:850;cursor:pointer;text-align:left;line-height:1.35
      }
      .sales662-origin-btn small{display:block;font-size:8px;font-weight:650;color:#7a8998;margin-top:3px;line-height:1.45}
      .sales662-origin-btn.active{
        border-color:#50ad89;background:#eaf8f2;color:#087553;box-shadow:0 0 0 2px rgba(19,138,102,.07)
      }
      .sales662-origin-btn.active small{color:#4e7466}
      .sales662-current-tools{
        display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:7px;margin-top:9px;align-items:end
      }
      .sales662-current-box{border:1px solid #d8e5df;background:#fff;border-radius:10px;padding:9px}
      .sales662-current-box b{display:block;font-size:10px;color:#334b63}
      .sales662-location-status{display:block;margin-top:4px;font-size:9px;color:#788798;line-height:1.45}
      .sales662-location-status.ok{color:#087553}.sales662-location-status.error{color:#b23642}
      .sales662-location-status.loading{color:#1765ad}
      .sales662-locate{
        margin-top:7px;border:1px solid #a9d7c5;background:#f1fbf7;color:#087553;border-radius:9px;
        padding:7px 9px;font:inherit;font-size:9px;font-weight:850;cursor:pointer
      }
      .sales662-radius label{display:block;font-size:9px;font-weight:800;color:#617184;margin-bottom:5px}
      .sales662-radius select{
        width:100%;border:1px solid #ccd7e2;background:#fff;border-radius:10px;padding:9px 8px;
        color:#334b63;font:inherit;font-size:10px
      }
      .sales662-origin-note{
        margin-top:8px;font-size:9px;line-height:1.55;color:#6f7f90
      }
      .sales662-place-note{
        margin:7px 0 0;padding:8px 10px;border:1px solid #dce7e1;background:#fbfdfc;border-radius:10px;
        color:#67798a;font-size:9px;line-height:1.55
      }
      .sales662-distance{
        display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:5px 7px;
        background:#eaf8f2;color:#087553;border:1px solid #bfe1d3;font-size:9px;font-weight:900;white-space:nowrap
      }
      .sales662-rank{
        display:inline-grid;place-items:center;min-width:28px;height:28px;border-radius:9px;
        background:#e8f6f1;color:#087553;font-size:10px;font-weight:900
      }
      .sales662-rank.top{background:#0e8d67;color:#fff}
      .sales662-route{
        margin-top:5px!important;border-color:#9fd9c4!important;background:#f2fbf7!important;
        color:#087553!important;text-decoration:none!important
      }
      .sales662-result-toolbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-right:4px}
      .sales662-result-toolbar button{
        border:1px solid #cfe0d9;background:#f4fbf8;color:#087553;border-radius:9px;
        padding:8px 10px;font:inherit;font-size:10px;font-weight:850;cursor:pointer
      }
      .sales662-result-toolbar button.primary{background:#0e8d67;border-color:#0e8d67;color:#fff}
      .sales662-area-muted{opacity:.64}
      @media(max-width:760px){
        .sales662-origin-grid{grid-template-columns:1fr}
        .sales662-current-tools{grid-template-columns:1fr}
        .sales662-result-toolbar{width:100%;margin:7px 0 0}
        .sales662-result-toolbar button{flex:1}
      }
    `;
    document.head.appendChild(style);
  }

  function buildOriginPanel() {
    if ($("#sales662OriginPanel")) return true;
    const form = $("#placesSearchForm");
    if (!form) return false;

    const panel = document.createElement("div");
    panel.id = "sales662OriginPanel";
    panel.className = "sales662-origin";
    panel.innerHTML = `
      <div class="sales662-origin-title">どの地点を基準に探しますか？</div>
      <div class="sales662-origin-grid">
        <button id="sales662OriginCurrent" class="sales662-origin-btn" type="button">
          📍 現在地から探す
          <small>外出先のPC・スマホの位置を使用</small>
        </button>
        <button id="sales662OriginOffice" class="sales662-origin-btn" type="button">
          🏢 DPRO事務所から
          <small>志免町田富1-17-7を基準</small>
        </button>
        <button id="sales662OriginCustom" class="sales662-origin-btn" type="button">
          ✏️ 住所を指定
          <small>任意の地域・住所の周辺を検索</small>
        </button>
      </div>
      <div id="sales662CurrentTools" class="sales662-current-tools">
        <div class="sales662-current-box">
          <b>現在地</b>
          <span id="sales662LocationStatus" class="sales662-location-status">検索時に現在地を取得します。</span>
          <button id="sales662Locate" class="sales662-locate" type="button">現在地を今すぐ取得</button>
        </div>
        <div class="sales662-radius">
          <label for="sales662Radius">検索の目安範囲</label>
          <select id="sales662Radius">
            <option value="2000">約2km</option>
            <option value="5000">約5km</option>
            <option value="10000">約10km</option>
            <option value="20000">約20km</option>
          </select>
        </div>
      </div>
      <div id="sales662OriginNote" class="sales662-origin-note"></div>
    `;

    const modeNote = $("#sales66ModeNote");
    if (modeNote) modeNote.insertAdjacentElement("afterend", panel);
    else form.prepend(panel);

    const radius = $("#sales662Radius");
    radius.value = String(Number(safeGet(RADIUS_KEY) || 5000));
    radius.addEventListener("change", () => safeSet(RADIUS_KEY, radius.value));

    $("#sales662OriginCurrent").addEventListener("click", () => setOriginMode("current"));
    $("#sales662OriginOffice").addEventListener("click", () => setOriginMode("office"));
    $("#sales662OriginCustom").addEventListener("click", () => setOriginMode("custom"));
    $("#sales662Locate").addEventListener("click", async () => {
      try { await acquireCurrentPosition(true); } catch {}
    });

    // V66 switches between area-search and direct-store-search.
    // Reapply origin settings after either mode button is clicked.
    $("#sales66ModeArea")?.addEventListener("click", () => setTimeout(() => setOriginMode(originMode, false), 0));
    $("#sales66ModeDirect")?.addEventListener("click", () => setTimeout(() => setOriginMode(originMode, false), 0));

    setOriginMode(normalizeMode(originMode), false);
    return true;
  }

  function setOriginMode(next, persist = true) {
    originMode = normalizeMode(next);
    if (persist) safeSet(BASE_KEY, originMode);

    const area = $("#searchArea");
    const currentTools = $("#sales662CurrentTools");
    const note = $("#sales662OriginNote");
    if (!area) return;

    $("#sales662OriginCurrent")?.classList.toggle("active", originMode === "current");
    $("#sales662OriginOffice")?.classList.toggle("active", originMode === "office");
    $("#sales662OriginCustom")?.classList.toggle("active", originMode === "custom");

    if (originMode === "current") {
      area.required = false;
      area.readOnly = true;
      area.classList.add("sales662-area-muted");
      area.placeholder = "現在地検索では入力不要";
      currentTools?.classList.remove("hidden");
      if (note) note.innerHTML = "<b>現在地モード：</b> 検索ボタンを押すと位置情報の許可確認が出ます。取得位置を中心にGoogle Placesを距離優先で検索します。";
    } else if (originMode === "office") {
      if (!area.dataset.sales662CustomSaved && area.value.trim() && area.value.trim() !== OFFICE_ADDRESS) {
        area.dataset.sales662CustomSaved = area.value.trim();
      }
      area.value = OFFICE_ADDRESS;
      area.required = true;
      area.readOnly = true;
      area.classList.add("sales662-area-muted");
      area.placeholder = OFFICE_ADDRESS;
      currentTools?.classList.add("hidden");
      if (note) note.innerHTML = `<b>事務所モード：</b> ${esc(OFFICE_ADDRESS)} 周辺を住所指定で検索します。`;
    } else {
      area.required = true;
      area.readOnly = false;
      area.classList.remove("sales662-area-muted");
      const saved = area.dataset.sales662CustomSaved || safeGet(CUSTOM_KEY);
      if (area.value.trim() === OFFICE_ADDRESS || !area.value.trim()) {
        area.value = saved || "";
      }
      area.placeholder = "例：福岡県糟屋郡宇美町／博多駅周辺";
      currentTools?.classList.add("hidden");
      if (note) note.innerHTML = "<b>住所指定モード：</b> 下の「営業エリア」に町名・駅名・住所などを入力してください。";
      setTimeout(() => area.focus(), 0);
    }
  }

  function buildResultToolbar() {
    if ($("#sales662ResultToolbar")) return true;
    const results = $("#searchResults");
    const panel = results?.closest(".panel");
    const head = panel?.querySelector(".panel-head");
    const actions = head?.querySelector(".head-actions");
    if (!head || !actions) return false;

    const bar = document.createElement("div");
    bar.id = "sales662ResultToolbar";
    bar.className = "sales662-result-toolbar";
    bar.innerHTML = `
      <button id="sales662SortNear" type="button">近い順に並べる</button>
      <button id="sales662SelectTop5" class="primary" type="button">近い5件を選択</button>
    `;
    actions.insertAdjacentElement("beforebegin", bar);

    $("#sales662SortNear").addEventListener("click", () => decorateCurrentResults(true));
    $("#sales662SelectTop5").addEventListener("click", selectTop5);
    return true;
  }

  function searchUrl(input) {
    try {
      if (input instanceof Request) return input.url || "";
      return String(input || "");
    } catch { return ""; }
  }

  async function prepareSearchBody(original) {
    const body = { ...original };
    const area = $("#searchArea");

    if (originMode === "current") {
      const pos = await acquireCurrentPosition(false);
      body.center = { latitude: pos.latitude, longitude: pos.longitude };
      body.radiusM = selectedRadius();
      body.areaText = "";
      lastSearchPayload = {
        mode: "current",
        center: body.center,
        radiusM: body.radiusM,
        originLabel: "現在地"
      };
    } else if (originMode === "office") {
      body.areaText = OFFICE_ADDRESS;
      delete body.center;
      delete body.radiusM;
      lastSearchPayload = {
        mode: "office",
        center: null,
        radiusM: null,
        originLabel: OFFICE_ADDRESS
      };
    } else {
      const value = area?.value.trim() || "";
      if (!value) throw new Error("営業エリアまたは住所を入力してください。");
      safeSet(CUSTOM_KEY, value);
      body.areaText = value;
      delete body.center;
      delete body.radiusM;
      lastSearchPayload = {
        mode: "custom",
        center: null,
        radiusM: null,
        originLabel: value
      };
    }
    return body;
  }

  // Patch fetch instead of changing the existing Sales Navi business logic.
  // The original owner.html search/import state remains untouched.
  window.fetch = async function(input, init) {
    const url = searchUrl(input);
    let nextInit = init;

    if (url.includes("/api/places/search") && String(init?.method || "GET").toUpperCase() === "POST") {
      try {
        const originalBody = typeof init?.body === "string" ? JSON.parse(init.body) : null;
        if (originalBody && typeof originalBody === "object") {
          const body = await prepareSearchBody(originalBody);
          nextInit = { ...init, body: JSON.stringify(body) };
        }
      } catch (error) {
        throw error;
      }
    }

    const response = await nativeFetch(input, nextInit);

    if (url.includes("/api/places/search")) {
      try {
        response.clone().json().then(data => {
          if (!data || !Array.isArray(data.results)) return;
          lastSearchResponse = data;
          window.dispatchEvent(new CustomEvent("dpro:sales662-search-results", { detail: data }));
        }).catch(() => {});
      } catch {}
    }

    return response;
  };

  function haversineM(aLat, aLng, bLat, bLng) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const p1 = toRad(aLat);
    const p2 = toRad(bLat);
    const h = Math.sin(dLat / 2) ** 2
      + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function formatDistance(m) {
    if (!Number.isFinite(m)) return "—";
    if (m < 1000) return `直線 ${Math.max(10, Math.round(m / 10) * 10)}m`;
    return `直線 ${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`;
  }

  function gradeWeight(text) {
    const t = String(text || "").toUpperCase();
    if (/優先度\s*A/.test(t) || /^\s*A\s*$/.test(t)) return 0;
    if (/優先度\s*B/.test(t) || /^\s*B\s*$/.test(t)) return 1;
    if (/優先度\s*C/.test(t) || /^\s*C\s*$/.test(t)) return 2;
    return 3;
  }

  function routeUrl(destination) {
    const params = new URLSearchParams({ api: "1", destination, travelmode: "driving" });

    if (lastSearchPayload?.mode === "current" && lastSearchPayload.center) {
      params.set(
        "origin",
        `${lastSearchPayload.center.latitude},${lastSearchPayload.center.longitude}`
      );
    } else if (lastSearchPayload?.originLabel) {
      params.set("origin", lastSearchPayload.originLabel);
    }
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  function resultByPlaceId() {
    const map = new Map();
    for (const r of lastSearchResponse?.results || []) {
      if (r?.place_id) map.set(String(r.place_id), r);
    }
    return map;
  }

  function clearInjected(table) {
    table.querySelectorAll("[data-sales662-head]").forEach(x => x.remove());
    table.querySelectorAll("[data-sales662-cell]").forEach(x => x.remove());
    table.querySelectorAll(".sales662-route").forEach(x => {
      const prev = x.previousElementSibling;
      x.remove();
      if (prev?.tagName === "BR" && prev.dataset.sales662Br === "1") prev.remove();
    });
  }

  function decorateCurrentResults(forceSort = false) {
    if (processing) return;
    const table = $("#searchResults table.data-table");
    if (!table || !lastSearchResponse) return;

    processing = true;
    try {
      clearInjected(table);
      const head = table.querySelector("thead tr");
      const tbody = table.querySelector("tbody");
      if (!head || !tbody) return;

      const byId = resultByPlaceId();
      let rows = [...tbody.querySelectorAll("tr")].map(row => {
        const checkbox = row.querySelector(".result-check");
        const placeId = String(checkbox?.value || "");
        const data = byId.get(placeId) || {};
        const lat = num(data.latitude, NaN);
        const lng = num(data.longitude, NaN);
        let distanceM = NaN;

        if (
          lastSearchPayload?.mode === "current"
          && lastSearchPayload.center
          && Number.isFinite(lat)
          && Number.isFinite(lng)
        ) {
          distanceM = haversineM(
            lastSearchPayload.center.latitude,
            lastSearchPayload.center.longitude,
            lat,
            lng
          );
        }

        const priorityText = row.cells[1]?.textContent || "";
        const score = num(data.total_score, 0);
        const name = data.business_name || row.querySelector(".business-cell strong")?.textContent || "";
        return {
          row, data, placeId, lat, lng, distanceM,
          grade: gradeWeight(priorityText),
          score,
          name: String(name)
        };
      });

      const distanceHead = document.createElement("th");
      distanceHead.dataset.sales662Head = "distance";
      distanceHead.textContent = "距離";
      const rankHead = document.createElement("th");
      rankHead.dataset.sales662Head = "rank";
      rankHead.textContent = "営業順";

      const priorityHead = head.children[1];
      if (priorityHead) {
        priorityHead.insertAdjacentElement("afterend", rankHead);
        priorityHead.insertAdjacentElement("afterend", distanceHead);
      }

      for (const meta of rows) {
        const distanceTd = document.createElement("td");
        distanceTd.dataset.sales662Cell = "distance";
        distanceTd.innerHTML = lastSearchPayload?.mode === "current"
          ? `<span class="sales662-distance">${esc(formatDistance(meta.distanceM))}</span>`
          : `<span style="font-size:9px;color:#8a98a7">住所基準</span>`;

        const rankTd = document.createElement("td");
        rankTd.dataset.sales662Cell = "rank";
        rankTd.innerHTML = `<span class="sales662-rank">—</span>`;

        const priorityCell = meta.row.children[1];
        if (priorityCell) {
          priorityCell.insertAdjacentElement("afterend", rankTd);
          priorityCell.insertAdjacentElement("afterend", distanceTd);
        }

        const mapCell = meta.row.lastElementChild;
        if (mapCell) {
          let dest = "";
          if (Number.isFinite(meta.lat) && Number.isFinite(meta.lng)) {
            dest = `${meta.lat},${meta.lng}`;
          } else {
            dest = meta.data.formatted_address || meta.name;
          }
          if (dest) {
            const br = document.createElement("br");
            br.dataset.sales662Br = "1";
            const link = document.createElement("a");
            link.className = "btn btn-outline btn-sm sales662-route";
            link.href = routeUrl(dest);
            link.target = "_blank";
            link.rel = "noopener";
            link.textContent = lastSearchPayload?.mode === "current"
              ? "現在地からルート"
              : "ここからルート";
            mapCell.appendChild(br);
            mapCell.appendChild(link);
          }
        }
      }

      if (lastSearchPayload?.mode === "current") {
        rows.sort((a, b) => {
          const ad = Number.isFinite(a.distanceM) ? a.distanceM : Number.POSITIVE_INFINITY;
          const bd = Number.isFinite(b.distanceM) ? b.distanceM : Number.POSITIVE_INFINITY;
          // Primary objective: efficient nearby sales.
          if (ad !== bd) return ad - bd;
          // Tie breakers: DPRO priority and existing score.
          if (a.grade !== b.grade) return a.grade - b.grade;
          if (a.score !== b.score) return b.score - a.score;
          return a.name.localeCompare(b.name, "ja");
        });
        rows.forEach(m => tbody.appendChild(m.row));
      } else if (forceSort) {
        // Address-based modes intentionally keep Google's relevance order.
      }

      [...tbody.querySelectorAll("tr")].forEach((row, i) => {
        const rank = row.querySelector('[data-sales662-cell="rank"] .sales662-rank');
        if (rank) {
          rank.textContent = `#${i + 1}`;
          rank.classList.toggle("top", i < 5);
        }
      });

      addSearchNote();
      updateToolbarLabels();
    } finally {
      processing = false;
    }
  }

  function addSearchNote() {
    const summary = $("#searchSummary");
    if (!summary) return;
    let note = $("#sales662PlaceNote");
    if (!note) {
      note = document.createElement("div");
      note.id = "sales662PlaceNote";
      note.className = "sales662-place-note";
      summary.insertAdjacentElement("afterend", note);
    }
    if (lastSearchPayload?.mode === "current") {
      const radiusKm = Math.round((lastSearchPayload.radiusM || 5000) / 1000);
      note.textContent =
        `現在地基準：Google Placesへ現在地を渡して距離優先検索。表示距離は店舗座標までの直線距離です（目安範囲 約${radiusKm}km）。`;
    } else {
      note.textContent =
        "住所基準：入力した住所・地域を検索語に含めたGoogle Places検索です。距離表示は行いません。";
    }
  }

  function updateToolbarLabels() {
    const near = $("#sales662SortNear");
    const top = $("#sales662SelectTop5");
    const isCurrent = lastSearchPayload?.mode === "current";
    if (near) {
      near.textContent = isCurrent ? "近い順に並べる" : "Google順を維持";
      near.disabled = !isCurrent;
    }
    if (top) top.textContent = isCurrent ? "近い5件を選択" : "上位5件を選択";
  }

  function selectTop5() {
    decorateCurrentResults(true);
    const rows = $$("#searchResults table.data-table tbody tr");
    let count = 0;
    for (const row of rows) {
      const check = row.querySelector(".result-check");
      if (!check || check.disabled || check.checked) continue;
      check.checked = true;
      check.dispatchEvent(new Event("change", { bubbles: true }));
      count++;
      if (count >= 5) break;
    }
    if (!count) {
      const btn = $("#sales662SelectTop5");
      if (btn) {
        const old = btn.textContent;
        btn.textContent = "選択できる新規候補なし";
        setTimeout(() => { btn.textContent = old; }, 1600);
      }
    }
  }

  function bindAreaPersistence() {
    const area = $("#searchArea");
    if (!area || area.dataset.sales662Bound === "1") return;
    area.dataset.sales662Bound = "1";
    area.addEventListener("change", () => {
      if (originMode === "custom" && area.value.trim()) {
        safeSet(CUSTOM_KEY, area.value.trim());
        area.dataset.sales662CustomSaved = area.value.trim();
      }
    });
  }

  function build() {
    ensureStyle();
    const ok1 = buildOriginPanel();
    const ok2 = buildResultToolbar();
    bindAreaPersistence();
    return ok1 && ok2;
  }

  function processDom() {
    build();
    if (lastSearchResponse) decorateCurrentResults(false);
  }

  window.addEventListener("dpro:sales662-search-results", () => {
    setTimeout(() => decorateCurrentResults(true), 0);
    setTimeout(() => decorateCurrentResults(true), 120);
  });

  function start() {
    processDom();
    observer = new MutationObserver(() => {
      if (processing) return;
      processDom();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.documentElement.dataset.sales662 = VERSION;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
