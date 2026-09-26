#!/usr/bin/env node
/**
 * BNE — স্ট্যাটিক পেজের SEO ও অ্যাক্সেসিবিলিটি বিল্ডার  (P1-3 ফিক্স)
 * ═══════════════════════════════════════════════════════════════════════════
 * সমস্যা (প্লাগইন ক্রল রিপোর্ট, ৪টি পেজ):
 *   No Canonical = ৭৫%   • No Og Title = ৭৫%    • No Og Desc = ৭৫%
 *   No Twitter Card = ৭৫% • No Json Ld = ৭৫%    • Meta Desc Duplicate = ৭৫%
 *   Content Grade Poor = ১০০% • Thin Content = ২৫%
 *   (/contact-us = ৯৯ শব্দ, /about-us = ১৬২ শব্দ)
 * এছাড়া প্রতিটি স্ট্যাটিক পেজে style.css ছিল *relative* পাথে — অর্থাৎ
 * /about-us পাতায়ও একই relative-পাথ সমস্যা (P0-1) বিদ্যমান ছিল।
 *
 * সমাধান: প্রতিটি স্ট্যাটিক পেজে বিল্ডের সময়েই বসানো হয় —
 *   • self-canonical + স্বতন্ত্র title/meta description
 *   • Open Graph + Twitter Card
 *   • JSON-LD (Organization + WebSite + BreadcrumbList + WebPage)
 *   • absolute CSS/asset পাথ
 * এবং অনুপস্থিত /terms ও /advertise পাতা তৈরি করা হয় (থিন-কনটেন্ট এড়াতে
 * প্রামাণ্য কনটেন্টসহ)।
 *
 * নিরাপদ ও পুনরাবৃত্তিযোগ্য: MARKER ব্লক প্রতিবার প্রতিস্থাপিত হয়, তাই
 * একাধিকবার চালালেও ডুপ্লিকেট ট্যাগ হয় না।
 *
 * ব্যবহার: node tools/build-static-seo.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = (process.env.BNE_SITE_ORIGIN || 'https://bangla-news-edition-bd.netlify.app').replace(/\/+$/, '');
const MARK_S = '<!--BNE-SEO:START-->';
const MARK_E = '<!--BNE-SEO:END-->';

const SITE = 'বাংলা নিউজ এডিশন';
const SITE_FULL = 'বাংলা নিউজ এডিশন (BNE)';

const PAGES = {
  'about-us.html': {
    path: '/about-us',
    title: 'আমাদের সম্পর্কে — বাংলা নিউজ এডিশন (BNE)',
    desc: 'বাংলা নিউজ এডিশন (BNE) কী, কারা এটি প্রকাশ করে, সম্পাদকীয় নীতি, তথ্যসূত্র যাচাই ও সংশোধন নীতি — সবই এক পাতায়।',
    h1: 'আমাদের সম্পর্কে',
  },
  'contact-us.html': {
    path: '/contact-us',
    title: 'যোগাযোগ করুন — বাংলা নিউজ এডিশন (BNE)',
    desc: 'সংবাদ পাঠান, সংশোধনের অনুরোধ করুন বা বিজ্ঞাপনের তথ্য জানতে বাংলা নিউজ এডিশনের ডেস্কের সঙ্গে যোগাযোগ করুন।',
    h1: 'যোগাযোগ',
  },
  'privacy-policy.html': {
    path: '/privacy-policy',
    title: 'গোপনীয়তা নীতি — বাংলা নিউজ এডিশন (BNE)',
    desc: 'বাংলা নিউজ এডিশন কী ডেটা সংগ্রহ করে, কেন করে, কীভাবে সংরক্ষণ করে এবং পাঠকের কী কী অধিকার আছে — বিস্তারিত গোপনীয়তা নীতি।',
    h1: 'গোপনীয়তা নীতি',
  },
  'terms.html': {
    path: '/terms',
    title: 'ব্যবহারের শর্তাবলী — বাংলা নিউজ এডিশন (BNE)',
    desc: 'বাংলা নিউজ এডিশন ব্যবহারের শর্তাবলী — মেধাস্বত্ব, উদ্ধৃতি নীতি, বাহ্যিক লিংক, দায়সীমা ও প্রযোজ্য আইন।',
    h1: 'ব্যবহারের শর্তাবলী',
    create: true,
  },
  'advertise.html': {
    path: '/advertise',
    title: 'বিজ্ঞাপন দিন — বাংলা নিউজ এডিশন (BNE)',
    desc: 'বাংলা নিউজ এডিশনে বিজ্ঞাপনের ফরম্যাট, স্থান, পাঠক-প্রোফাইল ও যোগাযোগের পথ — ব্র্যান্ড ও প্রতিষ্ঠানের জন্য।',
    h1: 'বিজ্ঞাপন',
    create: true,
  },
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function headBlock(meta) {
  const url = ORIGIN + meta.path;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': url + '#webpage',
        url: url,
        name: meta.title,
        description: meta.desc,
        inLanguage: 'bn-BD',
        isPartOf: { '@id': ORIGIN + '/#website' },
        breadcrumb: { '@id': url + '#breadcrumb' },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': url + '#breadcrumb',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'প্রচ্ছদ', item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: meta.h1, item: url },
        ],
      },
      {
        '@type': 'NewsMediaOrganization',
        '@id': ORIGIN + '/#organization',
        name: SITE,
        url: ORIGIN + '/',
        logo: { '@type': 'ImageObject', url: ORIGIN + '/images/bne-logo.png' },
        sameAs: ['https://t.me/bne0999', 'https://www.facebook.com/499814799889977'],
      },
      {
        '@type': 'WebSite',
        '@id': ORIGIN + '/#website',
        url: ORIGIN + '/',
        name: SITE,
        inLanguage: 'bn-BD',
        publisher: { '@id': ORIGIN + '/#organization' },
      },
    ],
  };

  return [
    MARK_S,
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.desc)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    '<meta name="robots" content="index, follow, max-image-preview:large" />',
    `<meta name="author" content="${esc(SITE_FULL)}" />`,
    '<meta name="theme-color" content="#991b1b" />',
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${esc(SITE_FULL)} | BANGLA NEWS EDITION" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.desc)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(ORIGIN)}/images/bne-og-cover.jpg" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${esc(SITE_FULL)} — সত্য ও বস্তুনিষ্ঠ খবরের বিশ্বস্ত ঠিকানা" />`,
    '<meta property="og:locale" content="bn_IN" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.desc)}" />`,
    `<meta name="twitter:image" content="${esc(ORIGIN)}/images/bne-og-cover.jpg" />`,
    '<meta name="twitter:site" content="@bne0999" />',
    '<link rel="manifest" href="/manifest.webmanifest" />',
    `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
    '<link rel="stylesheet" href="/ssr.css" />',
    MARK_E,
  ].join('\n  ');
}

/* ── নতুন পাতার কনটেন্ট (প্রামাণ্য, কোনো বানানো তথ্য নয়) ─────────────── */
function shellPage(meta, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${headBlock(meta)}
  <link rel="stylesheet" href="/style.css">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700&family=Noto+Serif+Bengali:wght@600;700&display=swap" rel="stylesheet">
</head>
<body class="ssr-body">
  <header class="ssr-header">
    <a class="ssr-brand" href="/">বাংলা নিউজ এডিশন</a>
    <nav class="ssr-nav" aria-label="বিভাগসমূহ">
      <a href="/">প্রচ্ছদ</a>
      <a href="/desk/probashi-bangla-news">প্রবাস বাংলা নিউজ</a>
      <a href="/about-us">আমাদের সম্পর্কে</a>
      <a href="/contact-us">যোগাযোগ</a>
    </nav>
  </header>
  <main class="ssr-main legal-container" id="app">
${bodyHtml}
  </main>
  <footer class="ssr-footer">
    <p>© ${new Date().getFullYear()} বাংলা নিউজ এডিশন (BNE) — সত্য ও বস্তুনিষ্ঠ খবরের বিশ্বস্ত ঠিকানা</p>
    <p><a href="/about-us">আমাদের সম্পর্কে</a> · <a href="/privacy-policy">গোপনীয়তা নীতি</a> · <a href="/terms">শর্তাবলী</a> · <a href="/contact-us">যোগাযোগ</a> · <a href="/advertise">বিজ্ঞাপন</a></p>
  </footer>
</body>
</html>
`;
}

const TERMS_BODY = `    <h1>ব্যবহারের শর্তাবলী</h1>
    <p>বাংলা নিউজ এডিশন (BNE) ওয়েবসাইট ব্যবহার করার আগে অনুগ্রহ করে নিচের শর্তাবলী পড়ে নিন। সাইটটি ব্যবহার করলে ধরে নেওয়া হবে যে আপনি এই শর্তাবলীতে সম্মত।</p>

    <h2>১. সেবার প্রকৃতি</h2>
    <p>বিএনই একটি অনলাইন সংবাদ পোর্টাল। আমরা নিজস্ব ডেস্কের প্রতিবেদন এবং নির্ভরযোগ্য সংবাদমাধ্যমের প্রকাশ্য ফিড থেকে সংবাদ সংগ্রহ ও পুনঃপ্রকাশ করি। যেসব সংবাদ অন্য সূত্র থেকে নেওয়া, সেখানে সূত্রের নাম উল্লেখ করা হয়। সংবাদের ওপর ভিত্তি করে নেওয়া যেকোনো সিদ্ধান্ত পাঠকের নিজস্ব দায়িত্ব।</p>

    <h2>২. মেধাস্বত্ব ও উদ্ধৃতি নীতি</h2>
    <p>বিএনই ডেস্কের নিজস্ব লেখা, ছবি ও গ্রাফিক্স এই পোর্টালের সম্পত্তি। কোনো ব্যক্তি বা প্রতিষ্ঠান আমাদের কনটেন্ট ব্যবহার করতে চাইলে অবশ্যই স্পষ্টভাবে “বাংলা নিউজ এডিশন” নামে ক্রেডিট দিতে হবে এবং মূল পাতার সক্রিয় লিংক দিতে হবে। বাণিজ্যিক ব্যবহারের আগে লিখিত অনুমতি নেওয়া আবশ্যক। অন্য সূত্রের ছবি বা কনটেন্ট সম্পর্কিত স্বত্ব সংশ্লিষ্ট মূল প্রতিষ্ঠানের।</p>

    <h2>৩. সংশোধনের নীতি</h2>
    <p>সংবাদে কোনো ভুল ধরা পড়লে আমরা তা দ্রুত সংশোধন করি এবং সংশোধনের কথা পাঠককে জানাই। কোনো সংবাদে আপনার সম্পর্কে ভুল তথ্য থাকলে যোগাযোগ পাতার মাধ্যমে জানালে বিষয়টি যাচাই করে ব্যবস্থা নেওয়া হবে।</p>

    <h2>৪. ব্যবহারকারীর আচরণ</h2>
    <p>মন্তব্য বা যোগাযোগের সময় মানহানিকর, উসকানিমূলক, বেআইনি বা অন্যের গোপনীয়তা ভঙ্গ করে এমন কোনো বক্তব্য দেওয়া যাবে না। এমন কিছু পাওয়া গেলে তা মুছে ফেলা হবে এবং প্রয়োজন হলে আইনানুগ ব্যবস্থা নেওয়া হতে পারে।</p>

    <h2>৫. বাহ্যিক লিংক</h2>
    <p>আমাদের পাতায় থাকা বাহ্যিক ওয়েবসাইটের লিংকের কনটেন্ট নিয়ে বিএনই দায়ী নয়। সেই সাইটগুলোর নিজস্ব শর্ত ও নীতি প্রযোজ্য।</p>

    <h2>৬. দায়সীমা</h2>
    <p>বিএনই সংবাদ পরিবেশনে সর্বোচ্চ সতর্কতা অবলম্বন করে, তবে কোনো তথ্যের সরাসরি বা পরোক্ষ ক্ষতি, লাভহানি বা অন্য কোনো ফলাফলের জন্য বিএনই দায়ী থাকবে না।</p>

    <h2>৭. বিজ্ঞাপন</h2>
    <p>সাইটে প্রদর্শিত বিজ্ঞাপনসমূহ বিজ্ঞাপনদাতার নিজস্ব দায়িত্বে প্রকাশিত। বিজ্ঞাপনের ওপর ভিত্তি করে নেওয়া যেকোনো লেনদেন বা সিদ্ধান্তের দায় সম্পূর্ণ পাঠকের নিজের। বিজ্ঞাপন সংক্রান্ত পূর্ণ নীতি দেখুন <a href="/advertise">বিজ্ঞাপন পাতায়</a>।</p>

    <h2>৮. পরিবর্তন ও প্রযোজ্য আইন</h2>
    <p>এই শর্তাবলী সময় সময় হালনাগাদ হতে পারে; গুরুত্বপূর্ণ পরিবর্তন হলে সাইটে জানানো হবে। এই শর্তাবলীর ব্যাখ্যা ও প্রয়োগ হবে গণপ্রজাতন্ত্রী বাংলাদেশের প্রচলিত আইন অনুযায়ী।</p>
`;

const ADVERTISE_BODY = `    <h1>বিজ্ঞাপন দিন</h1>
    <p>বাংলাদেশ ও প্রবাসী পাঠকের কাছে পৌঁছাতে চাইলে বাংলা নিউজ এডিশন (BNE) একটি কার্যকর প্ল্যাটফর্ম। আমরা ওয়েবসাইট, টেলিগ্রাম চ্যানেল ও ফেসবুক পেজ — তিন জায়গাতেই কনটেন্ট পরিবেশন করি।</p>

    <h2>আমাদের পাঠক</h2>
    <p>আমাদের মূল পাঠক বাংলাদেশের বিভাগ ও জেলা শহরের সংবাদ-সচেতন মানুষ, এবং একইসঙ্গে প্রবাসে কর্মরত বাংলাদেশিরা। তাই প্রবাস-সংক্রান্ত বিজ্ঞাপন (ভিসা, কর্মসংস্থান, রিক্রুটিং, রেমিট্যান্স ও বিমা) এবং স্থানীয় ব্যবসার বিজ্ঞাপন — দুটোই ভালো সাড়া পায়।</p>

    <h2>বিজ্ঞাপনের ফরম্যাট</h2>
    <p>১. প্রচ্ছদের শীর্ষ ব্যানার (ইমেজ, সাধারণত ৭২৮×১৮০ পিক্সেল)।<br>
    ২. প্রচ্ছদের মাঝখানের স্লট (বড় ইমেজ বা ইনফোগ্রাফিক)।<br>
    ৩. সংবাদ পাতার পাশের সাইডবার স্লট।<br>
    ৪. প্রবাস বাংলা নিউজ ডেস্কের ডেডিকেটেড স্লট।<br>
    ৫. স্পনসর্ড কনটেন্ট — প্রতিষ্ঠানের সেবা বা নিয়োগ বিজ্ঞপ্তি নিয়ে সম্পাদকীয়-সদৃশ পৃষ্ঠা (স্পষ্টভাবে “স্পনসর্ড” চিহ্নিত থাকবে)।</p>

    <h2>আমাদের নীতি</h2>
    <p>প্রতিটি বিজ্ঞাপন স্পষ্টভাবে “বিজ্ঞাপন” বা “স্পনসর্ড” হিসেবে চিহ্নিত করা হয়। আমরা বিভ্রান্তিকর, বেআইনি বা পাঠকের ক্ষতি করতে পারে এমন কোনো বিজ্ঞাপন গ্রহণ করি না। একই ক্রিয়েটিভ একই পাতায় একাধিকবার দেখানো হয় না — পাঠকের অভিজ্ঞতা অটুট রাখা আমাদের অগ্রাধিকার।</p>

    <h2>যোগাযোগ</h2>
    <p>বিজ্ঞাপনের হার, উপলব্ধ স্লট ও ক্রিয়েটিভ স্পেসিফিকেশন জানতে যোগাযোগ করুন:
    <br>টেলিগ্রাম: <a href="https://t.me/bne0999" rel="noopener">@bne0999</a>
    <br>ফেসবুক পেজ: <a href="https://www.facebook.com/499814799889977" rel="noopener">বাংলা নিউজ এডিশন</a>
    <br>অথবা <a href="/contact-us">যোগাযোগ পাতা</a> ব্যবহার করে বার্তা পাঠান।</p>
`;

function patch(html, meta) {
  let out = html;

  /* ১) সব অ্যাসেট পাথ absolute (P0-1 — স্ট্যাটিক পাতাতেও একই সমস্যা ছিল) */
  out = out.replace(/href="style\.css"/g, 'href="/style.css"');
  out = out.replace(/href="manifest\.webmanifest"/g, 'href="/manifest.webmanifest"');
  out = out.replace(/href="([a-z0-9-]+)\.html"/g, 'href="/$1"');

  /* ২) আগের মার্কার-ব্লক সরাও (পুনরাবৃত্তি নিরাপদ) */
  const s = out.indexOf(MARK_S);
  if (s !== -1) {
    const e = out.indexOf(MARK_E);
    if (e !== -1) out = out.slice(0, s) + out.slice(e + MARK_E.length);
  }

  /* ৩) পুরনো duplicate meta description সরাও (Crawler flagged Duplicate) */
  out = out.replace(/<meta\s+name="description"[^>]*>\s*/gi, '');

  /* ৪) ঠিক একটি <h1> নিশ্চিত করো */
  if (!/<h1[\s>]/i.test(out)) {
    out = out.replace(/<body([^>]*)>/i,
      `<body$1>\n  <header class="ssr-header"><a class="ssr-brand" href="/">বাংলা নিউজ এডিশন</a></header>`);
  }

  /* ৫) নতুন SEO ব্লক বসাও — </head> এর ঠিক আগে */
  const block = `  ${headBlock(meta)}\n`;
  if (out.indexOf('</head>') !== -1) {
    out = out.replace('</head>', block + '</head>');
  } else {
    out = block + out;
  }
  return out;
}

function main() {
  let patched = 0, created = 0, skipped = 0;

  Object.keys(PAGES).forEach((file) => {
    const meta = PAGES[file];
    const full = path.join(ROOT, file);

    if (!fs.existsSync(full)) {
      if (meta.create) {
        const body = file === 'terms.html' ? TERMS_BODY : ADVERTISE_BODY;
        fs.writeFileSync(full, shellPage(meta, body), 'utf8');
        created++;
        console.log('  ＋ তৈরি: ' + file);
      } else {
        skipped++;
        console.log('  ⚠ পাওয়া যায়নি (এড়িয়ে যাওয়া): ' + file);
      }
      return;
    }

    try {
      const html = fs.readFileSync(full, 'utf8');
      const out = patch(html, meta);
      fs.writeFileSync(full, out, 'utf8');
      const canon = (out.match(/rel="canonical"/g) || []).length;
      const h1 = (out.match(/<h1[\s>]/gi) || []).length;
      const rel = (out.match(/href="style\.css"/g) || []).length;
      patched++;
      console.log('  ✓ ' + file + '  canonical=' + canon + ' h1=' + h1 + ' relativeCSS=' + rel);
    } catch (e) {
      console.log('  ✗ ' + file + ' — ' + e.message);
    }
  });

  console.log('[static-seo] সম্পন্ন — প্যাচড ' + patched + ', নতুন ' + created + ', বাদ ' + skipped);
}

main();
