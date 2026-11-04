import { randomName } from './names.js';
import { loadSprites, drawCat, AnimClock, SPRITE_BASELINE, SPRITE_H } from './sprites.js';
import { loadState, saveState, fmt } from './state.js';
import { createLocalPresence } from './presence.js';
import {
  loadMute, setMuted, isMuted, unlock,
  playBell, playSoftClick, playLantern, playOre, playGreet, playAmbient, stopAmbient,
} from './audio.js';

const ZONES = [
  {
    id: 'sanh',
    name: 'Sảnh Tượng Mèo',
    blurb: 'Chào · Ngồi · Dâng quặng',
    emoji: '🗿',
    bg: 'art/bg_sanh.jpg',
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
    bg: 'art/bg_chuong.jpg',
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
    bg: 'art/bg_den.jpg',
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
    bg: 'art/bg_mach.jpg',
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
    bg: 'art/bg_suoi.jpg',
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
  state.screen = name;
  for (const [k, el] of Object.entries(screens)) {
    el.classList.toggle('active', k === name);
  }
  if (name !== 'zone') {
    stopAmbient();
    state.presence.stop();
  }
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

function buildMap() {
  const list = $('zone-list');
  list.innerHTML = '';
  for (const z of ZONES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'zone-card';
    btn.dataset.zone = z.id;
    btn.innerHTML = `
      <div class="zone-emoji">${z.emoji}</div>
      <div class="zone-meta">
        <strong>${z.name}</strong>
        <span>${z.blurb}</span>
      </div>
      <div class="zone-seats">Còn ${z.seats}</div>
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
  playSoftClick();
  state.zone = z;
  state.player.x = 360;
  state.player.targetX = 360;
  state.player.sitting = false;
  state.player.clock.set('idle');
  state.player.speech = null;
  state.lanterns = [];
  state.collectionOpen = false;
  $('collection').hidden = true;

  screens.zone.style.backgroundImage = `url('${z.bg}')`;
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

  const canvas = $('scene');
  const bounds = canvasBounds();
  state.presence.start(z.id, bounds);

  playAmbient(z.ambient);
  showScreen('zone');
  resizeCanvas();
}

function canvasBounds() {
  const canvas = $('scene');
  const w = canvas.width;
  return { x0: w * 0.12, x1: w * 0.88, groundY: (canvas._lh || canvas.height) * 0.82 };
}

function doAction(id) {
  unlock();
  const p = state.player;
  if (id === 'map') {
    showScreen('map');
    refreshCounters();
    return;
  }
  if (id === 'chao') {
    playGreet();
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
      toast(state.zone.id === 'suoi' ? 'Bạn ngồi bên suối…' : 'Bạn ngồi trên đệm đá');
    } else {
      p.clock.set('idle');
      toast('Bạn đứng dậy');
    }
    playSoftClick();
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
    playOre();
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
    playSoftClick();
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
  // ignore taps on action bar area roughly
  const pt = scenePoint(ev);
  const h = $('scene')._lh || 800;
  if (pt.y > h * 0.88) return;
  state.player.sitting = false;
  state.player.targetX = pt.x;
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
  } else {
    p.clock.set('idle');
  }
  p.clock.update(dt);
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

function drawScene(dt) {
  if (state.screen !== 'zone' || !state.zone) return;
  const canvas = $('scene');
  const ctx = canvas.getContext('2d');
  const w = canvas._lw || canvas.clientWidth;
  const h = canvas._lh || canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  // soft vignette so sprites read on busy bg
  ctx.fillStyle = 'rgba(8,5,3,0.18)';
  ctx.fillRect(0, h * 0.55, w, h * 0.45);

  const bounds = { x0: w * 0.1, x1: w * 0.9, groundY: h * 0.82 };
  state.presence.tick(dt, bounds);
  updatePlayer(dt, bounds);

  if (state.offerGlow > 0) state.offerGlow = Math.max(0, state.offerGlow - dt);

  drawLanterns(ctx);
  drawOfferGlow(ctx, bounds);

  // soft floor band so feet read against busy art
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(w/2, bounds.groundY + 6, w * 0.42, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const drawH = Math.round(Math.min(180, h * 0.28));
  const npcs = state.presence.list();
  // depth sort by y (same ground) then x
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
    },
  ].sort((a, b) => a.x - b.x);

  for (const a of actors) {
    const isPlayer = a.kind === 'player';
    const anim = isPlayer ? state.player.clock.anim : a.anim;
    const frame = isPlayer ? state.player.clock.frame : Math.floor((a.clockT || 0) * (anim === 'run' ? 9 : 5)) % 6;
    // update npc frame via clockT already advancing
    drawCat(ctx, {
      anim,
      frame,
      x: a.x,
      groundY: bounds.groundY,
      facing: a.facing,
      drawH: isPlayer ? drawH : drawH * 0.92,
      alpha: isPlayer ? 1 : 0.92,
    });
    const tagY = bounds.groundY - drawH * (SPRITE_BASELINE / SPRITE_H) - 6;
    drawNameTag(ctx, a.name, a.x, tagY, isPlayer);
    if (a.speech) {
      drawNameTag(ctx, a.speech, a.x, tagY - 20, false);
    }
  }

  // hint
  ctx.save();
  ctx.font = '500 11px "Be Vietnam Pro", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(243,230,200,0.28)';
  ctx.textAlign = 'center';
  ctx.fillText('Chạm để đi · mèo quanh đây là mô phỏng trên máy bạn', w / 2, h * 0.58);
  ctx.restore();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state.toastTimer > 0) {
    state.toastTimer -= dt;
    if (state.toastTimer <= 0) {
      $('toast').classList.remove('show');
    }
  }
  drawScene(dt);
  requestAnimationFrame(loop);
}

function setMuteUi() {
  $('btn-mute').textContent = isMuted() ? '🔇' : '🔊';
}

async function init() {
  // bg images on screens
  screens.entry.style.backgroundImage = `url('${screens.entry.dataset.bg}')`;
  screens.map.style.backgroundImage = `url('${screens.map.dataset.bg}')`;

  loadMute();
  setMuteUi();
  $('btn-mute').addEventListener('click', () => {
    setMuted(!isMuted());
    setMuteUi();
    if (isMuted()) stopAmbient();
    else if (state.screen === 'zone' && state.zone) playAmbient(state.zone.ambient);
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
    playSoftClick();
    showScreen('map');
    refreshCounters();
  });

  const canvas = $('scene');
  canvas.addEventListener('pointerdown', onSceneTap);

  window.addEventListener('resize', () => {
    if (state.screen === 'zone') resizeCanvas();
  });

  try {
    await loadSprites();
    state.ready = true;
  } catch (e) {
    console.error(e);
    toast('Không tải được hình mèo');
  }

  // preload zone bgs
  for (const z of ZONES) loadBg(z.bg);
  loadBg('art/bg_entry.jpg');
  loadBg('art/bg_zones.jpg');

  requestAnimationFrame(loop);
}

init();
