#!/bin/sh
# Rebuilds the Deadly Balloons 3 trailer (/deadlyBalloons/trailer.mp4) from scratch.
# Needs: the site served on :8123 (python3 -m http.server 8123 from the repo root,
# or the `site` launch config) with the game at /deadlyBalloons/play/, Node 22,
# ffmpeg, Google Chrome, and a Python with Pillow and numpy (PY=/path/to/python).
set -e
cd "$(dirname "$0")"
PY=${PY:-python3}
REPO=../..
export DO_NOT_TRACK=1 HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_SKIP_SKILLS=1

# 1. Gameplay: every shot in rec/harness.js, frame by frame -> clips/<shot>.mp4 + .wav
node rec/rec.mjs

# 2. The game's own sprites and screens, plus the bits made here.
mkdir -p video/assets/clips
node rec/sprites.mjs .site-sprites video/assets
node rec/stills.mjs video/assets/stills
$PY - <<'EOF'
import numpy as np
from PIL import Image
Image.open('video/assets/stills/draft.png').crop((1300, 880, 2540, 1410)).save('video/assets/draft-cards.png')
a = (np.random.default_rng(7).random((512, 512)) * 255).astype('uint8')
Image.fromarray(a, 'L').convert('RGB').save('video/assets/grain.png')
EOF
cp "$REPO/assets/rexGreenSmall.png" video/assets/rex.png
cp assets-src/db2.webp video/assets/db2.webp
cp clips/*.mp4 video/assets/clips/

# 3. Sound: the score, then each cut's game effects mixed under it.
node -e "import('./edl.mjs').then((E) => require('fs').writeFileSync('edl.json', JSON.stringify({ CUTS: E.CUTS, HITS: E.HITS, END: E.END, BEAT: E.BEAT, DROP: E.DROP })))"
node audio/render.mjs audio/score.wav
$PY audio/mix.py audio/mix-raw.wav
ffmpeg -y -loglevel error -i audio/mix-raw.wav -af "loudnorm=I=-14:TP=-1.0:LRA=9" -ar 48000 video/assets/trailer-audio.wav

# 4. The HyperFrames composition, rendered.
node build.mjs
(cd video && npx --yes hyperframes@0.9.80 lint && npx --yes hyperframes@0.9.80 render -q delivery -o ../out/db3-trailer-master.mp4)

# 5. The web copy and its poster.
ffmpeg -y -loglevel error -i out/db3-trailer-master.mp4 -c:v libx264 -preset slow -crf 23 -maxrate 7M -bufsize 14M \
  -profile:v high -level 4.2 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart "$REPO/deadlyBalloons/trailer.mp4"
ffmpeg -y -loglevel error -ss 51.7 -i out/db3-trailer-master.mp4 -frames:v 1 -vf scale=1280:720 -q:v 3 "$REPO/deadlyBalloons/trailer-poster.jpg"
echo "done: out/db3-trailer-master.mp4, deadlyBalloons/trailer.mp4"
