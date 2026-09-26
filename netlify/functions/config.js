'use strict';
/**
 * BNE — /api/config  (P0-3 সম্পূরক ফিক্স)
 * ═══════════════════════════════════════════════════════════════════════════
 * সমস্যা (লাইভ সাইটে সরাসরি মাপা): GET /api/config → 404।
 * Netlify-তে /api/* → /.netlify/functions/:splat ম্যাপ করা, কিন্তু `config`
 * নামের কোনো ফাংশন ছিল না। ফলে app.js-এর fetchLiveConfig() সবসময় ব্যর্থ হত
 * এবং একমাত্র সোর্স হয়ে দাঁড়াত raw.githubusercontent-এর ২.৩MB ফাইল।

 * সমাধান: এই ফাংশনটি বিল্ডে-বান্ডল করা `_data.json` (tools/sync-function-data.js
 * তৈরি করে) থেকে সম্পূর্ণ কনফিগ দেয় — নিজের origin-এ, কোনো বাইরের নির্ভরতা ছাড়া।
 *
 *   GET /api/config   → { version, updatedAt, settings, ads, editorNews[] }
 *
 * ক্যাশ নীতি: ভিজিটরের ব্রাউজারে ৬০s (নতুন সংবাদ প্রায় সাথে সাথেই আসে),
 * Netlify CDN-এ ৩০০s stale-while-revalidate — অর্থাৎ ৪৯৪টি সংবাদসহ বড়
 * পেলোড কখনো প্রতিটি ভিজিটে GitHub/বাইরে থেকে টানা হয় না।
 * ═══════════════════════════════════════════════════════════════════════════
 */

let BUNDLED = null;
try { BUNDLED = require('./_data.json'); } catch (e) { BUNDLED = null; }

function payload() {
  if (!BUNDLED) return { version: 0, settings: {}, ads: [], editorNews: [], ogSlugs: [] };
  return BUNDLED;
}

exports.handler = async () => {
  const data = payload();
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=240',
      'Netlify-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=1800',
      'X-BNE-Source': 'bundled',
    },
    body: JSON.stringify(data),
  };
};
