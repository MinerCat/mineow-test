/** File-based audio: OGG with MP3 fallback. Starts after the first user gesture. */

const MUTE_KEY = 'hmby_mute';
const BGM_VOL = 0.42;
const CROSSFADE = 1.0;

const BGM = {
  entry: 'bgm/vao_ham_ban_do',
  map: 'bgm/vao_ham_ban_do',
  sanh: 'bgm/sanh_tuong_meo',
  chuong: 'bgm/thap_chuong_mo',
  den: 'bgm/hanh_lang_den',
  mach: 'bgm/mach_vang',
  suoi: 'bgm/suoi_ngam',
};

const ALL_STEMS = [
  ...new Set(Object.values(BGM)),
  'sfx/go_chuong_mo',
  'sfx/thap_den',
  'sfx/dat_quang',
  'sfx/go_cuoc_nhe',
  'sfx/nhat_quang',
  'sfx/ngoi_xuong',
  'sfx/chao_meo',
  'sfx/nut_giao_dien',
  'sfx/chuyen_khu',
  'sfx/buoc_chan_da_a',
  'sfx/buoc_chan_da_b',
  'sfx/buoc_chan_da_c',
  'sfx/buoc_chan_da_d',
  'cat/meo_vui',
  'cat/meo_chao',
  'cat/meo_thu_gian',
  'cat/den_long_lach_cach',
  'cat/ba_lo_do_nghe',
];

const FOOTSTEPS = [
  'sfx/buoc_chan_da_a',
  'sfx/buoc_chan_da_b',
  'sfx/buoc_chan_da_c',
  'sfx/buoc_chan_da_d',
];

let ctx = null;
let master = null;
let muted = false;
let unlocked = false;
let ext = null;
let desiredBgm = null;
let currentBgm = null;
let currentStem = null;
let currentSrc = null;
let currentGain = null;
let footIndex = 0;
let prefetchStarted = false;

const rawFiles = new Map(); // stem -> Promise<ArrayBuffer>
const decoded = new Map();  // stem -> AudioBuffer | Promise<AudioBuffer>

function pickExt() {
  if (ext) return ext;
  try {
    const a = document.createElement('audio');
    const ogg = a.canPlayType('audio/ogg; codecs="vorbis"') || a.canPlayType('audio/ogg');
    ext = ogg && ogg !== 'no' ? 'ogg' : 'mp3';
  } catch {
    ext = 'mp3';
  }
  return ext;
}

function stemUrl(stem) {
  return `audio/${stem}.${pickExt()}`;
}

function fetchStem(stem) {
  if (!rawFiles.has(stem)) {
    rawFiles.set(stem, fetch(stemUrl(stem)).then(async (res) => {
      if (!res.ok) throw new Error(`Audio ${res.status}: ${stem}`);
      return res.arrayBuffer();
    }));
  }
  return rawFiles.get(stem);
}

function prefetchAll() {
  if (prefetchStarted) return;
  prefetchStarted = true;
  pickExt();
  for (const s of ALL_STEMS) {
    fetchStem(s).catch(() => {});
  }
}

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

async function getBuffer(stem) {
  const hit = decoded.get(stem);
  if (hit instanceof AudioBuffer) return hit;
  if (hit && typeof hit.then === 'function') return hit;
  const p = (async () => {
    const arr = await fetchStem(stem);
    const copy = arr.slice(0);
    const buf = await ac().decodeAudioData(copy);
    decoded.set(stem, buf);
    return buf;
  })();
  decoded.set(stem, p);
  return p;
}

export function isMuted() { return muted; }

export function setMuted(v) {
  muted = !!v;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch {}
  if (master && ctx) {
    const t = ctx.currentTime;
    const from = master.gain.value;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(from, t);
    master.gain.linearRampToValueAtTime(muted ? 0 : 1, t + 0.15);
  }
  if (!muted && unlocked && desiredBgm && !currentSrc) {
    startBgm(desiredBgm);
  }
}

export function loadMute() {
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch {}
  return muted;
}

export function unlock() {
  unlocked = true;
  prefetchAll();
  try { ac(); } catch {}
  if (!muted && desiredBgm && !currentSrc) startBgm(desiredBgm);
}

function stopCurrent(fade = CROSSFADE) {
  if (!currentSrc || !currentGain || !ctx) {
    currentSrc = null;
    currentGain = null;
    currentBgm = null;
    currentStem = null;
    return;
  }
  const src = currentSrc;
  const g = currentGain;
  const t = ctx.currentTime;
  try {
    const from = Math.max(g.gain.value, 0.0001);
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(from, t);
    g.gain.linearRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => {
      try { src.stop(); } catch {}
      try { src.disconnect(); g.disconnect(); } catch {}
    }, fade * 1000 + 80);
  } catch {
    try { src.stop(); } catch {}
  }
  currentSrc = null;
  currentGain = null;
  currentBgm = null;
  currentStem = null;
}

async function startBgm(key) {
  desiredBgm = key;
  const stem = BGM[key];
  if (!stem) return;
  if (!unlocked || muted) return;
  if (currentStem === stem && currentSrc) {
    currentBgm = key;
    return;
  }
  let buf;
  try {
    buf = await getBuffer(stem);
  } catch (e) {
    console.warn('bgm load failed', stem, e);
    return;
  }
  if (desiredBgm !== key && BGM[desiredBgm] !== stem) return;
  if (currentStem === stem && currentSrc) {
    currentBgm = key;
    return;
  }

  const c = ac();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  src.connect(g);
  g.connect(master);
  src.start();
  g.gain.linearRampToValueAtTime(BGM_VOL, c.currentTime + CROSSFADE);
  stopCurrent(CROSSFADE);
  currentSrc = src;
  currentGain = g;
  currentBgm = key;
  currentStem = stem;
}

export function playAmbient(kind) {
  const key = (kind && BGM[kind]) ? kind : 'entry';
  startBgm(key);
}

export function stopAmbient() {
  desiredBgm = null;
  stopCurrent(0.4);
}

function playStem(stem, { vol = 0.55, when = 0 } = {}) {
  if (muted || !unlocked) return;
  const c = ac();
  getBuffer(stem).then((buf) => {
    if (muted) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(master);
    src.start(c.currentTime + Math.max(0, when));
  }).catch((e) => {
    console.warn('sfx load failed', stem, e);
  });
}

export function playBell() {
  playStem('sfx/go_chuong_mo', { vol: 0.55 });
}

export function playSoftClick() {
  playStem('sfx/nut_giao_dien', { vol: 0.4 });
}

export function playLantern() {
  playStem('sfx/thap_den', { vol: 0.55 });
  playStem('cat/den_long_lach_cach', { vol: 0.42, when: 0.12 });
}

export function playOre() {
  playStem('sfx/dat_quang', { vol: 0.55 });
}

export function playGreet() {
  // sfx/chao_meo and cat/meo_chao share the same MP3; play one meow only.
  playStem('sfx/chao_meo', { vol: 0.55 });
}

export function playSit() {
  playStem('sfx/ngoi_xuong', { vol: 0.5 });
  playStem('cat/meo_thu_gian', { vol: 0.48, when: 0.12 });
}

export function playPick() {
  playStem('sfx/go_cuoc_nhe', { vol: 0.55 });
  playStem('sfx/nhat_quang', { vol: 0.5, when: 0.28 });
  playStem('cat/meo_vui', { vol: 0.48, when: 0.4 });
}

export function playTravel() {
  playStem('sfx/chuyen_khu', { vol: 0.48 });
}

export function playBag() {
  playStem('cat/ba_lo_do_nghe', { vol: 0.5 });
}

export function playFootstep() {
  const stem = FOOTSTEPS[footIndex % FOOTSTEPS.length];
  footIndex = (footIndex + 1 + (Math.random() < 0.25 ? 1 : 0)) % FOOTSTEPS.length;
  playStem(stem, { vol: 0.28 });
}

export function getAudioDebug() {
  return {
    muted,
    unlocked,
    ext: pickExt(),
    desired: desiredBgm,
    current: currentBgm,
    stem: currentStem,
    ctxState: ctx ? ctx.state : 'none',
    master: master ? Number(master.gain.value.toFixed(3)) : null,
    decoded: [...decoded.keys()].filter((k) => decoded.get(k) instanceof AudioBuffer),
  };
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__hmbyAudio', { get: getAudioDebug });
}
