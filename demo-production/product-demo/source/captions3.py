import json, re, subprocess, os
from PIL import Image, ImageDraw
import importlib.util
spec = importlib.util.spec_from_file_location('b', '/private/tmp/claude-501/demo3/build3.py'); b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
D = b.D; script = json.load(open(D + 'audio/script.json')); tl = json.load(open(D + 'timeline.json'))['scenes']
HI = {'real', 'monad', 'fingerprint', 'revoked', 'verify', 'credentia', '178', '242', 'plainly', 'stand-in', 'trust'}
def gaps(wav):
    # Real pauses only (0.2 s or longer); a new phrase starts when speech resumes.
    out = subprocess.run(['ffmpeg', '-hide_banner', '-i', wav, '-af', 'silencedetect=noise=-40dB:d=0.2', '-f', 'null', '-'], capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', out)]; en = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', out)]
    return [e - 0.03 for s, e in zip(st, en) if s > 0.3]
def phrases(text):
    sents = re.findall(r'[^.!?]+[.!?]+|[^.!?]+$', text.strip()); out = []
    for s in sents:
        s = s.strip()
        while len(s) > 62:
            cut = max([m.start() for m in re.finditer(r', | and | on | that ', s) if 18 < m.start() < len(s) - 14] or [len(s) // 2]);
            if cut == len(s) // 2:
                sp = s.rfind(' ', 0, len(s) // 2 + 6); cut = sp if sp > 0 else cut
            c = s[:cut + (1 if s[cut:cut + 1] == ',' else 0)].strip(); out.append(c); s = s[cut + (1 if s[cut:cut + 1] == ',' else 0):].strip()
        out.append(s)
    return out
cues = []
for sc, sg in zip(tl, script):
    ph = phrases(sg['sub']); total = sum(len(p) for p in ph); t0 = sc['start'] + sc['lead']; T = sg['dur'] - 0.05
    g = gaps(D + f"audio/{sg['id']}.wav"); acc = 0; bounds = [0.0]
    for p in ph[:-1]:
        acc += len(p); prop = acc / total * T
        near = [x for x in g if abs(x - prop) < 0.8]; bounds.append(min(near, key=lambda x: abs(x - prop)) if near else prop)
    bounds.append(T)
    for i, p in enumerate(ph): cues.append((t0 + bounds[i], t0 + bounds[i + 1] + (0.12 if i == len(ph) - 1 else 0.0), p))
def fmt(t): h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60; return f'{h:02d}:{m:02d}:{s:06.3f}'.replace('.', ',')
open(D + 'credentia-demo.srt', 'w').write('\n'.join(f'{i + 1}\n{fmt(a)} --> {fmt(e)}\n{p}\n' for i, (a, e, p) in enumerate(cues)))
os.makedirs(D + 'caps', exist_ok=True)
def render(p, path):
    f = b.SANS(50); img = Image.new('RGBA', (b.W, b.H), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    words = p.split(' '); lines = [[]]; maxw = 1560
    def wlen(ws): return d.textlength(' '.join(ws), font=f)
    for w in words:
        if wlen(lines[-1] + [w]) > maxw and lines[-1]: lines.append([w])
        else: lines[-1].append(w)
    lh = 68; w_all = max(wlen(l) for l in lines); hh = lh * len(lines); x0 = (b.W - w_all) / 2; y0 = b.H - 112 - hh
    d.rounded_rectangle((x0 - 30, y0 - 12, x0 + w_all + 30, y0 + hh + 6), 12, fill=(16, 26, 43, 214))
    for li, l in enumerate(lines):
        x = (b.W - wlen(l)) / 2
        for w in l:
            key = re.sub(r'[^\w\-’\']', '', w).lower(); col = (160, 178, 255, 255) if key in HI else (255, 253, 248, 255)
            d.text((x, y0 + li * lh), w, font=f, fill=col); x += d.textlength(w + ' ', font=f)
    img.save(path)
for i, (a, e, p) in enumerate(cues): render(p, D + f'caps/c{i:02d}.png')
json.dump([{'a': a, 'e': e, 'p': p} for a, e, p in cues], open(D + 'cues.json', 'w'), indent=1)
print(len(cues), 'cues'); [print(f'{a:6.2f}-{e:6.2f} {p}') for a, e, p in cues[:6]]
