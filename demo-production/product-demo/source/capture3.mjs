import { launch } from './cdp.mjs';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
const LIVE = 'https://credentia-monad.netlify.app';
const links = readFileSync('/private/tmp/claude-501/verify-links.txt', 'utf8').trim().split('\n');
const ROOT = '/private/tmp/claude-501/demo3/clips/'; rmSync(ROOT, { recursive: true, force: true }); mkdirSync(ROOT, { recursive: true });
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const b = await launch(9355);
let cur = { x: 1500, y: 900 }; let track = []; let n = 0; let dir = '';
async function frame(click = 0) { await b.sleep(40); await b.shot(`${dir}f${String(n).padStart(4, '0')}.jpg`, 86); track.push([Math.round(cur.x), Math.round(cur.y), click]); n++; }
async function start(name) { dir = ROOT + name + '/'; mkdirSync(dir, { recursive: true }); n = 0; track = []; }
async function end(name, meta = {}) { writeFileSync(dir + 'cursor.json', JSON.stringify(track)); meta.frames = n; allMeta[name] = meta; }
const allMeta = {};
const rectOf = (js) => b.eval(`(() => { const e = (${js}); if (!e) return null; const r = e.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2, w:r.width, h:r.height, top:r.top+window.scrollY}; })()`);
async function moveTo(x, y, frames) { const x0 = cur.x, y0 = cur.y; for (let i = 1; i <= frames; i++) { const k = ease(i / frames); cur = { x: x0 + (x - x0) * k, y: y0 + (y - y0) * k }; await frame(); } }
async function idle(frames) { for (let i = 0; i < frames; i++) await frame(); }
async function scroll(y0, y1, frames) { for (let i = 0; i < frames; i++) { await b.scrollTo(Math.round(y0 + (y1 - y0) * ease(i / Math.max(1, frames - 1)))); await frame(); } }
async function clickEl(js, frames = 22) { const r = await rectOf(js); if (!r) throw new Error('missing element ' + js); await moveTo(r.x, r.y, frames); for (let i = 0; i < 6; i++) await frame(1); await b.eval(`(${js}).click()`); }
async function typeText(text, perChar = 2) { for (const ch of text) { await b.send('Input.insertText', { text: ch }); for (let i = 0; i < perChar; i++) await frame(); } }

// ---- ISSUE: real typing into the real form
await start('issue');
await b.goto(LIVE + '/issue'); await b.waitText('Issue a credential', 30000); await b.sleep(2200);
await b.scrollTo(640); await b.sleep(400); await idle(14);
await clickEl(`[...document.querySelectorAll('button')].find(x=>/use example details/i.test(x.textContent))`); await b.sleep(500); await idle(24);
const addr = await rectOf(`document.getElementById('holder')`);
await moveTo(addr.x, addr.y, 20); for (let i = 0; i < 5; i++) await frame(1);
await b.eval(`document.getElementById('holder').focus(); document.getElementById('holder').select()`); await idle(6);
await b.send('Input.insertText', { text: '' }); await b.eval(`(() => { const e = document.getElementById('holder'); e.focus(); })()`);
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); await idle(8);
await typeText('0x7099', 3);
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await b.sleep(500); await idle(40);
const errTxt = await b.eval(`[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent).join(' | ')`);
await scroll(640, 640, 1);
await end('issue', { errTxt, holderRect: addr });
// ---- VERIFY: dialog, close, scroll, hover "Verify on Monad"
await start('v1x');
await b.goto(LIVE + links[0]); await b.waitText('Credential verified', 40000); await b.sleep(1800);
await idle(30);
await clickEl(`[...document.querySelectorAll('dialog button')].find(x=>/close/i.test(x.textContent))`, 24); await b.sleep(600); await idle(18);
const h = await b.pageHeight(); const ver = await rectOf(`[...document.querySelectorAll('a')].find(x=>/verify on monad/i.test(x.textContent))`);
const vTop = Math.max(0, ver.top - 520); await scroll(0, vTop, 100);
const ver2 = await rectOf(`[...document.querySelectorAll('a')].find(x=>/verify on monad/i.test(x.textContent))`);
await moveTo(ver2.x, ver2.y, 26); await idle(36);
const href = await b.eval(`[...document.querySelectorAll('a')].find(x=>/verify on monad/i.test(x.textContent)).href`);
await end('v1x', { href, verRect: ver2 });
// ---- RECEIPT
await start('receipt');
const rc = await b.eval(`(() => { const a=[...document.querySelectorAll('a')].find(x=>/receipt/i.test(x.href)); return a && a.href; })()`);
await b.goto(rc); await b.waitText('Credential receipt', 30000); await b.sleep(1800); await idle(24);
const rh = await b.pageHeight(); await scroll(0, Math.max(0, rh - 1080), 84); await idle(12);
await end('receipt', { rc });
writeFileSync(ROOT + 'meta3.json', JSON.stringify(allMeta, null, 1)); console.log(JSON.stringify({ issue: allMeta.issue.frames, errTxt: allMeta.issue.errTxt, v1x: allMeta.v1x.frames, receipt: allMeta.receipt.frames, href: allMeta.v1x.href }));
await b.close();
