# rexyrex.github.io

Personal GitHub Pages site for [rexyrex](https://github.com/rexyrex) — an index of what Rexyrex ships: mobile apps (Google Play and the App Store), native macOS apps, multiplayer browser games, a live dashboard for a car, music, a devlog, and the privacy-policy / support pages for published apps.

## Pages

| Path | What it is |
|---|---|
| `/` | Home page: **the island**. Eleven stops, one per part of the site; scrolling or pressing a place glides a camera across a live Late Cretaceous island to it, with that section's content in a panel. Stills of every stop stand in where the live world cannot run — see [The island](#the-island-indexhtml) |
| `/typing/` | **rex/type**, the typing game: speed tests in Korean, English and code, meteor defense, a dino race, key drills and a daily challenge, with Firebase leaderboards. Plain ES modules, no framework — see [The typing game](#the-typing-game-typing) |
| `/deadlyBalloons/` | Landing page for Deadly Balloons 3 (dependency-free): the trailer (`trailer.mp4`, made with HyperFrames from real gameplay; source and `make.sh` in `_tools/db3-trailer/`) and a link to the game |
| `/deadlyBalloons/play/` | **Deadly Balloons 3** itself: the production build (`npm run build` → `dist/`) of the private `rexyrex/Deadly-Balloons-3` repository, copied in as is. Relative paths, its own service worker (offline play) and web manifest. Rebuild and recopy to update; never edit it here |
| `/music/showcase.html` | Music page with a SoundCloud embed and links out |
| `/animation.html` | Animation lab: a scratchpad of CSS text effects on Vue 3 (+ Bootstrap 5 grid) |
| `/log/` | Devlog: hand-written HTML posts (`log/*.html`, styled by `log/log.css`), newest first |
| `/parser/` | KakaoParser companion pages: admin tools (query/download, Bootstrap 5) + Korean help & ToS docs |
| `/support/` | App store support/contact page |
| `/rexdesk/` | **RexDesk in the browser**: the web viewer for RexDesk (remote control for Macs), a standalone app page copied in from the RexDesk repository's `web/` by its publish script. Never edit it here — see [RexDesk in the browser](#rexdesk-in-the-browser-rexdesk) |
| `/apps/<app_id>/` | **App landing pages**, hand-built, one per public app — see [App landing pages](#app-landing-pages) |
| `/apps/` | **App directory**: every public app as a card (search, store and language filters), the desktop apps (App Manager, RexDesk), and every privacy policy — see [App directory](#app-directory-apps). The `/apps/<app_id>/privacy-policy/` pages under it are **generated** — see below |
| `/404.html` | Served by GitHub Pages for unknown paths: the path that failed, a terminal that says so, "did you mean" from the site index |
| `/smartthings-callback.html` | OAuth hand-off shim for the Project Manager app — do not modify |

Site-level files: `robots.txt`, `sitemap.xml` (hand-listed; keep in step when pages are added), `site.webmanifest` (+ icons under `assets/icons/`), and one Open Graph card per hand-written page under `assets/og/` — see [Social cards and icons](#social-cards-and-icons).

## Design system

Everything is styled from `/css/index.css`:

- **Tokens** — colors, type, spacing as CSS custom properties on `:root`. Dark is the base; a light palette is applied under `prefers-color-scheme: light` and under `html[data-theme="light"]`. The accent green comes from the rex mascot.
- **Type** — IBM Plex Mono for headings, labels, navigation and anything structural; IBM Plex Sans KR for body text (covers Korean). Both from Google Fonts.
- **Components** — `.wrap`, `.section` / `.section-head` / `.eyebrow`, `.btn` (`-primary`, `-ghost`), `.card`, `.tag`, `.facts`, `.embed`, `.article`, `.index` rows, `.apps-grid`, `.link-grid`.
- **Eyebrows are real paths.** Section labels like `/apps/` and `/typing/` are the actual URLs of what they introduce.
- **Cross-document view transitions.** `index.css` opts every page in with `@view-transition { navigation: auto }`, so same-origin navigations crossfade. The top bar and status bar carry `view-transition-name`s (`navbar.css`) and hold still. Reduced motion turns it off.

The typing game has its own stylesheet (`typing/css/typespeed2.css`) on top of `index.css` and nothing else; the animation lab keeps its effect CSS inline and only its page chrome uses the tokens.

## The island (`/index.html`)

The home page is a map you travel. Each `<section class="stop">` in `index.html` is a place on an island and one part of the site:

| # | id | Place | What it is about |
|---|---|---|---|
| 00 | `#top` | Overlook | hero |
| 01 | `#typing` | Stone keyboard | `/typing/` |
| 02 | `#balloons` | Pterosaur cliffs | `/deadlyBalloons/` |
| 03 | `#apps` | Standing stones | `/apps/` (generated, see [App directory](#app-directory-apps)) |
| 04 | `#games` | Volcano | games.rexy.win |
| 05 | `#mac` | Ranger outpost | the macOS apps |
| 06 | `#tesla` | Migration trail | the car dashboard |
| 07 | `#music` | Singing lagoon | `/music/` |
| 08 | `#log` | Strata cliff | `/log/` |
| 09 | `#index` | The whole island | the site's directory listing |
| 10 | `#contact` | Base camp | the contact address and the footer |

Three layers, each working without the one above it:

1. **The page** — `index.html` + `css/island.css`. Every stop is a full-height section with a still of its place (`/assets/island/<id>.webp`) behind a glass panel of real content. No script is needed to read or navigate it: the dock at the bottom and the minimap are plain anchors. Panels carry no place names or numbers; the dock is where the places are named.
2. **Travel** — `js/island.js` (classic script, no dependencies). Scroll position *is* position on the tour: a fractional stop index (2.5 = halfway between stops 2 and 3). The dock, the minimap pins, `[data-go]` links and any same-page hash link (the top bar's `/#apps`, the palette's `/#mac`) call `go(i)`.
3. **The live world** — `js/world.js`, an ES module that `island.js` imports only when the device qualifies. A fixed `<canvas>` behind `<main>`; when it is ready `html.world-on` fades the stills out. `go(i)` then becomes a camera flight (`world.flyTo`), and scrolling drives `world.setProgress`.

Rules that keep it working:

- **The anchors are a contract.** `#apps` and `#mac` are linked from other pages; the ids in the table above are checked by `_tools/paths/check.py`.
- **Content lives in the HTML, never in the world.** The world is `aria-hidden` decoration. Anything a visitor must be able to read, select, translate or click is in a panel.
- **Stills must match the world.** They are frames of the same cameras (`_tools/world/posters.mjs`), so the swap from still to live is invisible. Regenerate them whenever the island or a camera changes.
- **A panel shows the product itself where there is a picture of it.** `/assets/island/shots/` holds them: a capture of the typing page, a frame of Deadly Balloons 3 (the Swarm Queen), the first screen of each of the six games, Rex Boing's icon from its repository. The car dashboard is private and the music has no artwork worth showing, so those two panels carry illustrations instead (generated with Codex; the car panel says so). Retake a capture when its product changes its face: 960×540 for a panel, 640×360 for a row, WebP.
- **Nothing dark travels up the page.** What makes the hero's words readable over the live view is `.scrim`, fixed to the screen, its opacity set from how near the overlook is (`--hero`, written by `island.js`). A still carries its own shade, which scrolls with it.
- **On a phone the place keeps the top of the screen.** Below 860 px a stop's content rises from the bottom and long lists become strips swiped sideways, so a panel shares the screen with its place: a short panel leaves the place most of the screen, a long one rises to a third of the way down and no further. `island.js` reads where each panel ended up and tells the camera where the middle of the open part is (`world.setFrame`, one answer per stop, blended while scrolling); the director tips the lens, about its own right-hand axis, until the subject sits there. A place can also turn or raise the camera for an upright screen (`tall`, `tallCam` in `places.js`). Sentences that only make sense with a pointer, and the longer asides, are `.wide-only`.
- **Every stop shows what its page is about.** At the apps stop there is one standing stone per app in `APPS`, its icon set into the rock (read from the `[data-app]` chips: `--t-dark` and the chip's `<img>`); the rex turns from stone to stone and knocks them over, and pointing at a chip sends it to that app's stone. At the outpost the rex types at a laptop whose screen runs through the four Mac apps (drawn in `screens.js`, not screenshots). A red roadster flies the migration trail, a speaker stack on a rock in the lagoon rings the water, and over the crater pterosaurs wheel on the heat that comes off the lava. Beyond that: a stone per letter that lights when you type it, balloons you can pop, a volcano that smokes while `rexChrome.pingGames()` resolves, a campfire fed by the age of the last commit (the status bar's `git log`).
- **Nothing changes size to change detail.** A plant hands over to its simpler stand-in by dissolving pixel by pixel at full size (`lodFade` in `flora.js`); scaling one down while the other grew read as the forest warping whenever the camera travelled. The two overlap: the stand-in has arrived in full before the plant starts to go, so what dissolves does so in front of its own replacement (given complementary halves of the pixels instead, every crown in the hand-over band was a screen door against whatever lay behind it). The distance is measured from the visitor's camera (`uEye`), never from `cameraPosition`, which in a shadow pass is the sun's own camera. Trees throw no shadow of their own on purpose: the sun is low, and a stand of conifers would put every clearing in the dark.
- **Copy rules from before still apply:** describe the games portal without a count and never say where it is hosted; the car dashboard is private, nothing links to it.
- The easter egg is unchanged: hold the mascot beside the title for two seconds (`js/index.js`, `css/easter-egg.css`).

### Who gets the live world

`island.js` picks a detail tier, the visitor can overrule it (the `detail` menu under the dock, stored in `localStorage` as `rex-island`), and `?island=<tier>` forces one for a single load.

| Tier | Picked for | What changes |
|---|---|---|
| `ultra` | NVIDIA, recent Radeon RX, Apple M-series Max/Ultra, with WebGPU | everything |
| `high` | other desktop GPUs, or any of the above on the WebGL 2 fallback | coarser terrain rings, 60% of the plants and ground cover, lighter shadows, fewer steps in the sunbeams and the occlusion |
| `medium` | integrated Intel graphics, 4-core or 4 GB desktops, phones with 8 GB | no water reflections, ambient occlusion or depth of field; sunbeams at a quarter size; a third of the plants and a fifth of the ground cover; one-colour caustics; the wave sheet redrawn every other frame; 720p-class |
| `low` | other recent phones | no post-processing at all (no sunbeams, no motes, no sparks over the lava), a twentieth of the ground cover and simpler blades, one shadow cascade, 540p-class |

Every tier keeps what makes the light: the trees' shade and its flecks, the caustics, the moving water, the lava. What the smaller tiers lose are the passes over the whole picture and the counts.
| `off` (stills) | `prefers-reduced-motion`, Save-Data, no WebGL 2, small or old devices | no canvas at all |

While the world is being built a loading screen covers the page (`#loader` in `index.html`, styles at the end of `css/island.css`): a dusk silhouette of the island with a pixel rex running along it, a bar and the name of the stage. It is drawn only with `transform` and `opacity` animations, so it keeps moving on the compositor while the main thread is busy raising the island. An inline script in `<head>` sets `html.world-loading` before first paint whenever a live world is going to be tried, so the stills page is never seen half-ready; devices that get stills only never see the loader. It offers "skip to the stills" after seven seconds and gives up by itself after 75.

**The ground's shader reads 15 textures on the two upper tiers, and 16 is all a phone's GPU (and WebGPU's default limit) allows.** Anything new the sunlight or the terrain needs has to share a texture that is already there, as the trees' shade does.

Behind it the world compiles every shader before anyone sees it: once for everything at once, shown or hidden, off the main thread (`scenePass.compileAsync`), then by drawing each stop once. On the Mac Studio that is about six seconds on a cold shader cache and under five on a warm one; a flight between stops then never hitches. **Do not give a prop its own light that is shown and hidden with it:** a light that comes and goes changes the lighting every shader in view was compiled for, and each one is then recompiled on the spot (this cost six seconds of frozen loading screen before it was found). `?salt=<n>` changes the shader text and so reproduces a cold cache; `dev.html?trace=1` logs what the warm-up compiled.

### How the world is built (`_tools/world/`)

Almost everything is generated in the browser at load by the modules in `_tools/world/src/`, which `build.mjs` bundles with three.js into `/js/world.js`. The exceptions are two image files of photographic detail in `/assets/island/tex/` (plant cutouts and six kinds of ground: about 1.9 MB, fetched while the island is raised) and the app icons on the stones. The photographs are an improvement, never a requirement: without them (the `low` tier, a failed download) the plants and ground are painted procedurally as before. (`skin.webp` beside them is what the animals' hide used to be laid from; `textures.py` still makes it, nothing fetches it.)

```bash
cd _tools/world && npm install      # esbuild and three, once
npm run build                       # writes /js/world.js (commit it)
npm run dev                         # unminified, with a source map: do not commit this one
```

| File | What it makes |
|---|---|
| `island.js` | The island as data: where each site is and the height of the ground (`shapeHeight`), baked into a grid with normals, vegetation, moisture and occlusion maps. Pure JS; `relief.mjs` renders it without a GPU. **Start here to reshape the land.** |
| `places.js` | The eleven stops: where the camera stands, what it looks at, where the rex waits, what the lens is focused on and how wide it is open. Offsets from a site, resolved against the terrain. |
| `terrain.js` | The ground: a geometry clipmap (nested rings centred on the camera, each twice as coarse), heights read from the grid in the vertex shader, materials blended from slope, height, moisture and noise, the grain of the rock read small where the lens is close and large on cliff faces (joints and buttresses the size of a house, which is what gives a face its shape from across a valley). Also bakes the island-scale sun shadow, and keeps it as heights (how high the shadow of the hills stands over every cell) so that anything in the air can ask whether the sun reaches it. |
| `light.js` | Sunlight as a function of where a thing is: the hills' shadow, cloud shadow, the shade of the trees (each tree lays a long shadow into one map of the island as `flora.js` plants it; no tree is in a shadow map. The map holds how high the shade stands at each spot, so the forest floor, a trunk and an animal under the trees are in it and the crowns that cast it are in the sun; it travels as the fourth channel of the terrain's shadow texture), flecks cut out of that shade, and under water a net of caustics. The flecks and the caustics are patterns slid along the sunbeam, so a beam in the haze and the patch it makes on the ground are the same piece of light. Also draws, once a frame, the tileable sheet of caustics and wave slopes that the water and the caustics read. The sun's `colorNode` is this function, so every lit material gets it. |
| `footprint.js` | What stands on the ground: ahead of every stop's camera, a 64 m square at 25 cm into which the footprint of each solid prop, boulder and fallen trunk is drawn after everything has been put down. The ground cover leaves those cells bare and the ground darkens round them (contact shade). A thing that is knocked over registers as a *mover* with two poses, and its shade is mixed between them as it falls (`mover`, `setFall`: the standing stones). |
| `tsl.js` | `smoothstep` for shaders that is safe to call with its edges the wrong way round (undefined in GLSL and WGSL; every module imports this one), and `time`, the island's own clock: every shader reads it, never three's `time`, so a still asked for at a moment (`freeze`, `play`) finds every wave, spark and cloud where that moment put it. |
| `cover.js` | Ground cover: a quarter of a million blades and fern fronds, none of them placed. One square of them is kept wrapped round the camera and each plant finds out in the vertex shader where it has landed (the height of the drawn ground, `terrain.groundHeight`; soil or sand or rock or path; whether a stone stands there). No textures: a ribbon bent along an arc with its outline cut analytically. Further off there are fewer, wider plants, and they come and go by dissolving, never by changing size. |
| `fx.js` | Small bright things, all functions of the clock: motes that wrap round the camera and flare where a sunbeam reaches them (never drawn smaller than a pixel, drawn dimmer instead), sparks, the camp fire's flame, and `reliefNormal(h, k)` (a normal from a height that exists only as a formula: the carved letters, the stump's bark, the speaker's grain). A fade by size on screen goes in `k`, which scales the slope after it is taken: folded into the height it would be a derivative of a derivative, which no shading language defines. |
| `atmosphere.js` | The sky, computed once on the CPU by marching sunlight through a model atmosphere; the same table colours the dome, the distance haze and the ambient light. The sun's disc and its aureole, clouds and their shadows. (`main.js` adds, besides the sun and the sky's hemisphere, a weak shadowless fill from opposite the sun: what comes back off the sea, so a flank turned away still has a shape.) |
| `water.js` | One sheet of water for sea, lake and river: its surface is the wave sheet from `light.js` read at four sizes (real trains of waves that travel, not a scrolled picture), Fresnel sky, screen-space reflections of the land, sun glitter that sparkles facet by facet, depth tint, foam at the tide line, and rings spreading from the speaker in the lagoon. It writes depth, so the lens and the haze see the surface and not the seabed. |
| `flora.js` | Plants: foliage sprites in one atlas (photographic cutouts where `photos.js` has them, otherwise painted with the 2D canvas), plants built from cards and tubes, instanced with three levels of detail, wind in the vertex shader. Trees island-wide; understorey only around the stops. |
| `fauna.js` | Animals: each species is a skeleton plus rounded cones; the cones are blended into an implicit surface, meshed (surface nets), bound to the skeleton by distance, and walked by a few sine waves. Teeth and claws are separate little cones. The rex has poses the set pieces drive (`act`: stepping, a shove, typing, a gaze). The implicit surface can cut as well as add (eye sockets, nostrils, the line of the mouth), and is meshed finer over the head, hands and feet. Eyes are balls in sockets under lids; teeth are rooted in gums. The hide is one procedural sheet of scales stored as slopes, projected in the rest pose and lit from the slopes directly, in four sizes chosen per vertex (finest round the eye and lips, plates along the back); it replaced a photograph of skin, which smeared wherever it was enlarged. |
| `pterosaur.js` | The pterosaurs (`createFlock`): a Pteranodon built from its measurements. Body, neck and beak are one skin lofted along the spine, the crest a blade lofted the same way, the wing an arm and wing finger of tubes with a membrane from it back to the ankle and a smaller one forward to the neck. One instance per animal; the wing bends along an arc from the shoulder and the hand folds back at the wrist, in the vertex shader (`wingStroke` turns a phase and an effort into those numbers). The membrane lets the sun through. A flock can be given its own lights and a glow from below (the crater's, whose point light would burn out anything that flew near it). |
| `props.js` | The fixed furniture: stone keys with their letters cut in, balloons the sun shines through, the lava lake (plates of crust adrift, seams with a white core and orange shoulders, lit by the sky alone so it reads as the thing that glows) with its sparks, the glow in the air over it and the hot rim it puts on the crater wall (`terrain.uLava`), smoke, the tower, the camp. |
| `scenes.js` | The set pieces, one per themed stop: the icon stones and the rex's routine, the laptop on the stump (seated under the rex's own hands), the roadster and its loop (a spline-skinned body under paint that mirrors the sky, the cloud and a tree line), the speaker stack and its beat (cones, meter, droplets and the water's rings all counted from one clock), the kettle of pterosaurs over the crater. Everything here is a function of the island's clock, so a still can be replayed. Thrown things (dust, spray) are sprites with a start, a velocity and a birth time; the shader does the rest. |
| `screens.js` | The four screens the laptop shows, and its keyboard, drawn with the 2D canvas. |
| `photos.js` | Loads the three photograph files and hands them to the plants, the terrain (as a texture array, each layer divided by its own average so it adds texture without repainting the island) and the animals. |
| `director.js` | The camera: scroll-bound hops between stops, flights on demand, a little hand-held sway, and the tilt that puts the subject where the page has room for it (`setFrame`). |
| `post.js` | The picture after the scene: ambient occlusion (near things only: on a far wood it is a scatter of dark specks); sunbeams (the haze marched through the same shadows and flecks the ground is lit by, at reduced size, blurred and enlarged without crossing depth edges); depth of field, focused per stop (`lens` in `places.js`) and wide open only when the camera has settled; a glare with no threshold; the grade, the filmic curve, a vignette and dither. |
| `quality.js` | The tiers. |

It renders with three.js's `WebGPURenderer` and TSL shaders, which fall back to WebGL 2 on their own. Compute shaders are deliberately not used, so both backends run the same code.

The light, the sunbeams, the caustics, the ground cover, the motes and the order of the grade are techniques from [Abyssal Garden](https://github.com/Noniv/abyssal-garden) by Maksymilian Dendura (MIT), an underwater scene in raw WebGPU, re-made here in TSL for an island: canopy flecks where it has caustics on rock, pollen where it has marine snow, fern fronds and rushes where it has kelp.

Tools in the same folder (Node 22+, a Chrome started with `--remote-debugging-port`, the repo on `localhost`):

- `dev.html` — the world alone, no page: `/_tools/world/dev.html?tier=ultra&webgl=1&bare=1&post=0`. `q=shafts:0,ao:0` overrides single fields of the tier (to measure what each costs), `cover=0` leaves the ground cover out, `bundle=<name>` loads `/js/<name>.js` instead of `world.js` (to compare with a build kept aside).
- `shot.mjs` — renders views in that Chrome and reports console errors and, with `--fps`, frame rates.
- `critic-set.mjs` — the image set for a visual review: every stop at 2560×1440, frames from flights, a frame pair 0.2 s apart. The island was built against an independent critic that saw only these images, never the code.
- `posters.mjs` + `posters.py` — the stills and the minimap, into `/assets/island/`. Each still lets the island's clock run for six seconds first (`world.play`), so the stones, the pterosaurs and the ripples are caught in the act.
- `textures.py` — makes `/assets/island/tex/` from source photographs (keys the cutouts off magenta, makes the ground squares seamless). The sources are not in the repository; the script's header says what they were.
- `relief.mjs` — a shaded-relief PNG of the island from `island.js` alone.

### What the old landing page left behind

`css/landing.css`, `js/landing.js` and `js/hero-particles.js` (the scroll story with the particle rex, written up in `/log/particle-rex.html`) are no longer loaded by any page. They stay in the repository because nothing published here is deleted (see below).

## Published paths never disappear

Store listings, review forms and other people's links point into this site, so a path that was published stays published. `_tools/paths/manifest.txt` lists every file the site served on 2026-11-20; `_tools/paths/check.py` fails if any is missing, if the home page loses one of its anchors, or if any same-site link in any page does not resolve. The App Manager installers under `/downloads/app-manager/` and the RexDesk ones under `/downloads/rexdesk/` are the exception and are not in the manifest: their file names carry the version and every release replaces them, so `--update` leaves them out and only the link check watches them.

```bash
python3 _tools/paths/check.py            # before every commit that moves or renames anything
python3 _tools/paths/check.py --update   # after adding pages: appends them to the manifest
```

### Sub-page motion

`css/motion.css` + `js/motion.js` (dependency-free) reveal `[data-reveal]` elements and the children of `[data-reveal-group]` as they scroll in. Browsers with CSS scroll-driven animations do it in the stylesheet alone (`animation-timeline: view()`, `animation-range: entry 0% entry 40%`) and `motion.js` steps aside when `CSS.supports` says so; everywhere else the script marks `html.motion-ready` and toggles `.is-in` with an IntersectionObserver. Nothing is hidden unless one of the two can reveal it. Page extras:

- `/typing/` — `typing/js/keyboard-hero.js` draws a QWERTY + 두벌식 keyboard in the game's home view and types sample sentences on it, decomposing Hangul syllables into the real jamo keystrokes so the right keys light up (real key presses light them too). It pauses whenever the home view is hidden.
- `/deadlyBalloons/` — the balloon rain uses Deadly Balloons 3's own sprites (`res/img/db3/`, exported from the game's texture atlas), varies in size and depth, and balloons pop when clicked (shards, ring, "+100", a counter in the card).
- `/music/` — a CSS equaliser above the player. `/support/` — a pulsing "replies within a day or two" status. `/404.html` — the rex looks left and right.

## The typing game (`/typing/`)

**rex/type** is one page (`typing/index.html`) with hash routes, so every mode has a link: `#/` home, `#/test`, `#/daily`, `#/drills`, `#/meteor`, `#/race`, `#/ranks`, `#/stats` (and `#/result` after a run). Plain ES modules under `typing/js/`, no framework; the page loads Font Awesome, the Firebase compat SDK (deferred) and `data/simple_words.js` besides.

| Module | Job |
|---|---|
| `hangul.js` | Hangul ↔ 두벌식 keystrokes (한 → `gks`). Stroke counts (타수), "is this composing syllable a correct step toward the target" (한 is on the way to 하나: `gks` is a prefix of `gksk`), the next key for the keyboard hint |
| `engine.js` | `Session`: judges every character, scores lines, keeps the clock and per-second samples. No DOM, tested in Node |
| `content.js` | Seeded text sources (`makeSource`), balanced line wrapping, the daily text, word pools for the arcade modes, and the original silly-sentence machine (plus the 이포넷 office variant) |
| `stage.js` | The typing surface: four lines, smooth caret, pace ghost, HUD, and a visible prompt that holds the real `<input>` so the IME composes in it on every platform |
| `app.js` | Routing, the test / daily / drill flow, results, leaderboards, stats, settings |
| `result.js` | Result screen: tier badge, numbers, SVG speed chart, character breakdown, missed words, missed-key heat map, share text |
| `meteor.js`, `race.js` | Meteor defense (falling words, lives, combos, gold / ice / bomb / heart meteors) and the dino race (three bots paced to the player's recent average) |
| `drills.js`, `keyboard.js` | Key drills (rows, double consonants, numbers, symbols, weak keys) and the on-screen keyboard with finger colours, next-key hints and the heat map |
| `store.js` | Everything kept on the device, in `localStorage` under `rex-type`: settings, history, personal bests, per-key accuracy, XP and level, streak, achievements |
| `board.js` | Firestore leaderboards |
| `i18n.js`, `grades.js`, `sound.js` | Korean / English interface strings, tiers and titles, Web Audio sound effects |

Content lives in `typing/data/`: `ko.js` (proverbs, quotes, sentences, paragraphs, 800 words), `en.js` (top 200 words, quotes, original paragraphs, hard words), `code.js` (12 snippets in each of 10 languages), and the older `simple_words.js` (the normal English list). Every string is plain typeable text: no smart quotes, dashes or tabs. `nouns.js`, `verbs.js`, `adjectives.js` and the old `js/transit.js`, `js/sent_generator.js`, `js/prg_sent.js` are no longer loaded; they stay because published paths stay.

**How a run is measured.** The clock starts at the first keystroke (races start it at the green light). Lines are compared word by word, letter by letter. Speed counts only what ends up correct, spaces and line breaks included: correct jamo keystrokes per minute for Korean (타/분, KPM), correct characters ÷ 5 per minute for English and code (WPM). A line typed exactly advances on its own, and its break counts only if the player then types it (space or Enter). Accuracy counts every character at the moment it was committed, corrected mistakes too. The per-second raw speed and consistency come from keystrokes as they happen. The last syllable of the input is never judged while the IME may still change it. Enter during composition waits for the IME to finish the syllable. A space on an empty word (doubled, or at the start of a line) is ignored, and paste is blocked.

**Leaderboards** (Firebase project `rextypingspeed`). The ranked tests are the 60-second ones: 한글 문장 or 이포넷, English words on normal without punctuation or numbers, and code. They write to the same collections and fields as every earlier version of the game: `records2` / `engRecords` / `prgRecords` (best per name, all time) and `recordsAnon` / `engRecordsAnon` / `prgRecordsAnon` (every finished ranked run, read for today's board by `day`). Meteor defense saves to `meteorRecords`. Nothing is written from a local host (`localhost`, `127.0.0.1`, `*.localhost`, `*.test`), so testing never touches the boards; reads still work. `CLIENT_VERSION` in `board.js` is compared with the `version` collection, and holding the brand mark for three seconds shows that collection's history.

**Tests.** `node _tools/typing/engine.test.mjs` runs the engine against a simulated 두벌식 IME (`_tools/typing/ime.mjs`): composition, corrections, timing, sudden death, line commits.

## Shared chrome: skip link, navbar, status bar, palette

`navbar.html` is a pure HTML **fragment** (not a standalone page) containing the skip link, the fixed top bar and the fixed bottom **status bar**. `/js/common.js` mounts it into `<div id="nav-placeholder">` on every page, injects `/css/navbar.css`, Font Awesome, the Google Fonts link and `/js/palette.js` if the host page lacks them, highlights the active link, and wires everything:

- **Mounting** — the fragment is cached in `sessionStorage` (`rex-navbar-html`) and mounted synchronously from the cache on the next page, so the bars already exist when a view transition snapshots the new page; the network copy refreshes the cache in the background. A change to `navbar.html` therefore reaches a visitor on their *next* page load.
- **Skip link** — first in the tab order; `common.js` points it at `<main>` (given `id="main"` and `tabindex="-1"` if missing), or at the first content block on pages without a `<main>` (the generated policies).
- **Top bar** — typing · balloons · games ↗ · music · apps (→ `/#apps`, lit on every `/apps/…` page via `data-match`) · log · support · github ↗, then the palette button (`⌘K`, `Ctrl K` on other platforms; icon only on touch). The animation lab is reachable from the index, the footer and the palette rather than the top bar. The hidden Parser admin dropdown is still in the fragment.
- **Status bar** — left: branch (links to the repo) with the age of the last commit from the GitHub API (`api.github.com/repos/…/commits`, cached per tab for ten minutes, silent on failure) and the current path (`~/typing/index.html`); right: a games-portal dot, `Ln` following scroll, `Col` following the pointer, scroll percentage, encoding, the **theme toggle** and a second palette button.
- **Games ping** — `rexChrome.pingGames()` makes one opaque (`mode: 'no-cors'`) request to `https://games.rexy.win/api/status`: it resolves when the server answers at all and rejects when it does not, so it is an honest "up" that never logs a CORS error. The status API sends no CORS header yet; once games-infra adds `Access-Control-Allow-Origin`, the same call can read per-game status.
- **Theme** — the choice is stored in `localStorage` under `rex-theme`. Hand-written pages run a one-line inline script in `<head>` that applies it before first paint; generated pages get it when `common.js` loads. `common.js` also keeps a media-less `<meta name="theme-color">` in sync (the two media-gated ones in each page cover the first paint) and dispatches `rex:theme` when it changes. `window.rexChrome` exposes `effectiveTheme`, `setTheme`, `toggleTheme`, `pingGames`.

### Command palette (`/js/palette.js`)

`⌘K` / `Ctrl K`, any `[data-palette-open]` button, or `window.rexPalette.open()`. A `<dialog>` listing pages, the games, every published app (privacy policy or store page), the macOS apps (Rex Boing to GitHub, App Manager and RexDesk to their download pages, the in-house tools to `/#mac`), actions (toggle theme, copy / write e-mail, scroll to top, view this page's source) and the outbound links. Substring scoring with a subsequence fallback on titles; arrows / Tab / Enter / Esc; keystrokes inside the dialog are stopped so the typing game's document-level handler never counts them. The site index is also published as `window.rexSiteIndex` (event `rex:site-index`), which `/404.html` uses for its suggestions. Add a page or app there when you add one to the site.

Because the chrome is fetched at runtime, pages must be served over HTTP — `file://` won't show it:

```
python3 -m http.server 8123
```

## Social cards and icons

Every hand-written page carries `og:*` / `twitter:*` meta and a 1200×630 card at `/assets/og/<name>.png`, rendered by `_tools/og/render.mjs` from `_tools/og/card.html` (headless Chrome over the DevTools protocol, Node 22, no npm): the page's path, its title and the rex as a dot matrix sampled from the same PNG the hero uses. The same script renders the manifest icons from `_tools/og/icon.html`. The directory starts with an underscore so Jekyll keeps it out of the published site.

```
node _tools/og/render.mjs            # every card + the icons
node _tools/og/render.mjs typing 404 # just those cards
```

To add a page: an entry in `CARDS` there, the meta block in the page's `<head>` (copy one from `support/index.html`), a row in `sitemap.xml`, an entry in `js/palette.js`.

The app landing pages are the exception: their card is the app's own store feature graphic, copied to `/assets/og/apps/<app_id>.jpg` (1024×500), so they have no entry in `CARDS`.

## App landing pages

Every app that is public on Google Play or the App Store has its own page at `/apps/<app_id>/` (the App Manager id; one page per product, so the Play-only Java KakaoParser and its Flutter iOS twin share `/apps/kakaoparser/`). Each page is designed for its app — palette from the app's own theme, its own Google Fonts pairing, its own layout and one interactive demo — while keeping the site chrome and the light/dark toggle. Korean-market apps get Korean pages.

| Path | App | Stores |
|---|---|---|
| `/apps/age_calculator/` | How Old Are You? Age Test | Play · App Store |
| `/apps/qr_scanner/` | QR Scanner: Scan & Create | Play |
| `/apps/reverse_image_search/` | Reverse Image Search | Play · App Store |
| `/apps/exif/` | Photo Exif Metadata Editor | Play |
| `/apps/deadly_balloons/` | Deadly Balloons: Bullet Hell | Play · App Store |
| `/apps/visual_metronome/` | Visual Metronome | Play · App Store |
| `/apps/kakaoparser/` | 카톡 정밀 분석기 | Play · App Store |
| `/apps/kakao_love_analyzer/` | 카카오톡 연애 분석기 | Play · App Store |
| `/apps/katalk_keeper/` | 슬쩍 | Play |
| `/apps/saju/` | 사주 분석기 | Play |
| `/apps/alba_pay/` | 알바수첩 - 알바 급여·주휴수당 계산기 | Play · App Store |
| `/apps/date_planner_2/` | 데이트코스 - AI 데이트 플래너 | Play (production release sent, listing not public yet — not linked from the home page, palette, sitemap or support until it is) |
| `/apps/line_chat_analyzer/` | TalkScope - Chat Analyzer (EN · 日本語 · 한국어) | Play |

### App Manager download page (`/apps/app_manager/`)

The desktop app itself, not a store app: bilingual (English / Korean) with an EN · 한국어 toggle. Every string is written twice (`lang="en"` / `lang="ko"`) and `html[data-lang]` hides one; an inline script in `<head>` picks the language before first paint from `?lang=en|ko` (for sharing), then the last choice (`localStorage` `rex-lang`), then the browser. The toggle writes `?lang=` into the address bar. The installers are committed under `/downloads/app-manager/` (`AppManager-<version>.dmg` from App Manager's `make release`, `AppManagerSetup-<version>.exe` from its Windows CI). On a new version this happens by itself: when App Manager publishes a release (its `make publish`, `make publish-windows`, `make publish-all` / `make ship`, or Mac Studio Project Manager's Publish buttons), its `scripts/publish-site.sh` copies the new installer(s) in, removes the older copy of each, rewrites the file names, sizes (MiB, rounded), SHA-256 sums and version in `apps/app_manager/index.html` and pushes one commit ("App Manager <version>: downloads for …"); pull before editing here. It finds every spot by the installer's file name — the JSON-LD, the chip in the hero's top line, every download link (the product bar's included), the fine print, the closing line and the checksums — so keep the names `AppManager-<version>.dmg` / `AppManagerSetup-<version>.exe` in links, a size like `29 MB` inside each download link, and a `<dt>file</dt><dd>sum</dd>` pair per installer; a page without one of those is refused, not half-updated. By hand: replace both files, then search the page for the old version number. Its social card is rendered (`node _tools/og/render.mjs app_manager`), not a store graphic.

The page is laid out like a Mac-software product page: a centered hero (chip, icon, tagline, the two download buttons) over the drawn window, which lies back and stands up as it scrolls in (CSS `animation-timeline: view()`; static elsewhere); a "works with" belt; a bento of six numbered tiles, each with a small slice of the app drawn in CSS that plays once on arrival (`data-live` → `.is-live`); the agent session with the `am` terminal tucked under it; a privacy card; the two platform cards; early access + requirements; an FAQ built on exclusive `<details name>`; the closing CTA with the checksums. A product bar (`.am-bar`, fixed under the site's top bar, `inert` while hidden) slides in once the hero's download buttons have scrolled away: section links with a scroll-spy, the language toggle, and a Download button that `page.js` points at the visitor's OS. Cards marked `data-spot` get a soft light under a fine pointer. Everything hidden for a later reveal is scoped to `html.am-js`, so the page is complete without the script, and reduced motion turns the belt, the tilt and the vignette playback off.

Rules for its copy: every claim on the page comes from what App Manager does today — no user counts, ratings, testimonials or pricing — and the apps and numbers inside the drawings are made up and say so (`.am-tabs-hint`, `.am-bento-note`). The `am` commands in the terminal card are real (`am tools` lists them); check them against the CLI before changing them. Type is Inter with its display optical size (Hangul falls to Apple SD Gothic Neo, then IBM Plex Sans KR); the drawn window and vignettes use the system UI stack so they look like the app.

### RexDesk download page (`/apps/rexdesk/`)

The second desktop download page: RexDesk (remote control for Macs) ships as two Mac apps, **RexDesk Host** for the Mac being controlled and **RexDesk** for the Mac you sit at, and the page offers both. Bilingual like App Manager's, by the same mechanism (`lang="en"` / `lang="ko"` twins, `html[data-lang]`, `?lang=`, `localStorage` `rex-lang`). The installers are committed under `/downloads/rexdesk/` (`RexDesk-Host-<version>.dmg`, `RexDesk-<version>.dmg`, from RexDesk's `make release`). On a new version this happens by itself: when RexDesk publishes (its `make publish` or `make ship`, or Mac Studio Project Manager's Publish Release / Release & Publish buttons), its `scripts/publish-site.sh` copies both installers in, removes the older copy of each, rewrites the file names, sizes (MiB, rounded), SHA-256 sums and version in `apps/rexdesk/index.html` and pushes one commit ("RexDesk <version>: downloads for macOS"); pull before editing here. It finds every spot by the installer's file name — the JSON-LD, every download link, the closing line's file names and the checksums — and the version by `"softwareVersion"`, `<b>v…</b>`, `Version …` and `버전 …`. So keep the two file-name patterns in links, a size like `2 MB` inside each download link, and a `<dt>file</dt><dd>sum</dd>` pair per installer; a page without one of those is refused, not half-updated. Its social card is rendered (`node _tools/og/render.mjs rexdesk`).

Layout: a centered hero (version chip, the two download buttons side by side, since a visitor needs both) over a drawn pair of Macs joined by a line that carries the picture one way and the pointer the other; four measured figures; three set-up steps; six feature cards; **the demo**, a packet-loss slider (`page.js`) that shows frames arriving as pieces plus spares and being rebuilt or asked for again; security and privacy; one card per app with what it needs and asks for; FAQ on exclusive `<details name>`; the closing CTA with the checksums. Palette: the host icon's teal on the left, the viewer icon's blue-violet on the right. Type: Sora for display.

The page also sends people to the web viewer at `/rexdesk/` (a line under the hero's download buttons, a third card in the downloads section, an FAQ entry): those links carry no version, so the rewriter does not touch them.

Rules for its copy: every claim comes from what RexDesk does today (its README's measurements and its protocol documents) — no user counts, ratings or pricing — and the two drawn things say what they are (the Macs: "a drawing, not a screenshot"; the slider: "a simulation of the idea, not a measurement"). The apps for iPhone/iPad, Android and Windows are named as in testing and not downloadable; give them cards and download links only when RexDesk's publish script learns to ship them. The web viewer is described as made for current Chrome and Edge, with Safari little tested (it ran in an iPhone simulator) and Firefox not at all: change that only when they have been tested.

### RexDesk in the browser (`/rexdesk/`)

The web viewer itself: type a Host ID and the access password, and the Mac's screen is in the tab. It is **not part of this site's design system and not edited here**: the whole folder is RexDesk's `web/` directory (minus its tests), copied in by RexDesk's `scripts/publish-site.sh` on every `make publish` / `make publish-web` (and Mac Studio Project Manager's Publish buttons), with files that left `web/` removed. A change made here is overwritten by the next publish; fix it in the RexDesk repository.

It stands alone on purpose. It does not load `/css/index.css`, `/js/common.js`, the navbar or any font or script from outside its folder, and its `<meta http-equiv="Content-Security-Policy">` allows only that (plus WebSocket connections to rendezvous services): the page handles an access password and an end-to-end encrypted session, so nothing else gets to run in it. Keep it that way: no site chrome, no analytics, no ads in `/rexdesk/`.

`_tools/paths/check.py` treats `/rexdesk/index.html`, `app.css`, the manifest and the icons as permanent paths and leaves `/rexdesk/js/` out of the manifest (module names belong to RexDesk and may change with a release).

Files per app: `apps/<id>/index.html`, `page.css`, `page.js` (dependency-free), `img/` (WebP screen captures, icon), and the social card `/assets/og/apps/<id>.jpg` (the store feature graphic, 1024×500). Shared pieces live in `/css/app-page.css` — store buttons, the `.app-device` phone frame for real screen captures, the `.app-foot` footer — and a new page starts from `_tools/app-page/skeleton.html`. Each page sets the site tokens (`--bg`, `--fg`, `--accent`, …) for both themes so the top bar and status bar sit on its palette.

These pages sit beside the generated policies but App Manager never touches them: it only writes `apps/<id>/privacy-policy/index.html` (and `apps/index.html` only when that page lacks the marker described under [App directory](#app-directory-apps)).

App Manager does check for them: each app's Overview shows a **Landing page** tile (At a glance) and card — not created / not committed / not pushed / published — read from `apps/<slug>/index.html` here and the pushed branch. The slug is the App Manager id, else the folder of the app's privacy policy URL, else the folder its App Store marketing URL points at (that is how the iOS twin of KakaoParser finds `/apps/kakaoparser/`). A missing page has a **Build Page** button that runs App Manager's `rex-app-landing-page` skill in the app's agent session; the skill reads this README, the skeleton and the existing pages first, so the rules here stay the source of truth. Its `scripts/images.mjs` converts captures to WebP through headless Chrome when `cwebp` isn't installed. Every App Store listing's *Marketing URL* points at its app's page (keep it that way when an app gains a page or an iOS version).

To add an app when it goes public: build the page from the skeleton, add it to `APPS` in `_tools/app-page/apps.py` and run it (the home page chip, and with it the app's standing stone on the island, plus the `/apps/` card and policy row), then an entry in `js/palette.js` (`INDEX.apps`), a row in `sitemap.xml`, its policy on `/support/`, and a row in the table above. Check it with the screenshot tool:

```
node _tools/shot/shot.mjs http://localhost:8123/apps/<id>/ --out /tmp/<id> --theme dark --at 0,0.5,1
node _tools/shot/shot.mjs http://localhost:8123/apps/<id>/ --out /tmp/<id>-m --mobile --theme light
node _tools/shot/shot.mjs http://localhost:8123/apps/<id>/ --out /tmp/<id>-r --reduced --full
```

It drives headless Chrome over the DevTools protocol (Node 22, no npm) and prints console errors, exceptions and failed requests; exit code 1 if there are any.

## App directory (`/apps/`)

`apps/index.html` is hand-made, generated together with the home page's app chips (the standing stones) by `_tools/app-page/apps.py` (one `APPS` list: name, English one-liner, stores, language, tint pair, which captures, privacy URL; plus the policies of apps still in testing). It has a hero with every app's icon, a search box and filter chips (App Store / Google Play / 한국어 / Global; `?q=` and `?show=` make a filtered view shareable — `/js/apps-index.js`), a card per app built around a real capture, the desktop apps (App Manager and RexDesk, one `.dir-desk` card each), and every privacy policy on the site ("On the stores" / "In testing"), so `/apps/` still works as the policy index the frozen URL contract promises. Styles: `/css/apps-index.css`.

It carries `<meta name="appmanager-apps-index" content="manual">`. App Manager used to rewrite `apps/index.html` as a bare list on every privacy publish; with that marker (App Manager from 2026-11-17 on) it writes only the policy page, and refuses to publish while the directory page has uncommitted edits instead of resetting them. Remove the marker and the next publish replaces the page with the generated list.

## Generated pages — do not hand-edit

Every `apps/<app_id>/privacy-policy/index.html` is generated by the external **App Manager** tool (display names are parsed from each page's `<title>` after the ` — ` separator). Style them only via the `body > main.privacy-article` / `.privacy-meta` rules in `/css/index.css` (`ul.apps-index` styles App Manager's bare list, which only appears if the marker above goes away). Those selectors are deliberately one element more specific than the generator's inline `<style>` so the site theme wins.

### Frozen URL contract (referenced by live app-store listings and tools)

- `/apps/` and `/apps/<app_id>/privacy-policy/`
- `/support/`
- `/app-ads.txt`
- `/css/index.css`, `/js/common.js`, `/navbar.html`, `/favicon.ico`
- `/smartthings-callback.html`

## Dependencies (CDN, pinned + SRI)

- Three.js 0.187.0, bundled into `/js/world.js` by `_tools/world/build.mjs` (the home page's island; not a CDN dependency)
- Google Fonts: IBM Plex Mono, IBM Plex Sans KR
- Font Awesome 6.7.2 (home page easter egg, typing game, animation lab)
- Bootstrap 5.3.8 + jQuery 3.7.1 (animation lab grid, parser admin tools)
- Vue 3.5 (animation lab)
- Firebase compat 8.2.8 (typing game, parser tools)

`common.js`, `palette.js`, `motion.js`, the app landing pages' scripts and the 404 page are dependency-free on purpose.
