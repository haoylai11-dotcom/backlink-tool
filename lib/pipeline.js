// Pipeline orchestration engine
const Pipeline = (() => {
  let state = 'IDLE'; // IDLE, SCRAPING, DETECTING, GENERATING, POSTING, PAUSED
  let config = { maxDepth: 2, delayMs: 5000, autoPost: false };
  let listeners = [];
  let pauseRequested = false;

  function onEvent(fn) { listeners.push(fn); }
  function emit(type, data) { listeners.forEach(fn => fn({ type, data, state, timestamp: Date.now() })); }

  function getState() { return state; }
  function getConfig() { return { ...config }; }

  function setConfig(c) { Object.assign(config, c); }

  function setState(s) { state = s; emit('stateChange', { state: s }); }

  function pause() { pauseRequested = true; setState('PAUSED'); }
  function resume() { pauseRequested = false; }
  function stop() { pauseRequested = true; setState('IDLE'); }

  function isPaused() { return pauseRequested; }

  async function delay(ms) {
    const jitter = ms * 0.5 * Math.random();
    return new Promise(r => setTimeout(r, ms + jitter));
  }

  return { onEvent, emit, getState, getConfig, setConfig, setState, pause, resume, stop, isPaused, delay };
})();

if (typeof globalThis !== 'undefined') globalThis.Pipeline = Pipeline;
