/** Local persistence — counters & cosmetic collection. Not live community. */
const KEY = 'hmby_v1';

const DEFAULT = {
  den: 12480,      // seed so UI feels lived-in; clearly local
  chuong: 3291,
  greets: 486,
  ores: [],        // { id, name, at }
  pickCooldownUntil: 0,
  name: null,
};

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT, ores: [] };
    const data = JSON.parse(raw);
    return {
      ...DEFAULT,
      ...data,
      ores: Array.isArray(data.ores) ? data.ores : [],
    };
  } catch {
    return { ...DEFAULT, ores: [] };
  }
}

export function saveState(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      den: s.den,
      chuong: s.chuong,
      greets: s.greets,
      ores: s.ores.slice(-20),
      pickCooldownUntil: s.pickCooldownUntil,
      name: s.name,
    }));
  } catch {}
}

export function fmt(n) {
  return Number(n || 0).toLocaleString('vi-VN');
}
