# rexyrex.github.io

Personal GitHub Pages site for [rexyrex](https://github.com/rexyrex) — an index of what Rexyrex ships: mobile apps (Google Play and the App Store), native macOS apps, multiplayer browser games, a live dashboard for a car, music, a devlog, and the privacy-policy / support pages for published apps.

## Pages

| Path | What it is |
|---|---|
| `/` | Landing page: a scroll story — particle rex hero, word-by-word statement, pinned chapters for typing / balloons / apps, the games chapter, the macOS apps, the car dashboard, music, then the site index, a "now" card and contact (GSAP + Three.js, see below) |
| `/typing/` | Typing speed game — Korean / English / programmer modes, Firebase leaderboards (jQuery + Bootstrap 4.6 + Firebase compat 8) |
| `/deadlyBalloons/` | Landing page for the Deadly Balloons 2 desktop game (dependency-free) |
| `/music/showcase.html` | Music page with a SoundCloud embed and links out |
| `/animation.html` | Animation lab: a scratchpad of CSS text effects on Vue 3 (+ Bootstrap 5 grid) |
| `/log/` | Devlog: hand-written HTML posts (`log/*.html`, styled by `log/log.css`), newest first |
| `/parser/` | KakaoParser companion pages: admin tools (query/download, Bootstrap 5) + Korean help & ToS docs |
| `/support/` | App store support/contact page |
| `/apps/` | **Generated** privacy-policy pages — see below |
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

The typing game has its own stylesheet (`typing/css/typespeed2.css`) layered on top of Bootstrap 4 and `index.css`; the animation lab keeps its effect CSS inline and only its page chrome uses the tokens.

## Landing page motion (`/index.html`)

The landing page is an Apple-style scroll story. Files: `css/landing.css` (hero, chapters, mockups, motion gating), `js/landing.js` (GSAP orchestration), `js/hero-particles.js` (Three.js, ES module).

- **Hero** — the rex mascot rendered as ~7k particles sampled from `assets/rexGreenSmall.png` (colours included) on a fixed canvas, over a slow aurora. Assembles from a cloud on load, turns and drifts to the screen centre as you scroll, collapses into a single dot while the statement lights up "…by one developer". Long-pressing the rex still opens the easter egg (`js/index.js`) and makes the particles buzz. A `uTint` uniform darkens the cloud a little on the light theme (follows the toggle live). Written up in `/log/particle-rex.html`.
- **Statement** — SplitText words scrubbed from faint to full, then the section pins for ~130% of the viewport while the dot charges, flashes and bursts across the screen (`window.rexHero.burst`). Rendering pauses once the burst is over.
- **/typing/** — a plain section; the editor mockup types generic Korean, English and code sentences on its own (time-based, human-ish rhythm) while it is on screen, cycling through the tabs.
- **/deadlyBalloons/** — pinned sky with thirty generated balloons at random depths (nearer = bigger, faster, on top; far = small and soft). A dozen pop on their own along the ride — ring flash, shards, "+100" — and every other balloon pops when clicked. A HUD keeps score.
- **/apps/** — pinned horizontal track of eight CSS phones, each a small app mockup (status bar, app bar, cards, charts, chat, a mini game) with one tint per app. Phones tilt toward the pointer; their bars, rings and sparklines animate in when they come on screen. Native snap scrolling on narrow screens and in windows under 700px tall.
- **games.rexy.win** — a plain reveal section (not pinned): one "browser window" per game, each drawn in CSS in the game's two accent colours from the portal's registry (tile maze + fire eggs, crosshair over a perspective floor, circuit traces, flashlight beam + blinking eyes, a self-drawing scribble, a chessboard). The "dino network" pill turns green when `rexChrome.pingGames()` resolves. The cards are static HTML — when the portal adds a game, add a card here, a row in the index and an entry in `js/palette.js`. Keep the copy count-free: the public pages describe the portal with adjectives ("multiplayer browser games"), never a tally, and never say where it is hosted.
- **/Applications/** — a plain reveal section: one little macOS desktop per native app — a menu bar with the app's own status item, and a window or a popover hanging from it, all drawn in CSS. Bars fill, the pixel rex in Rex Boing's menu bar gallops and the usage ring lights once a card is on screen (`.is-live`, the same observer as the phones). Rex Boing links to its GitHub repo and releases; App Manager, Project Manager and AI Usage Tracker are in-house tools and their cards are static.
- **~/teslamate-dashboard/** — the car's own screen: a dark map with a route that draws itself and a dot that follows it (SMIL `animateMotion`, removed under reduced motion), glass cards and four rolling charts. The speed counts up once on screen. The dashboard itself is private: nothing here links to it, and the copy never says where it runs.
- **/music/** — waveform bars that grow in on scroll and rise under the pointer.
- **Index + now + contact** — the directory listing, then a two-column contact section with a dated "now" card (`.now`, hand-edited; keep the stamp honest).
- **Headlines** slide up out of line masks, the e-mail rises letter by letter, index rows get a light sweep on hover.

Rules that keep it working:

- Every ScrollTrigger is created inside one `gsap.matchMedia()` callback, top to bottom in page order. Pinned sections must be created in DOM order or ScrollTrigger measures the ones below them wrongly. The games chapter is not pinned, so it only relies on the generic `[data-reveal]` / `[data-reveal-group]` / `[data-lines]` passes at the end of the callback.
- Reveal targets start hidden only under `html.js:not(.motion-off)` and `prefers-reduced-motion: no-preference`. If GSAP fails to load or the visitor prefers reduced motion, `landing.js` adds `html.motion-off` and the page is fully static (PNG rex, no pinning).
- `window.rexHero` is the only contract between `landing.js` (writes `t`, the 0–1 scroll progress, and `excite`) and `hero-particles.js` (reads them, reports `rexhero:ready` / `rexhero:failed`). If the module never reports in, the PNG rex is shown.
- Three.js resolves through the import map in `index.html`; the map's `integrity` block pins both module files.

### Sub-page motion

`css/motion.css` + `js/motion.js` (dependency-free) reveal `[data-reveal]` elements and the children of `[data-reveal-group]` as they scroll in. Browsers with CSS scroll-driven animations do it in the stylesheet alone (`animation-timeline: view()`, `animation-range: entry 0% entry 40%`) and `motion.js` steps aside when `CSS.supports` says so; everywhere else the script marks `html.motion-ready` and toggles `.is-in` with an IntersectionObserver. Nothing is hidden unless one of the two can reveal it. Page extras:

- `/typing/` — `typing/js/keyboard-hero.js` draws a QWERTY + 두벌식 keyboard in the landing hero and types sample sentences on it, decomposing Hangul syllables into the real jamo keystrokes so the right keys light up (real key presses light them too). It lives inside `.hero-section-typing`, so the game's show/hide logic still covers it.
- `/deadlyBalloons/` — the balloon rain varies in size and depth, and balloons pop when clicked (shards, ring, "+100", a counter in the card).
- `/music/` — a CSS equaliser above the player. `/support/` — a pulsing "replies within a day or two" status. `/404.html` — the rex looks left and right.

## Shared chrome: skip link, navbar, status bar, palette

`navbar.html` is a pure HTML **fragment** (not a standalone page) containing the skip link, the fixed top bar and the fixed bottom **status bar**. `/js/common.js` mounts it into `<div id="nav-placeholder">` on every page, injects `/css/navbar.css`, Font Awesome, the Google Fonts link and `/js/palette.js` if the host page lacks them, highlights the active link, and wires everything:

- **Mounting** — the fragment is cached in `sessionStorage` (`rex-navbar-html`) and mounted synchronously from the cache on the next page, so the bars already exist when a view transition snapshots the new page; the network copy refreshes the cache in the background. A change to `navbar.html` therefore reaches a visitor on their *next* page load.
- **Skip link** — first in the tab order; `common.js` points it at `<main>` (given `id="main"` and `tabindex="-1"` if missing), or at the first content block on pages without a `<main>` (the typing game, the generated policies).
- **Top bar** — typing · balloons · games ↗ · music · apps · log · support · github ↗, then the palette button (`⌘K`, `Ctrl K` on other platforms; icon only on touch). The animation lab is reachable from the index, the footer and the palette rather than the top bar. The hidden Parser admin dropdown is still in the fragment.
- **Status bar** — left: branch (links to the repo) with the age of the last commit from the GitHub API (`api.github.com/repos/…/commits`, cached per tab for ten minutes, silent on failure) and the current path (`~/typing/index.html`); right: a games-portal dot, `Ln` following scroll, `Col` following the pointer, scroll percentage, encoding, the **theme toggle** and a second palette button.
- **Games ping** — `rexChrome.pingGames()` makes one opaque (`mode: 'no-cors'`) request to `https://games.rexy.win/api/status`: it resolves when the server answers at all and rejects when it does not, so it is an honest "up" that never logs a CORS error. The status API sends no CORS header yet; once games-infra adds `Access-Control-Allow-Origin`, the same call can read per-game status.
- **Theme** — the choice is stored in `localStorage` under `rex-theme`. Hand-written pages run a one-line inline script in `<head>` that applies it before first paint; generated pages get it when `common.js` loads. `common.js` also keeps a media-less `<meta name="theme-color">` in sync (the two media-gated ones in each page cover the first paint) and dispatches `rex:theme` when it changes. `window.rexChrome` exposes `effectiveTheme`, `setTheme`, `toggleTheme`, `pingGames`.

### Command palette (`/js/palette.js`)

`⌘K` / `Ctrl K`, any `[data-palette-open]` button, or `window.rexPalette.open()`. A `<dialog>` listing pages, the games, every published app (privacy policy or store page), the macOS apps (Rex Boing to GitHub, the in-house tools to `/#mac`), actions (toggle theme, copy / write e-mail, scroll to top, view this page's source) and the outbound links. Substring scoring with a subsequence fallback on titles; arrows / Tab / Enter / Esc; keystrokes inside the dialog are stopped so the typing game's document-level handler never counts them. The site index is also published as `window.rexSiteIndex` (event `rex:site-index`), which `/404.html` uses for its suggestions. Add a page or app there when you add one to the site.

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

## Generated pages — do not hand-edit

`apps/index.html` and every `apps/<app_id>/privacy-policy/index.html` are generated by the external **App Manager** tool, which rewrites `apps/index.html` wholesale on each run (display names are parsed from each page's `<title>` after the ` — ` separator). Style them only via the `body > main.privacy-article` / `.privacy-meta` / `ul.apps-index` rules in `/css/index.css`. Those selectors are deliberately one element more specific than the generator's inline `<style>` so the site theme wins. (The generated `apps/index.html` omits `common.js`, so it renders without the chrome; the policy pages include it.)

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

`common.js`, `palette.js`, `motion.js` and the 404 page are dependency-free on purpose.
