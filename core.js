/**
 * BNE — Core Pure Logic (DOM-free)
 * app.js-এর সাথে লোড হয় (index.html-এ app.js-এর আগে) এবং node-এ টেস্টযোগ্য (tests/core.test.js)।
 * অর্ডার: core.js → app.js
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BNE_CORE = factory();
})(typeof self !== "undefined" ? self : this, function () {

  /* ══ P0-2 ফিক্স: সব বিভাগ-ছবির পাথ absolute (leading slash) ═══════════
     আগে "images/national.jpg" ছিল relative। ক্যাটাগরি বা সংবাদ পাতায়
     (/category/… বা /news/…) থাকলে ব্রাউজার সেটি /category/images/… হিসেবে
     সমাধান করত → ৪০৪ → onerror → আবার একই ডিফল্ট ছবি। এটাই ছিল
     "একই ছবি বারবার আসার" দ্বিতীয় স্তরের কারণ।
     এখন প্রতিটি পাথ root-anchored, তাই হোস্ট যেখানেই হোক সঠিক ফাইল আসে। */

  var CATEGORIES = [
    { name: "জাতীয়", badge: "", img: "/images/national.jpg", hue: 355 },
    { name: "রাজনীতি", badge: "b-red", img: "/images/politics.jpg", hue: 12 },
    { name: "সারাদেশ", badge: "b-teal", img: "/images/national.jpg", hue: 168 },
    { name: "অর্থনীতি", badge: "b-amber", img: "/images/economy.jpg", hue: 38 },
    { name: "আন্তর্জাতিক", badge: "b-sky", img: "/images/international.jpg", hue: 205 },
    { name: "খেলা", badge: "b-indigo", img: "/images/sports.jpg", hue: 262 },
    { name: "বিনোদন", badge: "b-fuchsia", img: "/images/entertainment.jpg", hue: 292 },
    { name: "শিক্ষা", badge: "b-cyan", img: "/images/technology.jpg", hue: 190 },
    { name: "চাকরি", badge: "b-amber", img: "/images/economy.jpg", hue: 45 },
    { name: "প্রবাস", badge: "b-sky", img: "/images/international.jpg", hue: 222 },
    { name: "ধর্ম", badge: "b-teal", img: "/images/national.jpg", hue: 150 },
    { name: "স্বাস্থ্য", badge: "b-teal", img: "/images/health.jpg", hue: 128 },
    { name: "প্রযুক্তি", badge: "b-cyan", img: "/images/technology.jpg", hue: 178 }
  ];

  var CATEGORY_KEYWORDS = [
    { category: "খেলা", keywords: ["ক্রিকেট", "ফুটবল", "খেলা", "টাইগার", "ম্যাচ", "সিরিজ", "টুর্নামেন্ট", "অলিম্পিক", "বিপিএল", "উইকেট", "গোল"] },
    { category: "আন্তর্জাতিক", keywords: ["যুক্তরাষ্ট্র", "ভারত", "চীন", "রাশিয়া", "ইউক্রেন", "গাজা", "ইসরায়েল", "ফিলিস্তিন", "জাতিসংঘ", "আন্তর্জাতিক", "বিশ্ব", "পাকিস্তান", "ইরান", "যুক্তরাজ্য", "মিয়ানমার"] },
    { category: "অর্থনীতি", keywords: ["অর্থনীতি", "রপ্তানি", "রেমিট্যান্স", "ব্যাংক", "শেয়ারবাজার", "মূল্যস্ফীতি", "বাজেট", "ডলার", "বিনিয়োগ", "রিজার্ভ", "পুঁজিবাজার", "টাকা"] },
    { category: "রাজনীতি", keywords: ["নির্বাচন", "রাজনীতি", "বিএনপি", "আওয়ামী", "জামায়াত", "সংসদ", "মন্ত্রণালয়", "উপদেষ্টা", "সরকার", "ভোট", "মনোনয়ন"] },
    { category: "প্রযুক্তি", keywords: ["প্রযুক্তি", "ইন্টারনেট", "স্মার্টফোন", "এআই", "কৃত্রিম বুদ্ধিমত্তা", "সাইবার", "অ্যাপ", "গুগল", "ফেসবুক", "সফটওয়্যার", "স্টার্টআপ"] },
    { category: "বিনোদন", keywords: ["সিনেমা", "নাটক", "চলচ্চিত্র", "অভিনেতা", "অভিনেত্রী", "গান", "শিল্পী", "বিনোদন", "ওটিটি", "তারকা", "কনসার্ট"] },
    { category: "স্বাস্থ্য", keywords: ["স্বাস্থ্য", "হাসপাতাল", "ডেঙ্গু", "চিকিৎসা", "রোগ", "টিকা", "ভাইরাস", "ওষুধ", "ডাক্তার", "করোনা"] },
    { category: "সারাদেশ", keywords: ["জেলা", "থানা", "উপজেলা", "উপপ্রতিনিধি", "প্রতিনিধি", "গ্রাম", "মেডিসিন", "দুর্ঘটনা", "সারাদেশ"] },
    { category: "শিক্ষা", keywords: ["শিক্ষা", "বিশ্ববিদ্যালয়", "পরীক্ষা", "এসএসসি", "এইচএসসি", "ছাত্র", "শিক্ষার্থী", "শিক্ষক", "কলেজ", "স্কুল", "বুয়েট", "ঢাবি"] },
    { category: "চাকরি", keywords: ["চাকরি", "নিয়োগ", "বিসিএস", "নিয়োগ", "চাকরীর", "আবেদন", "পদ", "বেতন"] },
    { category: "প্রবাস", keywords: ["প্রবাস", "প্রবাসী", "রেমিট্যান্স", "মালয়েশিয়া", "সৌদি", "দুবাই", "কাতার", "ওমান", "মধ্যপ্রাচ্য"] },
    { category: "ধর্ম", keywords: ["ধর্ম", "ইসলাম", "হজ", "ওমরাহ", "নামাজ", "রোজা", "মসজিদ", "মক্কা", "মদিনা", "কুরআন", "হাদিস"] }
  ];

  var BN = { 0: "০", 1: "১", 2: "২", 3: "৩", 4: "৪", 5: "৫", 6: "৬", 7: "৭", 8: "৮", 9: "৯" };

  function bn(n) { return String(n).replace(/[0-9]/g, function (d) { return BN[d]; }); }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* বাক্য বিভাজন — lookbehind ছাড়া (পুরনো Safari/WebKit-এ SyntaxError এড়াতে) */
  function splitSentences(plain) {
    if (!plain) return [];
    var parts = [], re = /([^।!?]+[।!?]+)\s*/g, m, last = 0;
    while ((m = re.exec(plain)) && parts.length < 80) {
      var s = m[1].trim();
      if (s.length > 1) parts.push(s);
      last = re.lastIndex;
    }
    var rest = plain.slice(last).trim();
    if (rest.length > 1) parts.push(rest);
    return parts;
  }

  function hashId(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
    return Math.abs(h).toString(36);
  }

  function categorize(text) {
    var best = "জাতীয়", score = 0;
    CATEGORY_KEYWORDS.forEach(function (grp) {
      var s = 0;
      grp.keywords.forEach(function (kw) { if (text.indexOf(kw) !== -1) s++; });
      if (s > score) { score = s; best = grp.category; }
    });
    return best;
  }

  function extractTags(text) {
    var tags = [];
    CATEGORY_KEYWORDS.forEach(function (grp) {
      grp.keywords.forEach(function (kw) {
        if (tags.length < 5 && text.indexOf(kw) !== -1 && tags.indexOf(kw) === -1) tags.push(kw);
      });
    });
    return tags;
  }

  function catMeta(name) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].name === name) return CATEGORIES[i];
    return CATEGORIES[0];
  }

  /* ══ P1-11 ফিক্স: সব তারিখ/সময় বাধ্যতামূলকভাবে ঢাকার সময়ে ═════════════
     আগে Intl.DateTimeFormat("bn-BD") ব্রাউজারের *লোকাল* টাইমজোন ব্যবহার করত।
     পাঠকের ডিভাইস ভিন্ন টাইমজোনে (বা ভুল সেট) থাকলে "ভবিষ্যতের তারিখ" বা
     ভুল "কতক্ষণ আগে" দেখাত। এখন দর্শক যেখানেই থাকুন, সময় সবসময়
     Asia/Dhaka অনুযায়ী — অর্থাৎ বাংলা সংবাদপত্রের ডেটলাইন ঐতিহ্য মানা হয়।
     সংবাদ-পাতার <time datetime="…"> সর্বদা ISO-8601 (টাইমজোন সহ) থাকে,
     যা গুগল পড়ে। */
  var TZ_DHAKA = "Asia/Dhaka";

  function dhakaDate(ts, opts) {
    var o = Object.assign({ timeZone: TZ_DHAKA }, opts || {});
    try {
      return new Intl.DateTimeFormat("bn-BD", o).format(new Date(ts));
    } catch (e) {
      /* পুরনো ব্রাউজারে timeZone অপশন না থাকলে গ্রেসফুল ডিগ্রেডেশন */
      delete o.timeZone;
      return new Intl.DateTimeFormat("bn-BD", o).format(new Date(ts));
    }
  }

  /* ঢাকার "এখন" — ডিভাইসের ঘড়ির টাইমজোন নির্বিশেষে সঠিক */
  function dhakaNowParts(d) {
    var src = d || new Date();
    try {
      var f = new Intl.DateTimeFormat("en-GB", {
        timeZone: TZ_DHAKA, hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false, weekday: "long", day: "numeric", month: "long", year: "numeric"
      });
      var parts = {};
      f.formatToParts(src).forEach(function (p) { parts[p.type] = p.value; });
      return parts;
    } catch (e) {
      return {
        hour: String(src.getHours()).padStart(2, "0"),
        minute: String(src.getMinutes()).padStart(2, "0"),
        second: String(src.getSeconds()).padStart(2, "0"),
        weekday: "", day: String(src.getDate()), month: "", year: String(src.getFullYear())
      };
    }
  }

  function timeAgo(ts, now) {
    var s = Math.max(1, Math.floor(((now || Date.now()) - ts) / 1000));
    if (s < 60) return bn(s) + " সেকেন্ড আগে";
    var m = Math.floor(s / 60);
    if (m < 60) return bn(m) + " মিনিট আগে";
    var h = Math.floor(m / 60);
    if (h < 24) return bn(h) + " ঘণ্টা আগে";
    var d = Math.floor(h / 24);
    if (d < 30) return bn(d) + " দিন আগে";
    return dhakaDate(ts, { day: "numeric", month: "long", year: "numeric" });
  }

  /* ══ P0-2 / P2-3 ফিক্স: ছবির পাথ স্বাভাবিকীকরণ — কখনো relative নয় ════
     ক্রম (অডিট স্পেসিফিকেশন অনুযায়ী):
       ১) অলরেডি absolute http(s)  → অপরিবর্তিত
       ২) legacy "/img/<file>"     → "/images/<file>"  (Oracle-নির্ভরতা কমানো;
                                      ফাইল রেপোতে থাকলে Netlify নিজেই দেয়)
       ৩) "images/<file>"          → "/images/<file>"  (leading slash যোগ)
       ৪) ফাঁকা / অজানা             → null
     ফল: /news/<slug> বা /category/<cat> পাতায়ও ছবি কখনো /category/images/…
     হয়ে ভাঙে না — এটাই ছিল একই fallback ছবি বারবার আসার মূল কারণ। */
  function normalizeImage(src) {
    if (!src) return null;
    var raw = String(src).trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    var rel = raw.replace(/^\.?\//, "");
    if (rel.indexOf("img/") === 0) rel = "images/" + rel.slice(4);
    return "/" + rel;
  }

  /* ══ থাম্বনেইল মনোটনি সমাধান: প্রতি সংবাদের জন্য ইউনিক কভার ═══════════
     ৪৮৩/৪৯৪ সংবাদে ছবি ফিল্ডই ফাঁকা। তাই সবাই একই বিভাগ-ডিফল্ট ছবি
     (national.jpg / economy.jpg …) দেখাচ্ছিল — দৃশ্যত অভিন্ন পোস্ট।

     এখন ছবি না থাকলে প্রতিটি সংবাদের *শিরোনাম থেকে নির্ধারিত* একটি
     টাইপোগ্রাফিক কভার (inline SVG data-URI) ব্যবহার হয়। বৈশিষ্ট্য:
       • সংবাদের নিজের শিরোনাম ও বিভাগ দেখায় → প্রতিটি আলাদা
       • রঙ বিভাগ অনুযায়ী (hue) → বিভাগীয় পরিচয় অটুট
       • শূন্য নেটওয়ার্ক রিকোয়েস্ট → কখনো ৫০২/৪০৪ হয় না
       • hashId(title) দিয়ে নির্ধারিত → একই সংবাদে সর্বদা একই কভার
     এটি হিরো ইমেজ হিসেবেও ব্যবহারযোগ্য (ডিফল্ট ফটো নয়)। */
  function coverHue(category) {
    var m = catMeta(category);
    return (m && typeof m.hue === "number") ? m.hue : 210;
  }

  function coverSvg(title, category) {
    var h = coverHue(category);
    var t = String(title || "").replace(/\s+/g, " ").trim();
    /* শিরোনাম ৩ লাইনে ভাগ — বাংলা যুক্তাক্ষর মোটামুটি ঠিক রাখতে শব্দ-ভিত্তিক */
    var words = t.split(" ");
    var lines = [], cur = "";
    for (var i = 0; i < words.length && lines.length < 3; i++) {
      var cand = cur ? cur + " " + words[i] : words[i];
      if (cand.length > 26 && cur) { lines.push(cur); cur = words[i]; }
      else cur = cand;
    }
    if (cur && lines.length < 3) lines.push(cur);
    if (!lines.length) lines = ["বাংলা নিউজ এডিশন"];
    if (lines.length === 3 && words.join(" ").length > lines.join(" ").length + 2) {
      lines[2] = lines[2].replace(/\s+\S*$/, "") + "…";
    }

    function esc2(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    var bg1 = "hsl(" + h + ",62%,16%)";
    var bg2 = "hsl(" + h + ",72%,9%)";
    var accent = "hsl(" + h + ",88%,58%)";

    var tspans = lines.map(function (ln, idx) {
      return '<tspan x="60" dy="' + (idx === 0 ? 0 : 62) + '">' + esc2(ln) + "</tspan>";
    }).join("");

    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="1200" height="675">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + bg1 + '"/><stop offset="1" stop-color="' + bg2 + '"/>' +
      "</linearGradient></defs>" +
      '<rect width="1200" height="675" fill="url(#g)"/>' +
      '<rect x="0" y="0" width="1200" height="8" fill="' + accent + '"/>' +
      '<rect x="60" y="60" width="8" height="72" rx="4" fill="' + accent + '"/>' +
      '<text x="90" y="96" font-family="sans-serif" font-size="26" font-weight="700" fill="' + accent + '">BNE</text>' +
      '<text x="90" y="126" font-family="sans-serif" font-size="20" fill="#c7d2e0">' + esc2(category || "সংবাদ") + "</text>" +
      '<text x="60" y="250" font-family="sans-serif" font-size="52" font-weight="700" fill="#ffffff">' +
      tspans + "</text>" +
      '<text x="60" y="620" font-family="sans-serif" font-size="24" fill="#9fb0c9">বাংলা নিউজ এডিশন · bangla-news-edition-bd.netlify.app</text>' +
      "</svg>";

    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /* একটি সংবাদের ছবি — না থাকলে ইউনিক কভার (কখনোই ভাগ করা ডিফল্ট ফটো নয়) */
  function articleImage(a) {
    if (!a) return coverSvg("বাংলা নিউজ এডিশন", "সংবাদ");
    var norm = normalizeImage(a.image);
    if (norm) return norm;
    return coverSvg(a.title, a.category);
  }

  /* P6: ব্রেকিং-স্কোর — recency × reach × velocity (ব্যাখ্যাযোগ্য) */
  var SOURCE_WEIGHTS = {
    banglaedition: 3, prothomalo: 3, jugantor: 2, ittefaq: 2, bdnews24: 2,
    somoynews: 2, banglatribune: 1, bdjournal: 1, dailybangladesh: 1, editor: 5
  };
  function breakingScore(a, now) {
    if (!a || !a.ts) return 0;
    var ageMin = ((now || Date.now()) - a.ts) / 60000;
    var recency = Math.max(0, 1 - ageMin / 720);
    var reach = SOURCE_WEIGHTS[a.source] || 1;
    var velocity = ageMin < 30 ? 1.4 : ageMin < 90 ? 1.2 : ageMin < 180 ? 1.05 : 1;
    return Math.round(recency * reach * velocity * 100) / 100;
  }

  /* ══════════════════════════════════════════════════════════════════════
     ডাবল-এস্কেপ করা সংবাদ-লেখা ঠিক করা (লাইভ সাইটে প্রমাণিত বাগ)
     ──────────────────────────────────────────────────────────────────────
     বাস্তব সমস্যা: Oracle-এর RSS সংগ্রহ ইঞ্জিন কিছু সংবাদ দুইবার HTML-এস্কেপ
     করে ডেটাবেজে রাখে। ফলে সাইটে ও প্রিভিউ কার্ডে খবরের বদলে কোড-লেখা দেখা
     যেত — যেমন:  &amp;lt;a href=&quot;https://…&quot;&amp;gt;খবরের শিরোনাম
     এটি পাঠকের কাছে "ভাঙা সাইট" মনে হয় এবং ফেসবুকের প্রিভিউও অর্থহীন হয়ে যায়।

     সমাধান: সীমিত (সর্বোচ্চ ৩) ধাপে এনটিটি ডিকোড করা হয়। অপরিচিত এনটিটি
     হুবহু অপরিবর্তিত থাকে, তাই ক্ষতি হয় না — আর পরিচিত টেক্সটে কোনো এনটিটি
     না থাকলে এই ফাংশন স্ট্রিংটি যেমন আছে তেমনই ফেরত দেয়।

     কেন `innerHTML` নয়: এটি কেবল এক ধাপ ডিকোড করে, তাই দ্বিগুণ-এস্কেপ করা
     লেখা থেকে যায়। তাই নিজস্ব, নিয়ন্ত্রিত ডিকোডার ব্যবহার করা হলো।
     ══════════════════════════════════════════════════════════════════════ */
  var NAMED_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    rsquo: "\u2019", lsquo: "\u2018", ldquo: "\u201c", rdquo: "\u201d",
    hellip: "\u2026", mdash: "\u2014", ndash: "\u2013", middot: "\u00b7",
    laquo: "\u00ab", raquo: "\u00bb", deg: "\u00b0", times: "\u00d7"
  };

  function decodeOnce(str) {
    return String(str).replace(
      /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
      function (whole, ent) {
        if (ent.charAt(0) === "#") {
          var cp = (ent.charAt(1) === "x" || ent.charAt(1) === "X")
            ? parseInt(ent.slice(2), 16)
            : parseInt(ent.slice(1), 10);
          if (isFinite(cp) && cp > 0 && cp <= 0x10ffff) {
            try { return String.fromCodePoint(cp); } catch (e) { return whole; }
          }
          return whole;
        }
        var key = ent.toLowerCase();
        return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key)
          ? NAMED_ENTITIES[key] : whole;
      }
    );
  }

  function decodeEntities(str, passes) {
    var out = String(str == null ? "" : str);
    var limit = typeof passes === "number" ? passes : 3;
    for (var i = 0; i < limit; i++) {
      var next = decodeOnce(out);
      if (next === out) break;   /* আর বদলাচ্ছে না — থামো (অতিরিক্ত ডিকোড নয়) */
      out = next;
    }
    return out;
  }

  /* খবরের লেখা → নিরাপদ প্লেইন টেক্সট (ডিকোড → ট্যাগ বাদ → শূন্যস্থান পরিষ্কার) */
  function articlePlainText(html) {
    return decodeEntities(html, 3)
      .replace(/<\s*(script|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return {
    CATEGORIES: CATEGORIES,
    CATEGORY_KEYWORDS: CATEGORY_KEYWORDS,
    bn: bn,
    escapeHtml: escapeHtml,
    decodeEntities: decodeEntities,
    articlePlainText: articlePlainText,
    splitSentences: splitSentences,
    hashId: hashId,
    categorize: categorize,
    extractTags: extractTags,
    catMeta: catMeta,
    timeAgo: timeAgo,
    dhakaDate: dhakaDate,
    dhakaNowParts: dhakaNowParts,
    TZ_DHAKA: TZ_DHAKA,
    normalizeImage: normalizeImage,
    coverSvg: coverSvg,
    coverHue: coverHue,
    articleImage: articleImage,
    SOURCE_WEIGHTS: SOURCE_WEIGHTS,
    breakingScore: breakingScore
  };
});
