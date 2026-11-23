/**
 * Frame-sprite Miner Cat (Gold Rush / Depth5).
 * Masters 512×640. Art faces RIGHT.
 *
 * Each anim/frame has its own paw baseline (the visual sole the eye
 * reads, not a single global line and not the faint α fringe).
 * Idle is a single planted stance — the source "idle" strip is a walk
 * cycle and must not play when the cat is standing still.
 */
export const SPRITE_W = 512;
export const SPRITE_H = 640;
/** Typical planted sole (idle_r_00). Prefer frameBaseline(anim, frame). */
export const SPRITE_BASELINE = 596;
export const FOOT_NUDGE = 3; // CSS px into the floor so pads sit in the surface

// Visual sole per frame (lowest solid paw / haunch contact, not AA fringe).
const FRAME_BASELINE = {
  idle:  [596],
  run:   [597, 597, 597, 597, 597, 597],
  sit:   [597, 597, 597, 597, 597, 597, 597, 597],
  greet: [599, 599, 599, 599, 599, 599, 599, 599],
  smash: [599, 600, 598, 598, 600, 599],
};

const ANIM = {
  idle: { n: 1, fps: 1 },          // static planted stance (breath is a draw-time pulse)
  run: { n: 6, fps: 9 },
  smash: { n: 6, fps: 10 },
  sit: { n: 8, fps: 5 },           // chest breath + tail flick, feet planted
  greet: { n: 8, fps: 10 },        // clearly visible wave, feet planted
};

const cache = new Map();

function url(anim, i) {
  return `art/sprites/${anim}_r_${String(i).padStart(2, '0')}.webp`;
}

export function frameBaseline(anim, frame) {
  const arr = FRAME_BASELINE[anim];
  if (!arr || !arr.length) return SPRITE_BASELINE;
  const i = ((frame % arr.length) + arr.length) % arr.length;
  return arr[i];
}

export async function loadSprites() {
  const needed = new Set();
  for (const [key, conf] of Object.entries(ANIM)) {
    const a = conf.alias || key;
    for (let i = 0; i < (ANIM[a]?.n || conf.n); i++) needed.add(url(a, i));
  }

  await Promise.all([...needed].map((src) => new Promise((res, rej) => {
    if (cache.has(src)) return res();
    const img = new Image();
    img.onload = () => { cache.set(src, img); res(); };
    img.onerror = () => rej(new Error('sprite fail ' + src));
    img.src = src;
  })));
  return true;
}

export function getFrame(anim, frame) {
  const conf = ANIM[anim] || ANIM.idle;
  const a = conf.alias || anim;
  const n = (ANIM[a] || conf).n;
  const fi = ((frame % n) + n) % n;
  return cache.get(url(a, fi));
}

export function animMeta(anim) {
  const conf = ANIM[anim] || ANIM.idle;
  const a = conf.alias || anim;
  return { anim: a, n: (ANIM[a] || conf).n, fps: conf.fps };
}

/**
 * Draw cat with feet on (x, groundY). facing: 1 right, -1 left.
 * scale relative to native 512 — typical drawH ~ 140–180 on phone canvas.
 * `clockT` (seconds) drives a tiny idle breath; legs stay planted.
 */
export function drawCat(ctx, {
  anim = 'idle', frame = 0, x, groundY, facing = 1, drawH = 160, alpha = 1, clockT = 0,
}) {
  const img = getFrame(anim, frame);
  if (!img) return;
  let h = drawH;
  let w = (SPRITE_W / SPRITE_H) * h;
  const baseline = frameBaseline(anim, frame);
  const footY = groundY + FOOT_NUDGE;
  // Subtle chest breath only — scale toward the head, feet stay on the floor.
  if (anim === 'idle') {
    const pulse = 1 + 0.012 * Math.sin((clockT || 0) * Math.PI * 2 / 2.6);
    h = drawH * pulse;
    w = (SPRITE_W / SPRITE_H) * h;
  }
  const topY = footY - h * (baseline / SPRITE_H);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, 0);
  ctx.scale(facing >= 0 ? 1 : -1, 1);
  ctx.drawImage(img, -w / 2, topY, w, h);
  ctx.restore();
}

export class AnimClock {
  constructor(anim = 'idle') {
    this.anim = anim;
    this.t = 0;
    this.frame = 0;
    this.loop = true;
    this.done = false;
  }
  set(anim, { loop = true } = {}) {
    if (this.anim === anim && !this.done) return;
    this.anim = anim;
    this.t = 0;
    this.frame = 0;
    this.loop = loop;
    this.done = false;
  }
  update(dt) {
    const { n, fps } = animMeta(this.anim);
    this.t += dt;
    if (this.loop) {
      this.frame = Math.floor(this.t * fps) % n;
    } else {
      this.frame = Math.min(n - 1, Math.floor(this.t * fps));
      if (this.frame >= n - 1) this.done = true;
    }
  }
}
