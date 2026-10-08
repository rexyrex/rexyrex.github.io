/* 슬쩍 — the "follow one notification" demo.
   Four steps set data-state on #demo; CSS does the rest. The deleted
   bubble reveals the kept original on hover / keyboard focus (CSS) and
   toggles on click or tap (aria-expanded). Dependency-free. */
(function () {
    'use strict';

    var demo = document.getElementById('demo');
    if (!demo) return;

    var ORDER = ['arrive', 'peek', 'open', 'delete'];
    var CAPTION = {
        idle: '하린이 메시지를 쓰고 있어요. ‘메시지가 도착해요’를 눌러 시작해 보세요.',
        arrive: '하린의 메시지가 카카오톡 알림으로 도착했어요. 알림이 뜨는 순간 슬쩍이 내용을 이 폰에 담아요. 하린의 화면에는 아직 1이 보여요.',
        peek: '슬쩍에서 메시지를 읽었어요. 카카오톡 대화방은 열지 않았으니 하린의 화면에는 1이 그대로예요.',
        open: '카카오톡 대화방을 직접 열면 평소처럼 읽음 처리돼요. 하린의 화면에서 1이 사라졌어요.',
        'delete': '하린이 메시지를 지웠어요. 대화방에는 ‘메시지가 삭제되었습니다’만 남지만, 슬쩍에는 도착할 때 담아 둔 원문이 있어요. 지워진 말풍선을 눌러 슬쩍 보세요.'
    };
    var NOTE = {
        idle: '메시지를 쓰는 중',
        arrive: '아직 안 읽음',
        peek: '여전히 안 읽음',
        open: '읽음으로 바뀜',
        'delete': '메시지를 삭제함'
    };

    var steps = Array.prototype.slice.call(demo.querySelectorAll('[data-step]'));
    var caption = demo.querySelector('.demo-caption');
    var note = demo.querySelector('.their-note');
    var ghost = demo.querySelector('.ghost');
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var touched = false;
    var replayTimer = 0;

    function set(state) {
        demo.setAttribute('data-state', state);
        var at = ORDER.indexOf(state);
        steps.forEach(function (b) {
            var i = ORDER.indexOf(b.getAttribute('data-step'));
            if (i === at) b.setAttribute('aria-current', 'step');
            else b.removeAttribute('aria-current');
            b.classList.toggle('is-next', i === at + 1);
        });
        if (caption) caption.textContent = CAPTION[state];
        if (note) note.textContent = NOTE[state];
        if (ghost && state !== 'delete') ghost.setAttribute('aria-expanded', 'false');
    }

    steps.forEach(function (b) {
        b.addEventListener('click', function () {
            touched = true;
            var state = b.getAttribute('data-step');
            window.clearTimeout(replayTimer);
            // pressing 1 again replays the arrival
            if (state === 'arrive' && demo.getAttribute('data-state') === 'arrive' && !reduced) {
                set('idle');
                replayTimer = window.setTimeout(function () { set('arrive'); }, 380);
                return;
            }
            set(state);
        });
    });

    if (ghost) {
        // Keyboard focus opens it (and closes it again on the way out);
        // a click or tap pins it open or shut. Hover is CSS only.
        var autoOpened = false;
        var expand = function (on) { ghost.setAttribute('aria-expanded', on ? 'true' : 'false'); };
        ghost.addEventListener('focus', function () {
            var keyboard = true;
            try { keyboard = ghost.matches(':focus-visible'); } catch (e) {}
            if (keyboard && ghost.getAttribute('aria-expanded') !== 'true') {
                autoOpened = true;
                expand(true);
            }
        });
        ghost.addEventListener('blur', function () {
            if (autoOpened) expand(false);
            autoOpened = false;
        });
        ghost.addEventListener('click', function () {
            autoOpened = false;
            expand(ghost.getAttribute('aria-expanded') !== 'true');
        });
        ghost.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { autoOpened = false; expand(false); }
        });
    }

    // Start quiet: 하린 is typing. The message arrives once the demo is
    // on screen, unless the visitor got there first or prefers no motion.
    if (reduced || !('IntersectionObserver' in window)) {
        set('arrive');
        return;
    }

    set('idle');
    var io = new IntersectionObserver(function (entries) {
        if (!entries.some(function (e) { return e.isIntersecting; })) return;
        io.disconnect();
        window.setTimeout(function () {
            if (!touched && demo.getAttribute('data-state') === 'idle') set('arrive');
        }, 700);
    }, { threshold: 0.3 });
    io.observe(demo);
})();
