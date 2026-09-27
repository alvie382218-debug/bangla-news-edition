#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# BNE — Netlify-তে নিরাপদে ডিপ্লয় (লোকাল মেশিন থেকে)
# ────────────────────────────────────────────────────────────────────────────
# ★ পুনর্লিখিত (২০২৬-০৯-২৭) — আগের সংস্করণ রেপোর ভেতরের ফাইল সরাত ★
#
# আগের পদ্ধতি ছিল: `images/news/` ও `.netlify/` সাময়িকভাবে সরানো, ডিপ্লয়,
# তারপর trap দিয়ে ফিরিয়ে আনা। কিন্তু ডিপ্লয়ে ১৫ মিনিটের বেশি লাগলে
# প্রসেসটি জোর করে থামানো হয় → trap চলে না → ৭০ MB ছবির ক্যাশই টেম্প
# ফোল্ডারে আটকে যায় (ডিপ্লয়ে হাতে-কলমে উদ্ধার করতে হয়েছে)।
#
# নতুন পদ্ধতি: **রেপোতে কোনো হাত পড়ে না।** বরং একটি স্টেজিং কপি তৈরি হয়:
#   • rsync দিয়ে রেপো → স্টেজিং (বাদ: .git, images/news, .netlify)
#   • আগের ডিপ্লয়-স্টেট (.netlify) থাকলে স্টেজিংয়ে নেওয়া হয় → CLI কেবল
#     বদলানো ফাইল আপলোড করে (নইলে প্রতিবার ১৩ MB পুরোটা যেত — ধীর আপলোডে
#     প্রায় ঘণ্টা লাগে)
#   • ডিপ্লয়ের পর নতুন স্টেট রেপোতে ফিরিয়ে রাখা হয়
# প্রসেস যে কারণেই থামুক, রেপো অটুট থাকে — ক্যাশ আটকে যাওয়ার প্রশ্ন নেই।
#
# কেন ক্যাশ বাদ: সাইট এখন Oracle-এর `/img/…` প্রক্সি দিয়ে ছবি দেয়, তাই
#   `images/news/` (নামানো ছবির লোকাল ক্যাশ) ডিপ্লয়ে দরকারই নেই।
#
# ব্যবহার:
#   NETLIFY_AUTH_TOKEN=… bash tools/deploy-netlify.sh <site-id> [--message "…"]
# ════════════════════════════════════════════════════════════════════════════
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
REPO="$(pwd)"

SITE_ID="${1:-}"
if [ -z "$SITE_ID" ]; then
  echo "ব্যবহার: NETLIFY_AUTH_TOKEN=… bash tools/deploy-netlify.sh <site-id> [--message \"…\"]" >&2
  exit 1
fi
if [ -z "${NETLIFY_AUTH_TOKEN:-}" ]; then
  echo "❌ NETLIFY_AUTH_TOKEN দেওয়া হয়নি।" >&2
  exit 1
fi

MSG="কোড হালনাগাদ"
if [ "${2:-}" = "--message" ] && [ -n "${3:-}" ]; then MSG="$3"; fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "❌ rsync পাওয়া যায়নি।" >&2
  exit 1
fi

STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE" 2>/dev/null || true; }
trap cleanup EXIT

echo "📁 স্টেজিং কপি তৈরি হচ্ছে (রেপো অপরিবর্তিত থাকবে)…"
rsync -a --exclude '.git' --exclude 'images/news' --exclude '.netlify' ./ "$STAGE"/

if [ -d "$REPO/.netlify" ]; then
  cp -R "$REPO/.netlify" "$STAGE/.netlify"
  echo "♻️  আগের ডিপ্লয়-স্টেট নেওয়া হলো (শুধু বদলানো ফাইল আপলোড হবে)।"
fi

echo "📤 ডিপ্লয় → সাইট $SITE_ID"
echo "   বার্তা: $MSG"
npx --no-install netlify deploy --prod --no-build --dir "$STAGE" --site "$SITE_ID" --message "$MSG"
STATUS=$?
echo "── ডিপ্লয় exit: $STATUS ──"

# পরের ডিপ্লয় দ্রুত করার জন্য নতুন স্টেট রেপোতে সংরক্ষণ
if [ -f "$STAGE/.netlify/state.json" ]; then
  rm -rf "$REPO/.netlify"
  cp -R "$STAGE/.netlify" "$REPO/.netlify"
fi

exit "$STATUS"
