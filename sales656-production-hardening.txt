/**
 * DPRO SALESNAVI V65.6
 * Version: SALESNAVI-65.6-PRODUCTION-FLOW-HARDENING-20260815
 *
 * Real-sales test hardening found on 2026-08-15.
 *
 * Fixes:
 * 1) "今登録した店舗を開く": resolve newly imported prospect by ID-context,
 *    not only the pre-import display name.
 * 2) Queue sales method -> result modal: re-read today's queue notes and apply method.
 * 3) Phone result: expose phone_no_answer / 電話不通.
 * 4) Phone no-answer follow-up: show "電話不通のため再架電".
 * 5) Result-save -> open detail: refresh the already-open prospect drawer.
 * 6) Version badge: visually lock quick-operation badge to V65.6.
 *
 * Safety:
 * - No SQL change.
 * - No Cloudflare Worker change.
 * - No automatic activity/queue/follow-up creation.
 * - Existing V61 / V63 / V64-R1 / V65.2 / V65.4 / V65.5 remain loaded.
 */
(() => {
  "use strict";

  const VERSION = "SALESNAVI-65.6-PRODUCTION-FLOW-HARDENING-20260815";
  const IMPORT_KEY = "dpro_sales_v656_import_context";
  const PHONE_CTX_KEY = "dpro_sales_v656_phone_context";
  const ACTIVE_QUEUE = new Set(["queued", "planned", "in_progress", "completed"]);
  const METHOD_RE = /\[DPRO-SALES-METHOD:(visit|phone|line|email)\]/i;
  const METHOD_LABELS = Object.freeze({ visit:"訪問", phone:"電話", line:"LINE", email:"メール" });
  const GENERIC_FOLLOW_RE = /^(次回の確認・連絡を行う。?|次回確認|確認・連絡)$/u;
  const PHONE_NO_ANSWER_RE = /(電話.*(?:応答なし|不通|つながら|出なかった|出ません|留守)|(?:応答なし|不通|つながらない|留守).*電話)/u;
  const DAY_MS = 24 * 60 * 60 * 1000;

  if (window.__DPRO_SALES656_PRODUCTION_HARDENING__) return;
  if (typeof window.fetch !== "function") return;

  const baseFetch = window.fetch.bind(window);
  let pendingRefreshProspectId = "";
  let pendingPhoneResultProspectId = "";
  let importOpenBusy = false;

  function cfg(){ return window.DPRO_CONFIG || {}; }
  function storedSession(){ try{return JSON.parse(localStorage.getItem(cfg().sessionStorageKey||"dpro_sales_session_v3")||"null")}catch{return null} }
  function token(){ return storedSession()?.token || ""; }

  function todayJst(){
    const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const o=Object.fromEntries(p.map(x=>[x.type,x.value]));
    return `${o.year}-${o.month}-${o.day}`;
  }
  function dateTextJst(value){
    if(!value)return "";
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return String(value);
    try{
      const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(value));
      const o=Object.fromEntries(p.map(x=>[x.type,x.value]));
      return `${o.year}-${o.month}-${o.day}`;
    }catch{return ""}
  }
  function dateMs(v){ if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||"")))return NaN; return new Date(`${v}T12:00:00+09:00`).getTime(); }
  function requestUrl(input){ return typeof input==="string"?input:String(input?.url||""); }
  function pathOnly(input){
    const raw=requestUrl(input);
    try{const u=new URL(raw,location.href);return u.pathname+u.search}catch{return raw}
  }
  function parseJsonBody(init){ if(!init||typeof init.body!=="string")return null; try{return JSON.parse(init.body)}catch{return null} }
  function cloneJsonResponse(response,data){
    const headers=new Headers(response.headers); headers.delete("content-length"); headers.delete("content-encoding");
    return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
  }
  function apiHeaders(){ const h={Accept:"application/json"}; if(token())h.Authorization=`Bearer ${token()}`; return h; }
  async function apiGet(path){
    const res=await window.fetch(String(cfg().apiBaseUrl||"")+path,{method:"GET",headers:apiHeaders(),credentials:"omit",cache:"no-store"});
    let data={}; try{data=await res.json()}catch{}
    if(!res.ok||data.ok===false)throw new Error(data.message||data.error||`APIエラー (${res.status})`);
    return data;
  }
  function toast(message,type="success"){
    const stack=document.querySelector("#toastStack");
    if(stack){const el=document.createElement("div");el.className=`toast ${type}`;el.textContent=message;stack.appendChild(el);setTimeout(()=>el.remove(),5200);return}
    console[type==="error"?"error":"log"](`[V65.6] ${message}`);
  }
  function clean(v){return String(v||"").replace(/\s+/g," ").trim()}
  function norm(v){return String(v||"").normalize("NFKC").toLocaleLowerCase("ja").replace(/[・･／/（）()【】［］\[\]\s_\-‐‑‒–—―−ー]/g,"")}
  function postalCode(text){const m=String(text||"").match(/(\d{3})[-‐‑‒–—―−ー]?(\d{4})/);return m?`${m[1]}-${m[2]}`:""}
  function addressNumbers(text){const post=postalCode(text).replace("-","");const nums=String(text||"").match(/\d+/g)||[];return nums.filter(x=>x!==post.slice(0,3)&&x!==post.slice(3))}
  function deepText(v){try{return JSON.stringify(v||{})}catch{return String(v||"")}}
  function createdAtMs(p){const raw=p?.created_at||p?.createdAt||p?.imported_at||p?.importedAt||"";const ms=raw?new Date(raw).getTime():NaN;return Number.isFinite(ms)?ms:NaN}

  function scoreProspect(p,target,context={}){
    let score=0;
    const all=deepText(p),pName=clean(p?.business_name||p?.businessName||p?.name||""),pAddress=clean(p?.address||p?.formatted_address||p?.area||"");
    const tName=clean(target?.name||""),tAddress=clean(target?.address||""),placeId=String(target?.placeId||""),productId=String(context?.productId||"");
    if(placeId&&all.includes(placeId))score+=180;
    const pn=norm(pName),tn=norm(tName);
    if(pn&&tn){if(pn===tn)score+=95;else if(pn.includes(tn)||tn.includes(pn))score+=55}
    const pp=postalCode(pAddress),tp=postalCode(tAddress); if(pp&&tp&&pp===tp)score+=60;
    const pnums=new Set(addressNumbers(pAddress)),tnums=[...new Set(addressNumbers(tAddress))];
    score+=Math.min(30,tnums.filter(n=>pnums.has(n)).length*10);
    const cm=createdAtMs(p),clicked=Number(context?.clickedAt||0);
    if(Number.isFinite(cm)&&clicked>0){const delta=Math.abs(cm-clicked);if(delta<=15*60*1000)score+=40;else if(delta<=60*60*1000)score+=20}
    if(productId&&all.includes(productId))score+=15;
    if(["new","qualified","planned"].includes(String(p?.pipeline_stage||"")))score+=5;
    return score;
  }

  function saveImportContext(ctx){try{sessionStorage.setItem(IMPORT_KEY,JSON.stringify(ctx))}catch{}}
  function readImportContext(){try{return JSON.parse(sessionStorage.getItem(IMPORT_KEY)||"null")}catch{return null}}
  function captureImportContext(){
    const rows=[...document.querySelectorAll("#searchResults .result-check:checked")].map(cb=>{
      const tr=cb.closest("tr");return {placeId:cb.value||"",name:tr?.querySelector(".business-cell strong")?.textContent?.trim()||"",address:tr?.querySelector(".business-cell small")?.textContent?.trim()||""};
    }).filter(x=>x.placeId||x.name||x.address);
    if(!rows.length)return;
    saveImportContext({clickedAt:Date.now(),productId:document.querySelector("#searchProduct")?.value||"",rows});
  }
  function cssAttr(v){return String(v||"").replace(/\\/g,"\\\\").replace(/"/g,'\\"')}
  function navByText(text){return [...document.querySelectorAll(".nav-btn[data-view]")].find(x=>String(x.textContent||"").includes(text))||null}
  async function waitForProspectCard(id,tries=28){for(let i=0;i<tries;i++){const c=document.querySelector(`[data-prospect="${cssAttr(id)}"]`);if(c)return c;await new Promise(r=>setTimeout(r,180))}return null}

  async function openResolvedImported(displayName=""){
    if(importOpenBusy)return;
    const ctx=readImportContext(); if(!ctx?.rows?.length)return;
    importOpenBusy=true;
    try{
      const preferred=ctx.rows.find(r=>clean(r.name)===clean(displayName))||ctx.rows[0];
      const d=await apiGet("/api/prospects?limit=500&order=score");
      const prospects=Array.isArray(d.prospects)?d.prospects:[];
      const ranked=prospects.map(p=>({p,score:scoreProspect(p,preferred,ctx)})).sort((a,b)=>b.score-a.score);
      const hit=ranked[0];
      if(!hit||hit.score<70||!hit.p?.id){toast("登録店舗は営業パイプラインにあります。店舗名変換のため自動特定できなかったので、一覧から確認してください。","error");return}
      navByText("営業パイプライン")?.click(); await new Promise(r=>setTimeout(r,220));
      const search=document.querySelector("#pipelineSearch"),campaign=document.querySelector("#pipelineCampaign"),priority=document.querySelector("#pipelinePriority"),stage=document.querySelector("#pipelineStage");
      if(campaign)campaign.value="";if(priority)priority.value="";if(stage)stage.value="";
      if(search){search.value=hit.p.business_name||hit.p.businessName||"";search.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",bubbles:true}))}
      let card=await waitForProspectCard(hit.p.id,24);
      if(!card){if(search)search.value="";document.querySelector("#pipelineReload")?.click();card=await waitForProspectCard(hit.p.id,24)}
      if(!card){toast("登録店舗IDは特定できましたが、カード表示を確認できませんでした。営業パイプラインを更新してください。","error");return}
      card.click();toast(`今登録した店舗を開きました：${hit.p.business_name||preferred.name||"登録店舗"}`);
    }catch(e){console.warn("[V65.6] imported prospect resolver:",e)}finally{importOpenBusy=false}
  }

  function readMethod(notes){const m=String(notes||"").match(METHOD_RE);return m&&METHOD_LABELS[m[1].toLowerCase()]?m[1].toLowerCase():""}
  async function waitForActivityForm(tries=35){for(let i=0;i<tries;i++){const f=document.querySelector("#activityForm");if(f)return f;await new Promise(r=>setTimeout(r,45))}return null}
  function applyMethodToForm(form,method){
    if(!form||!METHOD_LABELS[method])return false;const select=form.querySelector('select[name="activityType"]');if(!select)return false;
    if(![...select.options].some(o=>o.value===method))return false;
    select.value=method;select.dispatchEvent(new Event("change",{bubbles:true}));
    form.querySelectorAll("[data-sales656-method-hint]").forEach(x=>x.remove());
    const field=select.closest(".field");if(field){const hint=document.createElement("div");hint.dataset.sales656MethodHint="1";hint.className="sales656-method-hint";hint.innerHTML=`営業キューに保存された営業手段 <b>${METHOD_LABELS[method]}</b> を活動方法へ引き継ぎました。`;field.appendChild(hint)}
    return true;
  }
  async function handoffQueueMethod(button){
    const prospectId=button?.dataset?.recordActivity||"",queueId=button?.dataset?.queueId||"";if(!prospectId&&!queueId)return;
    try{
      const d=await apiGet(`/api/sales-queue?date=${encodeURIComponent(todayJst())}`),items=Array.isArray(d.queueItems)?d.queueItems:[];
      const item=items.find(q=>queueId&&String(q?.id||"")===queueId)||items.find(q=>prospectId&&String(q?.prospect_id||"")===prospectId&&ACTIVE_QUEUE.has(String(q?.queue_status||"queued")))||items.find(q=>prospectId&&String(q?.prospect_id||"")===prospectId);
      const method=readMethod(item?.notes);if(!method)return;const form=await waitForActivityForm();if(form)applyMethodToForm(form,method);
    }catch(e){console.warn("[V65.6] queue method handoff:",e)}
  }

  function ensurePhoneNoAnswerButton(form){
    if(!form)return;const select=form.querySelector('select[name="activityType"]'),list=form.querySelector(".quick-results");if(!select||!list)return;
    let btn=list.querySelector('[data-result-choice="phone_no_answer"]');
    if(!btn){btn=document.createElement("button");btn.type="button";btn.className="result-choice sales656-phone-no-answer";btn.dataset.resultChoice="phone_no_answer";btn.textContent="電話不通";const ownerAbsent=list.querySelector('[data-result-choice="owner_absent"]');if(ownerAbsent?.nextSibling)list.insertBefore(btn,ownerAbsent.nextSibling);else list.prepend(btn)}
    btn.hidden=select.value!=="phone";
    if(!select.dataset.sales656PhoneBound){select.dataset.sales656PhoneBound="1";select.addEventListener("change",()=>{const b=form.querySelector('[data-result-choice="phone_no_answer"]');if(b)b.hidden=select.value!=="phone"})}
  }
  function applyPhoneNoAnswerPreview(form){
    if(!form)return;const result=form.querySelector('[name="resultCode"]');if(result)result.value="phone_no_answer";const owner=form.querySelector('[name="isOwnerContact"]');if(owner)owner.checked=false;
    const summary=form.querySelector('[name="summary"]');if(summary)summary.placeholder="例：電話するも応答なし。後日再架電する。";
    const preview=form.querySelector("#sales1111Preview");if(preview)preview.innerHTML="<strong>次のおすすめ：再架電を確認</strong><p>電話不通として記録します。保存後に作成された次回予定は、再架電として分かる表示に整えます。</p>";
  }

  function activityText(a){return [a?.summary,a?.details,a?.notes,a?.memo,a?.result_code,a?.resultCode].filter(Boolean).join(" ")}
  function isPhoneNoAnswerActivity(a){const type=String(a?.activity_type||a?.activityType||"").toLowerCase(),code=String(a?.result_code||a?.resultCode||"");if(code==="phone_no_answer")return true;return type==="phone"&&PHONE_NO_ANSWER_RE.test(activityText(a))}
  function actionDue(a){return String(a?.due_date||a?.dueDate||"").slice(0,10)}
  function actionDescription(a){return String(a?.description||"").trim()}
  function makePhoneActionSpecific(a){
    if(!a||!GENERIC_FOLLOW_RE.test(actionDescription(a)))return false;a.description="電話不通のため再架電";const type=String(a.action_type||a.actionType||"");
    if(!type||type==="other"){if("action_type" in a||!("actionType" in a))a.action_type="phone";else a.actionType="phone"}return true;
  }
  function latestRelevantActivity(detail,dueDate){
    const due=dateMs(dueDate);if(!Number.isFinite(due))return null;
    return (detail?.activities||[]).map(a=>({a,ms:dateMs(dateTextJst(a?.activity_at||a?.activityAt||a?.created_at||a?.createdAt))})).filter(x=>Number.isFinite(x.ms)&&x.ms<=due&&(due-x.ms)<=7*DAY_MS).sort((a,b)=>b.ms-a.ms)[0]?.a||null;
  }
  function rewritePhoneNextActions(detail){
    if(!detail||!Array.isArray(detail.nextActions))return detail;
    for(const a of detail.nextActions){const status=String(a?.status||"").toLowerCase();if(!["pending","snoozed"].includes(status))continue;if(!GENERIC_FOLLOW_RE.test(actionDescription(a)))continue;const latest=latestRelevantActivity(detail,actionDue(a));if(latest&&isPhoneNoAnswerActivity(latest))makePhoneActionSpecific(a)}return detail;
  }

  function readPhoneContexts(){try{const v=JSON.parse(sessionStorage.getItem(PHONE_CTX_KEY)||"{}");return v&&typeof v==="object"?v:{}}catch{return {}}}
  function writePhoneContexts(v){try{sessionStorage.setItem(PHONE_CTX_KEY,JSON.stringify(v))}catch{}}
  function savePhoneContext(prospectId,{dueDate="",activityDate=""}={}){
    if(!prospectId)return;const all=readPhoneContexts();all[prospectId]={dueDate:String(dueDate||"").slice(0,10),activityDate:String(activityDate||todayJst()).slice(0,10),savedAt:Date.now()};
    const cutoff=Date.now()-21*DAY_MS;for(const [id,c] of Object.entries(all)){if(Number(c?.savedAt||0)<cutoff)delete all[id]}writePhoneContexts(all);
  }
  function contextMatchesDue(ctx,dueDate){const due=dateMs(dueDate);if(!Number.isFinite(due)||!ctx)return false;if(ctx.dueDate&&ctx.dueDate===dueDate)return true;const act=dateMs(ctx.activityDate);return Number.isFinite(act)&&due>=act&&(due-act)<=7*DAY_MS}
  function followupProspectId(obj,inherited=""){return String(obj?.prospect_id||obj?.prospectId||obj?.prospect?.id||inherited||"")}
  function rewriteFollowupTree(node,inherited=""){
    if(!node)return node;if(Array.isArray(node)){node.forEach(x=>rewriteFollowupTree(x,inherited));return node}if(typeof node!=="object")return node;
    const pid=followupProspectId(node,inherited),due=actionDue(node),ctx=pid?readPhoneContexts()[pid]:null;
    if(pid&&ctx&&due&&contextMatchesDue(ctx,due)&&GENERIC_FOLLOW_RE.test(actionDescription(node)))makePhoneActionSpecific(node);
    for(const value of Object.values(node)){if(value&&typeof value==="object")rewriteFollowupTree(value,pid)}return node;
  }
  function findRecordProspectId(url){const m=String(url||"").match(/\/api\/prospects\/([^/?#]+)\/record-activity/);return m?decodeURIComponent(m[1]):""}
  function enhanceRecordResponse(data,prospectId,payload){
    if(!data||!prospectId)return data;pendingRefreshProspectId=prospectId;
    if(String(payload?.resultCode||"")==="phone_no_answer"){pendingPhoneResultProspectId=prospectId;const next=data?.nextAction||null;if(next){makePhoneActionSpecific(next);savePhoneContext(prospectId,{dueDate:actionDue(next),activityDate:todayJst()})}else savePhoneContext(prospectId,{activityDate:todayJst()})}
    return data;
  }
  function enhanceSalesDetailPayload(data){if(!data||typeof data!=="object")return data;if(Array.isArray(data.nextActions))rewritePhoneNextActions(data);if(data.detail&&Array.isArray(data.detail.nextActions))rewritePhoneNextActions(data.detail);if(data.salesDetail&&Array.isArray(data.salesDetail.nextActions))rewritePhoneNextActions(data.salesDetail);return data}

  window.fetch=async function(input,init){
    const path=pathOnly(input),payload=parseJsonBody(init),recordProspectId=findRecordProspectId(path),isRecord=!!recordProspectId,isSalesDetail=/\/api\/prospects\/[^/?#]+\/sales-detail(?:[?#]|$)/.test(path),isFollowups=/\/api\/follow-ups(?:[/?#]|$)/.test(path);
    const response=await baseFetch(input,init);if(!response?.ok||(!isRecord&&!isSalesDetail&&!isFollowups))return response;
    try{const data=await response.clone().json();if(isRecord)enhanceRecordResponse(data,recordProspectId,payload||{});if(isSalesDetail)enhanceSalesDetailPayload(data);if(isFollowups)rewriteFollowupTree(data);return cloneJsonResponse(response,data)}catch(e){console.warn("[V65.6] response enhancement skipped:",e);return response}
  };

  async function primePhoneContexts(){
    if(!token())return;try{const d=await apiGet("/api/activities?limit=500"),acts=Array.isArray(d.activities)?d.activities:[],recent=acts.filter(isPhoneNoAnswerActivity).sort((a,b)=>new Date(b?.activity_at||b?.created_at||0)-new Date(a?.activity_at||a?.created_at||0)),seen=new Set();
      for(const a of recent){const pid=String(a?.prospect_id||a?.prospectId||"");if(!pid||seen.has(pid))continue;seen.add(pid);savePhoneContext(pid,{activityDate:dateTextJst(a?.activity_at||a?.created_at)})}
    }catch(e){console.warn("[V65.6] phone context prime:",e)}
  }
  function currentDrawerProspectId(){return document.querySelector("#drawerBody .detail-hero [data-record-activity]")?.dataset.recordActivity||""}
  function refreshOpenDrawer(prospectId){
    if(!prospectId)return false;const drawer=document.querySelector("#detailDrawer");if(!drawer?.classList.contains("open")||currentDrawerProspectId()!==prospectId)return false;
    const proxy=document.createElement("button");proxy.type="button";proxy.hidden=true;proxy.dataset.prospect=prospectId;document.body.appendChild(proxy);proxy.click();proxy.remove();return true;
  }
  function enhanceSuccessModal(){
    const modal=document.querySelector("#modalBackdrop"),title=modal?.querySelector(".modal-head h3")?.textContent?.trim()||"";if(title!=="営業結果を保存しました")return;
    if(pendingPhoneResultProspectId){const result=modal.querySelector(".sales1111-result"),h4=result?.querySelector("h4"),p=result?.querySelector("p");if(h4)h4.textContent="次の行動｜再架電を確認";if(p)p.textContent="電話不通として保存しました。作成された次回予定を再架電として確認します。";pendingPhoneResultProspectId=""}
    if(pendingRefreshProspectId){const id=pendingRefreshProspectId;pendingRefreshProspectId="";setTimeout(()=>refreshOpenDrawer(id),80)}
  }

  function ensureStyle(){
    if(document.querySelector("#sales656Style"))return;const style=document.createElement("style");style.id="sales656Style";style.textContent=`
      .sales656-method-hint{margin-top:7px;padding:8px 10px;border:1px solid #9fd9c4;background:#f1fbf7;border-radius:9px;color:#315d4e;font-size:11px;line-height:1.55}
      .sales656-phone-no-answer{border-color:#e0b462!important;background:#fff8e9!important;color:#845604!important}
      .sales656-phone-no-answer.active{border-color:#0e8d67!important;background:#eefaf5!important;color:#087553!important}
      #sales65Command .sales65-title span{font-size:0!important;min-width:46px;text-align:center}
      #sales65Command .sales65-title span::after{content:"V65.6";font-size:10px!important}
    `;document.head.appendChild(style);
  }
  function enhanceActivityForm(){const form=document.querySelector("#activityForm");if(form)ensurePhoneNoAnswerButton(form)}
  function bindClicks(){
    document.addEventListener("click",e=>{
      if(e.target.closest("#importSelectedBtn"))captureImportContext();
      const imported=e.target.closest("[data-sales65-open-imported]");if(imported){const displayName=imported.dataset.sales65OpenImported||"";setTimeout(()=>openResolvedImported(displayName),0)}
      const record=e.target.closest("[data-record-activity]");if(record)setTimeout(()=>handoffQueueMethod(record),0);
      if(e.target.closest('[data-result-choice="phone_no_answer"]'))setTimeout(()=>applyPhoneNoAnswerPreview(document.querySelector("#activityForm")),0);
    },true);
  }
  function bindObserver(){
    const root=document.body||document.documentElement;if(!root||typeof MutationObserver!=="function")return;let scheduled=false;
    new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;enhanceActivityForm();enhanceSuccessModal()})}).observe(root,{childList:true,subtree:true});
  }
  function init(){ensureStyle();bindClicks();bindObserver();enhanceActivityForm();primePhoneContexts()}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();

  window.__DPRO_SALES656_PRODUCTION_HARDENING__=true;
  window.DPRO_SALES656=Object.freeze({version:VERSION});
  window.DPRO_SALES656_TEST=Object.freeze({readMethod,scoreProspect,isPhoneNoAnswerActivity,rewritePhoneNextActions,makePhoneActionSpecific,contextMatchesDue});
})();
