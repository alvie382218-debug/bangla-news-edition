#!/usr/bin/env node
/**
 * BNE — নিজস্ব সাইট-ডেটা বিল্ডার  (P0-3 ফিক্সের মূল স্তর)
 * ═══════════════════════════════════════════════════════════════════════════
 * সমস্যা (লাইভ সাইটে সরাসরি মাপা হয়েছে):
 *   • /api/config         → 404 (Netlify-তে config.js ফাংশনই নেই)
 *   • তাই app.js-এর fetchLiveConfig() সবসময় ব্যর্থ হত
 *   • ফলে একমাত্র কনটেন্ট-সোর্স হয়ে দাঁড়াত site-config.js-এর
 *     remoteConfigUrl = https://raw.githubusercontent.com/…/data/bne-config.json
 *     → ২,৩০৫,৬৬০ বাইট (২.৩MB), version 83, ৪৯৬টি সংবাদ + ৯টি বিজ্ঞাপন
 *   • প্রতিটি পেজ লোডে সেই ২.৩MB ডাউনলোড + JSON.parse — প্রথম পেইন্টের আগেই
 *   • GitHub raw প্রোডাকশন CDN নয় → rate-limit/ব্লক/নেট-দুর্বলতায়
 *     কিছুই রেন্ডার হয় না = ব্যবহারকারীর দেখা "সাদা স্ক্রিন"

 * সমাধান: বিল্ডের সময়েই ডেটা ভাগ করে নিজের origin-এ রাখা —
 *   /data/site.json   : settings + ads + হালকা সংবাদ-তালিকা (body ছাড়া)
 *                       → প্রথম পেইন্টের জন্য, ~১৫০–২৫০KB, CDN-ক্যাশড
 *   /data/news.json   : সম্পূর্ণ সংবাদ-তালিকা, body সহ (ঐচ্ছিক টায়ার)
 *
 * পূর্ণ কনটেন্টের জন্য Netlify Function /api/config বান্ডল করা
 * netlify/functions/_data.json ব্যবহার করে — অর্থাৎ কোনো বাইরের নির্ভরতা নেই।
 *
 * ব্যবহার: node tools/build-site-data.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = path.join(ROOT, 'data', 'bne-config.json');
const OUT_DIR = path.join(ROOT, 'data');
const OUT_SITE = path.join(OUT_DIR, 'site.json');
const OUT_NEWS = path.join(OUT_DIR, 'news.json');

const LIGHT_LIMIT = 600;   /* হালকা তালিকায় সর্বোচ্চ কতটি সংবাদ (নতুন আগে) */

function stripBasic(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  let out = String(s == null ? '' : s);
  for (let i = 0; i < 3; i++) {
    const next = out.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
      (w, e) => {
        if (e[0] === '#') {
          const cp = (e[1] === 'x' || e[1] === 'X') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          if (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff) { try { return String.fromCodePoint(cp); } catch (x) { return w; } }
          return w;
        }
        const k = e.toLowerCase();
        return Object.prototype.hasOwnProperty.call(named, k) ? named[k] : w;
      });
    if (next === out) break;
    out = next;
  }
  return out;
}

function plain(s, max) {
  let t = stripBasic(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (max && t.length > max) t = t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return t;
}

function isoOrNull(v) {
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function main() {
  if (!fs.existsSync(CONFIG)) {
    console.log('[site-data] data/bne-config.json নেই — এড়িয়ে যাওয়া হলো');
    return;
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch (e) {
    console.log('[site-data] কনফিগ পড়া যায়নি (' + e.message + ') — এড়িয়ে যাওয়া হলো');
    return;
  }

  const all = (cfg.editorNews || []).filter((a) => a && (a.title || a.id));
  const sorted = all.slice().sort(
    (a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0)
  );

  /* ── হালকা তালিকা: body ছাড়া (প্রথম পেইন্টের জন্য) ───────────────── */
  const lightNews = sorted.slice(0, LIGHT_LIMIT).map((a) => ({
    id: a.id,
    slug: a.slug || a.id,
    title: plain(a.title, 300),
    category: plain(a.category, 40) || 'সংবাদ',
    image: a.image || '',
    publishedAt: isoOrNull(a.publishedAt),
    tags: Array.isArray(a.tags) ? a.tags.slice(0, 8) : [],
    summary: plain(a.summary || a.body || '', 280),
    lead: !!a.lead,
    editorial: !!a.editorial,
    _light: true
  }));

  const siteJson = {
    version: cfg.version || 1,
    updatedAt: isoOrNull(cfg.updatedAt) || new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    settings: Object.assign({}, cfg.settings || {}, {
      /* ★ P0-3: নিজের origin — কোনো বাইরের হোস্ট নয় ★ */
      remoteConfigUrl: '/data/site.json',
      ga4MeasurementId: 'G-3X2CF2KWH',
      adminPath: undefined
    }),
    ads: (cfg.ads || []).filter((a) => a && a.enabled !== false),
    editorNews: lightNews,
    newsCount: all.length,
    truncated: all.length > lightNews.length
  };
  if (siteJson.settings.adminPath === undefined) delete siteJson.settings.adminPath;

  /* ── পূর্ণ তালিকা (body সহ) ──────────────────────────────────────── */
  const fullNews = sorted.map((a) => ({
    id: a.id,
    slug: a.slug || a.id,
    title: plain(a.title, 300),
    category: plain(a.category, 40) || 'সংবাদ',
    image: a.image || '',
    publishedAt: isoOrNull(a.publishedAt),
    tags: Array.isArray(a.tags) ? a.tags.slice(0, 8) : [],
    summary: plain(a.summary || '', 400),
    body: String(a.body || ''),
    lead: !!a.lead,
    editorial: !!a.editorial
  }));

  const newsJson = {
    version: cfg.version || 1,
    updatedAt: siteJson.updatedAt,
    generatedAt: siteJson.generatedAt,
    count: fullNews.length,
    news: fullNews
  };

  fs.writeFileSync(OUT_SITE, JSON.stringify(siteJson), 'utf8');
  fs.writeFileSync(OUT_NEWS, JSON.stringify(newsJson), 'utf8');

  const kb = (p) => (fs.statSync(p).size / 1024).toFixed(1) + ' KB';
  console.log('[site-data] সম্পন্ন');
  console.log('  • data/site.json : ' + kb(OUT_SITE) + '  (' + lightNews.length + ' সংবাদ, body ছাড়া)');
  console.log('  • data/news.json : ' + kb(OUT_NEWS) + '  (' + fullNews.length + ' সংবাদ, body সহ)');
  console.log('  • মোট সংবাদ      : ' + all.length);
}

main();
