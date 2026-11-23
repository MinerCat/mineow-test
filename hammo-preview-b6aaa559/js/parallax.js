/**
 * 2.5D parallax for Hầm Mỏ Bình Yên zone scenes.
 * Layers are pre-split WebPs (far/mid/near/fg) plus a tiny manifest.
 *
 * Motion sources (all lerped, subtle):
 *   - device tilt (DeviceOrientation; iOS permission on first tap)
 *   - pointer / mouse on fine-pointer devices
 *   - slow idle camera drift
 *   - slight camera follow when the player walks
 * prefers-reduced-motion disables motion (static layered scene remains).
 */
const MANIFEST_URL = 'art/layers/layers.json';

const DEFAULT_AMP = {
  far:  { x: 6,  y: 3 },
  mid:  { x: 14, y: 6 },
  near: { x: 22, y: 9 },
  fg:   { x: 32, y: 12 },
};

let manifest = null;
const cache = new Map(); // key -> HTMLImageElement
let zoneId = null;
let zoneMeta = null;
const images = { far: null, mid: null, near: null, fg: null, water: null };

let camX = 0, camY = 0;
let targetX = 0, targetY = 0;
let tiltX = 0, tiltY = 0;
let pointerX = 0, pointerY = 0;
let driftX = 0, driftY = 0;
let followX = 0, followY = 0;
let originGamma = null, originBeta = null;
let tiltPerm = 'unknown'; // unknown | granted | denied
let reduced = false;
let clockT = 0;
let playerNX = 0.5; // 0..1
let readyForZone = false;
let frozen = false;
let fps = 0;
let fpsN = 0, fpsT = 0;

function mqReduced() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function loadImage(src) {
  if (cache.has(src)) return Promise.resolve(cache.get(src));
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { cache.set(src, img); res(img); };
    img.onerror = () => rej(new Error('layer fail ' + src));
    img.src = src;
  });
}

export async function preloadLayers() {
  reduced = mqReduced();
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => { reduced = mq.matches; if (reduced) { camX = camY = targetX = targetY = 0; } };
    if (mq.addEventListener) mq.addEventListener('change', on);
    else if (mq.addListener) mq.addListener(on);
  }
  const res = await fetch(MANIFEST_URL);
  manifest = await res.json();
  const jobs = [];
  for (const [id, meta] of Object.entries(manifest.zones || {})) {
    for (const layer of meta.layers || ['far', 'mid', 'near', 'fg']) {
      jobs.push(loadImage(`art/layers/${id}_${layer}.webp`));
    }
    if (meta.water) jobs.push(loadImage(`art/layers/${id}_water.webp`));
  }
  await Promise.all(jobs);
  bindInput();
  exposeHook();
  return manifest;
}

export function isReady() {
  return !!manifest && readyForZone;
}

export function getManifest() {
  return manifest;
}

export function getZoneMeta(id = zoneId) {
  return manifest && manifest.zones ? manifest.zones[id] : null;
}

export function setZone(id) {
  zoneId = id;
  zoneMeta = getZoneMeta(id);
  readyForZone = false;
  images.far = images.mid = images.near = images.fg = images.water = null;
  if (!zoneMeta) return false;
  const grab = (layer) => cache.get(`art/layers/${id}_${layer}.webp`) || null;
  images.far = grab('far');
  images.mid = grab('mid');
  images.near = grab('near');
  images.fg = grab('fg');
  images.water = zoneMeta.water ? grab('water') : null;
  readyForZone = !!(images.far && images.mid && images.near && images.fg);
  return readyForZone;
}

export function clearZone() {
  zoneId = null;
  zoneMeta = null;
  readyForZone = false;
}

function bindInput() {
  const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  if (fine) {
    window.addEventListener('pointermove', (ev) => {
      const el = document.getElementById('scene');
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0) return;
      const nx = ((ev.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((ev.clientY - r.top) / r.height) * 2 - 1;
      pointerX = Math.max(-1, Math.min(1, nx));
      pointerY = Math.max(-1, Math.min(1, ny));
    }, { passive: true });
  }
  // Non-iOS: start listening immediately. iOS waits for requestTiltPermission().
  if (!(typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission)) {
    tiltPerm = 'granted';
    window.addEventListener('deviceorientation', onOrient, { passive: true });
  }
}

function onOrient(ev) {
  if (ev.gamma == null || ev.beta == null) return;
  if (originGamma == null) {
    originGamma = ev.gamma;
    originBeta = ev.beta;
  }
  tiltX = Math.max(-1, Math.min(1, (ev.gamma - originGamma) / 22));
  tiltY = Math.max(-1, Math.min(1, (ev.beta - originBeta) / 22));
}

/** Call from a user gesture (tap / enter). Safe to call often. */
export async function requestTiltPermission() {
  if (tiltPerm !== 'unknown') return tiltPerm;
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const s = await DeviceOrientationEvent.requestPermission();
      tiltPerm = s === 'granted' ? 'granted' : 'denied';
    } else {
      tiltPerm = 'granted';
    }
    if (tiltPerm === 'granted') {
      window.addEventListener('deviceorientation', onOrient, { passive: true });
    }
  } catch {
    tiltPerm = 'denied';
  }
  return tiltPerm;
}

export function setPlayerNormX(nx) {
  playerNX = Math.max(0, Math.min(1, nx));
}

export function tickParallax(dt) {
  clockT += dt;
  if (frozen) {
    camX = camY = targetX = targetY = 0;
    return;
  }
  if (reduced) {
    targetX = targetY = 0;
    camX += (0 - camX) * Math.min(1, dt * 6);
    camY += (0 - camY) * Math.min(1, dt * 6);
    return;
  }
  driftX = Math.sin(clockT * 0.17) * 0.20;
  driftY = Math.sin(clockT * 0.13 + 1.1) * 0.10;
  const followT = (playerNX - 0.5) * 0.45;
  followX += (followT - followX) * (1 - Math.exp(-dt * 2.2));
  followY += (0 - followY) * (1 - Math.exp(-dt * 2.2));

  // Tilt wins on devices that are actually tilting; otherwise pointer.
  const usingTilt = tiltPerm === 'granted' && (Math.abs(tiltX) + Math.abs(tiltY) > 0.02);
  const px = usingTilt ? tiltX : pointerX;
  const py = usingTilt ? tiltY : pointerY;

  targetX = Math.max(-1, Math.min(1, px + driftX + followX));
  targetY = Math.max(-1, Math.min(1, py * 0.7 + driftY));
  const k = 1 - Math.exp(-dt * 5.5);
  camX += (targetX - camX) * k;
  camY += (targetY - camY) * k;
}

export function getCam() {
  return { x: camX, y: camY, t: clockT, reduced };
}

export function setCam(x, y, immediate = true) {
  targetX = camX = Math.max(-1, Math.min(1, x));
  targetY = camY = Math.max(-1, Math.min(1, y));
  if (!immediate) { /* already set both */ }
}

export function layerOffset(layer) {
  const amp = (zoneMeta && zoneMeta.amp && zoneMeta.amp[layer]) || DEFAULT_AMP[layer] || { x: 0, y: 0 };
  return { x: camX * amp.x, y: camY * amp.y };
}

/**
 * CSS background-size:cover + background-position: posX posY (fractions).
 * `contentW/H` is the unpadded art size. The drawn image includes `pad` on each side.
 */
export function coverRect(contentW, contentH, stageW, stageH, posX = 0.5, posY = 0.28) {
  const scale = Math.max(stageW / contentW, stageH / contentH);
  const dw = contentW * scale;
  const dh = contentH * scale;
  const dx = (stageW - dw) * posX;
  const dy = (stageH - dh) * posY;
  return { dx, dy, dw, dh, scale };
}

export function getCover(stageW, stageH) {
  const w = (zoneMeta && zoneMeta.w) || 768;
  const h = (zoneMeta && zoneMeta.h) || 1024;
  const pos = (manifest && manifest.pos) || { x: 0.5, y: 0.28 };
  return coverRect(w, h, stageW, stageH, pos.x, pos.y);
}

export function imgToScreen(ix, iy, cover, ox = 0, oy = 0) {
  return { x: cover.dx + ix * cover.scale + ox, y: cover.dy + iy * cover.scale + oy };
}

function drawLayer(ctx, img, cover, ox, oy) {
  if (!img) return;
  const pad = (zoneMeta && zoneMeta.pad != null) ? zoneMeta.pad : (manifest && manifest.pad) || 32;
  const s = cover.scale;
  const destW = (((zoneMeta && zoneMeta.w) || 768) + 2 * pad) * s;
  const destH = (((zoneMeta && zoneMeta.h) || 1024) + 2 * pad) * s;
  ctx.drawImage(img, cover.dx - pad * s + ox, cover.dy - pad * s + oy, destW, destH);
}

export function drawWorldLayer(ctx, name, stageW, stageH) {
  if (!readyForZone) return null;
  const cover = getCover(stageW, stageH);
  const o = layerOffset(name);
  drawLayer(ctx, images[name], cover, o.x, o.y);
  return { cover, offset: o };
}

export function getImages() {
  return images;
}

export function noteFps(dt) {
  fpsN += 1;
  fpsT += dt;
  if (fpsT >= 0.5) {
    fps = fpsN / fpsT;
    fpsN = 0;
    fpsT = 0;
  }
  return fps;
}

export function getFps() {
  return fps;
}

function exposeHook() {
  window.__mineowV8 = {
    build: 'v12-ground-idle',
    setCam,
    getCam,
    getFps,
    ready: () => readyForZone,
    zone: () => zoneId,
    manifest: () => manifest,
    setReduced(v) { reduced = !!v; },
    freeze(v) { frozen = !!v; if (frozen) { camX = camY = targetX = targetY = 0; } },
  };
}

export { images, clockT };
