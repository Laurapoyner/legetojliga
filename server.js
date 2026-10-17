// Lille webserver uden afhængigheder, så spillet kan køres lokalt (npm start)
// eller som "Web Service" på Render. Kameraet virker på http://localhost og på https.
//
// Oplæsning med Azure: sæt miljøvariablerne AZURE_SPEECH_KEY og AZURE_SPEECH_REGION.
// Nøglen bliver på serveren og sendes aldrig til browseren.
// Senere: her kan API'et til MongoDB tilføjes, når testfasen er slut.

import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const BLOCKED = ['/node_modules', '/tests', '/.git', '/package.json', '/server.js', '/.env'];

// ---------- Azure-oplæsning ----------

const AZ_KEY = (process.env.AZURE_SPEECH_KEY || '').trim();
const AZ_REGION = (process.env.AZURE_SPEECH_REGION || '').trim();
const AZ_ENDPOINT = (process.env.AZURE_SPEECH_ENDPOINT || (AZ_REGION ? `https://${AZ_REGION}.tts.speech.microsoft.com/cognitiveservices/v1` : '')).trim();
const AZ_ON = Boolean(AZ_KEY && AZ_ENDPOINT);
// Standard: højst 15.000 tegn om dagen – så holder I jer inden for Azures gratis 500.000 tegn om måneden
const DAILY_CHARS = Number(process.env.AZURE_DAILY_CHAR_LIMIT) || 15000;

const VOICES = new Set(['da-DK-ChristelNeural', 'da-DK-JeppeNeural']);
const RATES = { slow: '-20%', normal: '-5%' };
const MAX_TEXT = 200;

const ttsCache = new Map(); // nøgle -> Buffer (mp3)
const MAX_CACHE = 800;
const hits = new Map(); // ip -> tidspunkter
let usage = { day: new Date().toISOString().slice(0, 10), chars: 0 };

const escXml = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('for stor'), { code: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 150;
}

async function handleTts(req, res) {
  if (!AZ_ON) return json(res, 503, { error: 'Azure er ikke sat op på serveren' });
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return json(res, e.code === 413 ? 413 : 400, { error: 'Ugyldig forespørgsel' });
  }
  const text = typeof body?.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
  const voice = VOICES.has(body?.voice) ? body.voice : 'da-DK-ChristelNeural';
  const rate = RATES[body?.rate] ? body.rate : 'normal';
  if (!text || text.length > MAX_TEXT) return json(res, 400, { error: `Teksten skal være 1–${MAX_TEXT} tegn` });

  const key = createHash('sha1').update(`${voice}|${rate}|${text}`).digest('hex');
  const send = (buf) => {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=86400' });
    res.end(buf);
  };
  if (ttsCache.has(key)) {
    const buf = ttsCache.get(key);
    ttsCache.delete(key);
    ttsCache.set(key, buf);
    return send(buf);
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (rateLimited(ip)) return json(res, 429, { error: 'For mange forespørgsler – prøv igen om lidt' });
  const today = new Date().toISOString().slice(0, 10);
  if (usage.day !== today) usage = { day: today, chars: 0 };
  if (usage.chars + text.length > DAILY_CHARS) return json(res, 429, { error: 'Dagens grænse for oplæsning er nået' });

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="da-DK"><voice name="${voice}"><prosody rate="${RATES[rate]}">${escXml(text)}</prosody></voice></speak>`;
  try {
    const r = await fetch(AZ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZ_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'legetoejsligaen',
      },
      body: ssml,
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      console.error('Azure svarede', r.status, await r.text().catch(() => ''));
      return json(res, 502, { error: `Azure svarede ${r.status}` });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    usage.chars += text.length;
    ttsCache.set(key, buf);
    while (ttsCache.size > MAX_CACHE) ttsCache.delete(ttsCache.keys().next().value);
    return send(buf);
  } catch (e) {
    console.error('Azure-fejl', e);
    return json(res, 502, { error: 'Azure kunne ikke nås' });
  }
}

// ---------- Server ----------

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);

    if (path === '/api/tts/status' && req.method === 'GET') {
      return json(res, 200, { azure: AZ_ON, voices: [...VOICES], todayChars: usage.chars, dailyLimit: DAILY_CHARS });
    }
    if (path === '/api/tts' && req.method === 'POST') return handleTts(req, res);
    if (path.startsWith('/api/')) return json(res, 404, { error: 'Ikke fundet' });

    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT) || BLOCKED.some((b) => path.startsWith(b))) {
      res.writeHead(404).end('Ikke fundet');
      return;
    }
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Ikke fundet');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Permissions-Policy': 'camera=(self)',
    });
    res.end(body);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end('Serverfejl');
  }
});

server.listen(PORT, () => {
  console.log(`LegetøjsLigaen kører på http://localhost:${PORT}`);
  console.log(AZ_ON ? `Azure-oplæsning er slået til (${AZ_REGION || 'eget endpoint'})` : 'Azure-oplæsning er ikke sat op – spillet bruger enhedens egen stemme');
});
