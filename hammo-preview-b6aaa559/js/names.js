/** Poetic Vietnamese miner-cat names — cosmetic only. */
const ADJ = [
  'Lười', 'Êm', 'Mơ Màng', 'Thong Dong', 'Nhẹ', 'Ấm',
  'Lặng', 'Êm Đềm', 'Mềm', 'Yên', 'Chậm Rãi', 'Dịu',
  'Vàng', 'Lung Linh', 'Mềm Mại', 'Thơ Thẩn', 'Bình Yên',
];
const NOUN = [
  'Đèn Lồng', 'Cuốc', 'Mạch Vàng', 'Quặng', 'Đèn', 'Chuông',
  'Suối', 'Hang', 'Lồng Đèn', 'Đệm Đá', 'Mèo', 'Paw',
  'Mỏ', 'Nến Mỏ', 'Túi Quặng', 'Mũ Vàng', 'Đuốc',
];

export function randomName(rng = Math.random) {
  const n = NOUN[Math.floor(rng() * NOUN.length)];
  const a = ADJ[Math.floor(rng() * ADJ.length)];
  return `${n} ${a}`;
}

export function uniqueName(used, rng = Math.random) {
  for (let i = 0; i < 40; i++) {
    const name = randomName(rng);
    if (!used.has(name)) return name;
  }
  return randomName(rng) + ' ' + Math.floor(rng() * 90 + 10);
}
