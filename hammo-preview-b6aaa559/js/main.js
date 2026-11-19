import { randomName } from './names.js';
import { loadSprites, drawCat, AnimClock, SPRITE_BASELINE, SPRITE_H, FOOT_NUDGE, animMeta } from './sprites.js';
import { loadState, saveState, fmt } from './state.js';
import { createLocalPresence } from './presence.js';
import {
  loadMute, setMuted, isMuted, unlock,
  playBell, playSoftClick, playLantern, playOre, playGreet, playAmbient,
  playSit, playPick, playTravel, playBag, playFootstep,
} from './audio.js';
import {
  preloadLayers, setZone, clearZone, isReady as layersReady,
  tickParallax, setPlayerNormX, requestTiltPermission,
  drawWorldLayer, layerOffset, getZoneMeta, getCam, noteFps, getFps,
  getCover,
} from './parallax.js';
import { resetAtmos, drawAtmosMid, drawAtmosFront } from './atmos.js';

const ZONES = [
  {
    id: 'sanh',
    name: 'Sảnh Tượng Mèo',
    blurb: 'Chào · Ngồi · Dâng quặng',
    emoji: '🗿',
    bg: 'art/bg_sanh.webp',
    ambient: 'cave',
    seats: 12,
    actions: [
      { id: 'chao', label: 'Chào' },
      { id: 'ngoi', label: 'Ngồi' },
      { id: 'dang', label: 'Dâng quặng' },
      { id: 'map', label: 'Đổi khu' },
    ],
  },
  {
    id: 'chuong',
    name: 'Tháp Chuông Mỏ',
    blurb: 'Ngân chuông mỏ',
    emoji: '🔔',
    bg: 'art/bg_chuong.webp',
    ambient: 'bell',
    seats: 8,
    actions: [
      { id: 'chuong', label: 'Ngân chuông' },
      { id: 'ngoi', label: 'Ngồi' },
      { id: 'map', label: 'Đổi khu' },
    ],
  },
  {
    id: 'den',
    name: 'Hành Lang Đèn',
    blurb: 'Thắp đèn thợ mỏ',
    emoji: '🏮',
    bg: 'art/bg_den.webp',
    ambient: 'cave',
    seats: 16,
    actions: [
      { id: 'den', label: 'Thắp đèn' },
      { id: 'ngoi', label: 'Ngồi' },
      { id: 'map', label: 'Đổi khu' },
    ],
  },
  {
    id: 'mach',
    name: 'Mạch Vàng',
    blurb: 'Gõ nhẹ · nhặt quặng trang trí',
    emoji: '✨',
    bg: 'art/bg_mach.webp',
    ambient: 'gold',
    seats: 10,
    actions: [
      { id: 'go', label: 'Gõ nhẹ' },
      { id: 'bo', label: 'Bộ sưu tập' },
      { id: 'map', label: 'Đổi khu' },
    ],
  },
  {
    id: 'suoi',
    name: 'Suối Ngầm',
    blurb: 'Ngồi bên suối · thư giãn',
    emoji: '🌊',
    bg: 'art/bg_suoi.webp',
    ambient: 'stream',
    seats: 14,
    actions: [
      { id: 'ngoi', label: 'Ngồi bên suối' },
      { id: 'map', label: 'Đổi khu' },
    ],
  },
];

const ORE_NAMES = [
  'Mảnh hổ phách', 'Quặng ánh trà', 'Tinh thể mật', 'Vảy vàng mềm',
  'Hạt lân tinh', 'Thạch anh ấm', 'Vụn sao mỏ', 'Ngọc đèn lồng',
];

const SEAT_CAP = 64;

/** Fraction of scene CSS height for the walking floor.
 *  Measured from zone screenshots vs painted ground (not the old 0.82 stage line,
 *  which left a ~30–40css-px gap). Entry/map have no cats.
 */
const FLOOR_FRAC = {
  sanh: 0.860,
  chuong: 0.862,
  den: 0.860,
  mach: 0.858,
  suoi: 0.860,
};

function zoneGroundY(h, zoneId) {
  return h * (FLOOR_FRAC[zoneId] ?? 0.86);
}

const ART_W = 768;
const ART_H = 1024;

function rowToScreen(row, w, h) {
  if (!row) {
    return { sx0: w * 0.12, sx1: w * 0.88, groundY: h * 0.86 };
  }
  const cover = getCover(w, h);
  const space = row.space || 'screen';
  let sx0, sx1, groundY;
  if (space === 'image') {
    sx0 = cover.dx + row.x0 * ART_W * cover.scale;
    sx1 = cover.dx + row.x1 * ART_W * cover.scale;
    groundY = cover.dy + row.floor * ART_H * cover.scale;
  } else {
    sx0 = (row.x0 != null ? row.x0 : 0.12) * w;
    sx1 = (row.x1 != null ? row.x1 : 0.88) * w;
    groundY = (row.floor != null ? row.floor : 0.86) * h;
  }
  return { sx0, sx1, groundY, cover };
}

function rowMinGap(row, h) {
  const drawH = Math.min(180, h * 0.28);
  const drawW = (512 / 640) * drawH * (row && row.scale != null ? row.scale : 1);
  return Math.max(56, drawW * 0.72);
}

function screenToImage(sx, sy, cover) {
  return {
    x: (sx - cover.dx) / cover.scale,
    y: (sy - cover.dy) / cover.scale,
  };
}

function measureTag(ctx, text) {
  ctx.font = '600 11px "Be Vietnam Pro", system-ui, sans-serif';
  const w = ctx.measureText(text).width + 14;
  return { w, h: 18 };
}

function tagsOverlap(a, b) {
  if (a.hidden || b.hidden) return false;
  const ax0 = a.x - a.w / 2;
  const ax1 = a.x + a.w / 2;
  const bx0 = b.x - b.w / 2;
  const bx1 = b.x + b.w / 2;
  if (ax0 >= bx1 - 1 || bx0 >= ax1 - 1) return false;
  const ay0 = a.y - a.h;
  const ay1 = a.y;
  const by0 = b.y - b.h;
  const by1 = b.y;
  return ay0 < by1 - 1 && by0 < ay1 - 1;
}

function layoutNameTags(ctx, items, canvasW) {
  const tags = items.map((it) => {
    const m = measureTag(ctx, it.text);
    return {
      ...it,
      w: m.w,
      h: m.h,
      y: it.baseY,
      hidden: false,
    };
  });
  const player = tags.find((t) => t.keep);
  const placed = [];
  if (player) placed.push(player);
  const rest = tags.filter((t) => t !== player).sort((a, b) => a.x - b.x);
  for (const t of rest) {
    let ok = false;
    for (const lift of [0, 22, 44, -24]) {
      const y = t.baseY - lift;
      if (y - t.h < 70) continue;
      t.y = y;
      // Keep the bubble on screen horizontally.
      const half = t.w / 2;
      if (t.x - half < 4) t.x = 4 + half;
      if (t.x + half > canvasW - 4) t.x = canvasW - 4 - half;
      if (!placed.some((p) => tagsOverlap(t, p))) {
        ok = true;
        break;
      }
    }
    if (!ok) t.hidden = true;
    else placed.push(t);
  }
  return tags;
}



const state = {
  screen: 'entry',
  playerName: '',
  seatsLeft: 47,
  save: loadState(),
  zone: null,
  player: {
    x: 360,
    targetX: 360,
    facing: 1,
    sitting: false,
    clock: new AnimClock('idle'),
    smashUntil: 0,
    speech: null,
    speechT: 0,
  },
  presence: createLocalPresence({ count: 4 }),
  lanterns: [], // visual extras in den zone {x,y,born}
  offerGlow: 0,
  toastTimer: 0,
  collectionOpen: false,
  bgCache: new Map(),
  ready: false,
};

const $ = (id) => document.getElementById(id);
const screens = {
  entry: $('screen-entry'),
  map: $('screen-map'),
  zone: $('screen-zone'),
};

function showScreen(name) {
  const prev = state.screen;
  state.screen = name;
  if (prev && prev !== name && screens[prev]) {
    const old = screens[prev];
    old.classList.add('leaving');
    setTimeout(() => old.classList.remove('leaving'), 420);
  }
  for (const [k, el] of Object.entries(screens)) {
    el.classList.toggle('active', k === name);
  }
  if (name !== 'zone') {
    state.presence.stop();
    if (name === 'entry' || name === 'map') playAmbient(name);
  }
  if (name === 'map') layoutMapPins();
}

function toast(msg, ms = 2200) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  el.classList.add('show');
  state.toastTimer = ms / 1000;
}

function refreshCounters() {
  $('counter-den').textContent = `${fmt(state.save.den)} đèn đã thắp`;
  $('counter-chuong').textContent = `${fmt(state.save.chuong)} tiếng chuông`;
}

function refreshEntry() {
  $('player-name').textContent = state.playerName;
  $('seat-pill').textContent = `Còn ${state.seatsLeft} chỗ ngồi`;
}

function rerollName() {
  state.playerName = randomName();
  state.save.name = state.playerName;
  saveState(state.save);
  refreshEntry();
  playSoftClick();
}

/** bg_zones.jpg is 720×1280. #screen-map uses background-size:auto 100%
 *  and background-position:center top, so the full cross-section height is
 *  always visible (short viewports letterbox the sides instead of cropping
 *  the stream). Chamber bands were measured from the shelf midlines.
 */
const MAP_ART = { w: 720, h: 1280 };
const MAP_CHAMBERS = {
  sanh:   { top: 0.020, bot: 0.225, pin: 0.175 },
  chuong: { top: 0.255, bot: 0.430, pin: 0.355 },
  den:    { top: 0.455, bot: 0.605, pin: 0.530 },
  mach:   { top: 0.625, bot: 0.790, pin: 0.705 },
  suoi:   { top: 0.815, bot: 0.995, pin: 0.875 },
};

function mapArtRect(stage) {
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  const scale = sh / MAP_ART.h;
  const rh = MAP_ART.h * scale;
  const rw = MAP_ART.w * scale;
  return { sw, sh, scale, rw, rh, left: (sw - rw) / 2, top: 0 };
}

function layoutMapPins() {
  const stage = $('screen-map');
  if (!stage || !stage.clientHeight) return;
  const art = mapArtRect(stage);
  const stageBox = stage.getBoundingClientRect();
  const footer = stage.querySelector('.map-footer');
  const footerTop = footer
    ? footer.getBoundingClientRect().top - stageBox.top
    : art.sh;
  const gap = 8;

  const cards = [...stage.querySelectorAll('.zone-card')];
  const placed = [];
  for (const btn of cards) {
    const ch = MAP_CHAMBERS[btn.dataset.zone];
    if (!ch) continue;
    const bandTop = art.top + ch.top * art.rh;
    const bandBot = art.top + ch.bot * art.rh;
    const visTop = Math.max(0, bandTop);
    btn.style.top = `${Math.round(visTop)}px`;
    btn.style.height = `${Math.max(48, Math.round(Math.min(art.sh, bandBot) - visTop))}px`;
    placed.push({ btn, ch, visTop, bandTop, bandBot, art });
  }

  // Place labels from the bottom up so Suối sits above the counters first,
  // then Mạch cannot slide down on top of it.
  let nextBottomLimit = footerTop - gap;
  for (const p of placed.slice().reverse()) {
    const label = p.btn.querySelector('.zone-pin-label');
    if (!label) continue;
    const lh = label.offsetHeight || 50;
    let cy = p.art.top + p.ch.pin * p.art.rh;
    let top = cy - lh / 2;
    let bot = cy + lh / 2;
    if (bot > nextBottomLimit) {
      bot = nextBottomLimit;
      top = bot - lh;
    }
    const minTop = Math.max(p.visTop + 2, 0);
    if (top < minTop) {
      top = minTop;
      bot = top + lh;
    }
    const cardTop = parseFloat(p.btn.style.top) || 0;
    label.style.top = `${Math.round(top - cardTop)}px`;
    nextBottomLimit = top - gap;
  }
}

function buildMap() {
  const list = $('zone-list');
  list.innerHTML = '';
  for (const z of ZONES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'zone-card';
    btn.dataset.zone = z.id;
    btn.setAttribute('aria-label', z.name);
    btn.innerHTML = `
      <span class="zone-pin-label">
        <span class="zone-emoji">${z.emoji}</span>
        <span class="zone-meta">
          <strong>${z.name}</strong>
          <span>${z.blurb}</span>
        </span>
        <span class="zone-seats">Còn ${z.seats}</span>
      </span>
    `;
    btn.addEventListener('click', () => enterZone(z.id));
    list.appendChild(btn);
  }
}

function loadBg(src) {
  if (state.bgCache.has(src)) return state.bgCache.get(src);
  const img = new Image();
  img.src = src;
  state.bgCache.set(src, img);
  return img;
}

function enterZone(id) {
  const z = ZONES.find((x) => x.id === id);
  if (!z) return;
  unlock();
  playTravel();
  state.zone = z;
  state.player.x = 360;
  state.player.targetX = 360;
  state.player.sitting = false;
  state.player.clock.set('idle');
  state.player.speech = null;
  state.lanterns = [];
  state.collectionOpen = false;
  $('collection').hidden = true;

  const okLayers = setZone(z.id);
  screens.zone.style.backgroundImage = okLayers ? 'none' : `url('${z.bg}')`;
  screens.zone.classList.toggle('has-layers', okLayers);
  resetAtmos(z.id);
  requestTiltPermission();
  $('zone-title').textContent = z.name;
  $('zone-sub').textContent = `Hầm Mỏ Bình Yên · Còn ${z.seats} chỗ ngồi`;
  if (z.id === 'sanh') {
    $('zone-flavor').textContent = `Hôm nay ${fmt(state.save.greets)} lời chào (máy bạn)`;
  } else if (z.id === 'den') {
    $('zone-flavor').textContent = `${fmt(state.save.den)} đèn đã thắp (máy bạn)`;
  } else if (z.id === 'chuong') {
    $('zone-flavor').textContent = `${fmt(state.save.chuong)} tiếng chuông (máy bạn)`;
  } else {
    $('zone-flavor').textContent = '';
  }

  const actions = $('zone-actions');
  actions.innerHTML = '';
  for (const a of z.actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-action';
    b.dataset.action = a.id;
    b.textContent = a.label;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      doAction(a.id);
    });
    actions.appendChild(b);
  }

  playAmbient(z.id);
  showScreen('zone');
  resizeCanvas();
  const laid = canvasBounds();
  const px = laid.x0 + (laid.x1 - laid.x0) * 0.80;
  state.player.x = px;
  state.player.targetX = px;
  const bounds = canvasBounds();
  state.presence.start(z.id, bounds);
}

function frontRow(h, zoneId) {
  const meta = getZoneMeta(zoneId);
  const row = meta && meta.rows && meta.rows.find((r) => r.id === 'front');
  const canvas = $('scene');
  const w = (canvas && (canvas._lw || canvas.clientWidth)) || 412;
  const base = rowToScreen(row || { floor: FLOOR_FRAC[zoneId] ?? 0.86, x0: 0.12, x1: 0.88, space: 'screen', layer: 'near' }, w, h);
  return {
    floor: (row && row.floor) || (FLOOR_FRAC[zoneId] ?? 0.86),
    groundY: base.groundY,
    x0: base.sx0,
    x1: base.sx1,
    sx0: base.sx0,
    sx1: base.sx1,
    layer: (row && row.layer) || 'near',
    row,
  };
}

function canvasBounds() {
  const canvas = $('scene');
  const w = canvas._lw || canvas.clientWidth || canvas.width;
  const h = canvas._lh || canvas.clientHeight || canvas.height;
  const zoneId = state.zone && state.zone.id;
  const meta = getZoneMeta(zoneId);
  const raw = (meta && meta.rows) || [];
  const rows = raw.map((r) => {
    const s = rowToScreen(r, w, h);
    return { ...r, ...s, minGap: rowMinGap(r, h) };
  });
  const fr = rows.find((r) => r.id === 'front');
  const x0 = fr ? fr.sx0 : w * 0.12;
  const x1 = fr ? fr.sx1 : w * 0.88;
  const groundY = fr ? fr.groundY : h * (FLOOR_FRAC[zoneId] ?? 0.86);
  return {
    w, h,
    x0, x1,
    groundY,
    rows,
    playerX: state.player.x,
  };
}

function doAction(id) {
  unlock();
  const p = state.player;
  if (id === 'map') {
    playTravel();
    clearZone();
    screens.zone.classList.remove('has-layers');
    showScreen('map');
    refreshCounters();
    return;
  }
  if (id === 'chao') {
    playGreet();
    p.sitting = false;
    p.targetX = p.x;
    p.clock.set('greet');
    p.smashUntil = 1.6;
    p.speech = 'xin chào';
    p.speechT = 2;
    state.save.greets += 1;
    saveState(state.save);
    const other = state.presence.bumpGreetNear(p.x);
    toast(other ? `Bạn chào ${other}` : 'Bạn vẫy chào trong sảnh');
    $('zone-flavor').textContent = `Hôm nay ${fmt(state.save.greets)} lời chào (máy bạn)`;
    return;
  }
  if (id === 'ngoi') {
    p.sitting = !p.sitting;
    if (p.sitting) {
      p.targetX = p.x;
      p.clock.set('sit');
      playSit();
      toast(state.zone.id === 'suoi' ? 'Bạn ngồi bên suối…' : 'Bạn ngồi trên đệm đá');
    } else {
      p.clock.set('idle');
      playSoftClick();
      toast('Bạn đứng dậy');
    }
    return;
  }
  if (id === 'dang') {
    playOre();
    state.offerGlow = 1.5;
    toast('Bạn dâng một viên quặng tượng trưng');
    return;
  }
  if (id === 'chuong') {
    playBell();
    state.save.chuong += 1;
    saveState(state.save);
    toast('Chuông mỏ ngân nga…');
    $('zone-flavor').textContent = `${fmt(state.save.chuong)} tiếng chuông (máy bạn)`;
    // brief smash anim as "pull"
    p.sitting = false;
    p.clock.set('smash', { loop: false });
    p.smashUntil = 0.7;
    return;
  }
  if (id === 'den') {
    playLantern();
    state.save.den += 1;
    saveState(state.save);
    const b = canvasBounds();
    state.lanterns.push({
      x: b.x0 + Math.random() * (b.x1 - b.x0),
      y: 80 + Math.random() * 120,
      born: performance.now(),
    });
    if (state.lanterns.length > 24) state.lanterns.shift();
    toast('Một ngọn đèn thợ mỏ sáng lên');
    $('zone-flavor').textContent = `${fmt(state.save.den)} đèn đã thắp (máy bạn)`;
    return;
  }
  if (id === 'go') {
    const now = Date.now();
    if (now < (state.save.pickCooldownUntil || 0)) {
      const s = Math.ceil((state.save.pickCooldownUntil - now) / 1000);
      toast(`Cuốc đang nghỉ · thử lại sau ${s}s`);
      return;
    }
    p.sitting = false;
    p.clock.set('smash', { loop: false });
    p.smashUntil = 0.65;
    playPick();
    const ore = ORE_NAMES[Math.floor(Math.random() * ORE_NAMES.length)];
    state.save.ores.push({ id: `${now}`, name: ore, at: now });
    state.save.pickCooldownUntil = now + 45000; // 45s — gentle, no grind
    saveState(state.save);
    toast(`Bạn nhặt được: ${ore}`);
    return;
  }
  if (id === 'bo') {
    state.collectionOpen = !state.collectionOpen;
    const el = $('collection');
    el.hidden = !state.collectionOpen;
    if (state.collectionOpen) {
      const list = $('ore-list');
      const ores = state.save.ores.slice(-8).reverse();
      list.innerHTML = ores.length
        ? ores.map((o) => `<div>· ${o.name}</div>`).join('')
        : '<div>Chưa có quặng nào</div>';
    }
    playBag();
  }
}

function resizeCanvas() {
  const canvas = $('scene');
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // logical size for gameplay
  canvas._lw = cssW;
  canvas._lh = cssH;
}

function scenePoint(ev) {
  const canvas = $('scene');
  const rect = canvas.getBoundingClientRect();
  const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
  const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
  return {
    x: ((clientX - rect.left) / rect.width) * (canvas._lw || rect.width),
    y: ((clientY - rect.top) / rect.height) * (canvas._lh || rect.height),
  };
}

function onSceneTap(ev) {
  if (state.screen !== 'zone') return;
  requestTiltPermission();
  // ignore taps on action bar area roughly
  const pt = scenePoint(ev);
  const h = $('scene')._lh || 800;
  if (pt.y > h * 0.88) return;
  state.player.sitting = false;
  const b = canvasBounds();
  state.player.targetX = Math.max(b.x0, Math.min(b.x1, pt.x));
  playSoftClick();
}

function updatePlayer(dt, bounds) {
  const p = state.player;
  if (p.speechT > 0) {
    p.speechT -= dt;
    if (p.speechT <= 0) p.speech = null;
  }
  if (p.smashUntil > 0) {
    p.smashUntil -= dt;
    p.clock.update(dt);
    if (p.smashUntil <= 0) {
      p.clock.set(p.sitting ? 'sit' : 'idle');
    }
    return;
  }
  if (p.sitting) {
    p.clock.set('sit');
    p.clock.update(dt);
    return;
  }
  const dx = p.targetX - p.x;
  if (Math.abs(dx) > 3) {
    p.facing = dx > 0 ? 1 : -1;
    p.x += Math.sign(dx) * Math.min(Math.abs(dx), 120 * dt);
    p.x = Math.max(bounds.x0, Math.min(bounds.x1, p.x));
    p.clock.set('run');
    state.footAcc = (state.footAcc || 0) + dt;
    if (state.footAcc >= 0.36) {
      state.footAcc = 0;
      playFootstep();
    }
  } else {
    p.clock.set('idle');
    state.footAcc = 0;
  }
  p.clock.update(dt);
  const canvas = $('scene');
  const w = canvas._lw || canvas.clientWidth || 1;
  setPlayerNormX(p.x / w);
}

function drawNameTag(ctx, text, x, y, highlight = false) {
  ctx.save();
  ctx.font = '600 11px "Be Vietnam Pro", system-ui, sans-serif';
  const padX = 7;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 18;
  const rx = x - w / 2;
  const ry = y - h;
  ctx.fillStyle = highlight ? 'rgba(40,28,12,0.88)' : 'rgba(12,8,5,0.78)';
  ctx.strokeStyle = highlight ? 'rgba(245,217,138,0.85)' : 'rgba(232,196,106,0.45)';
  ctx.lineWidth = 1;
  roundRect(ctx, rx, ry, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = highlight ? '#f5d98a' : '#f3e6c8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, ry + h / 2 + 0.5);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawLanterns(ctx) {
  for (const L of state.lanterns) {
    const age = (performance.now() - L.born) / 1000;
    const a = Math.min(1, age / 0.4);
    ctx.save();
    ctx.globalAlpha = 0.35 * a;
    const grd = ctx.createRadialGradient(L.x, L.y, 2, L.x, L.y, 40);
    grd.addColorStop(0, 'rgba(255,200,80,1)');
    grd.addColorStop(1, 'rgba(255,160,40,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(L.x, L.y, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#f0c050';
    ctx.beginPath();
    ctx.ellipse(L.x, L.y, 10, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,50,20,0.8)';
    ctx.stroke();
    ctx.restore();
  }
}

function drawOfferGlow(ctx, bounds) {
  if (state.offerGlow <= 0) return;
  const a = Math.min(1, state.offerGlow);
  const x = bounds.x0 + (bounds.x1 - bounds.x0) * 0.5;
  const y = bounds.groundY - 160;
  ctx.save();
  ctx.globalAlpha = 0.55 * a;
  const grd = ctx.createRadialGradient(x, y, 5, x, y, 70);
  grd.addColorStop(0, 'rgba(255,220,120,1)');
  grd.addColorStop(1, 'rgba(255,180,40,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function rowFloorLayer(row, a) {
  if (row && row.layer) return row.layer;
  const z = a && a.z != null ? a.z : 1;
  return z < 0.55 ? 'mid' : 'near';
}

function actorPose(a, h, zoneId) {
  const canvas = $('scene');
  const w = (canvas && (canvas._lw || canvas.clientWidth)) || 412;
  const isPlayer = a.kind === 'player';
  const fr = frontRow(h, zoneId);
  const row = isPlayer ? (fr.row || { floor: fr.floor, x0: 0.12, x1: 0.88, space: 'image', layer: fr.layer || 'near' })
    : (a.row || { floor: a.floorFrac, x0: a.x0, x1: a.x1, space: a.space || 'image', scale: a.scale, layer: a.layer });
  const s = rowToScreen(row, w, h);
  const layer = isPlayer ? (fr.layer || 'near') : rowFloorLayer(row, a);
  const o = layerOffset(layer);
  return {
    x: a.x + (o.x || 0),
    groundY: s.groundY + (o.y || 0),
    layer,
    offset: o,
  };
}

function actorGroundY(a, h, zoneId) {
  return actorPose(a, h, zoneId).groundY;
}

function drawContactShadow(ctx, x, groundY, scale, alpha) {
  // Soft elliptical shadow sitting on the floor under the paws, scaled with depth.
  const rx = 30 * scale;
  const ry = 8 * scale;
  ctx.save();
  ctx.translate(x, groundY);
  ctx.scale(1, ry / Math.max(rx, 1));
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${0.55 * alpha})`);
  g.addColorStop(0.4, `rgba(0,0,0,${0.26 * alpha})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawOneActor(ctx, a, h, zoneId, drawH, withTag) {
  const isPlayer = a.kind === 'player';
  const anim = isPlayer ? state.player.clock.anim : a.anim;
  const meta = animMeta(anim);
  const frame = isPlayer ? state.player.clock.frame : Math.floor((a.clockT || 0) * meta.fps) % meta.n;
  const pose = actorPose(a, h, zoneId);
  const groundY = pose.groundY;
  const x = pose.x;
  const scale = isPlayer ? 1 : (a.scale != null ? a.scale : 0.92);
  const alpha = isPlayer ? 1 : (a.alpha != null ? a.alpha : 0.92);
  drawContactShadow(ctx, x, groundY, scale, alpha);
  drawCat(ctx, {
    anim,
    frame,
    x,
    groundY,
    facing: a.facing,
    drawH: Math.round(drawH * scale),
    alpha,
  });
  if (withTag) {
    const tagY = groundY - drawH * scale * (SPRITE_BASELINE / SPRITE_H) - 6;
    drawNameTag(ctx, a.name, x, tagY, isPlayer);
    if (a.speech) drawNameTag(ctx, a.speech, x, tagY - 20, false);
  }
  return { groundY, scale, x };
}

function drawScene(dt) {
  if (state.screen !== 'zone' || !state.zone) return;
  const canvas = $('scene');
  const ctx = canvas.getContext('2d');
  const w = canvas._lw || canvas.clientWidth;
  const h = canvas._lh || canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  tickParallax(dt);

  const zoneId = state.zone.id;
  const bounds = canvasBounds();
  state.presence.tick(dt, bounds);
  updatePlayer(dt, bounds);

  if (state.offerGlow > 0) state.offerGlow = Math.max(0, state.offerGlow - dt);

  const ready = layersReady();
  if (ready) {
    drawWorldLayer(ctx, 'far', w, h);
    drawWorldLayer(ctx, 'mid', w, h);
  } else {
    // CSS background is still showing; keep the old soft wash
    ctx.fillStyle = 'rgba(8,5,3,0.18)';
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
  }

  const drawH = Math.round(Math.min(180, h * 0.28));
  const npcs = state.presence.list();
  const actors = [
    ...npcs.map((c) => ({ kind: 'npc', ...c })),
    {
      kind: 'player',
      name: state.playerName,
      x: state.player.x,
      facing: state.player.facing,
      anim: state.player.clock.anim,
      frame: state.player.clock.frame,
      speech: state.player.speech,
      z: 1,
      floorFrac: frontRow(h, zoneId).floor,
      row: frontRow(h, zoneId).row,
      scale: 1,
      alpha: 1,
    },
  ].sort((a, b) => (a.z ?? 1) - (b.z ?? 1) || (a.kind === 'player') - (b.kind === 'player') || a.x - b.x);

  if (ready) drawWorldLayer(ctx, 'near', w, h);

  drawLanterns(ctx);
  drawOfferGlow(ctx, bounds);
  drawAtmosMid(ctx, w, h, zoneId, !!(getCam() && getCam().reduced));

  // All cats after the near floor so feet sit on the painted ground;
  // the FG layer (front lip, side props) still draws in front of them.
  for (const a of actors) drawOneActor(ctx, a, h, zoneId, drawH, false);
  if (ready) drawWorldLayer(ctx, 'fg', w, h);
  drawAtmosFront(ctx, w, h, zoneId, !!(getCam() && getCam().reduced));

  // Names stay readable above the FG lip and never overlap.
  const tagItems = [];
  for (const a of actors) {
    const isPlayer = a.kind === 'player';
    const pose = actorPose(a, h, zoneId);
    const scale = isPlayer ? 1 : (a.scale != null ? a.scale : 0.92);
    const tagY = pose.groundY - drawH * scale * (SPRITE_BASELINE / SPRITE_H) - 6;
    tagItems.push({
      text: a.name,
      x: pose.x,
      baseY: tagY,
      keep: isPlayer,
      highlight: isPlayer,
      actor: a,
    });
    if (a.speech) {
      tagItems.push({
        text: a.speech,
        x: pose.x,
        baseY: tagY - 22,
        keep: false,
        highlight: false,
        actor: a,
      });
    }
  }
  const laid = layoutNameTags(ctx, tagItems, w);
  for (const t of laid) {
    if (t.hidden) continue;
    drawNameTag(ctx, t.text, t.x, t.y, !!t.highlight);
  }
  if (window.__mineowV8) {
    const cover = getCover(w, h);
    window.__mineowV8.debugActors = actors.map((a) => {
      const pose = actorPose(a, h, zoneId);
      const gy = pose.groundY;
      const img = screenToImage(pose.x, gy, cover);
      return {
        kind: a.kind,
        name: a.name,
        x: +a.x.toFixed(1),
        drawX: +pose.x.toFixed(1),
        z: a.z,
        floor: a.floorFrac,
        layer: pose.layer,
        scale: a.scale,
        gy,
        imgX: +img.x.toFixed(1),
        imgY: +img.y.toFixed(1),
        rowId: a.rowId || (a.row && a.row.id) || (a.kind === 'player' ? 'front' : null),
      };
    });
    window.__mineowV8.debugTags = laid.map((t) => ({
      text: t.text,
      x: +t.x.toFixed(1),
      y: +t.y.toFixed(1),
      w: +t.w.toFixed(1),
      h: t.h,
      hidden: !!t.hidden,
      keep: !!t.keep,
    }));
  }

  ctx.save();
  ctx.font = '500 11px "Be Vietnam Pro", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(243,230,200,0.28)';
  ctx.textAlign = 'center';
  ctx.fillText('Chạm để đi · mèo quanh đây là mô phỏng trên máy bạn', w / 2, h * 0.58);
  ctx.restore();
}

let last = performance.now();
let hiddenPause = false;
document.addEventListener('visibilitychange', () => {
  hiddenPause = document.hidden;
  if (!document.hidden) last = performance.now();
});
function loop(now) {
  requestAnimationFrame(loop);
  if (hiddenPause || document.hidden) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state.toastTimer > 0) {
    state.toastTimer -= dt;
    if (state.toastTimer <= 0) {
      $('toast').classList.remove('show');
    }
  }
  drawScene(dt);
  if (state.screen === 'zone') noteFps(dt);
}

function setMuteUi() {
  const btn = $('btn-mute');
  const m = isMuted();
  btn.textContent = m ? '🔇' : '🔊';
  btn.setAttribute('aria-label', m ? 'Bật tiếng' : 'Tắt tiếng');
  btn.setAttribute('title', m ? 'Bật tiếng' : 'Tắt tiếng');
  btn.setAttribute('aria-pressed', m ? 'true' : 'false');
}

function addDust() {
  const app = document.getElementById('app');
  if (!app || app.querySelector('.dust')) return;
  const d = document.createElement('div');
  d.className = 'dust';
  d.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('i');
    const s = 1.5 + Math.random() * 2.5;
    p.style.left = `${Math.random() * 100}%`;
    p.style.width = p.style.height = `${s}px`;
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 80}px`);
    p.style.animationDuration = `${14 + Math.random() * 16}s`;
    p.style.animationDelay = `${-Math.random() * 30}s`;
    d.appendChild(p);
  }
  app.appendChild(d);
}

async function init() {
  addDust();
  // bg images on screens
  screens.entry.style.backgroundImage = `url('${screens.entry.dataset.bg}')`;
  screens.map.style.backgroundImage = `url('${screens.map.dataset.bg}')`;

  loadMute();
  setMuteUi();
  playAmbient('entry');
  $('btn-mute').addEventListener('click', () => {
    unlock();
    setMuted(!isMuted());
    setMuteUi();
  });

  state.playerName = state.save.name || randomName();
  state.save.name = state.playerName;
  // soft seat count — local flavor, drifts slowly
  state.seatsLeft = 30 + Math.floor(Math.random() * 25);
  saveState(state.save);
  refreshEntry();
  refreshCounters();
  buildMap();

  $('btn-reroll').addEventListener('click', () => { unlock(); rerollName(); });
  $('btn-enter').addEventListener('click', () => {
    unlock();
    requestTiltPermission();
    playTravel();
    showScreen('map');
    refreshCounters();
  });

  const canvas = $('scene');
  canvas.addEventListener('pointerdown', onSceneTap);

  const onViewport = () => {
    if (state.screen === 'zone') resizeCanvas();
    if (state.screen === 'map') layoutMapPins();
  };
  window.addEventListener('resize', onViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewport);
  }

  try {
    await Promise.all([loadSprites(), preloadLayers().catch((e) => {
      console.warn('layers', e);
      return null;
    })]);
    state.ready = true;
  } catch (e) {
    console.error(e);
    toast('Không tải được hình mèo');
  }

  // preload zone bgs (fallback while layers load / as map art)
  for (const z of ZONES) loadBg(z.bg);
  loadBg('art/bg_entry.jpg');
  loadBg('art/bg_zones.jpg');

  requestAnimationFrame(loop);
}

init();
