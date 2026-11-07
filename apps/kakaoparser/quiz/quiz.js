// 우리 방 퀴즈 — web player for quizzes shared from the Android app (SharedQuizCreateActivity).
//
// Reads sharedQuizzes/{id} and its scores/ subcollection through the Firestore REST API (no SDK,
// no key: the security rules are the only gate). Document shape: SharedQuizUploader.buildDocument
// and SharedQuizQuestion.toMap in the AndroidKakaoParser repo; rules: docs/shared-quiz/firestore.rules.
// Everything user-provided is rendered with textContent, never innerHTML.
(function () {
    'use strict';

    var BASE = 'https://firestore.googleapis.com/v1/projects/kakaoparser/databases/(default)/documents';
    // 카카오톡 공유: the Kakao Developers app's JavaScript key (Kakao app 1641240; rexyrex.github.io
    // is a registered JS SDK domain and link domain). Empty = navigator.share / copy only.
    var KAKAO_JS_KEY = '3c8b0baf532167c1ce493e26044b8a7a';
    var KAKAO_SDK = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js';
    var KAKAO_SDK_SRI = 'sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy';
    var CARD_IMAGE = 'https://rexyrex.github.io/assets/og/apps/kakaoparser.jpg';
    var PLAY_URL = 'https://play.google.com/store/apps/details?id=com.rexyrex.kakaoparser';
    var IOS_URL = 'https://apps.apple.com/app/id6758269062';

    var LETTERS = ['A', 'B', 'C', 'D', 'E'];
    var TIERS = [
        [1.0, '🏆 완벽! 이 방의 터줏대감'],
        [0.8, '🔥 거의 다 아는 찐친'],
        [0.6, '😎 꽤 아는 편'],
        [0.4, '🤔 반쯤 아는 사이'],
        [0.2, '😅 눈팅 좀 더 하세요'],
        [0.0, '👻 혹시 다른 방 사람?']
    ];
    // Same labels as the app's review screen (SharedQuizCreateActivity.typeLabel).
    var TYPES = {
        PERSON_FROM_CHAT: { emoji: '💬', label: '누가 한 말?' },
        NEXT_CHAT: { emoji: '⏭️', label: '다음 대화 맞히기' },
        CHAT_FROM_PERSON: { emoji: '🗣️', label: '이 사람이 한 말은?' },
        PERSON_FROM_WORD: { emoji: '🔤', label: '이 단어를 제일 많이 쓴 사람' },
        WORD_FROM_PERSON: { emoji: '❤️', label: '이 사람의 최애 단어' }
    };
    // AvatarChipUtils.CHIP_COLORS, indexed like NumberUtils.avatarIndex(author.hashCode()).
    var AVATAR_COLORS = ['#F87171', '#4ADE80', '#60A5FA', '#FB923C', '#C084FC', '#2DD4BF', '#F472B6', '#818CF8'];

    var $ = function (id) { return document.getElementById(id); };
    var quizId = new URLSearchParams(location.search).get('id') || '';
    var quiz = null;          // decoded document
    var expireAtRaw = null;   // exact timestampValue, copied into the score doc (rules compare it)
    var idx = 0, score = 0, results = [], answered = false, myName = '';
    var platform = detectPlatform();

    // ---------------------------------------------------------------- utilities

    function store(key, value) {
        try {
            if (value === undefined) return localStorage.getItem(key);
            localStorage.setItem(key, value);
        } catch (e) { return null; }
        return null;
    }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined && text !== null) e.textContent = text;
        return e;
    }

    function icon(name, cls) {
        var ns = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        if (cls) svg.setAttribute('class', cls);
        var use = document.createElementNS(ns, 'use');
        use.setAttribute('href', '#' + name);
        svg.appendChild(use);
        return svg;
    }

    // Java String.hashCode → the app's avatar colour, so a member keeps their app colour here.
    function avatarColor(name) {
        var h = 0;
        for (var i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
        if (h === -2147483648) h = 0;
        return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
    }

    function initial(name) {
        var chars = Array.from((name || '').trim());
        return chars.length ? chars[0].toUpperCase() : '?';
    }

    function avatar(name, cls) {
        var a = el('span', 'avatar' + (cls ? ' ' + cls : ''));
        if (!name) {
            a.classList.add('anon');
            a.textContent = '?';
        } else {
            a.style.background = avatarColor(name);
            a.textContent = initial(name);
        }
        a.setAttribute('aria-hidden', 'true');
        return a;
    }

    // "[민수] 밥 먹었어?" → {name, text}; "[12회] 민수" → {count, text}
    function parseBracket(s) {
        var m = /^\[([^\]]+)\]\s?([\s\S]*)$/.exec(s || '');
        if (!m) return null;
        var c = /^(\d+)회$/.exec(m[1]);
        return c ? { count: c[1], text: m[2] } : { name: m[1], text: m[2] };
    }

    function detectPlatform() {
        var ua = navigator.userAgent || '';
        if (/android/i.test(ua)) return 'android';
        if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
        return 'desktop';
    }

    function daysLeft() {
        var ms = new Date(quiz.expireAt).getTime() - Date.now();
        return Math.max(0, Math.ceil(ms / 86400000));
    }

    function title() { return quiz && quiz.title ? quiz.title : '우리 방'; }

    // ---------------------------------------------------------------- views

    var VIEWS = ['vLoading', 'vError', 'vIntro', 'vQuestion', 'vResult'];
    function show(view, barTitle) {
        VIEWS.forEach(function (v) { $(v).hidden = v !== view; });
        $('barTitle').textContent = barTitle || '우리 방 퀴즈';
        var withSide = view !== 'vLoading' && view !== 'vError' && !!quiz;
        $('side').hidden = !withSide;
        $('layout').classList.toggle('no-side', !withSide);
        $('sideProgress').hidden = view !== 'vQuestion';
        // The intro hero already shows the quiz info; the side keeps just the install card there.
        document.querySelector('.side .info-card').hidden = view === 'vIntro';
        window.scrollTo(0, 0);
    }

    function fail(titleText, text, canRetry) {
        $('errTitle').textContent = titleText;
        $('errText').textContent = text;
        $('retryLoadBtn').hidden = !canRetry;
        show('vError');
    }

    function renderInstallCards() {
        var tpl = $('tplInstall');
        document.querySelectorAll('[data-install]').forEach(function (host) {
            host.textContent = '';
            host.appendChild(tpl.content.cloneNode(true));
            if (platform === 'ios') {
                var ios = host.querySelector('.store-ios');
                ios.classList.add('recommended');
                ios.parentNode.insertBefore(ios, ios.parentNode.firstChild);
            } else if (platform === 'android') {
                host.querySelector('.store-android').classList.add('recommended');
            }
        });
        var get = $('getAppBtn');
        var holder = get.querySelector('.get-app-icon');
        holder.textContent = '';
        holder.appendChild(icon(platform === 'ios' ? 'i-apple' : 'i-gplay'));
        get.href = platform === 'ios' ? IOS_URL : PLAY_URL;
    }

    // ---------------------------------------------------------------- Firestore REST decoding

    function decode(v) {
        if (!v) return null;
        if ('stringValue' in v) return v.stringValue;
        if ('integerValue' in v) return parseInt(v.integerValue, 10);
        if ('doubleValue' in v) return v.doubleValue;
        if ('booleanValue' in v) return v.booleanValue;
        if ('timestampValue' in v) return v.timestampValue;
        if ('nullValue' in v) return null;
        if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
        if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
        return null;
    }
    function decodeFields(fields) {
        var o = {};
        Object.keys(fields).forEach(function (k) { o[k] = decode(fields[k]); });
        return o;
    }

    // ---------------------------------------------------------------- load

    function load() {
        show('vLoading');
        if (!/^[A-Za-z0-9]{10,40}$/.test(quizId)) {
            fail('링크가 올바르지 않아요', '받은 퀴즈 링크를 다시 확인해주세요. 링크 끝까지 복사됐는지 확인해보세요.', false);
            return;
        }
        fetch(BASE + '/sharedQuizzes/' + quizId)
            .then(function (r) {
                if (r.status === 403 || r.status === 404) throw new Error('gone');
                if (!r.ok) throw new Error('http ' + r.status);
                return r.json();
            })
            .then(function (doc) {
                quiz = decodeFields(doc.fields || {});
                expireAtRaw = doc.fields.expireAt;
                if (!quiz.questions || !quiz.questions.length) throw new Error('empty');
                renderSide();
                renderIntro();
            })
            .catch(function (e) {
                if (e.message === 'gone') {
                    fail('사라진 퀴즈예요', '퀴즈는 만든 지 7일이 지나면 자동으로 사라져요. 친구에게 새 퀴즈를 부탁해보세요!', false);
                } else {
                    fail('퀴즈를 불러오지 못했어요', '인터넷 연결을 확인하고 다시 시도해주세요.', true);
                }
            });
    }
    $('retryLoadBtn').addEventListener('click', load);

    function metaItem(iconName, label, value) {
        var li = el('li');
        li.appendChild(icon(iconName));
        li.appendChild(el('span', null, label));
        li.appendChild(el('b', null, value));
        return li;
    }

    function renderSide() {
        $('sideTitle').textContent = '「' + title() + '」 퀴즈';
        var meta = $('sideMeta');
        meta.textContent = '';
        meta.appendChild(metaItem('i-list', '문제', quiz.questions.length + '개'));
        meta.appendChild(metaItem('i-user', '만든 사람', quiz.creator || '익명'));
        meta.appendChild(metaItem('i-clock', '남은 기간', daysLeft() + '일'));
        var dots = $('sideDots');
        var mobileDots = $('qDots');
        [dots, mobileDots].forEach(function (d) {
            d.textContent = '';
            quiz.questions.forEach(function () { d.appendChild(el('i')); });
        });
    }

    function updateDots() {
        [$('sideDots'), $('qDots')].forEach(function (d) {
            Array.prototype.forEach.call(d.children, function (dot, i) {
                dot.className = i < results.length ? (results[i] ? 'ok' : 'bad') : (i === idx ? 'cur' : '');
            });
        });
        $('sideProgressText').textContent = Math.min(idx + 1, quiz.questions.length) + ' / ' + quiz.questions.length;
    }

    // ---------------------------------------------------------------- intro

    function renderIntro() {
        document.title = title() + ' 퀴즈 — 카톡 정밀 분석기';
        $('introTitle').textContent = '「' + title() + '」 퀴즈';

        var chips = $('introChips');
        chips.textContent = '';
        [['i-list', quiz.questions.length + '문제'], ['i-user', '만든 사람 ' + (quiz.creator || '익명')],
         ['i-clock', daysLeft() + '일 남음']].forEach(function (c) {
            var li = el('li', 'chip');
            li.appendChild(icon(c[0]));
            li.appendChild(el('span', null, c[1]));
            chips.appendChild(li);
        });

        var counts = {};
        quiz.questions.forEach(function (q) { counts[q.type] = (counts[q.type] || 0) + 1; });
        var types = $('introTypes');
        types.textContent = '';
        Object.keys(TYPES).forEach(function (t) {
            if (!counts[t]) return;
            var li = el('li');
            li.appendChild(el('span', 't-emoji', TYPES[t].emoji));
            li.appendChild(el('span', null, TYPES[t].label));
            li.appendChild(el('span', 't-count', counts[t] + '문제'));
            types.appendChild(li);
        });

        $('nameInput').value = store('sq_name') || '';
        var done = store('sq_done_' + quizId);
        var saved = savedResult();
        $('viewResultBtn').hidden = !(done && saved);
        $('introNotice').textContent = done
            ? '이미 이 퀴즈를 풀었어요. 다시 풀 수 있지만 순위표에는 처음 점수만 남아요.'
            : '순위표에는 처음 푼 점수만 올라가요.';
        show('vIntro', '우리 방 퀴즈');
    }

    function savedResult() {
        try {
            var r = JSON.parse(store('sq_result_' + quizId) || 'null');
            return r && Array.isArray(r.results) && r.results.length === quiz.questions.length ? r : null;
        } catch (e) { return null; }
    }

    $('startBtn').addEventListener('click', start);
    $('nameInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') start(); });
    $('viewResultBtn').addEventListener('click', function () {
        var r = savedResult();
        if (!r) return;
        score = r.score; results = r.results; myName = r.name || '';
        finish(false);
    });

    function start() {
        var typed = $('nameInput').value.trim().slice(0, 12);
        myName = typed || '익명';
        if (typed) store('sq_name', typed);
        idx = 0; score = 0; results = [];
        renderQuestion();
    }

    // ---------------------------------------------------------------- question

    function renderBody(q) {
        var body = $('qBody');
        body.textContent = '';
        if (q.lines && q.lines.length) {
            var chat = el('div', 'chat');
            var prev = null;
            q.lines.forEach(function (l, li) {
                var who = l.a || null;
                // Unnamed lines all belong to the one hidden author: stack them like a message run.
                var cont = li > 0 && who === prev && (who !== null || q.type === 'PERSON_FROM_CHAT');
                var m = el('div', 'msg' + (cont ? ' cont' : ''));
                m.appendChild(avatar(who));
                var col = el('div');
                if (!cont) col.appendChild(el('div', 'msg-name', who || '???'));
                col.appendChild(el('div', 'bubble', l.t));
                m.appendChild(col);
                chat.appendChild(m);
                prev = who;
            });
            if (q.type === 'NEXT_CHAT') {
                var n = el('div', 'msg');
                n.appendChild(avatar(null));
                var col2 = el('div');
                col2.appendChild(el('div', 'msg-name', '다음 메시지'));
                var b = el('div', 'bubble next');
                var t = el('span', 'typing');
                t.appendChild(el('i')); t.appendChild(el('i')); t.appendChild(el('i'));
                b.appendChild(t);
                b.appendChild(document.createTextNode('누가 뭐라고 했을까요?'));
                col2.appendChild(b);
                n.appendChild(col2);
                chat.appendChild(n);
            }
            body.appendChild(chat);
        } else if (q.subject) {
            var box = el('div', 'subject');
            if (q.type === 'PERSON_FROM_WORD') {
                box.appendChild(el('div', 'subject-word', q.subject));
            } else {
                box.appendChild(avatar(q.subject));
                box.appendChild(el('div', 'subject-name', q.subject));
            }
            body.appendChild(box);
        }
    }

    // One choice's content: a member chip for names, "[N회]" as a pill after answering.
    function fillChoiceText(span, q, text) {
        span.textContent = '';
        var p = parseBracket(text);
        var isPersonChoice = q.type === 'PERSON_FROM_CHAT' || q.type === 'PERSON_FROM_WORD';
        if (p && p.name) {
            span.appendChild(avatar(p.name, 'sm'));
            span.appendChild(el('span', 'c-name', p.name));
            span.appendChild(el('span', 'c-line', p.text));
        } else if (p && p.count) {
            if (isPersonChoice) span.appendChild(avatar(p.text, 'sm'));
            span.appendChild(el('span', 'c-line', p.text));
            span.appendChild(el('span', 'c-count', p.count + '회'));
        } else {
            if (isPersonChoice) span.appendChild(avatar(text, 'sm'));
            span.appendChild(el('span', 'c-line', text));
        }
    }

    function renderQuestion() {
        var q = quiz.questions[idx];
        var n = quiz.questions.length;
        answered = false;
        $('qProgress').textContent = (idx + 1) + ' / ' + n;
        $('qScore').textContent = score;
        $('qType').textContent = (TYPES[q.type] ? TYPES[q.type].emoji + ' ' + TYPES[q.type].label : '') + ' · Q' + (idx + 1);
        $('qPrompt').textContent = q.prompt;
        renderBody(q);

        var box = $('qChoices');
        box.textContent = '';
        (q.choices || []).forEach(function (c, i) {
            var b = el('button', 'choice');
            b.type = 'button';
            b.setAttribute('aria-label', (LETTERS[i] || '') + '. ' + c.l);
            b.appendChild(el('span', 'c-letter', LETTERS[i] || ''));
            var text = el('span', 'c-text');
            fillChoiceText(text, q, c.l);
            b.appendChild(text);
            b.appendChild(el('span', 'c-mark'));
            b.addEventListener('click', function () { answer(i); });
            box.appendChild(b);
        });
        $('nextBar').hidden = true;
        updateDots();
        show('vQuestion', 'Q' + (idx + 1) + ' / ' + n);
    }

    var toastTimer = null;
    function toast(ok, sub) {
        var t = $('toast');
        clearTimeout(toastTimer);
        t.className = 'toast' + (ok ? '' : ' bad');
        $('toastIcon').textContent = '';
        $('toastIcon').appendChild(icon(ok ? 'i-check' : 'i-x'));
        $('toastTitle').textContent = ok ? '정답!' : '땡!';
        $('toastSub').textContent = sub;
        t.hidden = false;
        toastTimer = setTimeout(function () {
            t.classList.add('out');
            toastTimer = setTimeout(function () { t.hidden = true; }, 200);
        }, 1300);
    }

    function answer(choice) {
        if (answered) return;
        answered = true;
        var q = quiz.questions[idx];
        var correctSet = q.correct || [];
        var correct = correctSet.indexOf(choice) >= 0;
        if (correct) score++;
        results.push(correct);
        var buttons = $('qChoices').children;
        for (var i = 0; i < buttons.length; i++) {
            var b = buttons[i];
            b.disabled = true;
            fillChoiceText(b.querySelector('.c-text'), q, q.choices[i].r || q.choices[i].l);
            var mark = b.querySelector('.c-mark');
            mark.textContent = '';
            if (correctSet.indexOf(i) >= 0) {
                b.classList.add('ok');
                mark.appendChild(icon('i-check', 'c-mark'));
                if (i === choice) b.classList.add('pop');
            } else if (i === choice) {
                b.classList.add('bad', 'shake');
                mark.appendChild(icon('i-x', 'c-mark'));
            } else {
                b.classList.add('dim');
            }
        }
        var answerLetters = correctSet.map(function (k) { return LETTERS[k]; }).join(', ');
        toast(correct, correct ? (correctSet.length > 1 ? '정답이 여러 개였어요: ' + answerLetters : '잘 아시네요 👏') : '정답은 ' + answerLetters);
        $('qScore').textContent = score;
        updateDots();
        var next = $('nextBtn');
        next.firstChild.textContent = idx + 1 < quiz.questions.length ? '다음 문제 ' : '결과 보기 ';
        $('nextBar').hidden = false;
        if (window.matchMedia('(min-width: 960px)').matches) next.focus({ preventScroll: true });
    }

    function nextQuestion() {
        if (!answered) return;
        idx++;
        if (idx < quiz.questions.length) renderQuestion();
        else finish(true);
    }
    $('nextBtn').addEventListener('click', nextQuestion);

    document.addEventListener('keydown', function (e) {
        if ($('vQuestion').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.target && e.target.tagName === 'INPUT') return;
        var k = e.key.toLowerCase();
        var pos = '12345'.indexOf(k);
        if (pos < 0) pos = 'abcde'.indexOf(k);
        if (!answered && pos >= 0 && pos < $('qChoices').children.length) {
            e.preventDefault();
            $('qChoices').children[pos].click();
        } else if (answered && (k === 'enter' || k === ' ' || k === 'arrowright')) {
            if (document.activeElement === $('nextBtn') && k !== 'arrowright') return; // the button handles it
            e.preventDefault();
            nextQuestion();
        }
    });

    // ---------------------------------------------------------------- result

    function finish(fresh) {
        var n = quiz.questions.length;
        $('rTitle').textContent = '「' + title() + '」 퀴즈 결과';
        $('rScore').textContent = score;
        $('rTotal').textContent = '/ ' + n;
        var ratio = score / n;
        for (var i = 0; i < TIERS.length; i++) {
            if (ratio >= TIERS[i][0]) { $('rTier').textContent = TIERS[i][1]; break; }
        }
        $('rRank').textContent = '';
        var ring = $('rRing');
        ring.style.strokeDashoffset = 326.73;
        show('vResult', '결과');
        requestAnimationFrame(function () {
            requestAnimationFrame(function () { ring.style.strokeDashoffset = 326.73 * (1 - ratio); });
        });

        var firstPlay = fresh && !store('sq_done_' + quizId);
        if (fresh) store('sq_result_' + quizId, JSON.stringify({ score: score, results: results, name: myName }));
        if (firstPlay) {
            $('rSubmit').textContent = '순위표에 올리는 중...';
            submitScore().then(function (ok) {
                if (ok) {
                    store('sq_done_' + quizId, String(Date.now()));
                    $('rSubmit').textContent = '순위표에 올라갔어요.';
                } else {
                    $('rSubmit').textContent = '순위표에 올리지 못했어요. 점수는 위와 같아요.';
                }
                loadBoard();
            });
        } else {
            $('rSubmit').textContent = fresh ? '다시 푼 점수는 순위표에 올라가지 않아요.' : '';
            loadBoard();
        }
    }

    function randomId() {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var out = '';
        var buf = new Uint8Array(20);
        (window.crypto || window.msCrypto).getRandomValues(buf);
        for (var i = 0; i < buf.length; i++) out += chars[buf[i] % chars.length];
        return out;
    }

    function submitScore() {
        var id = randomId();
        var name = 'projects/kakaoparser/databases/(default)/documents/sharedQuizzes/' + quizId + '/scores/' + id;
        var body = {
            writes: [{
                update: {
                    name: name,
                    fields: {
                        name: { stringValue: myName },
                        score: { integerValue: String(score) },
                        total: { integerValue: String(quiz.questions.length) },
                        correct: { arrayValue: { values: results.map(function (b) { return { booleanValue: b }; }) } },
                        expireAt: expireAtRaw
                    }
                },
                currentDocument: { exists: false },
                updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }]
            }]
        };
        store('sq_score_id_' + quizId, id);
        return fetch(BASE + ':commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }

    function loadBoard() {
        var query = {
            structuredQuery: {
                from: [{ collectionId: 'scores' }],
                orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }],
                limit: 50
            }
        };
        var mine = store('sq_score_id_' + quizId);
        $('board').textContent = '';
        $('boardNote').textContent = '순위를 불러오는 중...';
        fetch(BASE + '/sharedQuizzes/' + quizId + ':runQuery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(query)
        })
            .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
            .then(function (rows) {
                var scores = [];
                rows.forEach(function (row) {
                    if (!row.document) return;
                    var d = decodeFields(row.document.fields || {});
                    d.id = row.document.name.split('/').pop();
                    scores.push(d);
                });
                // Same score: whoever finished first ranks higher.
                scores.sort(function (a, b) {
                    return (b.score - a.score) || String(a.createdAt).localeCompare(String(b.createdAt));
                });
                renderBoard(scores, mine);
                renderStats(scores);
            })
            .catch(function () {
                $('boardNote').textContent = '순위를 불러오지 못했어요. 새로고침해주세요.';
                renderStats([]);
            });
    }

    function renderBoard(scores, mine) {
        var list = $('board');
        list.textContent = '';
        var rank = 0, prev = null, myRank = 0, myBoardScore = null;
        scores.forEach(function (s, i) {
            if (s.score !== prev) { rank = i + 1; prev = s.score; }
            var isMe = s.id === mine;
            if (isMe) { myRank = rank; myBoardScore = s.score; }
            var li = el('li', isMe ? 'me' : null);
            li.appendChild(el('span', 'medal' + (rank <= 3 ? ' r' + rank : ''), String(rank)));
            li.appendChild(avatar(s.name || '익명', 'sm'));
            var nm = el('div', 'b-name');
            nm.appendChild(el('b', null, (s.name || '익명') + (isMe ? ' (나)' : '')));
            var bar = el('div', 'b-bar');
            var fill = el('i');
            fill.style.width = (s.total ? Math.round(s.score / s.total * 100) : 0) + '%';
            bar.appendChild(fill);
            nm.appendChild(bar);
            li.appendChild(nm);
            var pts = el('span', 'b-pts', String(s.score));
            pts.appendChild(el('small', null, ' / ' + s.total));
            li.appendChild(pts);
            list.appendChild(li);
        });
        if (!scores.length) list.appendChild(el('li', 'board-empty', '아직 아무도 순위에 없어요. 첫 번째가 되어보세요!'));
        $('boardNote').textContent = scores.length
            ? '지금까지 ' + scores.length + (scores.length >= 50 ? '명 이상' : '명') + '이 풀었어요.'
            : '';
        var rankLine = $('rRank');
        rankLine.textContent = '';
        if (myRank) {
            // A replay's score isn't on the board: say whose rank this is.
            var prefix = myBoardScore === score ? '친구 ' : '첫 기록 ' + myBoardScore + '점 · 친구 ';
            rankLine.appendChild(document.createTextNode(prefix + scores.length + '명 중 '));
            rankLine.appendChild(el('b', null, myRank + '등'));
        }
    }

    function questionLabel(q) {
        if (q.subject) return q.subject;
        if (q.lines && q.lines.length) return '“' + q.lines[q.lines.length - 1].t + '”';
        return q.prompt;
    }

    function renderStats(scores) {
        var n = quiz.questions.length;
        var list = $('qStats');
        list.textContent = '';
        var counted = scores.filter(function (s) { return s.correct && s.correct.length === n; });
        var hardest = -1, hardestRate = 2;
        for (var i = 0; i < n; i++) {
            var q = quiz.questions[i];
            var right = counted.filter(function (s) { return s.correct[i]; }).length;
            var rate = counted.length ? right / counted.length : null;
            if (rate !== null && rate < hardestRate) { hardestRate = rate; hardest = i; }
            var li = el('li');
            var top = el('div', 'qs-top');
            top.appendChild(el('span', 'qs-num', 'Q' + (i + 1)));
            if (results.length === n) {
                var mine = el('span', 'qs-mine ' + (results[i] ? 'ok' : 'bad'));
                mine.setAttribute('title', results[i] ? '내가 맞힌 문제' : '내가 틀린 문제');
                mine.appendChild(icon(results[i] ? 'i-check' : 'i-x'));
                top.appendChild(mine);
            }
            top.appendChild(el('span', 'qs-label', (TYPES[q.type] ? TYPES[q.type].emoji + ' ' : '') + questionLabel(q)));
            top.appendChild(el('span', 'qs-pct', rate === null ? '-' : Math.round(rate * 100) + '%'));
            li.appendChild(top);
            var bar = el('div', 'qs-bar');
            var fill = el('i', rate === null ? '' : rate < 0.4 ? 'low' : rate < 0.7 ? 'mid' : '');
            fill.style.width = (rate === null ? 0 : Math.round(rate * 100)) + '%';
            bar.appendChild(fill);
            li.appendChild(bar);
            list.appendChild(li);
        }
        var h = $('hardest');
        if (counted.length >= 2 && hardest >= 0) {
            h.textContent = '😈 가장 어려웠던 문제: Q' + (hardest + 1) + ' (정답률 ' + Math.round(hardestRate * 100) + '%)';
            h.hidden = false;
        } else {
            h.hidden = true;
        }
    }

    $('retryBtn').addEventListener('click', function () { renderIntro(); });

    // ---------------------------------------------------------------- sharing

    var kakaoReady = null;
    function loadKakao() {
        if (!KAKAO_JS_KEY) return Promise.resolve(false);
        if (kakaoReady) return kakaoReady;
        kakaoReady = new Promise(function (resolve) {
            var s = document.createElement('script');
            s.src = KAKAO_SDK;
            s.integrity = KAKAO_SDK_SRI;
            s.crossOrigin = 'anonymous';
            s.onload = function () {
                try {
                    if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY);
                    resolve(true);
                } catch (e) { resolve(false); }
            };
            s.onerror = function () { resolve(false); };
            document.head.appendChild(s);
        });
        return kakaoReady;
    }

    function shareUrl() { return location.origin + location.pathname + '?id=' + encodeURIComponent(quizId); }
    function cardTitle() { return '🧩 「' + title() + '」 퀴즈 ' + quiz.questions.length + '문제'; }

    function kakaoAvailable() { return !!(KAKAO_JS_KEY && window.Kakao && window.Kakao.isInitialized()); }

    function shareKakao() {
        var url = shareUrl();
        var link = { mobileWebUrl: url, webUrl: url };
        window.Kakao.Share.sendDefault({
            objectType: 'feed',
            content: {
                title: cardTitle(),
                description: '나는 ' + score + '점! 너는 몇 점? 우리 방 대화로 만든 퀴즈예요.',
                imageUrl: CARD_IMAGE, imageWidth: 1024, imageHeight: 500, link: link
            },
            buttons: [{ title: '퀴즈 풀기', link: link }]
        });
    }

    function shareOther(btn) {
        var url = shareUrl();
        var text = cardTitle() + ', 나는 ' + score + '점! 너는 몇 점? 👇';
        if (navigator.share && platform !== 'desktop') {
            navigator.share({ title: '우리 방 퀴즈', text: text, url: url }).catch(function () {});
            return;
        }
        var full = text + '\n' + url;
        var label = btn.querySelector('span') || btn;
        var original = label.textContent;
        var done = function () {
            label.textContent = '복사했어요!';
            setTimeout(function () { label.textContent = original; }, 1800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(full).then(done, function () { window.prompt('복사해서 보내주세요', full); });
        } else {
            window.prompt('복사해서 보내주세요', full);
        }
    }

    $('shareBtn').addEventListener('click', function () {
        if (kakaoAvailable()) {
            try { shareKakao(); return; } catch (e) { /* fall through */ }
        }
        shareOther($('shareBtn'));
    });
    $('otherShareBtn').addEventListener('click', function () { shareOther($('otherShareBtn')); });

    // ---------------------------------------------------------------- boot

    renderInstallCards();
    load();
    loadKakao().then(function (ok) {
        $('shareLabel').textContent = ok ? '카카오톡으로 보내기' : '친구에게 이 퀴즈 보내기';
        $('otherShareBtn').hidden = !ok;
    });
    $('otherShareLabel').textContent = navigator.share && platform !== 'desktop' ? '다른 앱으로 공유' : '링크 복사';
})();
