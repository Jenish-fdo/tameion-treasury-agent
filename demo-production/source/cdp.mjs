// Minimal Chrome DevTools Protocol driver (Node 22, built-in WebSocket). Captures the REAL pages in headless Chrome.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function launch(port = 9333) {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', `--remote-debugging-port=${port}`, '--user-data-dir=/private/tmp/claude-501/demo/prof', '--window-size=1920,1080',
    '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1', 'about:blank',
  ], { stdio: 'ignore' });
  let info; for (let i = 0; i < 160; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (info.some((t) => t.type === "page")) break; } catch {} await sleep(250); }
  const ws = new WebSocket(info.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else events.push(d); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (d) => (d.error ? rej(new Error(d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const api = {
    send, sleep,
    async goto(url) { events.length = 0; await send('Page.navigate', { url }); for (let i = 0; i < 120; i++) { if (events.some((e) => e.method === 'Page.loadEventFired')) break; await sleep(250); } },
    async eval(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value; },
    async waitText(text, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await api.eval(`document.body.innerText.includes(${JSON.stringify(text)})`)) return true; await sleep(300); } return false; },
    async shot(path, q = 85) { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: q }); writeFileSync(path, Buffer.from(r.data, 'base64')); },
    async scrollTo(y) { await api.eval(`window.scrollTo(0, ${y})`); },
    async pageHeight() { return api.eval('document.documentElement.scrollHeight'); },
    async close() { try { ws.close(); } catch {} chrome.kill(); },
  };
  return api;
}
