/**
 * Light per-zone atmosphere, drawn on the scene canvas.
 * Keep it cheap: no ctx.filter, modest particle counts, pause with the game loop.
 */
import {
  getZoneMeta, getCover, layerOffset, imgToScreen, getImages, getCam, isReady,
} from './parallax.js';

const dust = [];
const mist = [];
let seededFor = null;

function rng(a) {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function resetAtmos(zoneId) {
  seededFor = zoneId;
  dust.length = 0;
  mist.length = 0;
  const seed = (zoneId || 'x').split('').reduce((s, c) => s + c.charCodeAt(0), 17);
  let r = seed;
  const n = 28;
  for (let i = 0; i < n; i++) {
    const u = rng(r++); const v = rng(r++); const w = rng(r++); const q = rng(r++);
    dust.push({
      x: u, y: v, z: 0.2 + w * 0.8,
      s: 0.7 + q * 1.6,
      sp: 0.008 + rng(r++) * 0.018,
      ph: rng(r++) * Math.PI * 2,
    });
  }
  if (zoneId === 'suoi') {
    for (let i = 0; i < 10; i++) {
      mist.push({
        x: 0.25 + rng(r++) * 0.5,
        y: 0.32 + rng(r++) * 0.28,
        r: 40 + rng(r++) * 70,
        ph: rng(r++) * 6.28,
        a: 0.04 + rng(r++) * 0.05,
      });
    }
  }
}

function flicker(t, ph) {
  return 0.82 + 0.14 * Math.sin(t * 7.3 + ph) + 0.06 * Math.sin(t * 15.1 + ph * 1.7);
}

/** Mid-depth atmosphere: glow, shafts, water, glints, mist. Drawn between mid cats and FG. */
export function drawAtmosMid(ctx, w, h, zoneId, reduced) {
  if (!isReady() || !zoneId) return;
  const meta = getZoneMeta(zoneId);
  if (!meta) return;
  const cover = getCover(w, h);
  const cam = getCam();
  const t = cam.t || 0;
  const mid = layerOffset('mid');
  const near = layerOffset('near');

  if (zoneId === 'chuong') drawShafts(ctx, w, h, cover, mid, t, reduced);
  if (zoneId === 'den' || zoneId === 'sanh' || zoneId === 'chuong' || zoneId === 'suoi') {
    drawLanternGlow(ctx, meta, cover, mid, t, reduced);
  }
  if (zoneId === 'mach') drawGlints(ctx, meta, cover, mid, t, reduced);
  if (zoneId === 'suoi') {
    drawMist(ctx, w, h, cover, mid, t, reduced);
    drawWater(ctx, w, h, cover, mid, t, reduced);
  }
}

/** Foreground motes, slightly in front. */
export function drawAtmosFront(ctx, w, h, zoneId, reduced) {
  if (!zoneId) return;
  if (seededFor !== zoneId) resetAtmos(zoneId);
  const cam = getCam();
  const t = cam.t || 0;
  // drifting dust, parallax by z
  ctx.save();
  for (const p of dust) {
    const amp = 6 + p.z * 22;
    const x = (p.x * w + Math.sin(t * 0.2 + p.ph) * 8 + cam.x * amp);
    const y = ((p.y - (t * p.sp) % 1.2) * h + cam.y * amp * 0.4);
    const yy = ((y % (h + 20)) + (h + 20)) % (h + 20) - 10;
    const a = reduced ? 0.08 : 0.10 + 0.08 * Math.sin(t * 0.7 + p.ph);
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = 'rgba(255,222,160,1)';
    ctx.beginPath();
    ctx.arc(x, yy, p.s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawLanternGlow(ctx, meta, cover, off, t, reduced) {
  const list = meta.lanterns || [];
  for (let i = 0; i < list.length; i++) {
    const L = list[i];
    const p = imgToScreen(L.x, L.y, cover, off.x, off.y);
    const f = reduced ? 0.9 : flicker(t, i * 1.7);
    const rad = 28 + (i === 0 ? 10 : 0);
    ctx.save();
    ctx.globalAlpha = 0.28 * f;
    const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, rad * 2.2);
    g.addColorStop(0, 'rgba(255,210,110,0.95)');
    g.addColorStop(0.45, 'rgba(255,170,50,0.25)');
    g.addColorStop(1, 'rgba(255,140,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawShafts(ctx, w, h, cover, off, t, reduced) {
  // Light from the top opening, slowly drifting.
  const origin = imgToScreen(384, 40, cover, off.x, off.y * 0.5);
  const sway = reduced ? 0 : Math.sin(t * 0.35) * 0.04;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(origin.x, origin.y);
  for (let i = 0; i < 4; i++) {
    const ang = -0.28 + i * 0.18 + sway + (reduced ? 0 : Math.sin(t * 0.2 + i) * 0.015);
    const spread = 0.07 + i * 0.01;
    const len = h * 0.85;
    ctx.globalAlpha = (reduced ? 0.05 : 0.055 + 0.02 * Math.sin(t * 0.6 + i));
    ctx.fillStyle = 'rgba(180,210,230,1)';
    ctx.beginPath();
    ctx.moveTo(-8, -10);
    ctx.lineTo(Math.sin(ang - spread) * len, Math.cos(ang - spread) * len);
    ctx.lineTo(Math.sin(ang + spread) * len, Math.cos(ang + spread) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawGlints(ctx, meta, cover, off, t, reduced) {
  const pts = meta.glints || [];
  if (!pts.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < pts.length; i++) {
    const tw = reduced ? 0.25 : 0.15 + 0.85 * Math.max(0, Math.sin(t * 2.1 + i * 0.7));
    if (tw < 0.2) continue;
    const p = imgToScreen(pts[i].x, pts[i].y, cover, off.x, off.y);
    ctx.globalAlpha = 0.35 * tw;
    ctx.fillStyle = 'rgba(255,230,140,1)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.2 + tw * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawMist(ctx, w, h, cover, off, t, reduced) {
  ctx.save();
  for (const m of mist) {
    const p = imgToScreen(m.x * ((getZoneMeta()?.w) || 768), m.y * ((getZoneMeta()?.h) || 1024), cover, off.x, off.y);
    const a = m.a * (reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 0.4 + m.ph));
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, m.r * cover.scale);
    g.addColorStop(0, 'rgba(210,230,235,0.55)');
    g.addColorStop(1, 'rgba(210,230,235,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, m.r * cover.scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

let waterCanvas = null;
function drawWater(ctx, w, h, cover, off, t, reduced) {
  const mask = getImages().water;
  if (!mask) return;
  const pad = (getZoneMeta() && getZoneMeta().pad) || 32;
  const meta = getZoneMeta();
  const contentW = (meta && meta.w) || 768;
  const contentH = (meta && meta.h) || 1024;
  const s = cover.scale;
  const destW = (contentW + 2 * pad) * s;
  const destH = (contentH + 2 * pad) * s;
  const dx = cover.dx - pad * s + off.x;
  const dy = cover.dy - pad * s + off.y;

  if (!waterCanvas || waterCanvas.width !== Math.max(2, Math.round(destW)) || waterCanvas.height !== Math.max(2, Math.round(destH))) {
    waterCanvas = document.createElement('canvas');
    waterCanvas.width = Math.max(2, Math.round(destW));
    waterCanvas.height = Math.max(2, Math.round(destH));
  }
  const wctx = waterCanvas.getContext('2d');
  wctx.clearRect(0, 0, waterCanvas.width, waterCanvas.height);
  // shimmer bands in local padded space
  const tw = reduced ? 0 : t;
  wctx.save();
  wctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 6; i++) {
    const yy = ((i / 6 + tw * 0.04) % 1) * waterCanvas.height;
    const g = wctx.createLinearGradient(0, yy - 8, 0, yy + 8);
    g.addColorStop(0, 'rgba(180,240,255,0)');
    g.addColorStop(0.5, 'rgba(200,245,255,0.28)');
    g.addColorStop(1, 'rgba(180,240,255,0)');
    wctx.fillStyle = g;
    wctx.fillRect(0, yy - 10, waterCanvas.width, 20);
  }
  // a couple of drifting ripple ellipses
  if (!reduced) {
    wctx.globalAlpha = 0.18;
    wctx.strokeStyle = 'rgba(220,255,255,0.8)';
    wctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const cx = waterCanvas.width * (0.35 + 0.15 * i);
      const cy = waterCanvas.height * (0.62 + 0.05 * Math.sin(t * 0.5 + i));
      const rr = 12 + (t * 14 + i * 10) % 40;
      wctx.beginPath();
      wctx.ellipse(cx, cy, rr * 1.8, rr * 0.45, 0, 0, Math.PI * 2);
      wctx.stroke();
    }
  }
  wctx.globalAlpha = 1;
  wctx.globalCompositeOperation = 'destination-in';
  wctx.drawImage(mask, 0, 0, waterCanvas.width, waterCanvas.height);
  wctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(waterCanvas, dx, dy, destW, destH);
  ctx.restore();
}
