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
| `/apps/<app_id>/` | **App landing pages**, hand-built, one per public app — see [App landing pages](#app-landing-pages) |
| `/apps/` | **App directory**: every public app as a card (search, store and language filters), the desktop app, and every privacy policy — see [App directory](#app-directory-apps). The `/apps/<app_id>/privacy-policy/` pages under it are **generated** — see below |
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
- **/apps/** — a bento grid (not pinned): one card per public app in its own tint (`--t-dark` / `--t-light` on the card), built around a real screen capture from the app's page; wide cards fan two screens. Cards rise in with the generic reveal, lift on hover (the `translate` property, so it composes with the reveal's inline transform) and carry a soft light in their tint that follows a fine pointer (`--mx` / `--my`, plain JS outside GSAP). Under 680px the grid becomes a swipe carousel. An "All apps" button leads to `/apps/`. The cards are generated with the directory page — see [App directory](#app-directory-apps).
- **games.rexy.win** — a plain reveal section (not pinned): one "browser window" per game, each drawn in CSS in the game's two accent colours from the portal's registry (tile maze + fire eggs, crosshair over a perspective floor, circuit traces, flashlight beam + blinking eyes, a self-drawing scribble, a chessboard). The "dino network" pill turns green when `rexChrome.pingGames()` resolves. The cards are static HTML — when the portal adds a game, add a card here, a row in the index and an entry in `js/palette.js`. Keep the copy count-free: the public pages describe the portal with adjectives ("multiplayer browser games"), never a tally, and never say where it is hosted.
- **/Applications/** — a plain reveal section: one little macOS desktop per native app — a menu bar with the app's own status item, and a window or a popover hanging from it, all drawn in CSS. Bars fill, the pixel rex in Rex Boing's menu bar gallops and the usage ring lights once a card is on screen (`.is-live`, the same observer as the phones). Rex Boing links to its GitHub repo and releases, App Manager to its download page (`/apps/app_manager/`); Project Manager and AI Usage Tracker are in-house tools and their cards are static.
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
- **Top bar** — typing · balloons · games ↗ · music · apps (→ `/#apps`, lit on every `/apps/…` page via `data-match`) · log · support · github ↗, then the palette button (`⌘K`, `Ctrl K` on other platforms; icon only on touch). The animation lab is reachable from the index, the footer and the palette rather than the top bar. The hidden Parser admin dropdown is still in the fragment.
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

Files per app: `apps/<id>/index.html`, `page.css`, `page.js` (dependency-free), `img/` (WebP screen captures, icon), and the social card `/assets/og/apps/<id>.jpg` (the store feature graphic, 1024×500). Shared pieces live in `/css/app-page.css` — store buttons, the `.app-device` phone frame for real screen captures, the `.app-foot` footer — and a new page starts from `_tools/app-page/skeleton.html`. Each page sets the site tokens (`--bg`, `--fg`, `--accent`, …) for both themes so the top bar and status bar sit on its palette.

These pages sit beside the generated policies but App Manager never touches them: it only writes `apps/<id>/privacy-policy/index.html` (and `apps/index.html` only when that page lacks the marker described under [App directory](#app-directory-apps)).

App Manager does check for them: each app's Overview shows a **Landing page** tile (At a glance) and card — not created / not committed / not pushed / published — read from `apps/<slug>/index.html` here and the pushed branch. The slug is the App Manager id, else the folder of the app's privacy policy URL, else the folder its App Store marketing URL points at (that is how the iOS twin of KakaoParser finds `/apps/kakaoparser/`). A missing page has a **Build Page** button that runs App Manager's `rex-app-landing-page` skill in the app's agent session; the skill reads this README, the skeleton and the existing pages first, so the rules here stay the source of truth. Its `scripts/images.mjs` converts captures to WebP through headless Chrome when `cwebp` isn't installed. Every App Store listing's *Marketing URL* points at its app's page (keep it that way when an app gains a page or an iOS version).

To add an app when it goes public: build the page from the skeleton, add it to `APPS` in `_tools/app-page/apps.py` and run it (the home page card and the `/apps/` card and policy row), then an entry in `js/palette.js` (`INDEX.apps`), a row in `sitemap.xml`, its policy on `/support/`, and a row in the table above. Check it with the screenshot tool:

```
node _tools/shot/shot.mjs http://localhost:8123/apps/<id>/ --out /tmp/<id> --theme dark --at 0,0.5,1
node _tools/shot/shot.mjs http://localhost:8123/apps/<id>/ --out /tmp/<id>-m --mobile --theme light
node _tools/shot/shot.mjs http://localhost:8123/apps/<id>/ --out /tmp/<id>-r --reduced --full
```

It drives headless Chrome over the DevTools protocol (Node 22, no npm) and prints console errors, exceptions and failed requests; exit code 1 if there are any.

## App directory (`/apps/`)

`apps/index.html` is hand-made, generated together with the home page's app cards by `_tools/app-page/apps.py` (one `APPS` list: name, English one-liner, stores, language, tint pair, which captures, privacy URL; plus the policies of apps still in testing). It has a hero with every app's icon, a search box and filter chips (App Store / Google Play / 한국어 / Global; `?q=` and `?show=` make a filtered view shareable — `/js/apps-index.js`), a card per app built around a real capture, App Manager, and every privacy policy on the site ("On the stores" / "In testing"), so `/apps/` still works as the policy index the frozen URL contract promises. Styles: `/css/apps-index.css`.

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

- GSAP 3.15.0 + ScrollTrigger + SplitText (landing page; both plugins are free since 3.13)
- Three.js 0.185.1 as an ES module via import map (landing page hero)
- Google Fonts: IBM Plex Mono, IBM Plex Sans KR
- Font Awesome 6.7.2 (landing page easter egg, typing game, animation lab)
- Bootstrap 4.6.2 + Popper 1.16.1 + jQuery 3.7.1 (typing game only)
- Bootstrap 5.3.8 (animation lab grid, parser admin tools)
- Vue 3.5 (animation lab)
- Firebase compat 8.2.8 (typing game, parser tools)

`common.js`, `palette.js`, `motion.js`, the app landing pages' scripts and the 404 page are dependency-free on purpose.
