'use strict';
/**
 * BNE — /api/version  (P0-3 সম্পূরক ফিক্স)
 * ═══════════════════════════════════════════════════════════════════════════
 * watchConfigVersion() প্রতি ৬০ সেকেন্ডে এই এন্ডপয়েন্টে হালকা (কয়েক বাইট)
 * অনুরোধ পাঠায় এবং ভার্সন বদলালে সাইট রিফ্রেশ করে — অর্থাৎ সম্পাদকীয়
 * প্যানেল থেকে নতুন সংবাদ প্রকাশের সাথে সাথেই কার্ড যোগ হয়, পেজ রিলোড ছাড়াই।
 *
 * আগে এই এন্ডপয়েন্টও ৪০৪ দিত (কোনো version.js ফাংশন ছিল না), তাই লাইভ
 * আপডেট কখনো কাজ করত না। এখন নিজের origin-এ — কোনো বাইরের নির্ভরতা নেই।
 * ═══════════════════════════════════════════════════════════════════════════
 */

let BUNDLED = null;
try { BUNDLED = require('./_data.json'); } catch (e) { BUNDLED = null; }

exports.handler = async () => {
  const version = (BUNDLED && BUNDLED.version) || 0;
  const updatedAt = (BUNDLED && BUNDLED.updatedAt) || '';
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      /* ভার্সন সবসময় টাটকা হতে হবে — ক্যাশ করা চলবে না */
      'Cache-Control': 'no-store',
      'Netlify-CDN-Cache-Control': 'no-store',
    },
    body: JSON.stringify({ version, updatedAt }),
  };
};
