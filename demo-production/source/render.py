import json, subprocess, importlib.util
from PIL import Image
spec = importlib.util.spec_from_file_location('b', '/private/tmp/claude-501/demo/build.py'); b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
D = b.D; cues = json.load(open(D + 'cues.json')); caps = [Image.open(D + f'caps/c{i:02d}.png').convert('RGBA') for i in range(len(cues))]
n = int(b.TOTAL * b.FPS)
def enc(out): return subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{b.W}x{b.H}', '-r', str(b.FPS), '-i', '-', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], stdin=subprocess.PIPE, stderr=open(out + '.err', 'w'))
p_clean, p_subs = enc(D + 'video_nosubs.mp4'), enc(D + 'video_subs.mp4')
for k in range(n):
    t = k / b.FPS; fr = b.frame_at(t); p_clean.stdin.write(fr.tobytes())
    active = [i for i, c in enumerate(cues) if c['a'] <= t < c['e']]
    if active:
        a = min(1.0, (t - cues[active[0]]['a']) / 0.15, (cues[active[0]]['e'] - t) / 0.15 + 0.0001); layer = caps[active[0]]
        if a < 1.0: layer = layer.copy(); layer.putalpha(layer.getchannel('A').point(lambda v: int(v * max(0.0, a))))
        out = fr.convert('RGBA'); out.alpha_composite(layer); p_subs.stdin.write(out.convert('RGB').tobytes())
    else: p_subs.stdin.write(fr.tobytes())
    if k % 240 == 0: print('frame', k, '/', n, flush=True)
p_clean.stdin.close(); p_subs.stdin.close(); p_clean.wait(); p_subs.wait(); print('done')
