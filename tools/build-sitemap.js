#!/usr/bin/env node
/**
 * BNE — sitemap.xml ও news-sitemap.xml বিল্ডার  (P1-1 ফিক্স)
 * ═══════════════════════════════════════════════════════════════════════════
 * সমস্যা (লাইভ সাইটে প্রমাণিত):
 *   ১) robots.txt-এ সাইটম্যাপ ঘোষণা ছিল ভুল হোস্টে —
 *      https://bangla-news-edition.netlify.app/sitemap.xml  (-bd ছাড়া)।
 *      ফলে Google সঠিক সাইটের সাইটম্যাপ কখনো পেত না, আর সাবমিট করা
 *      হোস্টটি আসলে অন্য একটি লাইভ ডুপ্লিকেট সাইট।
 *   ২) /sitemap.xml একটি বাইরের সার্ভার (কাঁচা IP হোস্ট) থেকে প্রক্সি হত।
 *      ওই সার্ভার ডাউন হলে সাইটম্যাপ সম্পূর্ণ অচল।
 *
 * সমাধান: বিল্ডের সময়েই সাইটম্যাপ তৈরি হয়ে রেপোতে বসে — নিজের হোস্টে,
 *   কোনো বাইরের নির্ভরতা ছাড়া। সাথে Google News-এর জন্য news-sitemap.xml
 *   (শেষ ৪৮ ঘণ্টার সংবাদ)।
 *
 * ব্যবহার: node tools/build-sitemap.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = path.join(ROOT, 'data', 'bne-config.json');
const OUT_SITEMAP = path.join(ROOT, 'sitemap.xml');
const OUT_NEWS = path.join(ROOT, 'news-sitemap.xml');

/* ★ একমাত্র ক্যানোনিক্যাল হোস্ট — এখানে বদলালেই পুরো সাইটম্যাপ বদলাবে */
const HOST = process.env.BNE_SITE_ORIGIN || 'https://bangla-news-edition-bd.netlify.app';

/* ★ তবু কাঁচা IP বা পুরনো হোস্ট কখনো সাইটম্যাপে ঢুকবে না */
function assertCleanHost(url) {
  if (/nip\.io/i.test(url) || /^https?:\/\/\d+\.\d+\.\d+\.\d+/.test(url)) {
    throw new Error('সাইটম্যাপে কাঁচা IP হোস্ট ঢুকেছে: ' + url);
  }
  return url;
}

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function isoDate(v) {
  const t = Date.parse(v);
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

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
  return out.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function main() {
  if (!fs.existsSync(CONFIG)) {
    console.log('[sitemap] data/bne-config.json নেই — এড়িয়ে যাওয়া হলো');
    return;
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch (e) {
    console.log('[sitemap] কনফিগ পড়া যায়নি (' + e.message + ') — এড়িয়ে যাওয়া হলো');
    return;
  }

  const all = (cfg.editorNews || []).filter((a) => a && (a.title || a.slug || a.id));
  const now = new Date().toISOString();

  const staticUrls = [
    { loc: HOST + '/', pri: '1.0', freq: 'hourly', lastmod: now },
    { loc: HOST + '/desk/probashi-bangla-news', pri: '0.8', freq: 'daily', lastmod: now },
    { loc: HOST + '/about-us', pri: '0.4', freq: 'monthly', lastmod: now },
    { loc: HOST + '/contact-us', pri: '0.4', freq: 'monthly', lastmod: now },
    { loc: HOST + '/privacy-policy', pri: '0.3', freq: 'yearly', lastmod: now },
    { loc: HOST + '/terms', pri: '0.3', freq: 'yearly', lastmod: now },
    { loc: HOST + '/advertise', pri: '0.4', freq: 'monthly', lastmod: now },
  ];

  const cats = Array.from(new Set(all.map((a) => stripBasic(a.category)).filter(Boolean)));
  cats.forEach((c) => {
    staticUrls.push({
      loc: HOST + '/category/' + encodeURIComponent(c),
      pri: '0.7', freq: 'hourly', lastmod: now,
    });
  });

  const newsUrls = all.map((a) => {
    const slug = a.slug || a.id;
    return {
      loc: HOST + '/news/' + encodeURIComponent(slug),
      lastmod: isoDate(a.publishedAt),
      title: stripBasic(a.title),
      category: stripBasic(a.category) || 'সংবাদ',
      image: String(a.image || '').trim(),
    };
  }).sort((a, b) => Date.parse(b.lastmod) - Date.parse(a.lastmod));

  /* ── sitemap.xml ────────────────────────────────────────────────── */
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];

  staticUrls.forEach((u) => {
    lines.push('  <url>');
    lines.push('    <loc>' + xmlEscape(assertCleanHost(u.loc)) + '</loc>');
    lines.push('    <lastmod>' + xmlEscape(u.lastmod) + '</lastmod>');
    lines.push('    <changefreq>' + u.freq + '</changefreq>');
    lines.push('    <priority>' + u.pri + '</priority>');
    lines.push('  </url>');
  });

  newsUrls.forEach((u) => {
    lines.push('  <url>');
    lines.push('    <loc>' + xmlEscape(assertCleanHost(u.loc)) + '</loc>');
    lines.push('    <lastmod>' + xmlEscape(u.lastmod) + '</lastmod>');
    lines.push('    <changefreq>daily</changefreq>');
    lines.push('    <priority>0.6</priority>');
    lines.push('  </url>');
  });

  lines.push('</urlset>');
  fs.writeFileSync(OUT_SITEMAP, lines.join('\n') + '\n', 'utf8');

  /* ── news-sitemap.xml (Google News — শেষ ৪৮ ঘণ্টা, সর্বোচ্চ ১০০০) ── */
  const cut = Date.now() - 48 * 60 * 60 * 1000;
  const recent = newsUrls.filter((u) => Date.parse(u.lastmod) >= cut).slice(0, 1000);

  const nl = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">'];

  recent.forEach((u) => {
    nl.push('  <url>');
    nl.push('    <loc>' + xmlEscape(assertCleanHost(u.loc)) + '</loc>');
    nl.push('    <news:news>');
    nl.push('      <news:publication>');
    nl.push('        <news:name>বাংলা নিউজ এডিশন</news:name>');
    nl.push('        <news:language>bn</news:language>');
    nl.push('      </news:publication>');
    nl.push('      <news:publication_date>' + xmlEscape(u.lastmod) + '</news:publication_date>');
    nl.push('      <news:title>' + xmlEscape(u.title) + '</news:title>');
    nl.push('    </news:news>');
    nl.push('  </url>');
  });

  nl.push('</urlset>');
  fs.writeFileSync(OUT_NEWS, nl.join('\n') + '\n', 'utf8');

  console.log('[sitemap] সম্পন্ন');
  console.log('  • হোস্ট              : ' + HOST);
  console.log('  • sitemap.xml        : ' + (staticUrls.length + newsUrls.length) + ' URL');
  console.log('  • news-sitemap.xml   : ' + recent.length + ' URL (শেষ ৪৮ ঘণ্টা)');
}

main();
