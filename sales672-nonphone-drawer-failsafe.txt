/*
 * DPRO SALESNAVI V67.2
 * Version: SALESNAVI-67.2-NONPHONE-DRAWER-FAILSAFE-20260819
 *
 * Reliable non-phone sales panel for dynamically rendered prospect drawers.
 * - Detects an open prospect drawer with a lightweight finite-state poll.
 * - Hides the native V1.1-9 phone-first flow only while V67.2 is active.
 * - CONTACT / Email / Instagram / Existing-relation LINE / Other.
 * - Generates editable outreach copy with one primary LP.
 * - Records only after explicit "actually sent" confirmation.
 * - Creates 4-day reply_check and completes today's active queue.
 * - Phone is kept only as a fallback.
 *
 * No Worker / SQL / DB schema change.
 */
(() => {
  'use strict';

  const VERSION = 'SALESNAVI-67.2-NONPHONE-DRAWER-FAILSAFE-20260819';
  const ACTIVE_QUEUE = new Set(['queued','planned','in_progress']);
  const sentLocks = new Set();
  let lastProspectId = '';
  let pulseTimer = null;

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];

  function cfg(){ return window.DPRO_CONFIG || {}; }
  function session(){
    try{return JSON.parse(localStorage.getItem(cfg().sessionStorageKey || 'dpro_sales_session_v3') || 'null')}catch{return null}
  }
  function token(){ return session()?.token || ''; }
  function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

  async function request(path,{method='GET',body=null}={}){
    const headers={Accept:'application/json'};
    if(body!==null)headers['Content-Type']='application/json; charset=utf-8';
    if(token())headers.Authorization=`Bearer ${token()}`;
    const res=await fetch(String(cfg().apiBaseUrl||'')+path,{method,headers,body:body===null?undefined:JSON.stringify(body),credentials:'omit',cache:'no-store'});
    let data={}; try{data=await res.json()}catch{}
    if(!res.ok||data.ok===false)throw new Error(data.message||data.error||`APIエラー (${res.status})`);
    return data;
  }

  function toast(message,type='success'){
    const stack=$('#toastStack');
    if(stack){const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;stack.appendChild(el);setTimeout(()=>el.remove(),5200);return}
    console[type==='error'?'error':'log']('[V67.2]',message);
  }

  function todayJst(){
    const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const o=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${o.year}-${o.month}-${o.day}`;
  }
  function addDays(dateText,days){const d=new Date(`${dateText}T12:00:00+09:00`);d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  function fmtDate(dateText){try{return new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',weekday:'short'}).format(new Date(`${dateText}T00:00:00+09:00`))}catch{return dateText}}

  function prospectId(){return $('#drawerBody [data-record-activity]')?.dataset.recordActivity||''}
  function prospectName(){return $('#drawerBody .detail-hero h2')?.textContent?.trim()||'この店舗'}
  function phoneHref(){return $('#drawerBody .detail-hero a[href^="tel:"]')?.href||''}
  function websiteHref(){
    const hero=$$('#drawerBody .detail-hero a[href]');
    return hero.find(a=>/WEBサイト|Webサイト|ホームページ|公式サイト/.test(a.textContent||''))?.href||'';
  }
  function lpHref(){
    return $$('#drawerBody a[href]').find(a=>/営業LP|提案LP/.test(a.textContent||''))?.href||'';
  }
  function productBox(){return $$('#drawerBody .detail-box').find(b=>/提案するDPROシステム/.test(b.querySelector('h4')?.textContent||''))||null}
  function featureBox(){return $$('#drawerBody .detail-box').find(b=>/店舗に響く機能/.test(b.querySelector('h4')?.textContent||''))||null}
  function productName(){
    const box=productBox();const txt=box?.querySelector('p')?.innerText||'';return txt.split(/\n+/).map(x=>x.trim()).filter(Boolean)[0]||'DPROの店舗向けシステム';
  }
  function features(){return featureBox()?$$('li',featureBox()).map(li=>li.textContent.trim()).filter(Boolean).slice(0,3):[]}

  function nativeFlow(){return $$('#drawerBody .detail-box').find(b=>/V1\.1-9\s*営業実行フロー/.test(b.querySelector('h4')?.textContent||''))||null}
  function hideNativeFlow(){const n=nativeFlow();if(n)n.classList.add('sales672-native-hidden')}
  function showNativeFlow(){const n=nativeFlow();if(n)n.classList.remove('sales672-native-hidden')}

  function contactSearch(name,web){
    let q=`${name} お問い合わせ contact`;
    try{if(web)q=`site:${new URL(web).hostname.replace(/^www\./,'')} お問い合わせ contact`}catch{}
    return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }
  function instagramSearch(name){return `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com "${name}"`)}`}
  function emailSearch(name,web){
    let q=`${name} メール お問い合わせ`;
    try{if(web)q=`site:${new URL(web).hostname.replace(/^www\./,'')} メール お問い合わせ`}catch{}
    return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }

  const CHANNELS={
    contact:{label:'WEB CONTACT／問い合わせフォーム',activityType:'other',resultCode:'outreach_contact_sent',summary:'CONTACTフォームで提案LP送付',follow:'CONTACT送信の反応・返信確認'},
    email:{label:'公開メール',activityType:'email',resultCode:'outreach_email_sent',summary:'メールで提案LP送付',follow:'メール送付の反応・返信確認'},
    instagram:{label:'Instagram DM',activityType:'other',resultCode:'outreach_instagram_sent',summary:'Instagram DMで提案LP送付',follow:'Instagram DM送付の反応・返信確認'},
    line_existing:{label:'個人LINE（既存関係・了承あり）',activityType:'line',resultCode:'outreach_line_existing_sent',summary:'既存関係LINEで提案LP送付',follow:'LINE送付の反応・返信確認'},
    other:{label:'その他の公開窓口',activityType:'other',resultCode:'outreach_other_sent',summary:'公開窓口から提案LP送付',follow:'送付先の反応・返信確認'}
  };

  function template(channel){
    const name=prospectName(), product=productName(), lp=lpHref()||'【提案LP URL】';
    const fs=features(); const feature=fs.length?fs.join('・'):'予約や再来店フォローなどの店舗運営機能';
    if(channel==='instagram')return `突然のDM失礼いたします。DPROです。\n\n${name}様にもご覧いただけそうな「${product}」を制作しています。${feature}などをまとめています。\n\nお電話での営業ではなく、お時間のある時に1分ほどで実際の画面だけご覧いただければと思いお送りしました。\n${lp}\n\nご興味がなければご返信は不要です。`;
    if(channel==='email')return `件名：${name}様へ｜${product}のご案内\n\n${name} ご担当者様\n\n突然のご連絡失礼いたします。DPROです。\n\n店舗向けに「${product}」を制作しており、${feature}などをまとめています。\n営業のお電話ではなく、お時間のある際に実際の画面だけご覧いただければと思い、ご案内をお送りしました。\n\n▼ご案内\n${lp}\n\nご興味がなければご返信は不要です。店舗運営の参考になる部分だけでもご覧いただけましたら幸いです。`;
    if(channel==='line_existing')return `突然すみません。DPROで店舗向けに「${product}」というシステムを作りました。\n\n${feature}などをまとめています。もし興味があれば、お時間のある時にこちらだけ見てみてください。\n${lp}\n\n無理に返信は大丈夫です。`;
    if(channel==='other')return `突然のご連絡失礼いたします。DPROです。\n\n${name}様に合いそうな店舗向けの「${product}」をご案内したく、ご連絡しました。${feature}などをまとめています。\n\nお時間のある際に、実際の画面をこちらからご覧いただけます。\n${lp}\n\nご興味がなければご返信は不要です。`;
    return `突然のご連絡失礼いたします。DPROです。\n\n${name}様にもご覧いただけそうな店舗向けの「${product}」を制作しています。${feature}などをまとめています。\n\n営業のお電話ではなく、お時間のある際に実際の画面だけご覧いただければと思い、ご連絡しました。\n\n▼ご案内\n${lp}\n\nご興味がなければご返信は不要です。店舗運営の参考になる部分だけでもご覧いただけましたら幸いです。`;
  }

  async function copyText(text){
    try{await navigator.clipboard.writeText(text);return true}catch{}
    try{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();return ok}catch{return false}
  }

  function openConfig(channel){
    const name=prospectName(), web=websiteHref();
    if(channel==='contact')return {label:web?'WEBサイトを開く':'CONTACT候補を探す',url:web||contactSearch(name,web),second:'CONTACTを検索',secondUrl:contactSearch(name,web)};
    if(channel==='email')return {label:'公開メールを探す',url:emailSearch(name,web),second:web?'WEBサイトを開く':'',secondUrl:web||''};
    if(channel==='instagram')return {label:'Instagram候補を探す',url:instagramSearch(name),second:web?'WEBサイトを開く':'',secondUrl:web||''};
    if(channel==='line_existing')return {label:'個人LINEは手動で開く',url:'',second:'',secondUrl:''};
    return {label:web?'WEBサイトを開く':'送信先候補を探す',url:web||contactSearch(name,''),second:'',secondUrl:''};
  }

  function ensureStyle(){
    if($('#sales672Style'))return;
    const s=document.createElement('style');s.id='sales672Style';s.textContent=`
      #sales65Command,#sales67Command{display:none!important}
      .sales672-native-hidden{display:none!important}
      .sales672{margin:14px 0;border:2px solid #70c5a4;background:linear-gradient(180deg,#f5fcf9,#ebf8f3);border-radius:17px;padding:16px}
      .sales672-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.sales672-head h4{margin:0;color:#087553;font-size:18px}.sales672-ver{font-size:11px;color:#477466;background:#fff;border:1px solid #cce8dd;padding:5px 8px;border-radius:999px}
      .sales672-lead{font-size:13px;line-height:1.7;color:#526779}.sales672-policy{padding:10px 11px;border:1px solid #cfe7dc;background:#fff;border-radius:11px;font-size:12px;line-height:1.7;margin:10px 0}.sales672-policy b{color:#087553}
      .sales672-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.sales672-box{background:#fff;border:1px solid #dcebe5;border-radius:10px;padding:10px}.sales672-box small{display:block;color:#758797;font-size:11px}.sales672-box b{display:block;margin-top:3px;font-size:13px;color:#2d4b40}
      .sales672 label{display:block;font-weight:800;font-size:13px;color:#40556a;margin:12px 0 6px}.sales672 select,.sales672 textarea{width:100%;border:1px solid #c9d8e3;border-radius:11px;padding:11px 12px;font:inherit;font-size:13px;background:#fff;color:#263950}.sales672 textarea{min-height:190px;line-height:1.7;resize:vertical}
      .sales672-open,.sales672-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}.sales672-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.sales672-actions .btn{min-height:42px;font-size:13px}.sales672-primary{grid-column:1/-1;background:linear-gradient(135deg,#148e69,#087354)!important;color:#fff!important}
      .sales672-warn{display:none;margin-top:9px;padding:9px 10px;border:1px solid #ebd39c;background:#fff9e9;border-radius:10px;color:#735a22;font-size:11px;line-height:1.6}.sales672-warn.show{display:block}.sales672-check{margin-top:10px;padding:9px 10px;border:1px solid #dfe7ec;background:#f8fafb;border-radius:10px;color:#66788a;font-size:11px;line-height:1.6}.sales672-fallback{margin-top:9px;padding-top:9px;border-top:1px dashed #cbd9d3;font-size:11px;color:#7a8998}
      @media(max-width:640px){.sales672-grid,.sales672-actions{grid-template-columns:1fr}.sales672-primary{grid-column:auto}}
    `;document.head.appendChild(s);
  }

  async function fetchDetail(id){return request(`/api/prospects/${encodeURIComponent(id)}/sales-detail`)}
  async function fetchQueue(){const d=await request(`/api/sales-queue?date=${encodeURIComponent(todayJst())}`);return Array.isArray(d.queueItems)?d.queueItems:[]}
  function activeQueue(items,id){return items.find(q=>q?.prospect_id===id&&ACTIVE_QUEUE.has(String(q.queue_status||'queued')))||null}
  function pendingReply(detail){return (detail?.nextActions||[]).some(a=>['pending','snoozed'].includes(String(a?.status||''))&&String(a?.action_type||'')==='reply_check')}

  async function recordSent(id,channel){
    const info=CHANNELS[channel];if(!id||!info||sentLocks.has(id))return;
    const due=addDays(todayJst(),4);
    if(!confirm(`${prospectName()}\n\n実際に「${info.label}」から提案LPを送信済みですか？\n\n送信済みとして記録し、${fmtDate(due)}に反応・返信確認を作成します。`))return;
    sentLocks.add(id);const btn=$('#sales672 [data-record-sent]');if(btn){btn.disabled=true;btn.textContent='記録中…'}
    try{
      const [detail,queue]=await Promise.all([fetchDetail(id),fetchQueue()]);const q=activeQueue(queue,id);
      const body={activityType:info.activityType,resultCode:info.resultCode,summary:info.summary,details:`${info.label}から提案LPを送付。非電話営業。`,isOwnerContact:false,applyRule:false,completeQueue:true,metadata:{sales672:true,version:VERSION,channel,material:'sales_lp',nonPhone:true,followDays:4}};
      if(q?.id)body.queueItemId=q.id;
      if(!pendingReply(detail))body.nextAction={actionType:'reply_check',dueDate:due,description:info.follow,priority:'normal',isPrimary:true,metadata:{sales672:true,channel,material:'sales_lp'}};
      await request(`/api/prospects/${encodeURIComponent(id)}/record-activity`,{method:'POST',body});toast(`${info.label}の送信済みを記録しました。反応確認：${fmtDate(due)}`);updateStatus(id);
    }catch(e){toast(e.message||'送信済みを記録できませんでした。','error')}finally{sentLocks.delete(id);if(btn)btn.disabled=false;renderChannel($('#sales672 [data-channel]')?.value||channel)}
  }

  async function updateStatus(id){
    const root=$('#sales672');if(!root||root.dataset.prospectId!==id)return;
    try{const [detail,queue]=await Promise.all([fetchDetail(id),fetchQueue()]);const acts=(detail.activities||[]).filter(a=>String(a.result_code||'').startsWith('outreach_'));root.querySelector('[data-status]')?.replaceChildren(document.createTextNode(acts.length?'送信記録あり':'本日の送信記録なし'));const next=(detail.nextActions||[]).filter(a=>['pending','snoozed'].includes(String(a.status||''))).sort((a,b)=>String(a.due_date||'').localeCompare(String(b.due_date||'')))[0];root.querySelector('[data-next]')?.replaceChildren(document.createTextNode(next?`${fmtDate(next.due_date)} ${next.description||'反応確認'}`:'次回予定なし'));const q=activeQueue(queue,id);const qb=root.querySelector('[data-queue]');if(qb){qb.disabled=!!q;qb.textContent=q?'今日の営業に登録済み':'今日の営業へ追加'}}catch(e){console.warn('[V67.2] status',e)}
  }

  function renderChannel(channel){
    const root=$('#sales672');if(!root)return;const cfg=openConfig(channel);const ta=root.querySelector('[data-template]');if(ta)ta.value=template(channel);const p=root.querySelector('[data-open-primary]');if(p){p.textContent=cfg.label;p.dataset.href=cfg.url||'';p.disabled=!cfg.url}const s=root.querySelector('[data-open-second]');if(s){s.textContent=cfg.second||'';s.dataset.href=cfg.secondUrl||'';s.classList.toggle('hidden',!cfg.secondUrl)}const w=root.querySelector('[data-warn]');if(w){w.classList.toggle('show',channel==='line_existing');w.textContent=channel==='line_existing'?'個人LINEは一斉営業には使わず、既存の個人的関係があり、相手が案内を受けてもよい場合だけ使用してください。':''}const rec=root.querySelector('[data-record-sent]');if(rec)rec.textContent=`${CHANNELS[channel].label}を送信済みとして記録`;
  }

  function render(id){
    const body=$('#drawerBody'),hero=body?.querySelector('.detail-hero');if(!body||!hero||!id)return;
    ensureStyle();hideNativeFlow();$('#sales67Command')?.remove();
    let root=$('#sales672');if(root&&root.dataset.prospectId!==id){root.remove();root=null}
    if(!root){root=document.createElement('section');root.id='sales672';root.className='sales672';root.dataset.prospectId=id;hero.insertAdjacentElement('afterend',root)}
    const web=websiteHref(),phone=phoneHref(),recommended=web?'contact':'instagram';
    root.innerHTML=`<div class="sales672-head"><h4>非電話営業ナビ</h4><span class="sales672-ver">V67.2</span></div><p class="sales672-lead">相手の営業時間を邪魔せず、短い文章＋提案LPを1本だけ届ける営業フローです。</p><div class="sales672-policy"><b>基本：</b> CONTACT → 公開メール → Instagram DM → その他公開窓口。個人LINEは既存関係・了承ありの場合のみ。電話は補助手段です。</div><div class="sales672-grid"><div class="sales672-box"><small>今日の送信</small><b data-status>確認中…</b></div><div class="sales672-box"><small>次の確認</small><b data-next>確認中…</b></div></div><label>今回の送信方法</label><select data-channel><option value="contact">WEB CONTACT／問い合わせフォーム</option><option value="email">公開メール</option><option value="instagram">Instagram DM</option><option value="line_existing">個人LINE（既存関係・了承あり）</option><option value="other">その他の公開窓口</option></select><div class="sales672-warn" data-warn></div><div class="sales672-open"><button class="btn btn-outline" type="button" data-open-primary></button><button class="btn btn-outline hidden" type="button" data-open-second></button><button class="btn btn-outline" type="button" data-open-lp ${lpHref()?'':'disabled'}>提案LPを確認</button></div><label>送信文</label><textarea data-template></textarea><div class="sales672-actions"><button class="btn btn-outline" type="button" data-copy>この営業文をコピー</button><button class="btn btn-outline" type="button" data-queue>今日の営業へ追加</button><button class="btn sales672-primary" type="button" data-record-sent>送信済みとして記録</button><button class="btn btn-secondary" type="button" data-follow>フォローアップを確認</button></div><div class="sales672-check">送信前：営業・勧誘禁止の窓口には送らない／同じ店舗へ重複送信しない／最初はLPを1本だけ送る。</div><div class="sales672-fallback">補助手段：${phone?`<a class="btn btn-outline btn-sm" href="${esc(phone)}">必要な場合だけ電話</a>`:'電話番号未取得'} ${web?`<a class="btn btn-outline btn-sm" href="${esc(web)}" target="_blank" rel="noopener">WEBサイト</a>`:''}</div>`;
    const sel=root.querySelector('[data-channel]');sel.value=recommended;renderChannel(recommended);updateStatus(id);
  }

  function pulse(){
    try{
      const id=prospectId();const open=$('#detailDrawer')?.classList.contains('open');
      if(open&&id){if(id!==lastProspectId||!$('#sales672')){lastProspectId=id;render(id)}else hideNativeFlow()}
      else{lastProspectId='';$('#sales672')?.remove();showNativeFlow()}
    }catch(e){console.error('[V67.2] pulse failed',e)}
  }

  function bind(){
    document.addEventListener('change',e=>{const s=e.target.closest('#sales672 [data-channel]');if(s)renderChannel(s.value)},true);
    document.addEventListener('click',async e=>{
      const root=e.target.closest('#sales672');if(!root)return;
      const open=e.target.closest('[data-open-primary],[data-open-second]');if(open){const href=open.dataset.href||'';if(href)window.open(href,'_blank','noopener');else toast('この送信先は手動で開いてください。');return}
      if(e.target.closest('[data-open-lp]')){const href=lpHref();if(href)window.open(href,'_blank','noopener');else toast('提案LPを確認できませんでした。','error');return}
      if(e.target.closest('[data-copy]')){const ok=await copyText(root.querySelector('[data-template]')?.value||'');toast(ok?'営業文をコピーしました。':'コピーできませんでした。',ok?'success':'error');return}
      if(e.target.closest('[data-record-sent]')){recordSent(root.dataset.prospectId,root.querySelector('[data-channel]')?.value||'contact');return}
      if(e.target.closest('[data-queue]')){const id=root.dataset.prospectId;const native=$(`#drawerBody [data-sales64-direct-queue="${CSS.escape(id)}"]`);if(native)native.click();else{const hero=$(`#drawerBody [data-record-activity="${CSS.escape(id)}"]`)?.closest('.detail-hero');const add=$$('button',hero||document).find(b=>/今日の営業へ追加/.test(b.textContent||''));if(add)add.click();else toast('今日の営業への追加ボタンを確認できませんでした。','error')}return}
      if(e.target.closest('[data-follow]')){$('#drawerClose')?.click();const nav=$$('.nav-btn[data-view]').find(x=>(x.textContent||'').includes('フォローアップ'));nav?.click();return}
    },true);
  }

  function init(){ensureStyle();bind();pulseTimer=setInterval(pulse,350);pulse();document.documentElement.dataset.sales672=VERSION}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.DPRO_SALES672=Object.freeze({version:VERSION});
})();
