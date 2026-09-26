#!/usr/bin/env node
/**
 * BNE — বিল্ড-টাইম হোমপেজ প্রি-রেন্ডারার  (P0-3 + P0-6 ফিক্স)
 * ═══════════════════════════════════════════════════════════════════════════
 * সমস্যা (লাইভ সাইটে প্রমাণিত):
 *   index.html-এর <main id="app"> সম্পূর্ণ খালি ছিল। কনটেন্ট আসত কেবল
 *   app.js চালু হওয়ার পর — অর্থাৎ ২.৩MB রিমোট কনফিগ ডাউনলোড + JSON.parse
 *   শেষ হলে। Slow 3G-এ তাই দীর্ঘ "সাদা স্ক্রিন", আর ক্রলার পেত:
 *     • <h1> = ০
 *     • রিয়েল-পাথ লিংক = ০ (সব লিংক #/… হ্যাশ)
 *     • শব্দ = মাত্র ১৮০
 *   ফলে প্লাগইন ক্রল হোমপেজ থেকে মাত্র ৪টি URL আবিষ্কার করেছিল —
 *   অথচ সাইটে ২০০১+ নিউজ URL আছে।
 *
 * সমাধান: বিল্ডের সময়েই শীর্ষ সংবাদগুলো আসল HTML হিসেবে index.html-এর
 *   ভেতরে বসিয়ে দেওয়া হয় — সঠিক <h1>, প্রতিটি সংবাদের জন্য
 *   <a href="/news/<slug>"> রিয়েল-পাথ লিংক, <time datetime="…"> এবং
 *   একটি লিড স্টোরি। অর্থাৎ প্রথম বাইটেই ক্রলার পুরো সাইট দেখতে পায় এবং
 *   পাঠক কোনো সাদা স্ক্রিন দেখেন না।
 *
 * নিরাপদ: মার্কার না পেলে ফাইল অপরিবর্তিত রাখে (বিল্ড কখনো ভাঙে না)।
 * ব্যবহার: node tools/prerender-home.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = path.join(ROOT, 'data', 'bne-config.json');
const INDEX = path.join(ROOT, 'index.html');
const OUT_REPORT = path.join(ROOT, 'data', 'prerender-report.json');

const START = '<!--PRERENDER:START-->';
const END = '<!--PRERENDER:END-->';

const CARD_LIMIT = 24;
const SITE = 'বাংলা নিউজ এডিশন';

/* ── সহায়ক ──────────────────────────────────────────────────────────── */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const BN = { 0: '০', 1: '১', 2: '২', 3: '৩', 4: '৪', 5: '৫', 6: '৬', 7: '৭', 8: '৮', 9: '৯' };
function bn(n) { return String(n).replace(/[0-9]/g, (d) => BN[d]); }

function decodeEntitiesOnce(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(s == null ? '' : s).replace(
    /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (whole, ent) => {
      if (ent[0] === '#') {
        const cp = (ent[1] === 'x' || ent[1] === 'X')
          ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
        if (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff) {
          try { return String.fromCodePoint(cp); } catch (e) { return whole; }
        }
        return whole;
      }
      const k = ent.toLowerCase();
      return Object.prototype.hasOwnProperty.call(named, k) ? named[k] : whole;
    }
  );
}

/* ডাবল-এস্কেপ করা সংবাদ-লেখা ঠিক করা (Oracle কখনো দুইবার এস্কেপ করে) */
function stripTags(s) {
  let out = String(s == null ? '' : s);
  for (let i = 0; i < 3; i++) {
    const next = decodeEntitiesOnce(out);
    if (next === out) break;
    out = next;
  }
  return out
    .replace(/<\s*(script|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s, n) {
  const t = stripTags(s);
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

/**
 * ছবির পাথ স্বাভাবিকীকরণ — কখনো relative নয় (P0-2)।
 *   • https://…       → অপরিবর্তিত
 *   • /img/<file>     → /images/<file>  (legacy Oracle পাথ → নিজের ফোল্ডার)
 *   • images/<file>   → /images/<file>   (leading slash ছাড়া relative — প্যাঁচ)
 *   • ''              → null (কলার নিজে টাইপোগ্রাফিক ব্লক বসাবে)
 */
function normalizeImage(src) {
  const raw = String(src || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  let rel = raw.replace(/^\.?\//, '');
  if (rel.indexOf('img/') === 0) rel = 'images/' + rel.slice(4);
  return '/' + rel;
}

function stamp(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

/* টাইপোগ্রাফিক ব্লক — ছবি না থাকলে একই ছবি বারবার নয় (P2-3 / থাম্বনেইল মনোটনি) */
function noImgBlock(category, title) {
  const initial = (stripTags(title).trim().charAt(0) || 'ব').trim();
  return '<span class="thumb-noimg" aria-hidden="true">' +
    '<b>' + esc(initial) + '</b><i>' + esc(category || 'সংবাদ') + '</i>' +
    '</span>';
}

function imgTag(src, alt, category, title) {
  const url = normalizeImage(src);
  if (!url) return noImgBlock(category, title);
  return '<img src="' + esc(url) + '" alt="' + esc(truncate(alt, 120)) + '"' +
    ' width="640" height="360" loading="lazy" decoding="async"' +
    ' onerror="if(!this.dataset.fb){this.dataset.fb=1;this.style.display=\'none\';}">';
}

function cardHtml(a) {
  const slug = a.slug || a.id;
  const href = '/news/' + encodeURIComponent(slug);
  const title = stripTags(a.title);
  const summary = truncate(a.summary || a.body || '', 150);
  const cat = stripTags(a.category) || 'সংবাদ';
  const iso = stamp(a.publishedAt);
  return '<a class="card" href="' + esc(href) + '">' +
    '<span class="thumb">' + imgTag(a.image, title, cat, title) +
    '<span class="badge">' + esc(cat) + '</span></span>' +
    '<span class="body"><h2 class="prerender-h2">' + esc(title) + '</h2>' +
    '<p>' + esc(summary) + '</p>' +
    '<span class="meta"><time datetime="' + esc(iso) + '">' +
    esc(new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeZone: 'Asia/Dhaka' }).format(new Date(iso))) +
    '</time></span></span></a>';
}

/* ── মূল ─────────────────────────────────────────────────────────────── */
function main() {
  if (!fs.existsSync(CONFIG)) {
    console.log('[prerender] data/bne-config.json নেই — এড়িয়ে যাওয়া হলো');
    return;
  }
  if (!fs.existsSync(INDEX)) {
    console.log('[prerender] index.html নেই — এড়িয়ে যাওয়া হলো');
    return;
  }

  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch (e) {
    console.log('[prerender] কনফিগ পড়া যায়নি (' + e.message + ') — এড়িয়ে যাওয়া হলো');
    return;
  }

  const all = (cfg.editorNews || []).filter((a) => a && a.title);
  if (!all.length) {
    console.log('[prerender] কোনো সংবাদ নেই — এড়িয়ে যাওয়া হলো');
    return;
  }

  const sorted = all.slice().sort(
    (a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0)
  );
  const top = sorted.slice(0, CARD_LIMIT);

  /* ইউনিক ছবি নিশ্চিত করা: একই src দুইবার হলে দ্বিতীয়বার টাইপোগ্রাফিক ব্লক */
  const seenSrc = new Set();
  top.forEach((a) => {
    const u = normalizeImage(a.image);
    if (u && seenSrc.has(u)) a.__dupImg = true;
    else if (u) seenSrc.add(u);
  });

  const html = fs.readFileSync(INDEX, 'utf8');
  if (html.indexOf(START) === -1 || html.indexOf(END) === -1) {
    console.log('[prerender] মার্কার পাওয়া যায়নি — index.html অপরিবর্তিত');
    return;
  }

  const lead = top[0];
  const rest = top.slice(1);

  const catCounts = {};
  all.forEach((a) => {
    const c = stripTags(a.category) || 'সংবাদ';
    catCounts[c] = (catCounts[c] || 0) + 1;
  });

  const catLinks = Object.keys(catCounts)
    .sort((a, b) => catCounts[b] - catCounts[a])
    .slice(0, 13)
    .map((c) => '<li><a href="/category/' + encodeURIComponent(c) + '">' + esc(c) +
      ' <span class="pr-count">(' + esc(bn(catCounts[c])) + ')</span></a></li>')
    .join('');

  const block = [
    START,
    '<!-- বিল্ড-টাইমে tools/prerender-home.js দিয়ে তৈরি — ম্যানুয়ালি সম্পাদনা করবেন না -->',
    '<h1 class="prerender-h1">' + esc(SITE) + ' — সর্বশেষ সংবাদ ও ব্রেকিং নিউজ</h1>',
    '<p class="prerender-lede">বাংলাদেশ ও বিশ্বের সর্বশেষ খবর, এক নজরে। মোট ' +
      esc(bn(all.length)) + 'টি সংবাদ সংরক্ষিত।</p>',

    '<section class="section prerender-lead">',
    '<article class="pr-lead-card">',
    '<a href="/news/' + encodeURIComponent(lead.slug || lead.id) + '">',
    imgTag(lead.image, lead.title, stripTags(lead.category), lead.title),
    '</a>',
    '<div class="pr-lead-body">',
    '<span class="badge">' + esc(stripTags(lead.category) || 'সংবাদ') + '</span>',
    '<h2><a href="/news/' + encodeURIComponent(lead.slug || lead.id) + '">' + esc(stripTags(lead.title)) + '</a></h2>',
    '<p>' + esc(truncate(lead.summary || lead.body || '', 260)) + '</p>',
    '<div class="meta"><time datetime="' + esc(stamp(lead.publishedAt)) + '">' +
      esc(new Intl.DateTimeFormat('bn-BD', { dateStyle: 'long', timeZone: 'Asia/Dhaka' }).format(new Date(stamp(lead.publishedAt)))) +
      '</time></div>',
    '</div>',
    '</article>',
    '</section>',

    '<section class="section">',
    '<div class="section-head"><h2>সর্বশেষ সংবাদ</h2><a href="/category/' + encodeURIComponent('জাতীয়') + '">সব দেখুন →</a></div>',
    '<div class="grid cols-3">' + rest.map(cardHtml).join('') + '</div>',
    '</section>',

    '<section class="section prerender-cats">',
    '<div class="section-head"><h2>বিভাগসমূহ</h2></div>',
    '<ul class="pr-cat-list">' + catLinks + '</ul>',
    '</section>',
    END,
  ].join('\n');

  const before = html.slice(0, html.indexOf(START));
  const after = html.slice(html.indexOf(END) + END.length);
  const out = before + block + after;

  fs.writeFileSync(INDEX, out, 'utf8');

  const links = (out.match(/href="\/news\//g) || []).length;
  const h1s = (out.match(/<h1[\s>]/g) || []).length;

  try {
    fs.writeFileSync(OUT_REPORT, JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalNews: all.length,
      prerendered: top.length,
      realNewsLinksInHomepage: links,
      h1Count: h1s,
      categories: catCounts,
    }, null, 2), 'utf8');
  } catch (e) { /* রিপোর্ট ব্যর্থ হলেও বিল্ড চলবে */ }

  console.log('[prerender] সম্পন্ন');
  console.log('  • হোমপেজে রিয়েল-পাথ নিউজ লিংক : ' + links);
  console.log('  • হোমপেজে <h1> সংখ্যা          : ' + h1s);
  console.log('  • প্রি-রেন্ডার করা সংবাদ        : ' + top.length + ' / ' + all.length);
}

main();
