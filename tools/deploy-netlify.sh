#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# BNE — Netlify-তে নিরাপদে ডিপ্লয় (লোকাল মেশিন থেকে)
# ────────────────────────────────────────────────────────────────────────────
# কেন আলাদা স্ক্রিপ্ট (দুটি বাস্তব সমস্যা, ২০২৬-০৯-২৭-এ ধরা পড়া)
#
#  ১) ৪২২ "no records matched" — রেপোর ভেতরে `.netlify/` ফোল্ডারে পুরনো
#     সাইটের ডিপ্লয়-স্টেট জমা থাকে। ভিন্ন সাইটে (`--site <id>`) ডিপ্লয়
#     করার সময় CLI সেই পুরনো স্টেটের সাথে ফাইল-হ্যাশ মেলাতে গিয়ে ব্যর্থ হয়।
#     → তাই ডিপ্লয়ের আগে স্টেট সরিয়ে দেওয়া হয় (দুই নম্বর সমস্যাও এতে মেটে)।
#
#  ২) অকারণে ৭১ MB আপলোড — `images/news/` হলো লোকাল ক্যাশ (নামানো ছবি)।
#     সাইট এখন Oracle-এর `/img/…` প্রক্সি দিয়ে ছবি দেয়, তাই ওই ফোল্ডারের
#     কোনো দরকার নেই ডিপ্লয়ে — অথচ প্রতিবার পুরোটা আপলোড হত (ধীর আপলোডে
#     প্রায় ঘণ্টা খরচ)। → ডিপ্লয়ের সময় সাময়িকভাবে সরিয়ে রাখা হয়।
#
# ব্যবহার:
#   NETLIFY_AUTH_TOKEN=… bash tools/deploy-netlify.sh <site-id> [--message "…"]
# ════════════════════════════════════════════════════════════════════════════
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
REPO="$(pwd)"

SITE_ID="${1:-}"
if [ -z "$SITE_ID" ]; then
  echo "ব্যবহার: NETLIFY_AUTH_TOKEN=… bash tools/deploy-netlify.sh <site-id>" >&2
  exit 1
fi
if [ -z "${NETLIFY_AUTH_TOKEN:-}" ]; then
  echo "❌ NETLIFY_AUTH_TOKEN দেওয়া হয়নি।" >&2
  exit 1
fi

MSG="কোড হালনাগাদ"
if [ "${2:-}" = "--message" ] && [ -n "${3:-}" ]; then MSG="$3"; fi

STASH="$(mktemp -d)"
CACHE="$REPO/images/news"
MOVED=0
STATE_MOVED=0

restore() {
  if [ "$MOVED" = "1" ] && [ -d "$STASH/news" ]; then
    mkdir -p "$REPO/images"
    rm -rf "$CACHE" 2>/dev/null || true
    mv "$STASH/news" "$CACHE" 2>/dev/null || true
    echo "♻️  images/news ক্যাশ ফিরিয়ে আনা হলো।"
  fi
  if [ "$STATE_MOVED" = "1" ] && [ -d "$STASH/dotnetlify" ]; then
    rm -rf "$REPO/.netlify" 2>/dev/null || true
    mv "$STASH/dotnetlify" "$REPO/.netlify" 2>/dev/null || true
  fi
  rmdir "$STASH" 2>/dev/null || true
}
trap restore EXIT

# ১) লোকাল ছবির ক্যাশ ডিপ্লয়ের বাইরে রাখা
if [ -d "$CACHE" ]; then
  echo "📦 images/news ক্যাশ সাময়িকভাবে সরানো হচ্ছে ($(du -sh "$CACHE" | cut -f1))…"
  mv "$CACHE" "$STASH/news" && MOVED=1
fi

# ২) পুরনো ডিপ্লয়-স্টেট সরানো (৪২২ এড়াতে)
if [ -d "$REPO/.netlify" ]; then
  mv "$REPO/.netlify" "$STASH/dotnetlify" && STATE_MOVED=1
  echo "🧹 পুরনো .netlify স্টেট সরানো হলো (৪২২ দূর করার জন্য)।"
fi

echo "📤 ডিপ্লয় করা হচ্ছে → সাইট $SITE_ID"
echo "   বার্তা: $MSG"
npx --no-install netlify deploy --prod --no-build --dir . --site "$SITE_ID" --message "$MSG" 2>&1 | tail -18
STATUS=${PIPESTATUS[0]}
echo "── ডিপ্লয় exit: $STATUS ──"
exit "$STATUS"
