/**
 * Local ambient NPC presence.
 *
 * GitHub Pages is static — no server. This module simulates a few cats
 * wandering / sitting so the space feels shared. Swap `createLocalPresence`
 * for a realtime adapter later (PartyKit / Supabase / etc.) without
 * rewriting zone scenes: implement the same PresenceAPI shape.
 *
 * PresenceAPI:
 *   start(zoneId) -> void
 *   stop() -> void
 *   list() -> CatGhost[]
 *   tick(dt, bounds) -> void
 *   bumpGreetNear(x, radius) -> string|null
 *   noteLocalSit(x) / noteLocalStand()
 */

import { uniqueName } from './names.js';

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function liveRow(c, bounds) {
  const rows = bounds.rows || [];
  return rows.find((r) => r.id === (c.rowId || (c.row && c.row.id))) || null;
}

function usableNpcRows(bounds) {
  const w = bounds.w || 720;
  const pad = 18;
  const rows = (bounds.rows || []).filter((r) => r.id !== 'front');
  const out = [];
  for (const r of rows) {
    const sx0 = (r.sx0 != null ? r.sx0 : w * (r.x0 ?? 0.12));
    const sx1 = (r.sx1 != null ? r.sx1 : w * (r.x1 ?? 0.88));
    const vx0 = Math.max(sx0, pad);
    const vx1 = Math.min(sx1, w - pad);
    const span = vx1 - vx0;
    const minGap = r.minGap || 56;
    if (span < minGap * 0.45) continue;
    const maxFit = Math.max(1, Math.floor(span / minGap) + (span >= minGap * 0.7 ? 1 : 0));
    // A single-cat ledge only needs to fit the body, not a full gap.
    const cap = Math.min(r.maxNpcs != null ? r.maxNpcs : 2, maxFit);
    if (cap <= 0) continue;
    const canWander = r.wander !== false && span > minGap * 1.25;
    out.push({
      ...r,
      sx0: vx0,
      sx1: vx1,
      minGap,
      maxNpcs: cap,
      wander: canWander,
    });
  }
  return clipRowsForPlayer(out, bounds);
}

function clipRowsForPlayer(rows, bounds) {
  const playerX = bounds.playerX;
  if (playerX == null || !rows.length) return rows;
  const clipped = [];
  for (const r of rows) {
    const need = Math.max(r.minGap || 56, 64) * 0.85;
    const pocket0 = playerX - need;
    const pocket1 = playerX + need;
    const left0 = r.sx0;
    const left1 = Math.min(r.sx1, pocket0);
    const right0 = Math.max(r.sx0, pocket1);
    const right1 = r.sx1;
    const leftSpan = left1 - left0;
    const rightSpan = right1 - right0;
    let x0 = r.sx0;
    let x1 = r.sx1;
    const minSpan = (r.minGap || 56) * 0.45;
    if (leftSpan >= rightSpan && leftSpan >= minSpan) {
      x0 = left0;
      x1 = left1;
    } else if (rightSpan >= minSpan) {
      x0 = right0;
      x1 = right1;
    } else {
      continue;
    }
    const span = x1 - x0;
    const maxFit = Math.max(1, Math.floor(span / (r.minGap || 56)) + (span >= (r.minGap || 56) * 0.7 ? 1 : 0));
    const cap = Math.min(r.maxNpcs, maxFit);
    if (cap <= 0) continue;
    const canWander = r.wander !== false && span > (r.minGap || 56) * 1.25;
    clipped.push({ ...r, sx0: x0, sx1: x1, maxNpcs: cap, wander: canWander });
  }
  return clipped;
}

function assignRows(rows, count) {
  const assigned = [];
  if (!rows.length) return assigned;
  let guard = 0;
  while (assigned.length < count && guard++ < 32) {
    let placed = false;
    for (const r of rows) {
      if (assigned.length >= count) break;
      const used = assigned.filter((a) => a === r).length;
      if (used < r.maxNpcs) {
        assigned.push(r);
        placed = true;
      }
    }
    if (!placed) break;
  }
  return assigned;
}

function slotX(row, index, count) {
  const span = row.sx1 - row.sx0;
  if (count <= 1) return row.sx0 + span * 0.5;
  const inset = Math.min(row.minGap * 0.45, span * 0.18);
  const inner = Math.max(0, span - inset * 2);
  const t = index / (count - 1);
  return row.sx0 + inset + t * inner;
}

function tooClose(x, others, gap) {
  for (const o of others) {
    if (Math.abs(x - o) < gap) return true;
  }
  return false;
}


function rowBounds(c, bounds) {
  const row = liveRow(c, bounds) || c.row;
  if (!row) return null;
  return {
    row,
    x0: row.sx0,
    x1: row.sx1,
    gap: row.minGap || 56,
  };
}

function clampX(c, bounds) {
  const b = rowBounds(c, bounds);
  if (!b) return;
  c.x = Math.max(b.x0, Math.min(b.x1, c.x));
}

function spreadAll(cats, bounds) {
  if (!cats.length) return;
  const playerX = bounds.playerX;
  for (let iter = 0; iter < 8; iter++) {
    if (playerX != null) {
      for (const c of cats) {
        const b = rowBounds(c, bounds);
        if (!b) continue;
        const need = Math.max(b.gap, 64) * 0.9;
        const d = c.x - playerX;
        if (Math.abs(d) < need) {
          const mid = (b.x0 + b.x1) / 2;
          const dir = d === 0 ? (c.x <= mid ? -1 : 1) : Math.sign(d);
          c.x = playerX + dir * need;
          clampX(c, bounds);
          c.targetX = c.x;
        }
      }
    }
    const sorted = cats.slice().sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const bA = rowBounds(a, bounds);
      const bB = rowBounds(b, bounds);
      if (!bA || !bB) continue;
      const same = a.rowId === b.rowId;
      const need = Math.min(bA.gap, bB.gap) * (same ? 1 : 0.85);
      const d = b.x - a.x;
      if (d < need) {
        const push = (need - d) / 2;
        a.x -= push;
        b.x += push;
        clampX(a, bounds);
        clampX(b, bounds);
        a.targetX = a.x;
        b.targetX = b.x;
      }
    }
  }
}


function nudgeApart(cats, bounds) {
  // Soft collision only — do not rewrite wander targets unless bodies overlap.
  const sorted = cats.slice().sort((a, b) => a.x - b.x);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const bA = rowBounds(a, bounds);
    const bB = rowBounds(b, bounds);
    if (!bA || !bB) continue;
    const same = a.rowId === b.rowId;
    const need = Math.min(bA.gap, bB.gap) * (same ? 0.7 : 0.4);
    const d = b.x - a.x;
    if (d < need) {
      const push = (need - d) / 2;
      a.x -= push;
      b.x += push;
      clampX(a, bounds);
      clampX(b, bounds);
    }
  }
  const playerX = bounds.playerX;
  if (playerX != null) {
    for (const c of cats) {
      const b = rowBounds(c, bounds);
      if (!b) continue;
      const need = Math.max(b.gap, 64) * 0.55;
      const d = c.x - playerX;
      if (Math.abs(d) < need) {
        const mid = (b.x0 + b.x1) / 2;
        const dir = d === 0 ? (c.x <= mid ? -1 : 1) : Math.sign(d);
        c.x = playerX + dir * need;
        clampX(c, bounds);
      }
    }
  }
  // Nudges must not leave idle/sitting cats off their target, or they
  // will start a walk cycle next tick just to walk back.
  for (const c of cats) {
    if (c.anim !== 'run') c.targetX = c.x;
  }
}

export function createLocalPresence({ count = 4, seed = Date.now() } = {}) {
  let cats = [];
  let zoneId = null;
  const rng = mulberry32(seed >>> 0);
  const used = new Set();

  function spawn(bounds) {
    const rows = usableNpcRows(bounds);
    const plan = assignRows(rows, count);
    cats = [];
    const byRow = new Map();
    for (let i = 0; i < plan.length; i++) {
      const row = plan[i];
      const list = byRow.get(row.id) || [];
      list.push(i);
      byRow.set(row.id, list);
    }
    const rowCounts = {};
    for (const row of plan) rowCounts[row.id] = (rowCounts[row.id] || 0) + 1;

    const seenInRow = {};
    for (let i = 0; i < plan.length; i++) {
      const name = uniqueName(used, rng);
      used.add(name);
      const row = plan[i];
      const idxInRow = seenInRow[row.id] || 0;
      seenInRow[row.id] = idxInRow + 1;
      const nInRow = rowCounts[row.id];
      const x = slotX(row, idxInRow, nInRow);
      const stay = row.wander === false;
      const sitting = stay || rng() > 0.45;
      cats.push({
        id: `npc-${zoneId}-${i}`,
        name,
        x,
        targetX: x,
        facing: rng() > 0.5 ? 1 : -1,
        anim: sitting ? 'sit' : 'idle',
        sitting,
        groundY: bounds.groundY,
        row,
        rowId: row.id,
        z: row.z ?? 1,
        floorFrac: row.floor,
        scale: row.scale ?? 0.92,
        alpha: row.alpha ?? 0.92,
        speech: null,
        speechT: 0,
        wait: stay ? 8 + rng() * 8 : rng() * 4,
        clockT: rng() * 3,
        local: true,
        wander: row.wander !== false,
      });
    }
    spreadAll(cats, bounds);
  }

  function pickTarget(c, row, bounds) {
    const gap = row.minGap || 56;
    const mates = cats.filter((o) => o !== c && o.rowId === c.rowId);
    const playerX = bounds.playerX;
    const sameBandAsPlayer = (c.z ?? 1) >= 0.85;
    for (let k = 0; k < 14; k++) {
      const t = row.sx0 + rng() * Math.max(4, row.sx1 - row.sx0);
      if (tooClose(t, mates.map((m) => m.targetX), gap)) continue;
      if (tooClose(t, mates.map((m) => m.x), gap * 0.85)) continue;
      if (sameBandAsPlayer && playerX != null && Math.abs(t - playerX) < gap * 0.7) continue;
      return t;
    }
    return c.x;
  }

  function separate(bounds) {
    // Push same-row cats apart if they drifted inside the min gap.
    const groups = new Map();
    for (const c of cats) {
      const id = c.rowId || 'mid';
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(c);
    }
    for (const group of groups.values()) {
      group.sort((a, b) => a.x - b.x);
      for (let i = 0; i < group.length - 1; i++) {
        const a = group[i];
        const b = group[i + 1];
        const row = liveRow(a, bounds) || a.row;
        const gap = (row && row.minGap) || 56;
        const d = b.x - a.x;
        if (d < gap) {
          const push = (gap - d) / 2;
          a.x -= push;
          b.x += push;
          const rA = liveRow(a, bounds) || a.row;
          const rB = liveRow(b, bounds) || b.row;
          if (rA) a.x = Math.max(rA.sx0, Math.min(rA.sx1, a.x));
          if (rB) b.x = Math.max(rB.sx0, Math.min(rB.sx1, b.x));
        }
      }
    }
  }

  return {
    kind: 'local',
    start(id, bounds) {
      zoneId = id;
      used.clear();
      spawn(bounds);
    },
    stop() {
      cats = [];
      zoneId = null;
    },
    list() {
      return cats.map((c) => ({ ...c }));
    },
    tick(dt, bounds) {
      for (const c of cats) {
        const row = liveRow(c, bounds);
        if (row) {
          c.row = row;
          c.x0 = row.x0;
          c.x1 = row.x1;
          if (c.x < row.sx0) { c.x = row.sx0; c.targetX = row.sx0; }
          if (c.x > row.sx1) { c.x = row.sx1; c.targetX = row.sx1; }
        }
        c.clockT += dt;
        if (c.speechT > 0) {
          c.speechT -= dt;
          if (c.speechT <= 0) c.speech = null;
        }
        c.wait -= dt;
        const canWander = row ? row.wander !== false : c.wander !== false;
        if (!canWander) {
          c.sitting = true;
          c.anim = 'sit';
          c.targetX = c.x;
          continue;
        }
        if (c.sitting) {
          c.anim = 'sit';
          if (c.wait <= 0) {
            c.sitting = false;
            c.anim = 'idle';
            c.wait = 2 + rng() * 5;
            if (row && rng() > 0.4) c.targetX = pickTarget(c, row, bounds);
          }
        } else {
          const dx = c.targetX - c.x;
          if (Math.abs(dx) > 4) {
            c.anim = 'run';
            c.facing = dx > 0 ? 1 : -1;
            c.x += Math.sign(dx) * Math.min(Math.abs(dx), 55 * dt);
          } else {
            c.x = c.targetX;
            c.anim = 'idle';
            if (c.wait <= 0) {
              if (rng() > 0.55) {
                c.sitting = true;
                c.anim = 'sit';
                c.wait = 3 + rng() * 6;
              } else if (row) {
                c.targetX = pickTarget(c, row, bounds);
                c.wait = 1 + rng() * 3;
              }
            }
          }
        }
      }
      nudgeApart(cats, bounds);
    },
    holdIdle() {
      for (const c of cats) {
        c.sitting = false;
        c.anim = 'idle';
        c.targetX = c.x;
        c.wait = 9999;
      }
    },
    bumpGreetNear(x, radius = 70) {
      let best = null;
      let bestD = radius;
      for (const c of cats) {
        const d = Math.abs(c.x - x);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (!best) return null;
      best.speech = 'xin chào';
      best.speechT = 2.2;
      return best.name;
    },
  };
}

/**
 * Future: export function createRealtimePresence(url) { ... same API ... }
 * Zone code should only depend on PresenceAPI, never on local specifics.
 */
