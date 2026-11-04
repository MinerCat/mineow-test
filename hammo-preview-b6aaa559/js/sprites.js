/**
 * Frame-sprite Miner Cat (Gold Rush / Depth5).
 * Masters 512×640, foot baseline y≈600. Art faces RIGHT; LEFT = canvas flip.
 */
export const SPRITE_W = 512;
export const SPRITE_H = 640;
export const SPRITE_BASELINE = 600;

const ANIM = {
  idle: { n: 6, fps: 5 },
  run: { n: 6, fps: 9 },
  smash: { n: 6, fps: 10 },
  sit: { n: 6, fps: 4, alias: 'fall_land' }, // soft crouch stand-in
};

const cache = new Map();

function url(anim, i) {
  return `art/sprites/${anim}_r_${String(i).padStart(2, '0')}.webp`;
}

export async function loadSprites() {
  const needed = new Set();
  for (const [key, conf] of Object.entries(ANIM)) {
    const a = conf.alias || key;
    for (let i = 0; i < (ANIM[a]?.n || conf.n); i++) needed.add(url(a, i));
  }
  // also fall_land for sit
  for (let i = 0; i < 6; i++) needed.add(url('fall_land', i));

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
 */
export function drawCat(ctx, { anim = 'idle', frame = 0, x, groundY, facing = 1, drawH = 160, alpha = 1 }) {
  const img = getFrame(anim, frame);
  if (!img) return;
  const h = drawH;
  const w = (SPRITE_W / SPRITE_H) * h;
  const baselineRatio = SPRITE_BASELINE / SPRITE_H;
  const footY = groundY;
  const topY = footY - h * baselineRatio;
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
