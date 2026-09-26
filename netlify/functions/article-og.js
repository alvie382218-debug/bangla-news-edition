'use strict';
/**
 * BNE — /news/<slug> এর জন্য সার্ভার-রেন্ডার করা HTML + সঠিক OG ট্যাগ
 * ════════════════════════════════════════════════════════════════════
 * সমস্যা যা এটি সমাধান করে (লাইভ সাইটে প্রমাণিত):
 *   ফেসবুকের ক্রলার /news/<slug> চাইলে আগে অভিন্ন index.html পেত —
 *   তাই og:title ছিল সাইটের নাম, og:image ছিল হোমপেজের কভার।
 *   কারণ: সাইটটি SPA, আর ফেসবুক জাভাস্ক্রিপ্ট চালায় না।
 *
 * এখন: এই ফাংশনটি প্রথম বাইটেই খবরের নিজের ট্যাগসহ সম্পূর্ণ HTML দেয়।
 * Oracle সার্ভার (Phase B) চালু হলে এই ফাংশন ঐচ্ছিক হয়ে যাবে — কিন্তু
 * Netlify-তে আজই SMO ফিক্স চালু করতে এটিই পথ।
 * ════════════════════════════════════════════════════════════════════
 */

const OG = require('./_og-lib');

/* বান্ডল করা ডেটা (tools/sync-function-data.js দিয়ে তৈরি) */
let BUNDLED = null;
try { BUNDLED = require('./_data.json'); } catch (e) { BUNDLED = null; }

const REMOTE_FALLBACK = 'https://raw.githubusercontent.com/oumaboy93-alt/bangla-news-edition/main/data/bne-config.json';
const CACHE_TTL_MS = 5 * 60 * 1000;
let remoteCache = { at: 0, data: null };

const CRAWLER_RE = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|LinkedInBot|Slackbot|Discordbot|Pinterest|Googlebot|bingbot|YandexBot|Applebot/i;

function originOf(event) {
  const h = event.headers || {};
  const proto = h['x-forwarded-proto'] || 'https';
  /* হেডার না থাকলে এটিই ফলব্যাক — tools/set-site-origin.js হোস্ট বদলালে
     এই মানটিও হালনাগাদ করে (নিচের ডিফল্টটিই একমাত্র সত্য)। */
  const host = h['x-forwarded-host'] || h.host || 'bangla-news-edition-bd.netlify.app';
  return `${proto}://${host}`;
}

/** slug বা id দুইভাবেই খোঁজা হয় — পুরনো শেয়ার করা লিংকও কাজ করবে। */
function findArticle(data, key) {
  const list = (data && data.editorNews) || [];
  const k = String(key || '').trim().toLowerCase();
  return (
    list.find((a) => String(a.slug || '').toLowerCase() === k) ||
    list.find((a) => String(a.id || '').toLowerCase() === k) ||
    null
  );
}

async function loadData() {
  if (BUNDLED && (BUNDLED.editorNews || []).length) return BUNDLED;
  if (remoteCache.data && Date.now() - remoteCache.at < CACHE_TTL_MS) return remoteCache.data;
  try {
    const res = await fetch(REMOTE_FALLBACK, { headers: { 'User-Agent': 'BNE-OG/1.0' } });
    if (res.ok) {
      const data = await res.json();
      remoteCache = { at: Date.now(), data };
      return data;
    }
  } catch (e) { /* নেটওয়ার্ক ব্যর্থ হলে বান্ডল করা ডেটাই ভরসা */ }
  return BUNDLED || { editorNews: [] };
}

/* ── Analytics ও বিজ্ঞাপনের ট্যাগ (সংবাদ পাতার জন্য) ──────────────────
   লাইভ সাইটের CDN-পরিবেশিত পাতাগুলোয় (হোম, বিভাগ, ডেস্ক) Netlify-র
   snippet injection দিয়ে GA4 ও AdSense বসানো আছে। কিন্তু সংবাদ পাতাগুলো
   এই ফাংশন থেকে আসে — স্নিপেট injection ফাংশনের উত্তরে খাটে না।
   তাই সংবাদ পাতার পরিমাপ ও বিজ্ঞাপন নিশ্চিত করতে এখানেই ট্যাগ বসানো হচ্ছে।
   আইডি দুটি সর্বজনীন (পাতার source-এই থাকে), তাই কঠিনভাবে বসানো নিরাপদ;
   চাইলে env দিয়ে বদলানো যাবে: BNE_GA4_ID · BNE_ADSENSE_CLIENT
   ─────────────────────────────────────────────────────────────────── */
const GA4_ID = process.env.BNE_GA4_ID || 'G-3X2CF2KWH';
const ADSENSE_CLIENT = process.env.BNE_ADSENSE_CLIENT || 'ca-pub-8292591084993652';

function analyticsTags() {
  const out = [];
  if (/^G-[A-Z0-9]{6,14}$/.test(GA4_ID)) {
    /* P1-6: Consent Mode v2 ডিফল্ট — বিজ্ঞাপন-স্টোরেজ denied, সম্মতি ছাড়া
       কোনো অ্যাড-কুকি বা পার্সোনালাইজেশন নয়। অ্যানালিটিক্স granted। */
    out.push(`<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'granted',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});</script>`);
    out.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>
<script>gtag('js',new Date());gtag('config','${GA4_ID}',{anonymize_ip:true});</script>`);
  }
  if (/^ca-pub-[0-9]{8,20}$/.test(ADSENSE_CLIENT)) {
    out.push(`<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>`);
  }
  return out.join('\n');
}

function shell(bodyHtml, headTags) {
  /* ⚠️ P0-1 সতর্কতা: এখানে /style.css ও /ssr.css অবশ্যই absolute পাথে থাকবে।
     আগে /ssr.css ফাইলটাই রেপোতে ছিল না → ৪০৪ → সংবাদ পাতায় কোনো SSR
     স্টাইলই আসত না। ফাইলটি এখন যোগ করা হয়েছে (ssr.css)।
     ⚠️ script src="/app.js" — এটিও absolute; relative হলে /news/<slug>
     পাতায় /news/app.js খোঁজা হত → ৪০৪ → SPA হাইড্রেশনই চলত না। */
  return `<!doctype html>
<html lang="bn" class="force-dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${headTags}
${analyticsTags()}
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='%23c00000'/><text x='50' y='64' font-size='42' font-weight='bold' fill='white' text-anchor='middle' font-family='sans-serif'>BNE</text></svg>" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="stylesheet" href="/style.css" />
<link rel="stylesheet" href="/ssr.css" />
</head>
<body class="ssr-body">
<header class="ssr-header">
  <a class="ssr-brand" href="/">বাংলা নিউজ এডিশন</a>
  <nav class="ssr-nav" aria-label="বিভাগসমূহ">
    <a href="/category/${encodeURIComponent('জাতীয়')}">জাতীয়</a>
    <a href="/category/${encodeURIComponent('রাজনীতি')}">রাজনীতি</a>
    <a href="/category/${encodeURIComponent('আন্তর্জাতিক')}">আন্তর্জাতিক</a>
    <a href="/category/${encodeURIComponent('অর্থনীতি')}">অর্থনীতি</a>
    <a href="/category/${encodeURIComponent('খেলা')}">খেলা</a>
    <a href="/desk/probashi-bangla-news">প্রবাস বাংলা নিউজ</a>
  </nav>
</header>
${bodyHtml}
<footer class="ssr-footer">
  <p>© ${new Date().getFullYear()} বাংলা নিউজ এডিশন (BNE) — সত্য ও বস্তুনিষ্ঠ খবরের বিশ্বস্ত ঠিকানা</p>
  <p><a href="/about-us">আমাদের সম্পর্কে</a> · <a href="/privacy-policy">গোপনীয়তা নীতি</a> · <a href="/contact-us">যোগাযোগ</a></p>
</footer>
<script src="/core.js"></script>
<script src="/site-config.js"></script>
<script src="/app.js" defer></script>
</body>
</html>`;
}

function renderNotFound(origin) {
  return {
    statusCode: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, follow',
    },
    body: `<!doctype html><html lang="bn"><head><meta charset="utf-8" />
<meta name="robots" content="noindex, follow" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>সংবাদ পাওয়া যায়নি — বাংলা নিউজ এডিশন</title>
<link rel="stylesheet" href="/ssr.css" /></head>
<body class="ssr-body"><main class="ssr-main" id="app">
<h1 class="ssr-title">সংবাদটি পাওয়া যায়নি</h1>
<p>আপনি যে সংবাদটি খুঁজছেন সেটি সরানো হয়েছে অথবা লিংকটি ভুল।</p>
<p><a href="${OG.esc(origin)}/">← হোমপেজে ফিরে যান</a></p>
</main></body></html>`,
  };
}

exports.handler = async (event) => {
  const origin = originOf(event);
  const path = event.path || '';

  const m = path.match(/\/news\/(.+?)\/?$/);
  if (!m) return renderNotFound(origin);

  let key;
  try { key = decodeURIComponent(m[1]); } catch (e) { key = m[1]; }

  const data = await loadData();
  const article = findArticle(data, key);
  if (!article) return renderNotFound(origin);

  /* slug না থাকলে id-ই canonical slug (পুরনো শেয়ার করা লিংক অটুট থাকে) */
  const slug = article.slug || article.id;
  const ogSlugs = new Set(
    (data.ogSlugs || (BUNDLED && BUNDLED.ogSlugs) || []).map((s) => String(s))
  );

  const head = OG.buildArticleHead({ ...article, slug }, {
    origin,
    ogSlugs,
    siteCover: '/images/bne-og-cover.jpg',
    fbAppId: (data.settings && data.settings.fbAppId) || '',
  });

  const img = head.image;
  /* ★ ডিকোড → ট্যাগ বাদ → প্লেইন টেক্সট ★
     আগে কাঁচা body সরাসরি OG.esc() করা হত। Oracle-এর সংগ্রহ ইঞ্জিন কিছু
     সংবাদ দুইবার HTML-এস্কেপ করে রাখে, তাই পাতায় খবরের বদলে
     `&lt;a href=&quot;…` জাতীয় কোড-লেখা দেখা যেত।

     ⚠️ শুধু ডিকোড করেই আবার esc() করলে লাভ হয় না — তখন ব্রাউজার ডিকোড হওয়া
     HTML-ট্যাগগুলোকে আক্ষরিক লেখা হিসেবে দেখায়, অর্থাৎ খবরের বদলে আবারও
     কোড-লেখা। তাই এখানে OG.stripTags() ব্যবহার করা হয়: সে প্রথমে সীমিত
     (৩) ধাপে এনটিটি ডিকোড করে, তারপর সব ট্যাগ সরিয়ে প্রকৃত লেখা রাখে।

     তারপর নিচে OG.esc() করা হয় — অর্থাৎ আউটপুট সবসময় নিরাপদ প্লেইন টেক্সট,
     কোনো HTML ইনজেকশনের সুযোগ নেই। */
  const paras = String(article.body || article.summary || '')
    .split(/\n{2,}|\r\n{2,}/)
    .map((p) => OG.stripTags(p))
    .filter(Boolean);

  const bodyHtml = `
<main class="ssr-main" id="app">
  <nav class="ssr-crumb"><a href="/">হোম</a> › <a href="/category/${encodeURIComponent(article.category || '')}">${OG.esc(article.category || 'সংবাদ')}</a></nav>
  <h1 class="ssr-title">${OG.esc(article.title)}</h1>
  <div class="ssr-meta">
    <span class="ssr-badge">${OG.esc(article.category || 'সংবাদ')}</span>
    <time datetime="${OG.esc(OG.isoDate(article.publishedAt || article.published_at))}">${OG.esc(
      new Intl.DateTimeFormat('bn-BD', { dateStyle: 'long', timeZone: 'Asia/Dhaka' })
        .format(new Date(article.publishedAt || article.published_at || Date.now()))
    )}</time>
  </div>
  ${img ? `<figure class="ssr-hero"><img src="${OG.esc(img)}" alt="${OG.esc(OG.truncate(article.title, 120))}" width="${head.imageDims ? head.imageDims.w : 1024}" height="${head.imageDims ? head.imageDims.h : 571}" /></figure>` : ''}
  <div class="ssr-content">${paras.map((p) => `<p>${OG.esc(p)}</p>`).join('\n')}</div>
  <div class="share-bar">
    <a class="share-btn fb" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(head.canonical)}">ফেসবুকে শেয়ার</a>
    <a class="share-btn wa" href="https://wa.me/?text=${encodeURIComponent(article.title + ' ' + head.canonical)}">হোয়াটসঅ্যাপ</a>
    <a class="share-btn tg" href="https://t.me/share/url?url=${encodeURIComponent(head.canonical)}">টেলিগ্রাম</a>
  </div>
</main>`;

  const isCrawler = CRAWLER_RE.test(String((event.headers || {})['user-agent'] || ''));

  /* ★ P1-10 ফিক্স: হেডার আর দুইবার পাঠানো হয় না ★
     আগে এখানে X-Content-Type-Options: nosniff এবং netlify.toml-এও সেটি
     ছিল — ফলে লাইভ রেসপন্সে হেডারটি দুইবার আসত (ডুপ্লিকেট)। এখন সব
     নিরাপত্তা হেডার এক জায়গা থেকেই আসে: netlify.toml [[headers]]।
     ফাংশন কেবল নিজের প্রয়োজনের হেডার দেয়। */
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      /* ক্রলারকে কখনো ক্যাশ করা (পুরনো) HTML দেব না */
      'Cache-Control': isCrawler ? 'no-store' : 'public, max-age=60, stale-while-revalidate=300',
      'X-SSR': isCrawler ? 'crawler' : 'public',
      'Vary': 'User-Agent',
    },
    body: shell(bodyHtml, head.tags),
  };
};
