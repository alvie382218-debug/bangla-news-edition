'use strict';
/**
 * BNE — /api/editorial   (P1: লাইভ স্তর — রি-ডিপ্লয় ছাড়াই নতুন সংবাদ)
 * ═══════════════════════════════════════════════════════════════════════════
 * কেন এই ফাংশন (ডেভেলপার-নির্দেশনা, ২০২৬-০৯-২৯ — সেকশন ৫)
 * ---------------------------------------------------------------------------
 * সমস্যা: সাইটের নিজের সংবাদ ও বিজ্ঞাপন **বিল্ডের সময় কোডে বেক** হয়ে যায়
 * (tools/sync-function-data.js → netlify/functions/_data.json)। ফলে একটি
 * খবর বা বিজ্ঞাপন বদলাতে গেলেও পুরো সাইট রি-ডিপ্লয় করতে হত — আর ঠিক
 * সেই কারণেই Netlify-র ক্রেডিট শেষ হয়ে সাইট একবার বন্ধ হয়ে গিয়েছিল।
 *
 * সমাধান: অনুরোধের সময় GitHub থেকে `data/editorial-news.json` পড়া।
 *         ফলে সম্পাদকীয় সংবাদ/বিজ্ঞাপন বদলানো = একটি GitHub API কল →
 *         ৬০ সেকেন্ডে সাইটে লাইভ → **০ ডিপ্লয়, ০ ক্রেডিট**।
 *
 * ⚠️ গুরুত্বপূর্ণ পার্থক্য (নির্দেশনার সেকশন ৫):
 *    `config.js` (/api/config) **আগে** বিল্ড-করা `_data.json` পড়ে — এটিই
 *    প্রমাণিত (লাইভ যাচাই: X-BNE-Source: bundled)। এই `editorial.js` তার
 *    **উল্টো**: প্রথমে লাইভ সোর্স, শেষে বিল্ড-ডেটা।
 *
 * পড়ার চেইন (article-og.js-এর রেফারেন্স প্রয়োগ, তবে আরও সম্পূর্ণ):
 *    ১) GitHub Contents API  — টোকেন থাকলে (এনভি: BOT_GITHUB_TOKEN)
 *    ২) GitHub raw            — টোকেন না থাকলেও কাজ করে (পাবলিক রেপো)
 *    ৩) বিল্ড-করা _data.json  — নেটওয়ার্ক একেবারে ব্যর্থ হলে
 *    নেটওয়ার্ক কখনো সাইট ভাঙবে না — তিন স্তরের শেষটি সবসময় উত্তর দেয়।
 *
 * আউটপুট: { version, updatedAt, editorNews[], ads[], source }
 * ক্যাশ:   ৬০s (নির্দেশনা অনুযায়ী) — একই instance-এ ৩০s মেমো
 *
 * নিরাপত্তা: টোকেন কখনো লগ বা রেসপন্সে যায় না; শুধু সোর্স-নাম ('contents'
 *            / 'raw' / 'bundled') জানানো হয় — কী আছে কি নেই, কতটুকু নয়।
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* বিল্ড-বান্ডল ডেটা — শেষ ভরসা। না থাকলেও ফাংশন চলে (খালি তালিকা দেয়)। */
let BUNDLED = null;
try { BUNDLED = require('./_data.json'); } catch (e) { BUNDLED = null; }

const REPO = process.env.BOT_REPO || 'alvie382218-debug/bangla-news-edition';
const BRANCH = process.env.BOT_BRANCH || 'main';
const FILE_PATH = 'data/editorial-news.json';

/* টোকেন — কোনো লগে এর মান কখনো যাবে না (নিয়ম ৩.২) */
const TOKEN = process.env.BOT_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';

const RAW_URL = 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/' + FILE_PATH;
const API_URL = 'https://api.github.com/repos/' + REPO + '/contents/' + FILE_PATH + '?ref=' + BRANCH;

const MEMO_TTL_MS = 30 * 1000;
let memo = { at: 0, payload: null };

/* ── স্তর ১: Contents API (টোকেন থাকলে) ────────────────────────────────
   কেন Components API আগে: ব্যক্তিগত রেপোও কাজ করবে, আর raw-এর ক্যাশ
   (সাধারণত ৫ মিনিট) এড়ানো যায় — অর্থাৎ প্রকাশ সাথে সাথেই ধরা পড়ে। */
async function fromContentsApi() {
  if (!TOKEN) return null;
  const r = await fetch(API_URL, {
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'BNE-Editorial',
      'Cache-Control': 'no-cache',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return null;
  const j = await r.json();
  if (!j || !j.content) return null;
  const txt = Buffer.from(String(j.content).replace(/\n/g, ''), 'base64').toString('utf8');
  return JSON.parse(txt);
}

/* ── স্তর ২: GitHub raw (টোকেন ছাড়াই) ───────────────────────────────── */
async function fromRaw() {
  const r = await fetch(RAW_URL + '?t=' + Date.now(), {
    headers: { 'User-Agent': 'BNE-Editorial', 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return null;
  return r.json();
}

/* ── স্তর ৩: বিল্ড-বান্ডল (নেটওয়ার্ক একেবারে না চললে) ──────────────────
   বান্ডলে সব সংবাদ থাকে; এখানে কেবল `editorial: true` চিহ্নিতগুলো
   ফেরানো হয় — যাতে /api/editorial সবসময় "সম্পাদকীয়" অংশই দেয়। */
function fromBundled() {
  if (!BUNDLED) return null;
  const news = (BUNDLED.editorNews || []).filter((a) => a && a.editorial === true);
  return {
    version: BUNDLED.version || 0,
    updatedAt: BUNDLED.updatedAt || '',
    news,
    ads: BUNDLED.ads || [],
  };
}

/* ── সাধারণ রূপান্তর: `news[]` → `editorNews[]` ─────────────────────── */
function shape(doc, source) {
  const news = (doc && (doc.editorNews || doc.news)) || [];
  return {
    version: (doc && doc.version) || 0,
    updatedAt: (doc && doc.updatedAt) || '',
    editorNews: Array.isArray(news) ? news : [],
    ads: (doc && Array.isArray(doc.ads)) ? doc.ads : [],
    /* সোর্স-নাম জানানো নিরাপদ — কতটুকু পড়া গেল সেটুকুই বোঝায়, কী নেই তা নয় */
    source,
  };
}

exports.handler = async () => {
  /* ══ ডায়াগনস্টিক সুইচ — fail-safe প্রমাণের জন্য ══════════════════════
     P1-এর গেটে দাবি করা হয়েছে: "ফাংশনটি ইচ্ছাকৃতভাবে অকার্যকর করে দেখাও
     যে সাইট আগের মতোই চলে।" সেটি প্রমাণ করার জন্য ডিপ্লয় ছাড়াই একটি
     এনভি ভেরিয়েবল দিয়েই ফাংশনটি ব্যর্থ করা যায় — এতে ফের কোনো ডিপ্লয়
     লাগে না (ক্রেডিট শূন্য), আর সুইচটি ডিফল্টে বন্ধ।

     ⚠️ এটি কোনো নিরাপত্তা-বাইপাস নয় (নিয়ম ৫ শুধু dual-confirm গেটের
        ব্যাপারে) — কেবল ব্যর্থতার অনুকরণ, এবং ডিফল্ট অবস্থায় নিষ্ক্রিয়। */
  if (process.env.BNE_EDITORIAL_FORCE_FAIL === '1') {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: 'forced-failure', message: 'ডায়াগনস্টিক সুইচ চালু (fail-safe পরীক্ষা)' }),
    };
  }

  /* মেমো: একই warm instance-এ ৩০ সেকেন্ডে বারবার GitHub কল নয় */
  if (memo.payload && Date.now() - memo.at < MEMO_TTL_MS) {
    return respond(memo.payload, 'HIT');
  }

  let doc = null;
  let source = 'bundled';

  /* ১) Contents API */
  try {
    doc = await fromContentsApi();
    if (doc) source = 'contents';
  } catch (e) { /* টোকেন নেই / কোট শেষ / নেটওয়ার্ক — পরের স্তরে যাও */ }

  /* ২) raw */
  if (!doc) {
    try {
      doc = await fromRaw();
      if (doc) source = 'raw';
    } catch (e) { /* পরের স্তরে */ }
  }

  /* ৩) বিল্ড-বান্ডল — কখনো ব্যর্থ হয় না */
  if (!doc) {
    doc = fromBundled();
    source = 'bundled';
  }

  const payload = shape(doc, source);
  memo = { at: Date.now(), payload };
  return respond(payload, 'MISS');
};

function respond(payload, cacheState) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      /* ৬০s — নির্দেশনার সেকশন ৫ অনুযায়ী। এতেই পরিবর্তন দ্রুত ছড়ায়,
         আবার প্রতিটি ভিজিটে GitHub কল হয় না (রেট-লিমিট সুরক্ষা)। */
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
      'X-BNE-Source': payload.source,
      'X-BNE-Cache': cacheState,
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(payload),
  };
}
