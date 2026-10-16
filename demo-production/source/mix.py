import json, subprocess
D = '/private/tmp/claude-501/demo/'; tl = json.load(open(D + 'timeline.json')); sc = {s['id']: s for s in tl['scenes']}; T = tl['total']
ins = ['-i', D + 'audio/bed.wav']; fc = []; labels = []
for k, i in enumerate(sc):
    ins += ['-i', D + f'audio/{i}.wav']; ms = int((sc[i]['start'] + sc[i]['lead']) * 1000); fc.append(f'[{k + 1}:a]adelay={ms}|{ms},volume=1.15[v{k}]'); labels.append(f'[v{k}]')
fc.append(''.join(labels) + f'amix=inputs={len(labels)}:normalize=0,apad=whole_dur={T:.2f},atrim=0:{T:.2f}[vo]')
fc.append('[vo]asplit=2[vo1][vo2]')
fc.append(f'[0:a]volume=11dB,atrim=0:{T:.2f},afade=t=out:st={T-4.5:.2f}:d=4.5[bed0]')
fc.append('[bed0][vo2]sidechaincompress=threshold=0.02:ratio=6:attack=40:release=500:makeup=1[bed]')
# accents: a soft low thump when the edited link fails to verify, and a quiet two-note resolve in the end card
t8 = int((sc['n8']['start'] + sc['n8']['lead'] - 0.05) * 1000); t13 = int((sc['n13']['start'] + 2.6) * 1000)
ins += ['-f', 'lavfi', '-i', 'sine=f=58:d=1.4', '-f', 'lavfi', '-i', 'sine=f=784:d=2.2', '-f', 'lavfi', '-i', 'sine=f=1175:d=2.2']
n = len(sc) + 1
fc.append(f'[{n}:a]afade=t=out:st=0.06:d=1.3,volume=0.9,adelay={t8}|{t8}[th]')
fc.append(f'[{n + 1}:a]afade=t=in:st=0:d=0.05,afade=t=out:st=0.05:d=2.1,volume=0.16,adelay={t13}|{t13}[c1]')
fc.append(f'[{n + 2}:a]afade=t=in:st=0:d=0.05,afade=t=out:st=0.05:d=2.1,volume=0.10,adelay={t13 + 180}|{t13 + 180}[c2]')
fc.append('[vo1][bed][th][c1][c2]amix=inputs=5:normalize=0,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=9,alimiter=limit=0.95[out]')
cmd = ['ffmpeg', '-y', '-loglevel', 'error'] + ins + ['-filter_complex', ';'.join(fc), '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s16le', D + 'mix.wav']
subprocess.run(cmd, check=True); print('mixed', T)
