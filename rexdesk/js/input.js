// Input: what the person does on this device, as protocol v1 messages (docs/PROTOCOL.md §8).
// A mouse or trackpad points directly; a touch screen is either a trackpad for a pointer drawn
// on the picture (the default, as in the Android viewer) or touches the Mac's screen directly.
// Keys go by physical position. The on-screen keyboard's text goes as TEXT.

import { encode, Mod, Button } from './protocol.js';
import { VK, macKeyCode, modifierBit, charKeyCode, localIsApple } from './keymap.js';

const now = () => performance.now();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const SENTINEL = '​';      // keeps the hidden field non-empty, so Backspace always reports
const SLOP = 8;                 // px a finger may wander and still be a tap
const TAP_MS = 300;
const HOLD_MS = 420;

export class Input {
    /**
     * `surface`: the element that fills the session view and takes the events; `picture`: the
     * canvas (its on-screen box maps positions); `soft`: a hidden <input> for the on-screen
     * keyboard. `send(bytes)` and `move(x, y)` go to the engine. `hooks`: `cursor(x, y)` (the
     * drawn pointer moved), `zoom(scale, cx, cy)` and `zoomEnd()` (pinch), `sticky(set)`.
     */
    constructor({ surface, picture, soft, send, move, hooks }) {
        this.surface = surface;
        this.picture = picture;
        this.soft = soft;
        this.send = send;
        this.move = move;
        this.hooks = hooks;
        this.enabled = false;
        this.ctrlIsCommand = !localIsApple();
        this.touchMode = 'trackpad';
        this.displayWidth = 1920;       // host points, for scroll distances
        this.pressed = new Map();       // KeyboardEvent.code → Mac key code that went down
        this.buttons = 0;               // pointer buttons held, as PointerEvent.buttons
        this.sticky = new Set();        // modifier key codes latched from the on-screen keys row
        this.cursor = [0.5, 0.5];       // the pointer's position on the picture, 0…1
        this.lastLocalMove = 0;
        this.touches = new Map();
        this.gesture = null;
        this.holdTimer = null;
        this.fling = null;
        this.softSent = '';
        this.composing = false;
        this.listeners = [];
        this.bind();
    }

    listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        this.listeners.push(() => target.removeEventListener(type, handler, options));
    }

    bind() {
        const s = this.surface;
        const guard = (handler) => (event) => { if (this.enabled) handler.call(this, event); };
        this.listen(s, 'pointerdown', guard(this.pointerDown));
        this.listen(s, 'pointermove', guard(this.pointerMove));
        // pointermove waits for the next frame; pointerrawupdate fires as the device reports, so
        // the Mac hears about a movement up to a frame sooner.
        this.raw = 'onpointerrawupdate' in s;
        if (this.raw) this.listen(s, 'pointerrawupdate', guard(this.rawMove));
        this.listen(s, 'pointerup', guard(this.pointerUp));
        this.listen(s, 'pointercancel', guard(this.pointerUp));
        this.listen(s, 'wheel', guard(this.wheel), { passive: false });
        this.listen(s, 'contextmenu', (e) => e.preventDefault());
        this.listen(document, 'keydown', guard(this.keyDown), true);
        this.listen(document, 'keyup', guard(this.keyUp), true);
        this.listen(window, 'blur', guard(this.releaseAll));
        this.listen(this.soft, 'input', guard(this.softInput));
        this.listen(this.soft, 'compositionstart', () => { this.composing = true; });
        this.listen(this.soft, 'compositionend', () => { this.composing = false; if (this.enabled) this.softInput(); });
    }

    destroy() {
        this.setEnabled(false);
        for (const off of this.listeners.splice(0)) off();
    }

    setEnabled(on) {
        if (this.enabled === on) return;
        if (!on) this.releaseAll();
        this.enabled = on;
        this.resetSoft();
    }

    /** Where a client position falls on the picture, 0…1 (the canvas box includes any zoom). */
    position(clientX, clientY) {
        const r = this.picture.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return [0.5, 0.5];
        return [clamp01((clientX - r.left) / r.width), clamp01((clientY - r.top) / r.height)];
    }

    // MARK: Mouse, trackpad, pen

    pointerDown(e) {
        if (e.pointerType === 'touch') return this.touchDown(e);
        e.preventDefault();
        if (document.activeElement !== this.surface && document.activeElement !== this.soft) this.surface.focus({ preventScroll: true });
        try { this.surface.setPointerCapture(e.pointerId); } catch (_) { /* a pointer that is already gone */ }
        this.syncPointer(e);
    }

    pointerMove(e) {
        if (e.pointerType === 'touch') return this.touchMove(e);
        this.syncPointer(e);
    }

    rawMove(e) {
        if (e.pointerType === 'touch') return;
        const [x, y] = this.position(e.clientX, e.clientY);
        this.cursor = [x, y];
        this.lastLocalMove = now();
        this.move(x, y);
    }

    pointerUp(e) {
        if (e.pointerType === 'touch') return this.touchUp(e);
        this.syncPointer(e);
    }

    /**
     * Position and buttons from any mouse event. `buttons` is diffed against what the host holds,
     * so a second button pressed while one is down (which arrives as a move) is not missed.
     * Its bits are the protocol's button numbers: 1 left, 2 right, 4 middle, 8 back, 16 forward.
     */
    syncPointer(e) {
        const [x, y] = this.position(e.clientX, e.clientY);
        this.cursor = [x, y];
        this.lastLocalMove = now();
        const changed = (e.buttons ^ this.buttons) & 31;
        if (!changed) {
            // With raw updates the position has already gone out.
            if (!this.raw || e.type !== 'pointermove') this.move(x, y);
            return;
        }
        for (let bit = 0; bit < 5; bit++) {
            if (changed & (1 << bit)) this.send(encode.pointerButton(bit, (e.buttons & (1 << bit)) !== 0, x, y));
        }
        this.buttons = e.buttons & 31;
    }

    wheel(e) {
        e.preventDefault();
        // A trackpad pinch arrives as a wheel with a Ctrl nobody is holding: not a scroll.
        if (e.ctrlKey && !this.holds(VK.Control) && !this.holds(VK.RightControl) && !this.holds(VK.Command) && !this.holds(VK.RightCommand)) return;
        // §8: positive dy moves the content down. A wheel's positive deltaY scrolls down, which
        // moves the content up; the local natural-scrolling choice is already in the delta.
        if (e.deltaMode === 0) {
            const notches = !localIsApple() && e.deltaX === 0 && e.wheelDeltaY && e.wheelDeltaY % 120 === 0;
            if (notches) this.send(encode.scroll(0, e.wheelDeltaY / 120, false));
            else this.send(encode.scroll(-e.deltaX, -e.deltaY, true));
        } else {
            const lines = e.deltaMode === 1 ? 1 : 10;
            this.send(encode.scroll(-e.deltaX * lines / 3, -e.deltaY * lines / 3, false));
        }
    }

    // MARK: Keys

    holds(keyCode) {
        for (const k of this.pressed.values()) if (k === keyCode) return true;
        return this.sticky.has(keyCode);
    }

    modifiers(e) {
        let mods = 0;
        for (const k of this.pressed.values()) mods |= modifierBit(k);
        for (const k of this.sticky) mods |= modifierBit(k);
        if (e?.getModifierState?.('CapsLock')) mods |= Mod.CAPS;
        return mods;
    }

    keyDown(e) {
        if (e.target.closest?.('[data-local]')) return;
        const fromSoft = e.target === this.soft;
        if (fromSoft) {
            // The on-screen keyboard: its text comes through `input` events. Only real keys
            // (Enter, or a hardware keyboard that reports positions) are handled here.
            if (e.isComposing || e.keyCode === 229) return;
            if (!e.code || e.code === 'Unidentified') {
                if (e.key === 'Enter') { e.preventDefault(); this.tap(VK.Return); }
                return;
            }
        }
        // Windows reports AltGr as Ctrl followed by right Alt. That Ctrl is not a key anyone
        // pressed (and would be ⌘ here): it comes back up, and AltGr is right Option.
        if (e.code === 'AltRight' && e.key === 'AltGraph' && this.pressed.has('ControlLeft')) {
            const ghost = this.pressed.get('ControlLeft');
            this.pressed.delete('ControlLeft');
            this.send(encode.key(ghost, false, this.modifiers(e)));
        }
        const keyCode = macKeyCode(e.code, this.ctrlIsCommand);
        if (keyCode < 0) return;
        e.preventDefault();
        if (keyCode === VK.CapsLock) {
            // Browsers report Caps Lock unevenly (down when it turns on, up when it turns off on
            // a Mac): every report is one press on the Mac.
            this.tap(VK.CapsLock);
            return;
        }
        this.pressed.set(e.code, keyCode);
        this.send(encode.key(keyCode, true, this.modifiers(e)));
        if (!modifierBit(keyCode)) this.clearSticky();
    }

    keyUp(e) {
        // On a Mac, Caps Lock turning off arrives only as this key-up.
        if (e.code === 'CapsLock' && localIsApple() && !e.target.closest?.('[data-local]')) {
            e.preventDefault();
            this.tap(VK.CapsLock);
            return;
        }
        const keyCode = this.pressed.get(e.code);
        if (keyCode === undefined) return;
        e.preventDefault();
        this.pressed.delete(e.code);
        this.send(encode.key(keyCode, false, this.modifiers(e)));
        // macOS browsers never report the release of a key let go while ⌘ is held: when ⌘ comes
        // up, everything else that is not a modifier comes up with it.
        if (/^(Meta|OS)/.test(e.code) && localIsApple()) {
            for (const [code, k] of [...this.pressed]) {
                if (modifierBit(k)) continue;
                this.pressed.delete(code);
                this.send(encode.key(k, false, this.modifiers(e)));
            }
        }
    }

    /** One press and release, with whatever modifiers are held or latched. */
    tap(keyCode) {
        const mods = this.modifiers();
        this.send(encode.key(keyCode, true, mods));
        this.send(encode.key(keyCode, false, mods));
        if (!modifierBit(keyCode)) this.clearSticky();
    }

    /** A shortcut the browser keeps for itself (⌘Tab, ⌘Q, ⌘W…): pressed in order, released in reverse. */
    combo(keyCodes) {
        let mods = this.modifiers();
        for (const k of keyCodes) { mods |= modifierBit(k); this.send(encode.key(k, true, mods)); }
        for (const k of keyCodes.slice().reverse()) { mods &= ~modifierBit(k); this.send(encode.key(k, false, mods)); }
    }

    /** Latches a modifier from the on-screen keys row until the next key. */
    toggleSticky(keyCode) {
        if (this.sticky.has(keyCode)) {
            this.sticky.delete(keyCode);
            this.send(encode.key(keyCode, false, this.modifiers()));
        } else {
            this.sticky.add(keyCode);
            this.send(encode.key(keyCode, true, this.modifiers()));
        }
        this.hooks.sticky?.(this.sticky);
    }

    clearSticky() {
        if (this.sticky.size === 0) return;
        for (const k of [...this.sticky]) {
            this.sticky.delete(k);
            this.send(encode.key(k, false, this.modifiers()));
        }
        this.hooks.sticky?.(this.sticky);
    }

    /** Lifts everything the host is holding for us (focus lost, tab hidden, session over). */
    releaseAll() {
        clearTimeout(this.holdTimer);
        this.stopFling();
        const held = this.pressed.size > 0 || this.buttons !== 0 || this.sticky.size > 0 || this.gesture?.pressed;
        this.pressed.clear();
        this.sticky.clear();
        this.buttons = 0;
        this.touches.clear();
        this.gesture = null;
        this.hooks.sticky?.(this.sticky);
        if (held) this.send(encode.releaseAll());
    }

    // MARK: The on-screen keyboard

    openKeyboard() {
        this.resetSoft();
        this.soft.focus({ preventScroll: true });
    }

    closeKeyboard() {
        this.soft.blur();
    }

    resetSoft() {
        this.soft.value = SENTINEL;
        this.softSent = '';
        try { this.soft.setSelectionRange(1, 1); } catch (_) { /* not focusable yet */ }
    }

    /**
     * The hidden field's text against what was already sent: the common start stays, the rest is
     * deleted and retyped. That follows word suggestions, corrections and syllables being composed
     * (한 is ㅎ, then 하, then 한) exactly as they change.
     */
    softInput() {
        const value = this.soft.value;
        if (!value.startsWith(SENTINEL)) {
            // Backspace on an empty field ate the sentinel.
            this.tap(VK.Delete);
            this.resetSoft();
            return;
        }
        const text = value.slice(1);
        const sent = this.softSent;
        let same = 0;
        while (same < sent.length && same < text.length && sent[same] === text[same]) same++;
        for (let i = [...sent.slice(same)].length; i > 0; i--) this.tap(VK.Delete);
        this.type(text.slice(same));
        this.softSent = text;
        if (!this.composing && text.length > 64) this.resetSoft();
    }

    /** Text with no key of its own. With ⌘/⌃/⌥ latched, a letter or digit is that shortcut. */
    type(text) {
        if (!text) return;
        const shortcut = [...this.sticky].some((k) => modifierBit(k) & (Mod.COMMAND | Mod.CONTROL | Mod.OPTION));
        if (shortcut && [...text].length === 1 && charKeyCode(text) >= 0) return this.tap(charKeyCode(text));
        const lines = text.split('\n');
        lines.forEach((line, i) => {
            if (i > 0) this.tap(VK.Return);
            if (line) this.send(encode.text(line));
        });
        this.clearSticky();
    }

    // MARK: Touch

    setTouchMode(mode) {
        this.touchMode = mode === 'touch' ? 'touch' : 'trackpad';
    }

    /** The host moved the pointer (another display, an app warping it): the drawn one follows. */
    hostCursor(x, y) {
        if (now() - this.lastLocalMove < 150) return false;
        this.cursor = [x, y];
        return true;
    }

    touchDown(e) {
        e.preventDefault();
        this.stopFling();
        try { this.surface.setPointerCapture(e.pointerId); } catch (_) { /* gone */ }
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
        clearTimeout(this.holdTimer);
        const count = this.touches.size;
        if (count === 1) {
            const g = this.gesture = { fingers: 1, t0: now(), moved: false, pressed: false, lastT: now() };
            this.holdTimer = setTimeout(() => this.hold(g, e.clientX, e.clientY), HOLD_MS);
        } else if (count === 2 && this.gesture && !this.gesture.pressed && !this.gesture.moved) {
            const [a, b] = [...this.touches.values()];
            this.gesture = {
                fingers: 2, t0: this.gesture.t0, mode: null, moved: false,
                d0: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
                cx0: (a.x + b.x) / 2, cy0: (a.y + b.y) / 2, vx: 0, vy: 0, lastT: now(),
            };
        } else if (this.gesture) {
            // Another finger (or a palm) on a gesture already under way: whatever it was holding
            // is let go, and the rest of the gesture does nothing.
            this.liftTouchButton(this.gesture);
            this.gesture.fingers = Math.max(this.gesture.fingers, count);
            this.gesture.mode = 'ignore';
            this.gesture.done = true;
        }
    }

    liftTouchButton(g) {
        if (!g.pressed) return;
        g.pressed = false;
        this.send(encode.pointerButton(Button.LEFT, false, this.cursor[0], this.cursor[1]));
    }

    /** A finger held still: in trackpad mode it grabs (a drag follows); in touch mode it right-clicks. */
    hold(g, clientX, clientY) {
        if (this.gesture !== g || g.moved || g.fingers !== 1) return;
        if (this.touchMode === 'trackpad') {
            g.pressed = true;
            this.send(encode.pointerButton(Button.LEFT, true, this.cursor[0], this.cursor[1]));
        } else {
            const [x, y] = this.position(clientX, clientY);
            this.cursor = [x, y];
            this.hooks.cursor?.(x, y);
            this.click(Button.RIGHT, x, y);
            g.done = true;
        }
        navigator.vibrate?.(12);
    }

    click(button, x, y) {
        this.send(encode.pointerButton(button, true, x, y));
        this.send(encode.pointerButton(button, false, x, y));
    }

    touchMove(e) {
        const t = this.touches.get(e.pointerId);
        const g = this.gesture;
        if (!t || !g) return;
        e.preventDefault();
        const dx = e.clientX - t.x, dy = e.clientY - t.y;
        t.x = e.clientX;
        t.y = e.clientY;
        const time = now();
        if (g.fingers === 1 && !g.done) {
            if (!g.moved && Math.hypot(t.x - t.x0, t.y - t.y0) < SLOP) return;
            if (!g.moved) { g.moved = true; if (!g.pressed) clearTimeout(this.holdTimer); }
            this.lastLocalMove = time;
            if (this.touchMode === 'trackpad') {
                // Relative, like a trackpad: a little faster when the finger is fast.
                const r = this.picture.getBoundingClientRect();
                const speed = Math.hypot(dx, dy) / Math.max(1, time - g.lastT);
                const gain = 1 + Math.min(1.6, speed * 0.9);
                this.cursor = [clamp01(this.cursor[0] + dx * gain / r.width), clamp01(this.cursor[1] + dy * gain / r.height)];
            } else {
                // Direct: the finger drags what it touched.
                if (!g.pressed) {
                    const [x0, y0] = this.position(t.x0, t.y0);
                    g.pressed = true;
                    this.send(encode.pointerButton(Button.LEFT, true, x0, y0));
                }
                this.cursor = this.position(t.x, t.y);
            }
            g.lastT = time;
            this.hooks.cursor?.(this.cursor[0], this.cursor[1]);
            this.move(this.cursor[0], this.cursor[1]);
        } else if (g.fingers === 2 && this.touches.size === 2 && g.mode !== 'ignore') {
            const [a, b] = [...this.touches.values()];
            const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (!g.mode) {
                if (Math.abs(d - g.d0) > 28) { g.mode = 'pinch'; g.moved = true; }
                else if (Math.hypot(cx - g.cx0, cy - g.cy0) > 10) { g.mode = 'scroll'; g.moved = true; }
            }
            if (g.mode === 'pinch') {
                this.hooks.zoom?.(d / g.d0, cx, cy, cx - g.cx, cy - g.cy, g.started !== true);
                g.started = true;
            } else if (g.mode === 'scroll') {
                const sx = cx - g.cx, sy = cy - g.cy;
                const dt = Math.max(1, time - g.lastT);
                g.vx = g.vx * 0.6 + (sx / dt) * 0.4;
                g.vy = g.vy * 0.6 + (sy / dt) * 0.4;
                this.scrollBy(sx, sy);
            }
            g.cx = cx;
            g.cy = cy;
            g.lastT = time;
        }
    }

    /** Fingers moved the page by this many CSS pixels: content follows them, in host points. */
    scrollBy(px, py) {
        const r = this.picture.getBoundingClientRect();
        const k = r.width > 0 ? this.displayWidth / r.width : 1;
        this.send(encode.scroll(px * k, py * k, true));
    }

    touchUp(e) {
        const t = this.touches.get(e.pointerId);
        if (!t) return;
        e.preventDefault();
        this.touches.delete(e.pointerId);
        const g = this.gesture;
        if (!g) return;
        clearTimeout(this.holdTimer);
        const quick = now() - g.t0 < TAP_MS;
        if (g.fingers === 1) {
            if (g.pressed) {
                this.liftTouchButton(g);
            } else if (!g.moved && !g.done && quick) {
                if (this.touchMode === 'touch') {
                    this.cursor = this.position(t.x, t.y);
                    this.hooks.cursor?.(this.cursor[0], this.cursor[1]);
                    this.move(this.cursor[0], this.cursor[1]);
                }
                this.lastLocalMove = now();
                this.click(Button.LEFT, this.cursor[0], this.cursor[1]);
            }
            this.gesture = null;
        } else if (g.fingers === 2 && !g.finished) {
            g.finished = true;
            if (!g.mode && !g.moved && quick) {
                // Two fingers tapped: a right-click (where they landed, in touch mode).
                if (this.touchMode === 'touch') this.cursor = this.position(g.cx0, g.cy0);
                this.click(Button.RIGHT, this.cursor[0], this.cursor[1]);
            } else if (g.mode === 'scroll') {
                this.startFling(g.vx, g.vy);
            } else if (g.mode === 'pinch') {
                this.hooks.zoomEnd?.();
            }
        }
        if (this.touches.size === 0) {
            if (this.gesture) this.liftTouchButton(this.gesture);
            this.gesture = null;
        }
    }

    /** A scroll let go while moving keeps going and slows down, like the content had weight. */
    startFling(vx, vy) {
        if (Math.hypot(vx, vy) < 0.25) return;
        const fling = this.fling = { vx, vy, last: now() };
        const step = () => {
            if (this.fling !== fling || !this.enabled) return;
            const time = now();
            const dt = Math.min(48, time - fling.last);
            fling.last = time;
            const decay = Math.pow(0.996, dt);
            fling.vx *= decay;
            fling.vy *= decay;
            if (Math.hypot(fling.vx, fling.vy) < 0.03) { this.fling = null; return; }
            this.scrollBy(fling.vx * dt, fling.vy * dt);
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    stopFling() {
        this.fling = null;
    }
}
