/* HANDOFF v2.3 §6.1: パスポートのスタンプ手続き生成（純粋関数・UI非依存）。
   makeStamp(country, dateStr, opts) は常にSVG文字列を返し、同じ引数なら常に同じ文字列を返す
   （Math.random禁止。回転・かすれは hash(id+date) でシードした mulberry32 由来）。
   country = { id, cont, nameKana }（App.jsx側で組み立て済みの表示用フィールドを渡す想定。
   ja.js/世界地図データそのものへの依存はPR1のスコープ外なので持たない）。 */
import { souvenirOf, souvenirDisplay } from "./souvenirs.js";
import { mulberry32, hashString } from "./rng.js";

export const STAMP_SHAPES = ["circle", "roundedSquare", "hexagon", "ellipse", "shield"];
const GOLD_INK = "#c9971f";

/* App.jsx CONT[].color（大陸ごとの淡色）と同じ値。stamp.jsはApp.jsx（JSX）に依存できないため
   ここに複製している。PR3でUIに結線する際、共通データモジュールへの一本化を検討すること。 */
const CONT_PASTEL = {
  asia: "#ffd6a0", europe: "#d4c2f5", africa: "#f7f0a0",
  namerica: "#c2ecf0", samerica: "#ffb9c8", oceania: "#ffc6ad",
};
const FALLBACK_PASTEL = "#c2b8a3";

function darken(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift) => Math.round(((n >> shift) & 255) * (1 - amount)).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/* 形は国ごとに常に同じ（hash(id) % 5）。 */
export function shapeOf(id) {
  return STAMP_SHAPES[hashString(id) % STAMP_SHAPES.length];
}

function shapePath(shape) {
  switch (shape) {
    case "roundedSquare": return `<rect x="8" y="8" width="104" height="104" rx="16" />`;
    case "hexagon": return `<polygon points="60,4 111,32 111,88 60,116 9,88 9,32" />`;
    case "ellipse": return `<ellipse cx="60" cy="60" rx="57" ry="42" />`;
    case "shield": return `<path d="M60,6 L110,22 V64 C110,96 88,112 60,118 C32,112 10,96 10,64 V22 Z" />`;
    case "circle":
    default: return `<circle cx="60" cy="60" r="54" />`;
  }
}

/* "YYYY-MM-DD" -> "YYYY.M.D" */
function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return `${y}.${Number(m)}.${Number(d)}`;
}

function ring(shape, ink, opacity, rotateDeg) {
  return `<g transform="rotate(${rotateDeg} 60 60)" stroke="${ink}" fill="none" stroke-width="3" opacity="${opacity.toFixed(2)}">${shapePath(shape)}</g>`;
}

/* country: { id, cont, nameKana } / dateStr: "YYYY-MM-DD" / opts: { gold?: boolean }
   goldはHANDOFF §2.5の「マスター」判定（3スロットすべて≥3 かつ streak≥3）の結果を
   呼び出し側（trip.js側、PR2b以降）が渡す。stamp.js自身はsave/progを知らない。 */
export function makeStamp(country, dateStr, opts = {}) {
  const { id, cont, nameKana } = country;
  const gold = !!opts.gold;
  const shape = shapeOf(id);
  const ink = darken(CONT_PASTEL[cont] || FALLBACK_PASTEL, 0.5);
  const rng = mulberry32(hashString(id + dateStr));
  const rotate = Math.round(rng() * 24 - 12); /* -12°〜+12° */
  const opacity = 0.75 + rng() * 0.2; /* 0.75〜0.95 のかすれ */
  const goldRotate = Math.round(rng() * 6 - 3);
  const souvenir = souvenirOf(id, cont);

  const goldLayer = gold ? ring(shape, GOLD_INK, 0.85, rotate + goldRotate) : "";

  /* HANDOFF v2.3 §6.2差し替え対応: img有無の出し分けはsouvenirDisplay（souvenirs.js）に
     一本化する（HTML文脈のSouvenirコンポーネントと同じ判定を共有）。SVG文脈なので
     imgありは<image href>、無しは従来どおり<text>で絵文字を出す。 */
  const disp = souvenirDisplay(souvenir);
  const souvenirMark = disp.kind === "img"
    ? `<image href="${disp.src}" x="40" y="46" width="40" height="40" />`
    : `<text x="60" y="66" font-size="22">${disp.text}</text>`;

  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${nameKana}のスタンプ">
  ${ring(shape, ink, opacity, rotate)}
  <g transform="rotate(${rotate} 60 60)" fill="${ink}" opacity="${opacity.toFixed(2)}" text-anchor="middle" font-family="sans-serif">
    <text x="60" y="44" font-size="14" font-weight="700">${nameKana}</text>
    ${souvenirMark}
    <text x="60" y="86" font-size="10" letter-spacing="2">${fmtDate(dateStr)}</text>
    <text x="60" y="100" font-size="6" opacity="0.6">${id}</text>
  </g>
  ${goldLayer}
</svg>`;
}

/* HANDOFF v2.3 §6.3: 入国成功で必ず押印。再訪は同スタンプに日付を追記（同日の重複追記は
   しない）。paspoort上は最新日付を表示しタップで全日付、の元データをここで確定する。
   goldは一度trueになったら以後false扱いで戻さない（マスター降格は無い前提の書き込み側規則）。
   save.passportが未初期化（古いprogOfのみのsave等）でも壊れないよう存在を補う。 */
export function applyStamp(save, id, dateStr, gold = false) {
  const passport = save.passport || { stamps: {}, bonus: [], routes: [] };
  const prev = passport.stamps[id] || { dates: [], gold: false };
  const dates = prev.dates.includes(dateStr) ? prev.dates : [...prev.dates, dateStr];
  return {
    ...save,
    passport: { ...passport, stamps: { ...passport.stamps, [id]: { dates, gold: prev.gold || gold } } },
  };
}
