/* 데이트코스 — /apps/date_planner_2/
   Scroll reveals + the course assembler. Dependency-free.

   The assembler follows the rules the app hands its AI and computes
   with itself (lib/services/ai/prompt_builder.dart, lib/core/constants.dart,
   lib/models/date_course.dart):
   - meals start inside 11:30–13:30 (lunch) or 17:30–20:00 (dinner);
     cafés 60–80 min, meals 80–100, activities 60–90;
   - first dates stay short (about three hours, quiet places, no heavy
     activity); anniversaries get a reservation-type dinner and a
     special finish (a night view or a bar); long-term couples get
     something new;
   - stops stay inside the walk tolerance (400 / 800 / 1,500 m);
   - rain (POP ≥ 60%) → mostly indoors;
   - walking = straight line × 1.3 at 67 m/min; driving = × 1.4 at
     350 m/min, never under 5 min; by car, one walking cluster per
     parking lot.
   The places, their spots on the map and their notes are made-up
   samples. The app itself only picks from real Kakao Map results. */
(function () {
    'use strict';

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- reveals ---------- */
    (function () {
        var els = document.querySelectorAll('[data-reveal]');
        if (!els.length || reduced || !('IntersectionObserver' in window)) return;
        document.documentElement.classList.add('dc-reveal');
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add('is-in');
                    io.unobserve(e.target);
                }
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
        Array.prototype.forEach.call(els, function (el) { io.observe(el); });
    })();

    /* ---------- the assembler ---------- */
    var demo = document.getElementById('dc-demo');
    if (!demo) return;

    var form = document.getElementById('dc-form');
    var courseEl = document.getElementById('dc-course');
    var loadingEl = document.getElementById('dc-loading');
    var statusEl = document.getElementById('dc-status');
    var runBtn = document.getElementById('dc-run');
    var walkNote = document.getElementById('dc-walk-note');

    var REGIONS = {
        seongsu: { name: '성수', walk: '성수 골목 산책' },
        yeonnam: { name: '연남', walk: '연남 골목 산책' },
        ikseon: { name: '익선동·종로', walk: '한옥 골목 산책' },
        jamsil: { name: '잠실', walk: '호숫가 산책' },
        haeundae: { name: '해운대', walk: '해변 산책' },
        jeonju: { name: '전주 한옥마을', walk: '한옥 골목 산책' }
    };

    var CAT = { cafe: '카페', restaurant: '식당', activity: '활동', attraction: '명소', walk: '산책', bar: '바·술집' };

    // [name, indoor?, price per person at a mid budget, a good point, a weak point]
    function o(n, io, p, pro, con) { return { n: n, io: io, p: p, pro: pro, con: con }; }

    var MEALS = {
        lunch: {
            low: [
                o('국밥·덮밥집', 'in', 10000, '빨리 나오고 든든해요', '분위기보다는 실속형이에요'),
                o('쌀국수집', 'in', 11000, '가볍게 먹기 좋아요', '점심엔 오래 앉아 있기 어려워요'),
                o('분식 맛집', 'in', 8000, '이것저것 나눠 먹기 좋아요', '좌석이 좁은 편이에요')
            ],
            mid: [
                o('골목 파스타집', 'in', 18000, '메뉴가 다양해 호불호가 적어요', '점심엔 웨이팅이 있을 수 있어요'),
                o('솥밥 한식집', 'in', 15000, '정갈한 한 상이라 부담이 없어요', '좌석 수가 많지 않아요'),
                o('브런치 레스토랑', 'in', 19000, '양이 넉넉해 나눠 먹기 좋아요', '주말엔 대기가 길 수 있어요')
            ],
            high: [
                o('예약제 런치 코스', 'in', 45000, '코스로 나와 특별한 기분이 나요', '예약이 필요하고 가격대가 있는 편이에요'),
                o('오마카세 런치', 'in', 50000, '셰프와 이야기하며 먹는 재미가 있어요', '좌석이 적어 예약이 빨리 차요'),
                o('한우 구이', 'in', 48000, '고기를 구워 줘서 대화에 집중할 수 있어요', '옷에 냄새가 밸 수 있어요')
            ]
        },
        dinner: {
            low: [
                o('닭갈비집', 'in', 13000, '둘이 나눠 먹기 좋아요', '옷에 냄새가 밸 수 있어요'),
                o('쌀국수·덮밥집', 'in', 12000, '가볍고 부담 없는 메뉴예요', '분위기보다는 실속형이에요'),
                o('분식 맛집', 'in', 9000, '이것저것 나눠 먹기 좋아요', '좌석이 좁은 편이에요')
            ],
            mid: [
                o('화덕 피자·파스타', 'in', 22000, '나눠 먹기 좋은 메뉴가 많아요', '저녁 피크엔 웨이팅이 있을 수 있어요'),
                o('숯불 고깃집', 'in', 26000, '고기를 구워 줘서 대화에 집중할 수 있어요', '옷에 냄새가 밸 수 있어요'),
                o('이자카야', 'in', 22000, '안주가 다양해 나눠 먹기 좋아요', '좌석이 붙어 있는 편이에요')
            ],
            high: [
                o('예약제 코스 레스토랑', 'in', 70000, '코스로 나와 기념일 분위기가 나요', '예약이 필요하고 가격대가 있는 편이에요'),
                o('오마카세', 'in', 80000, '셰프와 이야기하며 먹는 재미가 있어요', '좌석이 적어 예약이 빨리 차요'),
                o('와인 비스트로', 'in', 55000, '와인을 추천받아 곁들이기 좋아요', '음식 양은 적은 편이에요')
            ]
        },
        // first dates: crowd-pleasers, quiet rooms
        first: [
            o('골목 파스타집', 'in', 18000, '메뉴가 무난해 호불호가 적어요', '식사 시간엔 웨이팅이 있을 수 있어요'),
            o('일본 가정식', 'in', 15000, '조용해서 대화가 잘 들려요', '좌석이 많지 않아요'),
            o('솥밥 한식집', 'in', 15000, '정갈한 한 상이라 부담이 없어요', '좌석 수가 많지 않아요')
        ]
    };

    var SLOTS = {
        cafe: { cat: 'cafe', dur: 70, opts: [
            o('통창 2층 카페', 'in', 8000, '좌석 간격이 넓어 대화하기 편해요', '주말 오후엔 자리가 빨리 차요'),
            o('디저트가 강한 카페', 'in', 12000, '케이크 종류가 많아 고르는 재미가 있어요', '좌석이 조금 좁은 편이에요'),
            o('루프탑 뷰 카페', 'out', 9000, '해 질 무렵 풍경이 예뻐요', '날이 궂으면 야외석을 못 써요')
        ] },
        quietCafe: { cat: 'cafe', dur: 60, opts: [
            o('조용한 북카페', 'in', 8000, '음악이 작아 대화가 잘 들려요', '디저트 종류는 적은 편이에요'),
            o('핸드드립 카페', 'in', 9000, '메뉴가 단순해 고르기 쉬워요', '좌석 수가 많지 않아요'),
            o('통창 2층 카페', 'in', 8000, '좌석 간격이 넓어 대화하기 편해요', '주말 오후엔 자리가 빨리 차요')
        ] },
        dessert: { cat: 'cafe', dur: 60, opts: [
            o('늦게까지 여는 디저트 카페', 'in', 11000, '술 없이도 달달하게 마무리하기 좋아요', '밤에는 인기 메뉴가 품절될 수 있어요'),
            o('차 마시는 찻집', 'in', 10000, '조용해서 이야기 나누기 좋아요', '늦게까지 하지 않는 곳이 많아요'),
            o('젤라또 가게', 'in', 7000, '들고 걸으며 먹기 좋아요', '앉을 자리가 적어요')
        ] },
        activity: { cat: 'activity', dur: 90, opts: {
            general: [
                o('보드게임 카페', 'in', 9000, '처음 하는 게임도 직원이 설명해 줘요', '인기 시간대엔 자리가 없을 수 있어요'),
                o('셀프 사진관', 'in', 10000, '둘이 찍은 사진이 기념으로 남아요', '주말엔 순서를 기다릴 수 있어요'),
                o('인형뽑기·오락실', 'in', 8000, '짧게 웃고 즐기기 좋아요', '돈이 금방 나갈 수 있어요')
            ],
            long: [
                o('방탈출 카페', 'in', 22000, '둘이 머리를 맞대는 재미가 있어요', '예약이 거의 필수예요'),
                o('클라이밍장', 'in', 25000, '초보 강습이 있는 곳이 많아요', '다음 날 근육통이 올 수 있어요'),
                o('원데이 공방 클래스', 'in', 35000, '직접 만든 걸 가져갈 수 있어요', '예약이 필요해요')
            ],
            anniv: [
                o('향수 공방 클래스', 'in', 40000, '서로에게 어울리는 향을 만들어 줄 수 있어요', '예약이 필요하고 두 시간쯤 걸려요'),
                o('전시 관람', 'in', 15000, '천천히 둘러보며 이야기 나누기 좋아요', '주말엔 관람객이 많을 수 있어요'),
                o('셀프 사진관', 'in', 10000, '둘이 찍은 사진이 기념으로 남아요', '주말엔 순서를 기다릴 수 있어요')
            ],
            first: [
                o('전시 관람', 'in', 15000, '볼거리가 있어 대화가 자연스러워요', '주말엔 관람객이 많을 수 있어요'),
                o('서점 구경', 'in', 0, '취향 이야기가 자연스럽게 나와요', '오래 머무르긴 어려워요'),
                o('보드게임 카페', 'in', 9000, '어색함을 풀기 좋아요', '인기 시간대엔 자리가 없을 수 있어요')
            ]
        } },
        walk: { cat: 'walk', dur: 50, opts: null }, // filled per region
        rainWalk: { cat: 'attraction', dur: 60, opts: [
            o('실내 전시 관람', 'in', 15000, '비를 피해 천천히 둘러보기 좋아요', '주말엔 붐빌 수 있어요'),
            o('대형 서점 구경', 'in', 0, '날씨 걱정 없이 머물기 좋아요', '오래 앉아 있을 곳은 적어요'),
            o('만화카페', 'in', 9000, '편하게 쉬어 갈 수 있어요', '대화는 조용히 해야 해요')
        ] },
        finishBar: { cat: 'bar', dur: 70, opts: [
            o('조용한 와인 바', 'in', 18000, '조용히 이야기 나누며 마무리하기 좋아요', '안주 가격대가 있는 편이에요'),
            o('디저트 바', 'in', 16000, '케이크와 한잔을 함께 즐길 수 있어요', '좌석이 많지 않아요'),
            o('루프탑 바', 'out', 20000, '야경을 보며 한잔하기 좋아요', '날씨 영향을 받아요')
        ] },
        finishView: { cat: 'attraction', dur: 60, opts: [
            o('야경 전망대', 'in', 20000, '기념일 마무리로 야경만 한 게 없어요', '입장 마감 시간을 꼭 확인해야 해요'),
            o('야경 산책길', 'out', 0, '불빛을 보며 천천히 걷기 좋아요', '바람이 불면 쌀쌀해요'),
            o('야경 보이는 루프탑 바', 'out', 22000, '야경을 보며 한잔하기 좋아요', '날씨 영향을 받아요')
        ] }
    };

    var TARGET = { 1: 30000, 2: 50000, 3: 70000, 4: 100000 };
    var LEVEL = { 1: 0.9, 2: 1, 3: 1.3, 4: 1.35 };
    var BAND = { short: [150, 280], medium: [300, 560], long: [550, 1050] };
    var WALK_NOTE = { short: '장소 사이를 400m 안쪽으로 이어요.', medium: '장소 사이를 800m 안쪽으로 이어요.', long: '장소 사이를 1.5km 안쪽까지 이어요.' };
    var LUNCH = 690, DINNER = 1050;

    /* ---------- helpers ---------- */
    function hash(s) {
        var h = 2166136261;
        for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }
    function rng(seed) {
        var a = seed || 1;
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            var t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    function between(r, lo, hi) { return lo + (hi - lo) * r(); }
    function hhmm(min) { var h = Math.floor(min / 60), m = min % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
    function dist(m) { return m < 1000 ? (Math.round(m / 10) * 10) + 'm' : (m / 1000).toFixed(1) + 'km'; }
    function won(n) { return n.toLocaleString('ko-KR') + '원'; }
    function span(min) { var h = Math.floor(min / 60), m = min % 60; return (h ? h + '시간' : '') + (h && m ? ' ' : '') + (m ? m + '분' : ''); }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    // 으로 / 로: no final consonant, or a final ㄹ, takes 로
    function josa(word, withBatchim, without) {
        var c = word.charCodeAt(word.length - 1);
        if (c < 0xac00 || c > 0xd7a3) return without;
        var jong = (c - 0xac00) % 28;
        return jong && jong !== 8 ? withBatchim : without;
    }

    /* ---------- state ---------- */
    function readForm() {
        var f = form.elements;
        return {
            region: f.region.value,
            start: +f.start.value,
            type: f.type.value,
            move: f.move.value,
            sky: f.sky.value,
            walk: f.walk.value,
            budget: +f.budget.value
        };
    }

    var variant = 0;
    var picks = [];      // selected option index per slot
    var current = null;  // the built course

    /* ---------- build ---------- */
    function kindsFor(s) {
        var list;
        if (s.type === 'first') {
            list = s.start === 690 ? ['lunch', 'quietCafe', 'walk']
                : s.start === 840 ? ['quietCafe', 'walk', 'activity']
                    : ['walk', 'dinner', 'dessert'];
        } else {
            var finish = s.type === 'anniv' ? 'finishView' : 'finishBar';
            list = s.start === 690 ? ['lunch', 'cafe', 'activity', 'walk']
                : s.start === 840 ? ['cafe', 'activity', 'dinner', finish]
                    : ['walk', 'dinner', finish];
        }
        if (s.sky === 'rain') list = list.map(function (k) { return k === 'walk' ? 'rainWalk' : k; });
        return list;
    }

    function slotFor(kind, s) {
        var first = s.type === 'first';
        if (kind === 'lunch' || kind === 'dinner') {
            var tier = s.budget === 1 ? 'low' : s.budget === 4 ? 'high' : 'mid';
            if (s.type === 'anniv') tier = tier === 'low' ? 'mid' : 'high';
            var opts = first && tier !== 'low' ? MEALS.first : MEALS[kind][tier];
            return { kind: kind, cat: 'restaurant', dur: first ? 80 : 90, meal: kind, opts: opts };
        }
        var base = SLOTS[kind];
        var dur = base.dur;
        var opts = base.opts;
        if (kind === 'activity') {
            opts = base.opts[s.type] || base.opts.general;
            if (first) dur = 60;
        }
        if (kind === 'walk') {
            opts = [
                o(REGIONS[s.region].walk, 'out', 0, '걸으면서 이야기 나누기 좋아요', '비가 오면 동선을 바꿔야 해요'),
                o('공원 산책', 'out', 0, '벤치에서 쉬어 가기 좋아요', '해가 지면 쌀쌀할 수 있어요'),
                o('소품샵 골목 구경', 'out', 5000, '구경하는 재미가 있어요', '사람이 몰리는 시간이 있어요')
            ];
            if (first) dur = 40;
        }
        return { kind: kind, cat: base.cat, dur: dur, opts: opts };
    }

    function build(s) {
        var r = rng(hash([s.region, s.start, s.type, s.move, s.sky, s.walk, s.budget, variant].join('|')));
        var kinds = kindsFor(s);
        var slots = kinds.map(function (k, i) {
            var slot = slotFor(k, s);
            var opts = slot.opts.slice();
            // a re-roll puts a different first pick on top
            var turn = (variant + i) % opts.length;
            if (variant) opts = opts.slice(turn).concat(opts.slice(0, turn));
            // rain: indoor options first (the app's rule 7)
            if (s.sky === 'rain') {
                opts = opts.filter(function (x) { return x.io === 'in'; }).concat(opts.filter(function (x) { return x.io !== 'in'; }));
            }
            return { kind: k, cat: slot.cat, dur: slot.dur, meal: slot.meal, opts: opts };
        });

        // by car, a four-stop day splits into two walking clusters joined by one drive
        var driveBefore = s.move === 'car' && slots.length >= 4 ? slots.length - 1 : -1;

        // sample positions in metres (x east, y north)
        var band = BAND[s.walk];
        var spread = band[1] * 0.28;
        var x = 0, y = 0, ang = between(r, 0, Math.PI * 2);
        slots.forEach(function (slot, i) {
            if (i > 0) {
                var d;
                if (i === driveBefore) {
                    d = between(r, 2200, 3600);
                    ang += between(r, -0.6, 0.6);
                } else {
                    d = between(r, band[0], band[1]);
                    ang += between(r, -1.15, 1.15);
                }
                x += Math.cos(ang) * d;
                y += Math.sin(ang) * d;
            }
            slot.drive = i === driveBefore;
            slot.pos = slot.opts.map(function (opt, j) {
                if (j === 0) return [x, y];
                var a = between(r, 0, Math.PI * 2), d2 = between(r, spread * 0.45, spread);
                return [x + Math.cos(a) * d2, y + Math.sin(a) * d2];
            });
        });

        return { s: s, slots: slots, seed: hash(s.region), jitter: between(r, 0.94, 1.04) };
    }

    // times, hops and totals for the current picks
    function schedule(c) {
        var s = c.s, t = s.start, walked = 0, price = 0, prev = null, prevEnd = 0;
        var stops = c.slots.map(function (slot, i) {
            var j = picks[i] || 0;
            var opt = slot.opts[j];
            var p = slot.pos[j];
            var hop = null;
            if (prev) {
                var straight = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
                if (slot.drive) {
                    var dm = Math.round(straight * 1.4);
                    hop = { mode: 'drive', m: dm, min: Math.max(5, Math.ceil(dm / 350)) };
                } else {
                    var wm = Math.round(straight * 1.3);
                    hop = { mode: 'walk', m: wm, min: Math.max(1, Math.ceil(wm / 67)) };
                    walked += wm;
                }
                t = prevEnd + hop.min + 5;
                t = Math.ceil(t / 5) * 5;
            }
            if (slot.meal === 'lunch') t = Math.max(t, LUNCH);
            if (slot.meal === 'dinner') t = Math.max(t, DINNER);
            var start = t, end = t + slot.dur;
            prevEnd = end;
            prev = p;
            price += opt.p;
            return { slot: slot, opt: opt, j: j, pos: p, hop: hop, start: start, end: end };
        });

        var target = TARGET[s.budget];
        var raw = price * LEVEL[s.budget] * c.jitter;
        var lo = target * (s.budget === 4 ? 0.8 : 0.55), hi = target * (s.budget === 4 ? 1.5 : 1.08);
        var budget = Math.round(Math.min(hi, Math.max(lo, raw)) / 1000) * 1000;

        return {
            stops: stops,
            total: stops[stops.length - 1].end - stops[0].start,
            walked: walked,
            budget: budget
        };
    }

    /* ---------- render ---------- */
    function titleFor(s) {
        var r = REGIONS[s.region].name;
        var when = s.start === 690 ? '하루' : s.start === 840 ? '오후' : '저녁';
        if (s.type === 'first') return r + ' 대화가 편한 첫데이트 코스';
        if (s.type === 'anniv') return r + ' 기념일 ' + when + ' 코스';
        if (s.type === 'long') return r + ' 새로운 걸 해 보는 ' + when + ' 코스';
        return s.start === 690 ? r + ' 점심부터 즐기는 하루 코스'
            : s.start === 840 ? r + ' 가볍게 즐기는 오후 코스' : r + ' 저녁 데이트 코스';
    }

    function adviceFor(s, plan) {
        if (s.sky === 'rain') return { cls: 'is-rain', text: '비 · 강수확률 70%. 비 소식이 있어 실내 위주로 구성했어요.' };
        var outdoor = plan.stops.some(function (st) { return st.opt.io === 'out'; });
        return { cls: 'is-sun', text: outdoor ? '맑음 · 강수확률 10%. 산책하기 좋은 날씨라 야외 동선을 넣었어요.' : '맑음 · 강수확률 10%. 날씨 걱정 없는 날이에요.' };
    }

    function parkingFor(c, plan, i) {
        if (c.s.move !== 'car') return '';
        var n = plan.stops.length;
        var split = -1;
        plan.stops.forEach(function (st, k) { if (st.slot.drive) split = k; });
        if (i === 0) {
            var last = split > 0 ? split : n;
            return last > 1 ? '1번 근처 공영주차장에 대고 ' + last + '번까지 걸어서 돌아요.' : '1번 근처 공영주차장에 대요.';
        }
        if (i === split) return '차로 옮긴 뒤 근처 공영주차장에 대요.';
        return '';
    }

    function mapSvg(c, plan) {
        var W = 320, H = 170, pad = 26;
        // A drive leg is drawn shorter than it is (a schematic map), so the
        // walking cluster stays readable; the scale bar then goes away.
        var walkHops = plan.stops.filter(function (st) { return st.hop && st.hop.mode === 'walk'; });
        var avgWalk = walkHops.length ? walkHops.reduce(function (a, st) { return a + st.hop.m / 1.3; }, 0) / walkHops.length : 400;
        var hasDrive = false;
        var pts = [];
        plan.stops.forEach(function (st, i) {
            if (!i) { pts.push(st.pos.slice()); return; }
            var prevPos = plan.stops[i - 1].pos;
            var vx = st.pos[0] - prevPos[0], vy = st.pos[1] - prevPos[1];
            if (st.slot.drive) {
                hasDrive = true;
                var len = Math.hypot(vx, vy) || 1, want = avgWalk * 1.8;
                vx = vx / len * want; vy = vy / len * want;
            }
            var last = pts[pts.length - 1];
            pts.push([last[0] + vx, last[1] + vy]);
        });
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        pts.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
        var w = Math.max(maxX - minX, 300), h = Math.max(maxY - minY, 160);
        var k = Math.min((W - pad * 2) / w, (H - pad * 2) / h);
        var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        function px(p) { return [W / 2 + (p[0] - cx) * k, H / 2 - (p[1] - cy) * k]; }
        var xy = pts.map(px);

        // the neighbourhood: a few blocks and streets, the same for one region
        var rr = rng(c.seed);
        var bg = '';
        for (var b = 0; b < 9; b++) {
            var bx = between(rr, -10, W - 30), by = between(rr, -10, H - 30);
            bg += '<rect class="m-block" x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + between(rr, 40, 90).toFixed(1) + '" height="' + between(rr, 26, 60).toFixed(1) + '" rx="6"/>';
        }
        for (var sIdx = 0; sIdx < 6; sIdx++) {
            var vertical = sIdx % 2;
            var a = between(rr, -0.25, 0.25);
            var x1, y1, x2, y2;
            if (vertical) { x1 = between(rr, 20, W - 20); y1 = -10; x2 = x1 + Math.tan(a) * (H + 20); y2 = H + 10; }
            else { y1 = between(rr, 15, H - 15); x1 = -10; y2 = y1 + Math.tan(a) * (W + 20); x2 = W + 10; }
            bg += '<path class="m-street" stroke-width="' + (sIdx < 2 ? 9 : 5) + '" d="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + 'L' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '"/>';
        }

        // route: walking dotted, driving dashed; a mask draws it in
        var routeD = 'M' + xy[0][0].toFixed(1) + ' ' + xy[0][1].toFixed(1);
        var segs = '', labels = '';
        for (var i = 1; i < xy.length; i++) {
            var p0 = xy[i - 1], p1 = xy[i];
            var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
            var dx = p1[0] - p0[0], dy = p1[1] - p0[1];
            var bend = (i % 2 ? 1 : -1) * 0.18;
            var qx = mx - dy * bend, qy = my + dx * bend;
            var seg = 'M' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + 'Q' + qx.toFixed(1) + ' ' + qy.toFixed(1) + ' ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1);
            routeD += 'Q' + qx.toFixed(1) + ' ' + qy.toFixed(1) + ' ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1);
            segs += '<path class="' + (plan.stops[i].slot.drive ? 'm-drive' : 'm-walk') + '" d="' + seg + '"/>';
            if (plan.stops[i].slot.drive) {
                // label the drive leg at the curve's midpoint
                var lx = 0.25 * p0[0] + 0.5 * qx + 0.25 * p1[0], ly = 0.25 * p0[1] + 0.5 * qy + 0.25 * p1[1];
                var label = '차로 ' + plan.stops[i].hop.min + '분';
                labels += '<g class="m-label-drive"><rect class="m-tag" x="' + (lx - 26).toFixed(1) + '" y="' + (ly - 9).toFixed(1) + '" width="52" height="18" rx="9"/>' +
                    '<text class="m-tag-text" x="' + lx.toFixed(1) + '" y="' + (ly + 0.5).toFixed(1) + '" text-anchor="middle" dominant-baseline="central">' + label + '</text></g>';
            }
        }

        // parking (by car): one lot per walking cluster
        var park = '';
        if (c.s.move === 'car') {
            plan.stops.forEach(function (st, idx) {
                if (idx !== 0 && !st.slot.drive) return;
                var q = xy[idx];
                var ox = q[0] + (q[0] > W - 40 ? -26 : 18), oy = q[1] + (q[1] < 30 ? 14 : -20);
                park += '<g class="m-park"><rect x="' + (ox - 8).toFixed(1) + '" y="' + (oy - 8).toFixed(1) + '" width="16" height="16" rx="4"/><text x="' + ox.toFixed(1) + '" y="' + oy.toFixed(1) + '">P</text></g>';
            });
        }

        var pins = xy.map(function (q, idx) {
            return '<g class="m-pin" style="--i:' + idx + '"><circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="11"/><text x="' + q[0].toFixed(1) + '" y="' + q[1].toFixed(1) + '">' + (idx + 1) + '</text></g>';
        }).join('');

        // a scale bar (only when the map is to scale)
        var nice = [50, 100, 200, 300, 500, 1000, 2000];
        var len = nice[0];
        for (var n = 0; n < nice.length; n++) { if (nice[n] * k <= 70) len = nice[n]; }
        var sb = len * k;
        var scale = '<g><rect class="m-tag" x="' + (W - sb - 20).toFixed(1) + '" y="' + (H - 24) + '" width="' + (sb + 12).toFixed(1) + '" height="17" rx="5"/>' +
            '<path class="m-drive" style="stroke-dasharray:none;stroke-width:2" d="M' + (W - sb - 14).toFixed(1) + ' ' + (H - 11) + 'h' + sb.toFixed(1) + '"/>' +
            '<text class="m-tag-text" x="' + (W - 14 - sb / 2).toFixed(1) + '" y="' + (H - 15) + '" text-anchor="middle">' + dist(len) + '</text></g>';
        if (hasDrive) scale = '';

        return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="예시 지도: ' + plan.stops.length + '곳을 잇는 동선">' +
            '<defs><mask id="dc-mreveal" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '"><path class="m-draw" pathLength="1" d="' + routeD + '" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></mask></defs>' +
            bg + '<g mask="url(#dc-mreveal)">' + segs + '</g>' + labels + park + pins + scale +
            '</svg>';
    }

    function render(opts) {
        var c = current, s = c.s;
        var plan = schedule(c);
        var advice = adviceFor(s, plan);
        var region = REGIONS[s.region].name;

        var html = '';
        html += '<header class="dc-c-head">' +
            '<p class="dc-c-region">' + esc(region) + ' · 예시 코스</p>' +
            '<h3 class="dc-c-title">' + esc(titleFor(s)) + '</h3>' +
            '<p class="dc-c-sum">' + plan.stops.map(function (st) { return CAT[st.slot.cat]; }).join(' → ') + '</p>' +
            '<ul class="dc-stats">' +
            '<li><span>총 소요</span><b>' + span(plan.total) + '</b></li>' +
            '<li><span>총 도보</span><b>' + dist(plan.walked) + '</b></li>' +
            '<li><span>1인 예산</span><b>약 ' + won(plan.budget) + '</b></li>' +
            '</ul>' +
            '<p class="dc-advice ' + advice.cls + '">' + esc(advice.text) + '</p>' +
            '</header>';

        html += '<figure class="dc-map">' + mapSvg(c, plan) + '<figcaption class="dc-map-caption">' + esc(region) + ' 일대 · 예시 지도</figcaption></figure>';

        html += '<ol class="dc-stops">';
        plan.stops.forEach(function (st, i) {
            var hop = '';
            if (st.hop) {
                hop = st.hop.mode === 'drive'
                    ? '<p class="dc-hop is-drive"><span>차로 약 ' + st.hop.min + '분 · ' + dist(st.hop.m) + '</span></p>'
                    : '<p class="dc-hop"><span>도보 약 ' + st.hop.min + '분 · ' + dist(st.hop.m) + '</span></p>';
            }
            var park = parkingFor(c, plan, i);
            html += '<li class="dc-stop" style="--i:' + i + '">' + hop +
                '<div class="dc-stop-card">' +
                '<div class="dc-stop-meta"><span class="dc-time">' + hhmm(st.start) + ' – ' + hhmm(st.end) + '</span>' +
                '<span class="dc-cat">' + CAT[st.slot.cat] + '</span>' +
                '<span class="dc-io' + (st.opt.io === 'out' ? ' is-out' : '') + '">' + (st.opt.io === 'out' ? '야외' : '실내') + '</span></div>' +
                '<p class="dc-stop-name"><span class="dc-num" aria-hidden="true">' + (i + 1) + '</span>' + esc(st.opt.n) + '<span class="dc-sample">예시</span></p>' +
                '<p class="dc-stop-why"><span class="dc-pro">' + esc(st.opt.pro) + '</span><span class="dc-con">' + esc(st.opt.con) + '</span></p>' +
                '<div class="dc-opts" role="group" aria-label="' + (i + 1) + '번째 ' + CAT[st.slot.cat] + ' 옵션">' +
                st.slot.opts.map(function (op, j) {
                    return '<button type="button" class="dc-opt" data-slot="' + i + '" data-opt="' + j + '" aria-pressed="' + (j === st.j) + '"><b>' + 'ABC'.charAt(j) + '</b><span>' + esc(op.n) + '</span></button>';
                }).join('') +
                '</div>' +
                (park ? '<p class="dc-park">' + esc(park) + '</p>' : '') +
                '</div></li>';
        });
        html += '</ol>';

        courseEl.innerHTML = html;
        courseEl.classList.toggle('is-new', !!(opts && opts.animate) && !reduced);
        current.plan = plan;
        return plan;
    }

    function summary(plan) {
        return titleFor(current.s) + '. ' + plan.stops.length + '곳, 총 소요 ' + span(plan.total) + ', 총 도보 ' + dist(plan.walked) + ', 1인 예산 약 ' + won(plan.budget) + '.';
    }

    /* ---------- the loading checklist ---------- */
    var runToken = 0;

    function stepsFor(c) {
        var s = c.s, region = REGIONS[s.region].name;
        var names = c.slots.map(function (sl) { return sl.opts[0].n; });
        var act = c.slots.filter(function (sl) { return sl.cat === 'activity'; })[0];
        var list = [
            ['주변 인기 장소를 모으고 있어요', act ? "'" + region + ' ' + act.opts[0].n + "' 찾아보는 중…" : "'" + region + " 카페' 인기순으로 훑는 중…"],
            ['블로그 후기를 읽어보고 있어요', "'" + names[0] + "' 후기 읽는 중…"],
            ['날씨를 확인하고 있어요', s.sky === 'rain' ? '시간대별 강수확률 보는 중…' : '기상청 단기예보 확인하는 중…']
        ];
        if (s.move === 'car') list.push(['주차장을 찾고 있어요', '공영주차장 요금·혼잡도 확인하는 중…']);
        list.push(['동선을 계산하고 있어요', "'" + names[0] + "' → '" + names[1] + "' 이동 거리 재는 중…"]);
        list.push(['AI가 코스를 조합하고 있어요', '시간대별 옵션 A·B·C 조합하는 중…']);
        return list;
    }

    function run(full, announce) {
        var token = ++runToken;
        var s = readForm();
        current = build(s);
        picks = current.slots.map(function () { return 0; });

        if (reduced) {
            var plan0 = render({ animate: false });
            if (announce) statusEl.textContent = summary(plan0);
            return;
        }

        var steps = stepsFor(current);
        var ol = loadingEl.querySelector('.dc-loading-steps');
        loadingEl.querySelector('.dc-loading-region').textContent = REGIONS[s.region].name;
        ol.innerHTML = steps.map(function (st) { return '<li><span>' + esc(st[0]) + '</span></li>'; }).join('');
        loadingEl.hidden = false;
        courseEl.setAttribute('aria-busy', 'true');

        var items = ol.children;
        var per = full ? 380 : 150;
        var i = 0;
        (function next() {
            if (token !== runToken) return;
            if (i > 0) {
                items[i - 1].className = 'is-done';
                var small = items[i - 1].querySelector('small');
                if (small) small.remove();
            }
            if (i >= items.length) {
                window.setTimeout(function () {
                    if (token !== runToken) return;
                    loadingEl.hidden = true;
                    courseEl.removeAttribute('aria-busy');
                    var plan = render({ animate: true });
                    if (announce) statusEl.textContent = summary(plan);
                }, full ? 220 : 80);
                return;
            }
            items[i].className = 'is-now';
            items[i].insertAdjacentHTML('beforeend', '<small>' + esc(steps[i][1]) + '</small>');
            i++;
            window.setTimeout(next, per);
        })();
    }

    /* ---------- wiring ---------- */
    function syncWalkNote() {
        if (walkNote) walkNote.textContent = WALK_NOTE[form.elements.walk.value];
    }

    var touched = false;

    form.addEventListener('change', function () {
        touched = true;
        variant = 0;
        syncWalkNote();
        run(false, true);
    });

    form.addEventListener('submit', function (e) { e.preventDefault(); });

    if (runBtn) {
        runBtn.hidden = false;
        runBtn.addEventListener('click', function () {
            touched = true;
            variant = (variant + 1) % 3;
            run(false, true);
        });
    }

    courseEl.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.dc-opt');
        if (!btn || !current) return;
        var i = +btn.getAttribute('data-slot'), j = +btn.getAttribute('data-opt');
        if (picks[i] === j) return;
        touched = true;
        picks[i] = j;
        var plan = render({ animate: false });
        var again = courseEl.querySelector('.dc-opt[data-slot="' + i + '"][data-opt="' + j + '"]');
        if (again) again.focus();
        var name = current.slots[i].opts[j].n;
        statusEl.textContent = (i + 1) + '번째 장소를 ' + name + josa(name, '으로', '로') + ' 바꿨어요. 총 소요 ' + span(plan.total) + ', 총 도보 ' + dist(plan.walked) + '.';
    });

    // First paint: the course for the default conditions, drawn by the same
    // code as every later one. It assembles itself once it is on screen.
    syncWalkNote();
    current = build(readForm());
    picks = current.slots.map(function () { return 0; });
    render({ animate: false });

    if (reduced || !('IntersectionObserver' in window)) return;
    var seen = new IntersectionObserver(function (entries) {
        if (!entries.some(function (e) { return e.isIntersecting; })) return;
        seen.disconnect();
        window.setTimeout(function () { if (!touched) run(true, false); }, 250);
    }, { threshold: 0.35 });
    seen.observe(courseEl);
})();
