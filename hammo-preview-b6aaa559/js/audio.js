/** Simple WebAudio — no external files. */
let ctx = null;
let muted = false;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function isMuted() { return muted; }
export function setMuted(v) {
  muted = !!v;
  try { localStorage.setItem('hmby_mute', muted ? '1' : '0'); } catch {}
}
export function loadMute() {
  try { muted = localStorage.getItem('hmby_mute') === '1'; } catch {}
  return muted;
}

export function unlock() {
  try { ac(); } catch {}
}

function tone(freq, dur, type = 'sine', gain = 0.08, when = 0) {
  if (muted) return;
  const c = ac();
  const t0 = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

export function playBell() {
  if (muted) return;
  tone(440, 1.4, 'sine', 0.09);
  tone(554.37, 1.6, 'sine', 0.05, 0.02);
  tone(659.25, 1.8, 'sine', 0.035, 0.04);
  tone(220, 2.0, 'triangle', 0.03, 0.01);
}

export function playSoftClick() {
  tone(660, 0.08, 'triangle', 0.04);
}

export function playLantern() {
  tone(520, 0.35, 'sine', 0.05);
  tone(780, 0.5, 'sine', 0.03, 0.05);
}

export function playOre() {
  tone(340, 0.15, 'square', 0.03);
  tone(510, 0.25, 'sine', 0.04, 0.05);
}

export function playGreet() {
  tone(490, 0.12, 'sine', 0.045);
  tone(620, 0.18, 'sine', 0.03, 0.08);
}

/** Soft looping ambient drone per zone feel. */
let ambNodes = null;
export function stopAmbient() {
  if (!ambNodes) return;
  try {
    ambNodes.g.gain.exponentialRampToValueAtTime(0.0001, ac().currentTime + 0.3);
    setTimeout(() => {
      try { ambNodes.o.stop(); ambNodes.o2.stop(); } catch {}
      ambNodes = null;
    }, 400);
  } catch { ambNodes = null; }
}

export function playAmbient(kind = 'cave') {
  stopAmbient();
  if (muted) return;
  const c = ac();
  const o = c.createOscillator();
  const o2 = c.createOscillator();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = kind === 'stream' ? 600 : kind === 'bell' ? 500 : 400;
  o.type = 'sine';
  o2.type = 'triangle';
  const base = kind === 'stream' ? 110 : kind === 'gold' ? 98 : 82;
  o.frequency.value = base;
  o2.frequency.value = base * 1.5;
  g.gain.value = 0.0001;
  o.connect(f); o2.connect(f); f.connect(g); g.connect(c.destination);
  o.start(); o2.start();
  g.gain.exponentialRampToValueAtTime(0.018, c.currentTime + 1.2);
  ambNodes = { o, o2, g };
}
