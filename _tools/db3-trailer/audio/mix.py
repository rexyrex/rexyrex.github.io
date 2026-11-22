# Mixes the score with each cut's own game sound effects (from the recorder),
# placed exactly where the cut sits in the edit.  python mix.py out.wav
import json, sys, wave
import numpy as np
SR = 48000
def load(p):
    with wave.open(p) as w:
        assert w.getframerate() == SR and w.getnchannels() == 2
        return np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').reshape(-1, 2).astype(np.float32) / 32768
edl = json.load(open('edl.json'))
score = load('audio/score.wav')
n = int(SR * (edl['END'] + 0.5))
bed = np.zeros((n, 2), np.float32)
cache = {}
for c in edl['CUTS']:
    lvl = c.get('sfx', 0.6)
    if not lvl: continue
    if c['clip'] not in cache: cache[c['clip']] = load(f"clips/{c['clip']}.wav")
    src = cache[c['clip']]
    a = int(c['media'] * SR); m = int(c['dur'] * SR)
    seg = src[a:a + m].copy()
    if len(seg) < m: seg = np.pad(seg, ((0, m - len(seg)), (0, 0)))
    f = min(int(0.006 * SR), m // 4)
    ramp = np.linspace(0, 1, f, dtype=np.float32)[:, None]
    seg[:f] *= ramp; seg[-f:] *= ramp[::-1]
    s = int(c['start'] * SR)
    bed[s:s + m] += seg[:max(0, min(m, n - s))] * lvl
mix = score[:n] + bed * 0.55
# Soft limit and normalise to -1 dBFS.
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix *= 0.89 / max(1e-6, np.abs(mix).max())
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype('<i2').tobytes())
print('mixed', len(edl['CUTS']), 'cuts')
