// 우리 방 퀴즈 — web player for quizzes shared from the Android app (SharedQuizCreateActivity).
//
// Reads sharedQuizzes/{id} and its scores/ subcollection through the Firestore REST API (no SDK,
// no key: the security rules are the only gate). Document shape: SharedQuizUploader.buildDocument
// and SharedQuizQuestion.toMap in the AndroidKakaoParser repo; rules: docs/shared-quiz/firestore.rules.
// Everything user-provided is rendered with textContent, never innerHTML.
(function () {
    'use strict';

    var BASE = 'https://firestore.googleapis.com/v1/projects/kakaoparser/databases/(default)/documents';
    // 카카오톡 공유: the Kakao Developers app's JavaScript key (same app as the Android native key;
    // rexyrex.github.io must be a registered Web domain). Empty = navigator.share / copy only.
    var KAKAO_JS_KEY = '3c8b0baf532167c1ce493e26044b8a7a';  // Kakao app 1641240
    var KAKAO_SDK = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js';
    var KAKAO_SDK_SRI = 'sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy';
    var CARD_IMAGE = 'https://rexyrex.github.io/assets/og/apps/kakaoparser.jpg';
    var LETTERS = ['A', 'B', 'C', 'D', 'E'];
    var TIERS = [
        [1.0, '🏆 완벽! 이 방의 터줏대감'],
        [0.8, '🔥 거의 다 아는 찐친'],
        [0.6, '😎 꽤 아는 편'],
        [0.4, '🤔 반쯤 아는 사이'],
        [0.2, '😅 눈팅 좀 더 하세요'],
        [0.0, '👻 혹시 다른 방 사람?']
    ];

    var $ = function (id) { return document.getElementById(id); };
    var quizId = new URLSearchParams(location.search).get('id') || '';
    var quiz = null;          // decoded document
    var expireAtRaw = null;   // exact timestampValue, copied into the score doc (rules compare it)
    var idx = 0, score = 0, results = [], answered = false, myName = '';

    function store(key, value) {
        try {
            if (value === undefined) return localStorage.getItem(key);
            localStorage.setItem(key, value);
        } catch (e) { return null; }
        return null;
    }

    function show(view) {
        ['vLoading', 'vIntro', 'vQuestion', 'vResult'].forEach(function (v) {
            $(v).classList.toggle('hidden', v !== view);
        });
        window.scrollTo(0, 0);
    }

    function fail(message) {
        $('loadingText').textContent = message;
        show('vLoading');
    }

    // ---- Firestore REST value decoding ----
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

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined && text !== null) e.textContent = text;
        return e;
    }

    function daysLeft() {
        var ms = new Date(quiz.expireAt).getTime() - Date.now();
        return Math.max(0, Math.ceil(ms / 86400000));
    }

    // ---- load ----
    function load() {
        if (!/^[A-Za-z0-9]{10,40}$/.test(quizId)) {
            fail('퀴즈 링크가 올바르지 않아요. 받은 링크를 다시 확인해주세요.');
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
                renderIntro();
            })
            .catch(function (e) {
                if (e.message === 'gone') {
                    fail('이 퀴즈는 기간(7일)이 지나 사라졌거나 없는 퀴즈예요. 친구에게 새 링크를 부탁해보세요!');
                } else {
                    fail('퀴즈를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해주세요.');
                }
            });
    }

    function renderIntro() {
        document.title = (quiz.title || '우리 방') + ' 퀴즈 — 카톡 정밀 분석기';
        $('introTitle').textContent = '🧩 ' + (quiz.title || '우리 방') + ' 퀴즈';
        $('introMeta').textContent = '만든 사람 ' + (quiz.creator || '익명') + ' · ' + quiz.questions.length + '문제 · ' + daysLeft() + '일 남음';
        $('nameInput').value = store('sq_name') || '';
        var done = store('sq_done_' + quizId);
        $('introNotice').textContent = done
            ? '이미 이 퀴즈를 풀었어요. 다시 풀 수는 있지만 순위에는 처음 점수만 남아요.'
            : '순위표에는 처음 푼 점수만 올라가요.';
        show('vIntro');
    }

    $('startBtn').addEventListener('click', function () {
        var typed = $('nameInput').value.trim().slice(0, 12);
        myName = typed || '익명';
        if (typed) store('sq_name', typed);
        idx = 0; score = 0; results = [];
        renderQuestion();
    });

    // ---- question ----
    function renderQuestion() {
        var q = quiz.questions[idx];
        var n = quiz.questions.length;
        answered = false;
        $('qProgress').textContent = (idx + 1) + ' / ' + n;
        $('qScore').textContent = '맞힌 문제 ' + score;
        $('qBar').style.width = (idx / n * 100) + '%';
        $('qPrompt').textContent = q.prompt;

        var body = $('qBody');
        body.textContent = '';
        if (q.lines && q.lines.length) {
            var chat = el('div', 'chat');
            q.lines.forEach(function (l) {
                var m = el('div', 'msg');
                if (l.a) m.appendChild(el('div', 'name', l.a));
                m.appendChild(el('div', 'bubble', l.t));
                chat.appendChild(m);
            });
            body.appendChild(chat);
        } else if (q.subject) {
            body.appendChild(el('div', 'subject', q.subject));
        }

        var box = $('qChoices');
        box.textContent = '';
        (q.choices || []).forEach(function (c, i) {
            var b = el('button', 'choice');
            b.type = 'button';
            b.appendChild(el('b', null, LETTERS[i] || ''));
            b.appendChild(el('span', null, c.l));
            b.addEventListener('click', function () { answer(i); });
            box.appendChild(b);
        });
        $('qVerdict').textContent = '';
        $('nextBtn').classList.add('hidden');
        show('vQuestion');
    }

    function answer(choice) {
        if (answered) return;
        answered = true;
        var q = quiz.questions[idx];
        var correct = (q.correct || []).indexOf(choice) >= 0;
        if (correct) score++;
        results.push(correct);
        var buttons = $('qChoices').children;
        for (var i = 0; i < buttons.length; i++) {
            var b = buttons[i];
            b.disabled = true;
            b.lastChild.textContent = q.choices[i].r || q.choices[i].l;  // reveal ("[12회] 민수")
            if ((q.correct || []).indexOf(i) >= 0) b.classList.add('ok');
            else if (i === choice) b.classList.add('bad');
        }
        $('qVerdict').textContent = correct ? '⭕ 정답!' : '❌ 땡!';
        $('qScore').textContent = '맞힌 문제 ' + score;
        $('qBar').style.width = ((idx + 1) / quiz.questions.length * 100) + '%';
        var next = $('nextBtn');
        next.textContent = idx + 1 < quiz.questions.length ? '다음 문제' : '결과 보기';
        next.classList.remove('hidden');
    }

    $('nextBtn').addEventListener('click', function () {
        idx++;
        if (idx < quiz.questions.length) renderQuestion();
        else finish();
    });

    // ---- result ----
    function finish() {
        var n = quiz.questions.length;
        $('rTitle').textContent = (quiz.title || '우리 방') + ' 퀴즈';
        $('rScore').textContent = score;
        $('rTotal').textContent = ' / ' + n;
        var ratio = score / n;
        for (var i = 0; i < TIERS.length; i++) {
            if (ratio >= TIERS[i][0]) { $('rTier').textContent = TIERS[i][1]; break; }
        }
        show('vResult');

        var firstPlay = !store('sq_done_' + quizId);
        if (firstPlay) {
            $('rSubmit').textContent = '순위표에 올리는 중...';
            submitScore().then(function (ok) {
                if (ok) {
                    store('sq_done_' + quizId, String(Date.now()));
                    $('rSubmit').textContent = '순위표에 올라갔어요.';
                } else {
                    $('rSubmit').textContent = '순위표에 올리지 못했어요. (점수는 위와 같아요)';
                }
                loadBoard(ok);
            });
        } else {
            $('rSubmit').textContent = '다시 푼 점수는 순위표에 올라가지 않아요.';
            loadBoard(false);
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

    var myScoreId = null;
    function submitScore() {
        myScoreId = randomId();
        var name = 'projects/kakaoparser/databases/(default)/documents/sharedQuizzes/' + quizId + '/scores/' + myScoreId;
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
        store('sq_score_id_' + quizId, myScoreId);
        return fetch(BASE + ':commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }

    function loadBoard(submitted) {
        var query = {
            structuredQuery: {
                from: [{ collectionId: 'scores' }],
                orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }],
                limit: 50
            }
        };
        var mine = store('sq_score_id_' + quizId);
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
            });
    }

    function renderBoard(scores, mine) {
        var tbody = $('board');
        tbody.textContent = '';
        var rank = 0, prev = null;
        scores.forEach(function (s, i) {
            if (s.score !== prev) { rank = i + 1; prev = s.score; }
            var tr = el('tr', s.id === mine ? 'me' : null);
            tr.appendChild(el('td', 'rank', rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : String(rank)));
            tr.appendChild(el('td', null, s.name + (s.id === mine ? ' (나)' : '')));
            tr.appendChild(el('td', 'pts', s.score + ' / ' + s.total));
            tbody.appendChild(tr);
        });
        $('boardNote').textContent = scores.length
            ? '지금까지 ' + scores.length + (scores.length >= 50 ? '명 이상' : '명') + '이 풀었어요.'
            : '아직 아무도 순위에 없어요.';
    }

    function renderStats(scores) {
        var n = quiz.questions.length;
        var box = $('qStats');
        box.textContent = '';
        var counted = scores.filter(function (s) { return s.correct && s.correct.length === n; });
        if (!counted.length) { $('statsCard').classList.add('hidden'); return; }
        $('statsCard').classList.remove('hidden');
        var hardest = -1, hardestRate = 2;
        for (var i = 0; i < n; i++) {
            var right = counted.filter(function (s) { return s.correct[i]; }).length;
            var rate = right / counted.length;
            if (rate < hardestRate) { hardestRate = rate; hardest = i; }
            var row = el('div', 'qstat');
            var label = quiz.questions[i].subject || (quiz.questions[i].lines && quiz.questions[i].lines.length
                ? '“' + quiz.questions[i].lines[quiz.questions[i].lines.length - 1].t + '”' : quiz.questions[i].prompt);
            row.appendChild(el('span', null, 'Q' + (i + 1) + ' ' + label));
            row.appendChild(el('span', null, Math.round(rate * 100) + '%'));
            box.appendChild(row);
        }
        if (counted.length >= 2 && hardest >= 0) {
            box.insertBefore(el('p', 'muted small', '😈 가장 어려웠던 문제: Q' + (hardest + 1) + ' (정답률 ' + Math.round(hardestRate * 100) + '%)'), box.firstChild);
        }
    }

    $('retryBtn').addEventListener('click', function () {
        renderIntro();
    });

    // ---- Kakao JS SDK, loaded only when a key is configured ----
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

    function shareKakao(url, title, description) {
        var link = { mobileWebUrl: url, webUrl: url };
        window.Kakao.Share.sendDefault({
            objectType: 'feed',
            content: { title: title, description: description, imageUrl: CARD_IMAGE, imageWidth: 1024, imageHeight: 500, link: link },
            buttons: [{ title: '퀴즈 풀기', link: link }]
        });
    }

    $('shareBtn').addEventListener('click', function () {
        var url = location.origin + location.pathname + '?id=' + encodeURIComponent(quizId);
        var cardTitle = '🧩 「' + (quiz.title || '우리 방') + '」 퀴즈 ' + quiz.questions.length + '문제';
        var text = cardTitle + ', 나는 ' + score + '점! 너는 몇 점? 👇';
        if (KAKAO_JS_KEY && window.Kakao && window.Kakao.isInitialized()) {
            try {
                shareKakao(url, cardTitle, '나는 ' + score + '점! 너는 몇 점? 우리 방 대화로 만든 퀴즈예요.');
                return;
            } catch (e) { /* fall through to the generic share */ }
        }
        if (navigator.share) {
            navigator.share({ title: '우리 방 퀴즈', text: text, url: url }).catch(function () {});
            return;
        }
        var full = text + '\n' + url;
        var done = function () { $('shareBtn').textContent = '링크를 복사했어요!'; };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(full).then(done, function () { prompt('복사해서 보내주세요', full); });
        } else {
            prompt('복사해서 보내주세요', full);
        }
    });

    load();
    loadKakao().then(function (ok) {
        if (ok) $('shareBtn').textContent = '카카오톡으로 이 퀴즈 보내기';
    });
})();
