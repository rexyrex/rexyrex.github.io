/* Leaderboards on Firestore (Firebase compat SDK, loaded by the page).

   The ranked tests write to the same collections, with the same fields, as
   every earlier version of the game, so the existing boards carry on:
     한글  records2 (best per name)   recordsAnon (every finished test → today)
     영문  engRecords                 engRecordsAnon
     코드  prgRecords                 prgRecordsAnon
   Meteor defense keeps its own board in meteorRecords (best per name).

   Nothing is written from a local development host. */

const CONFIG = {
  apiKey: 'AIzaSyANe3HNZoH-3vYVA4tyZRLA_qmsPYmfvbE',
  authDomain: 'rextypingspeed.firebaseapp.com',
  projectId: 'rextypingspeed',
  storageBucket: 'rextypingspeed.appspot.com',
  messagingSenderId: '329903137752',
  appId: '1:329903137752:web:749c515f41a710b265c8ad',
  measurementId: 'G-77L95J37F1'
};

export const CLIENT_VERSION = 9;

export const COLL = {
  kor: { named: 'records2', anon: 'recordsAnon' },
  eng: { named: 'engRecords', anon: 'engRecordsAnon' },
  prg: { named: 'prgRecords', anon: 'prgRecordsAnon' },
  meteor: { named: 'meteorRecords', anon: null }
};

const host = typeof location !== 'undefined' ? location.hostname : '';
export const LOCAL = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '' || host.endsWith('.localhost') || host.endsWith('.test');

let db = null;

function firestore() {
  if (db) return db;
  const fb = window.firebase;
  if (!fb || !fb.firestore) return null;
  try {
    if (!fb.apps.length) {
      fb.initializeApp(CONFIG);
      if (!LOCAL && fb.analytics) { try { fb.analytics(); } catch (e) { /* blocked */ } }
    }
    db = fb.firestore();
  } catch (e) {
    return null;
  }
  return db;
}

// The deferred SDK may still be loading when a view first asks.
export function whenReady(timeout = 6000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    (function poll() {
      const d = firestore();
      if (d) return resolve(d);
      if (Date.now() - t0 > timeout) return resolve(null);
      setTimeout(poll, 120);
    })();
  });
}

const p2 = (n) => String(n).padStart(2, '0');
export function day(d = new Date()) { return p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '-' + d.getFullYear(); }
export function stamp(d = new Date()) { return day(d) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }

export function uuid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* ---------- Reads --------------------------------------------- */

// Top scores: [{ id, score, rank, accuracy, date }], best first.
export async function top(cat, daily, limit = 100) {
  const d = await whenReady();
  if (!d) throw new Error('offline');
  const c = COLL[cat];
  let snap;
  if (daily) {
    if (c.anon) {
      snap = await d.collection(c.anon).where('day', '==', day()).orderBy('score', 'desc').limit(limit).get();
    } else {
      snap = await d.collection(c.named).where('day', '==', day()).limit(500).get();
    }
  } else {
    snap = await d.collection(c.named).orderBy('score', 'desc').limit(limit).get();
  }
  const rows = [];
  snap.forEach((doc) => rows.push(doc.data()));
  rows.sort((a, b) => (b.score || 0) - (a.score || 0));
  return rows.slice(0, limit);
}

export async function serverVersion() {
  const d = await whenReady();
  if (!d) return null;
  const snap = await d.collection('version').orderBy('ver', 'desc').limit(1).get();
  let v = null;
  snap.forEach((doc) => { v = parseInt(doc.data().ver, 10); });
  return v;
}

export async function versions() {
  const d = await whenReady();
  if (!d) return [];
  const snap = await d.collection('version').orderBy('ver', 'desc').limit(100).get();
  const rows = [];
  snap.forEach((doc) => rows.push(doc.data()));
  return rows;
}

/* ---------- Writes -------------------------------------------- */

export function logVisit(id) {
  if (LOCAL) return;
  whenReady().then((d) => {
    if (!d) return;
    d.collection('login').add({ uuid: id, navigator: navigator.userAgent, date: stamp() }).catch(() => {});
  });
}

/* rec: the record fields of a finished test, in the historical shape:
   { score, accuracy (0..1), correctWordCount, incorrectWordCount,
     givenSentenceList, typedSentenceList, keyMap, rank, mode,
     keyPressCount, keyPressCountTmp } */
function fields(rec, extra) {
  return Object.assign({
    score: rec.score,
    accuracy: rec.accuracy,
    correctWordCount: rec.correctWordCount,
    incorrectWordCount: rec.incorrectWordCount,
    givenSentenceList: rec.givenSentenceList,
    typedSentenceList: rec.typedSentenceList,
    keyMap: rec.keyMap,
    rank: rec.rank,
    clientVersion: CLIENT_VERSION,
    mode: rec.mode,
    cheatDetect: [],
    keyPressCount: rec.keyPressCount,
    keyPressCountTmp: 0,
    date: stamp(),
    day: day()
  }, extra);
}

// Every finished ranked test goes on today's board (as "anonymous" until named).
export async function submitAnon(cat, sessionId, rec) {
  const c = COLL[cat];
  if (!c || !c.anon) return null;
  if (LOCAL) return 'local';
  const d = await whenReady();
  if (!d) return null;
  try {
    const ref = await d.collection(c.anon).add(fields(rec, { uuid: sessionId, id: '' }));
    return ref.id;
  } catch (e) {
    return null;
  }
}

/* Save under a name: kept if it beats that name's best.
   → { status: 'new' | 'improved' | 'lower' | 'local' | 'error', prev } */
export async function saveNamed(cat, name, rec, anonId) {
  const c = COLL[cat];
  if (LOCAL) return { status: 'local' };
  const d = await whenReady();
  if (!d) return { status: 'error' };
  try {
    if (anonId && c.anon && anonId !== 'local') {
      d.collection(c.anon).doc(anonId).update({ id: name }).catch(() => {});
    }
    const data = cat === 'meteor'
      ? Object.assign({ id: name, clientVersion: CLIENT_VERSION, date: stamp(), day: day() }, rec)
      : fields(rec, { id: name, accuracy: Math.round(rec.accuracy * 100) + '%' });
    const snap = await d.collection(c.named).where('id', '==', name).get();
    if (snap.empty) {
      await d.collection(c.named).add(data);
      return { status: 'new' };
    }
    let best = null;
    snap.forEach((doc) => { if (!best || (doc.data().score || 0) > (best.data().score || 0)) best = doc; });
    const prev = best.data().score || 0;
    if (rec.score > prev) {
      await d.collection(c.named).doc(best.id).update(data);
      return { status: 'improved', prev };
    }
    return { status: 'lower', prev };
  } catch (e) {
    return { status: 'error' };
  }
}
