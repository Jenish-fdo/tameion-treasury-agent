#!/bin/sh
# Original ambient bed, synthesized from sine waves + filtered noise (no third-party audio). ~104 s, stereo.
D=${1:-104}
ffmpeg -y -loglevel error \
 -f lavfi -i "sine=f=55:d=$D" -f lavfi -i "sine=f=110:d=$D" -f lavfi -i "sine=f=164.81:d=$D" -f lavfi -i "sine=f=220:d=$D" -f lavfi -i "sine=f=277.18:d=$D" -f lavfi -i "anoisesrc=d=$D:c=pink:a=0.02" \
 -filter_complex "[0]volume=0.30[a];[1]volume=0.20,tremolo=f=0.12:d=0.5[b];[2]volume=0.12,tremolo=f=0.17:d=0.6[c];[3]volume=0.07,tremolo=f=0.11:d=0.7[d];[4]volume=0.045,tremolo=f=0.21:d=0.6[e];[5]lowpass=f=700,volume=0.7[n];
  [a][b][c][d][e][n]amix=inputs=6:normalize=0,lowpass=f=1800,aformat=channel_layouts=stereo,afade=t=in:st=0:d=3,afade=t=out:st=$((D-5)):d=5,volume=0.55" /private/tmp/claude-501/demo2/audio/bed.wav
