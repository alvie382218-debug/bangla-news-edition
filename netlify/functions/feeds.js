/**
 * BNE — /api/feeds  (P0-4 ফিক্স)
 * ═══════════════════════════════════════════════════════════════════════
 * সমস্যা (লাইভ সাইটে প্রমাণিত):
 *   app.js-এর BNE_FEED_API() ডাকে "/api/feeds?source=<key>"। কিন্তু Netlify-তে
 *   /api/* → /.netlify/functions/:splat ম্যাপ করা, আর `feeds` নামের কোনো
 *   ফাংশন ছিল না → সবসময় 404। ফলে ফিড লোডার প্রতিবার `PROXIES` চেইনে পড়ত:
 *     corsproxy.io → api.allorigins.win → api.codetabs.com
 *   অর্থাৎ প্রতিটি পাঠকের ব্রাউজার রিকোয়েস্ট তৃতীয় পক্ষের সার্ভারে চলে যেত,
 *   রেট-লিমিটে প্রায়ই ব্যর্থ হতো, আর গোপনীয়তাও ঝুঁকিতে পড়ত।
 *
 * সমাধান: এখানেই ৯টি বাংলা সূত্র সার্ভার-সাইড থেকে আনা হয় (কোনো তৃতীয় পক্ষ নয়),
 *   নরমালাইজ করা XML/JSON ফেরত দেওয়া হয় এবং CDN-এ ক্যাশ করা হয়।
 *   app.js-এর PROXIES চেইন সম্পূর্ণ বাদ দেওয়া হয়েছে।
 *
 * কনট্র্যাক্ট:
 *   GET /api/feeds?source=<key>   → একক সূত্র  (XML)
 *   GET /api/feeds?source=all     → সব সূত্র    (JSON, নরমালাইজড)
 *   GET /api/feeds                → সব সূত্র    (JSON)
 */

'use strict';

const { SOURCES, fetchSource, fetchAllFeeds } = require('./_feeds.js');

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=1800',
  'Netlify-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=1800',
  'Access-Control-Allow-Origin': '*',
};

function json(statusCode, obj, extra) {
  return {
    statusCode,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CACHE_HEADERS, extra || {}),
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const source = String(qs.source || '').trim();

  /* ── একটি নির্দিষ্ট সূত্র: আগে র-কনটেন্ট চেষ্টা, না পেলে নরমালাইজড JSON ── */
  if (source && source !== 'all') {
    if (!Object.prototype.hasOwnProperty.call(SOURCES, source)) {
      return json(400, {
        ok: false,
        error: 'unknown-source',
        message: 'অজানা ফিড সূত্র: ' + source,
        available: Object.keys(SOURCES),
      });
    }

    try {
      const res = await fetch(SOURCES[source].rss, {
        headers: {
          'User-Agent': 'BNE-FeedBot/1.0 (+https://bangla-news-edition-bd.netlify.app)',
          Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        },
      });
      if (res.ok) {
        const xml = await res.text();
        if (xml && xml.length > 200) {
          return {
            statusCode: 200,
            headers: Object.assign(
              {
                'Content-Type': 'application/xml; charset=utf-8',
                'X-BNE-Feed': source,
                'X-BNE-Mode': 'raw-xml',
              },
              CACHE_HEADERS
            ),
            body: xml,
          };
        }
      }
    } catch (e) {
      /* নিচের নরমালাইজড পথে পড়ি */
    }

    try {
      const parsed = await fetchSource(source);
      const items = Array.isArray(parsed) ? parsed : (parsed && parsed.items) || [];
      return json(200, {
        ok: true,
        source,
        label: (SOURCES[source] && SOURCES[source].label) || source,
        items,
        errors: [],
        fetchedAt: new Date().toISOString(),
      }, { 'X-BNE-Feed': source, 'X-BNE-Mode': 'normalized-json' });
    } catch (e) {
      return json(502, {
        ok: false,
        source,
        error: 'fetch-failed',
        message: String((e && e.message) || e),
        items: [],
      });
    }
  }

  /* ── সব সূত্র একসাথে (হোমপেজের ডিফল্ট পথ) ─────────────────────────── */
  try {
    const { items, errors } = await fetchAllFeeds();
    return json(200, {
      ok: true,
      source: 'all',
      count: items.length,
      items,
      errors,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return json(502, {
      ok: false,
      source: 'all',
      error: 'fetch-failed',
      message: String((e && e.message) || e),
      items: [],
    });
  }
};
