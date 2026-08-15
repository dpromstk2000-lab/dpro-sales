/**
 * DPRO SALESNAVI V65.5
 * Version: SALESNAVI-65.5-PET-CARE-CENTRAL-MATERIAL-20260815
 *
 * Purpose:
 * Safely map the official SalesNavi product label
 *   "DPRO PET CARE LINE"
 * to the verified central product-site system
 *   VET / 動物病院
 * when V61 cannot resolve the English product label.
 *
 * Scope:
 * - Detail drawer sales-material display only.
 * - Makes the correct VET proposal LP/material links available.
 * - Does NOT infer from the store/business name.
 * - Does NOT mutate DB/activities/queue/follow-up.
 * - No Worker change. No SQL change.
 */
(() => {
  "use strict";

  const VERSION = "SALESNAVI-65.5-PET-CARE-CENTRAL-MATERIAL-20260815";
  const PRODUCT_BASE = "https://dpromstk2000-lab.github.io/dpro-line-systems-site/";
  const VET = Object.freeze({
    code: "VET",
    officialLabel: "DPRO PET CARE LINE",
    proposal: PRODUCT_BASE + "lp-vet.html",
    flyer: PRODUCT_BASE + "flyer-vet.html",
    pdf: PRODUCT_BASE + "flyer-vet.pdf",
    demo: "https://dpromstk2000-lab.github.io/DPRO-VET-QR/today-board.html?clinic_code=dpro_vet_demo&demo=ready&v=vet-today-board-1",
    product: PRODUCT_BASE + "systems/pet-care.html",
    all: PRODUCT_BASE + "proposal.html?source=salesnavi&code=VET#proposals"
  });

  if (window.__DPRO_SALES655_PET_CARE_MATERIAL__) return;

  function norm(value) {
    return String(value || "")
      .normalize("NFKC")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function isPetCareOfficialLabel(text) {
    return norm(text).includes(VET.officialLabel);
  }

  function findMaterialBox(drawer) {
    if (!drawer) return null;
    const boxes = [...drawer.querySelectorAll(".detail-box")];
    return boxes.find(box => /③\s*営業素材/.test(String(box.textContent || ""))) || null;
  }

  function detailHasOfficialPetCare(drawer) {
    if (!drawer) return false;
    const text = String(drawer.textContent || "");
    return isPetCareOfficialLabel(text);
  }

  function link(label, url, cls = "btn btn-outline btn-sm") {
    const a = document.createElement("a");
    a.className = cls;
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = label;
    return a;
  }

  function ensureStyle() {
    if (document.querySelector("#sales655Style")) return;
    const style = document.createElement("style");
    style.id = "sales655Style";
    style.textContent = `
      .sales655-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:9px}
      .sales655-head h4{margin:0;font-size:15px;color:#4d6277}
      .sales655-ok{display:inline-flex;align-items:center;border:1px solid #a8ddca;background:#f2fbf7;color:#087553;border-radius:999px;padding:4px 8px;font-size:9px;font-weight:850}
      .sales655-official{margin:0 0 9px;padding:9px 11px;border:1px solid #bfe6d8;background:#f5fcf9;border-radius:10px;font-size:11px;color:#46675d}
      .sales655-official b{color:#087553}
      .sales655-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
      .sales655-actions .sales655-proposal{background:#0e8d67!important;border-color:#0e8d67!important;color:#fff!important}
      .sales655-actions .sales655-flyer{background:#fff8e9!important;border-color:#edc979!important;color:#885a05!important}
      .sales655-actions .sales655-demo{background:#eef6ff!important;border-color:#b8d5f3!important;color:#1765ad!important}
      .sales655-note{margin:8px 0 0;color:#66798b;font-size:10px;line-height:1.55}
    `;
    document.head.appendChild(style);
  }

  function renderPetCareMaterials(box) {
    if (!box || box.dataset.sales655PetCare === "1") return false;

    box.innerHTML = "";

    const head = document.createElement("div");
    head.className = "sales655-head";
    const h4 = document.createElement("h4");
    h4.textContent = "③ 営業素材";
    const badge = document.createElement("span");
    badge.className = "sales655-ok";
    badge.textContent = "中央素材 VET 確認済み";
    head.append(h4, badge);

    const official = document.createElement("div");
    official.className = "sales655-official";
    official.append("正式割当商品：");
    const b = document.createElement("b");
    b.textContent = VET.officialLabel;
    official.appendChild(b);

    const actions = document.createElement("div");
    actions.className = "sales655-actions";
    actions.append(
      link("提案LP", VET.proposal, "btn btn-sm sales655-proposal"),
      link("A4チラシ", VET.flyer, "btn btn-sm sales655-flyer"),
      link("PDF", VET.pdf),
      link("LIVE DEMO", VET.demo, "btn btn-sm sales655-demo"),
      link("PRODUCT", VET.product),
      link("すべて見る", VET.all)
    );

    const note = document.createElement("p");
    note.className = "sales655-note";
    note.textContent = "正式商品 DPRO PET CARE LINE を中央マスター VET（動物病院）へ固定対応。店舗名から業種推測は行いません。";

    box.append(head, official, actions, note);
    box.dataset.sales655PetCare = "1";
    return true;
  }

  function markVersionBadge() {
    document.querySelectorAll("#sales65Command .sales65-title span").forEach(el => {
      el.textContent = "V65.5";
      el.title = VERSION;
    });
  }

  function enhance() {
    ensureStyle();
    const drawer = document.querySelector("#drawerBody");
    if (!drawer || !detailHasOfficialPetCare(drawer)) {
      markVersionBadge();
      return;
    }

    const box = findMaterialBox(drawer);
    if (box) renderPetCareMaterials(box);
    markVersionBadge();
  }

  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(enhance, 50);
  }

  function init() {
    enhance();
    const body = document.querySelector("#drawerBody") || document.documentElement;
    if (body && typeof MutationObserver === "function") {
      new MutationObserver(schedule).observe(body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.__DPRO_SALES655_PET_CARE_MATERIAL__ = true;
  window.DPRO_SALES655 = Object.freeze({ version: VERSION, centralCode: VET.code });
})();
