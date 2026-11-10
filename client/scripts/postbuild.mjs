// Runs after `vite build`: per-quiz HTML pages (link previews), sitemap, robots.txt, calendar feeds,
// the upcoming/past data split, poster thumbnails.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ORIGIN = 'https://quizfinder.pages.dev';
const client = join(import.meta.dirname, '..');
const dist = join(client, 'dist');

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const isClock = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return !!m && m[1] < 24 && m[2] < 60; };

function summary(q) {
  let when = q.date && new Date(`${q.date}T00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).replace(',', '');
  if (q.time) {
    const [h, m] = q.time.split(':');
    const time = isClock(q.time) ? `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}` : q.time;
    when = when ? `${when}, ${time}` : time;
  }
  const city = q.city && !q.venue?.includes(q.city) ? q.city : null;
  return [when, q.venue, city, q.hostingOrg].filter(Boolean).join(' · ') || 'Quiz listing on Quiz Finder India';
}

function jsonLd(q, url, image) {
  const event = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: q.name,
    startDate: isClock(q.time) ? `${q.date}T${q.time.padStart(5, '0')}+05:30` : q.date,
    eventAttendanceMode: `https://schema.org/${{ online: 'Online', hybrid: 'Mixed' }[q.mode] || 'Offline'}EventAttendanceMode`,
    location: q.mode === 'online'
      ? { '@type': 'VirtualLocation', url: /^https?:\/\//.test(q.regLink) ? q.regLink : url }
      : { '@type': 'Place', name: q.venue || q.city || 'India', address: q.city || q.venue || 'India' },
    organizer: q.hostingOrg ? { '@type': 'Organization', name: q.hostingOrg } : undefined,
    description: q.description || undefined,
    image,
    url,
  };
  return `<script type="application/ld+json">${JSON.stringify(event).replace(/</g, '\\u003c')}</script>`;
}

const template = readFileSync(join(dist, 'index.html'), 'utf-8');
const block = /<!-- page-meta[^]*<!-- \/page-meta -->/;
if (!block.test(template)) throw new Error('page-meta block not found in dist/index.html');

const quizzes = JSON.parse(readFileSync(join(dist, 'data', 'quizzes.json'), 'utf-8')).filter(q => q.status === 'published')
  // A poster missing from dist/posters would be served as the app HTML, so drop the reference.
  .map(q => q.posterImage && !existsSync(join(dist, q.posterImage)) ? { ...q, posterImage: null } : q);
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const urls = [`${ORIGIN}/`];

for (const q of quizzes) try {
  const url = `${ORIGIN}/quiz/${q.id}/`;
  const image = `${ORIGIN}/${q.posterImage || 'og.png'}`;
  const [title, desc] = [esc(q.name), esc(summary(q))];
  const meta = `<title>${title}</title>
    <meta name="description" content="${desc}" />
    <link rel="canonical" href="${esc(url)}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:image" content="${esc(image)}" />
    <meta name="twitter:card" content="summary_large_image" />
    ${q.date ? jsonLd(q, url, image) : ''}`;
  mkdirSync(join(dist, 'quiz', q.id), { recursive: true });
  writeFileSync(join(dist, 'quiz', q.id, 'index.html'), template.replace(block, () => meta));
  if (q.date >= today) urls.push(url);
} catch (err) {
  console.warn(`postbuild: skipped page for quiz ${q.id}: ${err.message}`);
}

writeFileSync(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);

// Calendar feeds (RFC 5545): cal/all.ics plus cal/<city>.ics, which also carries the online ones (as the site's list does).
const yesterday = new Date(Date.parse(today) - 864e5).toISOString().slice(0, 10);
const upcoming = q => q.date ? q.date >= yesterday : Date.now() - Date.parse(q.sourceTimestamp || q.createdAt) < 14 * 864e5;
const text = s => String(s).replace(/[\\;,]/g, '\\$&').replace(/\r\n|\r|\n/g, '\\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
const fold = line => {
  const out = [];
  let cur = '', n = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; n = 0; }
    cur += ch; n += b;
  }
  return [...out, cur].join('\r\n ');
};
const compact = d => d.replace(/-/g, '');
const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
const dated = quizzes.filter(q => q.date && upcoming(q));
function event(q) {
  const url = `${ORIGIN}/quiz/${q.id}/`;
  let when;
  if (isClock(q.time)) {
    const start = new Date(`${q.date}T${q.time.padStart(5, '0')}:00Z`);
    const f = d => d.toISOString().replace(/[-:]|\.\d+Z/g, '');
    when = [`DTSTART;TZID=Asia/Kolkata:${f(start)}`, `DTEND;TZID=Asia/Kolkata:${f(new Date(+start + 2 * 36e5))}`];
  } else {
    const next = new Date(Date.parse(q.date) + 864e5).toISOString().slice(0, 10);
    when = [`DTSTART;VALUE=DATE:${compact(q.date)}`, `DTEND;VALUE=DATE:${compact(next)}`];
  }
  const desc = [q.hostingOrg && `Host: ${q.hostingOrg}`, /^https?:\/\//.test(q.regLink) && `Register: ${q.regLink}`, url].filter(Boolean).join('\n');
  return ['BEGIN:VEVENT', `UID:${q.id}@quizfinder.pages.dev`, `DTSTAMP:${stamp}`, ...when,
    `SUMMARY:${text(q.name)}`, q.venue && `LOCATION:${text(q.venue)}`, `URL:${url}`, `DESCRIPTION:${text(desc)}`, 'END:VEVENT'];
}
function feed(file, name, list) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Quiz Finder India//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${text(name)}`,
    'BEGIN:VTIMEZONE', 'TZID:Asia/Kolkata', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0530', 'TZOFFSETTO:+0530', 'TZNAME:IST', 'END:STANDARD', 'END:VTIMEZONE',
    ...list.flatMap(q => {
      try { return event(q); } catch (err) { console.warn(`postbuild: skipped calendar event for quiz ${q.id}: ${err.message}`); return []; }
    }), 'END:VCALENDAR'];
  writeFileSync(join(dist, 'cal', file), lines.filter(Boolean).map(fold).join('\r\n') + '\r\n');
}
mkdirSync(join(dist, 'cal'), { recursive: true });
feed('all.ics', 'Quiz Finder India', dated);
const cities = [...new Set(dated.map(q => q.city).filter(c => c && c !== 'Online'))];
for (const c of cities) feed(`${c.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`, `Quizzes in ${c}`, dated.filter(q => q.city === c || q.city === 'Online' || q.mode === 'online'));

// The client loads only upcoming quizzes; past ones are fetched on demand. Flagged quizzes are in neither.
const [now, past] = [quizzes.filter(upcoming), quizzes.filter(q => !upcoming(q))];
writeFileSync(join(dist, 'data', 'quizzes.json'), JSON.stringify(now));
writeFileSync(join(dist, 'data', 'past.json'), JSON.stringify(past));

// Thumbnails are cached by poster file name, so a rebuild only converts new posters.
const posters = join(dist, 'posters');
const cache = join(client, '.cache', 'thumbs');
mkdirSync(cache, { recursive: true });
mkdirSync(join(posters, 'thumbs'), { recursive: true });
let made = 0, reused = 0;
for (const file of existsSync(posters) ? readdirSync(posters).filter(f => f.endsWith('.jpg')) : []) {
  const cached = join(cache, file);
  if (existsSync(cached)) reused++;
  else {
    const r = spawnSync('magick', [`jpeg:${join(posters, file)}`, '-auto-orient', '-resize', '480x>', '-strip', '-quality', '80', cached], { timeout: 60_000 });
    if (r.error || r.status !== 0) { console.warn(`postbuild: no thumbnail for ${file}: ${r.error?.message || r.stderr}`); continue; }
    made++;
  }
  copyFileSync(cached, join(posters, 'thumbs', file));
}

console.log(`postbuild: ${quizzes.length} quiz pages, ${urls.length} sitemap URLs, thumbnails ${made} made / ${reused} reused`);
