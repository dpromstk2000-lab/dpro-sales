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
  usabilityVersion: "SALESNAVI-65.8-STALE-QUEUE-RECOVERY-20260815",
  searchBrushupVersion: "SALESNAVI-66-REAL-SALES-SEARCH-BRUSHUP-20260819",
  currentLocationSearchVersion: "SALESNAVI-66.6-SEARCH-SPINNER-FIX-20260819",
  currentLocationVisibilityVersion: "SALESNAVI-66.3-CURRENT-LOCATION-VISIBILITY-20260819",
  readableTextVersion: "SALESNAVI-66.4-READABLE-TEXT-20260819",
  locationDisplayFixVersion: "SALESNAVI-66.5-LOCATION-DISPLAY-FIX-20260819",
  searchSpinnerFixVersion: "SALESNAVI-66.6-SEARCH-SPINNER-FIX-20260819",
  nonPhoneOutreachVersion: "SALESNAVI-67.2-NONPHONE-DRAWER-FAILSAFE-20260819",
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

(function(){
  "use strict";
  if (typeof document === "undefined") return;
  var path = String(location.pathname || "").toLowerCase();
  if (!path.endsWith("/owner.html") && !path.endsWith("owner.html")) return;
  if (document.querySelector('script[data-sales657-queue-complete]')) return;
  var s = document.createElement("script");
  s.src = "./sales657-queue-complete-handoff.js?v=20260815-657";
  s.async = false;
  s.dataset.sales657QueueComplete = "1";
  document.head.appendChild(s);
})();

(function(){
  "use strict";
  if (typeof document === "undefined") return;
  var path = String(location.pathname || "").toLowerCase();
  if (!path.endsWith("/owner.html") && !path.endsWith("owner.html")) return;
  if (document.querySelector('script[data-sales658-stale-queue]')) return;
  var s = document.createElement("script");
  s.src = "./sales658-stale-queue-recovery.js?v=20260815-658";
  s.async = false;
  s.dataset.sales658StaleQueue = "1";
  document.head.appendChild(s);
})();

(function(){
  "use strict";
  if (typeof document === "undefined") return;
  var path = String(location.pathname || "").toLowerCase();
  var isOwner = path.endsWith("/owner.html") || path.endsWith("owner.html");
  var isStaff = path.endsWith("/staff.html") || path.endsWith("staff.html");
  if (!isOwner && !isStaff) return;
  if (document.querySelector('script[data-sales66-search-brushup]')) return;
  var s = document.createElement("script");
  s.src = "./sales66-search-brushup.js?v=20260819-66";
  s.async = false;
  s.dataset.sales66SearchBrushup = "1";
  document.head.appendChild(s);
})();

(function(){
  "use strict";
  if (typeof document === "undefined") return;
  var path = String(location.pathname || "").toLowerCase();
  if (!path.endsWith("/owner.html") && !path.endsWith("owner.html")) return;
  if (document.querySelector('script[data-sales662-current-location]')) return;
  var s = document.createElement("script");
  s.src = "./sales662-current-location-search.js?v=20260819-666";
  s.async = false;
  s.dataset.sales662CurrentLocation = "1";
  document.head.appendChild(s);
})();

(function(){
  "use strict";
  if (typeof document === "undefined") return;
  var path = String(location.pathname || "").toLowerCase();
  if (!path.endsWith("/owner.html") && !path.endsWith("owner.html")) return;
  if (document.querySelector('script[data-sales663-current-location-visibility]')) return;
  var s = document.createElement("script");
  s.src = "./sales663-current-location-visibility.js?v=20260819-663";
  s.async = false;
  s.dataset.sales663CurrentLocationVisibility = "1";
  document.head.appendChild(s);
})();

/* V66.4: readable text */
(function(){
  "use strict";
  if (typeof document === "undefined") return;
  var path = String(location.pathname || "").toLowerCase();
  if (!path.endsWith("/owner.html") && !path.endsWith("owner.html")) return;
  if (document.querySelector('script[data-sales664-readable-text]')) return;
  var s = document.createElement("script");
  s.src = "./sales664-readable-text.js?v=20260819-664";
  s.async = false;
  s.dataset.sales664ReadableText = "1";
  document.head.appendChild(s);
})();


/* V66.5: acquired-current-location visible confirmation */
(function(){
  "use strict";
  if (typeof document === "undefined") return;
  var path = String(location.pathname || "").toLowerCase();
  if (!path.endsWith("/owner.html") && !path.endsWith("owner.html")) return;
  if (document.querySelector('script[data-sales665-location-display-fix]')) return;
  var s = document.createElement("script");
  s.src = "./sales665-location-display-fix.js?v=20260819-665";
  s.async = false;
  s.dataset.sales665LocationDisplayFix = "1";
  document.head.appendChild(s);
})();


/* V67: non-phone outreach as the default real-sales flow */
(function(){
  "use strict";
  if (typeof document === "undefined") return;
  var path = String(location.pathname || "").toLowerCase();
  if (!path.endsWith("/owner.html") && !path.endsWith("owner.html")) return;
  if (document.querySelector('script[data-sales67-nonphone-outreach]')) return;
  var s = document.createElement("script");
  s.src = "./sales672-nonphone-drawer-failsafe.js?v=20260819-672";
  s.async = false;
  s.dataset.sales67NonphoneOutreach = "1";
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
