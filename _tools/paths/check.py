#!/usr/bin/env python3
"""Guard for "no published path may disappear". Python 3, no packages.

    python3 _tools/paths/check.py            # verify
    python3 _tools/paths/check.py --update   # add new files to the manifest

manifest.txt lists every file this site published on 2026-11-20, before the
home page became the island. Each one must still exist. Files may be added
(--update appends them); removing a line from the manifest is a decision for
a human, not for this script.

It also checks the home page's anchors that other pages deep-link to, and
that every same-site href/src in every HTML file resolves to a real file.
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MANIFEST = Path(__file__).with_name('manifest.txt')
# ids on / that are linked from elsewhere (/#apps from the top bar and 16 app
# pages, /#mac from the palette) or from the page's own index
ANCHORS = ['typing', 'balloons', 'apps', 'games', 'mac', 'tesla', 'music', 'index', 'contact']
SKIP = ('_tools/', 'README.md', '.gitignore')
# deliberate: the devlog links to a missing page to show off /404.html
INTENTIONAL_404 = {'/this-page-does-not-exist'}

listed = [l for l in MANIFEST.read_text().splitlines() if l.strip()]
problems = []

missing = [p for p in listed if not (REPO / p).is_file()]
problems += [f'missing published file: {p}' for p in missing]

home = (REPO / 'index.html').read_text()
for a in ANCHORS:
    if not re.search(r'\bid="%s"' % re.escape(a), home):
        problems.append(f'index.html lost the #{a} anchor')

tracked = []
for p in REPO.rglob('*'):
    rel = p.relative_to(REPO).as_posix()
    if not p.is_file() or rel.startswith('.git/') or '/node_modules/' in '/' + rel:
        continue
    tracked.append(rel)

# same-site links
link = re.compile(r'''(?:href|src)=["'](/[^"'#?]*)''')
for rel in tracked:
    if not rel.endswith('.html') or rel.startswith('_tools/'):
        continue
    text = (REPO / rel).read_text(errors='replace')
    for target in set(link.findall(text)):
        # '//host', the 404 demo, and prefixes a script completes ('/img/overview-' + lang)
        if target.startswith('//') or target in INTENTIONAL_404 or target[-1] in '-_':
            continue
        t = REPO / target.lstrip('/')
        if target.endswith('/'):
            t = t / 'index.html'
        elif t.is_dir():
            t = t / 'index.html'
        if not t.is_file():
            problems.append(f'{rel}: broken link {target}')

if '--update' in sys.argv:
    known = set(listed)
    new = sorted(r for r in tracked if r not in known and not r.startswith(SKIP)
                 and not r.startswith('.') and '/.' not in r)
    if new:
        MANIFEST.write_text('\n'.join(sorted(known | set(new))) + '\n')
        print(f'manifest: +{len(new)} new file(s)')

if problems:
    print('\n'.join(problems))
    print(f'\nFAILED: {len(problems)} problem(s)')
    sys.exit(1)
print(f'ok: {len(listed)} published files present, {len(ANCHORS)} anchors, links resolve')
