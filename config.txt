window.DPRO_CONFIG = Object.freeze({
  systemCode: "SALES",
  appName: "DPRO SALES",
  environment: "production",
  apiBaseUrl: "https://dpro-sales-line-api.dpromstk2000.workers.dev",
  defaultFacilityCode: "dpro_sales",
  sessionStorageKey: "dpro_sales_session_v3",
  indexVersion: "SALES-50-INDEX-20260811",
  releaseVersion: "DPRO-SALES-V1.1-21-20260812",
  productMasterVersion: "DPRO-SALES-V1.1-3-MASTER50-20260811",
  ownerVersion: "DPRO-SALES-V1.1-21-OWNER-20260812",
  ownerIpadVersion: "SALES-12-OWNER-IPAD-20260804",
  staffVersion: "DPRO-SALES-V1.1-5-R3-STAFF-20260811",
  teamVersion: "SALES-48-TEAM-20260811",
  channelResearchVersion: "DPRO-SALES-V1.1-5-R3-CHANNEL-RESEARCH-20260811",
  systemCheckVersion: "SALES-49-SYSTEM-CHECK-20260811",
  proposalHubUrl: "https://dpromstk2000-lab.github.io/dpro-line-systems-site/proposal.html",
  proposalLinkVersion: "SALESNAVI-61-TOP5-RERENDER-LOCK-20260814",
  activityMethodHandoffVersion: "SALESNAVI-63-ACTIVITY-METHOD-HANDOFF-20260814",
  directQueueVersion: "SALESNAVI-64-R1-QUEUE-SPINNER-FIX-20260814",
  usabilityVersion: "SALESNAVI-65.6-PRODUCTION-FLOW-HARDENING-20260815",
  timezone: "Asia/Tokyo"
});

(function(){
  "use strict";
  if (typeof document === "undefined") return;
  var s = document.createElement("script");
  s.src = "./sales-proposal-link.js?v=20260814-61";
  s.async = true;
  document.head.appendChild(s);
})();

/* V63: queue sales method -> activity result method handoff */
(function(){
  "use strict";
  if (typeof document === "undefined") return;
  var path = String(location.pathname || "").toLowerCase();
  if (!path.endsWith("/owner.html") && !path.endsWith("owner.html")) return;
  if (document.querySelector('script[data-sales63-activity-method]')) return;
  var s = document.createElement("script");
  s.src = "./sales63-activity-method-handoff.js?v=20260814-63";
  s.async = false;
  s.dataset.sales63ActivityMethod = "1";
  document.head.appendChild(s);
})();

/* V64-R1: registered prospect -> today's queue + explicit sales method */
(function(){
  "use strict";
  if (typeof document === "undefined") return;
  var path = String(location.pathname || "").toLowerCase();
  if (!path.endsWith("/owner.html") && !path.endsWith("owner.html")) return;
  if (document.querySelector('script[data-sales64-direct-queue]')) return;
  var s = document.createElement("script");
  s.src = "./sales64-direct-queue.js?v=20260814-64r1";
  s.async = false;
  s.dataset.sales64DirectQueue = "1";
  document.head.appendChild(s);
})();

/* V65.4: LINE follow-up context correction */
(function(){
  "use strict";
  if (typeof document === "undefined") return;
  var path = String(location.pathname || "").toLowerCase();
  if (!path.endsWith("/owner.html") && !path.endsWith("owner.html")) return;
  if (document.querySelector('script[data-sales654-followup-context]')) return;
  var s = document.createElement("script");
  s.src = "./sales654-followup-context.js?v=20260815-654";
  s.async = false;
  s.dataset.sales654FollowupContext = "1";
  document.head.appendChild(s);
})();

/* V65.2 base: production sales quick flow + unified detail display */
(function(){
  "use strict";
  if (typeof document === "undefined") return;
  var path = String(location.pathname || "").toLowerCase();
  if (!path.endsWith("/owner.html") && !path.endsWith("owner.html")) return;
  if (document.querySelector('script[data-sales65-quick-sales]')) return;
  var s = document.createElement("script");
  s.src = "./sales65-quick-sales.js?v=20260814-652";
  s.async = false;
  s.dataset.sales65QuickSales = "1";
  document.head.appendChild(s);
})();

/* V65.5: DPRO PET CARE LINE -> central VET material mapping */
(function(){
  "use strict";
  if (typeof document === "undefined") return;
  var path = String(location.pathname || "").toLowerCase();
  if (!path.endsWith("/owner.html") && !path.endsWith("owner.html")) return;
  if (document.querySelector('script[data-sales655-pet-care-material]')) return;
  var s = document.createElement("script");
  s.src = "./sales655-pet-care-material.js?v=20260815-655";
  s.async = false;
  s.dataset.sales655PetCareMaterial = "1";
  document.head.appendChild(s);
})();

/* V65.6: real-sales production flow hardening */
(function(){
  "use strict";
  if (typeof document === "undefined") return;
  var path = String(location.pathname || "").toLowerCase();
  if (!path.endsWith("/owner.html") && !path.endsWith("owner.html")) return;
  if (document.querySelector('script[data-sales656-production-hardening]')) return;
  var s = document.createElement("script");
  s.src = "./sales656-production-hardening.js?v=20260815-656";
  s.async = false;
  s.dataset.sales656ProductionHardening = "1";
  document.head.appendChild(s);
})();

/* DPRO SALES NAVI favicon: green S */
(function(){
  "use strict";
  if (typeof document === "undefined" || !document.head) return;
  var svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0%" stop-color="#33c69a"/>' +
        '<stop offset="100%" stop-color="#0b8060"/>' +
      '</linearGradient></defs>' +
      '<rect width="64" height="64" rx="16" fill="url(#g)"/>' +
      '<text x="32" y="33" text-anchor="middle" dominant-baseline="middle" ' +
        'font-family="Arial,Helvetica,sans-serif" font-size="40" font-weight="700" fill="#ffffff">S</text>' +
    '</svg>';
  document.querySelectorAll('link[rel~="icon"]').forEach(function(el){ el.remove(); });
  var icon = document.createElement("link");
  icon.rel = "icon";
  icon.type = "image/svg+xml";
  icon.href = "data:image/svg+xml," + encodeURIComponent(svg);
  icon.setAttribute("data-dpro-sales-favicon", "green-s");
  document.head.appendChild(icon);
})();
