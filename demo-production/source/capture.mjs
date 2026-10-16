import { launch } from './cdp.mjs';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
const LIVE = 'https://credentia-monad.netlify.app';
const LOCAL = 'http://localhost:3100';
const links = readFileSync('/private/tmp/claude-501/verify-links.txt', 'utf8').trim().split('\n');
const FPS = 24, ROOT = '/private/tmp/claude-501/demo/clips/';
rmSync(ROOT, { recursive: true, force: true }); mkdirSync(ROOT, { recursive: true });
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
// Tampered copy of credential 1's link: ONE detail (the recipient name) edited. Nothing is sent anywhere; the page just recomputes.
const [path1, d1] = links[0].split('?d=');
const payload = JSON.parse(Buffer.from(d1, 'base64url').toString());
payload.recipientName = 'Mallory';
const tampered = `${path1}?d=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
const meta = {};
const b = await launch();
const hideBadge = `(() => { const hide = (root) => { root.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) { if ((el.shadowRoot.textContent||'').includes('Netlify')) el.style.display='none'; hide(el.shadowRoot); } }); };
  hide(document); document.querySelectorAll('*').forEach((el) => { if (el.children.length < 4 && /Powered by/i.test(el.textContent||'') && /Netlify/i.test(el.textContent||'') && getComputedStyle(el).position==='fixed') el.style.display='none'; }); })()`;
const rect = (sel) => b.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return {x:r.x,y:r.y+0,w:r.width,h:r.height}; })()`);
async function scrollClip(name, y0, y1, secs, startIdx = 0) {
  const n = Math.round(secs * FPS);
  for (let i = 0; i < n; i++) {
    await b.scrollTo(Math.round(y0 + (y1 - y0) * ease(i / Math.max(1, n - 1)))); await b.sleep(45);
    await b.shot(`${ROOT}${name}/s${String(startIdx + i).padStart(4, '0')}.jpg`, 86);
  }
  return n;
}
async function page(name, url, waitFor) {
  mkdirSync(ROOT + name, { recursive: true });
  await b.goto(url); const ok = await b.waitText(waitFor, 45000); if (!ok) throw new Error(name + ': missing ' + waitFor);
  await b.sleep(1800); await b.eval(hideBadge); await b.sleep(300);
}
// 1. HOME: hero hold, then scroll through the story section
await page('home', LIVE + '/', 'Credentials you can trust');
await b.shot(ROOT + 'home/hold.jpg', 90);
const story = await b.eval(`(() => { const e = document.getElementById('how-it-works'); const r = e.getBoundingClientRect(); return {top: r.top + window.scrollY, h: r.height}; })()`);
const homeEnd = Math.round(story.top + story.h - 1080 - 120);
meta.home = { frames: await scrollClip('home', 0, homeEnd, 9.0), homeEnd };
// 2. V1: verified dialog (hold), close it, then scroll the page
await page('v1', LIVE + links[0], 'Credential verified');
await b.sleep(500); await b.shot(ROOT + 'v1/hold.jpg', 90);
meta.v1 = { dialogRects: { dialog: await rect('dialog') } };
await b.eval(`[...document.querySelectorAll('dialog button')].find((x) => /close/i.test(x.textContent))?.click()`); await b.sleep(700);
await b.shot(ROOT + 'v1/hold2.jpg', 90);
meta.v1.banner = await rect('div[role="status"]'); meta.v1.checks = await rect('section[aria-labelledby="checks-heading"]');
const h1 = await b.pageHeight(); meta.v1.frames = await scrollClip('v1', 0, Math.max(0, h1 - 1080), 5.0);
// 3. TAMPER
await page('tamper', LIVE + tampered, 'DETAILS DO NOT MATCH');
await b.shot(ROOT + 'tamper/hold.jpg', 90);
meta.tamper = { banner: await rect('div[role="status"]'), checks: await rect('section[aria-labelledby="checks-heading"]') };
const h2 = await b.pageHeight(); meta.tamper.frames = await scrollClip('tamper', 0, Math.max(0, Math.min(h2 - 1080, 600)), 3.5);
// 4. REVOKED
await page('v2', LIVE + links[1], 'REVOKED');
await b.shot(ROOT + 'v2/hold.jpg', 90);
meta.v2 = { banner: await rect('div[role="status"]'), checks: await rect('section[aria-labelledby="checks-heading"]') };
const h3 = await b.pageHeight(); meta.v2.frames = await scrollClip('v2', 0, Math.max(0, Math.min(h3 - 1080, 700)), 4.0);
// 5. LOCAL ENVIO TIMELINE (localhost app, local indexer)
await page('local', LOCAL + links[0], 'Credential verified'); await b.eval(`[...document.querySelectorAll('dialog button')].find((x) => /close/i.test(x.textContent))?.click()`); await b.sleep(900);
await b.eval(hideBadge);
const act = await b.eval(`(() => { const e = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && /recent activity/i.test(x.textContent||'')); if (!e) return null; const r = e.getBoundingClientRect(); return {y: r.top + window.scrollY}; })()`);
meta.local = { activityY: act, text: (await b.eval('document.body.innerText')).slice(0, 1400) };
const h4 = await b.pageHeight(); const y1 = Math.max(0, Math.min(h4 - 1080, (act?.y ?? 900) - 260));
meta.local.frames = await scrollClip('local', 0, y1, 4.5); await b.shot(ROOT + 'local/hold.jpg', 90);
meta.local.timelineRect = await rect('ol, ul[aria-label*="activity" i]');
writeFileSync(ROOT + 'meta.json', JSON.stringify(meta, null, 1));
console.log(JSON.stringify({ home: meta.home, v1: meta.v1.frames, tamper: meta.tamper.frames, v2: meta.v2.frames, local: meta.local.frames, activityY: act }));
await b.close();
