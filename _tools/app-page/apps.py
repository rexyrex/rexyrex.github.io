#!/usr/bin/env python3
"""The home page's /apps/ stop (the standing stones: one chip and one stone per
app) and the /apps/ directory page, from one list. Python 3, no packages.

    python3 _tools/app-page/apps.py

Rewrites apps/index.html and, in index.html, everything from the
`<!-- 04 · /apps/` comment to the `<!-- 05 · games.rexy.win` comment.
To add an app: an entry in APPS (wide and shots only matter to the /apps/
directory now), its captures already in apps/<id>/img/, then run this.
"""
import html
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

P, A = 'Google Play', 'App Store'

APPS = [
    dict(id='kakaoparser', name='카톡 정밀 분석기', lang='ko', stores=[P, A], wide=True,
         line='Rankings, hourly charts and signature words from an exported KakaoTalk chat.',
         keys='kakaoparser kakaotalk 카카오톡 카톡 정밀 분석기 대화 chat analyzer rankings',
         tint=('#fb9a4b', '#c2410c'),
         shots=[('android-03-rankings.webp', 540, 1200), ('android-02-time.webp', 540, 1200)],
         policy='/apps/kakaoparser/privacy-policy/'),
    dict(id='age_calculator', name='How Old Are You? Age Test', lang='en', stores=[P, A],
         line='Five quick tests of your senses, each with a playful age guess.',
         keys='age test calculator how old senses hearing reaction memory vision',
         tint=('#ff8a7a', '#c93838'),
         shots=[('result.webp', 660, 1434)], policy='/apps/age_calculator/privacy-policy/'),
    dict(id='deadly_balloons', name='Deadly Balloons: Bullet Hell', lang='en', stores=[P, A], game=True,
         line='A one-thumb bullet-hell shooter: dodge balloon fire, topple huge bosses.',
         keys='deadly balloons bullet hell shooter game boss',
         tint=('#ff5d6c', '#b0152e'),
         shots=[('boss-battle.webp', 660, 1434)], policy='/apps/deadly_balloons/privacy-policy/'),
    dict(id='alba_pay', name='알바수첩', lang='ko', stores=[P, A],
         line='Clock in, clock out — holiday pay, night and overtime rates down to take-home pay.',
         keys='alba pay 알바수첩 알바 급여 계산기 주휴수당 시급 월급 실수령액 payroll',
         tint=('#d8f35b', '#5c7400'),
         shots=[('home.webp', 660, 1434)], policy='/apps/alba_pay/privacy-policy/'),
    dict(id='visual_metronome', name='Visual Metronome', lang='en', stores=[P, A],
         line='A metronome you can watch: 19 visualizers that move with the click.',
         keys='visual metronome bpm tempo rhythm tap music beat practice',
         tint=('#e4b96a', '#7a5512'),
         shots=[('main.webp', 660, 1434)], policy='/apps/visual_metronome/privacy-policy/'),
    dict(id='line_chat_analyzer', name='TalkScope', lang='en', stores=[P], wide=True,
         line='Reply speed, habit words and chemistry from an exported LINE chat — in English, 日本語 and 한국어.',
         keys='talkscope line chat analyzer トークスコープ トーク分析 대화 분석 reply speed words',
         tint=('#a99dff', '#5b4bdb'),
         shots=[('overview-en.webp', 660, 1277), ('words-en.webp', 660, 1277)],
         policy='/apps/line_chat_analyzer/privacy-policy/'),
    dict(id='kakao_love_analyzer', name='카카오톡 연애 분석기', lang='ko', stores=[P, A], wide=True,
         line='Balance, interest and chemistry, read from a KakaoTalk conversation.',
         keys='kakao love analyzer 카카오톡 연애 분석기 썸 호감도 궁합 chemistry chat',
         tint=('#f48fb1', '#c2185b'),
         shots=[('hub.webp', 660, 1434), ('chemistry.webp', 660, 1434)],
         policy='/apps/kakao_love_analyzer/privacy-policy/'),
    dict(id='reverse_image_search', name='Reverse Image Search', lang='en', stores=[P, A], wide=True,
         line='One photo, four engines: Google Lens, TinEye, Yandex and Bing side by side.',
         keys='reverse image search google lens tineye yandex bing photo',
         tint=('#818cf8', '#4f46e5'),
         shots=[('result-google-lens.webp', 660, 1434), ('result-tineye.webp', 660, 1434)],
         policy='/apps/reverse_image_search/privacy-policy/'),
    dict(id='qr_scanner', name='QR Scanner: Scan & Create', lang='en', stores=[P],
         line='Scan from the camera or a photo, keep a searchable history, make your own codes.',
         keys='qr code scanner generator create wifi contact',
         tint=('#aba3ff', '#4e3ee6'),
         shots=[('show-qr.webp', 660, 1434)], policy='/apps/qr_scanner/privacy-policy/'),
    dict(id='exif', name='Photo Exif Metadata Editor', lang='en', stores=[P],
         line='View, edit and wipe the EXIF and GPS data in your photos.',
         keys='exif metadata photo editor remover gps strip',
         tint=('#b6c3f7', '#4a5268'),
         shots=[('editor.webp', 660, 1434)], policy='/apps/exif/privacy-policy/'),
    dict(id='saju', name='사주 분석기', lang='ko', stores=[P],
         line='Four pillars, daily fortune, compatibility and tarot, explained in plain words.',
         keys='saju 사주 분석기 운세 궁합 대운 타로 fortune',
         tint=('#8cc3d3', '#1c5a6e'),
         shots=[('pillars.webp', 660, 1434)],
         policy='https://psychedelic-cattle-134.notion.site/33f369f50e3d809ababcf454cf24381f'),
    dict(id='katalk_keeper', name='슬쩍', lang='ko', stores=[P],
         line='Read KakaoTalk messages without marking them read, and keep the ones that get deleted.',
         keys='katalk keeper 슬쩍 카톡 몰래보기 읽음 삭제된 메시지 notification chat messages',
         tint=('#fde524', '#8f6f00'),
         shots=[('chat-dark.webp', 600, 1067)], policy='/apps/katalk_keeper/privacy/'),
]

# Policies on this site for apps that aren't on the stores yet.
TESTING = [
    ('dm_analyzer', 'DMA - DM Analyzer'),
    ('get_out_alive', 'Get Out Alive'),
    ('land_the_beat', 'Land the Beat'),
    ('make_your_choice', 'Make Your Choice'),
    ('redline_garage', 'Redline Garage: Engine Sounds'),
    ('rex_remote', 'Rex Remote: Server Monitor'),
    ('second_thought', 'Second Thought: Pause Apps'),
]

e = html.escape


def stores_text(app):
    return ' · '.join(app['stores'])


def style(app):
    d, l = app['tint']
    return f'--t-dark: {d}; --t-light: {l}'


def img(app, shot, cls='', lazy=True):
    f, w, h = shot
    attrs = ' loading="lazy" decoding="async"' if lazy else ''
    c = f' class="{cls}"' if cls else ''
    return f'<img{c} src="/apps/{app["id"]}/img/{f}" width="{w}" height="{h}" alt=""{attrs}>'


# ---------- home page: the standing stones ----------
# One chip per app. /js/island.js reads data-app and --t-dark from these to lay
# one standing stone per app, its icon set into the rock, so adding an app here adds a stone.
I = ' ' * 4
tiles = []
for app in APPS:
    lang = f' lang="{app["lang"]}"' if app['lang'] != 'en' else ''
    tiles.append(
        f'{I*5}<li><a class="app-chip" href="/apps/{app["id"]}/" data-app="{app["id"]}" style="{style(app)}">'
        f'<img src="/apps/{app["id"]}/img/icon.webp" width="256" height="256" alt="" loading="lazy" decoding="async">'
        f'<span><b{lang}>{e(app["name"])}</b><i>{e(stores_text(app))}</i></span></a></li>\n'
    )

chapter = (
    f'{I*2}<!-- 04 · /apps/ — the standing stones: one per published app, its icon in the rock; every chip opens the app\'s page -->\n'
    f'{I*2}<section class="stop stop-right stop-wide" id="apps" data-stop="3" data-place="Standing stones" aria-labelledby="apps-title">\n'
    f'{I*3}<img class="stop-poster" src="/assets/island/apps.webp" alt="" width="1600" height="900" decoding="async" loading="lazy">\n'
    f'{I*3}<div class="panel">\n'
    f'{I*4}<p class="place"><b>03</b>Standing stones</p>\n'
    f'{I*4}<span class="eyebrow">/apps/</span>\n'
    f'{I*4}<h2 id="apps-title">Published on Google Play and the App Store.</h2>\n'
    f'{I*4}<p>Mostly Flutter, some native Android, all built and published solo. One standing stone for every app, and a rex that keeps knocking them over: point at a name and it goes for that one. Every name opens that app\'s own page &mdash; with a demo you can try right there.</p>\n'
    f'{I*4}<ul class="app-list" id="appsBento">\n'
    + ''.join(tiles) +
    f'{I*4}</ul>\n'
    f'{I*4}<div class="panel-actions">\n'
    f'{I*5}<a class="btn btn-ghost apps-all" href="/apps/">All apps and privacy policies <span class="arrow">→</span></a>\n'
    f'{I*4}</div>\n'
    f'{I*3}</div>\n'
    f'{I*2}</section>\n'
)
home = (REPO / 'index.html').read_text()
start = home.index('        <!-- 04 · /apps/')
end = home.index('        <!-- 05 · games.rexy.win')
(REPO / 'index.html').write_text(home[:start] + chapter + '\n' + home[end:])

# ---------- /apps/ directory ----------
cards = []
for app in APPS:
    lang = f' lang="{app["lang"]}"' if app['lang'] != 'en' else ''
    play = 'play' if P in app['stores'] else ''
    ios = 'ios' if A in app['stores'] else ''
    region = 'ko' if app['lang'] == 'ko' else 'global'
    tags = ' '.join(t for t in [play, ios, region, 'game' if app.get('game') else ''] if t)
    external = app['policy'].startswith('http')
    ext_attr = ' target="_blank" rel="noopener noreferrer"' if external else ''
    chips = ''.join(f'<i>{e(s)}</i>' for s in app['stores'])
    cards.append(
        f'{I*4}<li class="dir-card" data-tags="{tags}" data-keys="{e(app["keys"].lower() + " " + app["name"].lower() + " " + app["id"])}" style="{style(app)}">\n'
        f'{I*5}<div class="dir-shot" aria-hidden="true"><span class="dir-phone">{img(app, app["shots"][0])}</span></div>\n'
        f'{I*5}<div class="dir-body">\n'
        f'{I*6}<div class="dir-top"><img class="dir-icon" src="/apps/{app["id"]}/img/icon.webp" width="256" height="256" alt="" loading="lazy" decoding="async"><span class="dir-stores">{chips}</span></div>\n'
        f'{I*6}<h3 class="dir-name"><a class="dir-link" href="/apps/{app["id"]}/"><span{lang}>{e(app["name"])}</span></a></h3>\n'
        f'{I*6}<p class="dir-line">{e(app["line"])}</p>\n'
        f'{I*6}<p class="dir-foot"><span class="dir-open" aria-hidden="true">Open page <i>→</i></span><a class="dir-policy" href="{e(app["policy"])}"{ext_attr}>Privacy{" ↗" if external else ""}</a></p>\n'
        f'{I*5}</div>\n'
        f'{I*4}</li>\n'
    )

pub_rows = ''
for a in sorted(APPS, key=lambda a: a['id']):
    ext = a['policy'].startswith('http')
    target = ' target="_blank" rel="noopener noreferrer"' if ext else ''
    lang = f' lang="{a["lang"]}"' if a['lang'] != 'en' else ''
    path = 'notion.site ↗' if ext else e(a['policy'])
    pub_rows += (f'{I*7}<li><a href="{e(a["policy"])}"{target}><span{lang}>{e(a["name"])}</span>'
                 f'<span class="path">{path}</span></a></li>\n')
test_rows = ''.join(
    f'{I*7}<li><a href="/apps/{slug}/privacy-policy/"><span>{e(name)}</span><span class="path">/apps/{slug}/privacy-policy/</span></a></li>\n'
    for slug, name in TESTING
)

icons = ''.join(
    f'{I*5}<span style="{style(a)}; --i: {n}"><img src="/apps/{a["id"]}/img/icon.webp" width="256" height="256" alt="" decoding="async"></span>\n'
    for n, a in enumerate(APPS)
)

page = f'''<!doctype html>
<!-- The site's app directory. App Manager regenerates /apps/ as a bare
     policy list unless this page carries the appmanager-apps-index meta
     below; with it, a privacy publish only writes the policy page. Keep the
     cards and the policy lists in step with the home page's /apps/ chapter
     (README → App landing pages). -->
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="appmanager-apps-index" content="manual">
    <title>Apps — Rexyrex</title>
    <meta name="description" content="Every app Rexyrex has published on Google Play and the App Store, each with its own page, demo and privacy policy.">
    <meta name="color-scheme" content="dark light">
    <link rel="icon" href="/favicon.ico">
    <link rel="canonical" href="https://rexyrex.github.io/apps/">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
    <meta name="theme-color" content="#0f1214" media="(prefers-color-scheme: dark)">
    <meta name="theme-color" content="#f5f7f4" media="(prefers-color-scheme: light)">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="rexyrex.github.io">
    <meta property="og:url" content="https://rexyrex.github.io/apps/">
    <meta property="og:title" content="Apps — Rexyrex">
    <meta property="og:description" content="Every app on Google Play and the App Store, each with its own page, demo and privacy policy.">
    <meta property="og:image" content="https://rexyrex.github.io/assets/og/apps.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Apps — Rexyrex">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Apps — Rexyrex">
    <meta name="twitter:description" content="Every app on Google Play and the App Store, each with its own page, demo and privacy policy.">
    <meta name="twitter:image" content="https://rexyrex.github.io/assets/og/apps.png">
    <script>(function(){{try{{var t=localStorage.getItem('rex-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}}catch(e){{}}}})();</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/index.css">
    <link rel="stylesheet" href="/css/navbar.css">
    <link rel="stylesheet" href="/css/motion.css">
    <link rel="stylesheet" href="/css/apps-index.css">
</head>
<body class="apps-dir">
    <div id="nav-placeholder"></div>

    <main id="main">
        <header class="dir-hero">
            <div class="wrap">
                <div class="dir-hero-art" aria-hidden="true">
{icons}                </div>
                <p class="eyebrow">/apps/</p>
                <h1>Apps, one page each.</h1>
                <p class="dir-lede">Everything published on Google Play and the App Store — mostly Flutter, some native Android, all built solo. Open one to see what it does and try its demo.</p>
                <div class="dir-tools">
                    <label class="dir-search">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
                        <input type="search" id="dirSearch" placeholder="Search by name or what it does" aria-label="Search apps" autocomplete="off" spellcheck="false">
                    </label>
                    <div class="dir-filters" role="group" aria-label="Show">
                        <button type="button" class="dir-chip" data-filter="all" aria-pressed="true">All</button>
                        <button type="button" class="dir-chip" data-filter="ios" aria-pressed="false">App Store</button>
                        <button type="button" class="dir-chip" data-filter="play" aria-pressed="false">Google Play</button>
                        <button type="button" class="dir-chip" data-filter="ko" aria-pressed="false" lang="ko">한국어</button>
                        <button type="button" class="dir-chip" data-filter="global" aria-pressed="false">Global</button>
                    </div>
                </div>
            </div>
        </header>

        <section class="dir-section" aria-labelledby="dir-phone-title">
            <div class="wrap">
                <h2 class="dir-h2" id="dir-phone-title"><span>Phone apps</span><output class="dir-count" id="dirCount" aria-live="polite"></output></h2>
                <ul class="dir-grid" id="dirGrid" data-reveal-group>
{"".join(cards)}                </ul>
                <p class="dir-empty" id="dirEmpty" hidden>Nothing matches that. <button type="button" class="dir-reset" id="dirReset">Show every app</button></p>
            </div>
        </section>

        <section class="dir-section" aria-labelledby="dir-desk-title">
            <div class="wrap">
                <h2 class="dir-h2" id="dir-desk-title"><span>On the desktop</span></h2>
                <a class="dir-desk" href="/apps/app_manager/" style="--t-dark: #8fd069; --t-light: #3a8a1c" data-reveal>
                    <img class="dir-icon" src="/apps/app_manager/img/icon.png" width="512" height="512" alt="" loading="lazy" decoding="async">
                    <span class="dir-desk-copy">
                        <b>App Manager</b>
                        <span>One window for a whole portfolio of Flutter apps: store listings, screenshots, questionnaires, signing, deploys and reviews — with an AI agent that can drive all of it.</span>
                    </span>
                    <span class="dir-desk-meta"><i>macOS</i><i>Windows</i><span class="dir-open">Download <i>→</i></span></span>
                </a>
                <a class="dir-desk" href="/apps/rexdesk/" style="--t-dark: #6f7dff; --t-light: #4a37c9" data-reveal>
                    <img class="dir-icon" src="/apps/rexdesk/img/icon.png" width="512" height="512" alt="" loading="lazy" decoding="async">
                    <span class="dir-desk-copy">
                        <b>RexDesk</b>
                        <span>Control a Mac from another Mac, or from any browser, as if you were sitting at it: hardware video on both ends, sharp text, a pointer with no lag, end-to-end encrypted — on your network or over the internet.</span>
                    </span>
                    <span class="dir-desk-meta"><i>macOS</i><i>Web</i><span class="dir-open">Download <i>→</i></span></span>
                </a>
            </div>
        </section>

        <section class="dir-section dir-policies" id="privacy" aria-labelledby="dir-privacy-title">
            <div class="wrap">
                <h2 class="dir-h2" id="dir-privacy-title"><span>Privacy policies</span></h2>
                <p class="dir-note">The same pages the store listings link to. Questions about any of them: <a href="/support/">/support/</a>.</p>
                <div class="dir-policy-cols">
                    <div>
                        <h3>On the stores</h3>
                        <ul class="dir-policy-list">
{pub_rows}                        </ul>
                    </div>
                    <div>
                        <h3>In testing</h3>
                        <ul class="dir-policy-list">
{test_rows}                        </ul>
                    </div>
                </div>
            </div>
        </section>
    </main>

    <script src="/js/common.js"></script>
    <script src="/js/motion.js"></script>
    <script src="/js/apps-index.js" defer></script>
</body>
</html>
'''
(REPO / 'apps' / 'index.html').write_text(page)
print('ok', len(APPS), 'apps')
