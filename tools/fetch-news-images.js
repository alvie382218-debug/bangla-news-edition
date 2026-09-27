#!/usr/bin/env node
'use strict';
/**
 * BNE — সংবাদের আসল ছবি নামিয়ে নিজের স্টোরেজে রাখা (fetch + store)
 * ════════════════════════════════════════════════════════════════════════════
 * কেন এই টুল (ব্যবহারকারীর অভিযোগ, ২০২৬-০৯-২৬)
 * ---------------------------------------------------------------------------
 *   "প্রত্যেক নিউজ যেখান থেকে আসছে ওই নিউজের সাথে যে ছবি রয়েছে সেই ছবিও যাতে
 *    আসে এবং সেই ছবি সহ যাতে পোস্ট হয় — এভাবে না হলে আমার সাইটে ট্রাফিক পাবো না।"
 *
 * লাইভ যাচাই করা অবস্থা (data/bne-config.json):
 *   মোট ৪৯৪টি সংবাদ → ৪৮৩টিতেই image ফিল্ড পুরোপুরি ফাঁকা।
 *   ফলে তিনটি জায়গায় একই ঘটনা ঘটছিল:
 *     ১) `/news/<slug>` পাতার হিরো ছবি  → Oracle-এর `/og/<slug>.jpg` ব্র্যান্ডেড কার্ড
 *     ২) og:image                       → একই ব্র্যান্ডেড কার্ড
 *     ৩) Telegram/Facebook প্রিভিউ কার্ড → একই ব্র্যান্ডেড কার্ড
 *   অর্থাৎ চ্যানেলে ও পেজে প্রতিটি খবরের নিচে হুবহু একই লাল "BANGLA NEWS EDITION"
 *   ছবি দেখাত — খবরের সাথে সম্পর্কহীন।
 *
 * কেন আগের tools/enrich-images.js যথেষ্ট ছিল না
 * ---------------------------------------------------------------------------
 *   সে ছবি খুঁজত (ক) সংবাদমাধ্যমের সাইটম্যাপ ও (খ) RSS ফিডের শিরোনাম মিলিয়ে,
 *   তারপর মূল সাইটের ছবি **হটলিংক** করত (https://cdn.<outlet>/… )।
 *   সমস্যা তিনটি:
 *     • বিল্ড চলে GitHub Actions/Netlify-এর ডেটাসেন্টার IP থেকে — বেশিরভাগ
 *       বাংলাদেশি গণমাধ্যম Cloudflare দিয়ে ওই IP ব্লক করে → ছবি মেলে না।
 *     • শিরোনাম অক্ষরে-অক্ষরে না মিললে (Google News ঘুরিয়ে দেয়) ছবি মেলে না।
 *     • হটলিংক করলে মূল সাইট পরে ব্লক করলেই কার্ড আবার ছবিহীন হয়ে যেত।
 *
 * এই টুল যা করে (নীতিগত পরিবর্তন — hotlink → own host)
 * ---------------------------------------------------------------------------
 *   প্রতিটি সংবাদের sourceUrl থেকে তার **asli og:image** বের করে, ছবিটি
 *   ডাউনলোড করে যাচাই করে, ১২০০x৬৩০ JPEG-তে নормаলাইজ করে রেপোর নিজের
 *   images/news/ ফোল্ডারে রাখে, তারপর image = /images/news/<id>.jpg বসায়।
 *
 *   ফলে ছবিটি আর কারো উপর নির্ভরশীল নয়:
 *     • WAF/হটলিংক-ব্লক প্রভাব ফেলে না (আমরা একবার নামিয়ে রাখি)
 *     • Netlify নিজেই ফাইল সার্ভ করে → কখনো ৪০৩/৫০৪ নয়
 *     • og:image, `<img>`, Telegram কার্ড, Facebook কার্ড — সবই এক ছবি
 *     • মাপ সবসময় ১২০০x৬৩০ → og:image:width/height ঘোষণা করা যায়
 *
 * ⚠️ কপিরাইট ও সূত্র
 *   সংবাদ সংগ্রহকারী হিসেবে ছবিটি ব্যবহার করা হয় মূল সূত্রের প্রচারমূলক
 *   শেয়ার-ছবি (og:image) হিসেবে। তাই প্রতিটি সংবাদে imageCredit ও
 *   imageSourceUrl সংরক্ষণ করা হয় এবং সাইটে "ছবি: <সূত্র>" দেখানো হয়।
 *   সূত্র না জানা থাকলে imageCredit = "সংগৃহীত"।
 *
 * ব্যবহার
 * ---------------------------------------------------------------------------
 *   node tools/fetch-news-images.js                  # অভাব থাকা সব সংবাদ
 *   node tools/fetch-news-images.js --limit=50       # দ্রুত পরীক্ষা
 *   node tools/fetch-news-images.js --force          # আবার নামাও (আগে থাকলেও)
 *   node tools/fetch-news-images.js --prune          # অব্যবহৃত ফাইল মুছুন
 *   node tools/fetch-news-images.js --concurrency=8  # সমান্তরাল অনুরোধ
 * ════════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
/* --config=<path> দিলে অন্য কনফিগে কাজ করে।
   কেন দরকার: রেপোর কনফিগ ও Oracle-এর লাইভ /api/config সবসময় হুবহু এক থাকে না
   (নতুন সংবাদ আগে Oracle-এ আসে, সিঙ্কে দেরি হয়)। লাইভের নতুন খবরগুলোর
   ছবি ধরতে ওই তালিকা সরাসরি ব্যবহার করা সুবিধাজনক। */
const CONFIG_ARG = (() => {
  const a = process.argv.slice(2).find((x) => x.startsWith('--config='));
  return a ? a.split('=').slice(1).join('=') : '';
})();
const CONFIG_FILE = CONFIG_ARG
  ? (path.isAbsolute(CONFIG_ARG) ? CONFIG_ARG : path.join(ROOT, CONFIG_ARG))
  : path.join(ROOT, 'data', 'bne-config.json');
const OUT_DIR = path.join(ROOT, 'images', 'news');
const OUT_URL_PREFIX = '/images/news/';

const OG_W = 1200;
const OG_H = 630;

/* ── সেটিংস (CLI দিয়ে বদলানো যায়) ────────────────────────────────────── */
const args = process.argv.slice(2);
function argNum(name, dflt) {
  const a = args.find((x) => x.startsWith('--' + name + '='));
  return a ? parseInt(a.split('=')[1], 10) || dflt : dflt;
}
const LIMIT = argNum('limit', 0);
const CONCURRENCY = Math.max(1, Math.min(12, argNum('concurrency', 6)));
const FORCE = args.includes('--force');
const PRUNE = args.includes('--prune');
const SOURCE_TIMEOUT = argNum('timeout', 15000);
/* শিরোনাম-কার্ড (cover) কত ঘণ্টা পরপর আবার আসল ছবির জন্য চেষ্টা করবে */
const COVER_RETRY_HOURS = argNum('cover-retry-hours', 12);

/* ── ব্রাউজার-সদৃশ হেডার (WAF-নিরপেক্ষতার জন্য বাধ্যতামূলক) ─────────────── */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/* কিছু সাইট ব্রাউজার-হেডার ছাড়া og:image ফেরায় না, আবার কেউ কেউ বট-UA
   দেখলে আলাদা (প্রায়ই ছোট) ছবি দেয়। তাই প্রথমে ব্রাউজার, পরে Googlebot। */
const FETCH_PROFILES = [
  {
    label: 'browser',
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'bn-BD,bn;q=0.9,en-US;q=0.8,en;q=0.7',
      'Upgrade-Insecure-Requests': '1',
    },
  },
  {
    label: 'googlebot',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'bn-BD,bn;q=0.9,en;q=0.8',
    },
  },
  {
    label: 'facebook',
    headers: {
      'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      Accept: 'text/html,*/*',
    },
  },
];

/* ══ ১. ছবির ভ্যালিডেশন (বাইনারি লেভেলে — কনটেন্ট-টাইপে ভরসা নয়) ═══════════
   কেন: অনেক সাইট ভুল/মিথ্যা Content-Type ফেরায়, আবার ব্লক-পাতা (HTML)
   image/jpeg নামে আসতেও পারে। তাই ফাইলের magic bytes পড়ে সিদ্ধান্ত নেওয়া হয়। */
function sniffImage(buf) {
  if (!buf || buf.length < 32) return null;
  /* JPEG */
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  /* PNG */
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  /* GIF */
  if (buf.slice(0, 3).toString('ascii') === 'GIF') return 'gif';
  /* WEBP — RIFF....WEBP */
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  /* AVIF/HEIC — ftyp box */
  const ftyp = buf.slice(4, 8).toString('ascii');
  if (ftyp === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii');
    if (/avif|avis/.test(brand)) return 'avif';
    if (/heic|heix|hevc|mif1/.test(brand)) return 'heic';
  }
  return null;
}

/* ── ছবির প্রকৃত মাপ (pure JS — CI-তে ImageMagick/sips ছাড়াও কাজ করে) ──── */
function imageSize(buf, kind) {
  try {
    if (kind === 'png') {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (kind === 'gif') {
      return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    }
    if (kind === 'jpeg') {
      let off = 2;
      while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) { off++; continue; }
        const marker = buf[off + 1];
        /* SOF0..SOF15 (C4/C8/CC বাদ) → মাপ এখানে */
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
        }
        const len = buf.readUInt16BE(off + 2);
        if (len < 2) break;
        off += 2 + len;
      }
      return null;
    }
    if (kind === 'webp') {
      const fmt = buf.slice(12, 16).toString('ascii');
      if (fmt === 'VP8X') {
        const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
        const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
        return { w, h };
      }
      if (fmt === 'VP8 ') {
        return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      }
      if (fmt === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) };
      }
      return null;
    }
  } catch (e) { /* অসম্পূর্ণ ফাইল */ }
  return null;
}

/* ══ ২. যেসব URL ছবি হিসেবে কখনো ব্যবহারযোগ্য নয় ════════════════════════ */
const JUNK_RE = new RegExp([
  'sprite', 'logo', 'favicon', 'placeholder', 'blank\\.', 'spacer', 'pixel\\.',
  '1x1', 'transparent', 'loading', 'default[-_]?(share|image|img)', 'share[-_]?default',
  'avatar', 'gravatar', 'emoji', 'badge', 'button', 'banner[-_]?ad',
  'facebook\\.com/tr', 'google-analytics', 'doubleclick', 'adsystem',
].join('|'), 'i');

function looksLikeJunkUrl(url) {
  const u = String(url || '');
  if (!u) return true;
  if (!/^https?:\/\//i.test(u)) return true;
  if (JUNK_RE.test(u)) return true;
  /* svg/ico — ক্রপ করা যায় না বা কার্ডে খারাপ দেখায় */
  if (/\.(svg|ico)(\?|$)/i.test(u)) return true;
  return false;
}

/* ══ ৩. মূল সংবাদের পাতা থেকে ছবির প্রার্থী বের করা ═══════════════════════ */
function absolutize(u, base) {
  try {
    let s = String(u || '').trim().replace(/&amp;/g, '&').replace(/&#0?38;/g, '&');
    if (!s) return '';
    if (s.startsWith('//')) s = 'https:' + s;
    if (s.startsWith('/')) s = new URL(s, base).href;
    if (!/^https?:\/\//i.test(s)) return '';
    return s.replace(/^http:\/\//i, 'https://');
  } catch (e) { return ''; }
}

function metaContent(html, prop) {
  const pats = [
    new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*?content=["\']([^"\']+)["\']', 'i'),
    new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]*?(?:property|name)=["\']' + prop + '["\']', 'i'),
    new RegExp('<meta[^>]+(?:property|name)=' + prop + '[^>]*?content=["\']([^"\']+)["\']', 'i'),
  ];
  for (const p of pats) {
    const m = html.match(p);
    if (m && m[1]) return m[1];
  }
  return '';
}

/* JSON-LD-এর image ফিল্ড — অনেক বাংলা সাইটে og:image না থাকলেও এটা থাকে */
function jsonLdImage(html) {
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  const found = [];
  for (const b of blocks) {
    const body = b.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
    try {
      const parsed = JSON.parse(body.trim());
      const walk = (node) => {
        if (!node) return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (typeof node === 'object') {
          const im = node.image || node.thumbnailUrl || (node.thumbnail && node.thumbnail.url);
          if (typeof im === 'string') found.push(im);
          else if (Array.isArray(im)) im.forEach((x) => { if (typeof x === 'string') found.push(x); else if (x && x.url) found.push(x.url); });
          Object.keys(node).forEach((k) => { if (k !== 'image') walk(node[k]); });
        }
      };
      walk(parsed);
    } catch (e) { /* ভাঙা JSON-LD — বাদ */ }
  }
  return found;
}

/* লেখার ভেতরের প্রথম গ্রহণযোগ্য <img> — শেষ অবলম্বন */
function firstBodyImage(html) {
  const bodyOnly = html
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  const imgs = bodyOnly.match(/<img[^>]+>/gi) || [];
  for (const tag of imgs) {
    const src = (tag.match(/\b(?:data-src|data-original|data-lazy-src|src)=["']([^"']+)["']/i) || [])[1];
    if (!src) continue;
    const abs = absolutize(src, 'https://example.invalid/');
    if (looksLikeJunkUrl(abs)) continue;
    /* ছোট থাম্বনেইল/আইকন বাদ (width/height অ্যাট্রিবিউট থাকলে) */
    const w = parseInt((tag.match(/\bwidth=["']?(\d+)/i) || [])[1] || '0', 10);
    if (w && w < 300) continue;
    return src;
  }
  return '';
}

/**
 * একটি সোর্স URL থেকে ছবির প্রার্থী তালিকা (ক্রম অনুযায়ী সেরা আগে)
 * @returns {Promise<{urls:string[], finalUrl:string, blocked:boolean}>}
 */
async function candidatesFromSource(sourceUrl) {
  const out = { urls: [], finalUrl: sourceUrl, blocked: false };
  if (!/^https?:\/\//i.test(String(sourceUrl || ''))) return out;

  for (const prof of FETCH_PROFILES) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), SOURCE_TIMEOUT);
    try {
      const res = await fetch(sourceUrl, {
        headers: prof.headers,
        redirect: 'follow',
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) { out.blocked = out.blocked || res.status >= 400; continue; }
      const ct = String(res.headers.get('content-type') || '').toLowerCase();
      if (!/html|xml|text/.test(ct)) continue;
      const html = (await res.text()).slice(0, 600000);

      /* ★ Google News-এর রিডাইরেক্ট হলে চূড়ান্ত ঠিকানা যাচাই করা হয় ★
         নইলে og:image হিসেবে Google-এর নিজের লোগো/ছবি আসতে পারে। */
      const finalUrl = res.url || sourceUrl;
      out.finalUrl = finalUrl;
      const finalHost = (() => { try { return new URL(finalUrl).host; } catch (e) { return ''; } })();
      const isGoogleWrap = /(^|\.)google\.com$/i.test(finalHost) || /(^|\.)googleusercontent\.com$/i.test(finalHost);

      const cands = [];
      ['og:image:secure_url', 'og:image:url', 'og:image'].forEach((p) => {
        const v = metaContent(html, p);
        if (v) cands.push(v);
      });
      const tw = metaContent(html, 'twitter:image') || metaContent(html, 'twitter:image:src');
      if (tw) cands.push(tw);
      const isrc = (html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i) || [])[1];
      if (isrc) cands.push(isrc);
      jsonLdImage(html).forEach((x) => cands.push(x));
      const body = firstBodyImage(html);
      if (body) cands.push(body);

      for (const c of cands) {
        const abs = absolutize(c, finalUrl);
        if (abs && !looksLikeJunkUrl(abs)) out.urls.push(abs);
      }
      /* Google-এর নিজের ছবি বাদ (গুগল নিউজ মোড়ক হলে) */
      if (isGoogleWrap) {
        out.urls = out.urls.filter((u) => !/(^|\.)googleusercontent\.com$/i.test((() => { try { return new URL(u).host; } catch (e) { return ''; } })()));
      }
      if (out.urls.length) return out;
    } catch (e) {
      clearTimeout(t);
      out.blocked = true;
    }
  }
  return out;
}

/* ══ ৪. ছবি নামানো + যাচাই ═══════════════════════════════════════════════ */
const imgCache = new Map();   /* url → {ok, kind, w, h, buf} */

async function downloadImage(url, referer) {
  if (imgCache.has(url)) return imgCache.get(url);
  const result = { ok: false, reason: '', kind: null, w: 0, h: 0, buf: null };

  /* ★ Referer প্রার্থী ★
     হটলিংক-সুরক্ষা থাকলে Referer না মিললে 403 আসে। তাই কেবল সংবাদের
     পাতার Referer নয় — ছবির নিজের ডোমেইনের Referer-ও চেষ্টা করা হয়। */
  const referers = [];
  const pushRef = (u) => { try { const o = new URL(u).origin + '/'; if (!referers.includes(o)) referers.push(o); } catch (e) { /* ignore */ } };
  if (referer) pushRef(referer);
  pushRef(url);

  outer:
  for (const ref of (referers.length ? referers : [''])) {
   for (const prof of FETCH_PROFILES) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), SOURCE_TIMEOUT);
    try {
      const headers = Object.assign({ 'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5' }, prof.headers);
      if (ref) headers['Referer'] = ref;
      const res = await fetch(url, { headers, redirect: 'follow', signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) { result.reason = 'HTTP ' + res.status; continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2500) { result.reason = 'ফাইল খুব ছোট (' + buf.length + 'B)'; continue; }
      const kind = sniffImage(buf);
      if (!kind) { result.reason = 'ছবি নয় (magic bytes মেলেনি)'; continue; }
      if (kind === 'avif' || kind === 'heic') {
        /* Telegram/Facebook AVIF দেখাতে পারে না — কেবল কনভার্ট করার সুযোগ থাকলে */
        if (!canConvert()) { result.reason = kind + ' — কনভার্টার নেই'; continue; }
      }
      const size = imageSize(buf, kind) || { w: 0, h: 0 };
      /* খুব ছোট বা তীব্র অনুপাতের ছবি বাদ */
      if (size.w && size.w < 380) { result.reason = 'প্রস্থ কম (' + size.w + 'px)'; continue; }
      if (size.w && size.h && (size.w / size.h > 4.2 || size.h / size.w > 2.2)) {
        result.reason = 'অনুপাত অস্বাভাবিক'; continue;
      }
      Object.assign(result, { ok: true, kind, w: size.w || 0, h: size.h || 0, buf });
      break outer;
    } catch (e) {
      clearTimeout(t);
      result.reason = e.name === 'AbortError' ? 'টাইমআউট' : e.message;
    }
   }
  }
  imgCache.set(url, result);
  return result;
}

/* sips (macOS) বা ffmpeg থাকলে AVIF/HEIC → JPEG করা যায় */
let _canConvert = null;
function canConvert() {
  if (_canConvert !== null) return _canConvert;
  _canConvert = false;
  for (const bin of ['sips', 'ffmpeg']) {
    try {
      execFileSync('which', [bin], { stdio: 'ignore' });
      _canConvert = true;
      break;
    } catch (e) { /* নেই */ }
  }
  return _canConvert;
}

let _hasSips = null;
function hasSips() {
  if (_hasSips !== null) return _hasSips;
  try { execFileSync('which', ['sips'], { stdio: 'ignore' }); _hasSips = true; } catch (e) { _hasSips = false; }
  return _hasSips;
}

/* ══ ৫. ১২০০x৬৩০ JPEG বানানো ════════════════════════════════════════════
   পদ্ধতি: লম্বা দিক ১৬০০px-এ resample (aspect অটুট) → মাঝখান থেকে
   ১২০০x৬৩০ ক্রপ। ফলে বিষয়বস্তু কাটা পড়লেও বিকৃত হয় না, আর সব কার্ডের
   অনুপাত হুবহু এক → og:image:width/height নিরাপদে ঘোষণা করা যায়। */
function normalizeToJpeg(srcBuf, tmpDir, tag) {
  const inPath = path.join(tmpDir, tag + '.in');
  const outPath = path.join(tmpDir, tag + '.out.jpg');
  fs.writeFileSync(inPath, srcBuf);
  if (hasSips()) {
    try {
      execFileSync('sips', ['-s', 'format', 'jpeg', '-Z', '1600', inPath, '--out', outPath], { stdio: 'ignore' });
      /* ছবিটি যদি ইতিমধ্যেই ১২০০x৬৩০-এর চেয়ে ছোট হয়, sips -c প্যাডিং করবে —
         তাই আগে বড় করি না, শুধু ক্রপ করি। */
      const sz = (() => {
        try {
          const s = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', outPath], { encoding: 'utf8' });
          const w = parseInt((s.match(/pixelWidth:\s*(\d+)/) || [])[1] || '0', 10);
          const h = parseInt((s.match(/pixelHeight:\s*(\d+)/) || [])[1] || '0', 10);
          return { w, h };
        } catch (e) { return null; }
      })();
      if (sz && sz.w >= OG_W && sz.h >= OG_H) {
        execFileSync('sips', ['-c', String(OG_H), String(OG_W), outPath], { stdio: 'ignore' });
      }
      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 3000) {
        return { path: outPath, w: OG_W, h: OG_H, cropped: !!(sz && sz.w >= OG_W && sz.h >= OG_H) };
      }
    } catch (e) { /* ffmpeg-এ চেষ্টা */ }
  }
  /* sips না থাকলে (CI) → মূল ফাইলই রাখা হয়, মাপ আসলটাই ঘোষিত হবে */
  const ext = sniffImage(srcBuf) || 'jpg';
  const rawPath = path.join(tmpDir, tag + '.raw.' + (ext === 'jpeg' ? 'jpg' : ext));
  fs.writeFileSync(rawPath, srcBuf);
  return { path: rawPath, w: 0, h: 0, cropped: false };
}

/* ══ ৬. ফাইলের নাম ও সূত্র-লেবেল ════════════════════════════════════════ */
function fileStem(a) {
  const base = String(a.id || a.slug || a.title || '');
  const ascii = base.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
  const hash = crypto.createHash('sha1').update(String(a.id || a.slug || a.title || Math.random())).digest('hex').slice(0, 10);
  return (ascii ? ascii + '-' : 'news-') + hash;
}

const SOURCE_LABELS = {
  'www.banglatribune.com': 'বাংলা ট্রিবিউন', 'banglatribune': 'বাংলা ট্রিবিউন', 'বাংলা ট্রিবিউন': 'বাংলা ট্রিবিউন',
  'www.daily-bangladesh.com': 'ডেইলি বাংলাদেশ', 'daily-bangladesh.com': 'ডেইলি বাংলাদেশ',
  'dailybangladesh': 'ডেইলি বাংলাদেশ', 'ডেইলি বাংলাদেশ': 'ডেইলি বাংলাদেশ',
  'www.prothomalo.com': 'প্রথম আলো', 'prothomalo': 'প্রথম আলো', 'প্রথম আলো': 'প্রথম আলো',
  '1971.prothomalo.com': 'প্রথম আলো',
  'www.ittefaq.com.bd': 'ইত্তেফাক', 'ittefaq': 'ইত্তেফাক',
  'www.bd-journal.com': 'বাংলাদেশ জার্নাল', 'bdjournal': 'বাংলাদেশ জার্নাল',
  'www.banglaedition.com': 'বাংলা এডিশন', 'বাংলা এডিশন': 'বাংলা এডিশন',
  'www.jugantor.com': 'যুগান্তর', 'jugantor': 'যুগান্তর',
  'somoynews.tv': 'সময় নিউজ', 'somoynews': 'সময় নিউজ',
  'bangla.bdnews24.com': 'বিডিনিউজ২৪', 'bdnews24': 'বিডিনিউজ২৪',
  'www.kishoralo.com': 'কিশোর আলো', 'www.bigganchinta.com': 'বিজ্ঞানচিন্তা',
};

function creditFor(a) {
  const sn = String(a.sourceName || '').trim();
  if (sn && SOURCE_LABELS[sn]) return SOURCE_LABELS[sn];
  if (sn && !/^(govt_notice|govt_jobs|editor)$/i.test(sn)) return sn;
  const host = (() => { try { return new URL(a.sourceUrl || '').host; } catch (e) { return ''; } })();
  if (host && SOURCE_LABELS[host]) return SOURCE_LABELS[host];
  if (host && !/news\.google\.com/i.test(host)) return host.replace(/^www\./, '');
  return 'সংগৃহীত';
}

/* ══ ৭. ফলব্যাক: মূল পত্রিকার news-sitemap থেকে শিরোনাম→ছবি ইনডেক্স ═══════
   কেন দরকার (লাইভ যাচাই, ২০২৬-০৯-২৬):
   সংবাদের ৫৫টি sourceUrl ছিল `news.google.com/rss/articles/…` মোড়কে।
   গুগল এখন HTTP রিডাইরেক্ট বন্ধ করে দিয়েছে — পাতাটি Angular SPA, তাই
   সোর্স URL খুলে og:image তোলা অসম্ভব (পরীক্ষা করে দেখা হয়েছে: HTML-এ
   মূল পত্রিকার কোনো লিংকই নেই)।

   কিন্তু ওই খবরগুলো মূল পত্রিকা থেকেই এসেছে — আর পত্রিকাগুলোর
   news-sitemap-এ প্রতিটি খবরের সাথে `<news:title>` ও `<image:loc>` আছে।
   তাই শিরোনাম মিলিয়ে ছবি নেওয়া হয়।

   ⚠️ ভুল ছবি বসানোর চেয়ে বিভাগীয় কভার ভালো — তাই মিল কঠোর:
      হুবহু (normalize করা) মিল, নইলে Jaccard ≥ ০.৭২ এবং অন্তত ৫টি শব্দ। */
function normTitle(s) {
  let t = String(s || '');
  if (typeof t.normalize === 'function') t = t.normalize('NFC');
  return t
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-zA-Z]+;|&#\d+;/g, ' ')
    .replace(/[^\u0980-\u09FFa-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
function tokenSet(s) { return new Set(normTitle(s).split(' ').filter((w) => w.length > 2)); }
function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function lastNDays(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() - i * 86400000);
    out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  }
  return out;
}

function publisherSitemaps() {
  return [
    { name: 'ডেইলি বাংলাদেশ', kind: 'news', url: 'https://www.daily-bangladesh.com/news-sitemap.xml' },
    { name: 'বাংলা ট্রিবিউন', kind: 'news', url: 'https://www.banglatribune.com/news-sitemap.xml' },
    { name: 'ইত্তেফাক', kind: 'news', url: 'https://www.ittefaq.com.bd/news-sitemap.xml' },
    ...lastNDays(8).map((d) => ({ name: 'প্রথম আলো', kind: 'slug', url: 'https://www.prothomalo.com/sitemap/sitemap-daily-' + d + '.xml' })),
  ];
}

let _index = null;
async function publisherIndex() {
  if (_index) return _index;
  const map = new Map();     /* normTitle → image */
  const fuzzy = [];          /* {tokens, image} */
  for (const sm of publisherSitemaps()) {
    try {
      const r = await fetch(sm.url, {
        headers: Object.assign({ Accept: 'application/xml,text/xml,*/*' }, FETCH_PROFILES[0].headers),
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) { console.log('   ⏭️  ' + sm.name + ' সাইটম্যাপ HTTP ' + r.status + ' — বাদ'); continue; }
      const xml = await r.text();
      const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
      let n = 0;
      for (const b of blocks) {
        const img = (b.match(/<image:loc>([^<]+)<\/image:loc>/i) || [])[1];
        if (!img) continue;
        let title = '';
        if (sm.kind === 'news') title = (b.match(/<news:title>([\s\S]*?)<\/news:title>/i) || [])[1] || '';
        else {
          const loc = (b.match(/<loc>([^<]+)<\/loc>/i) || [])[1] || '';
          const last = loc.split('?')[0].replace(/\/+$/, '').split('/').pop() || '';
          try { title = decodeURIComponent(last).replace(/-/g, ' '); } catch (e) { title = last; }
        }
        const key = normTitle(title);
        if (!key || key.length < 8) continue;
        if (!map.has(key)) map.set(key, absolutize(img, sm.url));
        const tk = tokenSet(title);
        if (tk.size >= 5) fuzzy.push({ tokens: tk, image: absolutize(img, sm.url) });
        n++;
      }
      console.log('   ✅ ' + sm.name + ' — ' + n + 'টি শিরোনাম+ছবি');
    } catch (e) {
      console.log('   ⚠️  ' + sm.name + ' সাইটম্যাপ ব্যর্থ (' + String(e.message).slice(0, 40) + ') — বাদ');
    }
  }
  _index = { map, fuzzy };
  return _index;
}

/** ইনডেক্স থেকে একটি সংবাদের জন্য ছবির URL (না পেলে '') */
function indexImageFor(idx, title) {
  const key = normTitle(title);
  if (idx.map.has(key)) return idx.map.get(key);
  const tk = tokenSet(title);
  if (tk.size < 5) return '';
  let best = 0, bestImg = '';
  for (const e of idx.fuzzy) {
    if (Math.abs(e.tokens.size - tk.size) > 3) continue;
    const sc = jaccard(tk, e.tokens);
    if (sc > best) { best = sc; bestImg = e.image; if (sc === 1) break; }
  }
  return best >= 0.72 ? bestImg : '';
}

/* ══ ৭খ. শেষ অবলম্বন: শিরোনামসহ নিজস্ব ইউনিক OG কার্ড ═════════════════════
   কেন দরকার (লাইভ প্রমাণ, ২০২৬-০৯-২৬):
   কিছু সংবাদের ছবি কোথাও পাওয়া যায় না — যেমন Google News মোড়কে আসা
   banglaedition.com-এর খবর (সাইটটি JS-চালিত, og:image নেই, সাইটম্যাপ খালি)।
   তখন Oracle-এর /og/<slug>.jpg কাজে লাগে, কিন্তু সেটি **প্রতিটি খবরে
   হুবহু একই লাল ব্র্যান্ড পোস্টার** — শিরোনাম ছাপা থাকে না। ব্যবহারকারী ঠিক
   এটাই দেখে অভিযোগ করেছেন: "সব পোস্টে একই ছবি"।

   সমাধান: শিরোনাম বসিয়ে নিজেরাই ১২০০x৬৩০ কার্ড বানানো হয় (SVG → JPEG,
   sips দিয়ে — পরীক্ষা করে দেখা হয়েছে বাংলা যুক্তাক্ষর নিখুঁত রেন্ডার হয়)।
   ফলে ছবি না পাওয়া খবরেও কার্ডটি আলাদা, আর সেটি পাঠককে কী পড়তে হবে
   তাও বলে দেয় — ট্রাফিকের জন্য এটি ব্র্যান্ড-পোস্টারের চেয়ে অনেক ভালো।

   ⚠️ imageIsCover = true রাখা হয়, যাতে পরে আসল ছবি পাওয়া গেলে সেটি
      স্বয়ংক্রিয়ভাবে এই কার্ডকে বদলে দিতে পারে (auto-upgrade)। */
const CATEGORY_HUE = {
  'জাতীয়': 356, 'সারাদেশ': 12, 'রাজনীতি': 339, 'অর্থনীতি': 145,
  'আন্তর্জাতিক': 214, 'খেলা': 96, 'বিনোদন': 285, 'শিক্ষা': 258,
  'চাকরি': 172, 'প্রবাস': 199, 'ধর্ম': 128, 'স্বাস্থ্য': 168,
  'প্রযুক্তি': 230,
};

function svgEscape(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function wrapTitle(title, maxChars, maxLines) {
  const words = String(title || '').replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? cur + ' ' + w : w;
    if (cand.length > maxChars && cur) { lines.push(cur); cur = w; if (lines.length >= maxLines) break; }
    else cur = cand;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (!lines.length) lines.push('বাংলা নিউজ এডিশন');
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length + 3) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, '') + '…';
  }
  return lines;
}

function coverCardSvg(title, category) {
  const hue = CATEGORY_HUE[category] != null ? CATEGORY_HUE[category] : 356;
  const lines = wrapTitle(title, 24, 3);
  const fs = lines.length === 1 ? 72 : (lines.length === 2 ? 62 : 54);
  const startY = lines.length === 1 ? 330 : (lines.length === 2 ? 300 : 268);
  const FONT = "'Bangla Sangam MN','Kohinoor Bangla','Noto Sans Bengali','Nirmala UI',Helvetica,Arial,sans-serif";

  /* ★ প্রতি লাইনের জন্য আলাদা <text> — tspan/dy ব্যবহার করা হয় না ★
     কারণ (পরীক্ষিত, ২০২৬-০৯-২৬): macOS-এর sips SVG রেন্ডারারে tspan-এর
     `dy` মানা হয় না — ফলে দুই লাইনের বাক্য জোড়া লেগে যায় এবং মাঝের
     শব্দ-বিভাজন হারিয়ে যায় ("…থানায় নতুন…" → "…থানায়নতুন…")।
     আলাদা <text> + পরম y = সব রেন্ডারারেই অভিন্ন ফল। */
  const lineEls = lines.map((ln, i) =>
    '<text x="72" y="' + (startY + i * (fs + 14)) + '" font-family="' + FONT +
    '" font-size="' + fs + '" font-weight="700" fill="#ffffff">' + svgEscape(ln) + '</text>').join('');

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">' +
    '<defs>' +
      '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="hsl(' + hue + ',58%,15%)"/>' +
        '<stop offset="1" stop-color="hsl(' + hue + ',68%,7%)"/>' +
      '</linearGradient>' +
    '</defs>' +
    '<rect width="1200" height="630" fill="url(#bg)"/>' +
    '<circle cx="1050" cy="110" r="230" fill="hsl(' + hue + ',70%,26%)" opacity="0.35"/>' +
    '<circle cx="140" cy="560" r="180" fill="hsl(' + hue + ',72%,22%)" opacity="0.30"/>' +
    '<rect x="0" y="0" width="1200" height="9" fill="hsl(' + hue + ',88%,58%)"/>' +
    '<rect x="72" y="62" width="9" height="66" rx="4" fill="hsl(' + hue + ',88%,58%)"/>' +
    '<text x="98" y="88" font-family="' + FONT + '" font-size="30" font-weight="700" fill="#ffffff">BNE</text>' +
    '<text x="98" y="118" font-family="' + FONT + '" font-size="22" fill="#c7d2e0">বাংলা নিউজ এডিশন</text>' +
    '<rect x="72" y="176" width="120" height="4" fill="hsl(' + hue + ',88%,58%)"/>' +
    lineEls +
    '<text x="72" y="560" font-family="' + FONT + '" font-size="24" fill="#9fb0c9">' + svgEscape(category || 'সংবাদ') + '</text>' +
    '<text x="72" y="592" font-family="' + FONT + '" font-size="22" fill="#8fa2bd">bangla-news-edition-bd.netlify.app</text>' +
    '</svg>';
}

/** শিরোনামসহ ইউনিক কার্ড তৈরি (sips না থাকলে null) */
function makeCoverCard(a, tmpDir, stem) {
  if (!hasSips()) return null;
  const svgPath = path.join(tmpDir, stem + '.cover.svg');
  const jpgPath = path.join(tmpDir, stem + '.cover.jpg');
  try {
    fs.writeFileSync(svgPath, coverCardSvg(a.title, a.category));
    execFileSync('sips', ['-s', 'format', 'jpeg', svgPath, '--out', jpgPath], { stdio: 'ignore' });
    if (!fs.existsSync(jpgPath) || fs.statSync(jpgPath).size < 4000) return null;
    const over = path.join(tmpDir, stem + '.cover.final.jpg');
    fs.copyFileSync(jpgPath, over);
    const s = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', over], { encoding: 'utf8' });
    const w = parseInt((s.match(/pixelWidth:\s*(\d+)/) || [])[1] || '0', 10);
    const h = parseInt((s.match(/pixelHeight:\s*(\d+)/) || [])[1] || '0', 10);
    if (w !== OG_W || h !== OG_H) {
      execFileSync('sips', ['-z', String(OG_H), String(OG_W), over], { stdio: 'ignore' });
    }
    return { path: over, w: OG_W, h: OG_H };
  } catch (e) { return null; }
}

/* ══ ৮. মূল প্রবাহ ══════════════════════════════════════════════════════ */
function isOwnLocal(u) {
  const s = String(u || '').trim();
  return s.startsWith('/images/') || s.startsWith('images/') || s.startsWith('/img/');
}

async function mapLimit(items, limit, worker) {
  let idx = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      try { await worker(items[i], i); } catch (e) { /* ব্যক্তিগত ব্যর্থতা থামায় না */ }
    }
  });
  await Promise.all(runners);
}

async function main() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('❌ কনফিগ নেই: ' + CONFIG_FILE);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const news = Array.isArray(cfg.editorNews) ? cfg.editorNews : [];
  if (!news.length) { console.log('ℹ️ কোনো সংবাদ নেই।'); return; }

  console.log('🖼️  সংবাদের আসল ছবি নামিয়ে নিজের স্টোরেজে রাখা শুরু…');
  console.log(`   সংবাদ: ${news.length} | সমান্তরাল: ${CONCURRENCY} | বলপ্রয়োগ: ${FORCE ? 'হ্যাঁ' : 'না'}`);

  /* ── ধাপ ১: কার ছবি দরকার ─────────────────────────────────────────────
     • নিজের স্টোরেজে থাকা ছবি → হাত দেওয়া হয় না
     • সম্পাদকীয় (হাতে লেখা) সংবাদ → কখনো বদলানো হয় না
     • বাকি সব → ছবি সংগ্রহ করতে হবে */
  const todo = news.filter((a) => {
    if (a && a.editorial === true) return false;
    /* ★ cover কার্ড বারবার বানানো হয় না ★
       imageIsCover=true মানে ছবি পাওয়া যায়নি, তাই শিরোনামসহ নিজস্ব কার্ড
       বসানো হয়েছে। ফাইলটি থাকলে আবার আঁকার দরকার নেই — তবে এই আইটেম
       তালিকায় থাকে, যাতে পরে আসল ছবি পাওয়া গেলে সেটি কার্ডটিকে বদলে দেয়
       (স্বয়ংক্রিয় আপগ্রেড)। */
    const fileOk = isOwnLocal(a.image)
      && fs.existsSync(path.join(ROOT, String(a.image).replace(/^\//, '')));
    if (!FORCE && fileOk && !a.imageIsCover) return false;
    /* ★ cover-এর পুনঃচেষ্টা সময়বদ্ধ ★
       যেসব সংবাদের আসল ছবি কোনোদিনই পাওয়া যায় না (যেমন Google News মোড়কে
       আসা JS-চালিত সাইট), সেগুলোর জন্য প্রতি রানে সোর্স পাতা খোলা অর্থহীন
       কাজ। তাই COVER_RETRY_HOURS (ডিফল্ট ১২ ঘণ্টা) পরপর একবার চেষ্টা হয় —
       ততদিনে হয়তো ছবিটি কোথাও প্রকাশিত হয়েছে। নির্ভুলতা অটুট, খরচ কম। */
    if (!FORCE && fileOk && a.imageIsCover) {
      const last = Date.parse(a.imageFetchedAt || 0) || 0;
      if (last && (Date.now() - last) < COVER_RETRY_HOURS * 3600000) return false;
    }
    if (!FORCE && !fileOk && isOwnLocal(a.image) && String(a.image).startsWith('/img/')) return false;
    return true;
  });
  /* --limit থাকলে সবচেয়ে নতুন কয়টি প্রক্রিয়া হবে (দ্রুত পরীক্ষার জন্য) */
  if (LIMIT && todo.length > LIMIT) {
    todo.sort((a, b) => (Date.parse(b.publishedAt || 0) || 0) - (Date.parse(a.publishedAt || 0) || 0));
    todo.length = LIMIT;
    console.log(`   (--limit=${LIMIT} — কেবল সবচেয়ে নতুন ${LIMIT}টি)`);
  }
  console.log(`   ছবি সংগ্রহ করতে হবে: ${todo.length}টি`);
  if (!todo.length) { console.log('✅ সব সংবাদেই নিজের ছবি আছে — কিছু করার নেই।'); return; }

  /* ── ধাপ ২: সোর্স পাতা থেকে প্রার্থী URL সংগ্রহ ──────────────────────── */
  console.log('🔎 ধাপ ২/৩ — মূল সংবাদপত্রের পাতা থেকে ছবির ঠিকানা আনা হচ্ছে…');
  const resolved = [];
  let scanned = 0;
  await mapLimit(todo, CONCURRENCY, async (a) => {
    const r = await candidatesFromSource(a.sourceUrl || a.source_url || a.link || '');
    resolved.push({ a, urls: r.urls, finalUrl: r.finalUrl, blocked: r.blocked });
    scanned++;
    if (scanned % 25 === 0) console.log(`   … ${scanned}/${todo.length} পাতা দেখা হয়েছে`);
  });
  const gotUrl = resolved.filter((r) => r.urls.length).length;
  console.log(`   ✅ ${gotUrl}/${todo.length} সংবাদের ছবির ঠিকানা পাওয়া গেছে`);

  /* ── ধাপ ২খ: শিরোনাম→ছবি ইনডেক্স (Google News মোড়ক ও ব্লকড পাতার জন্য) ──
     সতর্ক প্রোব: প্রথম সাইটম্যাপটিই না পেলে বাকিগুলো চেষ্টা করা হয় না
     (CI-তে ডেটাসেন্টার IP থেকে সবই ব্লক হয় — অকারণে সময় নষ্ট নয়)। */
  let idx = { map: new Map(), fuzzy: [] };
  if (!args.includes('--no-index') && gotUrl < todo.length) {
    console.log('🗺️  ধাপ ২খ — মূল পত্রিকার সাইটম্যাপ থেকে শিরোনাম→ছবি ইনডেক্স…');
    const probeUrl = publisherSitemaps()[0].url;
    let reachable = false;
    try {
      const pr = await fetch(probeUrl, {
        headers: Object.assign({ Accept: 'application/xml,text/xml,*/*' }, FETCH_PROFILES[0].headers),
        signal: AbortSignal.timeout(25000),
      });
      reachable = pr.ok;
    } catch (e) { reachable = false; }
    if (reachable) idx = await publisherIndex();
    else console.log('   ⏭️  সাইটম্যাপে পৌঁছানো যায়নি (নেটওয়ার্ক ব্লক) — ইনডেক্স বাদ');
    if (idx.map.size) console.log('   📦 ইনডেক্সে শিরোনাম: ' + idx.map.size + 'টি');
  }

  /* ── ধাপ ৩: একই ছবি অনেক খবরে এলে তা "সাইট-ডিফল্ট" — বাদ দেওয়া হয় ────
     কেন: কিছু সাইট og:image-এ নিজের সাইট-লোগো/শেয়ার-কার্ড দেয়। সেটি সব
     খবরে বসালে আবার সেই একই ছবির সমস্যা ফিরে আসত। ৩টির বেশি খবরে একই
     URL এলে সেটি বাদ দিয়ে পরের প্রার্থী নেওয়া হয়। */
  const freq = new Map();
  resolved.forEach((r) => r.urls.forEach((u, i) => { if (i === 0) freq.set(u, (freq.get(u) || 0) + 1); }));
  const DEFAULT_LIKE = 3;

  console.log('⬇️  ধাপ ৩/৩ — ছবি নামানো, যাচাই ও ১২০০x৬৩০ করার কাজ চলছে…');
  const tmpRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'bne-img-'));

  let saved = 0, reused = 0, failed = 0, fromLater = 0, coverMade = 0, keptCover = 0, upgradedCover = 0;
  const failures = [];
  const done = new Set();

  await mapLimit(resolved, CONCURRENCY, async (r) => {
    const a = r.a;
    const cands = r.urls.filter((u) => !(freq.get(u) > DEFAULT_LIKE));
    /* ★ ইনডেক্স ফলব্যাক ★ — Google News মোড়ক বা ব্লকড পাতার জন্য।
       অগ্রাধিকার কম, তাই তালিকার শেষে যোগ করা হয় (কিন্তু ডাউনলোড
       ব্যর্থ হলে এটিই শেষ ভরসা)। */
    if (idx.map.size) {
      const fromIdx = indexImageFor(idx, a.title);
      if (fromIdx && !cands.includes(fromIdx)) cands.push(fromIdx);
    }
    /* ★ শেষ অবলম্বন: শিরোনামসহ নিজস্ব ইউনিক কার্ড ★
       আসল ছবি কোথাও না পেলে (বা নামাতে ব্যর্থ হলে) এটিই বসে — ফলে
       কোনো পোস্টই আর হুবহু একই ব্র্যান্ড-পোস্টার দেখায় না। */
    const stemForCover = fileStem(a);
    const coverFallback = (why) => {
      const coverPath = path.join(OUT_DIR, stemForCover + '-cover.jpg');
      const coverUrl = OUT_URL_PREFIX + stemForCover + '-cover.jpg';
      /* কার্ডটি আগেই আছে → নতুন করে আঁকা হয় না */
      if (fs.existsSync(coverPath) && a.imageIsCover) { keptCover++; return; }
      const made = makeCoverCard(a, tmpRoot, stemForCover);
      if (!made) { failed++; failures.push({ t: a.title, why }); return; }
      try { fs.copyFileSync(made.path, coverPath); } catch (e) { failed++; failures.push({ t: a.title, why: 'কার্ড সেভ ব্যর্থ' }); return; }
      a.image = coverUrl;
      a.ogImage = coverUrl;
      a.ogImageWidth = OG_W;
      a.ogImageHeight = OG_H;
      a.imageIsCover = true;              /* পরে আসল ছবি পেলে আপগ্রেড হবে */
      delete a.imageCredit;               /* নিজের আঁকা কার্ড — সূত্র লাগে না */
      a.imageFetchedAt = new Date().toISOString();
      coverMade++;
    };

    if (!cands.length) { coverFallback('ছবির ঠিকানা নেই — শিরোনাম-কার্ড বসানো হলো'); return; }

    for (let i = 0; i < cands.length; i++) {
      const url = cands[i];
      const dl = await downloadImage(url, r.finalUrl);
      if (!dl.ok) {
        if (i === cands.length - 1) coverFallback(dl.reason || 'ডাউনলোড ব্যর্থ');
        continue;
      }
      if (i > 0) fromLater++;
      const stem = fileStem(a);
      const norm = normalizeToJpeg(dl.buf, tmpRoot, stem);
      const isCropped = norm.w === OG_W && norm.h === OG_H && norm.cropped;
      const ext = isCropped ? 'jpg' : norm.path.split('.').pop();
      const fname = stem + '.' + ext;
      const dest = path.join(OUT_DIR, fname);
      try { fs.copyFileSync(norm.path, dest); } catch (e) { failed++; failures.push({ t: a.title, why: 'সেভ ব্যর্থ' }); return; }

      a.image = OUT_URL_PREFIX + fname;
      a.ogImage = a.image;
      if (isCropped) {
        a.ogImageWidth = OG_W;
        a.ogImageHeight = OG_H;
      } else {
        if (norm.w) a.ogImageWidth = norm.w;
        if (norm.h) a.ogImageHeight = norm.h;
        if (!norm.w && dl.w) { a.ogImageWidth = dl.w; a.ogImageHeight = dl.h; }
      }
      a.imageCredit = creditFor(a);
      a.imageSourceUrl = url;
      a.imageFetchedAt = new Date().toISOString();
      /* আসল ছবি পাওয়া গেছে → আগের শিরোনাম-কার্ডের চিহ্ন মুছে ফেলা হয়,
         নইলে পরের রানেও এটিকে "ছবি নেই" ভেবে অকারণে খোঁজ চলত। পুরনো
         কভার-ফাইলটি --prune ছাড়া পড়ে থাকে (ক্ষতি নেই)। */
      if (a.imageIsCover) { delete a.imageIsCover; upgradedCover++; }
      saved++; done.add(fname);
      return;
    }
  });

  /* ── অব্যবহৃত ফাইল মোছা (ঐচ্ছিক) ─────────────────────────────────────── */
  let pruned = 0;
  if (PRUNE) {
    const keep = new Set(news.map((a) => String(a.image || '').replace(OUT_URL_PREFIX, '')).filter(Boolean));
    for (const f of fs.readdirSync(OUT_DIR)) {
      if (!keep.has(f)) { try { fs.unlinkSync(path.join(OUT_DIR, f)); pruned++; } catch (e) { /* ignore */ } }
    }
  }
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) { /* ignore */ }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n');

  /* ── রিপোর্ট ─────────────────────────────────────────────────────────── */
  const still = news.filter((a) => !String(a.image || '').trim()).length;
  const hostCount = new Map();
  news.forEach((a) => {
    if (a.imageSourceUrl) {
      const h = (() => { try { return new URL(a.imageSourceUrl).host; } catch (e) { return '?'; } })();
      hostCount.set(h, (hostCount.get(h) || 0) + 1);
    }
  });
  console.log('');
  console.log('✅ সম্পন্ন — ' + CONFIG_FILE);
  console.log(`   • নতুন নামানো ও বসানো      : ${saved}টি`);
  console.log(`   • দ্বিতীয়/তৃতীয় প্রার্থী থেকে: ${fromLater}টি`);
  console.log(`   • শিরোনাম-কার্ড তৈরি        : ${coverMade}টি`);
  if (keptCover) console.log(`   • আগের শিরোনাম-কার্ড রাখা হয়েছে: ${keptCover}টি`);
  if (upgradedCover) console.log(`   • কার্ড → আসল ছবি আপগ্রেড   : ${upgradedCover}টি`);
  console.log(`   • ব্যর্থ (কার্ডও হয়নি)      : ${failed}টি`);
  if (pruned) console.log(`   • অব্যবহৃত ফাইল মোছা হয়েছে  : ${pruned}টি`);
  console.log(`   • এখনো ছবি ছাড়া            : ${still}টি`);
  if (hostCount.size) {
    console.log('   • ছবির উৎস: ' + Array.from(hostCount.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([h, n]) => `${h}=${n}`).join(', '));
  }
  if (failures.length) {
    console.log(`   • ব্যর্থতার ধরন:`);
    const kinds = new Map();
    failures.forEach((f) => kinds.set(f.why, (kinds.get(f.why) || 0) + 1));
    Array.from(kinds.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .forEach(([k, n]) => console.log(`       – ${k}: ${n}টি`));
    console.log('       (উদাহরণ: ' + failures.slice(0, 3).map((f) => String(f.t).slice(0, 34)).join(' | ') + ')');
  }
}

main().catch((e) => { console.error('❌ ব্যর্থ:', e && e.stack || e); process.exit(1); });
