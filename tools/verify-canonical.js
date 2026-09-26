#!/usr/bin/env node
/**
 * BNE — ক্যানোনিক্যাল-পাথ প্রিহিলাইট গার্ড
 * ═══════════════════════════════════════════════════════════════════════════
 * কেন এই ফাইল:
 *   এই ম্যাকবুকের ভেতরে বাংলা নিউজ এডিশনের **৫টি পুরনো কপি** ছড়িয়ে আছে
 *   (AccioWork/news-portal-BNE/…, BNE Project/bne-pivot/_staging, ব্যাকআপ
 *   স্ন্যাপশট ইত্যাদি)। ভিন্ন সময়ে ভিন্ন এজেন্ট সেগুলো তৈরি করেছে।
 *
 *   বিপদ: কেউ যদি ভুল করে পুরনো কপি থেকে বিল্ড বা ডিপ্লয় চালায়, তাহলে
 *   লাইভ সাইট মুহূর্তেই আগের (ভাঙা) অবস্থায় ফিরে যাবে — সাদা স্ক্রিন,
 *   পুনরাবৃত্ত ডিফল্ট ছবি, ডুপ্লিকেট বিজ্ঞাপন, ভুল canonical।
 *
 *   এই স্ক্রিপ্ট তাই ডিপ্লয়ের আগে দুইটি জিনিস যাচাই করে:
 *     ১) আমরা কি সত্যিই ক্যানোনিক্যাল পাথে আছি?
 *     ২) ক্যানোনিক্যাল-বিরোধী চিহ্ন (stale copy marker) আছে কি?
 *   যেকোনোটি ব্যর্থ হলে প্রসেস ভিন্ন exit code দিয়ে থেমে যায় — অর্থাৎ
 *   CI/স্ক্রিপ্টে যুক্ত করলে ভুল কপি থেকে ডিপ্লয় আর কখনো সম্ভব নয়।
 *
 * ব্যবহার:
 *   node tools/verify-canonical.js          # যাচাই, ব্যর্থ হলে exit 1
 *   node tools/verify-canonical.js --soft   # শুধু সতর্কবার্তা, exit 0
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SOFT = process.argv.indexOf('--soft') !== -1;

/* ★ ROOT অবশ্যই process.cwd() — __dirname নয় ★
   কারণ ডিপ্লয় হয় *যে ফোল্ডার থেকে কমান্ড চালানো হচ্ছে* সেখান থেকেই।
   __dirname ব্যবহার করলে স্ক্রিপ্টের নিজের অবস্থান দেখত, আর ভুল কপি থেকে
   চালালেও "ঠিক আছে" বলে চলে যেত (প্রমাণিত ভুল-নিরাপত্তা)। */
const ROOT = fs.realpathSync(process.cwd());

/* ★ একমাত্র অনুমোদিত পাথ ★ — অন্যত্র সরালে এখানে বদলাতে হবে */
const CANONICAL = '/Users/adint./AccioWork/bangla-news-edition';

/* পুরনো কপি চেনার চিহ্ন */
const STALE_MARKERS = [
  '⛔-পুরনো-কপি-এখানে-কাজ-করবেন-না.md',
  'STALE-COPY-DO-NOT-DEPLOY.md',
];

/* ⚠️ কমেন্ট-সচেতন হওয়া জরুরি:
   নিয়মের ব্যাখ্যা নিজেই কমেন্টে লেখা থাকে (যেমন index.html-এ "আগে
   href=\"style.css\" ছিল"), আর সেটি স্ক্যান করলে ভুল-ধরা (false positive)
   আসে। তাই ফাইল পড়ার পর কমেন্ট সরিয়ে নিয়ে তারপর নিয়ম মেলানো হয়।
   netlify.toml-এর ক্ষেত্রে nip.io/og প্রক্সি ইচ্ছাকৃত (সার্ভার-সাইড),
   তাই সেই নিয়ম কেবল ব্যবহারকারী-মুখী ফাইলে প্রয়োগ করা হয়। */
function stripComments(text, kind) {
  let t = text;
  if (kind === 'html') {
    t = t.replace(/<!--[\s\S]*?-->/g, ' ');
    t = t.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => m); /* স্ক্রিপ্ট কোড রাখি */
  }
  /* JS/TOML/JSON — ব্লক ও লাইন কমেন্ট */
  t = t.replace(/\/\*[\s\S]*?\*\//g, ' ');
  t = t.replace(/^\s*[#;].*$/gm, ' ');      /* TOML/robots কমেন্ট */
  t = t.replace(/(^|[^:"'\\])\/\/[^\n]*/g, '$1'); /* JS লাইন কমেন্ট */
  return t;
}

/* ব্যবহারকারী-মুখী ও ডিপ্লয়-গুরুত্বপূর্ণ সব ফাইল */
const FORBIDDEN_IN_FILES = [
  {
    re: /raw\.githubusercontent\.com\/[^\s"']*bne-config\.json/i,
    label: 'GitHub raw কনফিগ (P0-3 লঙ্ঘন)',
    files: ['index.html', 'app.js', 'core.js', 'site-config.js'],
  },
  {
    re: /https?:\/\/bangla-news-edition\.netlify\.app/i,
    label: 'পুরনো হোস্ট (-bd ছাড়া) — P1-1 লঙ্ঘন',
    files: ['index.html', 'app.js', 'core.js', 'site-config.js', 'robots.txt', 'data/editorial-news.json'],
  },
  {
    re: /nip\.io\/(og|img)/i,
    label: 'কাঁচা IP হোস্টে ব্যবহারকারী-মুখী ছবি/কার্ড পাথ (P1-2 লঙ্ঘন)',
    files: ['index.html', 'app.js', 'core.js', 'site-config.js', 'data/editorial-news.json'],
  },
  {
    re: /(?:href|src)="(?!\/|https?:|data:|#|mailto:|tel:)[A-Za-z0-9_.\/-]+\.(?:css|js|png|jpg|webp|webmanifest)"/i,
    label: 'relative অ্যাসেট পাথ (P0-1 লঙ্ঘন)',
    files: ['index.html', 'site-config.js'],
  },
];

const CHECK_FILES = [
  'index.html',
  'app.js',
  'core.js',
  'site-config.js',
  'robots.txt',
  'netlify.toml',
  'data/editorial-news.json',
];

const problems = [];
const notes = [];

/* ── ১. ক্যানোনিক্যাল পাথ ─────────────────────────────────────────── */
let realRoot = ROOT;
try { realRoot = fs.realpathSync(ROOT); } catch (e) { /* যেমন আছে */ }

/* ★ CI-সচেতন ★
   GitHub Actions-এ চেকআউট হয় /home/runner/work/<repo>/<repo>-এ — অর্থাৎ
   Mac-এর ক্যানোনিক্যাল পাথের সাথে মেলানো অসম্ভব। поэтому CI-তে কঠোর পাথ-
   যাচাই বাদ দেওয়া হয়, কিন্তু ফাইল-স্তরের নিষিদ্ধ-প্যাটার্ন যাচাই তখনও চলে
   (সেটিই আসল সুরক্ষা)। লোকাল মেশিনে পাথ-যাচাই আগের মতোই কঠোর। */
const IS_CI = !!(process.env.CI || process.env.GITHUB_ACTIONS ||
                 /^\/(home|github)\/runner\//.test(realRoot));

if (IS_CI) {
  notes.push('CI পরিবেশ শনাক্ত — পাথ-যাচাই বাদ (ফাইল-যাচাই চালু) · ' + realRoot);
} else if (realRoot !== CANONICAL) {
  problems.push(
    'ভুল কপি থেকে ডিপ্লয়ের চেষ্টা!\n' +
    '      এখনকার পাথ : ' + realRoot + '\n' +
    '      ক্যানোনিক্যাল: ' + CANONICAL
  );
} else {
  notes.push('ক্যানোনিক্যাল পাথ ঠিক আছে ✔');
}

/* ── ২. পুরনো-কপি চিহ্ন ───────────────────────────────────────────── */
STALE_MARKERS.forEach((m) => {
  const p = path.join(ROOT, m);
  if (fs.existsSync(p)) {
    problems.push('এই ফোল্ডারে পুরনো-কপি চিহ্ন পাওয়া গেছে: ' + m);
  }
});

/* ── ৩. ফাইল-স্তরের নিষিদ্ধ প্যাটার্ন ──────────────────────────────── */
CHECK_FILES.forEach((rel) => {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return;
  let raw;
  try { raw = fs.readFileSync(full, 'utf8'); } catch (e) { return; }

  const kind = /\.html$/.test(rel) ? 'html' : (/\.toml$/.test(rel) ? 'toml' : 'js');
  const text = stripComments(raw, kind);

  FORBIDDEN_IN_FILES.forEach((rule) => {
    /* netlify.toml-এর /og প্রক্সি ইচ্ছাকৃত ব্যতিক্রম */
    if (rel === 'netlify.toml' && rule.label.indexOf('কাঁচা IP') !== -1) return;
    if (rule.files && rule.files.indexOf(rel) === -1) return;

    const m = text.match(rule.re);
    if (!m) return;
    problems.push(rel + ' → ' + rule.label + '  ::  ' + String(m[0]).slice(0, 90));
  });
});

/* ── রিপোর্ট ──────────────────────────────────────────────────────── */
console.log('════════ BNE ক্যানোনিক্যাল যাচাই ════════');
notes.forEach((n) => console.log('  ✔ ' + n));

if (problems.length) {
  console.log('  ✖ সমস্যা: ' + problems.length);
  problems.forEach((p) => console.log('     • ' + p));
  console.log('═════════════════════════════════════════');
  if (SOFT) {
    console.log('(--soft মোড — শুধু সতর্কবার্তা, থামা হলো না)');
    process.exit(0);
  }
  console.log('ডিপ্লয় বাতিল। ক্যানোনিক্যাল কপি ব্যবহার করুন:');
  console.log('  ' + CANONICAL);
  process.exit(1);
}

console.log('  ✔ কোনো লঙ্ঘন নেই — ডিপ্লয়ের জন্য প্রস্তুত');
console.log('═════════════════════════════════════════');
process.exit(0);
