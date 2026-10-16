# Credentia demo video: production folder

| File | What it is |
|---|---|
| `credentia-demo.mp4` | Final video with burned-in subtitles. 1920x1080, 24 fps, H.264, AAC 48 kHz stereo, 76.8 s |
| `credentia-demo-no-subtitles.mp4` | The same video without burned-in subtitles |
| `credentia-demo.srt` | Subtitles, synchronized to the narration (28 cues) |
| `narration.wav` | The voiceover alone (mono, 48 kHz) |
| `narration-script.md` | Every spoken line with timing, delivery, visual and pause notes |
| `cover.jpg` | Cover image (the edited-link check failing against the real registry) |
| `verification-report.md` | What was checked, the evidence used, and the limits |
| `source/` | The scripts that produced the video |

## Re-render
The scripts in `source/` expect a working folder at `/private/tmp/claude-501/demo` with `clips/` and `audio/` inside it (edit the `D =` / `CL =` paths at the top of each script to move it). Order:

1. `node capture.mjs` and `node capture_local2.mjs` (Node 22, Google Chrome installed) capture the real pages through Chrome's debugging protocol. `capture_local2` needs the local app on `localhost:3100` and the local Envio indexer running.
2. Voiceover: `say -v Daniel -r 158` on each `speech` line in `script.json`, converted with ffmpeg (see `narration-script.md`).
3. `sh music.sh 104`, `python3 build.py`, `python3 captions.py`, `python3 render.py`, `python3 mix.py`, then mux with ffmpeg.

Only ffmpeg, Python with Pillow, Node 22 and Chrome are needed. No paid service, account or API key is used. The music is synthesized from sine waves and noise, so there is nothing to license.
