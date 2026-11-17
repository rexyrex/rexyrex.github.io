/* TalkScope - Chat Analyzer — /apps/line_chat_analyzer/
   Dependency-free. Three jobs:
   1. Language: the EN / 日本語 / 한국어 toggle. <head> already picked the
      language before first paint (?lang= → last choice → browser); this
      keeps the URL's ?lang= in step so the address bar is shareable.
   2. The scope: a made-up chat between Yui and Sota, analyzed in the
      page with TalkScope's own rules, ported from the Flutter app
      (lib/analysis/chat_analyzer.dart, insights.dart, word_counter.dart,
      text_features.dart): conversations split at 3 h, replies, the
      balance score, the chat type, the reply temperature gap,
      personalities and signature words. The dial stretches one
      person's replies and everything is recomputed from the messages.
   3. The chat / export-file view tabs. */
(function () {
    'use strict';

    var root = document.documentElement;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var LANGS = ['en', 'ja', 'ko'];

    /* ---------- 1. Language ------------------------------------- */

    var TITLES = {
        en: 'TalkScope - Chat Analyzer — Rexyrex',
        ja: 'トークスコープ - トーク分析 — Rexyrex',
        ko: 'TalkScope - 대화 분석 — Rexyrex'
    };
    var DESCRIPTIONS = {
        en: 'See your LINE chats in numbers: reply speed, habit words and chemistry, from a chat you export. Analyzed entirely on your phone. Free on Google Play.',
        ja: 'LINEのトーク履歴を読み込むだけで、返信の速さ、口ぐせ、相性まで数字で見える化。分析はすべてスマホの中で。Google Playで無料。',
        ko: 'LINE 대화 기록만 불러오면 답장 속도, 말버릇, 케미까지 숫자로 보여 드려요. 분석은 모두 휴대폰 안에서. Google Play에서 무료.'
    };

    function currentLang() {
        var l = root.getAttribute('data-lang');
        return LANGS.indexOf(l) >= 0 ? l : 'en';
    }

    function syncUrl(lang) {
        if (!window.history || !history.replaceState) return;
        try {
            var url = new URL(window.location.href);
            if (url.searchParams.get('lang') === lang) return;
            url.searchParams.set('lang', lang);
            history.replaceState(history.state, '', url.pathname + url.search + url.hash);
        } catch (e) { /* old browser: the toggle still works */ }
    }

    var langListeners = [];

    function applyLang(lang, opts) {
        opts = opts || {};
        root.setAttribute('lang', lang);
        root.setAttribute('data-lang', lang);
        document.title = TITLES[lang];
        var desc = document.querySelector('meta[name="description"]');
        if (desc) desc.setAttribute('content', DESCRIPTIONS[lang]);
        Array.prototype.forEach.call(document.querySelectorAll('[data-set-lang]'), function (btn) {
            btn.setAttribute('aria-pressed', String(btn.getAttribute('data-set-lang') === lang));
        });
        if (opts.remember) {
            try { localStorage.setItem('rex-lang', lang); } catch (e) { /* private mode */ }
        }
        if (opts.url !== false) syncUrl(lang);
        langListeners.forEach(function (fn) { fn(lang); });
    }

    // Only write ?lang= into the address bar when it was already there or the
    // visitor picks one; a plain visit keeps the clean URL.
    var hadParam = false;
    try { hadParam = new URLSearchParams(window.location.search).has('lang'); } catch (e) { /* noop */ }

    document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('[data-set-lang]');
        if (!btn) return;
        var lang = btn.getAttribute('data-set-lang');
        if (lang === currentLang()) return;
        applyLang(lang, { remember: true });
    });

    applyLang(currentLang(), { url: hadParam });

    /* ---------- 2. The scope ------------------------------------ */

    /* ---------- sample chat (made up for the page) ---------------------- */
    // [day, 'H:MM', who (0 Yui, 1 Sota), kind ('t' text, 's' sticker, 'p' photo), en, ja, ko]
    var Y = 0, S = 1;
    var SAMPLE = [
        // Sat 26 — Yui opens
        [0, '9:02', Y, 't', 'Good morning! Are you up?', 'おはよ！起きてる？', '좋은 아침! 일어났어?'],
        [0, '9:03', S, 't', 'Morning, just woke up', 'おはよう、いま起きた', '응 방금 일어났어'],
        [0, '9:05', Y, 't', 'A new cafe opened by the station', '駅前に新しいカフェできたの', '역 앞에 카페 새로 생겼대'],
        [0, '9:05', Y, 't', 'literally two minutes from your place', 'そうたの家から歩いて2分！', '너네 집에서 완전 가까워'],
        [0, '9:06', S, 't', 'Oh nice. Tomorrow?', 'へえ、いいね。明日行く？', '오 좋다 내일 갈까?'],
        [0, '9:08', Y, 't', 'Yes!! Their cheesecake is literally famous', '行く！！チーズケーキが最高らしい', '좋아!! 거기 치즈케이크 완전 유명해'],
        [0, '9:09', S, 't', 'Okay. 2pm?', '了解、14時でいい？', '오케이 2시 어때?'],
        [0, '9:11', Y, 't', "Perfect, I'll book a table", 'いいね、席を予約しとくね', '좋아 내가 자리 예약할게'],
        [0, '9:12', S, 's'],
        // Sat night — Sota opens
        [0, '21:34', S, 't', 'Finally done with work', 'やっと仕事おわった', '드디어 회사 끝났다'],
        [0, '21:34', S, 't', 'So tired', 'つかれた〜', '너무 피곤해'],
        [0, '21:37', Y, 't', 'Good job!! Did you eat?', 'おつかれさま！ごはん食べた？', '고생했어!! 밥은 먹었어?'],
        [0, '21:37', Y, 't', 'I made way too much curry again haha', 'またカレー作りすぎちゃった笑', '나 카레 또 너무 많이 만들었어 ㅋㅋ'],
        [0, '21:38', S, 't', 'Not yet. Send a pic', 'まだ。写真見せて', '아직 사진 보여줘'],
        [0, '21:40', Y, 'p'],
        [0, '21:41', S, 't', 'That looks so good', 'うまそう！', '와 맛있겠다'],
        [0, '21:43', Y, 't', 'Come over and eat it next time', '今度うちで食べよ', '다음에 와서 같이 먹자'],
        [0, '21:43', Y, 't', "It's literally my best dish", 'これは自信作、ほんとに最高だから', '이건 완전 자신 있어'],
        [0, '21:44', S, 't', "Okay, it's a deal", '了解、楽しみにしてる', '오케이 약속했다'],
        [0, '21:46', Y, 't', 'The cafe confirmed our table for 2pm', 'カフェ、明日の14時で予約とれたよ', '카페 내일 2시로 예약됐어'],
        [0, '21:47', S, 't', 'Thanks 👍', 'ありがとう👍', '고마워 👍'],
        [0, '21:48', Y, 't', 'Going to bed early. Goodnight 🌙', '今日は早めに寝るね、おやすみ🌙', '오늘은 일찍 잘게 잘 자 🌙'],
        [0, '21:49', S, 't', 'Night, sleep well', 'おやすみ、ゆっくり寝てね', '잘 자 푹 쉬어'],
        [0, '21:51', Y, 's'],
        // Sun 27 — Yui opens (she had the last word, so this is no reply)
        [1, '11:40', Y, 't', "Don't forget, 2pm!", '14時、忘れないでね！', '2시 잊지 마!'],
        [1, '11:41', S, 't', "I won't, I'm up already", 'わかってる、もう起きてるよ', '안 잊어 벌써 일어났어'],
        [1, '11:43', Y, 't', "Wear the blue jacket? It's getting cold", '青いジャケット着てきて？寒くなってきたし', '파란 재킷 입고 와? 날씨 추워졌어'],
        [1, '11:44', S, 't', 'Okay', '了解', '오케이'],
        [1, '11:44', S, 's'],
        // Sun evening — Sota opens
        [1, '18:12', S, 'p'],
        [1, '18:12', S, 't', 'Today was really fun', '今日ほんとに楽しかった', '오늘 진짜 재밌었다'],
        [1, '18:15', Y, 't', 'So fun!! That cheesecake was amazing', 'ほんとに！チーズケーキ最高だった', '진짜!! 치즈케이크 완전 맛있었어'],
        [1, '18:15', Y, 'p'],
        [1, '18:16', S, 't', "Best one I've ever had", '今までで一番うまかった', '인생 케이크였어'],
        [1, '18:18', Y, 't', 'Same cafe next week? I want to try their lunch', '来週も同じカフェ行かない？ランチも気になる', '다음 주에도 그 카페 갈래? 런치도 궁금해'],
        [1, '18:19', S, 't', 'Okay, sure', '了解、行こう', '오케이 좋아'],
        [1, '18:21', Y, 't', 'lol you always say okay', 'そうたっていつも「了解」だよね笑', 'ㅋㅋ 너는 맨날 오케이래'],
        [1, '18:22', S, 't', 'Okay', '了解', '오케이'],
        [1, '18:22', S, 's'],
        [1, '18:24', Y, 't', 'Thanks for today ❤️', '今日はありがとね❤️', '오늘 고마워 ❤️'],
        [1, '18:25', S, 't', 'Thank you too', 'こちらこそ、ありがとう', '나도 고마워'],
        // Mon 28 — Sota opens
        [2, '7:46', S, 't', 'The train is packed this morning', '今朝の電車ぎゅうぎゅう', '오늘 지하철 사람 너무 많아'],
        [2, '7:48', Y, 't', "Same here, it's literally a sardine can", 'こっちもすし詰め状態だよ', '나도 완전 지옥철이야'],
        [2, '7:49', S, 't', 'Big meeting at work today', '今日は仕事で大事な会議がある', '오늘 회사 큰 회의 있어'],
        [2, '7:51', Y, 't', "You'll do great! Tell me how it goes?", 'そうたなら大丈夫！どうだったか教えてね？', '넌 잘할 거야! 어땠는지 알려줘?'],
        [2, '7:52', S, 't', 'Okay', '了解', '오케이'],
        [2, '7:53', Y, 's'],
        // Mon lunch — Yui opens
        [2, '12:31', Y, 't', 'Lunch break! What are you eating?', 'お昼休み！なに食べてる？', '점심시간! 뭐 먹어?'],
        [2, '12:32', S, 't', 'A sandwich at my desk', 'デスクでサンドイッチ', '자리에서 샌드위치 먹어'],
        [2, '12:35', Y, 't', "Poor you. I'm at the cafe again haha", 'かわいそうに…わたしはまたあのカフェ笑', '불쌍해 ㅋㅋ 나는 또 그 카페 왔어'],
        [2, '12:35', Y, 't', 'Their pasta is good too', 'パスタも最高', '파스타도 완전 맛있어'],
        [2, '12:36', S, 't', "Jealous. Meeting's about to start", 'うらやましい。そろそろ会議', '부럽다 곧 회의 시작해'],
        [2, '12:37', Y, 't', 'Good luck!! 💪', 'がんばって！！💪', '화이팅!! 💪'],
        // Mon evening — Yui opens
        [2, '19:20', Y, 't', 'How was the meeting??', '会議どうだった？？', '회의 어땠어??'],
        [2, '19:21', S, 't', 'It went well actually', 'けっこううまくいった', '생각보다 잘 됐어'],
        [2, '19:21', S, 't', 'My boss liked the plan', '上司も企画をほめてくれた', '팀장님이 기획 좋대'],
        [2, '19:24', Y, 't', "Told you!! Let's celebrate", 'ほらね！！お祝いしよ', '거봐!! 축하하자'],
        [2, '19:24', Y, 't', 'Ramen tonight?', '今夜ラーメンどう？', '오늘 저녁 라멘 어때?'],
        [2, '19:25', S, 't', 'Okay. 8?', '了解、8時？', '오케이 8시?'],
        [2, '19:27', Y, 't', '8 works. The place next to the cafe?', '8時で！カフェの隣のお店ね', '8시 좋아 그 카페 옆집?'],
        [2, '19:28', S, 't', 'Yes', 'うん', '응'],
        [2, '19:29', S, 't', 'Leaving work now', 'いま仕事出た', '지금 회사 나왔어'],
        [2, '19:31', Y, 's'],
        [2, '19:31', Y, 't', 'See you soon!', 'またあとでね！', '이따 봐!']

    ];
    var NAMES = { en: ['Yui', 'Sota'], ja: ['ゆい', 'そうた'], ko: ['유이', '소타'] };
    var LANG_COL = { en: 4, ja: 5, ko: 6 };

    /* ---------- the app's analysis, ported from lib/analysis/ ---------- */
    var SESSION_GAP = 3 * 3600;      // kSessionGapSeconds
    var CHEMISTRY_WINDOW = 3600;     // kChemistryWindowSeconds
    var LOPSIDED_WINDOW = 12 * 3600; // kLopsidedWindowSeconds
    var LOPSIDED_MIN = 10;           // kLopsidedMinReplies
    var BUCKETS = [60, 300, 1800, 3600, 10800]; // kReplyBucketLimits
    var PERSONA_MIN = 30;            // kPersonaMinMessages
    var SIG_MIN_USES = 3, SIG_MIN_RATIO = 2, SIG_WORDS = 8;

    function rx(src, flags, fallback) {
        try { return new RegExp(src, flags); } catch (e) { return fallback || /(?!)/; }
    }
    var laughRe = rx("(?<![A-Za-z])[wｗＷ]{2,}(?![A-Za-z])|(?<![A-Za-z])[wｗ]$|笑|^草|草$|哈{2,}|呵呵|ㄏㄏ|(?<![A-Za-z])[Xx][Dd](?![A-Za-z])|(?<!\\d)5{3,}(?!\\d)|ฮ่า|ㅋ{2,}|ㅎ{2,}|\\b(?:lol|lmao|lmfao|rofl|haha+|hehe+|hihi+)\\b|😂|🤣|😆|😹", 'iu', /笑|ㅋ{2,}|\b(?:lol|haha+)\b/i);
    var laughReG = rx(laughRe.source, 'giu', /笑|ㅋ{2,}|\b(?:lol|haha+)\b/gi);
    var urlRe = /(?:https?:\/\/|\bwww\.(?=[A-Za-z0-9-]+\.[A-Za-z]))\S+/g;
    var emoticonRe = /\([a-z][a-z ]{1,24}\)/g;
    var emojiRe = rx('\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?)*|[\\u{1F1E6}-\\u{1F1FF}]{2}', 'gu', /[☀-➿]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F\uDE80-\uDEFF]|\uD83E[\uDD00-\uDDFF]/g);

    function hasLaugh(s) { return laughRe.test(s); }
    function isQuestion(s) { return s.indexOf('?') >= 0 || s.indexOf('？') >= 0; }
    function wordText(text) {
        return text.replace(urlRe, ' ').replace(emoticonRe, ' ').replace(emojiRe, ' ').replace(laughReG, ' ');
    }
    function runes(s) { return Array.from(s).length; }

    // keepWord + stop lists (word_counter.dart)
    var STOP = new Set(('から まで けど けれど って ので のに です ます でし まし ませ ない たい てる てた という こと もの よう ため これ それ あれ この その あの する した して しよ しょ いる いた ある あっ なる なっ やっ られ れる だっ でしょ だろ じゃ ちゃ かな かも よね だよ だね だけ しか とか なんか ところ ここ そこ どこ では には とは でも まあ もう まだ ちょっと また みたい くらい ぐらい なく なら たら だら なきゃ よっ てい ってる おく 私 僕 俺 わたし あたし ぼく おれ あなた きみ ' +
        '그리고 그래서 근데 그런데 하지만 그럼 나는 너는 내가 네가 우리 이거 그거 저거 이제 많이 정말 있어 없어 했어 하는 해서 하고 ' +
        "the a an and or to of in on at is are was were be i you he she it we they me my your our that this for with have has had do did does not so but just i'm it's im its if as from by am will can u ur what there then than too very all about up out get got him her them don't dont yeah oh").split(' '));
    var hasLetter = rx('\\p{L}', 'u', /[A-Za-z぀-ヿ一-鿿가-힯]/);
    var jamoOnly = /^[ㄱ-ㆎ]+$/;
    function keepWord(t) {
        var r = Array.from(t);
        if (r.length < 2) return false;
        if (!hasLetter.test(t)) return false;
        if (/^[\d０-９]+$/.test(t)) return false;
        var allHira = r.every(function (c) { var p = c.codePointAt(0); return p >= 0x3041 && p <= 0x309F; });
        if (allHira && r.length < 3 && t !== 'うん' && t !== 'いい' && t !== 'すき') return false;
        return !STOP.has(t);
    }
    function normalize(w) {
        var s = '';
        Array.from(w.trim()).forEach(function (c) {
            var p = c.codePointAt(0);
            s += p >= 0xFF21 && p <= 0xFF5A ? String.fromCharCode(p - 0xFEE0) : c;
        });
        return /^[A-Za-z]/.test(s) ? s.toLowerCase() : s;
    }

    // Android tokenizes with ICU's BreakIterator; Intl.Segmenter is ICU too.
    // Without it, the app's own script-run splitter (DartTokenCounter).
    var segmenters = {};
    function tokens(text, lang) {
        var out = [];
        if (typeof Intl !== 'undefined' && Intl.Segmenter) {
            var seg = segmenters[lang] || (segmenters[lang] = new Intl.Segmenter(lang, { granularity: 'word' }));
            for (var it = seg.segment(text)[Symbol.iterator](), s = it.next(); !s.done; s = it.next()) {
                if (s.value.isWordLike) out.push(s.value.segment);
            }
            return out;
        }
        var buf = '', cls = null;
        function classOf(p) {
            if ((p >= 0x30 && p <= 0x39) || (p >= 0x41 && p <= 0x5A) || (p >= 0x61 && p <= 0x7A) || p === 0x27) return 1;
            if (p >= 0x3041 && p <= 0x309F) return 3;
            if ((p >= 0x30A0 && p <= 0x30FF)) return 4;
            if ((p >= 0x4E00 && p <= 0x9FFF) || (p >= 0x3005 && p <= 0x3007)) return 2;
            if (p >= 0xAC00 && p <= 0xD7AF) return 5;
            if (p <= 0x40 || (p >= 0x5B && p <= 0x60) || (p >= 0x7B && p <= 0xBF) || (p >= 0x2000 && p <= 0x2BFF) || (p >= 0x3000 && p <= 0x303F) || (p >= 0xFF00 && p <= 0xFF65)) return 0;
            return 7;
        }
        function flush() {
            if (!buf) return;
            if (!(cls === 3 && Array.from(buf).length < 3)) out.push(buf);
            buf = '';
        }
        Array.from(text).forEach(function (ch) {
            var c = classOf(ch.codePointAt(0));
            if (c === 0) { flush(); cls = null; return; }
            if (cls !== null && c !== cls) flush();
            cls = c;
            buf += ch;
        });
        flush();
        return out;
    }

    /* Messages for one language at a reply-speed setting. stretch = [yuiFactor,
       sotaFactor]: each reply by that person (a message answering the other
       one inside a conversation) takes that many times longer; a same-minute
       reply counts as 30 s, as the app's balance score does. Each conversation
       keeps its original start unless the stretched one before runs into it. */
    var BASE_DAY = Date.UTC(2026, 8, 26) / 60000; // Sat 26 Sep 2026, in minutes
    function messages(lang, stretch) {
        var col = LANG_COL[lang];
        var out = [];
        var prevOrig = null, prevNew = null, prevWho = null;
        SAMPLE.forEach(function (row) {
            var hm = row[1].split(':');
            var orig = BASE_DAY + row[0] * 1440 + (+hm[0]) * 60 + (+hm[1]);
            var t;
            if (prevOrig === null) {
                t = orig;
            } else {
                var gap = orig - prevOrig;
                var f = stretch[row[2]];
                if (gap * 60 >= SESSION_GAP) {
                    t = Math.max(orig, prevNew + 1);
                } else if (row[2] !== prevWho && f !== 1) {
                    t = prevNew + Math.round(Math.max(gap * 60, 30) * f / 60);
                } else {
                    t = prevNew + gap;
                }
            }
            out.push({ t: t, who: row[2], kind: row[3], text: row[3] === 't' ? row[col] : '' });
            prevOrig = orig;
            prevNew = t;
            prevWho = row[2];
        });
        return out;
    }

    function acc() { return { count: 0, sum: 0 }; }
    function mean(a) { return a.count === 0 ? 0 : Math.round(a.sum / a.count); }

    function analyze(msgs, lang) {
        var n = 2;
        var m = [0, 1].map(function () {
            return { messages: 0, texts: 0, chars: 0, starts: 0, ends: 0, replies: [], buckets: [0, 0, 0, 0, 0], laughs: 0, stickers: 0, photos: 0, questions: 0, night: 0, words: {} };
        });
        var near = {}, far = {};
        var total = 0, sessions = 0;
        var prevSender = null, prevTime = null;
        msgs.forEach(function (msg) {
            var s = m[msg.who];
            s.messages++;
            total++;
            var hour = new Date(msg.t * 60000).getUTCHours();
            if (hour < 5) s.night++;
            var gap = prevTime === null ? Infinity : (msg.t - prevTime) * 60;
            var newConv = gap < 0 || gap >= SESSION_GAP;
            msg.mark = null;
            if (newConv) {
                s.starts++;
                sessions++;
                msg.mark = 'start';
                if (prevSender !== null) m[prevSender].ends++;
            } else if (prevSender !== null && prevSender !== msg.who) {
                s.replies.push(gap);
                msg.mark = 'reply';
                msg.gap = gap;
            }
            if (prevSender !== null && prevSender !== msg.who && gap >= 0 && gap <= LOPSIDED_WINDOW) {
                var key = msg.who * n + prevSender;
                (far[key] = far[key] || acc());
                far[key].count++; far[key].sum += gap;
                if (gap <= CHEMISTRY_WINDOW) { (near[key] = near[key] || acc()); near[key].count++; near[key].sum += gap; }
            }
            prevSender = msg.who;
            prevTime = msg.t;
            if (msg.kind === 't') {
                s.texts++;
                s.chars += runes(msg.text);
                var noUrl = msg.text.replace(urlRe, ' ');
                if (isQuestion(noUrl)) s.questions++;
                if (hasLaugh(noUrl)) s.laughs++;
                tokens(wordText(msg.text), lang).forEach(function (raw) {
                    var w = normalize(raw);
                    if (!keepWord(w)) return;
                    s.words[w] = (s.words[w] || 0) + 1;
                });
            } else if (msg.kind === 's') {
                s.stickers++;
            } else {
                s.photos++;
            }
        });
        if (prevSender !== null) m[prevSender].ends++;
        m.forEach(function (s) {
            s.replyCount = s.replies.length;
            s.replyAvg = s.replyCount ? Math.trunc(s.replies.reduce(function (a, b) { return a + b; }, 0) / s.replyCount) : 0;
            s.replies.forEach(function (sec) {
                for (var b = 0; b < BUCKETS.length; b++) if (sec <= BUCKETS[b]) { s.buckets[b]++; break; }
            });
            s.avgChars = s.texts ? s.chars / s.texts : 0;
        });
        var r = { members: m, total: total, sessions: sessions };
        r.balance = balance(m);
        r.type = talkType(r);
        r.personas = personas(m);
        r.lopsided = lopsided(far);
        r.signatures = signatures(m);
        return r;
    }

    // _scoreBalance, the 1:1 branch
    function balance(m) {
        var a = m[0], b = m[1];
        if (a.messages + b.messages === 0) return 0;
        function even(x, y) { return x + y === 0 ? 1 : 1 - Math.abs(x / (x + y) - 0.5) * 2; }
        var parts = [even(a.messages, b.messages), even(a.chars, b.chars), even(a.starts, b.starts), even(a.replyCount, b.replyCount)];
        if (a.replyCount >= 5 && b.replyCount >= 5) {
            var fa = Math.max(a.replyAvg, 30), fb = Math.max(b.replyAvg, 30);
            parts.push(Math.min(fa, fb) / Math.max(fa, fb));
        }
        var sum = parts.reduce(function (x, y) { return x + y; }, 0);
        return Math.max(0, Math.min(100, Math.round(100 * sum / parts.length)));
    }

    // _pickTalkType, the 1:1 branch (no calls in the sample)
    function talkType(r) {
        var m = r.members, a = m[0], b = m[1], total = r.total;
        var texts = a.texts + b.texts, laughs = a.laughs + b.laughs, stickers = a.stickers + b.stickers, night = a.night + b.night;
        var share = a.messages / total;
        var startShare = a.starts + b.starts === 0 ? 0.5 : a.starts / (a.starts + b.starts);
        if (r.balance >= 80 && a.replyAvg <= 600 && b.replyAvg <= 600 && a.replyCount >= 10 && b.replyCount >= 10) return { key: 'perfectSync' };
        if ((share >= 0.62 && startShare >= 0.6) || (share <= 0.38 && startShare <= 0.4)) return { key: 'chaser', who: share >= 0.5 ? 0 : 1 };
        if (night >= total * 0.2) return { key: 'nightOwls' };
        if (texts > 0 && laughs >= texts * 0.15) return { key: 'highTension' };
        if (stickers >= total * 0.15) return { key: 'stickerLovers' };
        if (a.replyAvg > 45 * 60 && b.replyAvg > 45 * 60) return { key: 'slowSteady' };
        return { key: 'casual' };
    }

    function median(v) {
        var s = v.slice().sort(function (x, y) { return x - y; });
        var mid = s.length >> 1;
        return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }
    // personas() in insights.dart
    function personas(m) {
        var who = [0, 1].filter(function (i) { return m[i].messages >= PERSONA_MIN; })
            .sort(function (x, y) { return m[y].messages - m[x].messages; });
        if (who.length < 2) return [];
        function rate(i) { return m[i].starts / m[i].messages; }
        var startMedian = median(who.map(rate));
        var lengthMedian = median(who.map(function (i) { return m[i].avgChars; }));
        var timed = who.filter(function (i) { return m[i].replyCount >= 5; }).sort(function (x, y) {
            return m[x].replyAvg !== m[y].replyAvg ? m[x].replyAvg - m[y].replyAvg : m[y].replyCount - m[x].replyCount;
        });
        var fast = timed.slice(0, timed.length >> 1);
        return who.map(function (i) {
            var p = { who: i, starter: rate(i) > startMedian, fast: fast.indexOf(i) >= 0, long: m[i].avgChars > lengthMedian };
            p.type = p.starter ? (p.fast ? (p.long ? 'retriever' : 'sparrow') : (p.long ? 'bear' : 'cat'))
                : (p.fast ? (p.long ? 'parrot' : 'hamster') : (p.long ? 'owl' : 'sloth'));
            return p;
        });
    }

    // _lopsided: x replied to y is key x*n+y
    function lopsided(far) {
        var xy = far[0 * 2 + 1], yx = far[1 * 2 + 0];
        if (!xy || !yx || xy.count < LOPSIDED_MIN || yx.count < LOPSIDED_MIN) return null;
        var p = mean(xy) <= mean(yx)
            ? { fast: 0, slow: 1, fastAvg: mean(xy), slowAvg: mean(yx) }
            : { fast: 1, slow: 0, fastAvg: mean(yx), slowAvg: mean(xy) };
        p.ratio = p.slowAvg / Math.max(p.fastAvg, 30);
        if (p.ratio < 2 || p.slowAvg - p.fastAvg < 300) return null;
        return p;
    }

    // WordCounter._signatures
    function signatures(m) {
        var overall = {};
        m.forEach(function (s) { Object.keys(s.words).forEach(function (w) { overall[w] = (overall[w] || 0) + s.words[w]; }); });
        function sum(o) { return Object.keys(o).reduce(function (a, k) { return a + o[k]; }, 0); }
        var groupTotal = sum(overall);
        return m.map(function (s) {
            var personTotal = sum(s.words), othersTotal = groupTotal - personTotal;
            if (personTotal === 0 || othersTotal <= 0) return [];
            var kept = [];
            Object.keys(s.words).forEach(function (w) {
                var uses = s.words[w];
                if (uses < SIG_MIN_USES || jamoOnly.test(w)) return;
                var others = (overall[w] || uses) - uses;
                var ratio = (uses / personTotal) / ((others + 1) / (othersTotal + 1));
                if (ratio >= SIG_MIN_RATIO) kept.push([w, uses, ratio]);
            });
            kept.sort(function (a, b) { return b[2] !== a[2] ? b[2] - a[2] : (b[1] !== a[1] ? b[1] - a[1] : (a[0] < b[0] ? -1 : 1)); });
            return kept.slice(0, SIG_WORDS);
        });
    }

    /* ---------- strings (the app's own, from lib/l10n/app_*.arb) ---------- */

    var T = {
        en: {
            typeLabel: 'Chat type', balance: 'Balance',
            types: {
                perfectSync: ['In-sync pair', 'Even volume and fast replies on both sides — a conversation that flows.'],
                chaser: ['{name} does the chasing', '{name} sends more messages and starts most conversations.'],
                nightOwls: ['Night owls', 'Over 20% of messages are sent between midnight and 5 a.m.'],
                highTension: ['High energy', 'Lots of laughter in your messages — always having fun.'],
                stickerLovers: ['Sticker talkers', 'Stickers do a lot of the talking.'],
                slowSteady: ['Slow and steady', 'Unhurried replies on both sides, but the chat keeps going.'],
                casual: ['Easygoing', 'A natural, balanced pace with no extremes.']
            },
            share: 'Share of messages',
            convos: function (n, a, b, N) { return n + ' conversations: ' + N[0] + ' started ' + a + ', ' + N[1] + ' ' + b + '.'; },
            dist: 'Reply speed distribution',
            buckets: ['≤ 1 min', '≤ 5 min', '≤ 30 min', '≤ 1 hour', '≤ 3 hours'],
            avg: 'avg {time}',
            gapTitle: 'Reply temperature gap',
            gapHelp: 'Pairs where one side answers far faster than the other (average reply time, counting replies within 12 hours).',
            gapRow: '{fast} → {slow}: avg {fastTime}. {slow} → {fast}: avg {slowTime}.',
            gapRatio: '{ratio}× faster',
            gapNone: 'No big gaps: everyone answers each other at a similar pace.',
            personaTitle: 'Chat personalities',
            personaHelp: 'Who starts conversations more, who is in the faster half at replying, who writes longer.',
            personas: {
                retriever: ['🐕', 'Eager retriever'], sparrow: ['⚡', 'Speedy sparrow'], bear: ['🐻', 'Romantic bear'], cat: ['😎', 'Cool cat'],
                parrot: ['🦜', 'Reaction pro'], hamster: ['🐹', 'Shy hamster'], owl: ['🦉', 'Thoughtful owl'], sloth: ['🦥', 'Laid-back sloth']
            },
            traits: ['Starter', 'Responder', 'Fast', 'Unhurried', 'Long', 'Short'],
            sigTitle: 'Signature words',
            sigHelp: 'Words someone uses far more often than everyone else.',
            sigNone: 'None stand out',
            times: '×{n}',
            dur: function (s) { return dur(s, '{s} sec', '{m} min', '{h}h {m}m'); },
            start: '✦ new conversation',
            reply: '↩ {time}',
            media: { s: 'Sticker', p: 'Photo' },
            file: {
                head: '[LINE] Chat history with {other}',
                saved: 'Saved on: {date}',
                media: { s: '[Sticker]', p: '[Photo]' },
                day: function (d) { return ymd(d, '/') + '(' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ')'; },
                time: hm24,
                stamp: function (d) { return ymd(d, '/') + ' ' + hm24(d); }
            },
            dialEven: 'As written',
            dialSlow: '{name} replies {n}× slower',
            status: 'Chat type: {type}. Balance {balance}.'
        },
        ja: {
            typeLabel: 'トークタイプ', balance: 'バランス度',
            types: {
                perfectSync: ['ぴったりシンクロ型', '量も返信の速さもほぼ互角。テンポよく続く、息の合ったトークです。'],
                chaser: ['{name}が追いかけ型', '{name}のメッセージと話しかけが多め。相手の返信を待つ時間が長いかも。'],
                nightOwls: ['夜ふかしトーク型', '0〜5時のメッセージが2割以上。深夜に盛り上がるトークです。'],
                highTension: ['ハイテンション型', '笑いの入ったメッセージがたくさん。いつも楽しそう！'],
                stickerLovers: ['スタンプで会話型', 'スタンプが多め。言葉よりスタンプで伝わる仲。'],
                slowSteady: ['のんびりマイペース型', '返信はゆっくりめ。でも長く続く、自然体の関係です。'],
                casual: ['ほどよい距離感型', '特に偏りのない、自然なペースのトークです。']
            },
            share: 'メッセージの割合',
            convos: function (n, a, b, N) { return '会話は' + n + '回。' + N[0] + 'が' + a + '回、' + N[1] + 'が' + b + '回話しかけました。'; },
            dist: '返信スピードの分布',
            buckets: ['1分以内', '5分以内', '30分以内', '1時間以内', '3時間以内'],
            avg: '平均{time}',
            gapTitle: '返信の温度差',
            gapHelp: '片方だけ返信がずっと速いペアです（12時間以内の返信の平均時間）。',
            gapRow: '{fast}→{slow}は平均{fastTime}、{slow}→{fast}は平均{slowTime}。',
            gapRatio: '{ratio}倍速い',
            gapNone: '大きな温度差はありません。みんな同じくらいのペースで返信しています。',
            personaTitle: 'トーク性格診断',
            personaHelp: '会話を始めることが多いか、返信の速さが上位半分か、メッセージが長いか。',
            personas: {
                retriever: ['🐕', '熱血レトリバー'], sparrow: ['⚡', 'スピードすずめ'], bear: ['🐻', 'ロマンチックくま'], cat: ['😎', 'クールなねこ'],
                parrot: ['🦜', 'リアクション職人'], hamster: ['🐹', 'ツンデレハムスター'], owl: ['🦉', '慎重なふくろう'], sloth: ['🦥', 'のんびりナマケモノ']
            },
            traits: ['話しかける', '受け身', '即レス', 'マイペース', '長文', '短文'],
            sigTitle: '口ぐせワード',
            sigHelp: 'ほかの人よりずっとよく使う言葉です。',
            sigNone: '目立つ言葉はありません',
            times: '{n}回',
            dur: function (s) { return dur(s, '{s}秒', '{m}分', '{h}時間{m}分'); },
            start: '✦ 会話のはじまり',
            reply: '↩ {time}',
            media: { s: 'スタンプ', p: '写真' },
            file: {
                head: '[LINE] {other}とのトーク履歴',
                saved: '保存日時：{date}',
                media: { s: '[スタンプ]', p: '[写真]' },
                day: function (d) { return ymd(d, '/') + '(' + '日月火水木金土'.charAt(d.getUTCDay()) + ')'; },
                time: hm24,
                stamp: function (d) { return ymd(d, '/') + ' ' + hm24(d); }
            },
            dialEven: 'そのまま',
            dialSlow: '{name}の返信が{n}倍遅い',
            status: 'トークタイプ：{type}。バランス度{balance}。'
        },
        ko: {
            typeLabel: '대화 유형', balance: '밸런스',
            types: {
                perfectSync: ['찰떡 싱크형', '메시지 양도 답장 속도도 막상막하. 술술 이어지는 대화예요.'],
                chaser: ['{name} 직진형', '{name} 님이 메시지를 더 많이 보내고, 대화도 주로 먼저 시작해요.'],
                nightOwls: ['올빼미형', '메시지의 20% 이상을 자정부터 새벽 5시 사이에 보내요.'],
                highTension: ['텐션 폭발형', '웃음이 가득한 대화. 늘 즐거워 보여요!'],
                stickerLovers: ['스티커 대화형', '말보다 스티커가 더 많은 걸 전해요.'],
                slowSteady: ['느긋한 마이웨이형', '서로 답장은 느긋하지만, 대화는 꾸준히 이어져요.'],
                casual: ['적당한 거리형', '한쪽으로 치우치지 않은 자연스러운 페이스예요.']
            },
            share: '메시지 비율',
            convos: function (n, a, b, N) { return '대화 ' + n + '번 중 ' + N[0] + '가 ' + a + '번, ' + N[1] + '가 ' + b + '번 먼저 말을 걸었어요.'; },
            dist: '답장 속도 분포',
            buckets: ['1분 이내', '5분 이내', '30분 이내', '1시간 이내', '3시간 이내'],
            avg: '평균 {time}',
            gapTitle: '짝사랑 지수',
            gapHelp: '한쪽만 훨씬 빨리 답하는 두 사람이에요 (12시간 안의 답장 평균 시간).',
            gapRow: '{fast} → {slow} 평균 {fastTime}, {slow} → {fast} 평균 {slowTime}',
            gapRatio: '{ratio}배 빠름',
            gapNone: '큰 온도 차는 없어요. 모두 비슷한 속도로 답하고 있어요.',
            personaTitle: '채팅 유형 테스트',
            personaHelp: '대화를 자주 시작하는지, 답장 속도가 빠른 절반에 드는지, 메시지가 긴지로 정해져요.',
            personas: {
                retriever: ['🐕', '열정 리트리버'], sparrow: ['⚡', '스피드 참새'], bear: ['🐻', '낭만 곰돌이'], cat: ['😎', '쿨한 고양이'],
                parrot: ['🦜', '리액션 장인'], hamster: ['🐹', '츤데레 햄스터'], owl: ['🦉', '신중한 부엉이'], sloth: ['🦥', '여유만만 나무늘보']
            },
            traits: ['선톡', '기다림', '칼답', '느긋', '장문', '단문'],
            sigTitle: '시그니처 단어',
            sigHelp: '유독 그 사람만 자주 쓰는 단어예요.',
            sigNone: '눈에 띄는 단어가 없어요',
            times: '{n}번',
            dur: function (s) { return dur(s, '{s}초', '{m}분', '{h}시간 {m}분'); },
            start: '✦ 대화 시작',
            reply: '↩ {time}',
            media: { s: '스티커', p: '사진' },
            file: {
                head: '[LINE] {other}님과의 대화 내용',
                saved: '저장일시: {date}',
                media: { s: '[스티커]', p: '[사진]' },
                day: function (d) { return d.getUTCFullYear() + '. ' + (d.getUTCMonth() + 1) + '. ' + d.getUTCDate() + '. (' + '일월화수목금토'.charAt(d.getUTCDay()) + ')'; },
                time: function (d) { var h = d.getUTCHours(); return (h < 12 ? '오전 ' : '오후 ') + ((h % 12) || 12) + ':' + pad(d.getUTCMinutes()); },
                stamp: function (d) { return d.getUTCFullYear() + '. ' + (d.getUTCMonth() + 1) + '. ' + d.getUTCDate() + '. ' + hm24(d); }
            },
            dialEven: '원래대로',
            dialSlow: '{name}의 답장이 {n}배 느림',
            status: '대화 유형: {type}. 밸런스 {balance}.'
        }
    };

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function hm24(d) { return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
    function ymd(d, sep) { return d.getUTCFullYear() + sep + pad(d.getUTCMonth() + 1) + sep + pad(d.getUTCDate()); }
    // Fmt.duration in lib/ui/format.dart
    function dur(sec, s, m, hm) {
        if (sec <= 0) return m.replace('{m}', '0');
        if (sec < 60) return s.replace('{s}', String(sec));
        var h = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60);
        return h > 0 ? hm.replace('{h}', String(h)).replace('{m}', String(mm)) : m.replace('{m}', String(mm));
    }
    function fill(s, o) { return s.replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ''; }); }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function dec(v) { return (Math.round(v * 10) / 10).toFixed(1); }
    var WHO = ['yui', 'sota'];

    var dayFmt = {}, timeFmt = {};
    function dayLabel(lang, d) {
        try {
            dayFmt[lang] = dayFmt[lang] || new Intl.DateTimeFormat(lang, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
            return dayFmt[lang].format(d);
        } catch (e) { return ymd(d, '/'); }
    }
    function timeLabel(lang, d) {
        try {
            timeFmt[lang] = timeFmt[lang] || new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
            return timeFmt[lang].format(d);
        } catch (e) { return hm24(d); }
    }

    /* ---------- rendering ---------- */

    function renderChat(lang, msgs, stretch) {
        var t = T[lang], names = NAMES[lang];
        var out = '', lastDay = null, prevWho = null;
        msgs.forEach(function (m) {
            var d = new Date(m.t * 60000);
            var day = ymd(d, '-');
            if (day !== lastDay) {
                out += '<li class="ts-day">' + esc(dayLabel(lang, d)) + '</li>';
                lastDay = day;
                prevWho = null;
            }
            var first = m.who !== prevWho;
            var me = m.who === 0; // Yui exported the chat, so she is "me"
            var cls = 'ts-msg ' + (me ? 'is-me' : 'is-other') + (first ? ' is-first' : '');
            var body = m.kind === 't'
                ? '<span class="ts-bubble">' + esc(m.text) + '</span>'
                : '<span class="ts-bubble is-media">' + (m.kind === 's' ? '◉ ' : '▣ ') + esc(t.media[m.kind]) + '</span>';
            var tag = '';
            if (m.mark === 'start') {
                tag = '<span class="ts-mark-tag is-start">' + esc(t.start) + '</span>';
            } else if (m.mark === 'reply') {
                tag = '<span class="ts-mark-tag is-reply is-' + WHO[m.who] + (stretch[m.who] > 1 ? ' is-slow' : '') + '">' +
                    esc(fill(t.reply, { time: t.dur(m.gap) })) + '</span>';
            }
            out += '<li class="' + cls + '">' +
                (me ? '' : '<span class="ts-ava" aria-hidden="true">' + esc(names[1].charAt(0)) + '</span>' + (first ? '<span class="ts-who">' + esc(names[1]) + '</span>' : '')) +
                '<span class="ts-line">' + body + '<time class="ts-time" datetime="' + d.toISOString().slice(0, 16) + 'Z">' + esc(timeLabel(lang, d)) + '</time></span>' +
                tag + '</li>';
            prevWho = m.who;
        });
        return out;
    }

    function renderFile(lang, msgs) {
        var f = T[lang].file, names = NAMES[lang];
        var last = new Date((msgs[msgs.length - 1].t + 12) * 60000);
        var lines = [
            '<span class="h">' + esc(fill(f.head, { other: names[1] })) + '</span>',
            '<span class="h">' + esc(fill(f.saved, { date: f.stamp(last) })) + '</span>',
            ''
        ];
        var lastDay = null;
        msgs.forEach(function (m) {
            var d = new Date(m.t * 60000);
            var day = ymd(d, '-');
            if (day !== lastDay) {
                lines.push('<span class="d">' + esc(f.day(d)) + '</span>');
                lastDay = day;
            }
            lines.push('<span class="t">' + esc(f.time(d)) + '</span>\t<span class="n-' + WHO[m.who] + '">' + esc(names[m.who]) + '</span>\t' +
                esc(m.kind === 't' ? m.text : f.media[m.kind]));
        });
        return lines.join('\n');
    }

    function card(key, cls, html) {
        return '<div class="ts-card' + (cls ? ' ' + cls : '') + '" data-card="' + key + '">' + html + '</div>';
    }

    function renderReadout(lang, r) {
        var t = T[lang], N = NAMES[lang], m = r.members;
        var cards = {};
        var ty = t.types[r.type.key] || t.types.casual;
        var who = r.type.who != null ? N[r.type.who] : '';
        var C = 2 * Math.PI * 42;
        cards.type = card('type', 'is-wide ts-type',
            '<div><p class="ts-k">' + esc(t.typeLabel) + '</p><h3>' + esc(fill(ty[0], { name: who })) + '</h3><p>' + esc(fill(ty[1], { name: who })) + '</p></div>' +
            '<div class="ts-ring" role="img" aria-label="' + esc(t.balance + ' ' + r.balance + ' / 100') + '"><svg viewBox="0 0 100 100" aria-hidden="true">' +
            '<circle class="trk" cx="50" cy="50" r="42"></circle><circle class="val" cx="50" cy="50" r="42" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - r.balance / 100)).toFixed(1) + '"></circle></svg>' +
            '<b aria-hidden="true">' + r.balance + '<small>' + esc(t.balance) + '</small></b></div>');

        var pa = r.total ? Math.round(100 * m[0].messages / r.total) : 50;
        cards.share = card('share', '',
            '<h3>' + esc(t.share) + '</h3>' +
            '<div class="ts-share" aria-hidden="true"><i class="is-yui" style="flex-basis:' + pa + '%"></i><i class="is-sota" style="flex-basis:' + (100 - pa) + '%"></i></div>' +
            '<p class="ts-legend2"><span class="is-yui">' + esc(N[0]) + ' <em>' + pa + '%</em></span><span class="is-sota">' + esc(N[1]) + ' <em>' + (100 - pa) + '%</em></span></p>' +
            '<p class="ts-sub">' + esc(t.convos(r.sessions, m[0].starts, m[1].starts, N)) + '</p>');

        var g = r.lopsided;
        var gap;
        if (g) {
            var max = Math.max(g.slowAvg, 1);
            var bar = function (i, avg) {
                return '<div class="ts-gap-bar is-' + WHO[i] + '"><span>' + esc(N[i]) + '</span><span class="ts-bar"><i style="width:' + Math.max(2, Math.round(100 * avg / max)) + '%"></i></span><em>' + esc(t.dur(avg)) + '</em></div>';
            };
            gap = '<div class="ts-gap-bars">' + bar(g.fast, g.fastAvg) + bar(g.slow, g.slowAvg) + '</div>' +
                '<span class="ts-ratio">' + esc(fill(t.gapRatio, { ratio: dec(g.ratio) })) + '</span>' +
                '<p class="ts-gap-row">' + esc(fill(t.gapRow, { fast: N[g.fast], slow: N[g.slow], fastTime: t.dur(g.fastAvg), slowTime: t.dur(g.slowAvg) })) + '</p>';
        } else {
            gap = '<p class="ts-gap-none">' + esc(t.gapNone) + '</p>';
        }
        cards.gap = card('gap', '', '<h3>' + esc(t.gapTitle) + '</h3><p class="ts-help">' + esc(t.gapHelp) + '</p>' + gap);

        var dist = '';
        [0, 1].forEach(function (i) {
            var s = m[i], within = 0, rows = '';
            t.buckets.forEach(function (label, b) {
                within += s.buckets[b];
                var frac = s.replyCount ? within / s.replyCount : 0;
                rows += '<div class="ts-row"><span>' + esc(label) + '</span><span class="ts-bar"><i style="width:' + Math.round(frac * 100) + '%"></i></span><span>' + Math.round(frac * 100) + '%</span></div>';
            });
            dist += '<div class="is-' + WHO[i] + '"><div class="ts-dist-who"><b>' + esc(N[i]) + '</b><span>' + esc(fill(t.avg, { time: t.dur(s.replyAvg) })) + '</span></div>' + rows + '</div>';
        });
        cards.dist = card('dist', 'is-wide', '<h3>' + esc(t.dist) + '</h3><div class="ts-dist">' + dist + '</div>');

        var ps = r.personas.slice().sort(function (a, b) { return a.who - b.who; });
        cards.persona = card('persona', '',
            '<h3>' + esc(t.personaTitle) + '</h3><p class="ts-help">' + esc(t.personaHelp) + '</p><div class="ts-personas">' +
            ps.map(function (p) {
                var info = t.personas[p.type];
                var traits = [p.starter ? t.traits[0] : t.traits[1], p.fast ? t.traits[2] : t.traits[3], p.long ? t.traits[4] : t.traits[5]].join(' · ');
                return '<div class="ts-persona is-' + WHO[p.who] + '"><span class="ts-emo" aria-hidden="true">' + info[0] + '</span><div><small>' + esc(N[p.who]) + '</small><b>' + esc(info[1]) + '</b><span>' + esc(traits) + '</span></div></div>';
            }).join('') + '</div>');

        cards.sig = card('sig', '',
            '<h3>' + esc(t.sigTitle) + '</h3><p class="ts-help">' + esc(t.sigHelp) + '</p><div class="ts-sig">' +
            [0, 1].map(function (i) {
                var words = r.signatures[i].slice(0, 3);
                return '<div class="is-' + WHO[i] + '"><p class="ts-sig-who">' + esc(N[i]) + '</p>' +
                    (words.length
                        ? '<ul class="ts-words">' + words.map(function (w) { return '<li>' + esc(w[0]) + '<small>' + esc(fill(t.times, { n: w[1] })) + '</small></li>'; }).join('') + '</ul>'
                        : '<p class="ts-help">' + esc(t.sigNone) + '</p>') + '</div>';
            }).join('') + '</div>');

        return cards;
    }

    var ORDER = ['type', 'share', 'gap', 'dist', 'persona', 'sig'];

    // Patch a live subtree to match a freshly built one, so bars and the
    // ring transition instead of being replaced (and scroll positions stay).
    function morph(a, b) {
        if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) {
            a.parentNode.replaceChild(b.cloneNode(true), a);
            return;
        }
        if (a.nodeType === 3) {
            if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
            return;
        }
        if (a.nodeType !== 1) return;
        var i;
        for (i = a.attributes.length - 1; i >= 0; i--) {
            var n = a.attributes[i].name;
            if (!b.hasAttribute(n)) a.removeAttribute(n);
        }
        for (i = 0; i < b.attributes.length; i++) {
            var at = b.attributes[i];
            if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
        }
        var ac = a.childNodes, bc = b.childNodes;
        while (ac.length > bc.length) a.removeChild(a.lastChild);
        for (i = 0; i < bc.length; i++) {
            if (i >= ac.length) a.appendChild(bc[i].cloneNode(true));
            else morph(ac[i], bc[i]);
        }
    }

    function patch(el, html) {
        var tpl = document.createElement(el.nodeName === 'PRE' ? 'pre' : el.nodeName === 'OL' ? 'ol' : 'div');
        tpl.innerHTML = html;
        var ac = el.childNodes, bc = tpl.childNodes, i;
        while (ac.length > bc.length) el.removeChild(el.lastChild);
        for (i = 0; i < bc.length; i++) {
            if (i >= ac.length) el.appendChild(bc[i].cloneNode(true));
            else morph(ac[i], bc[i]);
        }
    }

    var bench = document.querySelector('.ts-bench');
    if (!bench) return;
    var state = { v: 0 };
    var last = {};

    function stretchOf(v) {
        var f = Math.pow(2, Math.abs(v));
        return v < 0 ? [f, 1] : v > 0 ? [1, f] : [1, 1];
    }

    var results = {};

    function run(initial) {
        var stretch = stretchOf(state.v);
        LANGS.forEach(function (lang) {
            var msgs = messages(lang, stretch);
            var r = analyze(msgs, lang);
            results[lang] = r;
            var chat = bench.querySelector('[data-chat="' + lang + '"]');
            var file = bench.querySelector('[data-file="' + lang + '"]');
            var out = bench.querySelector('[data-readout="' + lang + '"]');
            // The page ships with this first state baked in (for visitors
            // without JS), so the first run simply replaces it.
            var put = initial ? function (el, html) { el.innerHTML = html; } : patch;
            if (chat) put(chat, renderChat(lang, msgs, stretch));
            if (file) put(file, renderFile(lang, msgs));
            if (!out) return;
            var cards = renderReadout(lang, r);
            var prev = last[lang] || {};
            var html = ORDER.map(function (k) { return cards[k]; }).join('');
            put(out, html);
            if (!initial) {
                ORDER.forEach(function (k) {
                    if (prev[k] !== undefined && prev[k] !== cards[k]) {
                        var el = out.querySelector('[data-card="' + k + '"]');
                        if (!el || reduced) return;
                        el.classList.remove('is-changed');
                        void el.offsetWidth;
                        el.classList.add('is-changed');
                    }
                });
            }
            last[lang] = cards;
        });
        updateDial();
    }

    bench.addEventListener('animationend', function (e) {
        if (e.target.classList && e.target.classList.contains('is-changed')) e.target.classList.remove('is-changed');
    });

    /* ---------- the dial ---------- */

    var dial = document.querySelector('[data-dial]');
    var input = dial && dial.querySelector('[data-dial-input]');
    var output = dial && dial.querySelector('[data-dial-out]');
    var reset = dial && dial.querySelector('[data-reset]');
    var status = document.querySelector('[data-status]');
    var wrap = input && input.parentNode;

    function dialText(lang, v) {
        var t = T[lang];
        if (v === 0) return t.dialEven;
        return fill(t.dialSlow, { name: NAMES[lang][v < 0 ? 0 : 1], n: Math.pow(2, Math.abs(v)) });
    }

    function updateDial() {
        if (!input) return;
        var v = state.v, lang = currentLang();
        if (output) {
            output.innerHTML = LANGS.map(function (l) {
                var cls = v < 0 ? 'is-yui' : v > 0 ? 'is-sota' : '';
                return '<span lang="' + l + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(dialText(l, v)) + '</span>';
            }).join('');
        }
        input.setAttribute('aria-valuetext', dialText(lang, v));
        if (reset) reset.disabled = v === 0;
        if (wrap) {
            wrap.style.setProperty('--pos', ((v + 4) / 8 * 100) + '%');
            wrap.style.setProperty('--fill', v < 0 ? 'var(--ts-yui)' : v > 0 ? 'var(--ts-sota)' : 'var(--ts-faint)');
        }
        var r = results[lang];
        if (status && r) {
            var t = T[lang], ty = t.types[r.type.key] || t.types.casual;
            var who = r.type.who != null ? NAMES[lang][r.type.who] : '';
            status.textContent = fill(t.status, { type: fill(ty[0], { name: who }), balance: r.balance });
        }
    }

    if (input) {
        dial.hidden = false;
        input.value = '0';
        input.addEventListener('input', function () {
            var v = Math.max(-4, Math.min(4, Math.round(+input.value) || 0));
            if (v === state.v) return;
            state.v = v;
            run(false);
        });
        if (reset) {
            reset.addEventListener('click', function () {
                state.v = 0;
                input.value = '0';
                run(false);
                input.focus();
            });
        }
    }

    langListeners.push(function () { updateDial(); });
    run(true);

    /* ---------- 3. Chat / export file tabs ---------- */

    var views = bench.querySelector('[data-views]');
    if (views) {
        views.hidden = false;
        var tabs = Array.prototype.slice.call(views.querySelectorAll('[role="tab"]'));
        var select = function (tab, focus) {
            tabs.forEach(function (t) {
                var on = t === tab;
                t.setAttribute('aria-selected', String(on));
                t.tabIndex = on ? 0 : -1;
                var panel = document.getElementById(t.getAttribute('aria-controls'));
                if (panel) panel.hidden = !on;
            });
            if (focus) tab.focus();
        };
        tabs.forEach(function (tab, i) {
            tab.addEventListener('click', function () { select(tab, false); });
            tab.addEventListener('keydown', function (e) {
                var k = e.key, j = null;
                if (k === 'ArrowRight' || k === 'ArrowDown') j = (i + 1) % tabs.length;
                else if (k === 'ArrowLeft' || k === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
                else if (k === 'Home') j = 0;
                else if (k === 'End') j = tabs.length - 1;
                if (j === null) return;
                e.preventDefault();
                select(tabs[j], true);
            });
        });
    }
})();
