# rexyrex.github.io

Personal GitHub Pages site for [rexyrex](https://github.com/rexyrex) — an index of what Rexyrex ships: mobile apps (eight on Google Play, two on the App Store), self-hosted browser games, music, and the privacy-policy / support pages for published apps.

## Pages

| Path | What it is |
|---|---|
| `/` | Landing page: a scroll story — particle rex hero, word-by-word statement, pinned chapters for typing / balloons / apps / music, then the site index and contact (GSAP + Three.js, see below) |
| `/typing/` | Typing speed game — Korean / English / programmer modes, Firebase leaderboards (jQuery + Bootstrap 4.6 + Firebase compat 8) |
| `/deadlyBalloons/` | Landing page for the Deadly Balloons 2 desktop game (dependency-free) |
| `/music/showcase.html` | Music page with a SoundCloud embed and links out |
| `/animation.html` | Animation lab: a scratchpad of CSS text effects on Vue 3 (+ Bootstrap 5 grid) |
| `/parser/` | KakaoParser companion pages: admin tools (query/download, Bootstrap 5) + Korean help & ToS docs |
| `/support/` | App store support/contact page |
| `/apps/` | **Generated** privacy-policy pages — see below |
| `/smartthings-callback.html` | OAuth hand-off shim for the Project Manager app — do not modify |

## Design system

Everything is styled from `/css/index.css`:

- **Tokens** — colors, type, spacing as CSS custom properties on `:root`. Dark is the base; a light palette is applied under `prefers-color-scheme: light` and under `html[data-theme="light"]`. The accent green comes from the rex mascot.
- **Type** — IBM Plex Mono for headings, labels, navigation and anything structural; IBM Plex Sans KR for body text (covers Korean). Both from Google Fonts.
- **Components** — `.wrap`, `.section` / `.section-head` / `.eyebrow`, `.btn` (`-primary`, `-ghost`), `.card`, `.tag`, `.facts`, `.embed`, `.article`, `.index` rows, `.apps-grid`, `.link-grid`.
- **Eyebrows are real paths.** Section labels like `/apps/` and `/typing/` are the actual URLs of what they introduce.

The typing game has its own stylesheet (`typing/css/typespeed2.css`) layered on top of Bootstrap 4 and `index.css`; the animation lab keeps its effect CSS inline and only its page chrome uses the tokens.

## Landing page motion (`/index.html`)

The landing page is an Apple-style scroll story. Files: `css/landing.css` (hero, chapters, mockups, motion gating), `js/landing.js` (GSAP orchestration), `js/hero-particles.js` (Three.js, ES module).

- **Hero** — the rex mascot rendered as ~7k particles sampled from `assets/rexGreenSmall.png` (colours included) on a fixed canvas, over a slow aurora. Assembles from a cloud on load, turns and drifts to the screen centre as you scroll, collapses into a single dot while the statement lights up "…by one developer". Long-pressing the rex still opens the easter egg (`js/index.js`) and makes the particles buzz.
- **Statement** — SplitText words scrubbed from faint to full, then the section pins for ~130% of the viewport while the dot charges, flashes and bursts across the screen (`window.rexHero.burst`). Rendering pauses once the burst is over.
- **/typing/** — a plain section; the editor mockup types generic Korean, English and Java sentences on its own (time-based, human-ish rhythm) while it is on screen, cycling through the tabs.
- **/deadlyBalloons/** — pinned sky with thirty generated balloons at random depths (nearer = bigger, faster, on top; far = small and soft). A dozen pop on their own along the ride — ring flash, shards, "+100" — and every other balloon pops when clicked. A HUD keeps score.
- **/apps/** — pinned horizontal track of eight CSS phones, each a small app mockup (status bar, app bar, cards, charts, chat, a mini game) with one tint per app. Phones tilt toward the pointer; their bars, rings and sparklines animate in when they come on screen. Native snap scrolling on narrow screens and in windows under 700px tall.
- **/music/** — waveform bars that grow in on scroll and rise under the pointer.
- **Headlines** slide up out of line masks, the e-mail rises letter by letter, index rows get a light sweep on hover.

Rules that keep it working:

- Every ScrollTrigger is created inside one `gsap.matchMedia()` callback, top to bottom in page order. Pinned sections must be created in DOM order or ScrollTrigger measures the ones below them wrongly.
- Reveal targets start hidden only under `html.js:not(.motion-off)` and `prefers-reduced-motion: no-preference`. If GSAP fails to load or the visitor prefers reduced motion, `landing.js` adds `html.motion-off` and the page is fully static (PNG rex, no pinning).
- `window.rexHero` is the only contract between `landing.js` (writes `t`, the 0–1 scroll progress, and `excite`) and `hero-particles.js` (reads them, reports `rexhero:ready` / `rexhero:failed`). If the module never reports in, the PNG rex is shown.
- Three.js resolves through the import map in `index.html`; the map's `integrity` block pins both module files.

### Sub-page motion

`css/motion.css` + `js/motion.js` (dependency-free) reveal `[data-reveal]` elements and the children of `[data-reveal-group]` as they scroll in; nothing is hidden unless JS confirms it can reveal it. Page extras:

- `/typing/` — `typing/js/keyboard-hero.js` draws a QWERTY + 두벌식 keyboard in the landing hero and types sample sentences on it, decomposing Hangul syllables into the real jamo keystrokes so the right keys light up (real key presses light them too). It lives inside `.hero-section-typing`, so the game's show/hide logic still covers it.
- `/deadlyBalloons/` — the balloon rain now varies in size and depth, and balloons pop when clicked (shards, ring, "+100", a counter in the card).
- `/music/` — a CSS equaliser above the player. `/support/` — a pulsing "replies within a day or two" status.

## Shared chrome: navbar + status bar

`navbar.html` is a pure HTML **fragment** (not a standalone page) containing the fixed top bar and the fixed bottom **status bar**. `/js/common.js` fetches it into `<div id="nav-placeholder">` on every page, injects `/css/navbar.css`, Font Awesome and the Google Fonts link if the host page lacks them, highlights the active link, and wires the status bar:

- left: branch (links to this repo) and the current path (`~/typing/index.html`)
- right: `Ln` follows scroll position, `Col` follows the pointer, scroll percentage, encoding, and the **theme toggle**

The theme choice is stored in `localStorage` under `rex-theme`. Hand-written pages also run a one-line inline script in `<head>` that applies it before first paint; generated pages get it when `common.js` loads.

Because the chrome is fetched at runtime, pages must be served over HTTP — `file://` won't show it:

```
python3 -m http.server 8000
```

## Generated pages — do not hand-edit

`apps/index.html` and every `apps/<app_id>/privacy-policy/index.html` are generated by the external **App Manager** tool, which rewrites `apps/index.html` wholesale on each run (display names are parsed from each page's `<title>` after the ` — ` separator). Style them only via the `body > main.privacy-article` / `.privacy-meta` / `ul.apps-index` rules in `/css/index.css`. Those selectors are deliberately one element more specific than the generator's inline `<style>` so the site theme wins.

### Frozen URL contract (referenced by live app-store listings and tools)

- `/apps/` and `/apps/<app_id>/privacy-policy/`
- `/support/`
- `/app-ads.txt`
- `/css/index.css`, `/js/common.js`, `/navbar.html`, `/favicon.ico`
- `/smartthings-callback.html`

## Dependencies (CDN, pinned + SRI)

- GSAP 3.15.0 + ScrollTrigger + SplitText (landing page; both plugins are free since 3.13)
- Three.js 0.185.1 as an ES module via import map (landing page hero)
- Google Fonts: IBM Plex Mono, IBM Plex Sans KR
- Font Awesome 6.7.2 (landing page easter egg, typing game, animation lab)
- Bootstrap 4.6.2 + Popper 1.16.1 + jQuery 3.7.1 (typing game only)
- Bootstrap 5.3.8 (animation lab grid, parser admin tools)
- Vue 3.5 (animation lab)
- Firebase compat 8.2.8 (typing game, parser tools)
