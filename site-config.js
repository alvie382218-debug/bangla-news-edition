/* ══════════════════════════════════════════════════════════════════════
   বাংলা নিউজ এডিশন — সাইট কনফিগারেশন (ডিফল্ট স্তর)
   ──────────────────────────────────────────────────────────────────────
   এই ফাইলের মান হলো "শেষ ভরসা" (fallback)। লোডের প্রকৃত ক্রম:

     ১) localStorage-এ সংরক্ষিত সর্বশেষ ভালো কনফিগ  → সাথে সাথে রেন্ডার
     ২) নিজের origin:  /data/site.json              → ~৫KB, CDN-ক্যাশড
     ৩) Oracle /api/config                          → লাইভ হালনাগাদ
     ৪) এই ফাইলের ডিফল্ট                            → কখনো ব্যর্থ হয় না

   ⚠️ P0-3 ফিক্স: আগে এখানে remoteConfigUrl ছিল
        https://raw.githubusercontent.com/…/data/bne-config.json
      যা ২,৩০৫,৬৬০ বাইট (২.৩MB)। GitHub raw প্রোডাকশন CDN নয় — rate-limit
      বা নেটওয়ার্ক ব্যর্থ হলে সাইট কিছুই রেন্ডার করত (সাদা স্ক্রিন)।
      এখন কনটেন্ট কখনো কনফিগ-ফাইলে নির্ভরশীল নয়; ডিফল্টটি ছোট রাখা হয়।
   ══════════════════════════════════════════════════════════════════════ */
window.AZADI_DEFAULT_CONFIG = {
  version: 7,
  updatedAt: "2026-09-26T13:00:00.000Z",
  settings: {
    siteName: "বাংলা নিউজ এডিশন",
    /* ★ নিজের origin — কোনো বাইরের হোস্ট নয় (P0-3) */
    remoteConfigUrl: "/data/site.json",
    /* ★ P1-4 ফিক্স: আগে ছিল প্লেসহোল্ডার "G-XXXXXXXXXX", তাই GA4 কখনোই
       লোড হত না এবং কোন সংবাদ কতবার পড়া হচ্ছে তার কোনো ডেটাই ছিল না।
       এখন প্রকৃত মেজারমেন্ট আইডি — অ্যানালিটিক্স কার্যকর। */
    ga4MeasurementId: "G-3X2CF2KWH",
    adsensePublisherId: "ca-pub-8292591084993652",
    adsenseAutoAds: false,
    /* ★ P1-5: adminPath আর পাবলিক কনফিগে নেই। মোবাইল অ্যাডমিন প্যানেলের
       ঠিকানা server-side env (BNE_ADMIN_URL) থেকে আসে। পাবলিক JS-এ
       অভ্যন্তরীণ প্যানেলের ঠিকানা ঘোষণা করার কোনো দরকার নেই। */
    twitterSite: "@bne0999",
    facebookPageId: "499814799889977",
    telegramChannel: "@bne0999",
    timezone: "Asia/Dhaka",
    locale: "bn-BD"
  },

  editorNews: [
    {
      id: "thy-recruitment-2026",
      slug: "thy-recruitment-2026",
      title: "চীন, লাওস, আলজেরিয়া ও ইরাকে বিশাল নিয়োগ বিজ্ঞপ্তি — THY International AD International Ent.",
      category: "প্রবাস",
      lead: true,
      editorial: true,
      image: "/images/overseas-campaign.webp",
      publishedAt: "2026-08-22T08:18:00.000Z",
      tags: ["নিয়োগ", "প্রবাস", "চীন", "লাওস", "আলজেরিয়া", "ইরাক", "THY_International"],
      body: `চীন, লাওস, আলজেরিয়া ও ইরাকে আকর্ষনীয় বেতনে কর্মসংস্থানের সুবর্ণ সুযোগ নিয়ে এসেছে সরকারি অনুমোদিত বিশ্বস্ত রিক্রুটিং প্রতিষ্ঠান THY International AD International Ent.।

🇨🇳 ১. চীন (China) — গার্মেন্টস সুইং ট্রেইনি (বিশেষ অফার):
- পদ সংখ্যা: ২০০ জন (পুরুষ/নারী)।
- ভিসার ধরন: ৪ বছরের ট্রেইনি ভিসা (আন্তর্জাতিক মানের কাজের মূল্যায়ন)।
- বিশেষ সুযোগ: ২ বছর পর আন্তর্জাতিক মানের কাজের অভিজ্ঞতার প্রাতিষ্ঠানিক সার্টিফিকেট প্রদান করা হবে, যা ভবিষ্যতে ইউরোপ বা যেকোনো দেশে পেশাদার মূল্যায়ন হিসেবে গণ্য হবে।
- ট্রেইনি অবস্থায় সর্বনিম্ন মাসিক বেতন: ৫০,০০০ টাকা (BDT)।

🇱🇦 ২. লাওস (Laos) — CHINA HUNAN CONSTRUCTION:
- কোম্পানির নাম: CHINA HUNAN CONSTRUCTION।
- কাজের ধরণ: কনস্ট্রাকশন মেগা প্রজেক্ট।
- মাসিক বেতন: ৪৫০ ডলার ($450 USD)।
- ডিউটি সময়: ৯ ঘণ্টা (ওভারটাইম সুবিধা)।
- বয়সসীমা: ২০ থেকে ৪৫ বছর।
- সুবিধা: সম্পূর্ণ ফ্রি খাবার ও বাসস্থান কোম্পানি বহন করিবে (লাওসের শ্রম আইন অনুযায়ী সুবিধা)।

🇩🇿 ৩. আলজেরিয়া (Algeria) — কারিগরি ও দক্ষ পদ (২ বছরের অভিজ্ঞতা আবশ্যক):
- কার্পেন্টার: ২০ জন (মাসিক বেতন: $৫৫0 USD)
- স্টিলওয়ার্কার: ১০ জন (মাসিক বেতন: $৫৫0 USD)
- ব্রিকলেয়ার: ১০ জন (মাসিক বেতন: $৫৫0 USD)
- ট্রান্সলেটর: ১ জন (মাসিক বেতন: $৮০০ USD)
- শেফ / বাবুর্চি: ১ জন (মাসিক বেতন: $৪৫০ USD)

🇮🇶 ৪. ইরাক (Iraq) — ওয়েল্ডিং ও রাজমিস্ত্রি:
- সাধারণ ওয়েল্ডার: ৫ জন (মাসিক বেতন: $৫৫০ USD)
- ব্রিকলেয়ার / রাজমিস্ত্রি: ৫ জন (মাসিক বেতন: $৫০০ USD)

📍 কোম্পানির অফিসের ঠিকানা ও সরাসরি ক্লায়েন্ট তথ্য সংযোগ:
THY International AD International Ent.
এম এম কমপ্লেক্স, লিফট-৭ (পল্লবী মেট্রোস্টেশন সংলগ্ন), মিরপুর ২/১১, ঢাকা, বাংলাদেশ।
জরুরি কল / হটলাইন: সাগর — +8801791520269`
    }
  ],

  /* ══ P0-5 ফিক্স: স্লটপ্রতি ভিন্ন ক্রিয়েটিভ ═══════════════════════════
     আগের অবস্থা (লাইভ কনফিগে মাপা): overseas-campaign.webp একই সাথে
     home_top, home_middle ও probashi_hub — তিন স্লটে বসানো ছিল। ফলে
     একই পর্দায় ২–৩ বার একই বিজ্ঞাপন, আর article_sidebar + article_bottom-এ
     একই HTML অ্যাড (নিজের ভিডিও প্লেয়ার সহ) → দুটো ভিডিও একসাথে চলত।

     এখন নিয়ম: একই ক্রিয়েটিভ কখনো দুই স্লটে নয়। ডিফল্ট কনফিগেও তাই —
     প্রতিটি স্লটের নিজস্ব ক্রিয়েটিভ। (রানটাইমে renderAdSlot() এর
     renderedAdIds ক্যাপ যেকোনো ভুল কনফিগও আটকে দেয় — দ্বিতীয় স্তর।) */
  ads: [
    {
      id: "ad_overseas_campaign_top",
      slot: "home_top",
      type: "image",
      title: "জরুরী নিয়োগ বিজ্ঞপ্তি ২০২৬ — চীন, লাওস, আলজেরিয়া ও ইরাক (THY International)",
      image: "/images/overseas-campaign.webp",
      link: "/news/thy-recruitment-2026",
      enabled: true
    },
    {
      id: "ad_overseas_campaign_poster_middle",
      slot: "home_middle",
      type: "image",
      title: "জরুরী নিয়োগ বিজ্ঞপ্তি ২০২৬ — ইনফোগ্রাফিক পোস্টার",
      image: "/images/overseas-campaign-poster.webp",
      link: "/news/thy-recruitment-2026",
      enabled: true
    },
    {
      id: "ad_int_poster_hub",
      slot: "probashi_hub",
      type: "image",
      title: "AD International Enterprises — PU প্রযুক্তি ও মরিচা প্রতিরোধ সমাধান",
      image: "/images/ad_int_poster.jpg",
      link: "/news/thy-recruitment-2026",
      enabled: true
    },
    {
      id: "ad_overseas_campaign_probashi_top",
      slot: "probashi_top",
      type: "image",
      title: "জরুরী নিয়োগ বিজ্ঞপ্তি ২০২৬ — THY International AD International Ent.",
      image: "/images/overseas-campaign.webp",
      link: "/news/thy-recruitment-2026",
      enabled: true
    }
  ]
};
