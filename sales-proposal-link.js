/* DPRO SALESNAVI-52 — QUICK MATERIAL ACCESS / 2026-08-14
 * 50-system product-site master -> SalesNavi quick materials.
 * Existing SalesNavi business logic/API mutations are not changed.
 */
(() => {
  "use strict";

  const cfg = window.DPRO_CONFIG || {};
  const PRODUCT_BASE = "https://dpromstk2000-lab.github.io/dpro-line-systems-site/";
  const CENTRAL_DATA = PRODUCT_BASE + "systems-data.js?v=20260814";
  const HUB = cfg.proposalHubUrl || (PRODUCT_BASE + "proposal.html");
  const VERSION = "SALESNAVI-52-QUICK-MATERIAL-ACCESS-20260814";
  const MARK = "data-dpro51-materials";
  const LIB_MARK = "data-dpro51-library-link";

  let DATA = null;
  let aliases = [];
  let scheduled = false;
  let centralError = "";

  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));

  const norm = value => String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/dpro|line|systems?|システム|業種別|提案|向け|営業支援|営業ナビ/g, "")
    .replace(/[・･／/（）()【】［］\[\]\s_\-]/g, "");

  const abs = value => {
    if (!value) return "";
    try { return new URL(value, PRODUCT_BASE).href; } catch (_) { return String(value); }
  };

  const proposalUrl = system => `${HUB}?source=salesnavi&code=${encodeURIComponent(system.code)}#proposals`;

  function injectStyle(){
    if (document.getElementById("dpro51-style")) return;
    const style = document.createElement("style");
    style.id = "dpro51-style";
    style.textContent = `
      .dpro51-quick{border-color:#9fd9c4!important;background:#f2fbf7!important;color:#087553!important;text-decoration:none!important}
      .dpro51-recommend{border-color:#f0c26a!important;background:#fff8e9!important;color:#8b5c05!important;text-decoration:none!important}
      .dpro51-library-btn{border:1px solid #d99aae;background:#fff5f8;color:#9f1740;border-radius:11px;padding:9px 12px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
      .dpro51-central-strip{margin-top:10px;padding:10px 12px;border:1px solid #cfe7dc;background:#f5fcf9;border-radius:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:11px;color:#426658}
      .dpro51-central-strip b{color:#087553}.dpro51-central-strip .dpro51-spacer{flex:1}
      #dpro51Overlay{position:fixed;inset:0;z-index:10050;background:rgba(8,24,39,.54);display:none;align-items:center;justify-content:center;padding:18px}
      #dpro51Overlay.open{display:flex}
      #dpro51Panel{width:min(980px,100%);max-height:min(90vh,900px);overflow:hidden;background:#f6f9fb;border-radius:24px;box-shadow:0 28px 80px rgba(0,0,0,.32);display:flex;flex-direction:column;color:#17283d}
      .dpro51-head{padding:18px 20px;background:linear-gradient(135deg,#102b48,#17634f);color:#fff;display:flex;align-items:flex-start;gap:14px}
      .dpro51-head-main{min-width:0;flex:1}.dpro51-head small{display:block;color:#b9d5d0;font-size:10px;font-weight:800;letter-spacing:.09em}.dpro51-head h2{font-size:22px;margin:5px 0 3px}.dpro51-head p{font-size:11px;color:#d6e7e4;margin:0;line-height:1.6}
      .dpro51-close{width:42px;height:42px;border:1px solid rgba(255,255,255,.25);border-radius:12px;background:rgba(255,255,255,.1);color:#fff;font-size:23px;cursor:pointer}
      .dpro51-body{padding:16px 18px 22px;overflow:auto}
      .dpro51-best{border:2px solid #bfe6d8;background:#fff;border-radius:16px;padding:14px;margin-bottom:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
      .dpro51-best div{flex:1;min-width:210px}.dpro51-best small{display:block;color:#748497;font-size:10px}.dpro51-best b{display:block;color:#087553;font-size:16px;margin-top:3px}
      .dpro51-resource-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .dpro51-resource{background:#fff;border:1px solid #dce5ed;border-radius:15px;padding:14px;text-decoration:none;color:#263950;display:block;min-height:88px}
      .dpro51-resource:hover{border-color:#8bcbb4;box-shadow:0 7px 20px rgba(15,35,61,.08)}.dpro51-resource strong{display:block;font-size:13px}.dpro51-resource small{display:block;font-size:10px;color:#718195;margin-top:5px;line-height:1.5}
      .dpro51-resource.primary{background:#f1fbf7;border-color:#acdcca}.dpro51-resource.demo{background:#eef6ff;border-color:#b8d5f3}.dpro51-resource.flyer{background:#fff8e9;border-color:#edd39d}
      .dpro51-copyrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.dpro51-copyrow button{border:1px solid #ccd8e4;background:#fff;color:#263950;border-radius:11px;padding:10px 12px;font:inherit;font-size:11px;font-weight:800;cursor:pointer}
      .dpro51-search{width:100%;border:1px solid #cbd8e3;background:#fff;border-radius:13px;padding:12px 14px;font:inherit;font-size:14px;outline:none;margin-bottom:12px}.dpro51-search:focus{border-color:#2a9676;box-shadow:0 0 0 3px rgba(42,150,118,.13)}
      .dpro51-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .dpro51-system{background:#fff;border:1px solid #dce5ed;border-radius:15px;padding:13px}.dpro51-system-head{display:flex;gap:9px;align-items:center}.dpro51-code{font-size:9px;background:#e8f6f1;color:#087553;border-radius:999px;padding:4px 7px;font-weight:900}.dpro51-system h3{font-size:14px;margin:0}.dpro51-system p{font-size:10px;color:#718195;line-height:1.55;margin:7px 0 10px}.dpro51-mini-actions{display:flex;gap:6px;flex-wrap:wrap}.dpro51-mini-actions a,.dpro51-mini-actions button{border:1px solid #d3dee7;background:#fff;color:#334b63;border-radius:9px;padding:7px 9px;text-decoration:none;font:inherit;font-size:10px;font-weight:800;cursor:pointer}
      .dpro51-sync{background:#fff;border:1px solid #dce5ed;border-radius:17px;padding:15px;margin:0 0 18px}.dpro51-sync h2{font-size:15px;margin:0 0 10px}.dpro51-sync-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.dpro51-sync-box{background:#f4f8fa;border-radius:11px;padding:10px}.dpro51-sync-box span{display:block;font-size:9px;color:#718195}.dpro51-sync-box b{display:block;font-size:17px;margin-top:4px;color:#087553}.dpro51-sync-note{font-size:10px;color:#718195;line-height:1.6;margin-top:9px}
      .dpro52-top-material{border-color:#9fd9c4!important;background:#f2fbf7!important;color:#087553!important;font-weight:850!important}
      .dpro52-dashboard-material{border-color:#9fd9c4!important;background:#f2fbf7!important;color:#087553!important}
      @media(max-width:760px){#dpro51Overlay{padding:0;align-items:flex-end}#dpro51Panel{width:100%;max-height:92dvh;border-radius:22px 22px 0 0}.dpro51-resource-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dpro51-list{grid-template-columns:1fr}.dpro51-sync-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function loadCentral(){
    if (window.DPROSystemsData?.systems?.length) {
      DATA = window.DPROSystemsData;
      return Promise.resolve(DATA);
    }
    return new Promise((resolve, reject) => {
      const old = document.querySelector('script[data-dpro51-central]');
      if (old) {
        const wait = setInterval(() => {
          if (window.DPROSystemsData?.systems?.length) {
            clearInterval(wait);
            DATA = window.DPROSystemsData;
            resolve(DATA);
          }
        }, 50);
        setTimeout(() => { clearInterval(wait); reject(new Error("central data timeout")); }, 8000);
        return;
      }
      const s = document.createElement("script");
      s.src = CENTRAL_DATA;
      s.async = true;
      s.dataset.dpro51Central = "1";
      s.onload = () => {
        if (window.DPROSystemsData?.systems?.length) {
          DATA = window.DPROSystemsData;
          resolve(DATA);
        } else reject(new Error("central data unavailable"));
      };
      s.onerror = () => reject(new Error("central data load failed"));
      document.head.appendChild(s);
    });
  }

  function buildAliases(){
    aliases = [];
    (DATA?.systems || []).forEach(system => {
      const values = new Set([
        system.code, system.name, system.assetSlug,
        ...(system.targets || [])
      ].filter(Boolean));
      if (system.code === "CONSULT") values.add("社労士");
      if (system.code === "KSH") values.add("車検");
      if (system.code === "PETSALON") values.add("ペットサロン");
      if (system.code === "SALESNAVI") values.add("営業ナビ");
      values.forEach(value => {
        const key = norm(value);
        if (key) aliases.push({key, system, raw:String(value)});
      });
    });
    aliases.sort((a,b) => b.key.length - a.key.length);
  }

  function systemByCode(code){
    if (!DATA) return null;
    return DATA.getByCode ? DATA.getByCode(code) : (DATA.systems || []).find(s => s.code === String(code || "").toUpperCase()) || null;
  }

  function matchSystem(root){
    if (!root || !DATA) return null;
    const attrs = ["data-product-code","data-code","data-system-code","data-product"];
    for (const a of attrs) {
      const code = root.getAttribute?.(a);
      const hit = systemByCode(code);
      if (hit) return hit;
    }
    const codeNode = root.querySelector?.(".sales17-code,[data-product-code],[data-code]");
    if (codeNode) {
      const hit = systemByCode(codeNode.getAttribute("data-product-code") || codeNode.getAttribute("data-code") || codeNode.textContent);
      if (hit) return hit;
    }
    const text = norm(root.textContent || "");
    if (!text) return null;

    // Product codes are safest when visibly present.
    for (const s of (DATA.systems || [])) {
      const raw = String(root.textContent || "").toUpperCase();
      if (new RegExp(`(^|[^A-Z0-9])${s.code.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}([^A-Z0-9]|$)`).test(raw)) return s;
    }
    for (const item of aliases) if (item.key.length >= 2 && text.includes(item.key)) return item.system;
    return null;
  }

  function resourceSet(system){
    return {
      proposal:{label:"業種別提案", url:proposalUrl(system), note:"LP・チラシ・DEMOをまとめて確認"},
      lp:{label:"提案LP", url:abs(system.lpUrl), note:"画面で見せる・URL送付向け"},
      flyer:{label:"A4チラシ", url:abs(system.flyerHtml), note:"初回訪問・その場で見せる"},
      pdf:{label:"チラシPDF", url:abs(system.flyerPdf), note:"保存・印刷・共有向け"},
      demo:{label:"LIVE DEMO", url:abs(system.demoUrl), note:"興味あり・商談時に操作を見せる"},
      product:{label:"PRODUCT", url:abs(system.systemPage), note:"機能・特徴を詳しく確認"}
    };
  }

  function recommend(system, contextText=""){
    const r = resourceSet(system);
    const t = String(contextText || "");
    if (/LINE営業|送れる|問い合わせ|メール|Instagram|返信待ち/.test(t) && r.lp.url) return {...r.lp, key:"lp", why:"送付しやすい提案LP"};
    if (/商談|返信あり|デモ案内|demo_sent|meeting/.test(t) && r.demo.url) return {...r.demo, key:"demo", why:"興味が進んだ段階なのでDEMO"};
    if (/オーナーと会話|contacted|資料手渡し|material_delivered/.test(t) && r.lp.url) return {...r.lp, key:"lp", why:"接触後の確認に提案LP"};
    if (/見積|検討|considering|quote|契約/.test(t) && r.proposal.url) return {...r.proposal, key:"proposal", why:"検討段階なので提案一式"};
    if (r.flyer.url) return {...r.flyer, key:"flyer", why:"初回営業はA4チラシが最短"};
    if (r.lp.url) return {...r.lp, key:"lp", why:"提案LP"};
    return {...r.proposal, key:"proposal", why:"業種別提案"};
  }

  function ensureOverlay(){
    let overlay = document.getElementById("dpro51Overlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "dpro51Overlay";
    overlay.innerHTML = `<section id="dpro51Panel" role="dialog" aria-modal="true" aria-label="営業素材"><div id="dpro51PanelInner"></div></section>`;
    overlay.addEventListener("click", e => { if (e.target === overlay) closeOverlay(); });
    document.body.appendChild(overlay);
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeOverlay(); });
    return overlay;
  }

  function closeOverlay(){
    const o = document.getElementById("dpro51Overlay");
    if (o) o.classList.remove("open");
    document.documentElement.style.overflow = "";
  }

  function openOverlayHtml(html){
    const o = ensureOverlay();
    o.querySelector("#dpro51PanelInner").innerHTML = html;
    o.classList.add("open");
    document.documentElement.style.overflow = "hidden";
    o.querySelector("[data-dpro51-close]")?.addEventListener("click", closeOverlay);
  }

  async function copyText(text, label="コピーしました"){
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showMiniToast(label);
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); showMiniToast(label); } catch (_) {}
      ta.remove();
    }
  }

  function showMiniToast(text){
    let el = document.getElementById("dpro51Toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "dpro51Toast";
      el.style.cssText = "position:fixed;z-index:10150;left:50%;bottom:26px;transform:translateX(-50%);background:#102b48;color:white;padding:11px 15px;border-radius:999px;font:700 12px system-ui;box-shadow:0 10px 30px rgba(0,0,0,.24)";
      document.body.appendChild(el);
    }
    el.textContent = text; el.style.display = "block";
    clearTimeout(el._timer); el._timer = setTimeout(() => el.style.display = "none", 1800);
  }

  function resourceCard(key, item){
    if (!item.url) return "";
    const cls = key === "lp" ? " primary" : key === "demo" ? " demo" : (key === "flyer" || key === "pdf") ? " flyer" : "";
    return `<a class="dpro51-resource${cls}" href="${esc(item.url)}" target="_blank" rel="noopener"><strong>${esc(item.label)} ↗</strong><small>${esc(item.note)}</small></a>`;
  }

  function openSystem(system, contextText=""){
    if (!system) return openLibrary();
    const r = resourceSet(system), best = recommend(system, contextText);
    const shareText = [
      `【DPRO ${system.name}】`,
      r.lp.url ? `提案LP：${r.lp.url}` : "",
      r.flyer.url ? `A4チラシ：${r.flyer.url}` : "",
      r.demo.url ? `LIVE DEMO：${r.demo.url}` : ""
    ].filter(Boolean).join("\n");
    openOverlayHtml(`
      <div class="dpro51-head"><div class="dpro51-head-main"><small>${esc(system.code)} / CENTRAL MATERIAL</small><h2>${esc(system.name)}</h2><p>商品サイトの中央マスターから営業素材を直接開きます。</p></div><button class="dpro51-close" data-dpro51-close aria-label="閉じる">×</button></div>
      <div class="dpro51-body">
        <div class="dpro51-best"><div><small>NEXT BEST MATERIAL</small><b>${esc(best.label)} — ${esc(best.why)}</b></div><a class="dpro51-library-btn" href="${esc(best.url)}" target="_blank" rel="noopener">今これを開く ↗</a></div>
        <div class="dpro51-resource-grid">
          ${resourceCard("proposal",r.proposal)}
          ${resourceCard("lp",r.lp)}
          ${resourceCard("flyer",r.flyer)}
          ${resourceCard("pdf",r.pdf)}
          ${resourceCard("demo",r.demo)}
          ${resourceCard("product",r.product)}
        </div>
        <div class="dpro51-copyrow">
          ${r.lp.url ? `<button type="button" data-copy="${esc(r.lp.url)}">提案LP URLコピー</button>` : ""}
          ${r.flyer.url ? `<button type="button" data-copy="${esc(r.flyer.url)}">A4 URLコピー</button>` : ""}
          ${r.demo.url ? `<button type="button" data-copy="${esc(r.demo.url)}">DEMO URLコピー</button>` : ""}
          <button type="button" data-copy="${esc(shareText)}">営業3点セットをコピー</button>
        </div>
      </div>`);
    document.querySelectorAll("#dpro51Panel [data-copy]").forEach(btn => btn.addEventListener("click", () => copyText(btn.getAttribute("data-copy"), "営業素材をコピーしました")));
  }

  function libraryItem(system){
    const r = resourceSet(system);
    return `<article class="dpro51-system" data-dpro51-lib-item data-search="${esc(norm([system.code,system.name,...(system.targets||[])].join(" ")))}"><div class="dpro51-system-head"><span class="dpro51-code">${esc(system.code)}</span><h3>${esc(system.name)}</h3></div><p>${esc(system.tagline || "")}</p><div class="dpro51-mini-actions"><button type="button" data-open-code="${esc(system.code)}">営業素材</button>${r.lp.url?`<a href="${esc(r.lp.url)}" target="_blank" rel="noopener">LP</a>`:""}${r.flyer.url?`<a href="${esc(r.flyer.url)}" target="_blank" rel="noopener">A4</a>`:""}${r.demo.url?`<a href="${esc(r.demo.url)}" target="_blank" rel="noopener">DEMO</a>`:""}</div></article>`;
  }

  function openLibrary(){
    const systems = DATA?.systems || [];
    openOverlayHtml(`
      <div class="dpro51-head"><div class="dpro51-head-main"><small>50 SYSTEMS / CENTRAL MATERIAL LIBRARY</small><h2>営業素材ライブラリ</h2><p>商品サイトの提案LP・A4チラシ・PDF・DEMOをSalesNaviから直接使用します。</p></div><button class="dpro51-close" data-dpro51-close aria-label="閉じる">×</button></div>
      <div class="dpro51-body"><input id="dpro51Search" class="dpro51-search" type="search" placeholder="業種・商品コードで検索"><div class="dpro51-list">${systems.map(libraryItem).join("")}</div></div>`);
    const search = document.getElementById("dpro51Search");
    search?.addEventListener("input", () => {
      const q = norm(search.value);
      document.querySelectorAll("[data-dpro51-lib-item]").forEach(el => el.hidden = Boolean(q) && !String(el.dataset.search || "").includes(q));
    });
    document.querySelectorAll("#dpro51Panel [data-open-code]").forEach(btn => btn.addEventListener("click", () => openSystem(systemByCode(btn.dataset.openCode))));
    setTimeout(() => search?.focus(), 50);
  }

  function makeOpenButton(system, className="dpro51-library-btn", label="営業素材"){
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = label;
    b.dataset.dpro51Open = system.code;
    b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); openSystem(system, b.closest(".queue-card,.sales16-candidate,.sales17-row")?.textContent || ""); });
    return b;
  }

  function makeBestLink(system, context){
    const best = recommend(system, context);
    const a = document.createElement("a");
    a.href = best.url; a.target = "_blank"; a.rel = "noopener";
    a.className = "btn btn-outline btn-sm dpro51-recommend";
    if (document.body.classList.contains("mobile") || document.querySelector(".bottom-nav")) a.className = "btn btn-outline btn-small dpro51-recommend";
    a.textContent = `おすすめ：${best.label}`;
    a.title = best.why;
    return a;
  }

  function enhanceQueueCards(){
    document.querySelectorAll(".queue-card").forEach(card => {
      if (card.getAttribute(MARK) === "1") return;
      const actions = card.querySelector(".queue-buttons,.queue-actions");
      if (!actions) return;
      const system = matchSystem(card);
      if (!system) return;
      actions.appendChild(makeBestLink(system, card.textContent || ""));
      actions.appendChild(makeOpenButton(system, actions.classList.contains("queue-actions") ? "btn btn-outline btn-small dpro51-quick" : "btn btn-outline btn-sm dpro51-quick"));
      actions.setAttribute("data-dpro51-expanded", "1");
      if (actions.classList.contains("queue-actions")) actions.style.gridTemplateColumns = "repeat(2,minmax(0,1fr))";
      card.setAttribute(MARK, "1");
    });
  }

  function enhanceSalesCandidates(){
    document.querySelectorAll(".sales16-candidate").forEach(card => {
      if (card.getAttribute(MARK) === "1") return;
      const actions = card.querySelector(".sales16-actions");
      const system = matchSystem(card);
      if (!actions || !system) return;
      const r = resourceSet(system);
      if (r.lp.url) {
        const a = document.createElement("a");
        a.className = "btn btn-outline btn-sm dpro51-recommend";
        a.href = r.lp.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = "提案LP";
        actions.appendChild(a);
      }
      actions.appendChild(makeOpenButton(system, "btn btn-outline btn-sm dpro51-quick"));
      card.setAttribute(MARK, "1");
    });
  }

  function enhanceMaterialRows(){
    document.querySelectorAll(".sales17-row").forEach(row => {
      if (row.getAttribute(MARK) === "1") return;
      const system = matchSystem(row);
      if (!system) return;
      const r = resourceSet(system);
      const count = [r.lp.url,r.flyer.url,r.pdf.url,r.demo.url,r.product.url].filter(Boolean).length;
      const strip = document.createElement("div");
      strip.className = "dpro51-central-strip";
      strip.innerHTML = `<b>中央素材 ${count}/5</b><span>商品サイト連携済み</span><span class="dpro51-spacer"></span>`;
      strip.appendChild(makeOpenButton(system, "dpro51-library-btn", "中央素材を開く"));
      row.appendChild(strip);
      row.setAttribute(MARK, "1");
    });
  }

  function addDesktopNav(){
    const nav = document.querySelector(".nav");
    if (!nav || nav.querySelector(`[${LIB_MARK}]`)) return;
    const label = document.createElement("div");
    label.className = "nav-label"; label.textContent = "PRODUCT SITE"; label.setAttribute(LIB_MARK,"label");
    const b = document.createElement("button");
    b.className = "nav-btn"; b.type = "button"; b.setAttribute(LIB_MARK,"1");
    b.innerHTML = '<span class="nav-icon">▣</span><span>営業素材ライブラリ</span>';
    b.addEventListener("click", openLibrary);
    nav.append(label,b);
  }

  function addTopShortcut(){
    const actions = document.querySelector(".top-actions");
    if (!actions || actions.querySelector("[data-dpro52-top-material]")) return;

    const isStaff = Boolean(document.querySelector(".bottom-nav"));
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("data-dpro52-top-material","1");

    if (isStaff) {
      b.className = "icon-btn";
      b.title = "営業素材";
      b.setAttribute("aria-label","営業素材ライブラリ");
      b.textContent = "▣";
      b.style.color = "#087553";
    } else {
      /* PC / iPad: icon only was too hard to understand, so use a labeled button. */
      const oldIcon = actions.querySelector('[data-dpro51-library-link]');
      if (oldIcon) oldIcon.remove();
      b.className = "btn btn-outline btn-sm dpro52-top-material";
      b.textContent = "▣ 営業素材";
      b.title = "50業種の提案LP・A4チラシ・DEMO";
    }

    b.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      openLibrary();
    });
    actions.insertBefore(b, actions.firstChild);
  }

  function addDashboardShortcut(){
    const actions = document.querySelector("#view-dashboard .page-head .head-actions");
    if (!actions || actions.querySelector("[data-dpro52-dashboard-material]")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-outline dpro52-dashboard-material";
    b.setAttribute("data-dpro52-dashboard-material","1");
    b.textContent = "▣ 営業素材";
    b.title = "50業種の提案LP・A4チラシ・PDF・LIVE DEMO";
    b.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      openLibrary();
    });
    actions.insertBefore(b, actions.firstChild);
  }

  function addIndexCard(){
    const grid = document.querySelector("body .grid");
    if (!grid || grid.querySelector(`[${LIB_MARK}]`)) return;
    const a = document.createElement("a");
    a.href = "#"; a.className = "card"; a.setAttribute(LIB_MARK,"index");
    a.innerHTML = '<div class="icon">▣</div><h2>営業素材ライブラリ</h2><p>50業種の提案LP、A4チラシ、PDF、LIVE DEMOを直接開きます。</p>';
    a.addEventListener("click", e => { e.preventDefault(); openLibrary(); });
    grid.appendChild(a);
  }

  function addSystemCheck(){
    const main = document.querySelector("body main");
    if (!main || !/System Check/i.test(document.title) || document.getElementById("dpro51SystemCheck")) return;
    const systems = DATA?.systems || [];
    const metric = fn => systems.filter(fn).length;
    const dup = systems.length - new Set(systems.map(s => s.code)).size;
    const box = document.createElement("section");
    box.id = "dpro51SystemCheck"; box.className = "dpro51-sync";
    box.innerHTML = `<h2>営業素材・商品サイト中央連携</h2><div class="dpro51-sync-grid">
      <div class="dpro51-sync-box"><span>中央マスター</span><b>${systems.length}</b></div>
      <div class="dpro51-sync-box"><span>提案LP</span><b>${metric(s=>Boolean(s.lpUrl))}/${systems.length}</b></div>
      <div class="dpro51-sync-box"><span>A4 HTML</span><b>${metric(s=>Boolean(s.flyerHtml))}/${systems.length}</b></div>
      <div class="dpro51-sync-box"><span>A4 PDF</span><b>${metric(s=>Boolean(s.flyerPdf))}/${systems.length}</b></div>
      <div class="dpro51-sync-box"><span>LIVE DEMO</span><b>${metric(s=>Boolean(s.demoUrl))}/${systems.length}</b></div>
      <div class="dpro51-sync-box"><span>CODE重複</span><b>${dup}</b></div>
    </div><div class="dpro51-sync-note">商品サイト systems-data.js の登録整合を読み取り専用で確認しています。SalesNavi側の営業データ・活動履歴は変更しません。バージョン：${VERSION}</div>`;
    const note = main.querySelector(".note");
    if (note) note.insertAdjacentElement("afterend", box); else main.prepend(box);
  }

  function replaceOldLabels(){
    const root = document.body; if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes=[]; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const p = node.parentElement;
      if (!p || p.closest("script,style,noscript,#dpro51Overlay")) return;
      let v=node.nodeValue||"";
      v=v.replace(/業種別営業LP URL/g,"業種別提案LP URL");
      v=v.replace(/営業LP・DEMO・提案書・LINE営業文/g,"提案LP・A4チラシ・DEMO・提案書・LINE営業文");
      node.nodeValue=v;
    });
  }

  function run(){
    scheduled = false;
    if (!DATA) return;
    enhanceQueueCards();
    enhanceSalesCandidates();
    enhanceMaterialRows();
    addDesktopNav();
    addTopShortcut();
    addDashboardShortcut();
    addIndexCard();
    addSystemCheck();
    replaceOldLabels();
  }

  function schedule(){
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  }

  injectStyle();
  loadCentral().then(data => {
    DATA = data; buildAliases(); run();
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement,{subtree:true,childList:true});
    window.DPRO_SALESNAVI_MATERIALS = Object.freeze({
      version: VERSION,
      systems: () => DATA.systems,
      getByCode: code => systemByCode(code),
      open: code => openSystem(systemByCode(code)),
      openLibrary
    });
  }).catch(err => {
    centralError = String(err?.message || err || "unknown");
    console.warn("DPRO SALESNAVI-51 central material sync unavailable:", centralError);
  });
})();
