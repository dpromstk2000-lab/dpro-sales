/* DPRO SALESNAVI-59 — TOP5 MATERIAL DECOUPLE / 2026-08-14
 * 50-system product-site master -> SalesNavi quick materials.
 * Existing SalesNavi business logic/API mutations are not changed.
 */
(() => {
  "use strict";

  const cfg = window.DPRO_CONFIG || {};
  const PRODUCT_BASE = "https://dpromstk2000-lab.github.io/dpro-line-systems-site/";
  const CENTRAL_DATA = PRODUCT_BASE + "systems-data.js?v=20260814";
  const HUB = cfg.proposalHubUrl || (PRODUCT_BASE + "proposal.html");
  const VERSION = "SALESNAVI-59-TOP5-MATERIAL-DECOUPLE-20260814";
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
      .dpro53-metric-link{cursor:pointer!important;outline:none!important;transition:.16s}
      .dpro53-metric-link:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(16,44,73,.10)}
      .dpro53-metric-link:focus-visible{box-shadow:0 0 0 3px rgba(14,141,103,.22),0 12px 28px rgba(16,44,73,.10)}
      .dpro53-queue-add{background:#0e8d67!important;border-color:#0e8d67!important;color:#fff!important}
      .dpro53-queue-add[disabled]{opacity:.58!important;cursor:default!important}
      .dpro53-next-material{border-color:#efca79!important;background:#fff8e8!important;color:#845604!important;font-weight:850!important}
      .dpro53-flow-strip{margin-top:10px;padding:10px;border:1px solid #cde7dc;border-radius:12px;background:#f4fbf8;display:flex;gap:7px;align-items:center;flex-wrap:wrap}
      .dpro53-flow-strip strong{color:#087553;font-size:11px;margin-right:auto}
      .dpro53-candidate-help{margin:0 0 12px;padding:10px 12px;border:1px solid #cfe7dc;background:#f5fcf9;border-radius:12px;color:#46675d;font-size:11px;line-height:1.65}
      .dpro54-top-card{border:1px solid #cfe4da!important;background:#fff!important;border-radius:14px!important}
      .dpro54-top-card[data-dpro54-rank="1"]{border-color:#8fd3b9!important;box-shadow:0 8px 22px rgba(14,141,103,.08)}
      .dpro54-top-card .dpro54-action-stack{display:flex;gap:6px;justify-content:flex-end;align-items:center;flex-wrap:wrap}
      .dpro54-top-card .dpro54-action-stack .btn{white-space:nowrap}
      .dpro54-rank-chip{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;border-radius:9px;background:#e8f6f1;color:#087553;font-size:12px;font-weight:900}
      .dpro54-rank-chip.first{background:#0e8d67;color:#fff}
      .dpro54-rest{border:1px solid #dbe6ed;border-radius:14px;background:#fff;margin-top:12px;overflow:hidden}
      .dpro54-rest>summary{cursor:pointer;list-style:none;padding:13px 15px;font-size:12px;font-weight:850;color:#334b63;display:flex;align-items:center;justify-content:space-between;gap:10px;background:#f7fafc}
      .dpro54-rest>summary::-webkit-details-marker{display:none}
      .dpro54-rest>summary:after{content:"＋";color:#087553;font-size:17px;font-weight:900}
      .dpro54-rest[open]>summary:after{content:"−"}
      .dpro54-rest-body{padding:0}
      .dpro54-rest .sales16-candidate{margin:0!important;border-left:0!important;border-right:0!important;border-radius:0!important}
      .dpro54-rest .sales16-candidate:first-child{border-top:0!important}
      .dpro54-rest .sales16-candidate:last-child{border-bottom:0!important}
      .dpro54-hidden-top-duplicate{display:none!important}
      .dpro54-top-actions-note{font-size:10px;color:#718195;margin-left:6px}
      .dpro54-open-queue{border-color:#9fd9c4!important;background:#f2fbf7!important;color:#087553!important}
      .dpro54-batch{background:#0e8d67!important;border-color:#0e8d67!important;color:#fff!important}
      .dpro54-compact-reasons .sales118-reason:nth-child(n+5){display:none!important}
      .dpro55-top5-source{display:inline-flex;align-items:center;gap:5px;background:#e8f6f1;color:#087553;border:1px solid #bfe1d3;border-radius:999px;padding:5px 8px;font-size:9px;font-weight:900}
      .dpro55-top5-item{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:12px;align-items:center;padding:13px 14px;border:1px solid #dce7e1;border-radius:14px;background:#fff;margin-bottom:8px}
      .dpro55-top5-item:first-child{border-color:#87cfb4;box-shadow:0 8px 22px rgba(14,141,103,.08)}
      .dpro55-top5-rank{width:32px;height:32px;border-radius:10px;background:#e8f6f1;color:#087553;display:grid;place-items:center;font-size:13px;font-weight:900}
      .dpro55-top5-item:first-child .dpro55-top5-rank{background:#0e8d67;color:#fff}
      .dpro55-top5-main{min-width:0}.dpro55-top5-main h4{margin:0 0 4px;font-size:13px}.dpro55-top5-main p{margin:0;color:#68788c;font-size:10px;line-height:1.55}
      .dpro55-top5-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.dpro55-top5-tag{display:inline-flex;border-radius:999px;padding:4px 7px;background:#f2f6f8;color:#536579;font-size:9px;font-weight:750}.dpro55-top5-tag.central{background:#eaf8f2;color:#087553}.dpro55-top5-tag.warn{background:#fff5df;color:#8a5a05}
      .dpro55-top5-actions{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap;max-width:470px}
      .dpro55-top5-score{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:6px 9px;background:#eef6ff;color:#1765ad;font-size:10px;font-weight:900;white-space:nowrap}
      .dpro55-add{background:#0e8d67!important;border-color:#0e8d67!important;color:#fff!important}
      .dpro55-added{border-color:#9fd9c4!important;background:#f2fbf7!important;color:#087553!important}
      .dpro55-panel-note{margin:7px 0 10px;padding:9px 11px;border:1px solid #cfe7dc;border-radius:11px;background:#f5fcf9;color:#45685c;font-size:10px;line-height:1.6}
      .dpro55-panel-note b{color:#087553}
      /* V56: sales23-top is a 2-column grid.
         V55 inserted the note before #sales23PriorityList, making the list
         auto-flow into the 220px left column. Pin each child explicitly. */
      .sales23-top>.sales23-scorebox{grid-column:1;grid-row:1}
      .sales23-top>.dpro55-panel-note{grid-column:2;grid-row:1;margin:0;min-width:0;align-self:stretch;display:flex;align-items:center}
      .sales23-top>#sales23PriorityList{grid-column:1/-1;grid-row:2;width:100%;min-width:0}
      #sales23PriorityList.sales23-list{width:100%;min-width:0}
      #sales23PriorityList .dpro55-top5-item{width:100%;min-width:0;grid-template-columns:38px minmax(260px,1fr) minmax(420px,auto)}
      #sales23PriorityList .dpro55-top5-main{min-width:0}
      #sales23PriorityList .dpro55-top5-main h4,
      #sales23PriorityList .dpro55-top5-main p{word-break:normal;overflow-wrap:anywhere}
      #sales23PriorityList .dpro55-top5-actions{min-width:0;max-width:none;justify-content:flex-end;flex-wrap:wrap}
      #sales23PriorityList .dpro55-top5-actions .btn,
      #sales23PriorityList .dpro55-top5-actions a{white-space:nowrap;word-break:keep-all}
      @media(max-width:1180px){
        #sales23PriorityList .dpro55-top5-item{grid-template-columns:34px minmax(0,1fr)}
        #sales23PriorityList .dpro55-top5-actions{grid-column:2;justify-content:flex-start}
      }
      .dpro57-product-code{display:inline-flex;align-items:center;justify-content:center;border:1px solid #b8d8cc;background:#edf8f3;color:#087553;border-radius:999px;padding:5px 7px;font-size:9px;font-weight:900;letter-spacing:.04em;white-space:nowrap}
      .dpro57-code-inline{display:inline-flex;align-items:center;gap:5px}
      .dpro57-code-inline .dpro57-product-code{padding:3px 6px;font-size:8px}
      .dpro57-mismatch{display:inline-flex;align-items:center;border:1px solid #efcf89;background:#fff6e4;color:#865600;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:850}
      .dpro58-official-product{display:inline-flex;align-items:center;border:1px solid #9fd9c4;background:#f1fbf7;color:#087553;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:900}
      .dpro58-official-product:before{content:"正式商品";font-size:8px;opacity:.7;margin-right:4px}
      .dpro59-material-check{display:inline-flex;align-items:center;justify-content:center;border:1px solid #efcf89;background:#fff6e4;color:#865600;border-radius:9px;padding:8px 10px;font-size:10px;font-weight:850;white-space:nowrap}
      .dpro59-rank-source{display:inline-flex;align-items:center;border:1px solid #c7d9e8;background:#f3f7fb;color:#42617d;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:850}
      @media(max-width:900px){
        .sales23-top>.sales23-scorebox{grid-column:1;grid-row:auto}
        .sales23-top>.dpro55-panel-note{grid-column:1;grid-row:auto;margin:0}
        .sales23-top>#sales23PriorityList{grid-column:1;grid-row:auto}
      }
      @media(max-width:900px){.dpro55-top5-item{grid-template-columns:34px minmax(0,1fr)}.dpro55-top5-actions{grid-column:2;justify-content:flex-start;max-width:none}}
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

  function dpro57AliasRows(){
    const rows=[];
    (DATA?.systems||[]).forEach(system=>{
      const vals=new Set([
        system.code,
        system.assetSlug,
        system.name,
        ...(system.targets||[])
      ].filter(Boolean));
      vals.forEach(v=>{
        const key=norm(v);
        if(key)rows.push({system,key,raw:String(v)});
      });
    });
    rows.sort((a,b)=>b.key.length-a.key.length);
    return rows;
  }

  function dpro57SystemFromLabel(label){
    const raw=String(label||"").trim();
    if(!raw||!DATA)return null;

    // 1) Exact visible product code always wins.
    const upper=raw.toUpperCase();
    for(const system of (DATA.systems||[])){
      const code=String(system.code||"").toUpperCase();
      if(code && new RegExp(`(^|[^A-Z0-9])${code.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}([^A-Z0-9]|$)`).test(upper)){
        return system;
      }
    }

    const key=norm(raw);
    if(!key)return null;
    const rows=dpro57AliasRows();

    // 2) Exact normalized product name / target / asset slug.
    const exact=rows.find(x=>x.key===key);
    if(exact)return exact.system;

    // 3) Longest product alias contained in a product-specific label.
    //    Generic English "salon" is intentionally excluded here to avoid
    //    Dog Salon -> beauty SALON false positives.
    const contained=rows.find(x=>{
      if(x.key.length<4)return false;
      if(x.system.code==="SALON" && x.key==="salon")return false;
      return key.includes(x.key);
    });
    return contained?.system||null;
  }

  function dpro57StructuredProductLabels(root){
    if(!root)return [];
    const labels=[];

    // Explicit code attributes.
    ["data-product-code","data-system-code","data-code","data-product"].forEach(a=>{
      const v=root.getAttribute?.(a);
      if(v)labels.push(v);
    });
    root.querySelectorAll?.("[data-product-code],[data-system-code],.sales17-code").forEach(el=>{
      const v=el.getAttribute("data-product-code")||el.getAttribute("data-system-code")||el.textContent;
      if(v)labels.push(v);
    });

    // Sales candidate product badges. Store name is deliberately NOT used.
    root.querySelectorAll?.(".sales16-tags .badge").forEach(el=>{
      const t=String(el.textContent||"").trim();
      if(t && !/^(A|B|C)$/.test(t) && !/今日優先|おすすめ|営業利用|素材|HP|LINE公式|Instagram|問い合わせ|電話|未確認|準備済|未登録/.test(t)){
        labels.push(t);
      }
    });

    // Queue/detail structured product areas.
    root.querySelectorAll?.(".queue-main .meta span,.queue-main .meta,.sales17-row-head,.sales23-item p").forEach(el=>{
      const t=String(el.textContent||"").trim();
      if(t)labels.push(t);
    });
    root.querySelectorAll?.(".detail-box").forEach(box=>{
      const h=String(box.querySelector("h4")?.textContent||"");
      if(/DPRO商品|対象商品|商品/.test(h)){
        const p=String(box.querySelector("p")?.textContent||"").trim();
        if(p)labels.push(p);
      }
    });

    return [...new Set(labels.filter(Boolean))];
  }

  function matchSystem(root){
    if(!root||!DATA)return null;

    // V58: for SalesNavi candidate rows, the OFFICIAL assigned product badge
    // is the only source of truth. Store/business name is never used.
    if(root.classList?.contains("sales16-candidate")){
      const assigned=dpro57AssignedProduct(root);
      return assigned?.system||null;
    }

    // V57 rule:
    // assigned product code/name > structured product metadata > no match.
    // Business/store names are never used for material selection.
    for(const label of dpro57StructuredProductLabels(root)){
      const hit=dpro57SystemFromLabel(label);
      if(hit)return hit;
    }

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
        <div class="dpro51-best"><div><small>NEXT BEST MATERIAL</small><b><span class="dpro57-product-code">${esc(system.code)}</span> ${esc(best.label)} — ${esc(best.why)}</b></div><a class="dpro51-library-btn" href="${esc(best.url)}" target="_blank" rel="noopener">今これを開く ↗</a></div>
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
    a.innerHTML = `<span class="dpro57-code-inline"><span class="dpro57-product-code">${esc(system.code)}</span><span>次に見せる：${esc(best.label)}</span></span>`;
    a.title = `${system.code} / ${best.why}`;
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
      if (!actions.querySelector("[data-dpro58-official-product]")) {
        const assigned = dpro57AssignedProduct(card);
        if (assigned?.label) {
          const official = document.createElement("span");
          official.className = "dpro58-official-product";
          official.setAttribute("data-dpro58-official-product","1");
          official.textContent = assigned.label;
          actions.appendChild(official);
        }
      }
      if (!actions.querySelector("[data-dpro57-product-code]")) {
        const code = document.createElement("span");
        code.className = "dpro57-product-code";
        code.setAttribute("data-dpro57-product-code","1");
        code.textContent = system.code;
        actions.appendChild(code);
      }
      if (r.lp.url) {
        const a = document.createElement("a");
        a.className = "btn btn-outline btn-sm dpro51-recommend";
        a.href = r.lp.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = "LP";
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


  function openCandidateList(){
    const nav = document.querySelector('.nav-btn[data-view="lineoutreach"]');
    if (!nav) return;
    nav.click();
    window.setTimeout(() => {
      const scope = document.querySelector("#sales16Scope");
      if (scope) {
        scope.value = "all";
        scope.dispatchEvent(new Event("change",{bubbles:true}));
      }
      document.querySelector("#sales16CandidateList")?.scrollIntoView({behavior:"smooth",block:"start"});
    }, 120);
  }

  function makeActiveMetricClickable(){
    const metric = document.querySelector("#metricActive")?.closest(".metric");
    if (!metric || metric.dataset.dpro53Metric === "1") return;
    metric.dataset.dpro53Metric = "1";
    metric.classList.add("dpro53-metric-link");
    metric.setAttribute("role","button");
    metric.setAttribute("tabindex","0");
    metric.setAttribute("aria-label","営業中の候補一覧を開く");
    metric.title = "営業中の候補一覧を開く";
    const sub = metric.querySelector(".sub");
    if (sub) sub.textContent = "クリックして候補一覧へ";
    metric.addEventListener("click", openCandidateList);
    metric.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openCandidateList();
      }
    });
  }

  function prospectIdFromCandidate(card){
    return card.querySelector("[data-prospect]")?.getAttribute("data-prospect")
      || (() => {
        const href = card.querySelector('a[href*="staff.html?prospect="]')?.getAttribute("href") || "";
        try { return new URL(href, location.href).searchParams.get("prospect") || ""; } catch (_) { return ""; }
      })();
  }

  function nativeQueueState(id){
    if (!id) return null;
    const native = document.querySelector(`#sales23PriorityList [data-sales119-queue="${CSS.escape(id)}"]`);
    if (!native) return null;
    return {disabled:Boolean(native.disabled), label:String(native.textContent || "").trim()};
  }

  function updateCandidateQueueButton(card, btn, id){
    const state = nativeQueueState(id);
    if (!state) return;
    btn.disabled = state.disabled;
    btn.textContent = state.disabled ? "追加済み" : "今日の営業へ追加";
  }

  function enhanceCandidateActions(){
    const listRoot = document.querySelector("#sales16CandidateList");
    if (listRoot && !listRoot.querySelector("[data-dpro53-candidate-help]") && listRoot.children.length) {
      const help = document.createElement("div");
      help.className = "dpro53-candidate-help";
      help.setAttribute("data-dpro53-candidate-help","1");
      help.innerHTML = "<b>V53：</b>候補からそのまま「今日の営業へ追加」→「次に見せる資料」→営業実行へ進めます。";
      listRoot.prepend(help);
    }

    document.querySelectorAll(".sales16-candidate").forEach(card => {
      const actions = card.querySelector(".sales16-actions");
      if (!actions) return;
      const id = prospectIdFromCandidate(card);
      const system = matchSystem(card);
      if (!id) return;

      let queueBtn = actions.querySelector("[data-dpro53-queue-add]");
      if (!queueBtn) {
        queueBtn = document.createElement("button");
        queueBtn.type = "button";
        queueBtn.className = "btn btn-primary btn-sm dpro53-queue-add";
        queueBtn.setAttribute("data-dpro53-queue-add","1");
        queueBtn.setAttribute("data-sales119-queue",id);
        queueBtn.textContent = "今日の営業へ追加";
        actions.insertBefore(queueBtn, actions.firstChild);
      }
      updateCandidateQueueButton(card, queueBtn, id);

      if (system && !actions.querySelector("[data-dpro53-next-material]")) {
        const best = recommend(system, "LINE営業 " + (card.textContent || ""));
        if (best?.url) {
          const a = document.createElement("a");
          a.href = best.url;
          a.target = "_blank";
          a.rel = "noopener";
          a.className = "btn btn-outline btn-sm dpro53-next-material";
          a.setAttribute("data-dpro53-next-material","1");
          a.textContent = `次に見せる：${best.label}`;
          a.title = best.why || "";
          actions.insertBefore(a, queueBtn.nextSibling);
        }
      }
    });
  }

  function enhanceDetailFlow(){
    const drawer = document.querySelector("#drawerBody");
    if (!drawer || drawer.dataset.dpro53Flow === "1") return;
    const system = matchSystem(drawer);
    if (!system) return;

    const boxes = [...drawer.querySelectorAll(".detail-box")];
    const materialBox = boxes.find(box => /③\s*営業素材/.test(box.textContent || ""));
    if (!materialBox) return;

    const best = recommend(system, drawer.textContent || "");
    const strip = document.createElement("div");
    strip.className = "dpro53-flow-strip";
    strip.innerHTML = `<strong>V53 次に見せる資料</strong>`;
    if (best?.url) {
      const a = document.createElement("a");
      a.className = "btn btn-outline btn-sm dpro53-next-material";
      a.href = best.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = best.label;
      strip.appendChild(a);
    }
    strip.appendChild(makeOpenButton(system, "btn btn-outline btn-sm dpro51-quick", "営業素材を全部見る"));
    materialBox.appendChild(strip);
    drawer.dataset.dpro53Flow = "1";
  }

  function cleanDuplicateDashboardMaterial(){
    document.querySelectorAll("[data-dpro52-dashboard-material]").forEach(el => el.remove());
  }



  function dpro59MarkUnmappedCandidates(){
    document.querySelectorAll(".sales16-candidate").forEach(card=>{
      if(card.querySelector("[data-dpro59-map-status]"))return;
      const assigned=dpro57AssignedProduct(card);
      if(!assigned?.label)return;
      if(assigned.system)return;

      const actions=card.querySelector(".sales16-actions");
      if(!actions)return;
      const span=document.createElement("span");
      span.className="dpro59-material-check";
      span.setAttribute("data-dpro59-map-status","1");
      span.textContent=`素材確認：${assigned.label}`;
      actions.appendChild(span);
    });
  }


  function dpro54OpenQueueView(){
    const nav = document.querySelector('.nav-btn[data-view="queue"]');
    if (nav) nav.click();
  }

  function dpro54BindOpenQueue(button){
    if (!button || button.dataset.dpro54OpenBound === "1") return;
    button.dataset.dpro54OpenBound = "1";
    button.addEventListener("click", e => {
      if (button.dataset.dpro54OpenQueue !== "1") return;
      e.preventDefault();
      e.stopPropagation();
      dpro54OpenQueueView();
    });
  }

  function dpro54ConvertQueuedButton(button){
    if (!button) return;
    dpro54BindOpenQueue(button);
    const queued = button.disabled || /追加済み|キュー済み/.test(String(button.textContent || ""));
    const id = button.getAttribute("data-sales119-queue") || button.dataset.dpro54Prospect || "";
    if (id) button.dataset.dpro54Prospect = id;

    if (queued) {
      button.disabled = false;
      button.removeAttribute("data-sales119-queue");
      button.dataset.dpro54OpenQueue = "1";
      button.classList.remove("dpro53-queue-add");
      button.classList.add("dpro54-open-queue");
      button.textContent = "今日の営業を見る";
    } else if (id) {
      button.dataset.dpro54OpenQueue = "0";
      button.setAttribute("data-sales119-queue", id);
    }
  }

  function dpro54EnhanceTop5Panel(){
    const panel = document.querySelector(".sales23-panel");
    const list = document.querySelector("#sales23PriorityList");
    if (!panel || !list) return;

    const title = panel.querySelector(".panel-head h3");
    const hint = panel.querySelector(".panel-head .hint");
    if (title) title.textContent = "今日おすすめTOP5";
    if (hint) hint.textContent = "まずこの5件だけ確認。追加 → 次に見せる資料 → 詳細・営業実行の3操作に絞ります。";

    const batch = document.querySelector("#sales119QueueTop");
    if (batch) {
      batch.textContent = "上位5件を今日の営業へ一括追加";
      batch.classList.add("dpro54-batch");
    }

    const topActions = panel.querySelector(".sales23-actions");
    if (topActions && !topActions.querySelector("[data-dpro54-open-queue]")) {
      const open = document.createElement("button");
      open.type = "button";
      open.className = "btn btn-outline btn-sm dpro54-open-queue";
      open.setAttribute("data-dpro54-open-queue","1");
      open.textContent = "今日の営業を見る";
      open.addEventListener("click", dpro54OpenQueueView);
      topActions.appendChild(open);
    }

    const items = [...list.querySelectorAll(".sales23-item")];
    items.forEach((item, index) => {
      if (index >= 5) {
        item.hidden = true;
        return;
      }
      item.hidden = false;
      item.classList.add("dpro54-top-card","dpro54-compact-reasons");
      item.dataset.dpro54Rank = String(index + 1);

      const nativeRank = item.querySelector(".sales23-rank");
      if (nativeRank) {
        nativeRank.classList.add("dpro54-rank-chip");
        nativeRank.classList.toggle("first", index === 0);
        nativeRank.textContent = String(index + 1);
      }

      const queueBtn = item.querySelector("[data-sales119-queue], [data-dpro54-prospect]");
      const prospectId = queueBtn?.getAttribute("data-sales119-queue") || queueBtn?.dataset.dpro54Prospect || "";
      if (queueBtn) {
        queueBtn.dataset.dpro54Prospect = prospectId;
        dpro54ConvertQueuedButton(queueBtn);
      }

      let stack = item.querySelector(".dpro54-action-stack");
      if (!stack) {
        stack = document.createElement("div");
        stack.className = "dpro54-action-stack";
        const right = item.lastElementChild;
        if (right) {
          const score = right.querySelector(".sales23-score");
          if (score) stack.appendChild(score);
          if (queueBtn) stack.appendChild(queueBtn);
          right.innerHTML = "";
          right.appendChild(stack);
        }
      }

      if (prospectId && !stack.querySelector("[data-dpro54-detail]")) {
        const detail = document.createElement("button");
        detail.type = "button";
        detail.className = "btn btn-outline btn-sm";
        detail.setAttribute("data-dpro54-detail", prospectId);
        detail.setAttribute("data-prospect", prospectId);
        detail.textContent = "詳細・営業実行";
        stack.appendChild(detail);
      }

      if (!stack.querySelector("[data-dpro54-material]")) {
        const system = matchSystem(item);
        if (system) {
          const best = recommend(system, item.textContent || "");
          if (best?.url) {
            const a = document.createElement("a");
            a.href = best.url;
            a.target = "_blank";
            a.rel = "noopener";
            a.className = "btn btn-outline btn-sm dpro53-next-material";
            a.setAttribute("data-dpro54-material","1");
            a.textContent = `次に見せる：${best.label}`;
            a.title = best.why || "";
            stack.insertBefore(a, stack.querySelector("[data-dpro54-detail]") || null);
          }
        }
      }
    });
  }

  function dpro54TopProspectIds(){
    return new Set(
      [...document.querySelectorAll("#sales23PriorityList .sales23-item")]
        .filter((x,i) => i < 5)
        .map(item => {
          const b = item.querySelector("[data-sales119-queue], [data-dpro54-prospect]");
          return b?.getAttribute("data-sales119-queue") || b?.dataset.dpro54Prospect || "";
        })
        .filter(Boolean)
    );
  }

  function dpro54OrganizeCandidateList(){
    const root = document.querySelector("#sales16CandidateList");
    if (!root) return;

    const cards = [...root.querySelectorAll(".sales16-candidate")];
    if (!cards.length) return;

    const topIds = dpro54TopProspectIds();

    cards.forEach(card => {
      const id = prospectIdFromCandidate(card);
      card.classList.toggle("dpro54-hidden-top-duplicate", Boolean(id && topIds.has(id)));

      const actions = card.querySelector(".sales16-actions");
      if (!actions) return;

      const queue = actions.querySelector("[data-dpro53-queue-add], [data-sales119-queue], [data-dpro54-prospect]");
      if (queue) {
        const pid = queue.getAttribute("data-sales119-queue") || queue.dataset.dpro54Prospect || id || "";
        if (pid) queue.dataset.dpro54Prospect = pid;
        dpro54ConvertQueuedButton(queue);
      }
    });

    let details = root.querySelector(":scope > .dpro54-rest");
    if (!details) {
      const help = root.querySelector("[data-dpro53-candidate-help]");
      if (help) help.remove();

      details = document.createElement("details");
      details.className = "dpro54-rest";
      const summary = document.createElement("summary");
      summary.innerHTML = '<span data-dpro54-rest-label>その他の候補</span><span class="dpro54-top-actions-note">必要なときだけ開く</span>';
      const body = document.createElement("div");
      body.className = "dpro54-rest-body";
      details.append(summary, body);

      cards.forEach(card => body.appendChild(card));
      root.appendChild(details);
    }

    const currentCards = [...details.querySelectorAll(".sales16-candidate")];
    const restCount = currentCards.filter(card => !card.classList.contains("dpro54-hidden-top-duplicate")).length;
    const label = details.querySelector("[data-dpro54-rest-label]");
    if (label) label.textContent = `その他の候補 ${restCount}件を表示`;
    details.hidden = restCount === 0;
  }

  function dpro54UpdateCandidatePrimaryActions(){
    document.querySelectorAll("#sales23PriorityList .sales23-item").forEach((item,index) => {
      if (index >= 5) return;
      const stack = item.querySelector(".dpro54-action-stack");
      if (!stack) return;

      // Keep only the score + 3 actions on TOP5:
      // 1) add/open queue, 2) next material, 3) detail/sales execution.
      const queue = stack.querySelector("[data-sales119-queue], [data-dpro54-prospect]");
      const material = stack.querySelector("[data-dpro54-material]");
      const detail = stack.querySelector("[data-dpro54-detail]");
      const score = stack.querySelector(".sales23-score");
      [...stack.children].forEach(el => {
        if (![score,queue,material,detail].includes(el)) el.hidden = true;
      });
    });
  }


  const dpro55State = {
    queueIds:new Set(),
    claimedIds:new Set(),
    followIds:new Set(),
    lastContextAt:0,
    contextLoading:false,
    bound:false,
    lastTopIds:[]
  };

  function dpro55Today(){
    const d=new Date(),pad=n=>String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function dpro55Token(){
    try{
      const x=JSON.parse(localStorage.getItem(cfg.sessionStorageKey)||"null");
      return x?.token||"";
    }catch(_){return ""}
  }

  async function dpro55Api(path,{method="GET",body=null}={}){
    const headers={Accept:"application/json"};
    if(body!==null)headers["Content-Type"]="application/json; charset=utf-8";
    const token=dpro55Token();
    if(token)headers.Authorization=`Bearer ${token}`;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    let res;
    try{
      res=await fetch(String(cfg.apiBaseUrl||"")+path,{
        method,
        headers,
        body:body===null?undefined:JSON.stringify(body),
        cache:"no-store",
        credentials:"omit",
        signal:controller.signal
      });
    }finally{clearTimeout(timer)}
    let data={};try{data=await res.json()}catch(_){}
    if(!res.ok||data.ok===false)throw new Error(data.message||data.error||`APIエラー (${res.status})`);
    return data;
  }

  function dpro55ActiveQueue(q){return !["completed","skipped","cancelled"].includes(String(q?.queue_status||"queued"))}

  async function dpro55RefreshContext(force=false){
    if(dpro55State.contextLoading)return;
    if(!force&&Date.now()-dpro55State.lastContextAt<30000)return;
    dpro55State.contextLoading=true;
    try{
      const date=dpro55Today();
      const [qd,dd]=await Promise.all([
        dpro55Api(`/api/sales-queue?date=${date}`),
        dpro55Api(`/api/dashboard/today?date=${date}`)
      ]);
      const queue=Array.isArray(qd?.queueItems)?qd.queueItems:[];
      dpro55State.queueIds=new Set(queue.filter(dpro55ActiveQueue).map(q=>q.prospect_id).filter(Boolean));
      dpro55State.claimedIds=new Set(queue.filter(q=>dpro55ActiveQueue(q)&&q.claimActive).map(q=>q.prospect_id).filter(Boolean));
      const followIds=new Set();
      [...(Array.isArray(dd?.overdue)?dd.overdue:[]),...(Array.isArray(dd?.dueToday)?dd.dueToday:[])].forEach(a=>{
        const id=a?.prospect_id||a?.prospect?.id;if(id)followIds.add(id)
      });
      dpro55State.followIds=followIds;
      dpro55State.lastContextAt=Date.now();
      schedule();
    }catch(e){
      console.warn("DPRO SALESNAVI-55 queue context:",e);
    }finally{dpro55State.contextLoading=false}
  }

  function dpro55NativeScore(card){
    const m=String(card?.textContent||"").match(/今日優先\s*(\d+)/);
    return m?Number(m[1]):0
  }

  function dpro55NativeMaterialCount(card){
    const t=String(card?.textContent||"");
    if(/素材3点完備/.test(t))return 3;
    const m=t.match(/素材([0-3])点/);
    return m?Number(m[1]):0
  }

  function dpro55MaterialPoints(n){return [0,6,10,15][Math.max(0,Math.min(3,Number(n)||0))]||0}

  function dpro55CentralCount(system){
    if(!system)return 0;
    const r=resourceSet(system);
    return [r.lp?.url,r.flyer?.url,r.demo?.url].filter(Boolean).length
  }

  function dpro58OfficialProductLabel(card){
    const tags=card?.querySelector?.(".sales16-tags");
    if(!tags)return "";

    // owner.html renderSales16() renders:
    // grade -> 今日優先 score -> OFFICIAL product_name -> channel/risk/etc.
    // Therefore the badge immediately after "今日優先" is the SalesNavi
    // assigned product. We read that exact DOM position instead of guessing.
    const badges=[...tags.querySelectorAll(":scope > .badge")];
    const scoreIndex=badges.findIndex(el=>/今日優先/.test(String(el.textContent||"")));
    if(scoreIndex>=0 && badges[scoreIndex+1]){
      return String(badges[scoreIndex+1].textContent||"").trim();
    }

    // Structural fallback for older owner render where grade is still a badge.
    if(badges[2])return String(badges[2].textContent||"").trim();
    return "";
  }

  function dpro58SystemFromOfficialProduct(label){
    const raw=String(label||"").trim();
    if(!raw||!DATA)return null;

    // First use the strict V57 product-label resolver.
    const hit=dpro57SystemFromLabel(raw);
    if(hit)return hit;

    // Conservative exact normalization fallback.
    const key=norm(raw);
    if(!key)return null;
    const exact=(DATA.systems||[]).find(system=>{
      const values=[
        system.code,
        system.assetSlug,
        system.name,
        ...(system.targets||[])
      ].filter(Boolean).map(norm);
      return values.includes(key);
    });
    return exact||null;
  }

  function dpro57AssignedProduct(card){
    const label=dpro58OfficialProductLabel(card);
    if(!label)return null;
    const system=dpro58SystemFromOfficialProduct(label);
    // V59: keep the SalesNavi official product label even when the
    // central catalog mapping is not available. Ranking must not depend
    // on material mapping.
    return {label,system:system||null};
  }


  function dpro55CandidateInfo(card,index=0){
    if(!card)return null;
    const id=prospectIdFromCandidate(card);
    if(!id)return null;
    const assigned=dpro57AssignedProduct(card);
    const system=assigned?.system||null;
    const t=String(card.textContent||"");
    const name=String(card.querySelector("h3")?.textContent||"営業先").trim();
    const address=String(card.querySelector(".sales16-candidate-top p")?.textContent||"").trim();
    const product=assigned?.label||system?.name||"商品";
    const best=String(card.querySelector(".sales16-opportunity")?.textContent||"").replace(/^おすすめ[：:]\s*/,"").trim();
    const restricted=/営業利用注意|要利用条件確認/.test(t);
    const noEntry=/営業入口の確認待ち|営業入口 未確認/.test(t)||!best;
    const nativeScore=dpro55NativeScore(card);
    const nativeMat=dpro55NativeMaterialCount(card);
    const central=dpro55CentralCount(system);
    const boost=Math.max(0,dpro55MaterialPoints(central)-dpro55MaterialPoints(nativeMat));
    const score=Math.max(0,Math.min(100,nativeScore+boost));
    // V59: ranking and material resolution are separated.
    // A candidate can be ranked even if central material mapping is unavailable.
    const safeForTop=!restricted&&!noEntry;
    return {card,id,name,address,product,best,restricted,noEntry,system,nativeScore,nativeMat,central,boost,score,index,safeForTop}
  }

  function dpro55AllCandidates(){
    const root=document.querySelector("#sales16CandidateList");
    if(!root)return [];
    return [...root.querySelectorAll(".sales16-candidate")].map(dpro55CandidateInfo).filter(Boolean)
  }

  function dpro55Ranked(){
    return dpro55AllCandidates()
      .filter(x=>x.safeForTop)
      .sort((a,b)=>b.score-a.score||b.central-a.central||a.index-b.index)
  }

  function dpro55Top5(){return dpro55Ranked().slice(0,5)}

  function dpro55Reason(info){
    const tags=[];
    if(info.best)tags.push({text:`入口 ${info.best}`,cls:""});
    tags.push({text:`既存優先 ${info.nativeScore}`,cls:""});
    if(info.central>=3)tags.push({text:"中央素材3点",cls:"central"});
    else if(info.central>0)tags.push({text:`中央素材${info.central}点`,cls:"central"});
    if(info.boost>0)tags.push({text:`素材連携 +${info.boost}`,cls:"central"});
    if(info.nativeScore<35&&info.score>=35)tags.push({text:"中央素材で優先基準到達",cls:"central"});
    return tags;
  }

  function dpro55TopItemHtml(info,rank){
    const queued=dpro55State.queueIds.has(info.id);
    const best=info.system?recommend(info.system,info.card?.textContent||""):null;
    const tags=dpro55Reason(info).map(x=>`<span class="dpro55-top5-tag ${esc(x.cls)}">${esc(x.text)}</span>`).join("");
    const codeHtml=info.system
      ?`<span class="dpro57-product-code">${esc(info.system.code||"")}</span>`
      :`<span class="dpro57-mismatch">中央素材は要確認</span>`;
    const materialHtml=best?.url
      ?`<a class="btn btn-outline btn-sm dpro53-next-material" href="${esc(best.url)}" target="_blank" rel="noopener" title="${esc((info.system?.code||"")+" / "+(best.why||""))}">次に見せる：${esc(best.label)}</a>`
      :`<span class="dpro59-material-check">素材確認</span>`;
    return `<article class="dpro55-top5-item" data-dpro55-id="${esc(info.id)}">
      <div class="dpro55-top5-rank">${rank}</div>
      <div class="dpro55-top5-main">
        <h4>${esc(info.name)}</h4>
        <p><span class="dpro58-official-product">${esc(info.product)}</span> ${codeHtml}${info.address?` ／ ${esc(info.address)}`:""}</p>
        <div class="dpro55-top5-tags">${tags}<span class="dpro59-rank-source">TOP5判定と素材判定を分離</span></div>
      </div>
      <div class="dpro55-top5-actions">
        <span class="dpro55-top5-score">V59優先 ${info.score}</span>
        <button type="button" class="btn btn-sm ${queued?"btn-outline dpro55-added":"btn-primary dpro55-add"}" ${queued?'data-dpro55-open-queue="1"':`data-dpro55-queue-add="${esc(info.id)}"`}>${queued?"今日の営業を見る":"今日の営業へ追加"}</button>
        ${materialHtml}
        <button type="button" class="btn btn-outline btn-sm" data-prospect="${esc(info.id)}">詳細・営業実行</button>
      </div>
    </article>`
  }

  function dpro55RenderTop5(){
    const list=document.querySelector("#sales23PriorityList");
    const panel=list?.closest(".sales23-panel")||list?.parentElement;
    if(!list||!panel)return;

    const top=dpro55Top5();
    const ranked=dpro55Ranked();
    dpro55State.lastTopIds=top.map(x=>x.id);

    const title=panel.querySelector(".panel-head h3");
    const hint=panel.querySelector(".panel-head .hint");
    if(title)title.textContent="今日おすすめTOP5";
    if(hint)hint.textContent="画面に出ている営業候補を、商品サイトの提案LP・A4・DEMOも含めて再評価します。";

    const ready=document.querySelector("#sales23ReadyCount");
    if(ready)ready.textContent=String(top.length);

    let note=panel.querySelector("[data-dpro55-note]");
    if(!note){
      note=document.createElement("div");
      note.className="dpro55-panel-note";
      note.setAttribute("data-dpro55-note","1");
      list.before(note);
    }
    const sourceCount=ranked.length;
    note.innerHTML=`<b>V55中央連携：</b>V59ではTOP5判定と素材判定を分離しています。営業入口・既存優先スコアで候補 ${sourceCount}件から上位${top.length}件を表示し、素材は正式商品を中央マスターへ安全に紐付けできた場合だけ表示します。`;

    const sig=top.map(x=>`${x.id}:${x.score}:${x.product}:${x.system?.code||"NO-MAP"}:${dpro55State.queueIds.has(x.id)?1:0}`).join("|");
    if(list.dataset.dpro55Signature!==sig){
      list.dataset.dpro55Signature=sig;
      list.innerHTML=top.length
        ?top.map((x,i)=>dpro55TopItemHtml(x,i+1)).join("")
        :'<div class="sales23-empty">営業入口が確認できる候補を読み込み中です。</div>';
    }

    const batch=document.querySelector("#sales119QueueTop");
    if(batch){
      batch.textContent="TOP5を今日の営業へ一括追加";
      batch.disabled=!top.some(x=>!dpro55State.queueIds.has(x.id));
      batch.classList.add("dpro54-batch");
    }

    const focus=document.querySelector("#sales23Focus");
    if(focus){
      focus.disabled=ranked.length===0;
      focus.textContent="候補一覧を確認";
    }
  }

  function dpro55OrganizeRest(){
    const root=document.querySelector("#sales16CandidateList");
    if(!root)return;
    const cards=[...root.querySelectorAll(".sales16-candidate")];
    if(!cards.length)return;
    const topIds=new Set(dpro55State.lastTopIds);

    cards.forEach(card=>{
      const id=prospectIdFromCandidate(card);
      card.classList.toggle("dpro54-hidden-top-duplicate",Boolean(id&&topIds.has(id)));
    });

    let details=root.querySelector(":scope > .dpro54-rest");
    if(!details){
      details=document.createElement("details");
      details.className="dpro54-rest";
      const summary=document.createElement("summary");
      summary.innerHTML='<span data-dpro54-rest-label>その他の候補</span><span class="dpro54-top-actions-note">必要なときだけ開く</span>';
      const body=document.createElement("div");
      body.className="dpro54-rest-body";
      details.append(summary,body);
      cards.forEach(card=>body.appendChild(card));
      root.appendChild(details);
    }
    const rest=[...details.querySelectorAll(".sales16-candidate")].filter(card=>!card.classList.contains("dpro54-hidden-top-duplicate"));
    const label=details.querySelector("[data-dpro54-rest-label]");
    const txt=`その他の候補 ${rest.length}件を表示`;
    if(label&&label.textContent!==txt)label.textContent=txt;
    details.hidden=rest.length===0;
  }

  function dpro55CandidateById(id){
    return dpro55AllCandidates().find(x=>x.id===id)||null
  }

  async function dpro55SafeReady(ids){
    await dpro55RefreshContext(true);
    const unique=[...new Set(ids.filter(Boolean))];
    const ready=[],blocked=[];
    unique.forEach(id=>{
      const x=dpro55CandidateById(id);
      if(!x){blocked.push({id,reason:"候補情報なし"});return}
      if(x.restricted){blocked.push({id,reason:"営業利用注意"});return}
      if(x.noEntry){blocked.push({id,reason:"営業入口なし"});return}
      if(dpro55State.queueIds.has(id)){blocked.push({id,reason:"本日キュー済み"});return}
      if(dpro55State.claimedIds.has(id)){blocked.push({id,reason:"担当確保中"});return}
      if(dpro55State.followIds.has(id)){blocked.push({id,reason:"期限到来フォローあり"});return}
      ready.push(x)
    });
    return {ready,blocked}
  }

  async function dpro55Enqueue(ids,label="候補"){
    let checked;
    try{checked=await dpro55SafeReady(ids)}
    catch(e){showMiniToast(e.message||"営業キューを確認できませんでした");return}
    const {ready,blocked}=checked;
    if(!ready.length){
      const reasons=[...new Set(blocked.map(x=>x.reason))].join("・");
      showMiniToast(`追加できません：${reasons||"対象なし"}`);
      schedule();
      return
    }
    const names=ready.map(x=>x.name).slice(0,5).join("、");
    const extra=blocked.length?`\n\n除外 ${blocked.length}件：${[...new Set(blocked.map(x=>x.reason))].join("・")}`:"";
    if(!confirm(`${label} ${ready.length}件を今日の営業へ追加しますか？\n\n${names}${extra}\n\n本日キュー・担当確保・期限到来フォローは除外します。`))return;

    try{
      const date=dpro55Today();
      const d=await dpro55Api("/api/sales-queue/enqueue",{
        method:"POST",
        body:{prospectIds:ready.map(x=>x.id),autoSelect:false,queueDate:date,sourceType:"manual",limit:ready.length}
      });
      ready.forEach(x=>dpro55State.queueIds.add(x.id));
      dpro55State.lastContextAt=Date.now();
      const added=Number(d?.result?.addedCount??d?.result?.added_count??ready.length)||0;
      const updated=Number(d?.result?.updatedCount??d?.result?.updated_count??0)||0;
      showMiniToast(`今日の営業へ ${added+updated}件反映しました`);
      schedule();
    }catch(e){showMiniToast(e.message||"営業キューへ追加できませんでした")}
  }

  function dpro55BindActions(){
    if(dpro55State.bound)return;
    dpro55State.bound=true;

    document.addEventListener("click",e=>{
      const batch=e.target.closest("#sales119QueueTop");
      if(batch){
        e.preventDefault();e.stopImmediatePropagation();
        dpro55Enqueue(dpro55Top5().map(x=>x.id),"TOP5");
        return
      }

      const add=e.target.closest("[data-dpro55-queue-add]");
      if(add){
        e.preventDefault();e.stopImmediatePropagation();
        dpro55Enqueue([add.dataset.dpro55QueueAdd],"この候補");
        return
      }

      const open=e.target.closest("[data-dpro55-open-queue]");
      if(open){
        e.preventDefault();e.stopImmediatePropagation();
        dpro54OpenQueueView();
        return
      }

      const legacy=e.target.closest("#sales16CandidateList [data-dpro53-queue-add], #sales16CandidateList [data-sales119-queue]");
      if(legacy){
        const card=legacy.closest(".sales16-candidate");
        const id=legacy.getAttribute("data-sales119-queue")||legacy.dataset.dpro54Prospect||prospectIdFromCandidate(card);
        if(id){
          e.preventDefault();e.stopImmediatePropagation();
          dpro55Enqueue([id],"この候補");
        }
      }
    },true);
  }

  function dpro55Apply(){
    dpro55BindActions();
    dpro55RenderTop5();
    dpro55OrganizeRest();
    dpro55RefreshContext(false);
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
    cleanDuplicateDashboardMaterial();
    makeActiveMetricClickable();
    enhanceQueueCards();
    enhanceSalesCandidates();
    enhanceCandidateActions();
    enhanceDetailFlow();
    dpro54EnhanceTop5Panel();
    dpro54OrganizeCandidateList();
    dpro54UpdateCandidatePrimaryActions();
    dpro55Apply();
    dpro59MarkUnmappedCandidates();
    enhanceMaterialRows();
    addDesktopNav();
    addTopShortcut();
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
    console.warn("DPRO SALESNAVI-59 TOP5/material decouple unavailable:", centralError);
  });
})();
