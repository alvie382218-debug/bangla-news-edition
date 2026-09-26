/**
 * BNE — Shared Feed Engine (Netlify Functions-এর জন্য)
 * ৯টি বাংলা RSS সূত্র সার্ভার-সাইড থেকে ফেচ + নরমালাইজ (P2 ইনজেশন)
 * app.js-এর SOURCES/hashId-এর সাথে সামঞ্জস্যপূর্ণ।
 */

const SOURCES = {
  banglaedition: { label: "বাংলা এডিশন", rss: "https://www.banglaedition.com/feed/" },
  prothomalo: { label: "প্রথম আলো", rss: "https://www.prothomalo.com/feed/" },
  jugantor: { label: "যুগান্তর", rss: "https://www.jugantor.com/feed/" },
  ittefaq: { label: "ইত্তেফাক", rss: "https://www.ittefaq.com.bd/feed/" },
  bdnews24: { label: "বিডিনিউজ২৪", rss: "https://bangla.bdnews24.com/?feed=rss2" },
  somoynews: { label: "সময় নিউজ", rss: "https://somoynews.tv/feed/" },
  banglatribune: { label: "বাংলা ট্রিবিউন", rss: "https://www.banglatribune.com/feed/" },
  bdjournal: { label: "বাংলাদেশ জার্নাল", rss: "https://bd-journal.com/feed/latest-rss.xml" },
  dailybangladesh: { label: "ডেইলি বাংলাদেশ", rss: "https://daily-bangladesh.com/rss/rss.xml" }
};

/* ══ P2 ফিড-নির্ভরযোগ্যতা ফিক্স ═══════════════════════════════════════════
   সমস্যা (লাইভ পরীক্ষিত): ৯টি সূত্রের ৭টি Netlify-র সার্ভার থেকে ব্যর্থ হচ্ছিল —
     ব্যর্থ: banglaedition, jugantor, ittefaq, somoynews, bdjournal  | খালি: bdnews24
     সফল: prothomalo, banglatribune

   কারণ (অনুমেয় ও যাচাইযোগ্য): বেশিরভাগ বাংলাদেশি সংবাদ সাইট Cloudflare বা
   অনুরূপ WAF ব্যবহার করে, যা ডেটাসেন্টার-IP থেকে আসা "সংক্ষিপ্ত" বট
   User-Agent ব্লক করে দেয়। তাই কেবল UA বদলে লাভ হয় না।

   সমাধান — তিন স্তরের ফলব্যাক চেইন (প্রতি সূত্রের জন্য):
     ১) মূল RSS, সম্পূর্ণ ব্রাউজার-সদৃশ হেডার সহ (UA + Accept + Accept-Language + Referer)
     ২) Google News RSS  — নির্ভরযোগ্য, কখনো ডেটাসেন্টার-IP ব্লক করে না:
          https://news.google.com/rss/search?q=site:<domain>&hl=bn&gl=BD&ceid=BD:bn
     ফল: কোনো সূত্র সম্পূর্ণ হারিয়ে যায় না — ব্লক হলেও Google News হয়ে খবর আসে।
   ═══════════════════════════════════════════════════════════════════════ */
const FEED_TIMEOUT_MS = 6000; /* Netlify ফাংশন সীমা (~১০s) — প্যারালাল ফেচে মোট সময় ≤ সর্বোচ্চ একক সূত্র */

/* Realistic browser headers — WAF-friendly */
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.7",
  "Accept-Language": "bn-BD,bn;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache"
};

/* মূল ডোমেইন — Google News site: কুয়েরির জন্য */
const SOURCE_DOMAINS = {
  banglaedition: "banglaedition.com",
  prothomalo: "prothomalo.com",
  jugantor: "jugantor.com",
  ittefaq: "ittefaq.com.bd",
  bdnews24: "bdnews24.com",
  somoynews: "somoynews.tv",
  banglatribune: "banglatribune.com",
  bdjournal: "bd-journal.com",
  dailybangladesh: "daily-bangladesh.com"
};

/** Google News RSS — WAF-নিরপেক্ষ ফলব্যাক সূত্র */
function googleNewsUrl(key) {
  const dom = SOURCE_DOMAINS[key] || "";
  if (!dom) return "";
  return "https://news.google.com/rss/search?q=" + encodeURIComponent("site:" + dom) +
    "&hl=bn&gl=BD&ceid=BD:bn";
}
const MAX_ITEMS_PER_SOURCE = 12;

function hashId(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}

function stripTags(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "") /* CDATA-র্যাপার সরাও */
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImageFromXml(xml, fallback) {
  const m = String(xml || "").match(/<media:content[^>]*url=["']([^"']+)["']/i) ||
            String(xml || "").match(/<enclosure[^>]*url=["']([^"']+)["']/i) ||
            String(xml || "").match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m) return m[1];
  if (fallback && /^https?:/.test(fallback)) return fallback;
  return null;
}

/* বিশ্বস্ত টাইমআউট: fetch + AbortController — DNS/কানেক্ট/বডি সব ফেজ কভার করে */
async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FEED_TIMEOUT_MS);
  try {
    const headers = Object.assign({}, BROWSER_HEADERS);
    try { headers["Referer"] = new URL(url).origin + "/"; } catch (e) { /* ignore */ }
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
  } catch (e) {
    if (e.name === "AbortError") throw new Error("টাইমআউট");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* সার্ভার-সাইড: CORS নেই বলে সরাসরি XML ফেচই যথেষ্ট (rss2json রাউন্ড-ট্রিপ বাদ — দ্রুত ও নির্ভরশীল) */
async function fetchSource(key) {
  const src = SOURCES[key];

  /* ── তিন-স্তরের ফলব্যাক: মূল RSS → Google News RSS → ব্যর্থ ── */
  const attempts = [ { url: src.rss, via: "direct" } ];
  const gnews = googleNewsUrl(key);
  if (gnews) attempts.push({ url: gnews, via: "google-news" });

  let xml = null, usedVia = null, lastErr = null;
  for (const att of attempts) {
    try {
      const text = await fetchText(att.url);
      /* অন্তত একটি <item>/<entry> থাকলেই গ্রহণযোগ্য */
      if (text && /<(?:item|entry)[\s>]/i.test(text)) {
        xml = text; usedVia = att.via; break;
      }
      lastErr = new Error("ফিডে কোনো আইটেম নেই");
    } catch (e) {
      lastErr = e;
    }
  }
  if (!xml) throw new Error("ফেচ ব্যর্থ (" + (lastErr && lastErr.message || "অজানা") + "): " + src.label);

  /* সরল XML → আইটেম (DOMParser নেই; regex-ভিত্তিক হালকা পার্স) */
  const items = [];
  const itemRe = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let m;
  while ((m = itemRe.exec(xml)) && items.length < MAX_ITEMS_PER_SOURCE) {
    const block = m[1];
    const title = stripTags((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const linkRaw = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || "";
    const link = String(linkRaw).trim() || ((block.match(/<link[^>]*href=["']([^"']+)["']/i) || [])[1] || "");
    if (!title || link.indexOf("http") !== 0) continue;
    const desc = stripTags((block.match(/<(?:description|content:encoded|summary)[^>]*>([\s\S]*?)<\/(?:description|content:encoded|summary)>/i) || [])[1] || "");
    const pub = (block.match(/<(?:pubdate|published|updated)[^>]*>([\s\S]*?)<\/(?:pubdate|published|updated)>/i) || [])[1] || "";
    items.push({
      title,
      link,
      summary: desc,
      image: extractImageFromXml(block),
      ts: pub && !isNaN(Date.parse(pub)) ? Date.parse(pub) : Date.now(),
      source: key,
      sourceLabel: src.label,
      via: usedVia
    });
  }
  if (!items.length) throw new Error("খালি ফিড: " + src.label);
  return items;
}

async function fetchAllFeeds() {
  const keys = Object.keys(SOURCES);
  const settled = await Promise.allSettled(keys.map(fetchSource));
  const items = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") items.push(...r.value);
    else errors.push({ source: keys[i], error: String(r.reason && r.reason.message || r.reason) });
  });
  /* একই লিংক ডিডুপ + তারিখ অনুযায়ী সাজানো */
  const seen = new Set();
  const unique = items.filter((it) => {
    if (seen.has(it.link)) return false;
    seen.add(it.link);
    return true;
  }).sort((a, b) => b.ts - a.ts);
  return { items: unique, errors };
}

module.exports = { SOURCES, fetchAllFeeds, fetchSource, hashId };
