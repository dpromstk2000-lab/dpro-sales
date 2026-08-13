/* DPRO SALES — INDUSTRY PROPOSAL QUICK LINK 2026-08-14 */
(() => {
  "use strict";
  const cfg = window.DPRO_CONFIG || {};
  const HUB = cfg.proposalHubUrl || "https://dpromstk2000-lab.github.io/dpro-line-systems-site/proposal.html";
  const MARK = "data-dpro-proposal-linked";

  const escParam = value => encodeURIComponent(String(value || "").trim());
  const proposalHref = productName => `${HUB}?source=salesnavi&name=${escParam(productName || "")}#proposals`;

  function getDesktopProductName(card){
    const spans = [...card.querySelectorAll(".queue-main .meta > span")].filter(x => !x.classList.contains("badge"));
    return (spans[1]?.textContent || spans[0]?.textContent || "").trim();
  }
  function getStaffProductName(card){
    const badges = [...card.querySelectorAll(".queue-tags .badge")];
    return (badges[1]?.textContent || "").trim();
  }

  function makeQuickLink(productName, compact){
    const a = document.createElement("a");
    a.href = proposalHref(productName);
    a.target = "_blank";
    a.rel = "noopener";
    a.className = compact ? "btn btn-outline btn-small dpro-proposal-quick" : "btn btn-outline btn-sm dpro-proposal-quick";
    a.textContent = "業種別提案";
    a.setAttribute("aria-label", `${productName || "該当業種"}の業種別提案を開く`);
    a.style.borderColor = "#d99aae";
    a.style.background = "#fff5f8";
    a.style.color = "#9f1740";
    a.style.textDecoration = "none";
    return a;
  }

  function enhanceDesktopQueue(){
    document.querySelectorAll(".queue-card").forEach(card => {
      const actions = card.querySelector(".queue-buttons");
      if (!actions || actions.getAttribute(MARK) === "1") return;
      const name = getDesktopProductName(card);
      actions.appendChild(makeQuickLink(name, false));
      actions.setAttribute(MARK, "1");
    });
  }

  function enhanceStaffQueue(){
    document.querySelectorAll(".queue-card").forEach(card => {
      const actions = card.querySelector(".queue-actions");
      if (!actions || actions.getAttribute(MARK) === "1") return;
      const name = getStaffProductName(card);
      const link = makeQuickLink(name, true);
      link.style.minHeight = "44px";
      actions.appendChild(link);
      actions.style.gridTemplateColumns = "repeat(2,minmax(0,1fr))";
      actions.setAttribute(MARK, "1");
    });
  }

  function addGenericDesktopNav(){
    const nav = document.querySelector(".nav");
    if (!nav || nav.querySelector("[data-proposal-hub-link]")) return;
    const label = document.createElement("div");
    label.className = "nav-label";
    label.textContent = "PRODUCT SITE";
    label.dataset.proposalHubLink = "label";
    const a = document.createElement("a");
    a.className = "nav-btn";
    a.href = HUB;
    a.target = "_blank";
    a.rel = "noopener";
    a.dataset.proposalHubLink = "1";
    a.innerHTML = '<span class="nav-icon">▣</span><span>業種別提案</span>';
    a.style.textDecoration = "none";
    nav.append(label, a);
  }

  function addGenericStaffTop(){
    const actions = document.querySelector(".top-actions");
    if (!actions || actions.querySelector("[data-proposal-hub-link]")) return;
    const a = document.createElement("a");
    a.className = "icon-btn";
    a.href = HUB;
    a.target = "_blank";
    a.rel = "noopener";
    a.dataset.proposalHubLink = "1";
    a.setAttribute("aria-label","業種別提案を開く");
    a.title = "業種別提案";
    a.textContent = "▣";
    a.style.textDecoration = "none";
    a.style.color = "#9f1740";
    actions.insertBefore(a, actions.firstChild);
  }

  function replaceLabels(root=document.body){
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const parent = node.parentElement;
      if (!parent || parent.closest("script,style,noscript")) return;
      let v = node.nodeValue || "";
      v = v.replace(/業種別営業LP URL/g, "業種別提案URL");
      v = v.replace(/業種別営業LP/g, "業種別提案");
      v = v.replace(/営業LP・DEMO・提案書・LINE営業文/g, "業種別提案・DEMO・提案書・LINE営業文");
      node.nodeValue = v;
    });
  }

  let scheduled = false;
  function run(){
    scheduled = false;
    enhanceDesktopQueue();
    enhanceStaffQueue();
    addGenericDesktopNav();
    addGenericStaffTop();
    replaceLabels();
  }
  function schedule(){
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, {once:true});
  else run();
  new MutationObserver(schedule).observe(document.documentElement, {subtree:true, childList:true});
})();
