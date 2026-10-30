// Metaphysical Field Survey: serves the site and stores anonymous test results in Postgres.
// Environment:
//   PORT          set by Railway
//   DATABASE_URL  Railway Postgres connection string (use the reference ${{Postgres.DATABASE_URL}})
//   ADMIN_KEY     password for the private /results page
//   PGSSL=1       only if your database needs SSL (Railway's private network does not)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const ROOT = __dirname;
const MAX_BODY = 32 * 1024;

/* ---------- database ---------- */
let pool = null, dbReady = false, dbError = null;
async function initDb() {
  if (!process.env.DATABASE_URL) { dbError = 'DATABASE_URL is not set'; return; }
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5,
    ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : false });
  pool.on('error', e => { console.error('postgres pool error:', e.message); });
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await pool.query(`
        create table if not exists responses (
          id            bigserial primary key,
          created_at    timestamptz not null default now(),
          rid           uuid not null,
          version       text not null,
          religion      text,
          duration_s    integer,
          belief_x real, belief_y real, belief_z real,
          decide_x real, decide_y real, decide_z real,
          good_top      text,
          good_second   text,
          region        text,
          decide_region text,
          goods         jsonb,
          styles        jsonb,
          spread        jsonb,
          answers       jsonb not null
        );
        alter table responses add column if not exists age_range text;
        alter table responses add column if not exists gender text;
        alter table responses add column if not exists grew_up text;
        alter table responses add column if not exists public_ok boolean not null default false;
        create index if not exists responses_rid on responses (rid);
        create index if not exists responses_created on responses (created_at);`);
      dbReady = true; dbError = null; console.log('database ready'); return;
    } catch (e) {
      dbError = e.message; console.error(`database not ready (attempt ${attempt}):`, e.message);
      await new Promise(r => setTimeout(r, Math.min(30000, 2000 * attempt)));
    }
  }
}

/* ---------- validation ---------- */
const RELIGIONS = ['Latter-day Saint', 'Catholic', 'Protestant or Evangelical', 'Orthodox Christian', 'Other Christian',
  'Jewish', 'Muslim', 'Hindu', 'Buddhist', 'Sikh', 'Spiritual but not religious', 'Not religious', 'Other'];
const DEMO = JSON.parse(fs.readFileSync(path.join(ROOT, 'demographics.json'), 'utf8'));
const GOODS = ['G', 'V', 'L', 'H', 'F', 'J', 'W', 'K', 'A'];
const STYLES = ['P', 'F', 'C', 'I', 'O', 'M'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const pt = v => Array.isArray(v) && v.length === 3 && v.every(x => num(x, -100, 100));
const tallyOk = (o, keys, hi) => o && typeof o === 'object' && !Array.isArray(o) &&
  Object.keys(o).every(k => keys.includes(k) && num(o[k], 0, hi));
function answerOk(a) {
  if (a === null || a === -1) return true;
  if (Number.isInteger(a)) return a >= 0 && a <= 20;
  if (a && typeof a === 'object' && Array.isArray(a.sel)) {
    return a.sel.length <= 3 && a.sel.every(k => Number.isInteger(k) && k >= 0 && k <= 20) &&
      (a.main === null || a.main === undefined || (Number.isInteger(a.main) && a.main >= 0 && a.main <= 20));
  }
  return false;
}
function validate(b) {
  if (!b || typeof b !== 'object') return 'body';
  if (b.consent !== true || b.adult !== true) return 'consent';
  if (typeof b.rid !== 'string' || !UUID.test(b.rid)) return 'rid';
  if (typeof b.v !== 'string' || b.v.length > 24) return 'version';
  if (b.religion != null && !RELIGIONS.includes(b.religion)) return 'religion';
  if (b.age != null && !DEMO.ages.includes(b.age)) return 'age';
  if (b.gender != null && !DEMO.genders.includes(b.gender)) return 'gender';
  if (b.grew_up != null && !DEMO.places.includes(b.grew_up)) return 'grew_up';
  if (b.public != null && typeof b.public !== 'boolean') return 'public';
  if (!Array.isArray(b.ans) || b.ans.length < 10 || b.ans.length > 60 || !b.ans.every(answerOk)) return 'answers';
  if (!pt(b.res)) return 'belief';
  if (b.dres != null && !pt(b.dres)) return 'decision';
  if (b.sd != null && !(Array.isArray(b.sd) && b.sd.length === 3 && b.sd.every(x => num(x, 0, 300)))) return 'spread';
  if (b.gt != null && !tallyOk(b.gt, GOODS, 20)) return 'goods';
  if (b.tally != null && !tallyOk(b.tally, STYLES, 20)) return 'styles';
  if (b.dur != null && !num(b.dur, 0, 86400)) return 'duration';
  for (const k of ['zone', 'dzone']) if (b[k] != null && !(typeof b[k] === 'string' && /^[A-Z0-9—-]{1,6}$/.test(b[k]))) return k;
  return null;
}
function topTwo(gt) {
  if (!gt) return [null, null];
  const o = GOODS.filter(k => gt[k] > 0).sort((a, b) => gt[b] - gt[a]);
  return [o[0] || null, o[1] && gt[o[1]] >= gt[o[0]] * 0.5 ? o[1] : null];
}

/* ---------- light rate limit (in memory only; addresses are never stored) ---------- */
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 60 * 60 * 1000, max = 20;
  const arr = (hits.get(ip) || []).filter(t => now - t < win);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < win)) hits.delete(k);
  return arr.length > max;
}

/* ---------- helpers ---------- */
const SEC = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'interest-cohort=()', 'X-Frame-Options': 'SAMEORIGIN'
};
function send(res, status, body, type, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, SEC, extra || {}));
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    let over = false;
    req.on('data', c => { if (over) return; size += c.length; if (size > MAX_BODY) { over = true; const e = new Error('too large'); e.code = 413; reject(e); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function authed(req) {
  if (!ADMIN_KEY) return false;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const pass = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':').slice(1).join(':');
  const a = crypto.createHash('sha256').update(pass).digest(), b = crypto.createHash('sha256').update(ADMIN_KEY).digest();
  return crypto.timingSafeEqual(a, b);
}
function challenge(res) {
  send(res, 401, ADMIN_KEY ? 'Password required.' : 'Set the ADMIN_KEY variable in Railway to turn on the results page.',
    'text/plain; charset=utf-8', { 'WWW-Authenticate': 'Basic realm="Survey results", charset="UTF-8"' });
}
const csvCell = v => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);  // numbers are safe as-is
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // keep spreadsheet apps from running formulas
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const ROWS_SQL = `select id, created_at, rid, version, religion, duration_s, belief_x, belief_y, belief_z,
  decide_x, decide_y, decide_z, good_top, good_second, region, decide_region, goods, styles, spread, answers,
  age_range, gender, grew_up, public_ok,
  row_number() over (partition by rid order by created_at) as attempt
  from responses order by created_at desc limit 20000`;

/* ---------- link previews for shared results (?r=...) ---------- */
const TITLES = JSON.parse(fs.readFileSync(path.join(ROOT, 'titles.json'), 'utf8'));
const escHtml = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function previewMeta(r, req) {
  if (!r || r.length > 4000) return null;
  let d; try { d = JSON.parse(Buffer.from(r, 'base64url').toString('utf8')); } catch (e) { return null; }
  const title = d && TITLES[d.z]; if (!title) return null;
  const name = typeof d.n === 'string' ? d.n.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 30) : '';
  const art = /^[AEIOU]/.test(title) ? 'an' : 'a';
  const head = name ? `${name} is ${art} ${title}` : `I'm ${art} ${title}`;
  const desc = 'See their results on the Metaphysical Field Survey, then take the test and find where you land.';
  return [`<meta property="og:type" content="website">`, `<meta property="og:site_name" content="Metaphysical Field Survey">`,
    `<meta property="og:title" content="${escHtml(head)}">`, `<meta property="og:description" content="${escHtml(desc)}">`,
    `<meta name="twitter:card" content="summary">`, `<meta name="twitter:title" content="${escHtml(head)}">`,
    `<meta name="twitter:description" content="${escHtml(desc)}">`].join('\n');
}

/* ---------- routes ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, collecting: dbReady });

    if (req.method === 'POST' && p === '/api/responses') {
      if (!dbReady) return send(res, 503, { ok: false, error: 'not collecting yet' });
      // the last address in X-Forwarded-For is the one Railway's proxy saw, so it can't be faked by the client
      const ip = (req.headers['x-forwarded-for'] || '').split(',').map(v => v.trim()).filter(Boolean).pop() || req.socket.remoteAddress || '';
      if (limited(ip)) return send(res, 429, { ok: false, error: 'too many submissions' });
      let b; try { b = JSON.parse(await readBody(req)); } catch (e) {
        if (e.code === 413) { res.on('finish', () => req.destroy()); return send(res, 413, { ok: false, error: 'too large' }, null, { Connection: 'close' }); }
        return send(res, 400, { ok: false, error: 'bad json' }); }
      const bad = validate(b); if (bad) return send(res, 400, { ok: false, error: 'invalid ' + bad });
      const [g1, g2] = topTwo(b.gt);
      await pool.query(`insert into responses (rid, version, religion, duration_s, belief_x, belief_y, belief_z,
        decide_x, decide_y, decide_z, good_top, good_second, region, decide_region, goods, styles, spread, answers,
        age_range, gender, grew_up, public_ok)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [b.rid, b.v, b.religion || null, b.dur == null ? null : Math.round(b.dur), b.res[0], b.res[1], b.res[2],
         b.dres ? b.dres[0] : null, b.dres ? b.dres[1] : null, b.dres ? b.dres[2] : null, g1, g2,
         b.zone || null, b.dzone || null, b.gt ? JSON.stringify(b.gt) : null, b.tally ? JSON.stringify(b.tally) : null,
         b.sd ? JSON.stringify(b.sd) : null, JSON.stringify(b.ans),
         b.age || null, b.gender || null, b.grew_up || null, b.public === true]);
      return send(res, 201, { ok: true });
    }

    if (req.method === 'GET' && p === '/api/pins') {
      if (!dbReady) return send(res, 503, { ok: false, error: 'not collecting yet' });
      const q = url.searchParams, where = ['public_ok'], args = [];
      const F = [['religion', 'religion', RELIGIONS], ['age', 'age_range', DEMO.ages], ['gender', 'gender', DEMO.genders], ['grew_up', 'grew_up', DEMO.places]];
      let filtered = false;
      for (const [k, col, allowed] of F) {
        const v = q.get(k); if (!v) continue;
        if (!allowed.includes(v)) return send(res, 400, { ok: false, error: 'invalid ' + k });
        args.push(v); where.push(`${col} = $${args.length}`); filtered = true;
      }
      const dec = q.get('mode') === 'decision';
      const c = dec ? 'decide' : 'belief';
      if (dec) where.push('decide_x is not null');
      // each person once (their latest shared result); no ids, times or details go out
      const { rows } = await pool.query(`select ${c}_x as c0, ${c}_y as c1, ${c}_z as c2, good_top from (
          select distinct on (rid) * from responses where public_ok order by rid, created_at desc) latest
        where ${where.join(' and ')}`, args);
      const MIN = 5;
      if (filtered && rows.length < MIN) return send(res, 200, { ok: true, tooFew: true, min: MIN }, null, { 'Cache-Control': 'public, max-age=60' });
      const pins = rows.map(r => [Math.round(r.c0), Math.round(r.c1), Math.round(r.c2), r.good_top || null]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
      return send(res, 200, { ok: true, pins }, null, { 'Cache-Control': 'public, max-age=60' });
    }

    if (p === '/results' || p === '/api/results' || p === '/api/results.csv') {
      if (!authed(req)) return challenge(res);
      if (p === '/results') return send(res, 200, fs.readFileSync(path.join(ROOT, 'results.html')), 'text/html; charset=utf-8');
      if (!dbReady) return send(res, 503, { ok: false, error: dbError || 'database not ready' });
      const { rows } = await pool.query(ROWS_SQL);
      if (p === '/api/results') return send(res, 200, { ok: true, rows });
      const cols = ['id', 'created_at', 'rid', 'attempt', 'version', 'religion', 'duration_s', 'belief_x', 'belief_y', 'belief_z',
        'decide_x', 'decide_y', 'decide_z', 'good_top', 'good_second', 'region', 'decide_region', 'age_range', 'gender', 'grew_up', 'public_ok',
        'goods', 'styles', 'spread', 'answers'];
      const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => csvCell(c === 'created_at' ? new Date(r[c]).toISOString() : r[c])).join(','))).join('\r\n');
      return send(res, 200, '﻿' + csv, 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="survey-responses.csv"' });
    }

    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      const meta = previewMeta(url.searchParams.get('r'), req);
      if (meta) html = html.replace('</title>', '</title>\n' + meta);
      return send(res, 200, html, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });
    }
    return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  } catch (e) {
    console.error(e);
    return send(res, 500, { ok: false, error: 'server error' });
  }
});

server.listen(PORT, () => console.log('listening on ' + PORT));
initDb();
