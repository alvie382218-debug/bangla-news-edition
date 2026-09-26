# ⚠️ এটি বাংলা নিউজ এডিশনের একমাত্র ক্যানোনিক্যাল (সত্য) সোর্স

**সোর্স-অব-ট্রুথ পাথ:**
```
/Users/adint./AccioWork/bangla-news-edition
```

**লাইভ সাইট:** https://bangla-news-edition-bd.netlify.app
**Netlify Site ID:** `5602a816-920e-485a-aaa9-097b04a9d072`
**Git remote:** `https://github.com/oumaboy93-alt/bangla-news-edition.git` (branch: `main`)

---

## ⛔ এই ম্যাকবুকের অন্য যেসব কপি থেকে **ডিপ্লয় বা সিঙ্ক করবেন না**

এই মেশিনে এই সাইটের **৫টি পুরনো কপি** আছে। এগুলো ভিন্ন সময়ে ভিন্ন এজেন্ট তৈরি
করেছে এবং সবগুলোই এখন পুরনো। এগুলোর কোনো একটির নাম দেখে যদি কেউ নেয়
`bne-config.json` বা `app.js`, তাহলে পুরো সাইট সাথে সাথে আগের (ভাঙা) অবস্থায়
ফিরে যাবে — সাদা স্ক্রিন, ভাঙা ছবি, ডুপ্লিকেট বিজ্ঞাপন সহ।

| # | পুরনো কপির পাথ | কী আছে | অবস্থা |
|---|---|---|---|
| ১ | `AccioWork/news-portal-BNE/deploy/bangla-news-edition/` | পুরো সাইট + নিজস্ব `.git` | পুরনো |
| ২ | `AccioWork/news-portal-BNE/bangla-news-edition-main/` | পুরো সাইট | পুরনো (২৩ আগস্ট) |
| ৩ | `AccioWork/news-portal-BNE/bangla-news/bangla-news-edition-main/` | পুরো সাইট | পুরনো (২২ আগস্ট) |
| ৪ | `AccioWork/BNE Project/bne-pivot/_staging/` | `app.js`, `netlify.toml`, কনফিগ | পুরনো |
| ৫ | `AccioWork/BNE Project/bne-pivot/.backup-20260918-173906/` | ব্যাকআপ স্ন্যাপশট | পুরনো |

**আর্কাইভ (zip)** — শুধু ইতিহাস, ডিপ্লয়ের জন্য নয়:
- `AccioWork/BNE Project.zip` (৪৭ MB)
- `AccioWork/news-portal-BNE/bangla-news-edition-updated.zip` (৮ MB)

প্রতিটি পুরনো কপির রুটে একটি `⛔-পুরনো-কপি-এখানে-কাজ-করবেন-না.md` সতর্কবার্তা
রাখা হয়েছে — ভবিষ্যতে কোনো এজেন্ট যেন ভুল করে এখান থেকে ডিপ্লয় না করে।

---

## নিরাপদ ডিপ্লয় প্রক্রিয়া

```bash
# ১) ক্যানোনিক্যাল পাথে আছি কি না যাচাই (না হলে process বন্ধ হয়ে যাবে)
node tools/verify-canonical.js

# ২) সম্পূর্ণ বিল্ড
export BNE_SITE_ORIGIN="https://bangla-news-edition-bd.netlify.app"
node tools/set-site-origin.js
node tools/sync-function-data.js
node tools/build-site-data.js
node tools/prerender-home.js
node tools/build-sitemap.js
node tools/build-static-seo.js

# ৩) Netlify-তে ডিপ্লয় (ফাংশন বান্ডলিংসহ — CLI ছাড়া ফাংশন কাজ করে না)
netlify deploy --prod --dir=. 
```

---

## সাইট আর্কিটেকচার (সংক্ষেপে)

| স্তর | ফাইল | কাজ |
|---|---|---|
| শেল | `index.html` | প্রথম পেইন্ট; বিল্ড-টাইমে প্রি-রেন্ডার করা হোমপেজ |
| অ্যাপ | `app.js` (SPA ইঞ্জিন) | রাউটিং, রেন্ডার, বিজ্ঞাপন ইঞ্জিন |
| লজিক | `core.js` | DOM-মুক্ত ফাংশন: ছবি নরমালাইজ, কনটেন্ট কভার, ঢাকা টাইমজোন |
| কনফিগ | `site-config.js` | শেষ-ভরসা ডিফল্ট কনফিগ |
| ডেটা | `data/site.json` (হালকা) · `data/news.json` (পূর্ণ) | বিল্ডে তৈরি, নিজের origin-এ |
| SSR | `netlify/functions/article-og.js` · `page-ssr.js` | `/news/*`, `/category/*`, `/desk/*`, `/search/*` |
| API | `netlify/functions/config.js` · `version.js` · `feeds.js` | `/api/*` |
| আউটপুট | `sitemap.xml` · `news-sitemap.xml` · `robots.txt` | বিল্ডে তৈরি, নিজের হোস্টে |
| বিল্ড টুল | `tools/*.js` | প্রি-রেন্ডার, সাইটম্যাপ, static SEO, ডেটা |

## বিজ্ঞাপনের নিয়ম (মেনে চলা বাধ্যতামূলক)

- একই `ad.id` একই পাতায় দুইবার রেন্ডার হবে না (`renderedAdIds`)।
- এক পাতায় সর্বোচ্চ **১টি** ভিডিও/HTML অ্যাড (`MAX_MEDIA_ADS_PER_PAGE`)।
- খালি স্লট = কোনো DOM নয় (`min-height: 0` + `.ad-slot:empty{display:none}`)।
- Auto-Ads কেবল `settings.adsenseAutoAds === true` হলে এবং সম্মতির পর।

## সংবাদের ছবি

- `image` ফিল্ড ফাঁকা হলে → **সংবাদের নিজের ইউনিক টাইপোগ্রাফিক কভার** (inline SVG)।
  বিভাগীয় ডিফল্ট ছবি আর কখনো পুনরাবৃত্তি হয় না।
- পাথ সবসময় absolute (`/images/...`) — relative পাথ `/news/` পাতায় ভেঙে যায়।
- legacy `/img/<file>` কাজ করে কেবল ব্যাকঅ্যাপ প্রোক্সি হিসেবে; নতুন ছবির জন্য
  সবসময় `/images/<file>` ব্যবহার করুন।
