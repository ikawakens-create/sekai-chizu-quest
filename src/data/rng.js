/* シード付き擬似乱数（mulberry32）。Math.random禁止の箇所（HANDOFF v2.3 §6.1等）で使い、
   同じシードからは常に同じ列を再現する。従来 test/trip.test.js にのみ private に存在していた
   実装を、stamp.js からも参照できる形で src/data/ 側の唯一の実装として切り出したもの。 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 文字列 → 32bit符号なし整数ハッシュ（FNV-1a）。mulberry32のseedや形の決定に使う。 */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
