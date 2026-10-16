import json, math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
W, H, FPS = 1920, 1080, 24
D = '/private/tmp/claude-501/demo3/'
CL = '/private/tmp/claude-501/demo/clips/'
C3 = '/private/tmp/claude-501/demo3/clips/'
PAPER, INK, COBALT, GO, STOP, LINE, SHEET = (242, 237, 227), (16, 26, 43), (63, 91, 255), (20, 125, 90), (190, 61, 61), (200, 191, 175), (255, 253, 248)
def font(path, size, idx=0):
    try: return ImageFont.truetype(path, size, index=idx)
    except Exception: return ImageFont.load_default()
DIDOT = lambda s: font('/System/Library/Fonts/Supplemental/Didot.ttc', s, 2)  # Didot Bold
GEO = lambda s: font('/System/Library/Fonts/Supplemental/Georgia.ttf', s)
GEOB = lambda s: font('/System/Library/Fonts/Supplemental/Georgia Bold.ttf', s)
SANS = lambda s: font('/System/Library/Fonts/Avenir Next.ttc', s, 2)   # demi bold
SANSR = lambda s: font('/System/Library/Fonts/Avenir Next.ttc', s, 7)
MONO = lambda s: font('/System/Library/Fonts/Menlo.ttc', s, 0)
meta = json.load(open(CL + 'meta.json')); meta3 = json.load(open(C3 + 'meta3.json'))
script = json.load(open(D + 'audio/script.json'))
dur = {s['id']: s['dur'] for s in script}
LEAD = {'d1': 0.6}; PAD = {'d13': 2.6, 'd9': 1.6, 'd10': 0.8}
scenes = []; t = 0.0
for s in script:
    lead = LEAD.get(s['id'], 0.35); pad = PAD.get(s['id'], 0.45)
    L = lead + s['dur'] + pad
    scenes.append({'id': s['id'], 'start': t, 'lead': lead, 'len': L, 'dur': s['dur']}); t += L
TOTAL = t
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease(x): x = clamp(x); return x * x * (3 - 2 * x)
_cache = {}
def clean_badge(img):
    # Paint out the host's "Powered by Netlify" corner badge (third-party chrome, not part of the app) using the flat margin colour next to it.
    px = img.getpixel((1640, 1043)); d = ImageDraw.Draw(img); d.rectangle((1708, 1008, 1920, 1080), fill=px); return img
def load(p):
    if p not in _cache:
        if len(_cache) > 60: _cache.clear()
        im = Image.open(p).convert('RGB')
        _cache[p] = im if '/local/' in p else clean_badge(im)
    return _cache[p]
def blank(c): return Image.new('RGB', (W, H), c)
def center_text(d, y, text, f, fill, w=W):
    bb = d.textbbox((0, 0), text, font=f); d.text(((w - (bb[2] - bb[0])) // 2 - bb[0], y), text, font=f, fill=fill)
def with_alpha(img, base, a):
    return Image.blend(base, img, clamp(a))
def zoom(img, z, cx=0.5, cy=0.5):
    if z <= 1.0001: return img
    cw, ch = W / z, H / z; x0 = (W - cw) * cx; y0 = (H - ch) * cy
    return img.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch))).resize((W, H), Image.BILINEAR)
def tag(img, text, accent=GO):
    d = ImageDraw.Draw(img, 'RGBA'); f = MONO(21); bb = d.textbbox((0, 0), text, font=f); w = bb[2] - bb[0] + 44
    d.rounded_rectangle((28, H - 72, 28 + w, H - 28), 8, fill=(16, 26, 43, 235)); d.ellipse((44, H - 56, 56, H - 44), fill=accent + (255,))
    d.text((68, H - 62), text, font=f, fill=(242, 237, 227))
    return img
def hilite(img, r, color, pulse=1.0, pad=10):
    if not r: return img
    d = ImageDraw.Draw(img, 'RGBA'); x, y, w, h = r['x'] - pad, r['y'] - pad, r['w'] + 2 * pad, r['h'] + 2 * pad
    for k, a in ((10, 40), (6, 90), (3, 255)): d.rounded_rectangle((x - k + 3, y - k + 3, x + w + k - 3, y + h + k - 3), 10, outline=color + (int(a * pulse),), width=3)
    return img
def sframe(name, i): return load(f"{CL}{name}/s{min(max(i, 0), meta[name]['frames'] - 1):04d}.jpg")
# ---------------------------------------------------------------- scene renderers
def s_hook(t, S):
    img = blank(INK); d = ImageDraw.Draw(img)
    a = ease((t - S['lead'] + 0.1) / 0.9)
    lay = blank(INK); dl = ImageDraw.Draw(lay)
    center_text(dl, 360, 'Anyone can make a', DIDOT(120), PAPER); center_text(dl, 500, 'certificate look real.', DIDOT(120), PAPER)
    img = with_alpha(lay, img, a)
    d = ImageDraw.Draw(img); wline = int(520 * ease((t - S['lead'] - 0.8) / 1.2)); d.rectangle((W // 2 - wline // 2, 690, W // 2 + wline // 2, 693), fill=COBALT)
    return img
def s_problem(t, S):
    img = blank(PAPER); d = ImageDraw.Draw(img)
    items = [('PDF', 'A PDF can be edited.'), ('SCREENSHOT', 'A screenshot can be faked.'), ('LINK', 'A link can be quietly swapped.')]
    base = S['lead']; times = [base + 0.05, base + 0.34 * S['dur'] - 0.12, base + 0.676 * S['dur'] - 0.12]
    for i, (lab, txt) in enumerate(items):
        a = ease((t - times[i]) / 0.55); y = 250 + i * 190
        if a <= 0: continue
        dim = 1.0 if i == 2 or t < times[min(i + 1, 2)] else 0.55
        lay = blank(PAPER); dl = ImageDraw.Draw(lay); dl.text((260, y), lab, font=MONO(26), fill=COBALT); dl.text((260, y + 40), txt, font=GEOB(86), fill=INK)
        out = Image.blend(img, lay, clamp(a * dim)); img.paste(out)
        d = ImageDraw.Draw(img)
    return img
def s_trust(t, S):
    img = blank(INK); lay = blank(INK); dl = ImageDraw.Draw(lay)
    center_text(dl, 330, 'What are you', DIDOT(128), PAPER); center_text(dl, 480, 'actually trusting?', DIDOT(128), (221, 226, 255))
    img = with_alpha(lay, img, ease((t - S['lead']) / 0.8)); return img
def s_reveal(t, S):
    f = load(CL + 'home/hold.jpg'); z = 1.0 + 0.05 * ease(t / S['len']); img = zoom(f, z, 0.35, 0.4).copy()
    return tag(img, 'LIVE SITE  credentia-monad.netlify.app')
def s_story(t, S):
    n = meta['home']['frames']; i = int(clamp((t - 0.2) / (S['len'] - 0.6)) * (n - 1)); img = sframe('home', i).copy()
    return tag(img, 'LIVE SITE  credentia-monad.netlify.app')
def s_v1(t, S):
    if t < 2.6: img = load(CL + 'v1/hold.jpg').copy()
    elif t < 3.0: img = Image.blend(load(CL + 'v1/hold.jpg'), load(CL + 'v1/hold2.jpg'), ease((t - 2.6) / 0.4)).copy()
    elif t < 3.3: img = load(CL + 'v1/hold2.jpg').copy()
    else:
        n = meta['v1']['frames']; i = int(clamp((t - 3.3) / max(0.1, S['len'] - 3.7)) * (n - 1)); img = sframe('v1', i).copy()
    return tag(img, 'LIVE SITE  real Monad Testnet registry read')
def s_edit(t, S):
    base = load(CL + 'v1/hold2.jpg').copy(); dim = Image.new('RGB', (W, H), INK); img = Image.blend(base, dim, 0.62 * ease((t - 0.2) / 0.5))
    a = ease((t - 0.7) / 0.5)
    if a > 0:
        lay = img.copy(); d = ImageDraw.Draw(lay, 'RGBA'); fb = GEOB(88)
        w1 = d.textlength('Aarav N.', font=fb); w2 = d.textlength('Mallory', font=fb); gap = 150
        total = w1 + gap + w2; cw = max(1000, total + 140); x0 = (W - cw) / 2; tx = (W - total) / 2
        d.rounded_rectangle((x0, 330, x0 + cw, 700), 14, fill=SHEET + (255,), outline=LINE, width=2)
        d.text((x0 + 60, 372), 'ONE DETAIL EDITED IN THE SHARE LINK', font=MONO(26), fill=COBALT)
        d.text((tx, 440), 'RECIPIENT', font=MONO(24), fill=(51, 65, 85)); d.text((tx, 484), 'Aarav N.', font=fb, fill=(51, 65, 85))
        d.line((tx, 545, tx + w1, 545), fill=STOP, width=6)
        ax = tx + w1 + 28; ay = 540; d.line((ax, ay, ax + gap - 56, ay), fill=INK, width=6); d.polygon([(ax + gap - 56, ay - 16), (ax + gap - 56, ay + 16), (ax + gap - 28, ay)], fill=INK)
        d.text((tx + w1 + gap, 484), 'Mallory', font=fb, fill=STOP)
        d.text((x0 + 60, 625), 'Nothing on-chain changed. Only the link.', font=SANSR(30), fill=(51, 65, 85))
        img = Image.blend(img, lay, a)
    return tag(img, 'LIVE SITE  link edited for this demo', STOP)
def s_mismatch(t, S):
    if t < 1.6: img = load(CL + 'tamper/hold.jpg').copy(); pulse = 0.6 + 0.4 * math.sin(t * 6); img = hilite(img, meta['tamper'].get('banner'), STOP, pulse)
    else:
        n = meta['tamper']['frames']; i = int(clamp((t - 1.6) / max(0.1, S['len'] - 1.9)) * (n - 1)); img = sframe('tamper', i).copy()
    return tag(img, 'LIVE SITE  edited link, real result', STOP)
def s_revoked(t, S):
    if t < 1.8: img = load(CL + 'v2/hold.jpg').copy(); img = hilite(img, meta['v2'].get('banner'), STOP, 0.6 + 0.4 * math.sin(t * 6))
    else:
        n = meta['v2']['frames']; i = int(clamp((t - 1.8) / max(0.1, S['len'] - 2.1)) * (n - 1)); img = sframe('v2', i).copy()
    return tag(img, 'LIVE SITE  real Monad Testnet registry read', STOP)
def s_local(t, S):
    n = meta['local']['frames']
    if t < 0.4: img = sframe('local', 0).copy()
    elif t < 5.0: img = sframe('local', int(clamp((t - 0.4) / 4.4) * (n - 1))).copy()
    else:
        img = load(CL + 'local/hold.jpg').copy(); img = hilite(img, {'x': 629, 'y': 420, 'w': 662, 'h': 100}, COBALT, 0.55 + 0.45 * math.sin((t - 5.0) * 5))
    return tag(img, 'LOCAL  localhost:3100 + local Envio indexer', COBALT)
TX = [('ISSUE', '0xbc9d9a31…ae6841'), ('ISSUE', '0x1d418c64…6174b5'), ('REVOKE', '0x62da602e…3b8ed7')]
def s_proof(t, S):
    img = blank(INK); d = ImageDraw.Draw(img)
    d.text((150, 190), 'REAL TRANSACTIONS  ·  MONAD TESTNET', font=MONO(26), fill=(221, 226, 255))
    for i, (k, h) in enumerate(TX):
        a = ease((t - 0.6 - i * 0.55) / 0.45); y = 270 + i * 120
        if a > 0:
            lay = img.copy(); dl = ImageDraw.Draw(lay); dl.text((150, y), k, font=MONO(34), fill=(110, 231, 183) if k != 'REVOKE' else (255, 160, 160)); dl.text((380, y), h, font=MONO(46), fill=PAPER); img = Image.blend(img, lay, a)
    d = ImageDraw.Draw(img)
    for j, (val, lab) in enumerate([(178, 'contract tests'), (242, 'web tests')]):
        x = 1130 + j * 380; k = ease((t - 1.4 - j * 0.5) / 1.4); v = int(val * k)
        d.text((x, 300), str(v), font=DIDOT(150), fill=PAPER); d.text((x + 4, 480), lab, font=SANS(32), fill=(221, 226, 255))
    d.text((1130, 580), 'local runs, all passing', font=MONO(24), fill=(150, 160, 185))
    d.text((150, 690), 'Credential 1 issued  ·  credential 2 issued  ·  credential 2 revoked', font=SANSR(30), fill=(150, 160, 185))
    d.rectangle((150, 760, 150 + int(1500 * ease((t - 0.3) / 1.6)), 763), fill=COBALT)
    return img
def s_backtest(t, S):
    img = blank(INK); d = ImageDraw.Draw(img)
    k = ease((t - 0.2) / 0.7); lay = blank(INK); dl = ImageDraw.Draw(lay)
    dl.text((560, 250), '5', font=DIDOT(420), fill=PAPER); dl.text((820, 330), 'people', font=DIDOT(120), fill=PAPER); dl.text((820, 470), 'backtested the flow', font=GEO(64), fill=(221, 226, 255))
    img = with_alpha(lay, img, k); d = ImageDraw.Draw(img)
    d.rectangle((820, 580, 820 + int(520 * ease((t - 0.6) / 0.9)), 583), fill=COBALT)
    d.text((820, 610), 'BACKTEST', font=MONO(26), fill=(150, 160, 185))
    return img
def s_honest(t, S):
    img = blank(PAPER); d = ImageDraw.Draw(img); center_text(d, 250, 'Honest by design', GEOB(84), INK)
    chips = ['TESTNET DEMO DATA', 'CVI GATE: TESTNET STAND-IN']
    for i, c in enumerate(chips):
        a = ease((t - 0.7 - i * 0.7) / 0.5); f = MONO(40); bb = d.textbbox((0, 0), c, font=f); w = bb[2] - bb[0] + 80; x = (W - w) // 2; y = 440 + i * 130
        if a > 0:
            lay = img.copy(); dl = ImageDraw.Draw(lay); dl.rounded_rectangle((x, y, x + w, y + 92), 8, fill=SHEET, outline=INK, width=3); dl.text((x + 40, y + 20), c, font=f, fill=INK); img = Image.blend(img, lay, a)
    return img
def s_close(t, S):
    img = blank(INK); lay = blank(INK); dl = ImageDraw.Draw(lay)
    center_text(dl, 250, 'Credentia', DIDOT(190), PAPER); center_text(dl, 500, 'Don’t trust the claim.', GEO(66), (221, 226, 255)); center_text(dl, 590, 'Verify the credential.', GEOB(66), PAPER)
    img = with_alpha(lay, img, ease((t - 0.1) / 1.0)); d = ImageDraw.Draw(img)
    d.rectangle((W // 2 - 260, 470, W // 2 - 260 + int(520 * ease((t - 0.6) / 1.0)), 473), fill=COBALT)
    lay2 = img.copy(); d2 = ImageDraw.Draw(lay2); center_text(d2, 790, 'credentia-monad.netlify.app', MONO(34), (221, 226, 255)); center_text(d2, 850, 'Monad Metropolis  ·  Trust, Identity & AI Infrastructure  ·  Testnet demo', MONO(24), (150, 160, 185))
    img = Image.blend(img, lay2, ease((t - 1.6) / 0.8))
    fade = clamp((S['len'] - t - 0.0) / 1.0)
    return Image.blend(blank((0, 0, 0)), img, fade) if S['len'] - t < 1.0 else img

import math as _m
_cur = {}
def cursor_track(name):
    if name not in _cur: _cur[name] = json.load(open(C3 + name + '/cursor.json'))
    return _cur[name]
def draw_cursor(img, name, idx):
    tr = cursor_track(name); idx = min(max(idx, 0), len(tr) - 1); x, y, c = tr[idx]; d = ImageDraw.Draw(img, 'RGBA')
    if c:
        r = 10 + 4 * (sum(1 for k in range(max(0, idx - 6), idx + 1) if tr[k][2]))
        d.ellipse((x - r, y - r, x + r, y + r), outline=(63, 91, 255, 230), width=4)
    pts = [(0, 0), (0, 26), (7, 20), (13, 32), (18, 30), (12, 18), (21, 18)]
    d.polygon([(x + px + 1, y + py + 1) for px, py in pts], fill=(0, 0, 0, 90)); d.polygon([(x + px, y + py) for px, py in pts], fill=(255, 255, 255, 255), outline=(16, 26, 43, 255))
    return img
def live_tag(img, t='LIVE SITE  credentia-monad.netlify.app'): return tag(img, t)
def demo_pill(img):
    d = ImageDraw.Draw(img, 'RGBA'); f = MONO(20); s = 'TESTNET DEMO DATA'; bb = d.textbbox((0, 0), s, font=f); w = bb[2] - bb[0] + 36
    d.rounded_rectangle((W - 28 - w, H - 72, W - 28, H - 28), 8, fill=(16, 26, 43, 235)); d.text((W - 28 - w + 18, H - 62), s, font=f, fill=(242, 237, 227)); return img
def c3frame(name, k): return load(f"{C3}{name}/f{min(max(k, 0), meta3[name]['frames'] - 1):04d}.jpg")
def clip3(name, a0, a1, t, S, cursor=True, hold_tail=0.0, tagf=None):
    span = max(0.1, S['len'] - hold_tail); k = int(clamp(t / span) * (a1 - a0 - 1)) + a0; img = c3frame(name, k).copy()
    if cursor: img = draw_cursor(img, name, k)
    return img
def s_d1(t, S):
    f = load(CL + 'home/hold.jpg'); img = zoom(f, 1.0 + 0.04 * ease(t / S['len']), 0.35, 0.4).copy(); return live_tag(img)
def s_d2(t, S):
    n = meta['home']['frames']; i = int(clamp((t - 0.2) / (S['len'] - 0.6)) * (n - 1)); return live_tag(sframe('home', i).copy())
def s_d3(t, S):
    return live_tag(clip3('issue', 0, meta3['issue']['frames'], t, S))
def s_d4(t, S):
    f = load(C3 + '../../demo3/shots/issue0.jpg'); img = zoom(f, 1.0 + 0.10 * ease(t / S['len']), 0.5, 0.28).copy()
    # soft highlight on the "verified issuers only" step
    img = hilite(img, {'x': 689, 'y': 329, 'w': 542, 'h': 176}, COBALT, 0.6 + 0.4 * _m.sin(t * 4)) if t > 0.8 else img
    return live_tag(img)
def s_d5(t, S): return demo_pill(live_tag(clip3('v1x', 0, 78, t, S)))
def s_d6(t, S): return demo_pill(live_tag(clip3('v1x', 78, 178, t, S, True)))
def s_d7(t, S): return demo_pill(live_tag(clip3('v1x', 178, meta3['v1x']['frames'], t, S)))
def s_d8(t, S): return demo_pill(live_tag(clip3('receipt', 0, meta3['receipt']['frames'], t, S, cursor=False)))
def s_d9(t, S): return demo_pill(s_edit(t, S))
def s_d10(t, S): return demo_pill(s_mismatch(t, S))
def s_d11(t, S): return demo_pill(s_revoked(t, S))
def s_d12(t, S): return demo_pill(s_local(t, S))
def s_d13(t, S):
    f = load(CL + 'home/hold.jpg'); img = zoom(f, 1.04, 0.35, 0.4).copy(); d = ImageDraw.Draw(img, 'RGBA')
    a = ease((t - 0.6) / 0.8); d.rounded_rectangle((520, 470, 1400, 610), 14, fill=(16, 26, 43, int(235 * a)))
    if a > 0:
        lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dl = ImageDraw.Draw(lay); center_text(dl, 490, 'credentia-monad.netlify.app', MONO(44), (242, 237, 227, int(255 * a))); center_text(dl, 556, 'Live on Monad Testnet  ·  testnet demo data', MONO(24), (221, 226, 255, int(255 * a)))
        img = Image.alpha_composite(img.convert('RGBA'), lay).convert('RGB')
    fade = clamp((S['len'] - t) / 1.0)
    return Image.blend(blank((0, 0, 0)), img, fade) if S['len'] - t < 1.0 else img
R = {'d1': s_d1, 'd2': s_d2, 'd3': s_d3, 'd4': s_d4, 'd5': s_d5, 'd6': s_d6, 'd7': s_d7, 'd8': s_d8, 'd9': s_d9, 'd10': s_d10, 'd11': s_d11, 'd12': s_d12, 'd13': s_d13}
def frame_at(T):
    for i, S in enumerate(scenes):
        if S['start'] <= T < S['start'] + S['len'] or (i == len(scenes) - 1):
            lt = T - S['start']; img = R[S['id']](lt, S)
            tr = 0.32
            if S['len'] - lt < tr and i + 1 < len(scenes):
                nxt = scenes[i + 1]; img2 = R[nxt['id']](0.0, nxt); img = Image.blend(img, img2, ease(1 - (S['len'] - lt) / tr))
            return img
def build_base(out):
    n = int(TOTAL * FPS)
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    for k in range(n):
        p.stdin.write(frame_at(k / FPS).tobytes())
        if k % 240 == 0: print('frame', k, '/', n, flush=True)
    p.stdin.close(); p.wait()
if __name__ == '__main__':
    print('total seconds', round(TOTAL, 2)); json.dump({'scenes': scenes, 'total': TOTAL}, open(D + 'timeline.json', 'w'), indent=1)
    if len(sys.argv) > 1 and sys.argv[1] == 'base': build_base(D + 'base.mp4')
    if len(sys.argv) > 2 and sys.argv[1] == 'still': frame_at(float(sys.argv[2])).save(D + 'still.jpg', quality=90)
