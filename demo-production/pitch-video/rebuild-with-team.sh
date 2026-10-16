#!/bin/sh
# Edit team.json (names and roles), then run this. Re-renders the pitch with the new team card (about 6 minutes).
# Needs the working folder /private/tmp/claude-501/demo2 and the captured clips in /private/tmp/claude-501/demo/clips.
cd /private/tmp/claude-501/demo2 || exit 1
python3 build2.py && python3 render2.py || exit 1
ffmpeg -y -loglevel error -i video_subs.mp4 -i mix.wav -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart final_subs.mp4
ffmpeg -y -loglevel error -i video_nosubs.mp4 -i mix.wav -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart final_nosubs.mp4
echo "done: /private/tmp/claude-501/demo2/final_subs.mp4"
