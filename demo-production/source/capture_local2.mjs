import { launch } from './cdp.mjs';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
const links = readFileSync('/private/tmp/claude-501/verify-links.txt', 'utf8').trim().split('\n');
const ROOT = '/private/tmp/claude-501/demo/clips/'; const meta = JSON.parse(readFileSync(ROOT + 'meta.json', 'utf8'));
rmSync(ROOT + 'local', { recursive: true, force: true }); mkdirSync(ROOT + 'local', { recursive: true });
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const b = await launch();
await b.goto('http://localhost:3100' + links[1]); if (!(await b.waitText('REVOKED', 45000))) throw new Error('no REVOKED'); await b.sleep(2500);
const act = await b.eval(`(() => { const e = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && /recent activity/i.test(x.textContent||'')); if (!e) return null; return {y: e.getBoundingClientRect().top + window.scrollY}; })()`);
const text = await b.eval('document.body.innerText');
const H = await b.pageHeight(); const y1 = Math.max(0, Math.min(H - 1080, (act?.y ?? 900) - 420)); const n = 108;
for (let i = 0; i < n; i++) { await b.scrollTo(Math.round(y1 * ease(i / (n - 1)))); await b.sleep(45); await b.shot(`${ROOT}local/s${String(i).padStart(4, '0')}.jpg`, 86); }
await b.shot(ROOT + 'local/hold.jpg', 90);
meta.local = { frames: n, activityY: act, text: text.slice(0, 1600) };
writeFileSync(ROOT + 'meta.json', JSON.stringify(meta, null, 1));
console.log(JSON.stringify({ frames: n, act, hasEnvio: /ENVIO/i.test(text) }), '\n', text.split('RECENT ACTIVITY')[1]?.slice(0, 300));
await b.close();
