# Deadly Balloons 3 trailer

The source of `/deadlyBalloons/trailer.mp4`: 57 s, 1920×1080, 60 fps. `./make.sh` rebuilds all of it; footage, renders and generated assets are git-ignored.

It follows the Deadly Balloons 2 trailer's story (dark title cards over drifting dust, then the game montage, feature cards and an end card) and goes further.

- **Act I, then and now:** 2013 as flat circles on blue, 2019 as a frame of the Deadly Balloons 2 trailer (`assets-src/db2.webp`) that glitches apart, then "Now they want revenge."
- **Act II:** the drop. Abilities, power-ups, upgrade cards and endless mode.
- **Act III:** one boss card per campaign.
- **Act IV:** a breakdown ("You don't aim. You dodge."), the Galactic Overlord popping, the title, and the end card.

| Step | Files | What it does |
|---|---|---|
| Gameplay | `rec/rec.mjs`, `rec/shim.js`, `rec/harness.js` | Plays the real game from `/deadlyBalloons/play/` in headless Chrome under a virtual clock, one exact 1/60 s frame at a time. A bot flies the ship; the ship is made unkillable. The shots move a camera inside the engine (the renderer's arena rectangle), so close-ups stay sharp. Each shot is written as `clips/<shot>.mp4` with its own `.wav`, mixed offline from the game's synthesised sound effects. Shot list, setup and camera moves: `SHOTS` in `harness.js`. |
| Art | `rec/sprites.mjs`, `rec/stills.mjs` | Exports balloons, bosses, power-up icons and the ship from the game's texture atlases, and stills of its draft screen. The site's balloon rain (`/deadlyBalloons/res/img/db3/`) came from the same export. |
| Edit | `edl.mjs` | The cut list and the musical hit points. 150 BPM: a beat is 0.4 s, which is 24 frames. |
| Score | `audio/score.js`, `audio/render.mjs`, `audio/mix.py` | The music is rendered in an OfflineAudioContext. It is the game's boss track (E Phrygian), played on the instruments from the game's `music.ts`, plus trailer sound design: booms, braams, risers, a music box with a tape stop, and a final balloon pop. `mix.py` lays each cut's game effects under the score. |
| Composition | `build.mjs` → `video/index.html` | Generates the [HyperFrames](https://hyperframes.heygen.com) composition: the clips as root-level `<video>`s, one paused GSAP timeline, and seeded randomness only. Render it with `npx hyperframes@0.9.80 render` in `video/`. |
