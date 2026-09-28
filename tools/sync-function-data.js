#!/usr/bin/env node
'use strict';
/**
 * BNE — data/bne-config.json → netlify/functions/_data.json
 * ════════════════════════════════════════════════════════════════════
 * কেন দরকার: Netlify Function নিঃসঙ্গ প্রক্রিয়া — সে ডিপ্লয়ে বান্ডল করা
 * ফাইলই পড়তে পারে। তাই OG ফাংশনকে বান্ডল করা একটা কপি দিতে হয়, নইলে
 * প্রতিটি ক্রলার হিটে নেটওয়ার্ক কল লাগবে (ধীর ও ভঙ্গুর)।
 *
 * ⚠️ হাতে চালাতে হবে না — netlify.toml এর build.command এটিকে
 *    স্বয়ংক্রিয়ভাবে চালায়, তাই কখনো ডেটা বেসামঞ্জস্য হবে না।
 *
 * ব্যবহার:  node tools/sync-function-data.js
 * ════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'bne-config.json');
const OUT = path.join(ROOT, 'netlify', 'functions', '_data.json');
const OG_DIR = path.join(ROOT, 'og');


/* ══ ছবির পাথ: রেপোতে থাকলে নিজের ফোল্ডার, নইলে প্রক্সি ══════════════════
   কেন (২০২৬-০৯-২৭-এ ধরা পড়া বাগ):
     সাইটের ক্লায়েন্ট কোড আগে `/img/<file>` কে অন্ধভাবে `/images/<file>`
     বানিয়ে দিত। সেটি তখন ঠিক ছিল, যখন সব ছবি রেপোর `images/`-এ থাকত।
     কিন্তু এখন সংবাদের আসল ছবি থাকে Oracle-এর স্টোরেজে এবং লাইভ পাথ হয়
     `/img/<id>-1200x630.jpg` — যা netlify.toml-এর `/img/*` প্রক্সি দিয়ে
     আমাদের নিজের ডোমেইন থেকেই সার্ভ হয়। অন্ধ রূপান্তরের ফলে প্রতিটি ছবি
     ৪০৪ হয়ে হারিয়ে যেত — কার্ড ফাঁকা, সংবাদ পাতার হিরো ছবি নেই।

   সমাধান: সিদ্ধান্ত একবারই, বিল্ডের সময় — ফাইল সিস্টেম দেখে। ফলে ক্লায়েন্টে
   আর কোনো অনুমান করতে হয় না (core.js-ও এখন পাথ বদলায় না)। */
function localizeImage(p) {
  const raw = String(p == null ? '' : p).trim();
  if (!raw || /^https?:\/\//i.test(raw) || /^data:/i.test(raw)) return raw;
  const rel = raw.replace(/^\.?\//, '');
  if (rel.indexOf('img/') === 0) {
    const file = rel.slice(4);
    let onDisk = false;
    try { onDisk = fs.existsSync(path.join(ROOT_DIR, 'images', decodeURIComponent(file))); } catch (e) { onDisk = false; }
    return onDisk ? 'images/' + file : 'img/' + file;
  }
  return rel;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`❌ সোর্স কনফিগ নেই: ${SRC}`);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  } catch (e) {
    console.error(`❌ data/bne-config.json পড়া গেল না: ${e.message}`);
    process.exit(1);
  }

  /* কোন কোন slug-এর জন্য সত্যিকারের ১২০০x৬৩০ OG ছবি আছে — কেবল সেগুলোর
     জন্য width/height ঘোষণা করা হবে। বাকিদের জন্য মাপ ঘোষণা করা হবে না
     (মিথ্যা ঘোষণা = যে বাগটি আমরা ঠিক করছি)। */
  let ogSlugs = [];
  try {
    if (fs.existsSync(OG_DIR)) {
      ogSlugs = fs.readdirSync(OG_DIR)
        .filter((f) => /\.jpe?g$/i.test(f))
        .map((f) => f.replace(/\.jpe?g$/i, ''));
    }
  } catch (e) { /* og ফোল্ডার না থাকলে খালি — সমস্যা নয় */ }

  const articles = (config.editorNews || []).map((a) => ({
    id: a.id,
    slug: a.slug || a.id,
    title: a.title,
    summary: a.summary || '',
    body: a.body || '',
    category: a.category || 'জাতীয়',
    tags: Array.isArray(a.tags) ? a.tags : [],
    image: localizeImage(a.image),
    og_image: a.og_image || a.ogImage || '',
    /* ★ ছবির সূত্র ও মাপ ★
       sourceUrl মোড়ক (Google News) থেকে নামানো ছবি হলেও মূল সূত্রের
       নাম রাখা হয়, যাতে পাতায় "ছবি: প্রথম আলো" দেখানো যায় এবং
       og:image:width/height মিথ্যা না হয়। */
    /* imageIsCover = ছবিটি আমরা নিজেরাই আঁকা শিরোনাম-কার্ড (মূল সূত্রের
       ছবি কোথাও পাওয়া যায়নি)। তখন সূত্র দেখানোর কিছু নেই — কার্ডটি আমাদের। */
    /* ★ editorial ফ্ল্যাগ বান্ডলে রাখা (২০২৬-০৯-২৯) ★
       কেন: /api/editorial-এর শেষ-ভরসা স্তর (নেটওয়ার্ক সম্পূর্ণ ব্যর্থ হলে)
       বিল্ড-বান্ডল থেকে কেবল `editorial: true` সংবাদগুলো বেছে নেয়। কিন্তু
       এই ম্যাপিংয়ে ফ্ল্যাগটি ছিল না — ফলে ওই স্তরটি শূন্য তালিকা দিত
       (যাচাই করে প্রমাণিত: সম্পাদকীয় ১টির জায়গায় ০)। এখন বান্ডলে থাকবে
       → তিন স্তরের শেষটিও সঠিক উত্তর দেয়। */
    editorial: a.editorial === true,
    imageCredit: a.imageIsCover ? '' : (a.imageCredit || a.sourceName || 'সংগৃহীত'),
    imageSourceUrl: a.imageSourceUrl || '',
    ogImageWidth: a.ogImageWidth || 0,
    ogImageHeight: a.ogImageHeight || 0,
    author: a.author || 'ডেস্ক',
    published_at: a.publishedAt || a.published_at || config.updatedAt || new Date().toISOString(),
    updated_at: a.updatedAt || config.updatedAt || new Date().toISOString(),
  }));

  const payload = {
    generatedAt: new Date().toISOString(),
    version: config.version || 1,
    updatedAt: config.updatedAt || new Date().toISOString(),
    settings: config.settings || {},
    editorNews: articles,
    ogSlugs,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`✅ ${path.relative(ROOT, OUT)} লেখা হলো`);
  console.log(`   সংবাদ: ${articles.length}টি`);
  console.log(`   ১২০০x৬৩০ OG ছবি: ${ogSlugs.length}টি ${ogSlugs.length ? '→ ' + ogSlugs.join(', ') : ''}`);
  if (articles.length && !ogSlugs.length) {
    console.warn('   ⚠️ কোনো OG ছবি নেই — ফাংশন মাপ ঘোষণা করবে না, কিন্তু কাজ করবে।');
  }
}

main();
