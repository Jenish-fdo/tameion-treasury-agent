# Credentia team pitch video (limit: 2 minutes)

| File | What it is |
|---|---|
| `credentia-team-pitch.mp4` | Final video with burned-in subtitles. 1920x1080, 24 fps, H.264 + AAC, **97.8 s** |
| `credentia-team-pitch-no-subtitles.mp4` | Same video, no burned-in subtitles |
| `credentia-team-pitch.srt` | Subtitles (30 cues) |
| `narration.wav`, `narration-script.md` | Voiceover and the full script with delivery and visual notes |
| `team.json` | The team card. **Fill in names and roles, then run `rebuild-with-team.sh`** |

## Add the team names
Edit `team.json`:
```
{ "headline": "THE TEAM",
  "members": [ {"name": "Your Name", "role": "What you built"}, {"name": "Another Name", "role": "Role"} ],
  "footer": "github.com/jenish1345/Credentia" }
```
Up to five people fit. Then run `sh rebuild-with-team.sh` (about 6 minutes). The narration says "We're the team behind Credentia", which stays true for any team size. If you are a solo builder, change that line in `source/script.json` and re-synthesize, or tell me and I will do it.

## What it covers (the form's criteria)
- Team: the team card (needs your names).
- The problem: scenes 2 and 3.
- Why you are building it: scene 5.
- Plus the working product on real footage, the proof, and where it goes next.
