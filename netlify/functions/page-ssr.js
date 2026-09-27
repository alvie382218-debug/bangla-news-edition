'use strict';
/**
 * BNE — /category/*, /desk/*, /search/* — Server-Side Rendered HTML
 * ═══════════════════════════════════════════════════════════════════════════
 * যে সমস্যাগুলো এটি সমাধান করে (লাইভ সাইটে প্রমাণিত):
 *
 *  P0-1  /category/* সরাসরি স্ট্যাটিক index.html ফেরত দিত। স্ট্যাটিক ফাইলে
 *        style.css ছিল *relative* পাথে → ব্রাউজার /category/style.css চাইত →
 *        Netlify index.html (text/html) ফেরত দিত → MIME mismatch-এ CSS বাতিল
 *        → সম্পূর্ণ আনস্টাইল্ড সাদা পেজ।
 *
 *  P0-7  ওই একই index.html-এ canonical ছিল হোমপেজের ("…/" )। ফলে দুই হাজারের
 *        বেশি ক্যাটাগরি URL নিজেদের হোমপেজের নকল বলে দাবি করত → গুগল সেগুলো
 *        ইনডেক্স থেকে বাদ দিত, অথচ sitemap-এ সেগুলোই সাবমিট হচ্ছিল।
 *
 *  P0-6  ক্যাটাগরি পেজেও কোনো H1 ছিল না এবং ক্রলারকে দেওয়ার মতো রিয়েল-পাথ
 *        লিংক ছিল না।
 *
 * এখন: প্রতিটি রুট নিজের <title>, <meta description>, self-canonical, robots,
 *       ঠিক একটি <h1>, BreadcrumbList + CollectionPage JSON-LD এবং প্রতিটি
 *       সংবাদের জন্য রিয়েল-পাথ <a href="/news/…"> লিংক পায় — প্রথম বাইটেই,
 *       জাভাস্ক্রিপ্ট ছাড়াই।
 *
 * নোট: /search/* ইচ্ছাকৃতভাবে noindex — সার্চ ফলাফল ইনডেক্স করা উচিত নয়।
 *       অজানা ক্যাটাগরি ২০০ নয়, সৎভাবে ৪০৪ ফেরত দেয় (soft-404 বন্ধ)।
 * ═══════════════════════════════════════════════════════════════════════════
 */

const OG = require('./_og-lib');

let BUNDLED = null;
try { BUNDLED = require('./_data.json'); } catch (e) { BUNDLED = null; }

const REMOTE_FALLBACK = 'https://raw.githubusercontent.com/oumaboy93-alt/bangla-news-edition/main/data/bne-config.json';
const CACHE_TTL_MS = 5 * 60 * 1000;
const remoteCache = { at: 0, data: null };

const DEFAULT_CATEGORIES = [
  'জাতীয়', 'রাজনীতি', 'সারাদেশ', 'অর্থনীতি', 'আন্তর্জাতিক', 'খেলা',
  'বিনোদন', 'শিক্ষা', 'চাকরি', 'প্রবাস', 'ধর্ম', 'স্বাস্থ্য', 'প্রযুক্তি',
];

const CRAWLER_RE = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|LinkedInBot|Slackbot|Discordbot|Pinterest|Googlebot|bingbot|YandexBot|Applebot/i;

const CARD_LIMIT = 60;

function originOf(event) {
  const h = event.headers || {};
  const proto = h['x-forwarded-proto'] || 'https';
  const host = h['x-forwarded-host'] || h.host || 'bangla-news-edition-bd.netlify.app';
  return `${proto}://${host}`;
}

async function loadData() {
  if (BUNDLED && (BUNDLED.editorNews || []).length) return BUNDLED;
  if (remoteCache.data && Date.now() - remoteCache.at < CACHE_TTL_MS) return remoteCache.data;
  try {
    const res = await fetch(REMOTE_FALLBACK, { headers: { 'User-Agent': 'BNE-PageSSR/1.0' } });
    if (res.ok) {
      const data = await res.json();
      remoteCache.at = Date.now();
      remoteCache.data = data;
      return data;
    }
  } catch (e) { /* ব্যর্থ হলে বান্ডল করা ডেটাই ভরসা */ }
  return BUNDLED || { editorNews: [] };
}

/* ── ছবির পাথ: সবসময় absolute, কখনো relative নয় ─────────────────────────
   relative "images/x.jpg" ক্যাটাগরি/সংবাদ পেজে গিয়ে /category/images/x.jpg
   হয়ে যায় → ৪০৪ → সব পোস্টে একই fallback ছবি। legacy "/img/" → "/images/"
   কারণ পুরনো Netlify প্রক্সি আর ব্যবহৃত হয় না। */
function absImage(src, origin) {
  const raw = String(src || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw, origin + '/').href;
  } catch (e) {
    return '';
  }
}

function normalizeLocal(src) {
  const raw = String(src || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  /* ⚠️ এখানেও `/img/` → `/images/` অন্ধ রূপান্তর ছিল (একই বাগ)।
     এখন `/img/<file>` অটুট রাখা হয় — netlify.toml-এর `/img/*` প্রক্সি
     সেটি আমাদের নিজের ডোমেইন থেকেই Oracle-এর স্টোরেজ থেকে সার্ভ করে।
     ফলে `<img src>` ট্যাগ ৪০৪ হয়ে ছবি হারিয়ে যেত, সেটি আর হবে না। */
  return raw.replace(/^\.?\//, '');
}

function stripHtml(s) {
  return OG.stripTags(String(s == null ? '' : s));
}

function truncate(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
}

/** একটি কার্ড — ছবি না থাকলে ছবির বদলে টাইপোগ্রাফিক ব্লক (একই ছবি বারবার নয়) */
function card(item, origin) {
  const slug = item.slug || item.id;
  const href = `/news/${encodeURIComponent(slug)}`;
  const local = normalizeLocal(item.image);
  const img = local ? absImage(local, origin) : '';
  const title = stripHtml(item.title);
  const summary = truncate(stripHtml(item.summary || item.body || ''), 150);

  const media = img
    ? `<img src="${OG.esc(img)}" alt="${OG.esc(truncate(title, 110))}" loading="lazy" decoding="async" width="640" height="360" />`
    : `<span class="ssr-card-noimg" aria-hidden="true">${OG.esc(item.category || 'সংবাদ')}</span>`;

  return `<a class="ssr-card" href="${href}">${media}<div class="ssr-card-body"><h3>${OG.esc(title)}</h3><p>${OG.esc(summary)}</p></div></a>`;
}

/* ── শেল ─────────────────────────────────────────────────────────────── */
function shell(origin, headTags, bodyHtml) {
  const nav = DEFAULT_CATEGORIES.slice(0, 9)
    .map((c) => `<a href="/category/${encodeURIComponent(c)}">${OG.esc(c)}</a>`)
    .join('\n      ');

  return `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${headTags}
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='%23c00000'/><text x='50' y='64' font-size='42' font-weight='bold' fill='white' text-anchor='middle' font-family='sans-serif'>BNE</text></svg>" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="stylesheet" href="/style.css" />
<link rel="stylesheet" href="/ssr.css" />
</head>
<body class="ssr-body">
<header class="ssr-header">
  <a class="ssr-brand" href="/">বাংলা নিউজ এডিশন</a>
  <button id="theme-toggle-btn" type="button" class="ssr-theme-btn" aria-label="থিম বদলান" title="ডার্ক / লাইট থিম বদলান">🌓</button>
  <nav class="ssr-nav" aria-label="বিভাগসমূহ">
      ${nav}
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

function esc(s) { return OG.esc(s); }

/* ── হেড বিল্ডার ─────────────────────────────────────────────────────── */
function headTags(opts) {
  const {
    origin, pathname, title, description, image, robots,
    breadcrumb, collectionType, items,
  } = opts;

  const canonical = `${origin}${pathname}`;
  const t = [];

  t.push(`<title>${esc(title)}</title>`);
  t.push(`<meta name="description" content="${esc(truncate(description, 200))}" />`);
  t.push(`<link rel="canonical" href="${esc(canonical)}" />`);
  t.push(`<meta name="robots" content="${esc(robots)}" />`);
  t.push('<meta name="theme-color" content="#991b1b" />');

  t.push('<meta property="og:type" content="website" />');
  t.push('<meta property="og:site_name" content="বাংলা নিউজ এডিশন | BANGLA NEWS EDITION" />');
  t.push('<meta property="og:locale" content="bn_IN" />');
  t.push('<meta property="og:locale:alternate" content="en_US" />');
  t.push(`<meta property="og:title" content="${esc(title)}" />`);
  t.push(`<meta property="og:description" content="${esc(truncate(description, 200))}" />`);
  t.push(`<meta property="og:url" content="${esc(canonical)}" />`);
  if (image) {
    t.push(`<meta property="og:image" content="${esc(image)}" />`);
    t.push(`<meta property="og:image:width" content="1200" />`);
    t.push(`<meta property="og:image:height" content="630" />`);
    t.push(`<meta property="og:image:alt" content="${esc(truncate(title, 120))}" />`);
  }
  t.push('<meta name="twitter:card" content="summary_large_image" />');
  t.push(`<meta name="twitter:title" content="${esc(title)}" />`);
  t.push(`<meta name="twitter:description" content="${esc(truncate(description, 180))}" />`);
  if (image) t.push(`<meta name="twitter:image" content="${esc(image)}" />`);
  t.push('<meta name="twitter:site" content="@bne0999" />');

  /* BreadcrumbList — সব item মূল ডোমেইনে (কোনো কাঁচা IP হোস্ট নয়) */
  t.push(
    '<script type="application/ld+json">' +
      OG.jsonLd({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumb.map((b, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: b.name,
          item: origin + b.path,
        })),
      }) +
    '</script>'
  );

  /* CollectionPage + ItemList — ক্যাটাগরি/ডেস্ক পেজের জন্য */
  if (collectionType && items && items.length) {
    t.push(
      '<script type="application/ld+json">' +
        OG.jsonLd({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          description: truncate(description, 200),
          url: canonical,
          inLanguage: 'bn-BD',
          isPartOf: { '@type': 'WebSite', name: 'বাংলা নিউজ এডিশন', url: origin + '/' },
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: items.length,
            itemListElement: items.slice(0, 20).map((it, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${origin}/news/${encodeURIComponent(it.slug || it.id)}`,
              name: stripHtml(it.title),
            })),
          },
        }) +
      '</script>'
    );
  }

  return t.join('\n');
}

/* ── ৪০৪ ─────────────────────────────────────────────────────────────── */
function notFoundPage(origin, pathname) {
  const head = headTags({
    origin,
    pathname,
    title: 'পাতাটি পাওয়া যায়নি — বাংলা নিউজ এডিশন',
    description: 'আপনি যে পাতাটি খুঁজছেন সেটি সরানো হয়েছে অথবা লিংকটি ভুল।',
    robots: 'noindex, follow',
    breadcrumb: [{ name: 'প্রচ্ছদ', path: '/' }],
  });
  const body = `<main class="ssr-main" id="app">
  <h1 class="ssr-title">পাতাটি পাওয়া যায়নি (৪০৪)</h1>
  <p>আপনি যে পাতাটি খুঁজছেন সেটি সরানো হয়েছে অথবা লিংকটি ভুল।</p>
  <p><a href="${esc(origin)}/">← প্রচ্ছদে ফিরে যান</a></p>
</main>`;
  return {
    statusCode: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, follow',
    },
    body: shell(origin, head, body),
  };
}

/* ── হ্যান্ডলার ──────────────────────────────────────────────────────── */
exports.handler = async (event) => {
  const origin = originOf(event);
  const rawPath = event.path || '/';
  const pathname = rawPath.replace(/\/+$/, '') || '/';

  let decoded = pathname;
  try { decoded = decodeURIComponent(pathname); } catch (e) { /* আক্ষরিক রাখো */ }

  const data = await loadData();
  const all = (data && data.editorNews) || [];
  const settings = (data && data.settings) || {};
  const siteCover = absImage('/images/bne-og-cover.jpg', origin);

  const isCrawler = CRAWLER_RE.test(String((event.headers || {})['user-agent'] || ''));
  const cacheHeader = isCrawler
    ? 'no-store'
    : 'public, max-age=60, stale-while-revalidate=600';

  /* ── ক্যাটাগরি ────────────────────────────────────────────────────── */
  const catM = decoded.match(/^\/category\/(.+)$/);
  if (catM) {
    const name = catM[1].trim();
    const known = DEFAULT_CATEGORIES.concat(
      all.map((a) => a.category).filter(Boolean)
    );
    if (!name || known.indexOf(name) === -1) return notFoundPage(origin, pathname);

    const items = all
      .filter((a) => a.category === name)
      .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));

    const title = `${name} — সর্বশেষ সংবাদ | বাংলা নিউজ এডিশন (BNE)`;
    const description = `${name} বিভাগের সর্বশেষ ও গুরুত্বপূর্ণ সংবাদ — বাংলা নিউজ এডিশন (BNE)। মোট ${items.length}টি সংবাদ, নিরন্তর হালনাগাদ।`;

    const head = headTags({
      origin,
      pathname,
      title,
      description,
      image: siteCover,
      robots: 'index, follow, max-image-preview:large, max-snippet:-1',
      breadcrumb: [
        { name: 'প্রচ্ছদ', path: '/' },
        { name: name, path: pathname },
      ],
      collectionType: 'category',
      items,
    });

    const top = items.slice(0, CARD_LIMIT);
    const body = `<main class="ssr-main" id="app">
  <nav class="ssr-crumb"><a href="/">প্রচ্ছদ</a> › ${esc(name)}</nav>
  <h1 class="ssr-title">${esc(name)}</h1>
  <div class="ssr-meta"><span class="ssr-badge">${esc(name)}</span><span>মোট ${esc(items.length)}টি সংবাদ</span></div>
  ${OG.shareBar({ url: origin + '/category/' + encodeURIComponent(name), title: name + ' — বাংলা নিউজ এডিশন' })}
  ${top.length
    ? `<div class="ssr-grid">${top.map((it) => card(it, origin)).join('\n')}</div>`
    : '<p>এই বিভাগে এখনো কোনো সংবাদ প্রকাশিত হয়নি।</p>'}
</main>`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': cacheHeader,
        'X-SSR': isCrawler ? 'crawler' : 'public',
      },
      body: shell(origin, head, body),
    };
  }

  /* ── প্রবাস ডেস্ক ─────────────────────────────────────────────────── */
  if (/^\/desk\/probashi-bangla-news(\/.*)?$/.test(decoded)) {
    const items = all
      .filter((a) => a.category === 'প্রবাস' || (a.tags || []).some((t) => String(t).indexOf('প্রবাস') !== -1))
      .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));

    const title = 'প্রবাস বাংলা নিউজ — বিশ্বজুড়ে বাংলাদেশীদের সংবাদ | BNE';
    const description = 'প্রবাসীদের জন্য বিশেষায়িত ডেস্ক — ভিসা, কর্মসংস্থান, রেমিট্যান্স ও অভিবাসন সংক্রান্ত সর্বশেষ নির্ভরযোগ্য সংবাদ।';

    const head = headTags({
      origin,
      pathname: '/desk/probashi-bangla-news',
      title,
      description,
      image: absImage('/images/bne-og-cover.jpg', origin),
      robots: 'index, follow, max-image-preview:large',
      breadcrumb: [
        { name: 'প্রচ্ছদ', path: '/' },
        { name: 'প্রবাস বাংলা নিউজ', path: '/desk/probashi-bangla-news' },
      ],
      collectionType: 'desk',
      items,
    });

    const body = `<main class="ssr-main" id="app">
  <nav class="ssr-crumb"><a href="/">প্রচ্ছদ</a> › প্রবাস বাংলা নিউজ</nav>
  <h1 class="ssr-title">প্রবাস বাংলা নিউজ</h1>
  <div class="ssr-meta"><span class="ssr-badge">👥 প্রবাস ডেস্ক</span><span>মোট ${esc(items.length)}টি সংবাদ</span></div>
  ${items.length
    ? `<div class="ssr-grid">${items.slice(0, CARD_LIMIT).map((it) => card(it, origin)).join('\n')}</div>`
    : '<p>এই ডেস্কে এখনো কোনো সংবাদ প্রকাশিত হয়নি।</p>'}
</main>`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': cacheHeader,
        'X-SSR': isCrawler ? 'crawler' : 'public',
      },
      body: shell(origin, head, body),
    };
  }

  /* ── সার্চ (noindex — ফলাফল ইনডেক্স করা উচিত নয়) ────────────────── */
  const searchM = decoded.match(/^\/search\/(.*)$/);
  if (searchM) {
    const q = (searchM[1] || '').trim();
    const lq = q.toLowerCase();
    const items = q
      ? all.filter((a) => {
          const hay = (stripHtml(a.title) + ' ' + stripHtml(a.summary || a.body || '') + ' ' + (a.tags || []).join(' ')).toLowerCase();
          return hay.indexOf(lq) !== -1;
        })
      : [];

    const title = q ? `“${q}” — খোঁজার ফলাফল | বাংলা নিউজ এডিশন` : 'খোঁজার ফলাফল | বাংলা নিউজ এডিশন';

    const head = headTags({
      origin,
      pathname,
      title,
      description: 'বাংলা নিউজ এডিশন (BNE) আর্কাইভে সংবাদ খুঁজুন।',
      robots: 'noindex, follow',
      breadcrumb: [
        { name: 'প্রচ্ছদ', path: '/' },
        { name: 'খোঁজার ফলাফল', path: pathname },
      ],
    });

    const body = `<main class="ssr-main" id="app">
  <nav class="ssr-crumb"><a href="/">প্রচ্ছদ</a> › খোঁজার ফলাফল</nav>
  <h1 class="ssr-title">${q ? '“' + esc(q) + '”' : 'খোঁজার ফলাফল'}</h1>
  <div class="ssr-meta"><span>মোট ${esc(items.length)}টি সংবাদ পাওয়া গেছে</span></div>
  ${items.length
    ? `<div class="ssr-grid">${items.slice(0, CARD_LIMIT).map((it) => card(it, origin)).join('\n')}</div>`
    : '<p>এই শব্দের সাথে মিলে যাওয়া কোনো সংবাদ পাওয়া যায়নি। <a href="/">প্রচ্ছদে ফিরে যান</a>।</p>'}
</main>`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, follow',
      },
      body: shell(origin, head, body),
    };
  }

  return notFoundPage(origin, pathname);
};
