/* /apps/kakao_love_analyzer/ — page script (dependency-free).
   1. The sample chat: a fictional two-person KakaoTalk exchange types
      itself out when scrolled into view, then gets "analysed": the
      balance beam tilts, a gauge fills, a stage track advances and two
      analysis cards come in. Message ratio, reply speed and every count
      on the cards are computed from the sample chat below; gauge and
      stage values are illustrative (the page says so). The sequence
      pauses while off screen or in a hidden tab.
   2. The analysis catalog: highlight what each relationship type gets.
   3. The import steps: Android / iPhone switch. */
(function () {
    'use strict';

    var doc = document;
    var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

    /* ================= Sample chats ================= */
    // [who, 'HH:MM', text] — who: 'm' = 나, 'p' = the other person.

    var MODES = {
        some: {
            tab: '썸',
            partner: '서진',
            day: '금요일 밤',
            chat: [
                ['p', '21:02', '퇴근했어? 오늘 엄청 바빴지'],
                ['m', '21:05', '응 겨우 끝났어ㅋㅋ 너는?'],
                ['p', '21:05', '나도 방금! 아 맞다 저번에 말한 그 전시 있잖아'],
                ['p', '21:06', '이번 주말까지래'],
                ['m', '21:09', '헐 진짜? 가 보고 싶었는데'],
                ['p', '21:09', '그럼 토요일에 같이 갈래?'],
                ['m', '21:12', '좋아!! 몇 시에 볼까?'],
                ['p', '21:12', '2시 어때? 끝나고 맛있는 것도 먹자']
            ],
            gauge: { title: '호감도', value: 78, caption: function (s) { return s.p.name + '님의 관심도 종합'; } },
            track: {
                title: '썸 진행도',
                stages: ['아직 시작 전이에요', '서로 알아가는 단계예요', '썸의 기운이 느껴져요', '썸 한창 진행 중!', '감정이 깊어지고 있어요', '거의 연애 직전이에요!', '이미 연인 아닌가요?'],
                ends: ['시작 전', '연인?'],
                at: 3,
                score: 58,
                note: '두 분 사이에 묘한 기류가 흐르고 있어요. 이 분위기 놓치지 마세요!'
            },
            cards: ['signals', 'awardsQuick']
        },
        love: {
            tab: '연인',
            partner: '하람',
            day: '화요일 밤',
            chat: [
                ['p', '23:41', '자기 아직 안 자?'],
                ['m', '23:42', '응 이제 누웠어'],
                ['p', '23:42', '오늘 하루 고생 많았어'],
                ['m', '23:43', '자기도ㅠㅠ 보고싶다'],
                ['p', '23:43', '나도 보고싶어 주말에 맛있는 거 먹으러 가자'],
                ['m', '23:44', '좋아 사랑해'],
                ['p', '23:44', '나도 사랑해 잘자'],
                ['m', '23:45', '잘자 내일 아침에 연락할게']
            ],
            gauge: { title: '관계 건강도', value: 91, grade: 'A+', caption: function () { return '아주 건강하고 사랑이 넘치는 관계예요'; } },
            track: {
                title: '관계 모멘텀',
                stages: ['관계에 변화가 필요할 수 있어요', '안정적인 관계를 유지하고 있어요', '관계가 뜨거워지고 있어요!'],
                ends: ['주춤', '뜨거워지는 중'],
                at: 2,
                note: '최근 대화 패턴이 이전보다 활발해지고 있어요. 좋은 흐름이에요!'
            },
            cards: ['affection', 'goodnight']
        },
        friend: {
            tab: '친구',
            partner: '민지',
            day: '수요일 점심',
            chat: [
                ['m', '12:31', '점심 먹었어?'],
                ['p', '12:40', '아직ㅠㅠ 회의 끝나고 먹으려고'],
                ['p', '12:40', '근데 너 단톡방에 올라온 영상 봤어?ㅋㅋㅋ'],
                ['m', '12:46', '뭐야ㅋㅋㅋ 지금 볼게'],
                ['m', '12:47', '아 미쳤다ㅋㅋㅋㅋㅋ'],
                ['p', '12:48', 'ㅋㅋㅋㅋ 그치 나 그거 열 번 봤어'],
                ['p', '12:48', '다음 주에 밥 한번 먹자'],
                ['m', '12:53', '콜 수요일 어때?'],
                ['p', '12:54', '완전 좋아 수요일에 보자']
            ],
            gauge: { title: '궁합', value: 82, grade: 'S', caption: function () { return '최고의 소통 파트너!'; } },
            track: {
                title: '관계 모멘텀',
                stages: ['관계에 변화가 필요할 수 있어요', '안정적인 관계를 유지하고 있어요', '관계가 뜨거워지고 있어요!'],
                ends: ['주춤', '뜨거워지는 중'],
                at: 1,
                note: '대화 패턴이 꾸준히 유지되고 있어요. 안정적인 관계예요.'
            },
            cards: ['humor', 'awardsFun']
        }
    };

    /* ================= Stats (computed from the chat) ================= */

    function toMin(hm) {
        var p = hm.split(':');
        return (+p[0]) * 60 + (+p[1]);
    }

    function chars(text) {
        return Array.from ? Array.from(text).length : text.length;
    }

    function count(text, needle) {
        return text.split(needle).length - 1;
    }

    function computeStats(mode) {
        var person = function (name) {
            return { name: name, n: 0, len: 0, q: 0, laughMsgs: 0, replies: [], instant: 0, caused: 0, love: 0, miss: 0, like: 0 };
        };
        var s = { m: person('나'), p: person(mode.partner), firstLove: null, firstNight: null };
        var lines = mode.chat;
        for (var i = 0; i < lines.length; i++) {
            var who = lines[i][0], t = toMin(lines[i][1]), text = lines[i][2];
            var me = s[who];
            me.n++;
            me.len += chars(text);
            if (text.indexOf('?') !== -1) me.q++;
            if (/ㅋㅋ/.test(text)) me.laughMsgs++;
            me.love += count(text, '사랑해');
            me.miss += count(text, '보고싶');
            me.like += count(text, '좋아해');
            if (!s.firstLove && text.indexOf('사랑해') !== -1) s.firstLove = who;
            if (!s.firstNight && text.indexOf('잘자') !== -1) s.firstNight = who;
            var prev = lines[i - 1];
            if (prev && prev[0] !== who) {
                var gap = t - toMin(prev[1]);
                me.replies.push(gap);
                if (gap < 1) me.instant++;
                if (/ㅋㅋ/.test(text) && gap <= 10) s[prev[0]].caused++;
            }
        }
        ['m', 'p'].forEach(function (k) {
            var r = s[k].replies;
            s[k].avgReply = r.length ? r.reduce(function (a, b) { return a + b; }, 0) / r.length : null;
            s[k].avgLen = s[k].n ? s[k].len / s[k].n : 0;
        });
        var total = s.m.n + s.p.n;
        s.mPct = Math.round(s.m.n / total * 100);
        s.pPct = 100 - s.mPct;
        return s;
    }

    function replyText(avg) {
        if (avg === null) return '–';
        if (avg < 1) return '1분 안';
        return Math.round(avg) + '분';
    }

    /* ================= Cards (app-style) ================= */

    function esc(str) {
        return String(str).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    function cardShell(emoji, title, sub, body) {
        return '<div class="lv-card-head"><span class="lv-card-emoji" aria-hidden="true">' + emoji + '</span>' +
            '<div><h4>' + esc(title) + '</h4>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div></div>' + body;
    }

    function statRow(label, value) {
        return '<li><span>' + esc(label) + '</span><b>' + esc(value) + '</b></li>';
    }

    function award(emoji, title, winner, detail) {
        return '<li class="lv-award"><span class="lv-award-emoji" aria-hidden="true">' + emoji + '</span>' +
            '<span><b>' + esc(title) + '</b><small>' + esc(winner) + ' · ' + esc(detail) + '</small></span></li>';
    }

    var CARDS = {
        signals: function (s) {
            var p = s.p, m = s.m, items = [];
            var rs = p.avgReply === null ? null : Math.max(1, Math.round(p.avgReply));
            if (rs !== null && rs <= 5) items.push(['ok', '답장이 빨라요', '평균 ' + rs + '분 안에 답장해요']);
            else items.push(['mid', '답장 속도가 보통이에요', '평균 ' + rs + '분 정도 걸려요']);
            var qRatio = (p.q + m.q) ? p.q / (p.q + m.q) : 0;
            if (qRatio > 0.4) items.push(['ok', '질문을 자주 해요', p.name + '님이 질문을 ' + p.q + '번 했어요']);
            else items.push(['mid', '질문을 가끔 해요', '질문 비율이 보통이에요']);
            if (m.avgLen && p.avgLen / m.avgLen > 0.8) items.push(['ok', '메시지에 정성을 들여요', '당신과 비슷한 길이로 답장해요']);
            else items.push(['mid', '메시지 길이가 보통이에요', '당신보다 조금 짧게 답하는 편이에요']);
            var body = '<ul class="lv-signals" role="list">' + items.map(function (it) {
                return '<li class="is-' + it[0] + '"><span class="lv-dot" aria-hidden="true"></span><span><b>' + esc(it[1]) + '</b><small>' + esc(it[2]) + '</small></span>' +
                    '<span class="app-visually-hidden">' + (it[0] === 'ok' ? '긍정 신호' : '보통') + '</span></li>';
            }).join('') + '</ul>';
            return cardShell('🚦', '관심 시그널 체크리스트', p.name + '님이 보내는 신호들', body);
        },
        awardsQuick: function (s) {
            var quick = s.p.instant >= s.m.instant ? s.p : s.m;
            var curious = s.m.q >= s.p.q ? s.m : s.p;
            var body = '<ul class="lv-awards" role="list">' +
                award('💨', '빛의 속도 답장 상', quick.name, '1분 안에 답장 ' + quick.instant + '번!') +
                award('❓', '호기심 대왕 상', curious.name, '질문 ' + curious.q + '번') +
                '</ul>';
            return cardShell('🏆', '대화 어워드', '두 분의 대화에서 발견한 재미있는 기록들', body);
        },
        awardsFun: function (s) {
            var mR = s.m.laughMsgs / s.m.n * 100, pR = s.p.laughMsgs / s.p.n * 100;
            var laugh = mR >= pR ? { name: s.m.name, r: mR } : { name: s.p.name, r: pR };
            var talk = s.m.n >= s.p.n ? s.m : s.p;
            var body = '<ul class="lv-awards" role="list">' +
                award('😂', 'ㅋㅋ 마스터 상', laugh.name, '메시지의 ' + laugh.r.toFixed(1) + '%에 ㅋㅋ') +
                award('🏆', '대화왕 상', talk.name, '총 ' + talk.n + '개 메시지') +
                '</ul>';
            return cardShell('🏆', '대화 어워드', '두 분의 대화에서 발견한 재미있는 기록들', body);
        },
        affection: function (s) {
            var who = s.firstLove === 'm' ? '내가' : s.p.name + '님이';
            var body = '<ul class="lv-stats" role="list">' +
                statRow('사랑해', (s.m.love + s.p.love) + '회') +
                statRow('보고싶어', (s.m.miss + s.p.miss) + '회') +
                statRow('좋아해', (s.m.like + s.p.like) + '회') +
                '</ul><p class="lv-card-verdict">첫 사랑해는 ' + esc(who) + ' 먼저</p>';
            return cardShell('💌', '애정표현', '', body);
        },
        goodnight: function (s) {
            var first = s.firstNight === 'm' ? '나' : s.p.name;
            var body = '<ul class="lv-stats" role="list">' +
                statRow('잘자 인사', s.firstNight ? '1일' : '0일') +
                statRow('잘자 인사를 먼저 하는 사람', first) +
                '</ul><p class="lv-card-verdict">하루의 끝을 함께 닫는 사이</p>';
            return cardShell('🌙', '잘자·굿모닝 리추얼', '', body);
        },
        humor: function (s) {
            var body = '<ul class="lv-stats" role="list">' +
                statRow('나', s.m.caused + '회') +
                statRow(s.p.name, s.p.caused + '회') +
                '</ul><p class="lv-card-verdict">웃음이 오가는 사이</p>';
            return cardShell('😆', '웃음 케미', '상대를 웃긴 횟수', body);
        }
    };

    /* ================= Rendering ================= */

    var HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.6s-7.6-4.6-9.4-9.3C1.4 8 3.3 4.6 6.8 4.6c2.1 0 3.5 1.2 4.3 2.5h1.8c.8-1.3 2.2-2.5 4.3-2.5 3.5 0 5.4 3.4 4.2 6.7-1.8 4.7-9.4 9.3-9.4 9.3z"/></svg>';

    function msgHtml(mode, i) {
        var line = mode.chat[i];
        var who = line[0];
        var prev = mode.chat[i - 1];
        var cont = prev && prev[0] === who;
        var same = cont && prev[1] === line[1];
        var name = who === 'p' && !cont ? '<span class="lv-msg-name">' + esc(mode.partner) + '</span>' : '';
        var avatar = who === 'p' ? '<span class="lv-avatar' + (cont ? ' is-blank' : '') + '" aria-hidden="true">' + (cont ? '' : esc(mode.partner.charAt(0))) + '</span>' : '';
        var hh = +line[1].split(':')[0];
        var time = (hh < 12 ? '오전 ' : '오후 ') + (hh % 12 === 0 ? 12 : hh % 12) + ':' + line[1].split(':')[1];
        return '<li class="lv-msg is-' + who + '"' + (cont ? ' data-cont' : '') + (same ? ' data-same' : '') + ' data-i="' + i + '">' + avatar +
            '<div class="lv-msg-body">' + name +
            '<div class="lv-msg-row"><p class="lv-bubble"><span class="app-visually-hidden">' + (who === 'm' ? '나' : esc(mode.partner)) + ': </span>' + esc(line[2]) + '</p>' +
            '<time class="lv-time">' + time + '</time></div></div></li>';
    }

    function stageHtml(key, final) {
        var mode = MODES[key];
        var s = computeStats(mode);
        var msgs = '';
        if (final) for (var i = 0; i < mode.chat.length; i++) msgs += msgHtml(mode, i);

        // Balance beam: the side that sent more goes down.
        var tilt = Math.max(-9, Math.min(9, (s.pPct - s.mPct) / 100 * 30));
        var mSize = Math.round(42 + s.mPct * 0.5), pSize = Math.round(42 + s.pPct * 0.5);
        var heavier = s.pPct > s.mPct ? s.p.name + '님 쪽으로 기울었어요' : s.pPct < s.mPct ? '내 쪽으로 기울었어요' : '딱 반반, 수평이에요';
        var faster = (s.m.avgReply === null || s.p.avgReply === null) ? '' :
            s.p.avgReply < s.m.avgReply ? s.p.name + '님이 더 빨리 답해요' :
            s.p.avgReply > s.m.avgReply ? '내가 더 빨리 답해요' : '답장 속도는 비슷해요';

        var g = mode.gauge, t = mode.track;
        var trackPct = t.stages.length > 1 ? (t.at / (t.stages.length - 1)) * 100 : 100;
        var stops = '';
        for (var k = 0; k < t.stages.length; k++) {
            stops += '<li class="' + (k < t.at ? 'is-past' : k === t.at ? 'is-now' : '') + '" style="--x:' + (k / (t.stages.length - 1) * 100) + '%"><span class="app-visually-hidden">' + esc(t.stages[k]) + (k === t.at ? ' (현재 단계)' : '') + '</span></li>';
        }

        var html =
            '<div class="lv-phone">' +
                '<div class="lv-phone-head">' +
                    '<span class="lv-avatar lv-avatar-lg" aria-hidden="true">' + esc(mode.partner.charAt(0)) + '</span>' +
                    '<span class="lv-phone-who"><b>' + esc(mode.partner) + '</b><small>가상의 인물이에요</small></span>' +
                    '<span class="lv-sample-tag">샘플 대화</span>' +
                '</div>' +
                '<div class="lv-chat" tabindex="0" role="region" aria-label="' + esc(mode.partner) + '님과의 샘플 대화">' +
                    '<div class="lv-chat-inner">' +
                        '<p class="lv-day"><span>' + esc(mode.day) + '</span></p>' +
                        '<ol class="lv-msgs" role="list">' + msgs + '</ol>' +
                    '</div>' +
                '</div>' +
                '<div class="lv-status" data-status="' + (final ? 'done' : 'idle') + '">' +
                    '<span class="lv-status-bar" aria-hidden="true"><i></i></span>' +
                    '<span class="lv-status-text">' + (final ? '분석 완료' : '대화가 끝나면 분석을 시작해요') + '</span>' +
                '</div>' +
            '</div>' +

            '<div class="lv-report' + (final ? '' : ' is-pending') + '"' + (final ? '' : ' aria-hidden="true"') + '>' +
                '<div class="lv-report-head"><h3>분석 결과</h3><span class="lv-example-tag">예시</span></div>' +

                '<div class="lv-block lv-balance' + (final ? ' is-on' : '') + '" data-block="balance" style="--tilt:' + tilt.toFixed(2) + 'deg;--m-size:' + mSize + 'px;--p-size:' + pSize + 'px;--m-pct:' + s.mPct + '%">' +
                    '<div class="lv-block-head"><h4>대화 밸런스</h4><p class="lv-balance-say">' + esc(heavier) + '</p></div>' +
                    '<div class="lv-seesaw" aria-hidden="true">' +
                        '<div class="lv-beam">' +
                            '<span class="lv-weight is-m"><span>나</span></span>' +
                            '<span class="lv-weight is-p"><span>' + esc(mode.partner) + '</span></span>' +
                        '</div>' +
                        '<span class="lv-fulcrum"></span>' +
                    '</div>' +
                    '<dl class="lv-compare">' +
                        '<div><dt>메시지 비율</dt><dd><span class="lv-split" aria-hidden="true"><i></i></span>' +
                            '<span class="lv-split-labels"><span>나 <b>' + s.mPct + '%</b></span><span>' + esc(mode.partner) + ' <b>' + s.pPct + '%</b></span></span></dd></div>' +
                        '<div><dt>평균 답장</dt><dd><span class="lv-split-labels"><span>나 <b>' + replyText(s.m.avgReply) + '</b></span><span>' + esc(mode.partner) + ' <b>' + replyText(s.p.avgReply) + '</b></span></span>' +
                            (faster ? '<small>' + esc(faster) + '</small>' : '') + '</dd></div>' +
                    '</dl>' +
                '</div>' +

                '<div class="lv-block lv-gauge' + (final ? ' is-on' : '') + '" data-block="gauge" style="--v:' + g.value + '">' +
                    '<div class="lv-block-head"><h4>' + esc(g.title) + '</h4></div>' +
                    '<div class="lv-gauge-dial">' +
                        '<svg viewBox="0 0 200 112" aria-hidden="true"><path class="lv-gauge-track" d="M16 100a84 84 0 0 1 168 0" pathLength="100"/><path class="lv-gauge-fill" d="M16 100a84 84 0 0 1 168 0" pathLength="100"/></svg>' +
                        '<p class="lv-gauge-num"><b data-count="' + g.value + '">' + (final ? g.value : 0) + '</b><span>점</span>' + (g.grade ? '<em>' + esc(g.grade) + '</em>' : '') + '</p>' +
                    '</div>' +
                    '<p class="lv-gauge-cap">' + esc(g.caption(s)) + '</p>' +
                '</div>' +

                '<div class="lv-block lv-track' + (final ? ' is-on' : '') + '" data-block="track" style="--at:' + trackPct + '%">' +
                    '<div class="lv-block-head"><h4>' + esc(t.title) + '</h4>' + (t.score !== undefined ? '<span class="lv-track-score">' + t.score + '점</span>' : '') + '</div>' +
                    '<div class="lv-track-rail"><span class="lv-track-fill"></span><ol role="list">' + stops + '</ol><span class="lv-track-mark">' + HEART + '</span></div>' +
                    '<p class="lv-track-ends" aria-hidden="true"><span>' + esc(t.ends[0]) + '</span><span>' + esc(t.ends[1]) + '</span></p>' +
                    '<p class="lv-track-now"><b>' + esc(t.stages[t.at]) + '</b><span>' + esc(t.note) + '</span></p>' +
                '</div>' +

                '<div class="lv-block lv-card' + (final ? ' is-on' : '') + '" data-block="card0">' + CARDS[mode.cards[0]](s) + '</div>' +
                '<div class="lv-block lv-card' + (final ? ' is-on' : '') + '" data-block="card1">' + CARDS[mode.cards[1]](s) + '</div>' +
            '</div>';
        return { html: html, stats: s };
    }

    function summary(key, s) {
        var mode = MODES[key], g = mode.gauge, t = mode.track;
        return '샘플 분석 완료. 메시지 비율 나 ' + s.mPct + '%, ' + mode.partner + ' ' + s.pPct + '%. 평균 답장 나 ' + replyText(s.m.avgReply) +
            ', ' + mode.partner + ' ' + replyText(s.p.avgReply) + '. ' + g.title + ' ' + g.value + '점' + (g.grade ? ' ' + g.grade + '등급' : '') +
            '. ' + t.title + ': ' + t.stages[t.at];
    }

    /* ================= Pausable step clock ================= */

    function Clock() {
        this.steps = [];
        this.i = 0;
        this.t = null;
        this.left = 0;
        this.due = 0;
        this.running = false;
    }
    Clock.prototype.load = function (steps) {
        this.stop();
        this.steps = steps;
        this.i = 0;
        this.left = steps.length ? steps[0].wait : 0;
    };
    Clock.prototype.next = function () { return this.steps[this.i] || null; };
    Clock.prototype.arm = function () {
        var self = this;
        if (!this.running || this.t || this.i >= this.steps.length) return;
        if (this.gate && !this.gate(this.steps[this.i])) { this.running = false; return; }
        this.due = Date.now() + this.left;
        this.t = setTimeout(function () {
            self.t = null;
            var step = self.steps[self.i++];
            self.left = self.i < self.steps.length ? self.steps[self.i].wait : 0;
            step.fn();
            self.arm();
        }, this.left);
    };
    Clock.prototype.play = function () { this.running = true; this.arm(); };
    Clock.prototype.pause = function () {
        this.running = false;
        if (this.t) {
            clearTimeout(this.t);
            this.t = null;
            this.left = Math.max(0, this.due - Date.now());
        }
    };
    Clock.prototype.stop = function () { this.pause(); this.steps = []; this.i = 0; };
    Clock.prototype.busy = function () { return this.i < this.steps.length; };

    /* ================= Demo controller ================= */

    function initDemo() {
        var section = doc.getElementById('demo');
        if (!section) return;
        var stage = section.querySelector('.lv-stage');
        var btns = section.querySelectorAll('[data-mode]');
        var actBtn = section.querySelector('.lv-replay');
        var live = section.querySelector('[data-live]');
        var clock = new Clock();
        var state = { key: 'some', phase: 'idle', started: false };
        // What the reader can see: the chat panel, the report. Chat steps
        // run only while the chat is on screen, result steps only while the
        // report is, so on a phone the results fill in where you look.
        var vis = { chat: false, report: false };
        var single = window.matchMedia ? window.matchMedia('(max-width: 960px)') : { matches: false };
        clock.gate = function (step) { return !doc.hidden && vis[step.need]; };

        function q(sel) { return stage.querySelector(sel); }

        function setAct(phase) {
            state.phase = phase;
            var done = phase === 'done';
            actBtn.textContent = done ? '다시 보기' : '결과 바로 보기';
            actBtn.setAttribute('data-act', done ? 'replay' : 'skip');
        }

        function scrollChat() {
            var box = q('.lv-chat');
            if (box) box.scrollTop = box.scrollHeight;
        }

        function setStatus(kind, text, pct) {
            var st = q('.lv-status');
            if (!st) return;
            st.setAttribute('data-status', kind);
            st.style.setProperty('--p', (pct || 0) + '%');
            st.querySelector('.lv-status-text').textContent = text;
        }

        function countUp(el) {
            var to = +el.getAttribute('data-count');
            if (reduceMQ.matches || !window.requestAnimationFrame) { el.textContent = to; return; }
            var t0 = null, dur = 1100;
            function frame(ts) {
                if (t0 === null) t0 = ts;
                var k = Math.min(1, (ts - t0) / dur);
                el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
                if (k < 1) requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
        }

        function reveal(name) {
            var b = q('[data-block="' + name + '"]');
            if (!b) return;
            b.classList.add('is-on');
            var num = b.querySelector('[data-count]');
            if (num) countUp(num);
        }

        function finishLive(s) {
            var rep = q('.lv-report');
            rep.classList.remove('is-pending');
            rep.removeAttribute('aria-hidden');
            live.textContent = summary(state.key, s);
        }

        var chatIO = null, reportIO = null;
        function observeParts() {
            if (!chatIO) return;
            chatIO.disconnect();
            reportIO.disconnect();
            var phone = q('.lv-phone'), rep = q('.lv-report');
            if (phone) chatIO.observe(phone);
            if (rep) reportIO.observe(rep);
        }

        function render(final) {
            var out = stageHtml(state.key, final);
            stage.setAttribute('data-mode', state.key);
            stage.innerHTML = out.html;
            observeParts();
            return out.stats;
        }

        function showFinal() {
            clock.stop();
            state.started = true;
            var s = render(true);
            scrollChat();
            finishLive(s);
            setAct('done');
        }

        function buildSteps(s) {
            var mode = MODES[state.key];
            var list = q('.lv-msgs');
            var steps = [];
            var n = mode.chat.length;
            steps.push({ need: 'chat', wait: 450, fn: function () { setStatus('reading', '대화가 오가는 중', 0); } });
            mode.chat.forEach(function (line, i) {
                var len = chars(line[2]);
                if (line[0] === 'p') {
                    steps.push({ need: 'chat', wait: 320, fn: function () {
                        var li = doc.createElement('li');
                        li.className = 'lv-msg is-p lv-typing' + (i > 0 && mode.chat[i - 1][0] === 'p' ? ' is-cont' : '');
                        li.setAttribute('aria-hidden', 'true');
                        li.innerHTML = '<span class="lv-avatar is-blank"></span><div class="lv-msg-body"><p class="lv-bubble"><i></i><i></i><i></i></p></div>';
                        list.appendChild(li);
                        scrollChat();
                    } });
                }
                steps.push({ need: 'chat', wait: Math.max(620, Math.min(1350, 380 + len * 30)), fn: function () {
                    var typing = list.querySelector('.lv-typing');
                    if (typing) typing.remove();
                    list.insertAdjacentHTML('beforeend', msgHtml(mode, i));
                    setStatus('reading', '대화가 오가는 중', Math.round((i + 1) / n * 100));
                    scrollChat();
                } });
            });
            steps.push({ need: 'chat', wait: 650, fn: function () {
                setStatus('analyzing', single.matches ? '대화를 분석하는 중… 결과는 아래에 있어요' : '대화를 분석하는 중…', 100);
            } });
            steps.push({ need: 'report', wait: 1500, fn: function () { setStatus('done', '분석 완료', 100); reveal('balance'); } });
            steps.push({ need: 'report', wait: 650, fn: function () { reveal('gauge'); } });
            steps.push({ need: 'report', wait: 650, fn: function () { reveal('track'); } });
            steps.push({ need: 'report', wait: 650, fn: function () { reveal('card0'); } });
            steps.push({ need: 'report', wait: 320, fn: function () { reveal('card1'); } });
            steps.push({ need: 'report', wait: 450, fn: function () { finishLive(s); setAct('done'); } });
            return steps;
        }

        function sync() {
            var step = clock.next();
            if (state.started && step && clock.gate(step)) clock.play();
            else clock.pause();
        }

        function start() {
            if (reduceMQ.matches) { showFinal(); return; }
            var s = render(false);
            live.textContent = '';
            setAct('playing');
            clock.load(buildSteps(s));
            state.started = true;
            sync();
        }

        function selectMode(key) {
            if (!MODES[key]) return;
            state.key = key;
            for (var i = 0; i < btns.length; i++) {
                btns[i].setAttribute('aria-pressed', btns[i].getAttribute('data-mode') === key ? 'true' : 'false');
            }
            if (reduceMQ.matches) { showFinal(); return; }
            if (state.started || vis.chat) start();
            else { render(false); setAct('idle'); }
        }

        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () { selectMode(this.getAttribute('data-mode')); });
        }
        actBtn.addEventListener('click', function () {
            if (actBtn.getAttribute('data-act') === 'replay') start();
            else showFinal();
        });

        if ('IntersectionObserver' in window) {
            chatIO = new IntersectionObserver(function (entries) {
                vis.chat = entries[entries.length - 1].isIntersecting;
                if (vis.chat && !state.started && !reduceMQ.matches) start();
                else sync();
            }, { threshold: 0.35 });
            reportIO = new IntersectionObserver(function (entries) {
                vis.report = entries[entries.length - 1].isIntersecting;
                sync();
            }, { rootMargin: '0px 0px -35% 0px', threshold: 0 });
        }

        // Initial state: finished under reduced motion or without
        // IntersectionObserver, otherwise an empty chat waiting to be
        // scrolled into view.
        if (reduceMQ.matches || !chatIO) showFinal();
        else { render(false); setAct('idle'); }
        doc.addEventListener('visibilitychange', sync);
        if (reduceMQ.addEventListener) {
            reduceMQ.addEventListener('change', function () { if (reduceMQ.matches) showFinal(); });
        }
    }

    /* ================= Catalog filter ================= */

    var FILTER_NAMES = { s: '썸 분석', r: '연애 분석', f: '일반 관계 분석' };

    function initCatalog() {
        var root = doc.getElementById('analyses');
        if (!root) return;
        var chips = root.querySelectorAll('[data-filter]');
        var items = root.querySelectorAll('.lv-group li[data-for]');
        var groups = root.querySelectorAll('.lv-group');
        var status = root.querySelector('[data-filter-status]');

        function apply(f) {
            for (var i = 0; i < chips.length; i++) {
                chips[i].setAttribute('aria-pressed', chips[i].getAttribute('data-filter') === f ? 'true' : 'false');
            }
            for (var j = 0; j < items.length; j++) {
                var on = f === 'all' || items[j].getAttribute('data-for').split(' ').indexOf(f) !== -1;
                items[j].classList.toggle('is-off', !on);
                var sr = items[j].querySelector('.lv-off-sr');
                if (!on && !sr) {
                    sr = doc.createElement('span');
                    sr.className = 'app-visually-hidden lv-off-sr';
                    sr.textContent = ' (이 유형에는 나오지 않아요)';
                    items[j].appendChild(sr);
                } else if (on && sr) {
                    sr.remove();
                }
            }
            for (var k = 0; k < groups.length; k++) {
                var g = groups[k];
                var any = g.querySelector('li[data-for]:not(.is-off)');
                g.classList.toggle('is-off', !any);
                var t = g.querySelector('[data-title-all]');
                if (t) t.textContent = f === 'f' ? t.getAttribute('data-title-f') : t.getAttribute('data-title-all');
            }
            status.textContent = f === 'all' ? '' : FILTER_NAMES[f] + '에서 볼 수 있는 항목을 진하게 표시했어요.';
        }

        for (var i = 0; i < chips.length; i++) {
            chips[i].addEventListener('click', function () { apply(this.getAttribute('data-filter')); });
        }
    }

    /* ================= Import steps: Android / iPhone ================= */

    function initImport() {
        var root = doc.getElementById('import');
        if (!root) return;
        var chips = root.querySelectorAll('[data-os]');
        var panels = root.querySelectorAll('[data-os-panel]');
        function show(os) {
            for (var i = 0; i < chips.length; i++) chips[i].setAttribute('aria-pressed', chips[i].getAttribute('data-os') === os ? 'true' : 'false');
            for (var j = 0; j < panels.length; j++) panels[j].hidden = panels[j].getAttribute('data-os-panel') !== os;
        }
        for (var i = 0; i < chips.length; i++) {
            chips[i].addEventListener('click', function () { show(this.getAttribute('data-os')); });
        }
        var ua = navigator.userAgent || '';
        var isApple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
        show(isApple ? 'ios' : 'android');
    }

    initDemo();
    initCatalog();
    initImport();
})();
