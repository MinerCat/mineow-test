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
 *   list() -> CatGhost[]   // { id, name, x, facing, anim, sitting, speech? }
 *   tick(dt, bounds) -> void
 *   bumpGreetNear(x, radius) -> string|null  // NPC name greeted, if any
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

export function createLocalPresence({ count = 4, seed = Date.now() } = {}) {
  let cats = [];
  let zoneId = null;
  const rng = mulberry32(seed >>> 0);
  const used = new Set();

  function spawn(bounds) {
    const { x0, x1, groundY } = bounds;
    const rows = (bounds.rows && bounds.rows.length)
      ? bounds.rows.filter((r) => r.id !== 'front')
      : [{ id: 'front', z: 1, floor: null, scale: 0.92, alpha: 0.92, x0: 0.12, x1: 0.88 }];
    cats = [];
    for (let i = 0; i < count; i++) {
      const name = uniqueName(used, rng);
      used.add(name);
      const row = rows[i % rows.length];
      const xa = (row.x0 != null ? row.x0 : 0.12);
      const xb = (row.x1 != null ? row.x1 : 0.88);
      const x = (bounds.w || (x1 / 0.88) || 720) * (xa + rng() * Math.max(0.05, xb - xa));
      const sitting = rng() > 0.45;
      cats.push({
        id: `npc-${zoneId}-${i}`,
        name,
        x,
        targetX: x,
        facing: rng() > 0.5 ? 1 : -1,
        anim: sitting ? 'sit' : 'idle',
        sitting,
        groundY,
        row,
        z: row.z ?? 1,
        floorFrac: row.floor,
        scale: row.scale ?? 0.92,
        alpha: row.alpha ?? 0.92,
        x0: xa,
        x1: xb,
        speech: null,
        speechT: 0,
        wait: rng() * 4,
        clockT: rng() * 3,
        local: true, // mark simulated
      });
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
      const w = bounds.w || 720;
      for (const c of cats) {
        const x0 = (c.x0 != null ? c.x0 * w : bounds.x0);
        const x1 = (c.x1 != null ? c.x1 * w : bounds.x1);
        if (c.x < x0) { c.x = x0; c.targetX = x0; }
        if (c.x > x1) { c.x = x1; c.targetX = x1; }
        c.clockT += dt;
        if (c.speechT > 0) {
          c.speechT -= dt;
          if (c.speechT <= 0) c.speech = null;
        }
        c.wait -= dt;
        if (c.sitting) {
          c.anim = 'sit';
          if (c.wait <= 0) {
            c.sitting = false;
            c.anim = 'idle';
            c.wait = 2 + rng() * 5;
            if (rng() > 0.4) {
              c.targetX = x0 + rng() * (x1 - x0);
            }
          }
        } else {
          const dx = c.targetX - c.x;
          if (Math.abs(dx) > 4) {
            c.anim = 'run';
            c.facing = dx > 0 ? 1 : -1;
            c.x += Math.sign(dx) * Math.min(Math.abs(dx), 55 * dt);
          } else {
            c.anim = 'idle';
            if (c.wait <= 0) {
              if (rng() > 0.55) {
                c.sitting = true;
                c.anim = 'sit';
                c.wait = 3 + rng() * 6;
              } else {
                c.targetX = x0 + rng() * (x1 - x0);
                c.wait = 1 + rng() * 3;
              }
            }
          }
        }
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
