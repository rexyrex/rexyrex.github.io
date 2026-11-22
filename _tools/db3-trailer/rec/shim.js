// Virtual clock for frame-exact capture. Installed before any page script:
// requestAnimationFrame callbacks only run when the recorder advances time,
// and performance.now()/Date.now() read that clock. Until the recorder takes
// over (__vt.setAuto(false)) a real rAF pump advances it 1/60 s per frame.
(() => {
  let now = 0;
  const q = new Map();
  let nid = 0;
  let auto = true;
  const realRaf = window.requestAnimationFrame.bind(window);
  performance.now = () => now;
  const d0 = Date.now();
  Date.now = () => d0 + now;
  window.requestAnimationFrame = (cb) => {
    q.set(++nid, cb);
    return nid;
  };
  window.cancelAnimationFrame = (id) => {
    q.delete(id);
  };
  const run = (ms) => {
    now += ms;
    const cbs = [...q.values()];
    q.clear();
    for (const cb of cbs) {
      try {
        cb(now);
      } catch (e) {
        console.error('rAF callback failed', e);
      }
    }
  };
  window.__vt = {
    advance: run,
    setAuto(v) {
      auto = v;
    },
    get now() {
      return now;
    },
  };
  const pump = () => {
    if (auto) run(1000 / 60);
    realRaf(pump);
  };
  realRaf(pump);
})();
