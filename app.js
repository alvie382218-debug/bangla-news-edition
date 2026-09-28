/* ═══════════════════════════════════════════════════════════════════
   দৈনিক আজাদী মুভমেন্ট — সার্ভারবিহীন লাইভ সংবাদ ইঞ্জিন
   প্রতিটি পেজ লোডে ভিজিটরের ব্রাউজার CORS-প্রক্সির মাধ্যমে সরাসরি
   ৮টি RSS ফিড টানে → পার্স → শ্রেণিবিন্যাস → রেন্ডার। কোনো ব্যাকএন্ড নেই।
   ═══════════════════════════════════════════════════════════════════ */
"use strict";

/* ── অ্যাডমিন প্যানেলের নিরাপদ ডিফল্ট ঠিকানা ────────────────────────────
   সাইটের গোপন অ্যাডমিন ট্রিগার (ফুটারের সাল-লেখায় ৭ বার ট্যাপ) কনফিগের
   settings.adminPath অনুসরণ করে। আগে ফলব্যাক ছিল "admin.html" — অর্থাৎ
   কনফিগ না পেলে ব্যবহারকারী সরাসরি সেই পুরনো, ক্লায়েন্ট-সাইড, হার্ডকোড
   পাসকোডযুক্ত পাতায় চলে যেত।
   এখন ফলব্যাক সার্ভার-সাইড প্যানেলের নিজের ঠিকানা, যেখানে লগইন ছাড়া
   কেউ কিছুই দেখতে পায় না (৪০৪)। adminPath কনফিগেই সেট করা আছে; এটি
   কেবল কনফিগ লোড ব্যর্থ হলে ব্যবহৃত নিরাপদ জাল। */
var BNE_ADMIN_URL = "https://bne.147-224-13-31.nip.io/admin";

/* ── কনফিগ ─────────────────────────────────────────────────────── */
var SOURCES = {
  banglaedition: { rss: "https://www.banglaedition.com/feed/", label: "বাংলা এডিশন" },
  prothomalo: { rss: "https://www.prothomalo.com/feed/", label: "প্রথম আলো" },
  jugantor: { rss: "https://www.jugantor.com/feed/", label: "যুগান্তর" },
  ittefaq: { rss: "https://www.ittefaq.com.bd/feed/", label: "ইত্তেফাক" },
  bdnews24: { rss: "https://bangla.bdnews24.com/?feed=rss2", label: "বিডিনিউজ২৪" },
  somoynews: { rss: "https://somoynews.tv/feed/", label: "সময় নিউজ" },
  banglatribune: { rss: "https://www.banglatribune.com/feed/", label: "বাংলা ট্রিবিউন" },
  bdjournal: { rss: "https://bd-journal.com/feed/latest-rss.xml", label: "বাংলাদেশ জার্নাল" },
  dailybangladesh: { rss: "https://daily-bangladesh.com/rss/rss.xml", label: "ডেইলি বাংলাদেশ" }
};

/* ── VG-12: ফিড সোর্স ক্রম ────────────────────────────────────────────────
   ১) আমাদের নিজের সার্ভার (/api/feeds) — কোনো তৃতীয় পক্ষ নেই, ক্যাশ-ল্যাগ নেই
   ২) XML CORS-প্রক্সি চেইন — সার্ভার না থাকলে ভিজিটরের ব্রাউজার থেকে
   আগে api.rss2json.com ব্যবহার হতো; ফ্রি প্ল্যানে ফিড আপডেট হতো ঘণ্টায় একবার
   এবং দৈনিক ১০,০০০ রিকোয়েস্টের সীমা ছিল — তাই সরিয়ে দেওয়া হয়েছে। */
var BNE_FEED_API = function (sourceKey) { return "/api/feeds?source=" + encodeURIComponent(sourceKey); };
var BNE_FEED_ALL = "/api/feeds?source=all";

/* ★ P0-4 ফিক্স — তৃতীয় পক্ষের CORS প্রক্সি সম্পূর্ণ বাদ ★
   ══════════════════════════════════════════════════════════════════════
   আগে এখানে তিনটি ফ্রি প্রক্সির চেইন ছিল:
       corsproxy.io → api.allorigins.win → api.codetabs.com
   কারণ /api/feeds ডিপ্লয়ে ছিল না এবং সবসময় ৪০৪ দিত। ফলাফল:
     • প্রতিটি পাঠকের রিকোয়েস্ট তৃতীয় পক্ষের সার্ভারে চলে যেত (গোপনীয়তা)
     • ফ্রি প্ল্যানের রেট-লিমিটে প্রায়ই ব্যর্থ → খালি সেকশন
     • প্রক্সি ডাউন হলে পুরো সাইটের সংবাদ আসত না
     • লোড সময় অনির্দেশ্য (৫–১০ সেকেন্ড)
   এখন Netlify Function (/api/feeds) নিজেই ৯টি ফিড সার্ভার-সাইড থেকে
   এনে ক্যাশ করে। তাই প্রক্সি চেইন আর দরকারই নেই — মুছে ফেলা হলো।
   ══════════════════════════════════════════════════════════════════════ */

/* core.js থেকে pure ফাংশন আলিয়াস (index.html-এ core.js app.js-এর আগে লোড হয় — টেস্টযোগ্যতা ও এক-সোর্স) */
var CORE = window.BNE_CORE || {};
var CATEGORIES = CORE.CATEGORIES, CATEGORY_KEYWORDS = CORE.CATEGORY_KEYWORDS;
var bn = CORE.bn, escapeHtml = CORE.escapeHtml, splitSentences = CORE.splitSentences;
var hashId = CORE.hashId, categorize = CORE.categorize, extractTags = CORE.extractTags;
var catMeta = CORE.catMeta, timeAgo = CORE.timeAgo;
var SOURCE_WEIGHTS = CORE.SOURCE_WEIGHTS, breakingScore = CORE.breakingScore;
/* দ্বিগুণ-এস্কেপ করা সংবাদ-লেখা ঠিক করার ডিকোডার (core.js-এ সংজ্ঞায়িত) */
var articlePlainText = CORE.articlePlainText;
/* ── P0-2 / P1-11 ফিক্সের সহায়ক (core.js-এ সংজ্ঞায়িত, এক-সোর্স) ─────────
   normalizeImage : সব ছবির পাথ absolute করে (relative → ৪০৪ বন্ধ)
   articleImage   : ছবি না থাকলে সংবাদের নিজের ইউনিক টাইপোগ্রাফিক কভার দেয়
   coverSvg       : inline SVG data-URI — শূন্য নেটওয়ার্ক, কখনো ভাঙে না
   dhakaDate      : বাধ্যতামূলক Asia/Dhaka ফরম্যাট (ভুল তারিখ বন্ধ) */
var normalizeImage = CORE.normalizeImage;
var articleImage = CORE.articleImage;
var coverSvg = CORE.coverSvg;
var dhakaDate = CORE.dhakaDate;
var dhakaNowParts = CORE.dhakaNowParts;

var CACHE_KEY = "azadi_static_cache_v1";
var CACHE_TTL = 5 * 60 * 1000; // ৫ মিনিট — এর মধ্যে রিফ্রেশ হলে ক্যাশ দেখিয়ে ব্যাকগ্রাউন্ডে হালনাগাদ

/* ── সাইট কনফিগ (সম্পাদকীয় সংবাদ + বিজ্ঞাপন) ─────────────────── */
var siteConfig = window.AZADI_DEFAULT_CONFIG || { settings: {}, editorNews: [], ads: [] };

/* ══ P0-3 ফিক্স: কনফিগ নিজের origin থেকে, ক্যাশসহ ═════════════════════════
   আগের অবস্থা (লাইভ সাইটে মাপা): site-config.js-এর remoteConfigUrl ছিল
     https://raw.githubusercontent.com/…/data/bne-config.json
   যা ২,৩০৫,৬৬০ বাইট (২.৩MB) — version 83, ৪৯৬টি সংবাদ + ৯টি বিজ্ঞাপন।
   অর্থাৎ প্রথম পেইন্টের আগেই ২.৩MB ডাউনলোড + JSON.parse বাধ্যতামূলক।
   GitHub raw কোনো প্রোডাকশন CDN নয় — rate-limit/ব্লক হলে বা নেট দুর্বল
   হলে অনুরোধ ব্যর্থ → কিছুই রেন্ডার হয় না = সাদা স্ক্রিন।

   এখন তিন স্তরের বুটস্ট্র্যাপ (কখনো খালি স্ক্রিন নয়):
     ১) localStorage-এ শেষ ভালো কপি → সাথে সাথে রেন্ডার (০ ms)
     ২) নিজের origin: /data/site.json (settings+ads, ~৫KB) — CDN ক্যাশসহ
     ৩) ব্যাকগ্রাউন্ডে Oracle /api/config (লাইভ আপডেট, থাকলে)
   raw.githubusercontent ডিফল্ট পথ থেকে সম্পূর্ণ বাদ।
   ═══════════════════════════════════════════════════════════════════════ */
var SITE_JSON_URL = "/data/site.json";
var CONFIG_LS_KEY = "bne_site_config_v2";
var CONFIG_TIMEOUT_MS = 2500;   /* নিজের origin-এ দ্রুত — ২.৫s-এ না এলে এগিয়ে যাও */

function mergeConfig(remote) {
  if (remote && typeof remote === "object" && (remote.editorNews || remote.ads || remote.settings)) {
    siteConfig = {
      version: remote.version || siteConfig.version || 1,
      updatedAt: remote.updatedAt || siteConfig.updatedAt || "",
      settings: Object.assign({}, siteConfig.settings, remote.settings || {}),
      editorNews: remote.editorNews || siteConfig.editorNews || [],
      ads: remote.ads || siteConfig.ads || []
    };
  }
}

/* স্তর ১ — localStorage-এ ক্যাশ করা শেষ ভালো কপি তাৎক্ষণিক লোড */
function loadCachedConfig() {
  try {
    var raw = localStorage.getItem(CONFIG_LS_KEY);
    if (!raw) return false;
    var parsed = JSON.parse(raw);
    if (parsed && (parsed.editorNews || parsed.ads)) {
      mergeConfig(parsed);
      return true;
    }
  } catch (e) { /* নষ্ট ক্যাশ — উপেক্ষা */ }
  return false;
}

function saveCachedConfig() {
  try {
    localStorage.setItem(CONFIG_LS_KEY, JSON.stringify({
      version: siteConfig.version,
      updatedAt: siteConfig.updatedAt,
      settings: siteConfig.settings,
      /* ক্যাশ ফুলে না যায় — শুধু সর্বশেষ ২০০টি সংবাদ রাখা হয় */
      editorNews: (siteConfig.editorNews || []).slice(0, 200),
      ads: siteConfig.ads || []
    }));
  } catch (e) { /* কোটা শেষ বা প্রাইভেট মোড — উপেক্ষা */ }
}

/* স্তর ২ — নিজের origin-এর হালকা কনফিগ (settings + ads + সংবাদ-তালিকা) */
function fetchOwnConfig() {
  return fetchWithTimeout(SITE_JSON_URL, CONFIG_TIMEOUT_MS)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (cfg) {
      if (!cfg) return false;
      mergeConfig(cfg);
      saveCachedConfig();
      return true;
    })
    .catch(function () { return false; });
}

function loadLocalConfigPreview() {
  /* অ্যাডমিনের একই ব্রাউজারে তাৎক্ষণিক প্রিভিউ — রিমোটের উপরে বসে */
  try {
    var raw = localStorage.getItem("azadi_site_config");
    if (raw) mergeConfig(JSON.parse(raw));
  } catch (e) { /* উপেক্ষা */ }
}

/* ★ P0-3 (দ্বিতীয় স্তর): বাইরের কনফিগ আর কখনো বাধ্যতামূলক নয় ★
   পাবলিক সাইটে কনটেন্ট লোড হয় নিজের origin থেকে (/data/site.json)।
   remoteConfigUrl কেবল তখনই ব্যবহার হয় যখন সেটি স্পষ্টভাবে সেট করা থাকে
   এবং নিজের origin-এর কনফিগ ব্যর্থ হয় — অর্থাৎ এটি এখন শেষ ভরসা, প্রথম নয়।
   (আগে এটি ছিল ২.৩MB GitHub raw — প্রতিটি পেজ লোডে, ক্যাশ ছাড়া।) */
function fetchRemoteConfig() {
  var url = (localStorage.getItem("azadi_remote_url") || (siteConfig.settings && siteConfig.settings.remoteConfigUrl) || "").trim();
  if (!url) return Promise.resolve(false);
  var bust = url + (url.indexOf("?") === -1 ? "?t=" : "&t=") + Date.now();
  return fetchWithTimeout(bust, 6000)
    .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
    .then(function (cfg) {
      if (cfg && cfg.record) cfg = cfg.record; /* jsonbin v3 meta র‍্যাপার */
      mergeConfig(cfg);
      saveCachedConfig();
      return true;
    })
    .catch(function () { return false; });
}

/* ── SMO/P1: লাইভ কনফিগ API — রি-ডিপ্লয় ছাড়াই তাৎক্ষণিক আপডেট ──────────
   সোর্স: Oracle meta-service-এর /api/config। ব্যর্থ হলে পুরনো remote-config।
   ক্যাশ সবসময় bypass হয় (no-cache, must-revalidate) — অর্থাৎ মোবাইল প্যানেল
   থেকে প্রকাশের সাথে সাথেই এখানে নতুন সংবাদ এসে পড়ে। */
var LIVE_CONFIG_API = "/api/config";
var LIVE_VERSION_API = "/api/version";
var lastConfigVersion = null;

/* ══ ★ P1 — লাইভ সম্পাদকীয় স্তর (/api/editorial) ★ ═══════════════════════
   কেন (ডেভেলপার-নির্দেশনা, ২০২৬-০৯-২৯ — সেকশন ৫):
     সাইটের সংবাদ ও বিজ্ঞাপন বিল্ডের সময় _data.json-এ বেক হয়ে যায়। ফলে
     একটিমাত্র খবর প্রকাশ করতেও রি-ডিপ্লয় লাগত — আর সেই কারণেই Netlify-র
     ক্রেডিট শেষ হয়ে সাইট বন্ধ হয়েছিল।

   নতুন স্তর: /api/editorial ফাংশনটি প্রতিবার GitHub থেকে
   data/editorial-news.json পড়ে (Contents API → raw → বিল্ড-ডেটা)।
   ফলে নতুন সম্পাদকীয় সংবাদ বা বিজ্ঞাপন **ডিপ্লয় ছাড়াই** ৬০ সেকেন্ডে
   পাঠকের সামনে আসে।

   ⚠️ কেন আলাদা merge ফাংশন লাগল (নিরাপত্তার প্রশ্ন):
     mergeConfig() `editorNews` ও `ads` অ্যারেকে **সম্পূর্ণ প্রতিস্থাপন**
     করে (remote.editorNews || siteConfig.editorNews)। ওই ফাংশনে এই ফল
     সরাসরি দিলে ১টি সম্পাদকীয় সংবাদ এলে বাকি ~৫০০টি **মুছে ফাঁকা সাইট**
     হয়ে যেত। তাই mergeEditorialLive() কেবল id ধরে যোগ/হালনাগাদ করে —
     কিছু মুছে ফেলে না। এটিই নির্দেশনার "যোগ করবে, প্রতিস্থাপন নয়" শর্তের
     বাস্তব প্রয়োগ (শর্ত ৪)। */
var EDITORIAL_API = "/api/editorial";

function mergeEditorialLive(live) {
  if (!live || typeof live !== "object") return false;
  var changed = false;

  var news = live.editorNews || live.news;
  if (Array.isArray(news) && news.length) {
    var byId = {};
    (siteConfig.editorNews || []).forEach(function (a) {
      if (a && (a.id || a.title)) byId[String(a.id || hashId(a.title))] = a;
    });
    news.forEach(function (n) {
      if (!n || !n.title) return;
      var id = String(n.id || hashId(n.title));
      n.id = id;
      if (byId[id]) {
        /* সম্পাদকীয় সংস্করণই চূড়ান্ত — একই id-র পুরনো কপি হালনাগাদ হয় */
        Object.assign(byId[id], n);
      } else {
        byId[id] = n;
      }
      changed = true;
    });
    siteConfig.editorNews = Object.keys(byId).map(function (k) { return byId[k]; });
  }

  if (Array.isArray(live.ads) && live.ads.length) {
    var adById = {};
    (siteConfig.ads || []).forEach(function (a) {
      if (a && a.id) adById[String(a.id)] = a;
    });
    live.ads.forEach(function (a) {
      if (a && a.id) { adById[String(a.id)] = a; changed = true; }
    });
    siteConfig.ads = Object.keys(adById).map(function (k) { return adById[k]; });
  }

  if (live.settings && typeof live.settings === "object") {
    siteConfig.settings = Object.assign({}, siteConfig.settings, live.settings);
  }

  if (changed) saveCachedConfig();
  return changed;
}

/* ব্যর্থ হলেও কিছু ভাঙে না — কেবল false ফেরে (fail-safe, শর্ত ৪) */
function fetchEditorialLive() {
  return fetchWithTimeout(EDITORIAL_API, 5000)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (live) {
      var ok = mergeEditorialLive(live);
      if (ok) { applyEditorNews(); render(); }
      return ok;
    })
    .catch(function () { return false; });
}

function fetchLiveConfig() {
  return fetchWithTimeout(LIVE_CONFIG_API, 6000)
    .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
    .then(function (cfg) {
      if (cfg && cfg.record) cfg = cfg.record; /* jsonbin v3 meta র‍্যাপার */
      mergeConfig(cfg);
      if (cfg && typeof cfg.version !== "undefined") lastConfigVersion = cfg.version;
      return true;
    })
    .catch(function () { return false; });
}

/* ★ P0-3: গ্রেসফুল ডিগ্রেডেশন চেইন (দ্রুত → ধীর) ★
     ১) নিজের origin  /data/site.json   — ~৫KB, CDN-ক্যাশড, ২.৫s timeout
     ২) Oracle /api/config              — লাইভ, রি-ডিপ্লয় ছাড়াই নতুন সংবাদ
     ৩) remoteConfigUrl                 — শেষ ভরসা
   তিনটিই ব্যর্থ হলেও সাইট রেন্ডার করে, কারণ init()-এ localStorage ক্যাশ
   এবং site-config.js-এর ডিফল্ট আগেই লোড হয়ে যায়। কোনো অবস্থাতেই
   সাদা স্ক্রিন নয়। */
function fetchConfigAny() {
  /* ★ P1: /api/editorial সবার আগে ★
     নির্দেশনার সেকশন ৫: "app.js-এ কনফিগ চেইনে /api/editorial প্রথমে বসবে,
     তবে তার ফলাফল যোগ (merge) করবে, প্রতিস্থাপন (replace) নয় — যাতে
     ফাংশন ব্যর্থ হলেও সাইট ভাঙে না।"

     তাই এটি চেইনের **পাশে** চলে (উপরের তিন স্তরকে বদলায় না) এবং কেবল
     যোগ করে। ব্যর্থ হলে চুপচাপ false ফেরে — নিচের চেইন আগের মতোই চলে। */
  var editorial = fetchEditorialLive().catch(function () { return false; });

  return fetchOwnConfig()
    .then(function (ok) {
      if (ok) return true;
      return fetchLiveConfig().then(function (ok2) {
        return ok2 ? true : fetchRemoteConfig();
      });
    })
    .then(function (ok) {
      /* সম্পাদকীয় স্তরের ফল আগে মিলিয়ে নেওয়া হয়, তারপর রেন্ডার */
      return editorial.then(function () { return ok; });
    });
}

/* ভার্সন-ওয়াচ — প্যানেল থেকে প্রকাশের সাথে সাথেই, পেজ রিফ্রেশ ছাড়া কার্ড যোগ হয় */
function watchConfigVersion() {
  function tick() {
    fetchWithTimeout(LIVE_VERSION_API, 5000)
      .then(function (r) { if (!r.ok) throw new Error("http"); return r.json(); })
      .then(function (v) {
        if (lastConfigVersion === null) { lastConfigVersion = v.version; return; }
        if (v.version !== lastConfigVersion) {
          lastConfigVersion = v.version;
          fetchLiveConfig().then(function () { applyEditorNews(); render(); });
        }
      })
      .catch(function () { /* ভার্সন চেক ব্যর্থ হলে সাইট চলতে থাকবে */ });

    /* ★ P1: প্রতি মিনিটে সম্পাদকীয় স্তরও দেখা হয় ★
       /api/config বিল্ড-ডেটা পড়ে, তাই সেটির version বদলাতে ডিপ্লয় লাগে।
       কিন্তু /api/editorial প্রতিবার GitHub থেকে পড়ে — তাই প্যানেল/অ্যাপ
       থেকে প্রকাশ করা সংবাদ বা বিজ্ঞাপন **৬০ সেকেন্ডের মধ্যে** নিজে থেকেই
       চলে আসে, কোনো ডিপ্লয় ছাড়াই। ফাংশনটি ব্যর্থ হলে চুপচাপ কিছুই হয় না। */
    fetchEditorialLive().catch(function () {});
  }
  setInterval(tick, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });
  window.addEventListener("focus", tick);
}

/* ── SMO/P0: hash → রিয়েল-পাথ ক্যানোনিক্যালাইজেশন ────────────────────────
   ফেসবুক URL-এর # অংশ পুরোপুরি ফেলে দেয়, তাই পুরনো শেয়ার করা
   "#/news/<id>" লিংকও এখন রিয়েল পাথে রিডাইরেক্ট হয় — এতে ক্রলার,
   পাঠক এবং ক্লিক-ট্র্যাকিং সবাই সঠিক আর্টিকেল পায়। */
function canonicalizeRoute() {
  if (!isHttpHost()) return;
  var h = decodeURIComponent(location.hash || "");
  if (h.indexOf("#/") !== 0) return;
  var m = h.match(/^#\/(news|category|search)\/(.+)$/);
  var target = m
    ? "/" + m[1] + "/" + m[2]
    : (/^#\/desk\/probashi-bangla-news/.test(h) ? "/desk/probashi-bangla-news" : null);
  if (target) {
    try { history.replaceState({}, "", target); } catch (e) { /* পুরনো ব্রাউজার */ }
  }
}

function applyEditorNews() {
  state.articles = state.articles.filter(function (a) { return a.source !== "editor"; });
  (siteConfig.editorNews || []).forEach(function (n) {
    if (!n || !n.title) return;
    /* ★ ডিকোড + ট্যাগ বাদ ★
       আগে কাঁচা body সরাসরি ব্যবহার হত। Oracle কিছু সংবাদ দুইবার HTML-এস্কেপ
       করে রাখে, ফলে কার্ডের সারাংশে ও আর্টিকেল পাতায় খবরের বদলে
       `&lt;a href=&quot;…` জাতীয় কোড-লেখা দেখা যেত। এখন সীমিত-ধাপে ডিকোড
       করে নিরাপদ প্লেইন টেক্সট বানানো হয়। */
    var plain = (typeof articlePlainText === "function")
      ? articlePlainText(n.body || n.summary || "")
      : String(n.body || "").trim();
    var ts = n.publishedAt && !isNaN(Date.parse(n.publishedAt)) ? Date.parse(n.publishedAt) : Date.now();
    var newId = n.id || hashId(n.title);
    /* একই id-র আগের কপি সরাও (সদৃশ কার্ড প্রতিরোধ) */
    state.articles = state.articles.filter(function (a) { return a.id !== newId; });
    state.articles.push({
      id: newId,
      title: n.title,
      link: "",
      summary: plain.length > 220 ? plain.slice(0, 220).replace(/\s+\S*$/, "") + "…" : plain,
      paragraphs: plain ? plain.split(/\n+/).filter(function (p) { return p.trim().length > 1; }) : [],
      image: n.image || null,
      ts: ts,
      source: "editor",
      sourceLabel: "সম্পাদকীয় ডেস্ক",
      category: n.category || "জাতীয়",
      tags: (n.tags && n.tags.length) ? n.tags : extractTags(n.title + " " + plain),
      lead: !!n.lead
    });
  });
  indexArticles();
}

/* ── বিজ্ঞাপন ইঞ্জিন ──────────────────────────────────────────── */
function ytId(url) {
  var m = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/* ══ P0-5 ফিক্স — বিজ্ঞাপন ডিডুপ্লিকেশন ও ফ্রিকোয়েন্সি ক্যাপ ═══════════════
   সমস্যা (আপনার ২য় ও ৪র্থ স্ক্রিনশট, লাইভ কনফিগে প্রমাণিত):
     ad_overseas_campaign_top    → home_top       → overseas-campaign.webp
     ad_overseas_campaign_middle → home_middle    → একই ক্রিয়েটিভ
     ad_overseas_campaign_hub    → probashi_hub   → একই ক্রিয়েটিভ
     ad_paint_sidebar            → article_sidebar→ একই HTML অ্যাড
     ad_paint_bottom             → article_bottom → একই HTML অ্যাড
   renderAdSlot() স্লট অনুযায়ী ফিল্টার করত, কিন্তু *একটি অ্যাড ইতিমধ্যে
   পেজে রেন্ডার হয়েছে কি না* তা ট্র্যাক করত না। ফলে একই HTML অ্যাড
   article_sidebar + article_bottom — দুই জায়গায় বসত, আর সেই অ্যাড নিজের
   প্লেয়ার/ইফ্রেম আনে → একই স্ক্রিনে দুটো ভিডিও একসাথে "চলত"।

   সমাধান — তিন স্তর:
     স্তর ১: renderedAdIds  — একই ad.id কখনো দুইবার নয়
     স্তর ২: renderedMediaCount — এক পেজে সর্বোচ্চ ১টি ভিডিও/HTML অ্যাড
     স্তর ৩: খালি স্লট = কোনো DOM নয় (ব্ল্যাংক বক্স বন্ধ)
   ═══════════════════════════════════════════════════════════════════════ */
var renderedAdIds = {};
var renderedMediaCount = 0;
var MAX_MEDIA_ADS_PER_PAGE = 1;

function isMediaAd(ad) {
  return ad && (ad.type === "html" || ad.type === "youtube" || ad.type === "video");
}

function resetAdCaps() {
  renderedAdIds = {};
  renderedMediaCount = 0;
}

function adHtml(ad) {
  var inner = "";
  if (ad.type === "youtube") {
    var id = ytId(ad.youtube);
    if (!id) return "";
    /* P2-1: এখন মিউট + নো-কুকি। এক পেজে সর্বোচ্চ ১টি মিডিয়া অ্যাড (স্তর ২) */
    inner = '<div class="ad-video"><iframe loading="lazy" data-ad-media="1"' +
      ' src="https://www.youtube-nocookie.com/embed/' + id + '?rel=0&playsinline=1&mute=1"' +
      ' title="' + escapeHtml(ad.title || "বিজ্ঞাপন") + '"' +
      ' allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>';
  } else if (ad.type === "image") {
    if (!ad.image) return "";
    var imgSrc = normalizeImage(ad.image);
    if (!imgSrc) return "";
    var img = '<img loading="lazy" decoding="async" width="728" height="180" src="' + escapeHtml(imgSrc) +
      '" alt="' + escapeHtml(ad.title || "বিজ্ঞাপন") + '">';
    inner = ad.link
      ? '<a href="' + escapeHtml(resolveHref(ad.link)) + '" rel="noopener sponsored">' + img + "</a>"
      : img;
  } else if (ad.type === "html") {
    /* ★ P1-5: কাঁচা innerHTML নয় — অনুমোদিত ট্যাগ/অ্যাট্রিবিউট ছাড়া বাকি সব বাদ ★
       আগে ad.html সরাসরি innerHTML-এ বসত → স্টোরড XSS-এর সুযোগ ছিল।
       এখন একটি whitelist sanitizer দিয়ে পরিষ্কার করা হয়: script, ইভেন্ট
       অ্যাট্রিবিউট (on*), javascript: URL, iframe/object/embed — সব বাদ। */
    inner = sanitizeAdHtml(ad.html);
  }
  if (!inner) return "";
  return '<div class="ad-block"><span class="ad-tag">বিজ্ঞাপন</span>' + inner +
    (ad.title && ad.type === "youtube" ? '<div class="ad-title">' + escapeHtml(ad.title) + "</div>" : "") + "</div>";
}

/* ══ P1-5: অ্যাডমিন-প্রদত্ত HTML-এর নিরাপদ পরিশোধন (whitelist) ═════════════
   কেবল অনুমোদিত ট্যাগ রাখা হয়; script/on*-অ্যাট্রিবিউট/javascript: URL
   সম্পূর্ণ বাদ যায়। DOMPurify না থাকলেও নিরাপদ থাকে (নিজস্ব বাস্তবায়ন)। */
var AD_ALLOWED_TAGS = {
  A: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, BR: 1, P: 1, SPAN: 1, DIV: 1,
  IMG: 1, PICTURE: 1, SOURCE: 1, VIDEO: 1, H4: 1, H5: 1, UL: 1, LI: 1, SMALL: 1
};
var AD_ALLOWED_ATTRS = {
  href: 1, src: 1, srcset: 1, alt: 1, title: 1, width: 1, height: 1,
  loading: 1, decoding: 1, target: 1, rel: 1, style: 1, class: 1,
  type: 1, media: 1, controls: 1, muted: 1, playsinline: 1, poster: 1
};

function sanitizeAdHtml(html) {
  var raw = String(html || "");
  if (!raw) return "";
  if (typeof document === "undefined") return "";
  try {
    var tpl = document.createElement("template");
    tpl.innerHTML = raw;

    function walk(node) {
      var kids = Array.prototype.slice.call(node.childNodes || []);
      kids.forEach(function (child) {
        if (child.nodeType === 3) return;                 /* টেক্সট — অটুট */
        if (child.nodeType !== 1) { child.remove(); return; }
        if (!AD_ALLOWED_TAGS[child.tagName]) { child.remove(); return; }

        Array.prototype.slice.call(child.attributes || []).forEach(function (attr) {
          var name = attr.name.toLowerCase();
          var val = String(attr.value || "");
          if (!AD_ALLOWED_ATTRS[name]) { child.removeAttribute(attr.name); return; }
          if (/^on/i.test(name)) { child.removeAttribute(attr.name); return; }
          if ((name === "href" || name === "src") && /^\s*(javascript|data:text\/html|vbscript):/i.test(val)) {
            child.removeAttribute(attr.name);
          }
        });
        walk(child);
      });
    }
    walk(tpl.content);
    return tpl.innerHTML;
  } catch (e) {
    return "";   /* পরিশোধন ব্যর্থ হলে কোনো অ্যাড নয় — নিরাপত্তাই আগে */
  }
}

function renderAdSlot(slot) {
  var list = (siteConfig.ads || []).filter(function (a) {
    return a && a.enabled !== false && a.slot === slot;
  });

  /* ★ স্তর ১ + স্তর ২: ডুপ্লিকেট ও মিডিয়া ক্যাপ ★ */
  var usable = list.filter(function (a) {
    var id = a.id || (a.slot + ":" + (a.image || a.youtube || ""));
    if (renderedAdIds[id]) return false;                       /* ইতিমধ্যে পেজে আছে */
    if (isMediaAd(a) && renderedMediaCount >= MAX_MEDIA_ADS_PER_PAGE) return false;
    return true;
  });

  /* ★ স্তর ৩: খালি স্লট = কোনো DOM নয় ★
     আগে স্লট খালি থাকলেও AdSense অটো-ইউনিট বসিয়ে দেওয়া হত — ব্যবহারকারীর
     সম্মতি ছাড়াই (GDPR/AdSense নীতিভঙ্গের ঝুঁকি, P1-6)। এখন কিছু না থাকলে
     সত্যিই কিছুই রেন্ডার হয় না → কোনো ফাঁকা বক্স বা অসম্মত অ্যাড নয়। */
  if (!usable.length) return "";

  /* এই স্লটে সর্বোচ্চ ২টি ভিন্ন ক্রিয়েটিভ (রোটেশনের জন্য)। প্রথমটি মিডিয়া
     হলে দ্বিতীয়টি অবশ্যই নন-মিডিয়া — নইলে একই স্ক্রিনে দুটো ভিডিও। */
  var picked = [usable[0]];
  for (var i = 1; i < usable.length && picked.length < 2; i++) {
    var cand = usable[i];
    if (isMediaAd(cand) && (isMediaAd(picked[0]) || renderedMediaCount >= MAX_MEDIA_ADS_PER_PAGE)) continue;
    picked.push(cand);
  }
  usable = picked;

  if (usable.length > 1) {
    var slotId = 'ad-rotator-' + slot;
    var first = usable[0];
    var firstId = first.id || (slot + ":0");
    renderedAdIds[firstId] = 1;
    if (isMediaAd(first)) renderedMediaCount++;
    setTimeout(function () { startAdRotator(slotId, usable.length); }, 800);
    return '<div class="ad-slot ad-' + escapeHtml(slot) + ' ad-rotator-container" id="' + escapeHtml(slotId) + '">' +
      usable.map(function (ad, idx) {
        return '<div class="rotator-item ' + (idx === 0 ? 'active' : 'hidden') + '" data-idx="' + idx + '">' + adHtml(ad) + '</div>';
      }).join("") +
      '</div>';
  }

  var ad = usable[0];
  var html = adHtml(ad);
  if (!html) return "";
  var adId = ad.id || (slot + ":0");
  renderedAdIds[adId] = 1;
  if (isMediaAd(ad)) renderedMediaCount++;
  return '<div class="ad-slot ad-' + escapeHtml(slot) + '" data-ad-id="' + escapeHtml(adId) + '">' + html + "</div>";
}

var adRotators = {};
function startAdRotator(containerId, count) {
  /* একই স্লটে ডুপ্লিকেট interval প্রতিরোধ (রিরেন্ডারে লিক হয় না) */
  if (adRotators[containerId]) clearInterval(adRotators[containerId]);
  var current = 0;
  adRotators[containerId] = setInterval(function() {
    var container = document.getElementById(containerId);
    if (!container) return;
    var items = container.querySelectorAll('.rotator-item');
    if (!items.length) return;
    items[current].classList.add('hidden');
    items[current].classList.remove('active');
    current = (current + 1) % items.length;
    items[current].classList.remove('hidden');
    items[current].classList.add('active');
  }, 5000);
}

/* ── ইউটিলিটি (pure ফাংশন core.js-এ; DOM-নির্ভর নিচে) ──────────── */
function stripTags(html) {
  /* core.js-এর ডিকোডার আগে চালানো হয় — কারণ innerHTML কেবল এক ধাপ এনটিটি
     ডিকোড করে, তাই Oracle থেকে আসা দুইবার-এস্কেপ করা খবর `&lt;a href=…`
     হিসেবেই থেকে যেত এবং কার্ড/সারাংশে কোড-লেখা দেখা যেত।
     articlePlainText সীমিত (৩) ধাপে পুরোপুরি ডিকোড করে, তারপর ট্যাগ বাদ দেয়। */
  if (typeof articlePlainText === "function") {
    var plain = articlePlainText(html);
    if (plain) return plain;
  }
  var div = document.createElement("div");
  div.innerHTML = String(html || "");
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

/* ফিড-মেটাডেটা জাঙ্ক পরিষ্কার — "X ডেস্ক 2026-08-24..." জাতীয় অগ্রভাগ-লাইন সরায় */
function cleanArticlePlain(text) {
  if (!text) return "";
  var parts = String(text).split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
  if (parts.length > 1) {
    var first = parts[0];
    var metaRe = /(?:ডেস্ক|রিপোর্ট|প্রতিবেদক|করেসপন্ডেন্ট|সংবাদদাতা|বিউরো)/;
    if (first.length < 90 && /\d{4}[-/]\d{1,2}/.test(first) && metaRe.test(first)) {
      parts.shift();
    }
  }
  return parts.join("\n");
}

/* ── ফেচ + পার্স ইঞ্জিন ────────────────────────────────────────── */
function fetchWithTimeout(url, ms) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, ms);
  return fetch(url, { signal: ctrl.signal }).finally(function () { clearTimeout(t); });
}

/* ধাপ ১: নিজের সার্ভার API → ধাপ ২: XML প্রক্সি চেইন */
function fetchFeedItems(sourceKey) {
  var rssUrl = SOURCES[sourceKey].rss;

  var viaServer = fetchWithTimeout(BNE_FEED_API(sourceKey), 9000)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      /* HTML fallback (রাউটিং নেই) এলে res.json() ব্যর্থ হয় → প্রক্সি চেইনে নামে */
      if (!data || !data.items || !data.items.length) throw new Error("খালি সার্ভার রেসপন্স");
      return parseJsonFeed(data.items, sourceKey);
    });

  /* ★ P0-4 ফিক্স (দ্বিতীয় স্তর): তৃতীয় পক্ষের প্রক্সি সম্পূর্ণ বাদ ★
     আগে এখানে corsproxy.io → allorigins → codetabs চেইন ছিল। এখন ব্যাকআপ
     হিসেবে ব্যবহার হয় শুধু আমাদের নিজের দুটি এন্ডপয়েন্ট:
        ১) /api/feeds?source=all   (একক ফাংশন, সব সূত্র একসাথে)
        ২) /api/rss-proxy          (আলাদা ফাংশন — প্রথমটি ব্যর্থ হলে)
     অর্থাৎ কোনো অবস্থাতেই পাঠকের ডেটা বাইরের কোনো প্রক্সি সার্ভারে যায় না। */
  var viaOwnApi = function () {
    return fetchWithTimeout(BNE_FEED_ALL, 11000)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var items = (data && data.items) || [];
        var mine = items.filter(function (it) { return it && it.source === sourceKey; });
        if (!mine.length) throw new Error("এই সূত্রের কোনো আইটেম নেই");
        return parseJsonFeed(mine, sourceKey);
      });
  };

  var viaXml = function (idx) {
    /* কেবল নিজের দুটি এন্ডপয়েন্ট — কোনো বাইরের প্রক্সি নয় */
    if (idx >= 1) return Promise.reject(new Error("সব নিজস্ব এন্ডপয়েন্ট ব্যর্থ"));
    return viaOwnApi().catch(function () {
      return fetchViaServerProxy().then(function (all) {
        var mine = (all || []).filter(function (a) { return a && a.source === sourceKey; });
        if (!mine.length) throw new Error("প্রক্সি ফাংশনেও এই সূত্র নেই");
        return mine;
      });
    });
  };

  return viaServer.catch(function () { return viaXml(0); });
}

/* /api/feeds (এবং পূর্বে rss2json) থেকে আসা JSON আইটেম → অভিন্ন আর্টিকেল অবজেক্ট */
function parseJsonFeed(items, sourceKey) {
  var out = [];
  for (var i = 0; i < items.length && out.length < 12; i++) {
    var it = items[i];
    var title = stripTags(it.title || "");
    var link = String(it.link || it.guid || "").trim();
    if (!title || link.indexOf("http") !== 0) continue;

    var desc = it.content || it.description || "";
    var plain = cleanArticlePlain(stripTags(desc));
    var ts = it.pubDate && !isNaN(Date.parse(it.pubDate)) ? Date.parse(it.pubDate) : Date.now();
    var image = it.thumbnail || (it.enclosure && it.enclosure.link) || null;
    if (image && !/^https?:/.test(image)) image = null;
    if (!image) {
      var m = String(desc).match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m) image = m[1];
    }
    var fullText = title + " " + plain;

    out.push({
      id: hashId(link),
      title: title,
      link: link,
      summary: plain.length > 220 ? plain.slice(0, 220).replace(/\s+\S*$/, "") + "…" : plain,
      paragraphs: splitSentences(plain),
      image: image,
      ts: ts,
      source: sourceKey,
      sourceLabel: SOURCES[sourceKey].label,
      category: categorize(fullText),
      tags: extractTags(fullText)
    });
  }
  return out;
}

function childText(el, names) {
  for (var i = 0; i < el.children.length; i++) {
    var c = el.children[i];
    var local = (c.localName || c.nodeName || "").toLowerCase();
    var full = (c.nodeName || "").toLowerCase();
    for (var j = 0; j < names.length; j++) {
      if (local === names[j] || full === names[j]) return (c.textContent || "").trim();
    }
  }
  return "";
}

function extractImage(el, desc) {
  for (var i = 0; i < el.children.length; i++) {
    var c = el.children[i];
    var name = (c.nodeName || "").toLowerCase();
    var url = c.getAttribute && (c.getAttribute("url") || c.getAttribute("href"));
    if ((name === "media:content" || name === "media:thumbnail") && url) return url;
    if (name === "enclosure" && url) {
      var type = c.getAttribute("type") || "";
      if (type.indexOf("image") === 0 || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) return url;
    }
  }
  var m = String(desc || "").match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function parseFeed(xmlText, sourceKey) {
  var doc = new DOMParser().parseFromString(xmlText, "text/xml");
  if (doc.querySelector("parsererror")) return [];
  var nodes = doc.querySelectorAll("item, entry");
  var out = [];
  for (var i = 0; i < nodes.length && out.length < 12; i++) {
    var el = nodes[i];
    var title = stripTags(childText(el, ["title"]));
    var link = childText(el, ["link", "guid"]);
    if (!link) {
      var linkEl = el.querySelector("link[href]");
      if (linkEl) link = linkEl.getAttribute("href") || "";
    }
    link = link.trim();
    if (!title || link.indexOf("http") !== 0) continue;

    var desc = childText(el, ["content:encoded", "encoded", "description", "summary", "content"]);
    var pub = childText(el, ["pubdate", "published", "updated", "dc:date", "date"]);
    var ts = pub && !isNaN(Date.parse(pub)) ? Date.parse(pub) : Date.now();
    var plain = cleanArticlePlain(stripTags(desc));
    var fullText = title + " " + plain;

    out.push({
      id: hashId(link),
      title: title,
      link: link,
      summary: plain.length > 220 ? plain.slice(0, 220).replace(/\s+\S*$/, "") + "…" : plain,
      paragraphs: splitSentences(plain),
      image: extractImage(el, desc),
      ts: ts,
      source: sourceKey,
      sourceLabel: SOURCES[sourceKey].label,
      category: categorize(fullText),
      tags: extractTags(fullText)
    });
  }
  return out;
}

/* ── স্টেট + ক্যাশ ─────────────────────────────────────────────── */
var state = { articles: [], byId: {}, lastUpdate: 0, sourceStatus: {} };

/* ══ সংবাদের ইউনিক কী: slug আগে, নইলে id ════════════════════════════════
   ⚠️ এখানেই ছিল সবচেয়ে ক্ষতিকর বাগ (ব্যবহারকারীর অভিযোগ, ২০২৬-০৯-২৭)
   ---------------------------------------------------------------------
   "ক্লিক করে News দেখা যাচ্ছে না।"

   সংবাদের লিংক কে কী দিয়ে বানাত:
     • প্রি-রেন্ডার করা হোমপেজ, SSR পাতা, শেয়ার-লিংক, canonical, Google
       → সবই **slug** দিয়ে  (যেমন /news/tongi-millgate-extortion-attack…)
     • অ্যাপের ভেতরের কার্ড ও শেয়ার বাটন
       → **id** দিয়ে          (যেমন /news/amuhr1uup)

   কিন্তু অ্যাপ সংবাদ খুঁজত কেবল `state.byId[id]` দিয়ে — অর্থাৎ slug
   কখনোই মিলত না। তাই প্রি-রেন্ডার করা হোমপেজ থেকে (বা Google/Facebook
   থেকে) আসা যেকোনো পাঠক "সংবাদটি পাওয়া যায়নি" দেখতেন — সার্ভার ঠিক
   HTML পাঠানোর পরপরই ক্লায়েন্ট সেটি মুছে দিত।

   সমাধান: (১) সব লিংক এখন একই কী (slug, না থাকলে id) ব্যবহার করে,
            (২) খোঁজার সময় id ও slug — দুটোই মেলানো হয় (<code>byKey</code>)। */
function artKey(a) {
  if (!a) return '';
  return String(a.slug || a.id || '');
}

function keyVariants(key) {
  var k = String(key == null ? '' : key).trim();
  var out = [k, k.toLowerCase()];
  try { out.push(decodeURIComponent(k), decodeURIComponent(k).toLowerCase()); } catch (e) { /* ভাঙা এনকোডিং */ }
  try { out.push(k.normalize('NFC'), k.normalize('NFC').toLowerCase()); } catch (e) { /* পুরনো ব্রাউজার */ }
  return out;
}

function indexArticles() {
  state.byId = {};
  state.byKey = {};
  state.articles.forEach(function (a) {
    state.byId[a.id] = a;
    keyVariants(a.id).forEach(function (k) { if (k) state.byKey[k] = a; });
    keyVariants(a.slug).forEach(function (k) { if (k) state.byKey[k] = a; });
  });
  state.articles.sort(function (a, b) { return b.ts - a.ts; });
}

/** id, slug, বা URL-এনকোড করা যেকোনো রূপ দিয়ে সংবাদ খোঁজা */
function findArticle(key) {
  if (!key) return null;
  var k = String(key).trim();
  if (state.byId && state.byId[k]) return state.byId[k];
  var variants = keyVariants(k);
  for (var i = 0; i < variants.length; i++) {
    var hit = state.byKey && state.byKey[variants[i]];
    if (hit) return hit;
  }
  return null;
}

/* ═══ সম্পাদকীয় লিড (নিয়োগ ক্যাম্পেইন) — এক জায়গায় সংজ্ঞায়িত ═══ */
var RECRUITMENT_ARTICLE = {
  id: "thy-recruitment-2026",
  title: "চীন, লাওস, আলজেরিয়া ও ইরাকে বিশাল নিয়োগ বিজ্ঞপ্তি — THY International AD International Ent.",
  summary: "চীন (গার্মেন্টস ট্রেইনি ৫০,০০০ টাকা), লাওস ($৪৫০), আলজেরিয়া ও ইরাকে আকর্ষনীয় বেতনে কর্মী নিয়োগ। ফ্রি খাবার ও বাসস্থানসহ সরকারি অনূমোদিত ভিসার সম্পূর্ণ আবেদন পদ্ধতি।",
  paragraphs: [
    "চীন, লাওস, আলজেরিয়া ও ইরাকে আকর্ষনীয় বেতনে কর্মসংস্থানের সুবর্ণ সুযোগ নিয়ে এসেছে সরকারি অনুমোদিত বিশ্বস্ত রিক্রুটিং প্রতিষ্ঠান THY International AD International Ent.।",
    "🇨🇳 ১. চীন (China) — গার্মেন্টস সুইং ট্রেইনি: ২০০ জন। ৪ বছরের ট্রেইনি ভিসা। আন্তর্জাতিক মানের ট্রেনিং ও সার্টিফিকেট। বেতন: ৫০,০০০ টাকা।",
    "🇱🇦 ২. লাওস (Laos) — CHINA HUNAN CONSTRUCTION: কনস্ট্রাকশন কাজ। বেতন: ৪৫০ ডলার ($450 USD)। ডিউটি: ৯ ঘণ্টা। বয়স: ২০-৪৫ বছর। ফ্রি খাবার ও বাসস্থান।",
    "🇩🇿 ৩. আলজেরিয়া (Algeria): কার্পেন্টার (২০ জন, $৫৫0), স্টিলওয়ার্কার (১০ জন, $৫৫0), ব্রিকলেয়ার (১০ জন, $৫৫0), ট্রান্সলেটর (১ জন, $৮০০), শেফ (১ জন, $৪৫০)। ২ বছরের অভিজ্ঞতা প্রয়োজন।",
    "🇮🇶 ৪. ইরাক (Iraq): সাধারণ ওয়েল্ডার (৫ জন, $৫৫0), ব্রিকলেয়ার (৫ জন, $৫০০)।",
    "📍 যোগাযোগের ঠিকানা: THY International AD International Ent., এম এম কমপ্লেক্স, লিফট-৭ (পল্লবী মেট্রোস্টেশন সংলগ্ন), মিরপুর ২/১১, ঢাকা। মোবাইল: সাগর — +8801791520269"
  ],
  image: "/images/overseas-campaign.webp",
  source: "editor",
  sourceLabel: "সম্পাদকীয় বিশেষ প্রকাশনা",
  category: "প্রবাস",
  lead: true,
  ts: Date.now(),
  tags: ["নিয়োগ", "প্রবাস", "চীন", "লাওস", "আলজেরিয়া", "ইরাক", "THY_International"],
   /* SMO/P0 — রিয়েল পাথ, hash নয়। এই seed ডেটাই ছিল একটি হার্ডকোড করা hash URL:
      শেয়ার করলে ফেসবুক হোমপেজে পাঠিয়ে দিত। id-ই slug, তাই রিয়েল পাথ দুটোই কাজ করে। */
   link: "https://bangla-news-edition-bd.netlify.app/news/thy-recruitment-2026"
};

/* শুধু সম্পাদকীয় সিড (ফেব্রিকেটেড জাল নিউজ সম্পূর্ণ বাদ — আসল ফিড রিফ্রেশে মার্জ হয়) */
var SEED_ARTICLES = [RECRUITMENT_ARTICLE];

function loadCache() {
  try {
    var raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      var data = JSON.parse(raw);
      if (data && data.articles && data.articles.length) {
        state.articles = data.articles;
        state.lastUpdate = data.ts || 0;
        indexArticles();
        return true;
      }
    }
  } catch (e) {}
  state.articles = SEED_ARTICLES;
  state.lastUpdate = Date.now();
  indexArticles();
  return true;
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: state.lastUpdate, articles: state.articles.slice(0, 200) }));
  } catch (e) { /* কোটা শেষ হলে নীরবে উপেক্ষা */ }
}

function mergeArticles(items) {
  var seen = {};
  state.articles.forEach(function (a) { seen[a.id] = true; });
  var added = 0;
  items.forEach(function (a) { if (!seen[a.id]) { state.articles.push(a); seen[a.id] = true; added++; } });
  indexArticles();
  return added;
}

/* P2: সার্ভার-সাইড ইনজেশন (Netlify Function /api/rss-proxy) — প্রথম চেষ্টা; ব্যর্থে ক্লায়েন্ট চেইন */
function fetchViaServerProxy() {
  if (!isHttpHost()) return Promise.reject(new Error("শুধু http হোস্টে"));
  return fetchWithTimeout("/api/rss-proxy", 25000).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }).then(function (data) {
    if (!data || !Array.isArray(data.items) || !data.items.length) throw new Error("খালি প্রক্সি রেসপন্স");
    return data.items.map(function (it) {
      if (!it || !it.link || !it.title) return null;
      var plain = String(it.summary || "");
      var fullText = it.title + " " + plain;
      return {
        id: hashId(it.link),
        title: it.title,
        link: it.link,
        summary: plain.length > 220 ? plain.slice(0, 220).replace(/\s+\S*$/, "") + "…" : plain,
        paragraphs: splitSentences(plain),
        image: it.image || null,
        ts: it.ts || Date.now(),
        source: it.source || "banglaedition",
        sourceLabel: (SOURCES[it.source] && SOURCES[it.source].label) || "সংবাদ সূত্র",
        category: categorize(fullText),
        tags: extractTags(fullText)
      };
    }).filter(function (x) { return !!x; });
  });
}

function refreshAll(background) {
  var keys = Object.keys(SOURCES);
  setStatus("loading", "সংবাদ সূত্রগুলো থেকে সর্বশেষ খবর আনা হচ্ছে…");

  return fetchViaServerProxy().then(function (proxyItems) {
    /* সার্ভার-প্রক্সি সফল — কিন্তু আংশিক হলে (কিছু সূত্র ব্লকড/খালি) বাকিগুলো ক্লায়েন্ট-চেইন দিয়ে এনে মার্জ
       (mergeArticles লিংক-ডিডুপ করে — সদৃশ/সংঘর্ষ নিরাপদ) */
    var proxySources = {};
    proxyItems.forEach(function (it) { if (it.source) proxySources[it.source] = true; });
    keys.forEach(function (k) { state.sourceStatus[k] = proxySources[k] ? "ok" : "pending"; });
    var missing = keys.filter(function (k) { return !proxySources[k]; });
    if (!missing.length) return proxyItems;
    return Promise.allSettled(
      missing.map(function (key) {
        return fetchFeedItems(key).then(function (items) {
          state.sourceStatus[key] = items.length ? "ok" : "empty";
          return items;
        }).catch(function () {
          state.sourceStatus[key] = "fail";
          return [];
        });
      })
    ).then(function (results) {
      var all = proxyItems.slice();
      results.forEach(function (r) { if (r.status === "fulfilled") all = all.concat(r.value); });
      return all;
    });
  }).catch(function () {
    /* সম্পূর্ণ গ্রেসফুল ডিগ্রেডেশন → ক্লায়েন্ট-সাইড XML প্রক্সি চেইন */
    return Promise.allSettled(
      keys.map(function (key) {
        return fetchFeedItems(key).then(function (items) {
          state.sourceStatus[key] = items.length ? "ok" : "empty";
          return items;
        }).catch(function () {
          state.sourceStatus[key] = "fail";
          return [];
        });
      })
    ).then(function (results) {
      var all = [];
      results.forEach(function (r) { if (r.status === "fulfilled") all = all.concat(r.value); });
      return all;
    });
  }).then(function (all) {
    var added = mergeArticles(all);
    state.lastUpdate = Date.now();
    saveCache();
    var okCount = keys.filter(function (k) { return state.sourceStatus[k] === "ok"; }).length;
    if (state.articles.length) {
      setStatus("ok", "✔ হালনাগাদ সম্পন্ন — " + bn(okCount) + "টি সূত্র সচল, নতুন " + bn(added) + "টি খবর, মোট " + bn(state.articles.length) + "টি");
    } else {
      setStatus("err", "কোনো সূত্র থেকেই খবর আনা যায়নি — ইন্টারনেট সংযোগ পরীক্ষা করে রিফ্রেশ করুন।");
    }
    if (!background || added > 0) render();
  });
}

function setStatus(kind, msg) {
  var bar = document.getElementById("statusbar");
  bar.className = "statusbar container" + (kind === "ok" ? " ok" : kind === "err" ? " err" : "");
  bar.innerHTML = (kind === "loading" ? '<span class="spinner"></span> ' : "") + escapeHtml(msg);
}

/* ── ডায়নামিক OG / সোশ্যাল মেটা আপডেটর ───────────────────────── */
/* ★ হোস্ট-নিরপেক্ষ ★
   আগে এই মানটি হার্ডকোড ছিল। হোস্ট বদলালে শেয়ার/OG লিংক পুরনো (মৃত) ঠিকানায়
   যেত এবং ফেসবুকের প্রিভিউ কার্ড ভাঙত। এখন ব্রাউজারে চলার সময় আসল origin
   থেকে নেওয়া হয় — তাই যেকোনো ডোমেইনে সাইট নিজে থেকেই ঠিক আচরণ করে।
   (file:// প্রিভিউ বা পুরনো ব্রাউজারে নিচের ডিফল্টটাই ব্যবহৃত হয়।) */
var SITE_ORIGIN = (typeof location !== "undefined" && location.protocol.indexOf("http") === 0)
  ? location.origin
  : 'https://bangla-news-edition-bd.netlify.app';
var OG_DEFAULTS = {
  title: 'বাংলা নিউজ এডিশন — BANGLA NEWS EDITION',
  desc: 'জাতীয়, প্রবাস, আন্তর্জাতিক ও অর্থনীতির ব্রেকিং সংবাদ পোর্টাল।',
  image: SITE_ORIGIN + '/images/bne-og-cover.jpg',
  url: SITE_ORIGIN + '/'
};

/* ── URL হেল্পার (রিয়েল-পাথ + hash fallback — P1 SEO) ──────────── */
function isHttpHost() { return location.protocol.indexOf('http') === 0; }
function siteOrigin() {
  if (isHttpHost()) return location.origin;
  return SITE_ORIGIN;
}
function sitePath() {
  var p = location.pathname.replace(/\/[^/]*$/, '/');
  return p || '/';
}
function absoluteUrl(rel) {
  if (/^https?:/.test(rel)) return rel;
  return siteOrigin() + sitePath() + String(rel || '').replace(/^\.?\//, '');
}

/* http হোস্টে রিয়েল-পাথ (গুগল-ইনডেক্সযোগ্য), file://-এ hash — দুই-ই কাজ করে */
function newsHref(id) { return isHttpHost() ? '/news/' + encodeURIComponent(id) : '#/news/' + encodeURIComponent(id); }
function catHref(name) { return isHttpHost() ? '/category/' + encodeURIComponent(name) : '#/category/' + encodeURIComponent(name); }
function searchHref(q) { return isHttpHost() ? '/search/' + encodeURIComponent(q) : '#/search/' + encodeURIComponent(q); }
function deskHref(sub) { return isHttpHost() ? '/desk/probashi-bangla-news' + (sub ? '/' + sub : '') : '#/desk/probashi-bangla-news' + (sub ? '/' + sub : ''); }
function homeHref() { return isHttpHost() ? '/' : '#/'; }
/* শেয়ার/canonical URL — সাইটের সব জায়গায় একই কী (artKey) ব্যবহার হয়,
   যাতে শেয়ার করা লিংক, কর্নার-এন্ট্রি ও অ্যাপের ভেতরের লিংক হুবহু মেলে।
   আগে এখানে a.id আর প্রি-রেন্ডারে a.slug থাকত → দুই ধরনের লিংক তৈরি হত। */
function articleUrl(a) { return siteOrigin() + (isHttpHost() ? '/news/' : sitePath() + '#/news/') + encodeURIComponent(artKey(a)); }

/* "#/..." অথবা রিয়েল-পাথ href → হোস্ট-উপযোগী href */
function resolveHref(href) {
  href = String(href || '');
  if (href.indexOf('#/') === 0) {
    var rest = href.slice(2);
    if (!isHttpHost()) return href;
    if (rest.indexOf('news/') === 0) return '/news/' + rest.slice(5);
    if (rest.indexOf('category/') === 0) return '/category/' + rest.slice(9);
    if (rest.indexOf('search/') === 0) return '/search/' + rest.slice(7);
    if (rest.indexOf('desk/probashi-bangla-news') === 0) return '/desk/probashi-bangla-news' + rest.slice(22);
    if (rest === '' || rest === '/') return '/';
    return href;
  }
  return href;
}

/* SPA নেভিগেশন: http হোস্টে pushState, file://-এ hash */
function navigate(href) {
  href = resolveHref(href);
  if (isHttpHost() && href.charAt(0) === '/') {
    history.pushState({}, '', href);
    render();
    window.scrollTo(0, 0);
  } else {
    location.hash = href.replace(/^\/+/, '#/');
  }
}

function setMeta(property, content) {
  var isOg = property.indexOf('og:') === 0;
  var attr = isOg ? 'property' : 'name';
  var el = document.querySelector('meta[' + attr + '="' + property + '"]');
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, property); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

/* NewsArticle JSON-LD (সার্চ ইঞ্জিনের জন্য) */
function setArticleLd(article) {
  var el = document.getElementById('bne-article-ld');
  if (!el) { el = document.createElement('script'); el.id = 'bne-article-ld'; el.type = 'application/ld+json'; document.head.appendChild(el); }
  var ld = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.summary,
    image: (imgUrl(article.image) || siteOrigin() + '/images/bne-og-cover.jpg'),
    datePublished: new Date(article.ts).toISOString(),
    dateModified: new Date(article.ts).toISOString(),
    url: articleUrl(article),
    author: { '@type': 'Organization', name: 'বাংলা নিউজ এডিশন' },
    publisher: { '@type': 'Organization', name: 'বাংলা নিউজ এডিশন', logo: { '@type': 'ImageObject', url: siteOrigin() + '/images/bne-logo.png' } },
    mainEntityOfPage: articleUrl(article)
  };
  el.textContent = JSON.stringify(ld);
}

function removeArticleLd() {
  var el = document.getElementById('bne-article-ld');
  if (el) el.remove();
}

/* ── SEO হেল্পার (P1): canonical + robots + BreadcrumbList ──────── */
function setCanonical(url) {
  var el = document.querySelector('link[rel="canonical"]');
  if (!el) { el = document.createElement('link'); el.rel = 'canonical'; document.head.appendChild(el); }
  el.href = url;
}
function setRobots(content) {
  var el = document.querySelector('meta[name="robots"]');
  if (!el) { el = document.createElement('meta'); el.name = 'robots'; document.head.appendChild(el); }
  el.setAttribute('content', content);
}
function setBreadcrumbLd(items) {
  var el = document.getElementById('bne-breadcrumb-ld');
  if (!el) { el = document.createElement('script'); el.id = 'bne-breadcrumb-ld'; el.type = 'application/ld+json'; document.head.appendChild(el); }
  el.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: (items || []).map(function (it, i) {
      return { '@type': 'ListItem', position: i + 1, name: it.name, item: it.url };
    })
  });
}
function removeBreadcrumbLd() {
  var el = document.getElementById('bne-breadcrumb-ld');
  if (el) el.remove();
}
function breadcrumbItem(name, url) { return { name: name, url: url }; }

/* রিয়েল-পাথ বা hash href → পরম canonical URL */
function canonicalFor(href) {
  href = String(href || '');
  if (href.charAt(0) === '/') return siteOrigin() + href;
  if (href.indexOf('#/') === 0) return siteOrigin() + sitePath() + href.slice(1);
  return href;
}

function updateOgMeta(article) {
  var title = (article.title || OG_DEFAULTS.title) + ' — বাংলা নিউজ এডিশন';
  var desc = article.summary || OG_DEFAULTS.desc;
  var image = imgUrl(article.image) || (siteOrigin() + '/og/' + encodeURIComponent(article.id || '') + '.jpg');
  if (!image || image.indexOf('http') !== 0) image = OG_DEFAULTS.image;
  var url = articleUrl(article);
  setMeta('og:title', title); setMeta('og:description', desc);
  setMeta('og:image', image); setMeta('og:url', url); setMeta('og:type', 'article');
  setMeta('twitter:title', title); setMeta('twitter:description', desc.slice(0, 200)); setMeta('twitter:image', image);
  setCanonical(url);
  setRobots('index, follow');
  setBreadcrumbLd([
    breadcrumbItem('প্রচ্ছদ', OG_DEFAULTS.url),
    breadcrumbItem(article.category, canonicalFor(catHref(article.category))),
    breadcrumbItem(article.title, url)
  ]);
  setArticleLd(article);
}

function resetOgMeta() {
  setMeta('og:title', OG_DEFAULTS.title); setMeta('og:description', OG_DEFAULTS.desc);
  setMeta('og:image', OG_DEFAULTS.image); setMeta('og:url', OG_DEFAULTS.url); setMeta('og:type', 'website');
  setMeta('twitter:title', OG_DEFAULTS.title); setMeta('twitter:description', OG_DEFAULTS.desc); setMeta('twitter:image', OG_DEFAULTS.image);
  setCanonical(OG_DEFAULTS.url);
  setRobots('index, follow');
  removeArticleLd();
  removeBreadcrumbLd();
}

function bneShareCopyLink(btn, url) {
  try {
    navigator.clipboard.writeText(url).then(function() {
      var orig = btn.textContent; btn.textContent = '✅ কপি হয়েছে!';
      setTimeout(function() { btn.textContent = orig; }, 2000);
    });
  } catch(e) { window.prompt('এই লিংকটি কপি করুন:', url); }
}

/* ══ শেয়ার — পুরো পোর্টালে একই উপাদান ═══════════════════════════════════
   ব্যবহারকারীর অভিযোগ (২০২৬-০৯-২৭):
     "ফেসবুকে শেয়ার বা হোয়াটসঅ্যাপে শেয়ার বা সোশ্যাল মিডিয়া শেয়ার করার
      অপশন নেই — পোর্টাল থেকে কেউ চাইলে শেয়ার করতে পারে, সেই অপশনগুলো নেই।"

   আগে শেয়ার বলতে কেবল সংবাদ পাতায় ৩টি বোতাম ছিল (FB/WhatsApp/Telegram),
   আর সেগুলো inline onclick ব্যবহার করত — কঠোর CSP থাকলে অকেজো হয়ে যেত।
   অন্য কোথাও (কার্ড, বিভাগ, ডেস্ক, ফুটার) শেয়ারের সুযোগই ছিল না।

   এখন: FB · WhatsApp · Telegram · X · LinkedIn · ইমেইল · লিংক কপি ·
   ফোনের নিজস্ব শেয়ার মেনু (Web Share API) — একটাই উপাদান, সব জায়গায়।
   ⚠️ কপি ও নেটিভ বোতামে inline handler নেই; শুধু `data-*` অ্যাট্রিবিউট,
      যেগুলো নিচের delegated listener ধরে (CSP-safe, আর JS বন্ধ থাকলেও
      বাকি শেয়ার লিংকগুলো কাজ করে)। */
function shareBarHtml(url, title, opts) {
  var o = opts || {};
  var u = String(url || '');
  var t = String(title || 'বাংলা নিউজ এডিশন');
  var eu = encodeURIComponent(u);
  var et = encodeURIComponent(t + ' — বাংলা নিউজ এডিশন');
  var etTitle = encodeURIComponent(t);
  var links = [
    ['fb', 'ফেসবুক', '📘', 'https://www.facebook.com/sharer/sharer.php?u=' + eu],
    ['wa', 'হোয়াটসঅ্যাপ', '💬', 'https://wa.me/?text=' + et],
    ['tg', 'টেলিগ্রাম', '✈️', 'https://t.me/share/url?url=' + eu + '&text=' + etTitle],
    ['x', 'X', '𝕏', 'https://twitter.com/intent/tweet?url=' + eu + '&text=' + etTitle],
    ['li', 'লিংকডইন', 'in', 'https://www.linkedin.com/sharing/share-offsite/?url=' + eu],
    ['mail', 'ইমেইল', '✉️', 'mailto:?subject=' + etTitle + '&body=' + et]
  ];
  var btns = '';
  for (var i = 0; i < links.length; i++) {
    var L = links[i];
    btns += '<a class="share-btn ' + L[0] + '" href="' + L[3] + '" target="_blank" rel="noopener noreferrer"' +
      ' title="' + L[1] + ' — শেয়ার করুন" aria-label="' + L[1] + ' — শেয়ার করুন">' +
      (o.compact ? L[2] : L[2] + ' ' + L[1]) + '</a>';
  }
  btns += '<button type="button" class="share-btn copy" data-share-copy="' + escapeHtml(u) + '"' +
    ' title="লিংক কপি করুন" aria-label="লিংক কপি করুন">🔗' + (o.compact ? '' : ' লিংক কপি') + '</button>';
  btns += '<button type="button" class="share-btn native" data-share-native' +
    ' data-share-url="' + escapeHtml(u) + '" data-share-title="' + escapeHtml(t) + '"' +
    ' title="আরও অ্যাপে শেয়ার করুন" aria-label="আরও অ্যাপে শেয়ার করুন">📲' + (o.compact ? '' : ' আরও…') + '</button>';
  return '<div class="share-bar' + (o.compact ? ' share-bar-compact' : '') + '" role="group" aria-label="শেয়ার করুন">' +
    '<span class="share-label">📤' + (o.compact ? '' : ' শেয়ার করুন:') + '</span>' + btns + '</div>';
}

/** কার্ডের কোণে ছোট শেয়ার বোতাম — যেকোনো খবর কার্ড থেকেই শেয়ার করা যায় */
function cardShareHtml(a) {
  var u = articleUrl(a);
  return '<span class="card-share" role="button" tabindex="0" data-share-native' +
    ' data-share-url="' + escapeHtml(u) + '" data-share-title="' + escapeHtml(a.title) + '"' +
    ' title="শেয়ার করুন" aria-label="' + escapeHtml(a.title) + ' — শেয়ার করুন">📤</span>';
}

/** ফোনের নিজস্ব শেয়ার শিট; না থাকলে লিংক কপি (progressive enhancement) */
function bneShareNative(btn, url, title) {
  if (navigator.share) {
    navigator.share({ title: title || 'বাংলা নিউজ এডিশন', text: title || '', url: url })
      .catch(function() { /* ব্যবহারকারী বাতিল করেছেন */ });
    return;
  }
  bneShareCopyLink(btn, url);
}

/* একবারই বসানো delegated listener — কপি ও নেটিভ শেয়ার দুটোর জন্য।
   `data-share-*` থাকা যেকোনো উপাদান কাজ করে; তাই নতুন জায়গায় শেয়ার
   যোগ করতে শুধু HTML বসালেই হয়, আলাদা করে কিছু বাঁধতে হয় না। */
function bindShareHandlers() {
  if (window.__bneShareBound) return;
  window.__bneShareBound = true;
  var pick = function (ev) {
    return (ev.target && ev.target.closest)
      ? ev.target.closest('[data-share-copy],[data-share-native]') : null;
  };
  var fire = function (el) {
    if (el.hasAttribute('data-share-copy')) {
      bneShareCopyLink(el, el.getAttribute('data-share-copy') || '');
    } else {
      bneShareNative(el, el.getAttribute('data-share-url') || '', el.getAttribute('data-share-title') || '');
    }
  };
  document.addEventListener('click', function (ev) {
    var el = pick(ev);
    if (!el) return;
    /* কার্ডের ভেতরে থাকলে ক্লিকটি কার্ড-লিংকে পৌঁছানো উচিত নয় */
    ev.preventDefault();
    ev.stopPropagation();
    fire(el);
  }, true);
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var el = pick(ev);
    if (!el) return;
    ev.preventDefault(); ev.stopPropagation();
    fire(el);
  }, true);
}

/* ── রেন্ডারিং ─────────────────────────────────────────────────── */
/* ══ P0-2 ফিক্স — ছবির পাথ ও ফলব্যাক ══════════════════════════════════════
   আগের আচরণ:
     imgOf(a) = a.image || catMeta(a.category).img
     <img … onerror="this.src='<বিভাগ-ডিফল্ট>'">
   ফলে ৪৮৩/৪৯৪ সংবাদে (ছবি ফাঁকা) সবাই একই বিভাগ-ডিফল্ট ছবি পেত, আর
   যেসব ছবি relative পাথে ছিল সেগুলো /news/ বা /category/ পাতায়
   /news/images/… হয়ে ৪০৪ খেত → onerror আবার সেই একই ডিফল্ট ছবি বসাত।
   আপনি যেটা দেখছিলেন — "একই ছবি বারবার আসছে" — ঠিক এটাই।

   এখন:
     • পাথ সর্বদা absolute (normalizeImage — core.js)
     • ছবি না থাকলে সংবাদের নিজের ইউনিক টাইপোগ্রাফিক কভার (data-URI)
       → প্রতিটি কার্ড আলাদা দেখায়, শূন্য নেটওয়ার্ক রিকোয়েস্ট
     • onerror-এ একটি "loaded" গার্ড — চেইন প্রতিক্রিয়া নেই
   ══════════════════════════════════════════════════════════════════════ */
function imgUrl(src) {
  var n = normalizeImage(src);
  if (!n) return null;
  if (/^https?:/i.test(n) || n.indexOf("data:") === 0) return n;
  return (n.charAt(0) === "/" && isHttpHost()) ? siteOrigin() + n : n;
}

function imgOf(a) {
  if (!a) return "";
  var u = imgUrl(a.image);
  if (u) return u;
  /* ছবি নেই → ইউনিক কভার (একই ডিফল্ট ফটো কখনো নয়) */
  return typeof coverSvg === "function" ? coverSvg(a.title, a.category) : "";
}

/* onerror গার্ড — একটি ছবি একবারই ফলব্যাক করতে পারে (লুপ/চেইন নেই) */
function onImgErrAttr(kind) {
  return ' onerror="if(!this.dataset.fb){this.dataset.fb=1;' +
    (kind === "hide"
      ? "this.style.display='none';this.parentNode&&this.parentNode.classList.add('no-img');"
      : "this.style.display='none';") +
    '}"';
}

function badgeHtml(cat) {
  return '<span class="badge ' + catMeta(cat).badge + '">' + escapeHtml(cat) + "</span>";
}

function stampIso(ts) {
  try { return new Date(ts).toISOString(); } catch (e) { return ""; }
}

function cardHtml(a) {
  return '<a class="card" href="' + newsHref(artKey(a)) + '">' +
    '<span class="thumb"><img loading="lazy" decoding="async" width="640" height="360" src="' +
    escapeHtml(imgOf(a)) + '" alt="' + escapeHtml(a.title) + '"' + onImgErrAttr("hide") + ">" +
    badgeHtml(a.category) + "</span>" +
    '<span class="body"><h2 class="card-h2">' + escapeHtml(a.title) + "</h2><p>" + escapeHtml(a.summary) + "</p>" +
    '<span class="meta"><time datetime="' + escapeHtml(stampIso(a.ts)) + '">' + timeAgo(a.ts) +
    "</time><span>" + escapeHtml(a.sourceLabel) + "</span>" + cardShareHtml(a) + "</span></span></a>";
}

function cardSmHtml(a) {
  return '<a class="card-sm" href="' + newsHref(artKey(a)) + '">' +
    '<img loading="lazy" decoding="async" width="640" height="360" src="' + escapeHtml(imgOf(a)) +
    '" alt="' + escapeHtml(a.title) + '"' + onImgErrAttr("hide") + ">" +
    '<span><span class="cat">' + escapeHtml(a.category) + "</span><h2 class=\"card-h2\">" +
    escapeHtml(a.title) + '</h2><div class="meta"><time datetime="' + escapeHtml(stampIso(a.ts)) + '">' +
    timeAgo(a.ts) + "</time>" + cardShareHtml(a) + "</div></span></a>";
}

function sectionHead(title, href) {
  return '<div class="section-head"><h2>' + escapeHtml(title) + "</h2>" +
    (href ? '<a href="' + href + '">সব দেখুন →</a>' : "") + "</div>";
}

/* ═══ P6: রিড-হিস্টরি ও রেকমেন্ডেশন (প্রাইভেসি-ফার্স্ট, লোকাল; ব্রেকিং-স্কোর core.js-এ) ═══ */
var HISTORY_KEY = "bne_read_history";
function getReadHistory() {
  try { var raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); return Array.isArray(raw) ? raw : []; }
  catch (e) { return []; }
}
function recordRead(id) {
  try {
    var h = getReadHistory().filter(function (x) { return x !== id; });
    h.unshift(id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 30)));
  } catch (e) {}
}
/* পড়ার ইতিহাস থেকে ক্যাটাগরি+ট্যাগ মিলিয়ে ৪টি ব্যক্তিগত পছন্দ */
function personalPicks(arts) {
  var hist = getReadHistory();
  if (hist.length < 3) return [];
  var readSet = new Set(hist);
  var cats = {}, tags = {};
  hist.slice(0, 8).forEach(function (id) {
    var a = state.byId[id];
    if (!a) return;
    cats[a.category] = (cats[a.category] || 0) + 1;
    (a.tags || []).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; });
  });
  var recs = arts.filter(function (a) {
    if (readSet.has(a.id)) return false;
    var score = (cats[a.category] || 0) * 2;
    (a.tags || []).forEach(function (t) { if (tags[t]) score += tags[t]; });
    return score >= 2;
  });
  recs.sort(function (a, b) { return breakingScore(b) - breakingScore(a); });
  return recs.slice(0, 4);
}

/* ═══ হিরো অটো-রোটেশন ইঞ্জিন (P7: নিউজ ১০s → বিজ্ঞাপন ৩s → লুপ) ═══ */
var heroRotatorTimer = null;

function clearHeroTimer() {
  if (heroRotatorTimer) { clearTimeout(heroRotatorTimer); heroRotatorTimer = null; }
}

/* অ্যাড-লিংক: hash → রিয়েল-পাথ (রিয়েল-পাথ রাউটিং সক্রিয় থাকলে) */
function resolveHref(link) {
  if (!link) return homeHref();
  var l = String(link).trim();
  if (l.indexOf("#/news/") === 0) return newsHref(decodeURIComponent(l.slice(7)));
  if (l.indexOf("#/category/") === 0) return catHref(decodeURIComponent(l.slice(11)));
  if (l.indexOf("#/desk/") === 0) return deskHref(l.indexOf("/", 7) > 0 ? l.slice(l.indexOf("/", 7) + 1) : null);
  if (l.indexOf("#/search/") === 0) return searchHref(decodeURIComponent(l.slice(9)));
  if (l.indexOf("#/") === 0 || l === "#") return homeHref();
  return l;
}

/* বিজ্ঞাপন স্লাইড: কনফিগের home_top/home_middle ছবি-অ্যাড + সম্পাদকীয় (ডিডুপসহ) */
function heroAdSlides() {
  var out = [];
  var editorial = state.articles.filter(function (a) { return a.source === "editor"; })[0];
  if (editorial) out.push({ image: imgOf(editorial), title: "জরুরী নিয়োগ বিজ্ঞপ্তি ২০২৬ — চীন, লাওস, আলজেরিয়া ও ইরাক", href: resolveHref("#/news/" + editorial.id), tag: "বিজ্ঞাপন" });
  (siteConfig.ads || []).forEach(function (ad) {
    if (!ad || !ad.enabled || ad.type !== "image" || !ad.image) return;
    if (ad.slot !== "home_top" && ad.slot !== "home_middle") return;
    out.push({ image: ad.image, title: ad.title || "বিজ্ঞাপন", href: resolveHref(ad.link), tag: "বিজ্ঞাপন" });
  });
  var seen = {}, uniq = [];
  out.forEach(function (s) { var k = s.image; if (!seen[k]) { seen[k] = 1; uniq.push(s); } }); /* একই ছবি একবারই */
  return uniq;
}

function buildHeroSlides(heroNews) {
  var ads = heroAdSlides();
  var slides = [];
  heroNews.forEach(function (n, i) {
    slides.push({ type: "news", article: n });
    if (ads.length) slides.push({ type: "ad", ad: ads[i % ads.length] });
  });
  if (!ads.length) slides = heroNews.map(function (n) { return { type: "news", article: n }; });
  return slides;
}

function heroRotatorHtml(slides) {
  var inner = slides.map(function (s, i) {
    var isAd = s.type === "ad";
    var tag = isAd ? '<span class="ad-flag">বিজ্ঞাপন</span>' : badgeHtml(s.article.category);
    var title = isAd ? escapeHtml(s.ad.title) : escapeHtml(s.article.title);
    var meta = isAd ? "স্পনর্সড কনটেন্ট" : timeAgo(s.article.ts) + " · " + escapeHtml(s.article.sourceLabel);
    var href = isAd ? s.ad.href : newsHref(artKey(s.article));
    var img = isAd ? escapeHtml(imgUrl(s.ad.image) || "") : escapeHtml(imgOf(s.article));
    /* ★ P2-4: স্লাইডে আর <h1> নয় (পেজে ঠিক একটি h1 থাকবে) + P2-7: LCP প্রায়োরিটি ★
       প্রথম স্লাইডটি LCP উপাদান — তাই fetchpriority="high" এবং eager। */
    return '<a class="hero-slide' + (i === 0 ? " active" : "") + '" href="' + href + '" data-dur="' + (isAd ? 3000 : 10000) + '" aria-hidden="' + (i === 0 ? "false" : "true") + '">' +
      '<img src="' + img + '" alt="' + title + '" width="1200" height="675"' +
      (i === 0 ? ' fetchpriority="high" loading="eager"' : ' loading="lazy"') + ' decoding="async"' +
      onImgErrAttr("hide") + ">" +
      '<span class="overlay"></span><span class="content">' + tag +
      '<span class="hero-title">' + title + '</span><div class="meta">' + meta + "</div></span></a>";
  }).join("");
  var dots = '<div class="hero-dots">' + slides.map(function (_, i) {
    return '<button class="' + (i === 0 ? "active" : "") + '" data-i="' + i + '" aria-label="স্লাইড ' + (i + 1) + '"></button>';
  }).join("") + "</div>";
  return '<div class="hero-rotator" id="hero-rotator">' + inner + dots + "</div>";
}

/* অটো-রোটেশন চালু (হোম পেজে, render-এর পরে) — hover-পজ + reduced-motion স্ট্যাটিক */
function startHeroRotator() {
  var rot = document.getElementById("hero-rotator");
  if (!rot) return;
  var slides = Array.prototype.slice.call(rot.querySelectorAll(".hero-slide"));
  if (slides.length < 2) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var dots = Array.prototype.slice.call(rot.querySelectorAll(".hero-dots button"));
  var i = 0;
  function show(idx) {
    i = idx;
    slides.forEach(function (s, k) {
      s.classList.toggle("active", k === idx);
      s.setAttribute("aria-hidden", k === idx ? "false" : "true");
    });
    dots.forEach(function (d, k) { d.classList.toggle("active", k === idx); });
  }
  function schedule() {
    clearHeroTimer();
    var dur = parseInt(slides[i].getAttribute("data-dur"), 10) || 10000;
    heroRotatorTimer = setTimeout(function () { show((i + 1) % slides.length); schedule(); }, dur);
  }
  rot.addEventListener("mouseenter", clearHeroTimer, { passive: true });
  rot.addEventListener("mouseleave", schedule, { passive: true });
  dots.forEach(function (d) {
    d.addEventListener("click", function () {
      clearHeroTimer();
      show(parseInt(d.getAttribute("data-i"), 10));
      schedule();
    });
  });
  schedule();
}

function renderHome(app) {
  document.title = "বাংলা নিউজ এডিশন — সত্য ও বস্তুনিষ্ঠ খবরের বিশ্বস্ত ঠিকানা | BANGLA NEWS EDITION";
  resetOgMeta();
  var arts = state.articles.slice();
  if (!arts.length) {
    app.innerHTML = '<div class="empty">এই মুহূর্তে কোনো সংবাদ নেই — কয়েক সেকেন্ড পর স্বয়ংক্রিয়ভাবে চলে আসবে।<br><br><button class="btn" onclick="location.reload()">রিফ্রেশ করুন</button></div>';
    return;
  }
  /* হিরো: আসল ব্রেকিং নিউজ প্রধান (বিজ্ঞাপন নয়) — অটো-রোটেশন: নিউজ ১০s → বিজ্ঞাপন ৩s → লুপ */
  var nonEd = arts.filter(function (a) { return a.source !== "editor"; });
  var heroNews = nonEd.slice(0, 25).sort(function (a, b) { return breakingScore(b) - breakingScore(a); }).slice(0, 4);
  if (!heroNews.length) heroNews = arts.slice(0, 1); /* শুধু সম্পাদকীয় থাকলেও হিরো খালি থাকে না */
  var side = nonEd.filter(function (a) { return heroNews.indexOf(a) === -1; }).slice(0, 4);
  var grid = nonEd.filter(function (a) { return heroNews.indexOf(a) === -1 && side.indexOf(a) === -1; }).slice(0, 9);
  var slides = buildHeroSlides(heroNews);
  /* ★ P2-4 ফিক্স: হোমপেজে ঠিক একটি <h1> ★
     আগে হোমপেজে h1 ছিল ০ (ক্রল রিপোর্ট: h1_count = 0)। স্ক্রিন-রিডার ও
     সার্চ ইঞ্জিন দুটোর জন্যই প্রতিটি পাতায় ঠিক একটি শীর্ষ-শিরোনাম দরকার।
     এখানে ডেস্কের নামটি h1, আর প্রতিটি সেকশনের শিরোনাম h2 (sectionHead)। */
  var html = '<h1 class="desk-h1">বাংলা নিউজ এডিশন — সর্বশেষ সংবাদ ও ব্রেকিং নিউজ</h1>' +
    '<section class="hero">' + heroRotatorHtml(slides) +
    '<div class="hero-side">' + side.map(cardSmHtml).join("") + "</div></section>";

  html += renderAdSlot("home_top");

  html += '<section class="section">' + sectionHead("সর্বশেষ সংবাদ") +
    '<div class="grid cols-3">' + grid.map(cardHtml).join("") + "</div></section>";

  /* P6: ব্যক্তিগত পছন্দ — পড়ার ইতিহাসের ভিত্তিতে (প্রাইভেসি-ফার্স্ট) */
  var picks = personalPicks(arts);
  if (picks.length >= 3) {
    html += '<section class="section">' + sectionHead("আপনার জন্য") +
      '<div class="grid cols-4">' + picks.map(cardSmHtml).join("") + "</div></section>";
  }

  html += renderAdSlot("home_middle");

  CATEGORIES.forEach(function (cat) {
    var items = arts.filter(function (a) { return a.category === cat.name; }).slice(0, 4);
    if (!items.length) return;
    html += '<section class="section">' + sectionHead(cat.name, catHref(cat.name)) +
      '<div class="grid cols-4">' + items.map(cardSmHtml).join("") + "</div></section>";
  });
  app.innerHTML = html;
}

function renderCategory(app, name) {
  document.title = escapeHtml(name) + " — বাংলা নিউজ এডিশন | BANGLA NEWS EDITION";
  resetOgMeta();
  setCanonical(canonicalFor(catHref(name)));
  setBreadcrumbLd([
    breadcrumbItem('প্রচ্ছদ', OG_DEFAULTS.url),
    breadcrumbItem(name, canonicalFor(catHref(name)))
  ]);
  var items = state.articles.filter(function (a) { return a.category === name; });
  if (!items.length && (!state.articles || !state.articles.length)) {
    app.innerHTML = '<div class="page-title"><div class="breadcrumb"><a href="' + homeHref() + '">প্রচ্ছদ</a> / ' + escapeHtml(name) + '</div>' +
      '<h1>' + escapeHtml(name) + '</h1><p>সংবাদ লোড করা হচ্ছে...</p></div>' +
      '<div class="skeleton-grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
    return;
  }
  app.innerHTML = '<div class="page-title"><div class="breadcrumb"><a href="' + homeHref() + '">প্রচ্ছদ</a> / ' + escapeHtml(name) + "</div>" +
    "<h1>" + escapeHtml(name) + "</h1><p>মোট " + bn(items.length) + "টি সংবাদ</p></div>" +
    /* বিভাগীয় পাতাটিও শেয়ার করা যায় (আগে কেবল সংবাদ পাতা শেয়ার করা যেত) */
    shareBarHtml(canonicalFor(catHref(name)), name + ' — বাংলা নিউজ এডিশন') +
    (items.length
      ? '<div class="grid cols-3">' + items.map(cardHtml).join("") + "</div>"
      : '<div class="empty">এই বিভাগে এখনো সংবাদ আসেনি — একটু পরে রিফ্রেশ করুন।</div>');
  window.scrollTo(0, 0);
}

function renderSearch(app, q) {
  q = String(q || "").trim();
  document.title = (q ? "“" + q + "” — " : "") + "খোঁজার ফলাফল — বাংলা নিউজ এডিশন";
  resetOgMeta();
  /* সার্চ পেজ সার্চ-ইঞ্জিনে ইনডেক্স হবে না (ডুপ্লিকেট কনটেন্ট এড়াতে) */
  setRobots('noindex, follow');
  setCanonical(OG_DEFAULTS.url);
  var items = [];
  if (q) {
    var lq = q.toLowerCase();
    items = state.articles.filter(function (a) {
      return (a.title + " " + (a.summary || "") + " " + (a.tags || []).join(" ")).toLowerCase().indexOf(lq) !== -1;
    });
  }
  app.innerHTML = '<div class="page-title"><div class="breadcrumb"><a href="' + homeHref() + '">প্রচ্ছদ</a> / খোঁজার ফলাফল</div>' +
    "<h1>" + (q ? "“" + escapeHtml(q) + "”" : "খোঁজার ফলাফল") + "</h1>" +
    "<p>মোট " + bn(items.length) + "টি সংবাদ পাওয়া গেছে</p></div>" +
    (items.length
      ? '<div class="grid cols-3">' + items.map(cardHtml).join("") + "</div>"
      : '<div class="empty">“<b>' + escapeHtml(q) + '</b>” — এই শব্দের সাথে মিলে যাওয়া কোনো সংবাদ পাওয়া যায়নি।<br><br><a class="btn" href="' + homeHref() + '">← প্রচ্ছদে ফিরুন</a></div>');
}

/* ══ P0-3 সম্পূরক: সংবাদের পূর্ণ বডি দেরিতে এলে হাইড্রেট করা ══════════════
   প্রথম পেইন্ট ইচ্ছাকৃতভাবে হালকা (/data/site.json — body ছাড়া) যাতে
   ২.৩MB ডাউনলোডের অপেক্ষা করতে না হয়। কিন্তু সংবাদ-পাতায় পূর্ণ লেখা
   দরকার। তাই /data/news.json একবার (লেজি) আনা হয়, localStorage-এ
   ক্যাশ করা হয়, আর state.articles-এর সাথে মিলিয়ে দেওয়া হয়।
   এই ফাংশন কখনো ব্যর্থ হলেও সাইট চলতে থাকে (summary দেখানো হয়)। */
var FULL_NEWS_URL = "/data/news.json";
var FULL_NEWS_LS = "bne_full_news_v1";
var fullNewsLoading = false;
var fullNewsLoaded = false;

function mergeBodies(list) {
  if (!list || !list.length) return 0;
  var byId = {};
  state.articles.forEach(function (a) { byId[a.id] = a; });
  var merged = 0;
  list.forEach(function (n) {
    if (!n || !n.id) return;
    var a = byId[n.id];
    if (!a) return;
    if (!a.paragraphs || !a.paragraphs.length) {
      /* ★ আগে `articlePlainText()` চালিয়ে তারপর `\n+` দিয়ে ভাগ করা হত ★
         কিন্তু articlePlainText সব শূন্যস্থান ও নতুন লাইন একটিমাত্র স্পেসে
         চেপে দেয় — ফলে ৬-১০ অনুচ্ছেদের সংবাদ একটিমাত্র অনুচ্ছেদ হয়ে যেত।
         এখন BNECore.articleBlocks() HTML-এর গঠন (</p>, <br>, ব্লক ট্যাগ)
         ধরে ভাগ করে, তাই পড়ার মতো অনুচ্ছেদ ফিরে আসে। */
      var blocks = (window.BNECore && BNECore.articleBlocks)
        ? BNECore.articleBlocks(n.body || n.summary || "")
        : [];
      if (!blocks.length) {
        var plain = (typeof articlePlainText === "function")
          ? articlePlainText(n.body || n.summary || "")
          : String(n.body || "");
        blocks = plain ? [plain] : [];
      }
      if (blocks.length) {
        a.paragraphs = blocks;
        merged++;
      }
    }
    if (!a.image && n.image) a.image = n.image;
    if ((!a.tags || !a.tags.length) && n.tags && n.tags.length) a.tags = n.tags;
  });
  return merged;
}

function hydrateArticleBodies(then) {
  if (fullNewsLoaded) { if (then) then(); return; }
  if (fullNewsLoading) return;
  fullNewsLoading = true;

  /* স্তর ১ — localStorage ক্যাশ (নেটওয়ার্ক ছাড়াই) */
  try {
    var raw = localStorage.getItem(FULL_NEWS_LS);
    if (raw) {
      var cached = JSON.parse(raw);
      if (cached && cached.news && cached.news.length) {
        mergeBodies(cached.news);
        fullNewsLoaded = true;
        fullNewsLoading = false;
        if (then) then();
        return;
      }
    }
  } catch (e) { /* নষ্ট ক্যাশ — উপেক্ষা */ }

  /* স্তর ২ — নিজের origin থেকে (নিজস্ব CDN, কোনো বাইরের হোস্ট নয়) */
  fetchWithTimeout(FULL_NEWS_URL, 9000)
    .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
    .then(function (data) {
      var list = (data && data.news) || [];
      mergeBodies(list);
      fullNewsLoaded = true;
      try {
        localStorage.setItem(FULL_NEWS_LS, JSON.stringify({ t: Date.now(), news: list.slice(0, 300) }));
      } catch (e) { /* কোটা শেষ — উপেক্ষা */ }
      if (then) then();
    })
    .catch(function () { if (then) then(); })
    .then(function () { fullNewsLoading = false; });
}

function renderArticle(app, id, _retried) {
  /* ⚠️ আগে এখানে ছিল কেবল `state.byId[id]` — অর্থাৎ slug-লিংক কখনো মিলত না
     এবং পাঠক "সংবাদটি পাওয়া যায়নি" দেখতেন। এখন id ও slug দুটোই মেলে। */
  var a = findArticle(id);
  /* পূর্ণ বডি না থাকলে পটভূমিতে নামিয়ে এনে একবারই আবার রেন্ডার করি।
     (_retried গার্ড — নইলে বডি না পেলে অসীম পুনরাবৃত্তি হত) */
  if (a && (!a.paragraphs || !a.paragraphs.length) && !_retried && !fullNewsLoaded) {
    hydrateArticleBodies(function () { renderArticle(app, id, true); });
  }
  if (!a && (String(id) === "thy-recruitment-2026" || String(id).indexOf("thy") !== -1 || String(id).indexOf("recruitment") !== -1)) {
    a = RECRUITMENT_ARTICLE;
    state.byId[a.id] = a;
  }
  if (!a) {
    /* তালিকা এখনো লোড হয়নি? তাহলে "পাওয়া যায়নি" বলা অন্যায় —
       আগে ডেটা আনার চেষ্টা করা হয়, তারপর সিদ্ধান্ত (P1-10)। */
    if (!_retried && !state.articles.length) {
      hydrateArticleBodies(function () { renderArticle(app, id, true); });
      app.innerHTML = '<div class="empty"><p>সংবাদ লোড হচ্ছে…</p></div>';
      return;
    }
    document.title = "সংবাদ পাওয়া যায়নি — বাংলা নিউজ এডিশন";
    resetOgMeta();
    setRobots('noindex, follow');
    app.innerHTML = '<div class="empty"><h2 style="margin-bottom:.6rem">সংবাদটি পাওয়া যায়নি</h2>ফিড হালনাগাদ হওয়ায় লিংকটি পুরনো হয়ে থাকতে পারে।<br><br><a class="btn" href="' + homeHref() + '">← প্রচ্ছদে ফিরুন</a></div>';
    return;
  }
  document.title = escapeHtml(a.title) + " — বাংলা নিউজ এডিশন";
  recordRead(a.id); /* P6: রিড-হিস্টরি (রেকমেন্ডেশনের জন্য) */
  /* Dynamic social meta for Facebook/WhatsApp/Telegram share preview */
  updateOgMeta(a);
  var related = state.articles.filter(function (x) { return x.category === a.category && artKey(x) !== artKey(a); }).slice(0, 5);

  /* ══ অনুচ্ছেদ-কাঠামো অটুট রাখা ═══════════════════════════════════════
     আগে `stripHtml()` ডাকা হত — যা app.js-এ কখনো সংজ্ঞায়িতই ছিল না →
     ReferenceError → নিচের app.innerHTML পর্যন্ত পৌঁছাত না → ক্লিক করলে
     পাতার কিছুই বদলাত না (মৃত নেভিগেশন)।
     আর অনুচ্ছেদ ভাগ হত প্রি-স্প্লিট করা `a.paragraphs` থেকে, যা প্রায় সব
     ক্ষেত্রেই একটিমাত্র উপাদান দিত → পুরো সংবাদ এক অনুচ্ছেদে মিলিয়ে যেত।
     এখন BNECore.articleParagraphs() HTML-এর গঠন ধরে (</p>, <br>, ব্লক
     ট্যাগ) ভাগ করে — তাই অনুচ্ছেদ অটুট থাকে। */
  var paras = (window.BNECore && BNECore.articleParagraphs)
    ? BNECore.articleParagraphs(a)
    : (a.paragraphs || []).map(function (p) { return String(p || '').replace(/<[^>]*>/g, ' ').trim(); }).filter(Boolean);
  if (!paras.length && a.summary) paras = [String(a.summary)];

  var body = paras.map(function (p) {
    return "<p>" + escapeHtml(p) + "</p>";
  }).join("") || "<p>" + escapeHtml(a.summary || "") + "</p>";

  var figureHtml = artKey(a) === "thy-recruitment-2026"
    ? '<div style="display:grid;gap:1rem;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));margin-top:1.2rem;">' +
        '<figure style="margin:0;"><img src="/images/overseas-campaign.webp" alt="Recruitment Photo Banner" style="width:100%;border-radius:10px;"></figure>' +
        '<figure style="margin:0;"><img src="/images/overseas-campaign-poster.webp" alt="Recruitment Infographic Poster" style="width:100%;border-radius:10px;"></figure>' +
      '</div>'
    : '<figure><img src="' + escapeHtml(imgOf(a)) + '" alt="' + escapeHtml(a.title) +
      '" width="1200" height="675" fetchpriority="high" decoding="async"' + onImgErrAttr("hide") + ">" +
      /* ★ ছবির সূত্র ★
         ছবিটি মূল সংবাদপত্রের (og:image) — প্রমাণস্বরূপ ও কপিরাইট-শ্রদ্ধার
         জন্য সূত্র দেখানো হয়। ছবি না থাকলে (টাইপোগ্রাফিক কভার) কিছু দেখানো
         হয় না, কারণ তখন সেটি আমাদের নিজের তৈরি। */
      (a.image && a.imageCredit && !a.imageIsCover ? '<figcaption class="img-credit">ছবি: ' + escapeHtml(a.imageCredit) + "</figcaption>" : "") +
      "</figure>";

  app.innerHTML = '<div class="article-wrap"><article class="article">' +
    '<div class="breadcrumb"><a href="' + homeHref() + '">প্রচ্ছদ</a> / <a href="' + catHref(a.category) + '">' + escapeHtml(a.category) + "</a></div>" +
    badgeHtml(a.category) + "<h1>" + escapeHtml(a.title) + "</h1>" +
    '<div class="meta-row"><span class="src">' + escapeHtml(a.sourceLabel) + "</span><span>" + timeAgo(a.ts) + "</span></div>" +
    figureHtml +
    '<div class="article-body">' + body + "</div>" +
         /* ★ "নতুন পেজ খুলুন" বাটন সরানো হয়েছে ★
       আগে এখানে দুটি বোতাম ছিল — "মূল ওয়েবসাইটে পড়ুন ↗" ও
       "বিএনই নেটিভ রিডারে পড়ুন →"। দ্বিতীয়টি পাঠকের ব্রাউজার থেকে
       CORS প্রক্সি (api.allorigins.win) দিয়ে সোর্সের কাঁচা HTML আনত:
       ১০ সেকেন্ড অপেক্ষা, প্রায়ই ব্যর্থ, আর সফল হলেও অন্যের পূর্ণ লেখা
       হুবহু আমাদের পাতায় দেখানো হত।
       এখন সম্পূর্ণ সংবাদ সংগ্রহ-সময়েই আমাদের নিজের ভাষায় লেখা হয়ে
       ডেটাবেসে থাকে (lib/ai.js → writeFullArticle), তাই পাঠক সাথে
       সাথেই আমাদের পাতায় সব পড়তে পারেন — অপেক্ষা বা নতুন পেজ লাগে না।
       উৎসের কৃতিত্ব সংবাদের নিচে অটুট থাকে। */
         "" +
    /* ══ শেয়ার বার — পুরো সাইটে একই উপাদান ═══════════════════════════════
       ব্যবহারকারীর অভিযোগ (২০২৬-০৯-২৭): "ফেসবুকে শেয়ার বা হোয়াটসঅ্যাপে
       শেয়ার করার অপশন নেই — পোর্টাল থেকে কেউ শেয়ার করতে পারে না।"

       আগে কেবল সংবাদ পাতায় ৩টি বোতাম থাকত, আর সেগুলো inline onclick
       ব্যবহার করত (CSP-তে inline handler নিষিদ্ধ হলে অকেজো হয়ে যেত)।
       এখন shareBarHtml() একটাই উপাদান দেয় — FB, WhatsApp, Telegram, X,
       LinkedIn, ইমেইল, লিংক-কপি ও ফোনের নিজস্ব শেয়ার মেনু — এবং সেটি
       সংবাদ পাতা, কার্ড, বিভাগ ও ডেস্ক — সবখানেই ব্যবহৃত হয়।
       কপি/নেটিভ বোতামে inline handler নেই: data-* ধরে delegated
       listener কাজ করে (নিচে bindShareHandlers দেখুন)। */
    shareBarHtml(articleUrl(a), a.title) +
    renderAdSlot("article_bottom") +
    (a.tags.length ? '<div class="tags">' + a.tags.map(function (t) { return "<span>#" + escapeHtml(t) + "</span>"; }).join("") + "</div>" : "") +
    "</article><aside>" + renderAdSlot("article_sidebar") + sectionHead("সম্পর্কিত সংবাদ") +
    '<div style="display:grid;gap:.8rem">' +
    (related.length ? related.map(cardSmHtml).join("") : '<div class="empty">এই বিভাগে আর কোনো সংবাদ নেই।</div>') +
    "</div></aside></div>";
  window.scrollTo(0, 0);
}

var PROBASHI_KEYWORDS = [
  "প্রবাসী", "প্রবাস", "রেমিট্যান্স", "ভিসা", "আকামা", "পাসপোর্ট", "বিএমইটি", "প্রবাসী কল্যাণ", 
  "জনশক্তি", "সৌদি", "মালয়েশিয়া", "দুবাই", "কাতার", "কুয়েত", "ওমান", "ইউরোপ", "রোমানিয়া", 
  "ইতালি", "গ্রীস", "মাল্টা", "জাপান", "কোরিয়া", "ওয়ার্ক পারমিট", "এয়ারপোর্ট", "ওয়েজ আর্নার্স"
];

function isProbashiArticle(article) {
  if (article.category === "প্রবাস") return true;
  var text = (article.title + " " + article.summary + " " + (article.tags || []).join(" ")).toLowerCase();
  for (var i = 0; i < PROBASHI_KEYWORDS.length; i++) {
    if (text.indexOf(PROBASHI_KEYWORDS[i].toLowerCase()) !== -1) return true;
  }
  return false;
}

function renderProbashiDesk(app, subFilter) {
  document.title = "প্রবাস বাংলা নিউজ — বাংলা নিউজ এডিশন | BANGLA NEWS EDITION";
  resetOgMeta();
  setCanonical(canonicalFor(deskHref(subFilter || "")));
  setBreadcrumbLd([
    breadcrumbItem('প্রচ্ছদ', OG_DEFAULTS.url),
    breadcrumbItem('প্রবাস বাংলা নিউজ', canonicalFor(deskHref('')))
  ]);
  var expatArticles = state.articles.filter(isProbashiArticle);
  if (!expatArticles.length) {
    expatArticles = state.articles.filter(function(a) { return a.category === "প্রবাস" || a.category === "আন্তর্জাতিক"; });
  }

  var filtered = expatArticles.slice();
  if (subFilter === 'remittance') {
    filtered = expatArticles.filter(function(a) { return /রেমিট্যান্স|টাকা|ব্যাংক|ডলার|প্রণোদনা|রিজার্ভ/i.test(a.title + a.summary); });
  } else if (subFilter === 'visa') {
    filtered = expatArticles.filter(function(a) { return /ভিসা|আকামা|ওয়ার্ক পারমিট|নিয়োগ|সৌদি|মালয়েশিয়া|ইউরোপ|রোমানিয়া|ইতালি|জাপান|কোরিয়া/i.test(a.title + a.summary); });
  } else if (subFilter === 'welfare') {
    filtered = expatArticles.filter(function(a) { return /বিএমইটি|পাসপোর্ট|প্রবাসী কল্যাণ|স্মার্ট|কার্ড|এয়ারপোর্ট|হেল্প/i.test(a.title + a.summary); });
  }
  if (!filtered.length) filtered = expatArticles;

  var html = '<div class="probashi-desk-banner">' +
    '<h2>✈️ প্রবাস বাংলা নিউজ ডেস্ক — প্রবাসীদের আস্থা ও বিশ্বস্ত খবরের ঠিকানা</h2>' +
    '<p>বিশ্বজুড়ে বসবাসরত প্রবাসী এবং প্রবাসগমনেচ্ছু বাংলাদেশীদের জন্য বিশেষায়িত খবর, বৈধ উপায়ে রেমিট্যান্স তথ্য, ভিসা আপডেট, বিএমইটি স্মার্ট প্রবাসী কার্ড গাইড ও বিশেষ নিয়োগ বিজ্ঞপ্তি।</p>' +
    '<div class="probashi-filter-bar">' +
      '<a href="' + deskHref('') + '" class="probashi-filter-btn ' + (!subFilter || subFilter === 'all' ? 'active' : '') + '">সব প্রবাস সংবাদ (' + bn(expatArticles.length) + ')</a>' +
      '<a href="' + deskHref('remittance') + '" class="probashi-filter-btn ' + (subFilter === 'remittance' ? 'active' : '') + '">💵 রেমিট্যান্স ও ব্যাংকিং</a>' +
      '<a href="' + deskHref('visa') + '" class="probashi-filter-btn ' + (subFilter === 'visa' ? 'active' : '') + '">🛂 প্রবাসগমন ও ভিসা গাইড</a>' +
      '<a href="' + deskHref('welfare') + '" class="probashi-filter-btn ' + (subFilter === 'welfare' ? 'active' : '') + '">📜 বিএমইটি ও স্মার্ট প্রবাসী কার্ড</a>' +
    '</div></div>';

  html += renderAdSlot("probashi_hub");
  html += renderAdSlot("probashi_top");
  html += '<div class="grid cols-3" style="margin-top:1.2rem">' +
    (filtered.length ? filtered.map(cardHtml).join("") : '<div class="empty">এই মুহূর্তে প্রবাস সংবাদের ফিল্টারে কোনো খবর নেই।</div>') +
    '</div>';

  app.innerHTML = html;
  window.scrollTo(0, 0);
}

function renderTicker() {
  var wrap = document.getElementById("ticker-wrap");
  var track = document.getElementById("ticker");
  var top = state.articles.slice(0, 8);
  if (!top.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  track.innerHTML = top.map(function (a) {
    return '<a href="' + newsHref(artKey(a)) + '"><span class="dot">●</span>' + escapeHtml(a.title) + "</a>";
  }).join("");
}

function renderNav() {
  var route = parseRoute();
  document.querySelectorAll("#nav-list a").forEach(function (link) {
    var nav = link.getAttribute("data-nav");
    var active = (route.page === "home" && nav === "home") || 
                 (route.page === "category" && nav === route.param) ||
                 (route.page === "probashi-desk" && nav === "probashi-desk");
    link.classList.toggle("active", active);
  });
}

function parseRoute() {
  var h = decodeURIComponent(location.hash || "");
  var path = location.pathname;
  var m;
  /* http হোস্টে রিয়েল-পাথ আগে (netlify.toml redirect → index.html) */
  if (isHttpHost()) {
    if ((m = path.match(/^\/news\/([^/]+)/))) return { page: "news", param: decodeURIComponent(m[1]) };
    if ((m = path.match(/^\/category\/([^/]+)/))) return { page: "category", param: decodeURIComponent(m[1]) };
    if ((m = path.match(/^\/search\/([^/]+)/))) return { page: "search", param: decodeURIComponent(m[1]) };
    if ((m = path.match(/^\/desk\/probashi-bangla-news(?:\/(.+))?$/))) {
      return { page: "probashi-desk", param: m[1] ? decodeURIComponent(m[1]) : null };
    }
  }
  if ((m = h.match(/^#\/news\/(.+)$/))) return { page: "news", param: m[1] };
  if ((m = h.match(/^#\/category\/(.+)$/))) return { page: "category", param: m[1] };
  if ((m = h.match(/^#\/search\/(.+)$/))) return { page: "search", param: m[1] };
  if ((m = h.match(/^#\/desk\/probashi-bangla-news(?:\/(.+))?$/)) || h === "#/probashi") {
    return { page: "probashi-desk", param: m ? m[1] : null };
  }
  return { page: "home", param: null };
}

/* ── নিরাপত্তা ও আড়ালকরণ ইঞ্জিন (অ্যাডমিন-অনলি সুরক্ষা) ────────── */
function secureAndCleanUI() {
  var isAdmin = false;
  try {
    isAdmin = !!localStorage.getItem("azadi_admin_hash");
  } catch (e) {}

  if (isAdmin) {
    document.body.classList.add("show-admin");
  } else {
    document.body.classList.remove("show-admin");
  }

  /* ১. স্ট্যাটাস বার — সাধারণ পাঠকের কাছে অপ্রয়োজনীয় টেকনিক্যাল বার
        কখনো দেখানো হয় না (ইতিমধ্যে markup-এ display:none আছে)। */
  var bar = document.getElementById("statusbar");
  if (bar) {
    bar.style.setProperty("display", isAdmin ? "flex" : "none", "important");
  }

  /* ══ P1-8 ফিক্স: কীওয়ার্ড-ভিত্তিক DOM আড়ালকরণ সম্পূর্ণ বাদ ═════════════
     আগের আচরণ: নেভিগেশন/ফুটারের যেকোনো লিংকের টেক্সটে "উৎস", "সূত্র",
     "ফিড", "source", "feed" ইত্যাদি পেলে সেটি display:none করে দেওয়া হত।

     কেন এটি সরানো হলো (তিনটি স্বতন্ত্র কারণ):
       ক) এটি বৈধ পাঠক-মুখী কনটেন্ট লুকিয়ে ফেলত — যেমন "সূত্র: প্রথম আলো"
          লেখা একটি লিংক।
       খ) ক্রলার-ভিউতে (SSR) বা হেডলেস ব্রাউজারে এই লজিক চলে না —
          ফলে ক্রলার ও পাঠক ভিন্ন সাইট দেখত → cloaking-ঝুঁকি ও
          Google নীতিভঙ্গের সম্ভাবনা।
       গ) এটি নিরাপত্তার কোনো কাজ করত না — এটি কেবল দৃশ্য-আড়াল।

     এখন সঠিক পদ্ধতি: অ্যাডমিন-শুধু কোনো উপাদান দরকার হলে সেটি markup-এ
     data-admin-only="true" দিয়ে চিহ্নিত করুন, আর CSS কেবল তখনই দেখাবে
     যখন <body> ক্লাসে show-admin থাকে। কালো-তালিকা নয় — হোয়াইট-লিস্ট। */
  var adminBlocks = document.querySelectorAll('[data-admin-only="true"], .admin-only');
  adminBlocks.forEach(function (el) {
    el.style.removeProperty("display");
  });
}

function render() {
  var app = document.getElementById("app");
  var route = parseRoute();
  clearHeroTimer(); /* পুরনো রোটেশন টাইমার বন্ধ (লিক প্রতিরোধ) */
  /* ★ P0-5 স্তর ২: প্রতিটি render()-এ অ্যাড-ক্যাপ রিসেট ★
     নইলে SPA নেভিগেশনে পুরনো পেজের অ্যাড-আইডি মনে থাকত এবং নতুন পেজে
     বৈধ বিজ্ঞাপন বাদ পড়ত। রিসেট না করলে উল্টো সমস্যাও হত — নতুন পেজে
     ক্যাপ ইতিমধ্যে পূর্ণ ধরে নিয়ে সব বিজ্ঞাপন লুকিয়ে যেত। */
  resetAdCaps();
  if (route.page === "news") renderArticle(app, route.param);
  else if (route.page === "category") renderCategory(app, route.param);
  else if (route.page === "search") renderSearch(app, route.param);
  else if (route.page === "probashi-desk") renderProbashiDesk(app, route.param);
  else renderHome(app);
  if (route.page === "home") startHeroRotator();
  renderTicker();
  renderNav();
  secureAndCleanUI();
}

/* ══ P1-11 ফিক্স — লাইভ ঘড়ি ও তারিখ বাধ্যতামূলকভাবে ঢাকার সময়ে ════════════
   আগে new Date().getHours() এবং Intl("bn-BD") ব্রাউজারের লোকাল টাইমজোন
   ব্যবহার করত। অর্থাৎ প্রবাসী পাঠক দুবাই/লন্ডন থেকে দেখলে সাইটে দুবাই/লন্ডনের
   সময় দেখাত — অথচ শিরোনামে লেখা "ঢাকা, বাংলাদেশ"। আর ডিভাইসের টাইমজোন
   ভুল থাকলে "ভবিষ্যতের তারিখ" দেখাত (আপনার ২য় স্ক্রিনশটের সমস্যা)।

   এখন ঘড়ি ও তারিখ সর্বদা Asia/Dhaka (UTC+6) অনুযায়ী — বাংলাদেশের পাঠক
   যেভাবে প্রত্যাশা করেন, এবং প্রবাসী পাঠকও দেশের সময়ই দেখেন। */
function startLiveClock() {
  function update() {
    var timeEl = document.getElementById("live-time");
    var dateEl = document.getElementById("today-date");
    var parts = dhakaNowParts ? dhakaNowParts(new Date()) : null;

    if (timeEl) {
      if (parts) {
        timeEl.textContent = bn(parts.hour) + ":" + bn(parts.minute) + ":" + bn(parts.second);
      } else {
        var now = new Date();
        timeEl.textContent = bn(String(now.getHours()).padStart(2, "0")) + ":" +
          bn(String(now.getMinutes()).padStart(2, "0")) + ":" +
          bn(String(now.getSeconds()).padStart(2, "0"));
      }
    }
    if (dateEl) {
      var wd = dhakaDate(new Date(), { weekday: "long" });
      var full = dhakaDate(new Date(), { day: "numeric", month: "long", year: "numeric" });
      dateEl.textContent = wd + ", " + full;
      dateEl.setAttribute("data-tz", "Asia/Dhaka");
    }
  }
  update();
  setInterval(update, 1000);
}

/* ── বুটস্ট্র্যাপ ──────────────────────────────────────────────── */
function init() {
  /* শেয়ার বোতাম (কপি ও ফোনের শেয়ার মেনু) — একবারই বাঁধা হয়, তারপর
     পুরো সাইটে `data-share-*` থাকা যেকোনো উপাদান নিজে থেকেই কাজ করে। */
  try { bindShareHandlers(); } catch (e) { /* পুরনো ব্রাউজার — শেয়ার লিংক তবু কাজ করে */ }
  /* SMO/P0 — পুরনো hash লিংককে রিয়েল পাথে নিয়ে যাও (রেন্ডারের আগেই) */
  canonicalizeRoute();
  startLiveClock();
  document.getElementById("footer-year").textContent = "© " + bn(new Date().getFullYear()) + " বাংলা নিউজ এডিশন";

  var footCats = document.getElementById("footer-cats");
  if (footCats) {
    footCats.innerHTML = "";
    CATEGORIES.forEach(function (cat) {
      var fli = document.createElement("li");
      fli.innerHTML = '<a href="' + catHref(cat.name) + '">' + escapeHtml(cat.name) + "</a>";
      footCats.appendChild(fli);
    });
  }
  var footSources = document.getElementById("footer-sources");
  Object.keys(SOURCES).forEach(function (key) {
    var li = document.createElement("li");
    li.textContent = SOURCES[key].label;
    footSources.appendChild(li);
  });

  window.addEventListener("hashchange", render);
  window.addEventListener("popstate", render);

  /* SPA লিংক ডেলিগেশন — রিয়েল-পাথ ও hash উভয় href কাজ করে (P1) */
  document.addEventListener("click", function (e) {
    var el = e.target;
    while (el && el !== document && !(el.tagName === "A" && el.getAttribute("href"))) el = el.parentNode;
    if (!el || el === document) return;
    var href = el.getAttribute("href") || "";
    if (!href || /^(https?:|mailto:|tel:|javascript:)/i.test(href)) return;
    if (href.charAt(0) === "#" && href.charAt(1) !== "/") return; /* পেজ-অ্যাঙ্কর skip */
    if (href.indexOf("#/") === 0 || (isHttpHost() && href.charAt(0) === "/")) {
      e.preventDefault();
      navigate(href);
    }
  });

  /* সার্চ ফর্ম সাবমিট হ্যান্ডলার (গোপন অ্যাডমিন ট্রিগার — SHA-256 ডাইজেস্ট চেক) */
  var searchForm = document.getElementById("search-form");
  if (searchForm) {
    searchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("search-input");
      var q = (input ? input.value : "").trim();
      if (!q) return;

      var normalized = q.replace(/[০-৯]/g, function (d) {
        var map = { "০":"0", "১":"1", "২":"2", "৩":"3", "৪":"4", "৫":"5", "৬":"6", "৭":"7", "৮":"8", "৯":"9" };
        return map[d] || d;
      });

      /* গোপন অ্যাডমিন ট্রিগার — প্লেইনটেক্সট নেই; SHA-256 ডাইজেস্ট তুলনা (সার্ভার-অথ P5-এর আগের সেতু) */
      var ADMIN_TRIGGER_HASH = "8c32cf6ed5feb952acfa9eeb45ca32492b102f3372b1d48aa8ba3899958ffbeb";
      var digestPromise = (window.crypto && crypto.subtle)
        ? crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized)).then(function (buf) {
            return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
          }).catch(function () { return null; })
        : Promise.resolve(null);
      digestPromise.then(function (h) {
        if (h === ADMIN_TRIGGER_HASH) {
          try { localStorage.setItem("azadi_admin_hash", "1"); } catch (err) {}
          location.href = (siteConfig.settings && siteConfig.settings.adminPath) || BNE_ADMIN_URL;
        } else {
          /* সার্চ রুটে নেভিগেট (রিয়েল-পাথ বা hash — হোস্ট অনুযায়ী) */
          navigate(searchHref(q));
          if (input) input.blur();
        }
      });
    });
  }

  /* গোপন অ্যাডমিন ট্রিগার — ফুটারের সাল-লেখায় ২.৫ সেকেন্ডের মধ্যে ৭ বার ট্যাপ */
  var taps = 0, tapTimer = null;
  document.getElementById("footer-year").addEventListener("click", function () {
    taps += 1;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(function () { taps = 0; }, 2500);
    if (taps >= 7) {
      taps = 0;
      location.href = (siteConfig.settings && siteConfig.settings.adminPath) || BNE_ADMIN_URL;
    }
  });

  /* ⚡ মাস্টার try-catch-finally রেন্ডার লুপ (ইনফিনিট লোডিং লুপ প্রতিরোধ) */
  try {
    var skElement = document.getElementById("skeleton");
    if (skElement && skElement.parentNode) skElement.parentNode.removeChild(skElement);
    var sbElement = document.getElementById("statusbar");
    if (sbElement) sbElement.style.display = "none";

    loadCache();
    /* ★ P0-3: প্রথম পেইন্টের আগেই localStorage-এ রাখা শেষ ভালো কনফিগ ★
       নেটওয়ার্কের জন্য অপেক্ষা করতে হয় না — তাই Slow 3G-এও সাথে সাথে
       সম্পাদকীয় সংবাদ ও বিষয়বস্তু দেখা যায়, সাদা স্ক্রিন নয়। */
    loadCachedConfig();
    applyEditorNews(); /* ক্যাশ/ফিড যাই হোক, সম্পাদকীয় লিড সর্বদা দৃশ্যমান */
    render();

    fetchConfigAny().then(function () {
      loadLocalConfigPreview();
      applyEditorNews();
      saveCachedConfig();
      render();
    }).catch(function () {});

    refreshAll(true).then(function () {
      applyEditorNews();
      render();
    }).catch(function () {});
  } catch (err) {
    console.error("Init execution error caught:", err);
    state.articles = SEED_ARTICLES;
    indexArticles();
    render();
  } finally {
    var skFinal = document.getElementById("skeleton");
    if (skFinal && skFinal.parentNode) skFinal.parentNode.removeChild(skFinal);
    var sbFinal = document.getElementById("statusbar");
    if (sbFinal) sbFinal.style.display = "none";
    initGlobalAdManager();
  }

  /* ট্যাব খোলা থাকলেও প্রতি ৫ মিনিটে ব্যাকগ্রাউন্ড হালনাগাদ */
  setInterval(function () {
    fetchConfigAny().then(function () {
      loadLocalConfigPreview();
      refreshAll(true).then(function () { applyEditorNews(); render(); });
    }).catch(function () {});
  }, CACHE_TTL);

  /* SMO/P1 — প্যানেল থেকে প্রকাশের সাথে সাথেই (≤৬০ সেকেন্ড) অটো আপডেট */
  watchConfigVersion();
}

/* ═══ BNE Native Readability Extractor (Zero iFrames) ═══ */
function openBneInAppReader(url, title, sourceLabel) {
  var modal = document.getElementById("bne-reader-modal");
  if (!modal) return;

  var loader = document.getElementById("bne-reader-loader");
  var content = document.getElementById("bne-reader-content");
  var titleEl = document.getElementById("bne-reader-title");

  if (titleEl) titleEl.textContent = title || "বাংলা নিউজ এডিশন — নেটিভ সংবাদ পাঠক";
  if (loader) loader.classList.remove("hidden");
  if (content) {
    content.classList.add("hidden");
    content.innerHTML = "";
  }

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  /* CORS প্রক্সির মাধ্যমে মূল সংবাদের Raw HTML ফেচ */
  var proxyUrl = "/api/rss-proxy?url=" + encodeURIComponent(url);

  fetchWithTimeout(proxyUrl, 10000)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      var rawHtml = data ? data.contents : "";
      if (!rawHtml) throw new Error("Empty HTML content");

      var parser = new DOMParser();
      var doc = parser.parseFromString(rawHtml, "text/html");

      /* স্ক্রিপ্ট, স্টাইল, নেভিগেশন ও এক্সটার্নাল অ্যাড রিমুভ */
      var unwanted = doc.querySelectorAll("script, style, nav, footer, header, aside, iframe, form, button, .ad, .advertisement");
      unwanted.forEach(function (el) { el.remove(); });

      /* মূল কনটেন্ট রুট এলিমেন্ট সিলেকশন */
      var articleEl = doc.querySelector("article, .post-content, .article-body, .main-content, main");
      var htmlPayload = "";

      if (articleEl) {
        htmlPayload = articleEl.innerHTML;
      } else {
        var ps = doc.querySelectorAll("p, img, h1, h2, h3");
        var parts = [];
        ps.forEach(function (p) {
          if (p.textContent.trim().length > 20 || p.tagName === "IMG") {
            parts.push(p.outerHTML);
          }
        });
        htmlPayload = parts.join("");
      }

      if (!htmlPayload || htmlPayload.length < 50) {
        throw new Error("Content extraction fallback needed");
      }

      renderNativeModalContent(title, htmlPayload, url, sourceLabel || "সংবাদ মাধ্যম");
    })
    .catch(function () {
      /* ফলব্যাক: প্রাক-প্রসেস করা টেক্সট ও সামারি রেন্ডার */
      var fallbackHtml = '<h3>' + escapeHtml(title) + '</h3><p>সংবাদটির বিস্তারিত অংশ সরাসরি রিডঅ্যাবিলিটি পোর্টালে লোড করা হয়েছে। মূল সংবাদের সম্পূর্ণ ভার্সন পড়তে নিচের বোতামে ক্লিক করুন।</p>';
      renderNativeModalContent(title, fallbackHtml, url, sourceLabel || "সংবাদ মাধ্যম");
    });
}

function renderNativeModalContent(title, bodyHtml, url, sourceLabel) {
  var loader = document.getElementById("bne-reader-loader");
  var content = document.getElementById("bne-reader-content");

  if (loader) loader.classList.add("hidden");
  if (content) {
    var editorialBox =
      '<div class="bne-editorial-note-box" style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #16a34a;padding:1rem;border-radius:6px;margin-bottom:1.2rem;font-size:0.88rem;color:#166534;line-height:1.6;">' +
        '<b>📝 বি-এন-ই এডিটরিয়াল নোট:</b> এই সংবাদটি স্বয়ংক্রিয়ভাবে সংগৃহীত এবং আমাদের সম্পাদকীয় নীতি অনুযায়ী ফিল্টারকৃত। সংবাদের মূল সোর্স: <b>' + escapeHtml(sourceLabel) + '</b>। (বি-এন-ই নেটিভ ইন-অ্যাপ প্রকাশনা)' +
      '</div>';

    content.innerHTML =
      '<div class="bne-native-article-wrap">' +
        '<h2>' + escapeHtml(title) + '</h2>' +
        '<div class="bne-native-meta">সংবাদ পরিবেশনা: <b>' + escapeHtml(sourceLabel) + '</b> · বি-এন-ই কিউরেটেড প্রকাশনা</div>' +
        editorialBox +
        '<div class="bne-native-body">' + bodyHtml + '</div>' +
        '<div class="bne-canonical-footer">' +
          'সংবাদ সুত্র ও পোর্টালে তথ্য ভাণ্ডার: <b>' + escapeHtml(sourceLabel) + '</b> · বাংলা নিউজ এডিশন ডিজিটাল কিউরেটর আর্কাইভ' +
        '</div>' +
      '</div>';
    content.classList.remove("hidden");
  }
}

function closeBneInAppReader() {
  var modal = document.getElementById("bne-reader-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  var content = document.getElementById("bne-reader-content");
  if (content) content.innerHTML = "";
  document.body.style.overflow = "";
}

/* Global Smart Ad Engine Handlers */
function closeStickyBottomAd() {
  var ad = document.getElementById("bne-sticky-bottom-ad");
  if (ad) ad.remove();
}

function closeScrollPopupAd() {
  var modal = document.getElementById("bne-scroll-popup-ad");
  if (modal) { modal.classList.add("hidden"); modal.setAttribute("aria-hidden", "true"); }
  /* P1-8: দুটো চিহ্নই রাখা হয় — এই ট্যাবে ও সামনের ভিজিটে আর বিরক্ত নয় */
  try {
    sessionStorage.setItem("recruitment_ad_dismissed", "true");
    localStorage.setItem("recruitment_ad_dismissed_forever", "true");
  } catch (e) { /* প্রাইভেট মোড/কোটা শেষ */ }
}

function initGlobalAdManager() {
  var activeAds = (siteConfig.ads || []).filter(function (a) { return a.enabled && a.type === "image"; });
  if (!activeAds.length) {
    if (window.AZADI_DEFAULT_CONFIG && window.AZADI_DEFAULT_CONFIG.ads) {
      activeAds = window.AZADI_DEFAULT_CONFIG.ads.filter(function (a) { return a.enabled && a.type === "image"; });
    }
  }

  /* 🔴 Ad Deduplication: Ensure floating corner ad does NOT repeat sidebar/body ad */
  var selectedAd = activeAds.find(function(a) {
    return a.id !== "ad_paint_sidebar" && a.id !== "ad_paint_bottom";
  }) || activeAds[0] || {
    title: "URGENT RECRUITMENT NOTICE 2026 — THY International",
    image: "/images/overseas-campaign.webp",
    link: "#/news/thy-recruitment-2026"
  };

  var existing = document.getElementById("bne-sticky-bottom-ad");
  if (existing) existing.remove();

  var adContainer = document.createElement("div");
  adContainer.id = "bne-sticky-bottom-ad";
  adContainer.className = "bne-sticky-bottom-ad";
  adContainer.innerHTML =
    '<button class="bne-ad-close-btn" onclick="closeStickyBottomAd()" title="বিজ্ঞাপন বন্ধ করুন [✕]">✕</button>' +
    '<div class="bne-ad-tag-label">📢 স্পন্সরড বিজ্ঞাপন | BNE</div>' +
    '<div class="bne-ad-content">' +
      '<a href="' + escapeHtml(resolveHref(selectedAd.link || "#/desk/probashi-bangla-news")) + '">' +
        '<img src="' + escapeHtml(selectedAd.image) + '" alt="' + escapeHtml(selectedAd.title) + '" />' +
      '</a>' +
    '</div>';

  document.body.appendChild(adContainer);

  var popupTriggered = false;
  window.addEventListener("scroll", function () {
    /* 🔴 Reading Progress Bar Logic */
    var progressBar = document.getElementById("bne-progress-bar");
    if (progressBar) {
      var winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      var height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      var scrolled = (height > 0) ? (winScroll / height) * 100 : 0;
      progressBar.style.width = scrolled + "%";
    }
  });

  /* ══ পপ-আপ ইন্টারস্টিশিয়াল (P1-8 ফিক্স) ════════════════════════════════
     আগের আচরণ: পেজ খোলার ৩ সেকেন্ড পর একটি modal নিজে থেকে খুলত, আর
       • কীবোর্ড ফোকাস ভেতরে যেত না → স্ক্রিন-রিডার/কীবোর্ড ব্যবহারকারী
         আটকে যেতেন
       • ESC চাপলেও বন্ধ হত না
       • বন্ধ করলে কেবল sessionStorage-এ চিহ্ন — তাই প্রতি নতুন ট্যাবে
         আবার খুলত (বিরক্তিকর, বিশেষ করে slow মোবাইল ডেটায়)

     এখন: ESC-এ বন্ধ, ফোকাস ভেতরে ও ফিরে, ও dismiss-চিহ্ন দুটোই লেখা হয়
     (sessionStorage + localStorage), তাই একবার বন্ধ করলে ব্যবহারকারীকে
     আর বিরক্ত করা হয় না। */
  if (document.getElementById("bne-scroll-popup-ad")) {
    var popupDismissed = false;
    try {
      popupDismissed = !!(sessionStorage.getItem("recruitment_ad_dismissed")
        || localStorage.getItem("recruitment_ad_dismissed_forever"));
    } catch (e) { /* প্রাইভেট মোড */ }
    if (!popupDismissed) {
      setTimeout(function () {
        var modal = document.getElementById("bne-scroll-popup-ad");
        if (!modal) return;
        modal.classList.remove("hidden");
        modal.setAttribute("aria-hidden", "false");
        var closeEl = modal.querySelector("[data-close-popup]") || modal.querySelector("button");
        if (closeEl && closeEl.focus) { try { closeEl.focus(); } catch (e) { /* ignore */ } }
        var onKey = function (ev) {
          if (ev.key === "Escape") { closeScrollPopupAd(); document.removeEventListener("keydown", onKey); }
        };
        document.addEventListener("keydown", onKey);
      }, 3000);
    }
  }
}

/* 🌓 Theme & Mobile Drawer Initializer */
function initUiInteractions() {
  /* ══ সংরক্ষিত থিম প্রয়োগ (P1-2 ফিক্স) ══════════════════════════════════
     আগের আচরণ: থিম শুধু **যোগ** করা হত (add), কখনো সরানো হত না। আর SSR
     সংবাদ পাতায় <html class="force-dark"> কঠিনভাবে বসানো থাকত। ফলে যিনি
     লাইট থিম বেছেছেন, তিনি সংবাদ পাতায় ডার্ক থিমে আটকে যেতেন।

     এখন: সংরক্ষিত পছন্দই চূড়ান্ত — লাইট হলে force-dark সরিয়ে দেওয়া হয়,
     তাই কঠিনভাবে বসানো ক্লাসও মুছে যায়। */
  function applyTheme(dark) {
    document.documentElement.classList.toggle("force-dark", dark);
    if (document.body) document.body.classList.toggle("force-dark", dark);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }
  var savedTheme = null;
  try { savedTheme = localStorage.getItem("bne-theme"); } catch (e) { /* প্রাইভেট মোড */ }
  var prefersDark = false;
  try { prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (e) { /* পুরনো ব্রাউজার */ }
  applyTheme(savedTheme ? savedTheme === "dark" : prefersDark);

  var themeBtn = document.getElementById("theme-toggle-btn");
  if (themeBtn) {
    themeBtn.addEventListener("click", function() {
      var nowDark = !document.documentElement.classList.contains("force-dark");
      applyTheme(nowDark);
      try { localStorage.setItem("bne-theme", nowDark ? "dark" : "light"); } catch (e) { /* ignore */ }
      themeBtn.setAttribute("aria-pressed", nowDark ? "true" : "false");
      themeBtn.title = nowDark ? "লাইট থিমে যান" : "ডার্ক থিমে যান";
    });
    themeBtn.setAttribute("aria-pressed", document.documentElement.classList.contains("force-dark") ? "true" : "false");
  }

  /* Mobile Drawer Toggle */
  var menuBtn = document.getElementById("mobile-menu-btn");
  var drawer = document.getElementById("mobile-drawer");
  var overlay = document.getElementById("drawer-overlay");
  var closeBtn = document.getElementById("drawer-close-btn");

  /* ══ ড্রয়ার: কীবোর্ড ও স্ক্রিন-রিডার (P1-5 ফিক্স) ═══════════════════════
     আগে কেবল CSS ক্লাস `active` বদলানো হত; `aria-hidden="true"` চিরকাল
     থেকে যেত এবং `aria-expanded` কখনো হালনাগাদ হত না। ফলে স্ক্রিন-রিডার
     ব্যবহারকারী মেনুটি পেতেনই না, আর `aria-expanded` মিথ্যা জানাত।
     এখন অ্যাট্রিবিউট দুটো সত্যিকারভাবে বদলায়, ESC চাপলে বন্ধ হয় এবং
     খোলার সময় ফোকাস ড্রয়ারের প্রথম লিংকে যায়। */
  function setDrawer(open) {
    if (drawer) {
      drawer.classList.toggle("active", open);
      drawer.setAttribute("aria-hidden", open ? "false" : "true");
    }
    if (overlay) {
      overlay.classList.toggle("active", open);
      overlay.setAttribute("aria-hidden", open ? "false" : "true");
    }
    if (menuBtn) menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && drawer) {
      var first = drawer.querySelector("a, button");
      if (first && first.focus) { try { first.focus(); } catch (e) { /* ignore */ } }
    } else if (!open && menuBtn && menuBtn.focus) {
      try { menuBtn.focus(); } catch (e) { /* ignore */ }
    }
  }
  function openDrawer() { setDrawer(true); }
  function closeDrawer() { setDrawer(false); }

  if (menuBtn) menuBtn.addEventListener("click", openDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (overlay) overlay.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && drawer && drawer.classList.contains("active")) closeDrawer();
  });

  /* Close drawer on nav link click */
  if (drawer) {
    drawer.querySelectorAll("a").forEach(function(link) {
      link.addEventListener("click", closeDrawer);
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initUiInteractions);
} else {
  initUiInteractions();
}

document.addEventListener("DOMContentLoaded", init);
