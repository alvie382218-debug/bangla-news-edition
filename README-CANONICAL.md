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

## সংবাদের ছবি (২০২৬-০৯-২৬-এ সম্পূর্ণ পুনর্গঠিত)

**সমস্যা যা ঠিক করা হলো:** ৪৯৪টি সংবাদের ৪৮৩টিতেই `image` ফাঁকা ছিল → পাতার হিরো,
`og:image`, Telegram ও Facebook কার্ড — তিন জায়গাতেই হুবহু একই লাল ব্র্যান্ড পোস্টার
(শিরোনাম ছাড়া)। ফলে প্রতিটি পোস্ট অভিন্ন দেখাত।

**এখনকার নিয়ম — ছবি সর্বদা নিজের হোস্টে, হটলিংক কখনো নয়:**

| ধাপ | ফাইল | কাজ |
|---|---|---|
| সংগ্রহ | `tools/fetch-news-images.js` | সোর্স পাতার `og:image` → নামায় → যাচাই → ১২০০x৬৩০ JPEG |
| ফলব্যাক | একই ফাইল | না পেলে মূল পত্রিকার `news-sitemap` শিরোনাম-মিল (২৯৫০+ শিরোনাম) |
| শেষ অবলম্বন | একই ফাইল | শিরোনামসহ **নিজস্ব কার্ড** (SVG→JPEG, `sips`) — `imageIsCover: true` |
| ধরে রাখা | `tools/enrich-images.js` | `/images/news/…` ও `/img/…` **কখনো বদলায় না** |
| সাইটে পাঠানো | `tools/push-images-to-oracle.js` | Oracle-এর `/opt/bne/data/img/`-এ তোলে, DB `image = /img/<id>-1200x630.jpg` |

**কেন Oracle-এ (আর রেপোতে নয়):** সাইটের ডেটা আসে `Oracle DB → /api/config → GitHub
Actions (৫ মিনিট) → data/bne-config.json → Netlify`। তাই রেপোতে ছবি রাখলেও পরের
সিঙ্কেই মুছে যেত। Oracle-এর DB-ই টেকসই জায়গা; লাইভ URL হয় আমাদের নিজের ডোমেইনে
(`netlify.toml`-এর `/img/*` প্রক্সি), তাই কখনো `nip.io` বা কাঁচা IP পোস্ট হয় না।

**সাবধানতা (মেনে চলা বাধ্যতামূলক):**
- ফাইলনামে `1200x630` রাখুন — `_og-lib.js` ওই নাম দেখেই `og:image:width/height` ঘোষণা করে।
- সোর্সের পাতা কেবল বাংলাদেশের রেসিডেন্সিয়াল IP থেকে খোলা যায় (Oracle ও CI-র
  ডেটাসেন্টার IP ৪০৩ পায়) — তাই নতুন ছবি আনতে হবে এই ম্যাক থেকে:
  `bash tools/auto-image-refresh.sh` (চাইলে ঘণ্টায় একবার শিডিউল করুন)।
- ছবির সূত্র সবসময় দেখানো হয় (`imageCredit` → "ছবি: \<সূত্র\>"); নিজের আঁকা
  কার্ডে সূত্র থাকে না (`imageIsCover: true`)।
- `image` একেবারে ফাঁকা হলে → সংবাদের নিজের ইউনিক টাইপোগ্রাফিক কভার (inline SVG)।
- পাথ absolute (`/images/...`) বা প্রক্সি (`/img/<file>`) — relative পাথ `/news/` পাতায় ভাঙে।
