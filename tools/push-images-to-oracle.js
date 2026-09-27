#!/usr/bin/env node
'use strict';
/**
 * BNE — নামানো সংবাদের ছবি Oracle সার্ভারে তোলা ও DB-তে বসানো
 * ════════════════════════════════════════════════════════════════════════════
 * কেন এই ধাপটি দরকার (স্থাপত্য-সিদ্ধান্ত, ২০২৬-০৯-২৬)
 * ---------------------------------------------------------------------------
 * tools/fetch-news-images.js ছবি নামায় এই ম্যাক থেকে — কারণ কেবল বাংলাদেশের
 * রেসিডেন্সিয়াল IP থেকেই মূল সংবাদপত্রের পাতা খোলা যায় (যাচাই করা হয়েছে:
 * Oracle সার্ভার ও GitHub রানার — দুটোই ডেটাসেন্টার IP, ৪০৩ পায়)।
 *
 * কিন্তু লাইভ সাইটে ডেটা যায় এভাবে:
 *     Oracle DB  →  /api/config  →  GitHub Actions (প্রতি ৫ মিনিটে)
 *                →  data/bne-config.json  →  Netlify  →  সাইট + OG + পোস্ট
 * অর্থাৎ **ছবির তথ্য টিকিয়ে রাখার একমাত্র জায়গা Oracle-এর DB**। আমরা যদি
 * কেবল রেপোতে ছবি রাখি, পরের সিঙ্কেই সেটি মুছে যায় (আসলেই মুছে গিয়েছিল)।
 *
 * তাই: (১) নামানো ১২০০x৬৩০ JPEG গুলো Oracle-এর /opt/bne/data/img/-এ তোলা হয়,
 *       (২) articles.image = "/img/<id>-1200x630.jpg" করে দেওয়া হয়।
 * তারপর সব স্বয়ংক্রিয়:
 *   • Netlify-র /img/* প্রক্সি (netlify.toml) নিজেই ছবি সার্ভ করে — সাইটে,
 *     og:image-এ, Telegram/Facebook কার্ডে একই আসল ছবি যায়
 *   • ফাইলনামে "1200x630" থাকায় _og-lib.js সঠিক মাপ ঘোষণা করে
 *   • enrich-images.js "/img/…" কে নিজের স্টোরেজ ধরে হাত দেয় না
 *
 * ⚠️ ফাইলনাম সংবাদের id থেকে (ASCII) — বাংলা slug শতাংশ-এনকোডিং জটিলতা এড়াতে।
 *
 * ব্যবহার:  node tools/push-images-to-oracle.js [--dry] [--limit=50]
 * ════════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
/* --config=<path> — fetch-news-images.js-এর মতোই (লাইভ /api/config-এ কাজ করার জন্য) */
const CONFIG_ARG = (() => {
  const a = process.argv.slice(2).find((x) => x.startsWith('--config='));
  return a ? a.split('=').slice(1).join('=') : '';
})();
const CONFIG_FILE = CONFIG_ARG
  ? (path.isAbsolute(CONFIG_ARG) ? CONFIG_ARG : path.join(ROOT, CONFIG_ARG))
  : path.join(ROOT, 'data', 'bne-config.json');

const HOST = process.env.BNE_SSH_HOST || 'ubuntu@147.224.13.31';
const KEY = process.env.BNE_SSH_KEY || path.join(os.homedir(), '.ssh', 'voiceos_apex');
const REMOTE_IMG_DIR = '/opt/bne/data/img';
const REMOTE_STAGE = '/tmp/bne-img-push';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
/* --force: সার্ভারে আগেই থাকলেও আবার পাঠানো হয় (ডিফল্টে বাদ দেওয়া হয়)।
   কেন গুরুত্বপূর্ণ: প্রতিদিন নতুন সংবাদ যোগ হয়; প্রতি রানে ৬৩ MB পাঠানো
   অর্থহীন ও ধীর। ডিফল্ট আচরণ কেবল না-থাকা ফাইলগুলোই পাঠায়। */
const FORCE = args.includes('--force');
/* --apply-only: ছবি আপলোড বাদ দিয়ে কেবল সার্ভারে বসানো + DB হালনাগাদ।
   কেন দরকার: ৬৩ MB আপলোড (৪৬ মিনিট) একটি ধাপ; পরে কোনো কারণে apply
   ব্যর্থ হলে আবার পুরোটা পাঠানো অর্থহীন। তখন এই পতাকা দিয়ে কেবল
   দ্বিতীয় ধাপটি চালানো হয় (।ে /tmp/bne-img-push/ আগেই প্রস্তুত থাকে)। */
const APPLY_ONLY = args.includes('--apply-only');
const LIMIT = (() => {
  const a = args.find((x) => x.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1], 10) || 0 : 0;
})();

function ssh(cmd, opts = {}) {
  return execFileSync('ssh', [
    '-i', KEY, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=20', HOST, cmd,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
}

/* ── ফাইল পাঠানোর পদ্ধতি: tar একক স্ট্রিম ────────────────────────────────
   কেন scp নয় (লাইভ পরিমাপ, ২০২৬-০৯-২৬):
     ৪৯৩টি ছোট ফাইল scp -r দিয়ে পাঠাতে ১০ মিনিটে মাত্র ৭৯টি ফাইল গিয়েছিল
     (~১.১ MB/মিনিট) — প্রতি ফাইলে আলাদা SSH রাউন্ড-ট্রিপ তার কারণ।
     একই ডেটা tar একক স্ট্রিমে গেলে ~১.৪ MB/মিনিট — ২৫% দ্রুত এবং
     সংযোগ ভাঙলে পুনরায় শুরু করা সহজ। ব্যান্ডউইথই আসল সীমা (আপলোড
     ~১৯০ kbit/s), তাই এটি সর্বোচ্চ ব্যবহারযোগ্য পথ। */
function streamDir(localDir, remoteDir) {
  const cmd = 'tar czf - -C ' + JSON.stringify(localDir) + ' . | ' +
    'ssh -i ' + JSON.stringify(KEY) + ' -o StrictHostKeyChecking=no -o ConnectTimeout=20 ' +
    HOST + ' ' + JSON.stringify('mkdir -p ' + remoteDir + ' && tar xzf - -C ' + remoteDir);
  const r = require('child_process').spawnSync('bash', ['-c', cmd], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('tar/ssh স্ট্রিম ব্যর্থ (exit ' + r.status + ')');
}

/* একক ফাইল পাঠানো — একই স্ট্রিম-পদ্ধতিতে (কোনো আলাদা scp নির্ভরতা নেই)।
   ⚠️ পাঠানোর লজিক দুই জায়গায় আলাদা ফাংশনে রাখা হয়েছিল, ফলে একটির নাম
   বদলালে অন্যটি ভেঙে পড়ে (ঠিক সেটাই হয়েছিল: ৬৩ MB আপলোডের পর
   "scp is not defined")। এখন দুই জায়গাতেই একই পথ ব্যবহার হয়। */
function putFile(localPath, remotePath) {
  const cmd = 'cat ' + JSON.stringify(localPath) + ' | ' +
    'ssh -i ' + JSON.stringify(KEY) + ' -o StrictHostKeyChecking=no -o ConnectTimeout=20 ' +
    HOST + ' ' + JSON.stringify('cat > ' + remotePath);
  const r = require('child_process').spawnSync('bash', ['-c', cmd], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ফাইল পাঠানো ব্যর্থ (exit ' + r.status + ')');
}

function main() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('❌ কনফিগ নেই: ' + CONFIG_FILE);
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const news = Array.isArray(cfg.editorNews) ? cfg.editorNews : [];

  /* ── যেসব সংবাদের ছবি আমাদের নিজের ফোল্ডারে আছে সেগুলোই তোলা হবে ──────── */
  let todo = news.filter((a) => {
    const img = String(a.image || '');
    if (!/^\/images\/news\//i.test(img)) return false;
    const p = path.join(ROOT, img.replace(/^\//, ''));
    return fs.existsSync(p) && fs.statSync(p).size > 3000;
  });
  if (LIMIT && todo.length > LIMIT) todo = todo.slice(0, LIMIT);

  /* ── ধাপ ১: সার্ভারে আগে থেকেই কী আছে (এক সংযোগে) ─────────────────────
     এতে প্রতিটি রানে ৬৩ MB পাঠাতে হয় না — কেবল নতুন ছবিগুলোই যায়। */
  let existing = new Set();
  if (!FORCE && !APPLY_ONLY) {
    try {
      const out = ssh('sudo -u bne ls ' + REMOTE_IMG_DIR + ' 2>/dev/null');
      out.split('\n').forEach((f) => { const t = f.trim(); if (t) existing.add(t); });
      console.log('🔎 সার্ভারে আগেই আছে: ' + existing.size + 'টি ফাইল');
    } catch (e) {
      console.log('⚠️  সার্ভারের তালিকা আনা যায়নি (' + String(e.message).slice(0, 60) + ') — সব পাঠানো হবে');
      existing = new Set();
    }
    todo = todo.filter((a) => {
      const id = String(a.id || '').replace(/[^A-Za-z0-9._-]/g, '');
      return id && !existing.has(id + '-1200x630.jpg');
    });
  }

  console.log('📤 সংবাদের ছবি Oracle-এ তোলা হচ্ছে');
  console.log('   মোট সংবাদ      : ' + news.length);
  console.log('   তোলার মতো ছবি   : ' + todo.length + (FORCE ? ' (--force)' : ' (নতুন/অনুপস্থিত)'));
  console.log('   গন্তব্য          : ' + HOST + ':' + REMOTE_IMG_DIR);
  if (!todo.length) { console.log('ℹ️  সব ছবি আগেই সার্ভারে আছে — কিছু পাঠানোর দরকার নেই।'); return; }

  /* ── স্টেজিং: ফাইলনাম হবে <id>-1200x630.jpg (ASCII, ইউনিক) ────────────── */
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'bne-oracle-'));
  const manifest = [];
  const used = new Set();
  for (const a of todo) {
    const id = String(a.id || '').replace(/[^A-Za-z0-9._-]/g, '');
    if (!id || used.has(id)) continue;
    used.add(id);
    const src = path.join(ROOT, String(a.image).replace(/^\//, ''));
    const fname = id + '-1200x630.jpg';
    fs.copyFileSync(src, path.join(stage, fname));
    manifest.push({ id: String(a.id), file: fname, credit: a.imageCredit || '', isCover: !!a.imageIsCover });
  }
  fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log('   স্টেজিং প্রস্তুত  : ' + manifest.length + 'টি ফাইল (' +
    (manifest.reduce((s, m) => s + fs.statSync(path.join(stage, m.file)).size, 0) / 1048576).toFixed(1) + ' MB)');

  if (DRY) { console.log('ℹ️  --dry — কিছুই পাঠানো হয়নি।'); return; }

  /* ── আপলোড ──────────────────────────────────────────────────────────── */
  if (APPLY_ONLY) {
    console.log('⏭️  --apply-only: আপলোড বাদ — সার্ভারে আগেই তোলা ফাইল ব্যবহার হবে');
    const remoteCount = ssh('ls ' + REMOTE_STAGE + ' 2>/dev/null | wc -l').trim();
    console.log('   সার্ভারে স্টেজিংয়ে আছে: ' + remoteCount + 'টি ফাইল');
    if (Number(remoteCount) < 10) throw new Error('।ে স্টেজিং খালি — আগে আপলোড চালান');
  } else {
    const mb = manifest.reduce((s, m) => s + fs.statSync(path.join(stage, m.file)).size, 0) / 1048576;
    console.log('⬆️  আপলোড চলছে… ~' + mb.toFixed(1) + ' MB, আনুমানিক ' + Math.ceil(mb / 1.4) + ' মিনিট (আপলোড গতি সীমিত)');
    /* ⚠️ পারমিশন বাধ্যতামূলক (লাইভে দুবার আটকেছিল):
       স্টেজিং ফোল্ডার যদি 700 হয়, তবে সংবাদ-সার্ভিসের ব্যবহারকারী (bne)
       সেটি পড়তে পারে না → apply.js চালু হয় না, "MODULE_NOT_FOUND" আসে।
       তাই আপলোডের সাথেই ফোল্ডার 755 ও ফাইলগুলো 644 করা হয়। */
    ssh('rm -rf ' + REMOTE_STAGE + ' && mkdir -p ' + REMOTE_STAGE);
    streamDir(stage, REMOTE_STAGE);
    ssh('chmod 755 ' + REMOTE_STAGE + ' && chmod 644 ' + REMOTE_STAGE + '/* 2>/dev/null || true');
    console.log('   ✅ আপলোড সম্পন্ন');
  }

  /* ── ছবি ঠিক জায়গায় বসানো + DB হালনাগাদ ─────────────────────────────
     সব কাজ একই SSH সেশনে, একটি Node স্ক্রিপ্টে — যাতে ৪৯০টি আলাদা
     সংযোগ না খুলতে হয় (দ্রুত ও নিরাপদ)। */
  const apply = `
'use strict';
const fs = require('fs');
const path = require('path');
const STAGE = ${JSON.stringify(REMOTE_STAGE)};
const IMG_DIR = ${JSON.stringify(REMOTE_IMG_DIR)};
const db = require('/opt/bne/app/node_modules/better-sqlite3')('/opt/bne/data/bne.sqlite');
const manifest = JSON.parse(fs.readFileSync(path.join(STAGE, 'manifest.json'), 'utf8'));

/* ১. ছবি গন্তব্যে সরানো */
let moved = 0;
for (const m of manifest) {
  const from = path.join(STAGE, m.file);
  const to = path.join(IMG_DIR, m.file);
  try { fs.copyFileSync(from, to); moved++; } catch (e) { console.log('copy-fail', m.file, e.message); }
}

/* ২. DB হালনাগাদ — একটিমাত্র ট্রানজ্যাকশন
   ⚠️ articles টেবিলে config_version কলাম নেই (যাচাই করা schema:
      id,slug,title,category,tags,body,summary,image,og_image,status,…,revision,…)
      তাই revision বাড়ানো হয় (রিভিশন বাড়লে ক্যাশ নিজে থেকেই বাতিল হয়)। */
const upd = db.prepare('UPDATE articles SET image = ?, revision = revision + 1 WHERE id = ?');
let dbOk = 0, missed = [];
const tx = db.transaction((rows) => {
  for (const m of rows) {
    const r = upd.run('/img/' + encodeURIComponent(m.file), m.id);
    if (r.changes) dbOk++; else missed.push(m.id);
  }
});
tx(manifest);

/* ৩. config_version বাড়ানো — সাইট/ফিডের ক্যাশ বাতিলের সংকেত
   settings টেবিলের গঠন: key, value, updated_at (key PRIMARY KEY ধরে নেওয়া
   হয় না; তাই UPDATE → না মিললে INSERT)। */
function setSetting(key, value, ts) {
  const r = db.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?').run(value, ts, key);
  if (!r.changes) db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, ts);
}
try {
  const cur = Number((db.prepare("SELECT value FROM settings WHERE key = 'config_version'").get() || {}).value || 0);
  const ts = new Date().toISOString();
  setSetting('config_version', String(cur + 1), ts);
  setSetting('config_updated_at', ts, ts);
  console.log('🔁 config_version: ' + cur + ' → ' + (cur + 1));
} catch (e) { console.log('⚠️ config_version বাড়ানো যায়নি: ' + e.message); }

const total = db.prepare('SELECT COUNT(*) c FROM articles').get().c;
const withImg = db.prepare("SELECT COUNT(*) c FROM articles WHERE image LIKE '/img/%'").get().c;
console.log('✅ সার্ভার: সরানো ' + moved + ' | DB হালনাগাদ ' + dbOk +
  ' | মেলেনি ' + missed.length + (missed.length ? ' (' + missed.slice(0,5).join(',') + ')' : ''));
console.log('📊 এখন /img/ ছবিসহ সংবাদ: ' + withImg + ' / ' + total);
`;
  const applyPath = path.join(stage, 'apply.js');
  fs.writeFileSync(applyPath, apply);
  /* manifest.json ও apply.js সবসময় আবার পাঠানো হয় — ছোট (~৪০ KB) এবং
     এতে --apply-only চালালেও সবকিছু ঠিকঠাক থাকে */
  putFile(path.join(stage, 'manifest.json'), REMOTE_STAGE + '/manifest.json');
  putFile(applyPath, REMOTE_STAGE + '/apply.js');

  console.log('🗄️  Oracle-এ ছবি বসানো ও DB হালনাগাদ…');
  /* apply-এর আগেও পারমিশন নিশ্চিত করা হয় (--apply-only পথে এটিই একমাত্র জায়গা) */
  const out = ssh('chmod 755 ' + REMOTE_STAGE + ' && chmod 644 ' + REMOTE_STAGE + '/* 2>/dev/null; ' +
    'sudo -u bne node ' + REMOTE_STAGE + '/apply.js && sudo -u bne ls ' + REMOTE_IMG_DIR +
    ' | wc -l && sudo rm -rf ' + REMOTE_STAGE);
  console.log(out.trim().split('\n').map((l) => '   ' + l).join('\n'));

  try { fs.rmSync(stage, { recursive: true, force: true }); } catch (e) { /* ignore */ }

  console.log('');
  console.log('✅ সম্পন্ন। এখন যা ঘটবে (স্বয়ংক্রিয়):');
  console.log('   • GitHub Actions প্রতি ৫ মিনিটে Oracle থেকে /api/config আনবে');
  console.log('   • data/bne-config.json-এ image = /img/<id>-1200x630.jpg বসবে');
  console.log('   • Netlify /img/* প্রক্সি দিয়ে ছবি সার্ভ করবে (সাইট, og:image,');
  console.log('     Telegram ও Facebook কার্ড — সবখানে একই আসল ছবি)');
}

try { main(); } catch (e) {
  console.error('❌ ব্যর্থ:', e && e.message || e);
  if (e && e.stderr) console.error(String(e.stderr).slice(0, 600));
  process.exit(1);
}
