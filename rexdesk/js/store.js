// What the web viewer keeps on this device. The identity key lives in IndexedDB as a
// non-extractable CryptoKey (usable for signing, never readable); saved Macs and preferences are
// plain localStorage. Nothing here is a password: a remembered device is remembered by the host.

import { Identity } from './crypto.js';

function database() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('rexdesk', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('keys');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function run(db, mode, action) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('keys', mode);
        const request = action(tx.objectStore('keys'));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = tx.onabort = () => reject(tx.error);
    });
}

/**
 * This browser's identity, made on first use. `persistent: false` means the browser would not
 * store it (some private windows): the key lasts until the page closes, and hosts cannot
 * remember this device.
 */
export async function loadIdentity() {
    try {
        const db = await database();
        const saved = await run(db, 'readonly', (s) => s.get('identity'));
        if (saved?.privateKey && saved?.publicKey) {
            return { identity: await Identity.from(saved.privateKey, saved.publicKey), persistent: true };
        }
        const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
        await run(db, 'readwrite', (s) => s.put({ privateKey: pair.privateKey, publicKey: pair.publicKey }, 'identity'));
        return { identity: await Identity.from(pair.privateKey, pair.publicKey), persistent: true };
    } catch (_) {
        return { identity: await Identity.generate(), persistent: false };
    }
}

// MARK: Saved Macs and preferences (page only)

const HOSTS = 'rexdesk.hosts';
const PREFS = 'rexdesk.prefs';

function read(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value ?? fallback;
    } catch (_) {
        return fallback;
    }
}

function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage is off: nothing is remembered */ }
}

/** `[{ fingerprint (64 hex), name, lastConnected }]`, most recent first. */
export function savedHosts() {
    const list = read(HOSTS, []);
    return Array.isArray(list) ? list.filter((h) => /^[0-9a-f]{64}$/.test(h?.fingerprint || '')) : [];
}

export function saveHost(fingerprint, name) {
    const list = savedHosts().filter((h) => h.fingerprint !== fingerprint);
    list.unshift({ fingerprint, name: name || 'Mac', lastConnected: Date.now() });
    write(HOSTS, list.slice(0, 24));
}

export function forgetHost(fingerprint) {
    write(HOSTS, savedHosts().filter((h) => h.fingerprint !== fingerprint));
}

export const DEFAULT_PREFS = Object.freeze({
    service: '', deviceName: '', quality: 'auto', sound: true, ctrlIsCommand: true,
    touchMode: 'trackpad', clipboard: true, stats: false,
});

export function prefs() {
    return { ...DEFAULT_PREFS, ...read(PREFS, {}) };
}

export function setPrefs(changes) {
    write(PREFS, { ...prefs(), ...changes });
}
