#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# BNE — নতুন সংবাদের আসল ছবি স্বয়ংক্রিয়ভাবে আনা ও Oracle-এ তোলা
# ────────────────────────────────────────────────────────────────────────────
# কেন এই স্ক্রিপ্ট দরকার (২০২৬-০৯-২৬-এ যাচাই করা)
#   মূল সংবাদপত্রের পাতা কেবল বাংলাদেশের রেসিডেন্সিয়াল IP থেকে খোলা যায়।
#   Oracle সার্ভার ও GitHub রানার — দুটোই ডেটাসেন্টার IP, পত্রিকাগুলো ৪০৩
#   ফেরায়। তাই নতুন সংবাদের ছবি আনার একমাত্র নির্ভরযোগ্য জায়গা এই ম্যাক।
#
# প্রবাহ (সব স্বয়ংক্রিয়, রেপোর কনফিগের উপর নির্ভর করে না):
#   ১) Oracle-এর লাইভ /api/config আনা → data/bne-live.json
#      (এটিই সাইট ও CI যে তালিকা ব্যবহার করে — সবসময় হালনাগাদ)
#   ২) tools/fetch-news-images.js --config=data/bne-live.json
#      → প্রতিটি খবরের og:image নামায়, যাচাই করে, ১২০০x৬৩০ করে
#   ৩) tools/push-images-to-oracle.js --config=data/bne-live.json
#      → কেবল নতুন ছবিগুলো Oracle-এ তোলে + DB-তে image = /img/<id>-1200x630.jpg
#   ৪) এরপর GitHub Actions-এর প্রতি-৫-মিনিটের সিঙ্ক নিজেই সাইট, og:image,
#      Telegram ও Facebook কার্ডে সেই ছবি পৌঁছে দেয়।
#
# লগ: ~/.bne/logs/image-refresh-YYYYMMDD.log
# ব্যবহার:  bash tools/auto-image-refresh.sh
# ════════════════════════════════════════════════════════════════════════════
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

# ── node খুঁজে নেওয়া ────────────────────────────────────────────────────
# cron/launchd-এ PATH খুবই সংকীর্ণ থাকে, তাই managed node-ও খোঁজা হয়।
NODE="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE" ]; then
  for c in "$HOME"/Library/Accio/external-tools/*/node/bin/node \
           /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    if [ -x "$c" ]; then NODE="$c"; break; fi
  done
fi
if [ -z "$NODE" ]; then echo "node খুঁজে পাওয়া যায়নি" >&2; exit 1; fi

LOG_DIR="${HOME}/.bne/logs"
mkdir -p "$LOG_DIR"
LOG="${LOG_DIR}/image-refresh-$(date +%Y%m%d).log"

{
  echo ""
  echo "════════ $(date -u +%FT%TZ) শুরু (node: $NODE) ════════"

  # ── একই সময়ে দুইবার চললে সংঘর্ষ এড়ানো ────────────────────────────────
  LOCK="${TMPDIR:-/tmp}/bne-image-refresh.lock"
  if ! mkdir "$LOCK" 2>/dev/null; then
    echo "⏭️  আগের রান এখনো চলছে — এই রান বাদ।"
    exit 0
  fi
  trap 'rmdir "$LOCK" 2>/dev/null' EXIT

  # ── ১. লাইভ তালিকা আনা ────────────────────────────────────────────────
  echo "── ধাপ ১: লাইভ /api/config আনা ──"
  "$NODE" -e '
    const fs=require("fs");
    (async()=>{
      const r=await fetch("https://bne.147-224-13-31.nip.io/api/config",
        {headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(90000)});
      if(!r.ok) throw new Error("HTTP "+r.status);
      const j=await r.json();
      const list=Array.isArray(j)?j:(j.editorNews||j.news||[]);
      if(!list.length) throw new Error("তালিকা খালি");
      fs.writeFileSync("data/bne-live.json", JSON.stringify(
        {version:j.version,updatedAt:j.updatedAt,settings:j.settings||{},editorNews:list}, null, 1));
      const noImg=list.filter(a=>!String(a.image||"").trim()).length;
      console.log("   আইটেম: "+list.length+" | ছবি ছাড়া: "+noImg);
    })().catch(e=>{ console.error("   ⚠️ "+e.message); process.exit(1); });
  ' || { echo "⚠️ লাইভ তালিকা আনা যায়নি — এই রান বাতিল।"; exit 0; }

  # ── ২. নতুন সংবাদের আসল ছবি নামানো ───────────────────────────────────
  echo "── ধাপ ২: ছবি সংগ্রহ ──"
  "$NODE" tools/fetch-news-images.js --config=data/bne-live.json \
    --concurrency=6 --timeout=12000 || echo "⚠️ ছবি সংগ্রহ ব্যর্থ"

  # ── ৩. Oracle-এ তোলা + DB হালনাগাদ (কেবল নতুন) ────────────────────────
  echo "── ধাপ ৩: Oracle-এ আপলোড ──"
  "$NODE" tools/push-images-to-oracle.js --config=data/bne-live.json \
    || echo "⚠️ Oracle আপলোড ব্যর্থ"

  echo "════════ $(date -u +%FT%TZ) শেষ ════════"
} >> "$LOG" 2>&1
