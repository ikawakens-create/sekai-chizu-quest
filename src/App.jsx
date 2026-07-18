import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { COUNTRY_GEO, GRATICULE, EQUATOR, OTHER_LAND, BORDERS, COAST, MAP_W, MAP_H } from "./data/world.geo.js";
import { CAP_JA, NAME_OVERRIDE, NAME_KANA, DEMO_HINTS } from "./data/ja.js";
import { HINTS_ASIA } from "./data/hints-asia.js";
import { HINTS_EUROPE } from "./data/hints-europe.js";
import { HINTS_AFRICA } from "./data/hints-africa.js";
import { HINTS_AMERICAS } from "./data/hints-americas.js";
import { HINTS_OCEANIA } from "./data/hints-oceania.js";
import { createMakeChoices } from "./data/choices.js";
import { emptySaveV2, loadSaveV2, persistSaveV2, pushRecent, hiddenDifficultyOf } from "./data/save.js";
import { FLAG_GROUPS } from "./data/flag-groups.js";
import {
  stageOf, availablePacks, nextLockedPack, buildTripSession, pickMeetWrong,
  tripAnswerOutcome, applyTripAnswer, finishTrip, computeStampValue,
} from "./data/trip.js";
import {
  viewForCountry as computeCountryView, viewForCountries, showInsetFor,
} from "./data/mapView.js";
const HINTS = { ...DEMO_HINTS, ...HINTS_ASIA, ...HINTS_EUROPE, ...HINTS_AFRICA, ...HINTS_AMERICAS, ...HINTS_OCEANIA };

/* =========================================================
   せかいちずクエスト — Phase 3 コア
   - 196か国 / 出題5タイプ / 3スロット習熟度 / 大陸ズーム
   ========================================================= */

/* ---------- ふりがなパーサー ---------- */
function Ruby({ t, style }) {
  const parts = [];
  const re = /\{([^|}]+)\|([^}]+)\}/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(t)) !== null) {
    if (m.index > last) parts.push(<span key={i++}>{t.slice(last, m.index)}</span>);
    parts.push(
      <ruby key={i++}>{m[1]}<rt style={{ fontSize: "0.45em", color: "#7a6a5a", fontWeight: 600 }}>{m[2]}</rt></ruby>
    );
    last = m.index + m[0].length;
  }
  if (last < t.length) parts.push(<span key={i++}>{t.slice(last)}</span>);
  return <span style={style}>{parts}</span>;
}
const plain = (s) => s.replace(/\{([^|}]+)\|[^}]+\}/g, "$1");

/* ---------- データ組み立て ---------- */
const CONT = {
  asia:     { label: "アジア",     color: "#ffd6a0" },
  europe:   { label: "ヨーロッパ", color: "#d4c2f5" },
  africa:   { label: "アフリカ",   color: "#f7f0a0" },
  namerica: { label: "きたアメリカ", color: "#c2ecf0" },
  samerica: { label: "みなみアメリカ", color: "#ffb9c8" },
  oceania:  { label: "オセアニア", color: "#ffc6ad" },
};
const CONT_KEYS = Object.keys(CONT);

/* ---------- 出題地域（ソロモードで選択） ---------- */
const EAST_ASIA = new Set([
  "CHN","JPN","KOR","PRK","MNG","TWN",                               // 東アジア
  "IDN","THA","VNM","MYS","PHL","SGP","MMR","KHM","LAO","BRN","TLS", // 東南アジア
  "IND","PAK","BGD","LKA","NPL","BTN","MDV","AFG",                   // 南アジア
]);
const QUIZ_REGIONS = {
  world:    { label: "🌍 ぜんせかい",                  f: () => true },
  americas: { label: "🌎 アメリカたいりく",            f: (c) => c.cont === "namerica" || c.cont === "samerica" },
  europe:   { label: "🏰 ヨーロッパ",                  f: (c) => c.cont === "europe" },
  africa:   { label: "🦁 アフリカ",                    f: (c) => c.cont === "africa" },
  easia:    { label: "🐼 ひがし・とうなん・みなみアジア", f: (c) => c.cont === "asia" && EAST_ASIA.has(c.id) },
  wasia:    { label: "🐫 にし・ちゅうおうアジア",        f: (c) => c.cont === "asia" && !EAST_ASIA.has(c.id) },
  oceania:  { label: "🏝️ オセアニア",                  f: (c) => c.cont === "oceania" },
};

const COUNTRIES = COUNTRY_GEO.map((c) => ({
  ...c,
  n: NAME_OVERRIDE[c.id] || c.n,
  k: NAME_KANA[c.id] || null,
  cap: CAP_JA[c.id] || c.capEn,
  h: HINTS[c.id] || null,
}));
const byId = new Map(COUNTRIES.map((c) => [c.id, c]));
const makeChoices = createMakeChoices(COUNTRIES);

const HINT_ICON = { heritage: "🏛️", history: "📜", food: "🍴", japan: "🇯🇵", nature: "🐾" };

/* ---------- 世界遺産シール（9段階レアリティ / マスター国数で上位解放） ---------- */
const RARITY = {
  N:   { label: "ノーマル",                 color: "#7ac974", bg: "#e9f7e6", star: "★",    lv: 0, need: 0 },
  R:   { label: "レア",                     color: "#5aa7e8", bg: "#e3f0fc", star: "★★",   lv: 1, need: 0 },
  SR:  { label: "スーパーレア",             color: "#a86fe0", bg: "#f1e7fb", star: "★★★",  lv: 2, need: 0 },
  UR:  { label: "ウルトラレア",             color: "#f0a020", bg: "#fff3da", star: "★★★★", lv: 3, need: 0 },
  USR: { label: "ウルトラスーパーレア",     color: "#e8484f", bg: "#ffe8e8", star: "★×5",  lv: 4, need: 20 },
  CCR: { label: "ちょうちょうレア",         color: "#ff3da0", bg: "#ffe3f2", star: "★×6",  lv: 5, need: 50 },
  C3R: { label: "ちょうちょうちょうレア",   color: "#ff5722", bg: "#ffe9e0", star: "★×7",  lv: 6, need: 100 },
  NJR: { label: "にじいろレア",             color: "#8b5cf6", bg: "#f3e8ff", star: "★×8",  lv: 7, need: 150, rainbow: true },
  UNR: { label: "ウルトラちょうにじいろレア", color: "#e8a000", bg: "#fff8d0", star: "★×9", lv: 8, need: 196, rainbow: true, ultra: true },
};
const TIER_ORDER = ["N", "R", "SR", "UR", "USR", "CCR", "C3R", "NJR", "UNR"];

const STICKERS = [
  { id: "moai",     e: "🗿", name: "モアイくん",             ra: "N" },
  { id: "camel",    e: "🐫", name: "ピラミッドらくだ",       ra: "N" },
  { id: "parthenon",e: "🏛️", name: "パルテノンさん",        ra: "N" },
  { id: "lion",     e: "🦁", name: "サバンナライオン",       ra: "N" },
  { id: "zou",      e: "🐘", name: "だいいどうゾウさん",     ra: "N" },
  { id: "kangaroo", e: "🦘", name: "カンガルーちゃん",       ra: "N" },
  { id: "panda",    e: "🐼", name: "パンダせんせい",         ra: "N" },
  { id: "kirin",    e: "🦒", name: "キリンのみはりばん",     ra: "N" },
  { id: "sango",    e: "🏝️", name: "サンゴのしま",           ra: "N" },
  { id: "fountain", e: "⛲", name: "ふんすいひろば",         ra: "N" },
  { id: "liberty",  e: "🗽", name: "じゆうのめがみさま",     ra: "R" },
  { id: "castle",   e: "🏰", name: "しらゆきのおしろ",       ra: "R" },
  { id: "taj",      e: "🕌", name: "タージ・マハルひめ",     ra: "R" },
  { id: "torii",    e: "⛩️", name: "うみのとりいさま",       ra: "R" },
  { id: "himeji",   e: "🏯", name: "しろさぎのおしろ",       ra: "R" },
  { id: "volcano",  e: "🌋", name: "かざんのしま",           ra: "R" },
  { id: "alpaca",   e: "🦙", name: "マチュピチュアルパカ",   ra: "R" },
  { id: "penguin",  e: "🐧", name: "ガラパゴスペンギンたい", ra: "R" },
  { id: "rainbow",  e: "🌈", name: "イグアスのにじ",         ra: "SR" },
  { id: "sahara",   e: "🏜️", name: "サハラのばんにん",       ra: "SR" },
  { id: "train",    e: "🚂", name: "とうげのきかんしゃ",     ra: "SR" },
  { id: "whale",    e: "🐋", name: "クジラのうた",           ra: "SR" },
  { id: "aurora",   e: "🌌", name: "オーロラのカーテン",     ra: "SR" },
  { id: "dragon",   e: "🐉", name: "ちょうじょうドラゴン",   ra: "UR" },
  { id: "condor",   e: "🦅", name: "てんくうのコンドル",     ra: "UR" },
  { id: "crown",    e: "👑", name: "せかいいさんキング",     ra: "UR" },
  /* --- 20かこくマスターで解放 --- */
  { id: "zeus",     e: "⚡", name: "ゼウスさま",             ra: "USR" },
  { id: "tsubo",    e: "🏺", name: "こだいのつぼマスター",   ra: "USR" },
  { id: "sphinx",   e: "🐈", name: "スフィンクスにゃん",     ra: "USR" },
  /* --- 50かこくマスターで解放 --- */
  { id: "rocket",   e: "🚀", name: "バイコヌールロケットごう", ra: "CCR" },
  { id: "kyoryu",   e: "🦖", name: "きょうりゅうけいこくキング", ra: "CCR" },
  { id: "ningyo",   e: "🧜‍♀️", name: "みなとのにんぎょひめ", ra: "CCR" },
  /* --- 100かこくマスターで解放 --- */
  { id: "reef",     e: "🌊", name: "だいさんごしょうさま",   ra: "C3R" },
  { id: "everest",  e: "🏔️", name: "エベレストおう",         ra: "C3R" },
  { id: "baobab",   e: "🌳", name: "バオバブのちょうろう",   ra: "C3R" },
  /* --- 150かこくマスターで解放 --- */
  { id: "unicorn",  e: "🦄", name: "でんせつのユニコーン",   ra: "NJR" },
  { id: "dolphin",  e: "🐬", name: "にじいろドルフィン",     ra: "NJR" },
  { id: "diamond",  e: "💎", name: "ひかりのダイヤひめ",     ra: "NJR" },
  /* --- 196かこくマスターで解放 --- */
  { id: "sunpyramid", e: "☀️", name: "たいようのピラミッド", ra: "UNR" },
  { id: "superstar",  e: "🌟", name: "スーパーにじいろスター", ra: "UNR" },
  { id: "seirei",     e: "🌍", name: "せかいのせいれい",     ra: "UNR" },
];

const GACHA_WEIGHTS = {
  normal:  { N: 50, R: 26, SR: 13, UR: 6,  USR: 2.5, CCR: 1.4, C3R: 0.8, NJR: 0.5, UNR: 0.3 },
  rainbow: { N: 24, R: 30, SR: 22, UR: 12, USR: 5,   CCR: 3.5, C3R: 2,   NJR: 1,   UNR: 0.5 },
  celeb:   { N: 0,  R: 18, SR: 36, UR: 20, USR: 10,  CCR: 7,   C3R: 5,   NJR: 2.5, UNR: 1.5 },
};

function rollGacha(mode, save, masteredCount) {
  const unlocked = (ra) => (RARITY[ra].need || 0) <= masteredCount;
  const available = STICKERS.filter((st) => unlocked(st.ra) && (save.stickers[st.id] || 0) < 3);
  if (available.length === 0) return null; // ぜんぶコンプリート！
  const weights = GACHA_WEIGHTS[mode] || GACHA_WEIGHTS.normal;
  const usable = TIER_ORDER.filter((ra) => unlocked(ra) && available.some((st) => st.ra === ra));
  const total = usable.reduce((a, ra) => a + weights[ra], 0);
  let roll = Math.random() * (total || 1);
  let rarity = usable[usable.length - 1];
  for (const ra of usable) {
    if (roll < weights[ra]) { rarity = ra; break; }
    roll -= weights[ra];
  }
  const cand = available.filter((st) => st.ra === rarity);
  return pick(cand.length ? cand : available);
}

function revealFrame(ra) {
  const r = RARITY[ra];
  const st = {
    width: 150, height: 150, margin: "0 auto", borderRadius: 24, position: "relative",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 84, background: r.bg, border: `4px dashed ${r.color}`,
    animation: "floaty 2.2s ease-in-out infinite",
  };
  if (r.lv >= 4) { st.border = `4px solid ${r.color}`; st.boxShadow = `0 0 16px ${r.color}99`; }
  if (r.lv >= 5) { st.boxShadow = `0 0 26px ${r.color}`; }
  if (r.lv >= 6) { st.animation = "floaty 2.2s ease-in-out infinite, glowPulse 1.1s ease-in-out infinite"; }
  if (r.rainbow) {
    st.background = "linear-gradient(135deg,#ffd6d6,#fff3c4,#d6ffd9,#d6ecff,#eed6ff)";
    st.border = "4px solid #fff";
    st.boxShadow = "0 0 30px rgba(170,110,255,.9)";
    st.animation = "floaty 2.2s ease-in-out infinite, rainbowBg 5s linear infinite";
  }
  if (r.ultra) {
    st.width = 172; st.height = 172; st.fontSize = 96;
    st.boxShadow = "0 0 40px rgba(255,190,40,1), 0 0 90px rgba(160,80,255,.65)";
  }
  return st;
}

/* ---------- 表示ビュー（世界/大陸/国ズーム） ----------
   HANDOFF v2.3 §2.2: スマートフレーミング（対象国のbboxが画面短辺の20%以上を占める倍率へ）。
   実際の計算は src/data/mapView.js（純粋関数・テスト済み）に委譲する。 */
const MAP_DIMS = { w: MAP_W, h: MAP_H };
function viewForCountry(c) {
  return computeCountryView(c, MAP_DIMS);
}
/* 日付変更線をまたぐ国は重心が地図の反対端に飛び、大陸の外接範囲計算を壊す
   （例: サモア/トンガはcxが左端付近、キリバスは領土が線をまたぐため中央付近になる）。
   国そのものは通常どおり描画するが、大陸フィットのbbox計算からのみ除外する
   （ヨーロッパがロシアの重心を除外しているのと同じ理由・同じパターン）。 */
const OCEANIA_DATELINE_OUTLIERS = new Set(["WSM", "TON", "KIR"]);
const CONT_VIEW = (() => {
  const out = {};
  for (const key of CONT_KEYS) {
    let pts = COUNTRIES.filter((c) => c.cont === key);
    if (key === "europe") pts = pts.filter((c) => c.id !== "RUS"); // ロシアの重心はシベリアなので枠計算から除外
    if (key === "oceania") pts = pts.filter((c) => !OCEANIA_DATELINE_OUTLIERS.has(c.id));
    out[key] = viewForCountries(pts, MAP_DIMS);
  }
  return out;
})();
const WORLD_VIEW = { s: 1, tx: 0, ty: 0 };

/* ---------- 極小国の虫めがねインセット（§2.2.3） ----------
   フレーミング後もbbox短辺が画面短辺の10%未満の国（既存の29(現データでは20)マーカー国含む）は、
   メインマップ上の実位置に引き出し線でつないだ円形の拡大窓で形も同時に見せる。
   viewの座標系（viewBox units）はg要素の外でも同じなので、s/tx/tyから直接位置計算できる。 */
function CountryInset({ c, s, tx, ty }) {
  const cx = tx + s * c.cx, cy = ty + s * c.cy;
  const R = 32;
  let ix = cx + 44, iy = cy - 44;
  if (ix > MAP_W - R - 4) ix = cx - 44; // 右に出せなければ左側へ
  ix = Math.min(Math.max(ix, R + 4), MAP_W - R - 4);
  iy = Math.min(Math.max(iy, R + 4), MAP_H - R - 4);
  const bw = c.bw || 6, bh = c.bh || 6;
  const zoomIn = Math.min((R * 1.3) / Math.max(bw, 0.6), (R * 1.3) / Math.max(bh, 0.6), 90);
  const clipId = `inset-clip-${c.id}`;
  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={cx} y1={cy} x2={ix} y2={iy} stroke="#c0392b" strokeWidth={1.4} strokeDasharray="3 2" opacity={0.85} />
      <clipPath id={clipId}><circle cx={ix} cy={iy} r={R} /></clipPath>
      <circle cx={ix} cy={iy} r={R + 2.5} fill="#fff" stroke="#c0392b" strokeWidth={2} />
      <g clipPath={`url(#${clipId})`}>
        <rect x={ix - R} y={iy - R} width={R * 2} height={R * 2} fill="#cdeaff" />
        {c.d ? (
          <path d={c.d} fill="#ff7d6b" stroke="#c0392b" strokeWidth={1.2 / zoomIn}
            transform={`translate(${ix} ${iy}) scale(${zoomIn}) translate(${-c.cx} ${-c.cy})`} />
        ) : (
          <circle cx={ix} cy={iy} r={7} fill="#ff5c46" stroke="#c0392b" strokeWidth={1.5} />
        )}
      </g>
    </g>
  );
}

/* ---------- 世界地図 ---------- */
function WorldMap({ view = WORLD_VIEW, target, revealed, animate = true, height = "30vh",
                    masteryColor, onTapCountry, tappableCont, selected }) {
  const { s, tx, ty } = view;
  const inset = target && showInsetFor(target, view) ? target : null;
  return (
    <div style={{
      overflow: "hidden", borderRadius: 20,
      background: "linear-gradient(180deg,#cdeaff,#a9d8f5)",
      boxShadow: "inset 0 2px 10px rgba(40,90,140,.18)",
    }}>
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid slice"
        style={{ display: "block", width: "100%", height }}>
        <g style={{
          transform: `translate(${tx}px, ${ty}px) scale(${s})`,
          transition: animate ? "transform 1.1s cubic-bezier(.45,.05,.25,1)" : "none",
        }}>
          {/* 経緯線グリッド（15度きざみ）＋赤道 */}
          <path d={GRATICULE} fill="none" stroke="rgba(50,110,170,.30)" strokeWidth={0.7 / s} />
          <path d={EQUATOR} fill="none" stroke="rgba(230,120,60,.55)" strokeWidth={1.1 / s} strokeDasharray={`${5 / s} ${3 / s}`} />
          {/* 196か国いがいの陸地（グレー） */}
          <path d={OTHER_LAND} fill="#ddd6c6" stroke="none" />
          {COUNTRIES.filter((c) => c.d).map((c) => {
            const isTarget = target && target.id === c.id && !c.micro;
            const fill = isTarget
              ? (revealed ? "#ffd83d" : "#ff7d6b")
              : selected && selected.id === c.id ? "#ffd83d"
              : masteryColor ? masteryColor(c)
              : CONT[c.cont].color;
            return (
              <path key={c.id} d={c.d} fill={fill}
                stroke={isTarget ? "#c0392b" : "none"}
                strokeWidth={1.6 / s}
                strokeLinejoin="round"
                style={isTarget && !revealed ? { animation: "targetBlink 1s ease-in-out infinite" } : {}}
              />
            );
          })}
          {/* 海岸線と国境線（アトラス風の1本線） */}
          <path d={COAST} fill="none" stroke="rgba(55,95,140,.55)" strokeWidth={0.5 / s} strokeLinejoin="round" />
          <path d={BORDERS} fill="none" stroke="#6f563c" strokeWidth={0.6 / s} strokeLinejoin="round" />
          {/* 小国マーカー（ポリゴンなしの国は常に丸で表示） */}
          {COUNTRIES.filter((c) => c.micro).map((c) => {
            const isTarget = target && target.id === c.id;
            return (
              <circle key={c.id} cx={c.cx} cy={c.cy} r={(isTarget ? 7 : 3.2) / s}
                fill={isTarget ? (revealed ? "#ffd83d" : "#ff5c46") : selected && selected.id === c.id ? "#ffd83d" : masteryColor ? masteryColor(c) : "#fff"}
                stroke={isTarget ? "#c0392b" : "#8fb6d4"} strokeWidth={1.2 / s}
                style={isTarget && !revealed ? { animation: "pulse 1s ease-in-out infinite" } : {}}
              />
            );
          })}
          {/* ターゲットの位置リング（ポリゴン国にも重ねて場所を強調） */}
          {target && !revealed && (
            <circle cx={byId.get(target.id).cx} cy={byId.get(target.id).cy} r={14 / s}
              fill="none" stroke="#ff3b1f" strokeWidth={2.4 / s} strokeDasharray={`${6 / s} ${4 / s}`}
              style={{ animation: "pulse 1.2s ease-in-out infinite" }} />
          )}
          {/* タップレイヤー（せかいマップ画面用・44px相当の透明円） */}
          {onTapCountry && COUNTRIES.filter((c) => c.cont === tappableCont).map((c) => (
            <circle key={"tap-" + c.id} cx={c.cx} cy={c.cy} r={16 / s}
              fill="rgba(255,255,255,0.001)" style={{ cursor: "pointer" }}
              onClick={() => onTapCountry(c)} />
          ))}
          {target && revealed && (
            <text x={byId.get(target.id).cx} y={byId.get(target.id).cy - 10 / s} textAnchor="middle"
              fontSize={13 / s} fontWeight="900" fill="#6b4a00"
              stroke="#fff" strokeWidth={3 / s} paintOrder="stroke" style={{ pointerEvents: "none" }}>
              {plain(target.n)}
            </text>
          )}
        </g>
        {inset && <CountryInset c={inset} s={s} tx={tx} ty={ty} />}
      </svg>
    </div>
  );
}

/* ---------- 国旗 ---------- */
function Flag({ c, w = 96, style }) {
  return (
    <img src={`./flags/${c.flag}.svg`} alt="" width={w} height={w * 0.75}
      style={{ borderRadius: 6, boxShadow: "0 2px 6px rgba(0,0,0,.2)", border: "1px solid rgba(0,0,0,.1)", background: "#fff", ...style }} />
  );
}

/* ---------- サウンド / かみふぶき / ボタン（日本版から流用） ---------- */
let audioCtx = null;
function getCtx() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  } catch (e) { return null; }
}
function tone(freq, start, dur, type = "sine", vol = 0.18) {
  const ctx = getCtx(); if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.05);
}
const sndCorrect = () => { tone(880, 0, 0.12); tone(1320, 0.12, 0.22); };
const sndWrong = () => { tone(220, 0, 0.25, "square", 0.08); tone(180, 0.2, 0.3, "square", 0.08); };
const sndSpecial = () => { tone(196, 0, 0.16, "square", 0.14); tone(392, 0.3, 0.4, "triangle", 0.16); };
const sndGacha = () => { for (let i = 0; i < 6; i++) tone(300 + Math.random() * 500, i * 0.09, 0.07, "triangle", 0.1); };
const sndReveal = (ra) => {
  const lv = RARITY[ra] ? RARITY[ra].lv : 0;
  const scale = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568];
  const n = Math.min(3 + lv, scale.length);
  for (let i = 0; i < n; i++) tone(scale[i], i * 0.09, 0.35);
  if (lv >= 7) for (let i = 0; i < 4; i++) tone(1568 + i * 220, 0.85 + i * 0.09, 0.3, "triangle", 0.12);
};

const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const PRAISE = ["ピンポーン！", "すごい！", "てんさい！", "やったね！", "かんぺき！", "はかせみたい！"];

function Confetti({ count = 24 }) {
  const items = ["🎉", "⭐", "🌍", "✨", "🎊"];
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 50 }}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} style={{
          position: "absolute", left: `${Math.random() * 100}%`, top: "-8%",
          fontSize: 16 + Math.random() * 18,
          animation: `fall ${1.6 + Math.random() * 1.6}s linear ${Math.random() * 0.6}s forwards`,
        }}>{pick(items)}</span>
      ))}
    </div>
  );
}
function BigBtn({ children, onClick, color = "#3d8fe0", disabled, style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "block", width: "100%", padding: "14px 18px", border: "none",
      borderRadius: 18, background: disabled ? "#d8d0c4" : color, color: "#fff",
      fontSize: 19, fontWeight: 800, cursor: disabled ? "default" : "pointer",
      boxShadow: disabled ? "none" : "0 4px 0 rgba(0,0,0,.18)",
      fontFamily: "inherit", letterSpacing: ".04em", transition: "transform .08s", ...style,
    }}
      onPointerDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(.96)"; }}
      onPointerUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      onPointerLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >{children}</button>
  );
}

/* ---------- セーブ（3スロット習熟度・プロフィール2枠） ---------- */

const SLOTS = ["name", "flag", "cap"];
const SLOT_LABEL = { name: "くにのなまえ", flag: "こっき", cap: "しゅと" };
const SLOT_ICON = { name: "🗺️", flag: "🚩", cap: "🏛️" };
const MASTER_AT = 2; /* スロットは2回正解でマスター */
const slotOfQ = (qt) => (qt === "capital" ? "cap" : qt === "flag" ? "flag" : "name");
const progOf = (save, id) => save.prog[id] || { name: 0, flag: 0, cap: 0 };
const masteredSlots = (save, id) => SLOTS.filter((s) => progOf(save, id)[s] >= MASTER_AT).length;

/* ---------- 出題生成 ---------- */
const N_Q = 10;
/* モードごとの出題タイプ
   name    … 地図で光る＋国旗＋ヒント → 国名4択
   capital … 国旗＋国名 → 首都4択
   flag    … 国旗だけ → 国名4択（ヒントなし・地図はこたえ発表で）
   random  … 上の3つをミックス */
function qTypeFor(mode) {
  if (mode === "random") {
    const r = Math.random();
    return r < 0.4 ? "name" : r < 0.7 ? "flag" : "capital";
  }
  return mode;
}
function pickTargets(save, region = "world") {
  /* 地域でしぼり、未マスターのスロットが多い国を優先（重み付き抽選） */
  const pool = COUNTRIES.filter(QUIZ_REGIONS[region].f);
  const weighted = pool.map((c) => ({ c, w: 1 + (3 - masteredSlots(save, c.id)) * 3 }));
  const out = [];
  const used = new Set();
  while (out.length < N_Q) {
    const total = weighted.reduce((a, x) => a + (used.has(x.c.id) ? 0 : x.w), 0);
    let roll = Math.random() * total;
    for (const x of weighted) {
      if (used.has(x.c.id)) continue;
      if (roll < x.w) { out.push(x.c); used.add(x.c.id); break; }
      roll -= x.w;
    }
  }
  return out;
}
function autoHints(c) {
  /* ヒント未整備の国のつなぎ：大陸ヒント＋面積ヒント */
  const jp = byId.get("JPN");
  const ratio = c.area / jp.area;
  const sizeHint = ratio >= 1.5 ? `{日本|にほん}の やく${Math.round(ratio)}ばいの {広|ひろ}さ`
    : ratio >= 0.7 ? `{日本|にほん}と だいたい おなじ {広|ひろ}さ`
    : ratio >= 0.05 ? `{日本|にほん}の やく${Math.max(2, Math.round(1 / ratio))}ぶんの1の {広|ひろ}さ`
    : `とても {小|ちい}さな {国|くに}`;
  return [
    { t: "nature", s: `${CONT[c.cont].label}に ある {国|くに}` },
    { t: "nature", s: sizeHint },
  ];
}
function buildQuiz(save, mode, region = "world") {
  return pickTargets(save, region).map((c) => {
    const qType = qTypeFor(mode);
    const hints = c.h ? shuffle([...c.h]).slice(0, Math.random() < 0.5 ? 3 : 4) : autoHints(c);
    return {
      c, qType, hints,
      choices: makeChoices(c, qType === "capital" ? "cap" : "name"),
    };
  });
}

/* たいせん（たいりくせいは）用：未占領の国から国名問題を1問つくる */
function makeVsQuestion(terr, lastId) {
  const unclaimed = COUNTRIES.filter((c) => terr[c.id] === undefined);
  const pool = unclaimed.length > 1 ? unclaimed.filter((c) => c.id !== lastId) : unclaimed;
  const c = pick(pool.length ? pool : COUNTRIES);
  const hints = c.h ? shuffle([...c.h]).slice(0, 3) : autoHints(c);
  return { c, qType: "name", hints, choices: makeChoices(c, "name") };
}

/* 正解した国の「まわりの国」＝地図上でいちばん近い未占領国をn個えらぶ */
function nearestUnclaimed(terr, target, n) {
  if (n <= 0) return [];
  return COUNTRIES
    .filter((c) => c.id !== target.id && terr[c.id] === undefined)
    .map((c) => ({ c, d: (c.cx - target.cx) ** 2 + (c.cy - target.cy) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.c);
}

/* ================= メイン ================= */
export default function App() {
  const [screen, setScreen] = useState("home");
  const [saveDoc, setSaveDoc] = useState(emptySaveV2);
  const save = saveDoc.profiles[saveDoc.activeProfile];
  const [quiz, setQuiz] = useState([]);
  const [quizMode, setQuizMode] = useState("random");
  const [quizRegion, setQuizRegion] = useState("world");
  const [pendingMode, setPendingMode] = useState(null); // 地域選択まちのモード
  const [qIdx, setQIdx] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [phase, setPhase] = useState("zoom");
  const [picked, setPicked] = useState(null);
  const [praise, setPraise] = useState("");
  const [zoomStage, setZoomStage] = useState("world"); // world|continent|country（§2.2.2 2段ズーム）
  const [showQ, setShowQ] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [mapCont, setMapCont] = useState(null);   // せかいマップの大陸ズーム
  const [selC, setSelC] = useState(null);
  const answerLockRef = useRef(false);

  /* たいりくせいは（2人対戦じんとり） */
  const [vsN, setVsN] = useState(30);
  const [vsIdx, setVsIdx] = useState(0);
  const [vsTerr, setVsTerr] = useState({});
  const [vsTurn, setVsTurn] = useState(0);
  const [vsQ, setVsQ] = useState(null);
  const [vsPhase, setVsPhase] = useState("turn"); // turn | zoom | answer | feedback
  const [vsPicked, setVsPicked] = useState(null);
  const [vsEvent, setVsEvent] = useState(null);   // "double" | null（Wゲットチャンス）
  const [vsBonus, setVsBonus] = useState([]);     // 正解でもらえたおまけの国

  /* ガチャ */
  const [gachaPhase, setGachaPhase] = useState("ready"); // ready | spin | drop | open
  const [gachaResult, setGachaResult] = useState(null);
  const [gachaMode, setGachaMode] = useState("normal");  // normal | rainbow | celeb
  const [gachaFrom, setGachaFrom] = useState("solo");    // solo | vs

  /* せかいのたび（10問=であい3/みわける4/ちょうせん2/おかえり1・3段はしご・再出題ルール） */
  const [trip, setTrip] = useState(null);         // 選択中のパック
  const [tripQuiz, setTripQuiz] = useState([]);    // 選択肢まで付与済みの10問セッション
  const [tIdx, setTIdx] = useState(0);
  const [tAttempt, setTAttempt] = useState(1);     // 同一問題への何回目の解答か（1=初回）
  const [tOutcome, setTOutcome] = useState(null);  // tripAnswerOutcome() の結果
  const [tCorrectCount, setTCorrectCount] = useState(0); // 初回正解数（けっか表示用）
  const [tPhase, setTPhase] = useState("cardintro"); // cardintro | zoom | answer | feedback
  const [tPicked, setTPicked] = useState(null);
  const [tZoomed, setTZoomed] = useState(false);
  const [tShowQ, setTShowQ] = useState(false);
  const [tStampResult, setTStampResult] = useState(null); // { stampValue, correctCount, total }
  const tAnswerLockRef = useRef(false);

  useEffect(() => { setSaveDoc(loadSaveV2()); }, []);
  const updateSave = useCallback((up) => {
    setSaveDoc((prev) => {
      const cur = prev.profiles[prev.activeProfile];
      const nextProfile = typeof up === "function" ? up(cur) : up;
      const next = { ...prev, profiles: { ...prev.profiles, [prev.activeProfile]: nextProfile } };
      persistSaveV2(next);
      return next;
    });
  }, []);
  const switchProfile = useCallback((pid) => {
    setSaveDoc((prev) => {
      if (prev.activeProfile === pid || !prev.profiles[pid]) return prev;
      const next = { ...prev, activeProfile: pid };
      persistSaveV2(next);
      return next;
    });
  }, []);

  const startQuiz = (mode, region = "world") => {
    getCtx();
    setQuizMode(mode); setQuizRegion(region);
    setQuiz(buildQuiz(save, mode, region));
    setQIdx(0); setCorrectCount(0); setPicked(null); setPhase("zoom");
    setScreen("quiz");
  };
  /* 国名・首都・こっきモードは先に地域をえらぶ */
  const chooseMode = (mode) => {
    if (mode === "random") { startQuiz("random", "world"); return; }
    setPendingMode(mode);
    setScreen("regionSelect");
  };

  const startVs = (n) => {
    getCtx();
    setVsN(n); setVsIdx(0); setVsTerr({});
    const q = makeVsQuestion({}, null);
    setVsQ(q); setVsTurn(0); setVsPicked(null); setVsEvent(null); setVsBonus([]); setVsPhase("turn");
    setScreen("vs");
  };

  /* ズーム演出（§2.2.2 2段ズーム: 世界 → 大陸(0.4s) → 対象周辺(0.4s)） */
  useEffect(() => {
    if (screen !== "quiz" || phase !== "zoom") return;
    const q = quiz[qIdx];
    setZoomStage("world"); setShowQ(false);
    answerLockRef.current = false;
    const timers = [];
    const showsMap = q.qType !== "flag"; /* こっきモードは地図なし（こたえ発表でズーム） */
    if (showsMap) {
      timers.push(setTimeout(() => setZoomStage("continent"), 400));
      timers.push(setTimeout(() => setZoomStage("country"), 800));
    }
    timers.push(setTimeout(() => { setShowQ(true); setPhase("answer"); }, showsMap ? 1500 : 600));
    return () => timers.forEach(clearTimeout);
  }, [screen, phase, qIdx]);

  /* よみあげ（voice:trueのプロフィールのみ・失敗時は無音でフォールバック） */
  useEffect(() => {
    if (screen !== "quiz" || !save.voice) return;
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) return;
    const q = quiz[qIdx];
    if (!q) return;
    let text = null;
    if (showQ && phase === "answer") {
      text = q.qType === "capital" ? `${plain(q.c.n)}の しゅとは どこかな？`
        : q.qType === "flag" ? "このこっきは どこのくにかな？"
        : "ここは どこかな？";
    } else if (phase === "feedback") {
      text = `こたえは ${plain(q.c.n)}だよ`;
    }
    if (!text) return;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      synth.speak(u);
    } catch (e) { /* 読み上げ失敗時は無音でフォールバック */ }
  }, [screen, phase, showQ, qIdx, save.voice]);

  const applyResult = (q, ok) => {
    setPhase("feedback");
    if (ok) {
      sndCorrect(); setPraise(pick(PRAISE));
      setCorrectCount((c) => c + 1);
      setConfetti(true); setTimeout(() => setConfetti(false), 2000);
      const slot = slotOfQ(q.qType);
      updateSave((s) => ({
        ...s,
        prog: { ...s.prog, [q.c.id]: { ...progOf(s, q.c.id), [slot]: progOf(s, q.c.id)[slot] + 1 } },
        recent: pushRecent(s.recent, true),
      }));
    } else {
      sndWrong();
      updateSave((s) => ({ ...s, recent: pushRecent(s.recent, false) }));
    }
  };
  const answer = (choice) => {
    if (phase !== "answer" || answerLockRef.current) return;
    answerLockRef.current = true;
    const q = quiz[qIdx];
    setPicked(choice);
    applyResult(q, choice.id === q.c.id);
  };
  const nextQ = () => {
    if (qIdx + 1 >= quiz.length) {
      updateSave((s) => ({ ...s, plays: s.plays + 1, perfects: s.perfects + (correctCount === quiz.length ? 1 : 0) }));
      setScreen("result");
    } else { setQIdx((i) => i + 1); setPicked(null); setPhase("zoom"); }
  };

  /* --- せかいのたび：セッション開始（§5.2） --- */
  const startTrip = (pack) => {
    getCtx();
    const now = Date.now();
    const raw = buildTripSession(COUNTRIES, save, pack, { now });
    const withChoices = raw.map((item) => {
      if (item.qType === "meet2") {
        const wrong = pickMeetWrong(COUNTRIES, item.c, FLAG_GROUPS);
        return { ...item, choices: shuffle([item.c, wrong]) };
      }
      if (item.qType === "map") return item; // 選択肢なし：地図タップで解答
      const field = item.qType === "capital" ? "cap" : "name";
      const opts = {
        difficulty: hiddenDifficultyOf(save.recent),
        learnedIds: COUNTRIES.filter((c) => stageOf(save, c.id) >= 1).map((c) => c.id),
        flagGroups: FLAG_GROUPS,
      };
      return { ...item, choices: makeChoices(item.c, field, opts) };
    });
    setTrip(pack);
    setTripQuiz(withChoices);
    setTIdx(0); setTAttempt(1); setTOutcome(null); setTCorrectCount(0);
    setTPicked(null); setTStampResult(null);
    setTPhase(withChoices[0].qType === "meet2" ? "cardintro" : "zoom");
    setScreen("trip");
  };

  /* たびのズーム演出（であい以外）。タップでスキップ可 */
  useEffect(() => {
    if (screen !== "trip" || tPhase !== "zoom") return;
    const item = tripQuiz[tIdx];
    if (!item) return;
    setTZoomed(false); setTShowQ(false);
    tAnswerLockRef.current = false;
    const timers = [];
    const showsMap = item.qType !== "flag";
    if (showsMap) timers.push(setTimeout(() => setTZoomed(true), 450));
    timers.push(setTimeout(() => { setTShowQ(true); setTPhase("answer"); }, showsMap ? 1500 : 600));
    return () => timers.forEach(clearTimeout);
  }, [screen, tPhase, tIdx, tripQuiz]);

  const skipTripZoom = () => {
    if (tPhase !== "zoom") return;
    setTZoomed(true); setTShowQ(true); setTPhase("answer");
  };
  const skipTripIntro = () => {
    if (tPhase !== "cardintro") return;
    tAnswerLockRef.current = false;
    setTShowQ(true); setTPhase("answer");
  };

  const finishTripAttempt = (item, ok) => {
    const outcome = tripAnswerOutcome(tAttempt, ok);
    setTPhase("feedback");
    setTOutcome(outcome);
    if (ok) {
      sndCorrect(); setPraise(pick(PRAISE));
      setConfetti(true); setTimeout(() => setConfetti(false), 2000);
    } else {
      sndWrong();
    }
    if (outcome.updateSave) {
      if (ok) setTCorrectCount((n) => n + 1);
      updateSave((s) => applyTripAnswer(s, item.c, item.qType, ok, tAttempt, Date.now()));
    }
  };
  const tripAnswer = (choice) => {
    if (tPhase !== "answer" || tAnswerLockRef.current) return;
    tAnswerLockRef.current = true;
    const item = tripQuiz[tIdx];
    setTPicked(choice);
    finishTripAttempt(item, choice.id === item.c.id);
  };
  const tripMapAnswer = (tapped) => {
    if (tPhase !== "answer" || tAnswerLockRef.current) return;
    tAnswerLockRef.current = true;
    const item = tripQuiz[tIdx];
    setTPicked(tapped);
    finishTripAttempt(item, tapped.id === item.c.id);
  };
  const tripRetry = () => {
    tAnswerLockRef.current = false;
    setTAttempt((n) => n + 1);
    setTPicked(null);
    setTOutcome(null);
    setTripQuiz((prev) => {
      const next = [...prev];
      const item = next[tIdx];
      next[tIdx] = item.choices ? { ...item, choices: shuffle(item.choices) } : item;
      return next;
    });
    setTPhase("answer");
  };
  const tripNext = () => {
    const isLast = tIdx + 1 >= tripQuiz.length;
    if (isLast) {
      // updateSave()のupdaterはReactの次のレンダーまで実行されないため、
      // 表示用のスタンプ値はコミット済みの現在のsaveから同期的に算出する
      const stampValue = computeStampValue(save, trip);
      updateSave((s) => finishTrip(s, trip, Date.now()));
      setTStampResult({ stampValue, correctCount: tCorrectCount, total: tripQuiz.length });
      setScreen("tripResult");
    } else {
      const nextIdx = tIdx + 1;
      const nextItem = tripQuiz[nextIdx];
      setTIdx(nextIdx); setTAttempt(1); setTOutcome(null); setTPicked(null);
      setTPhase(nextItem.qType === "meet2" ? "cardintro" : "zoom");
    }
  };
  const tripAdvanceOrRetry = () => {
    if (tOutcome && tOutcome.retry) tripRetry();
    else tripNext();
  };

  /* --- たいりくせいは：ターン演出 → ズーム（§2.2.2 2段ズーム） → 回答 --- */
  useEffect(() => {
    if (screen !== "vs") return;
    if (vsPhase === "turn") {
      setZoomStage("world");
      const t = setTimeout(() => setVsPhase("zoom"), vsEvent ? 2200 : 1400);
      return () => clearTimeout(t);
    }
    if (vsPhase === "zoom") {
      answerLockRef.current = false;
      const timers = [
        setTimeout(() => setZoomStage("continent"), 400),
        setTimeout(() => setZoomStage("country"), 700),
        setTimeout(() => setVsPhase("answer"), 1400),
      ];
      return () => timers.forEach(clearTimeout);
    }
  }, [screen, vsPhase, vsIdx]);

  const vsAnswer = (choice) => {
    if (vsPhase !== "answer" || answerLockRef.current) return;
    answerLockRef.current = true;
    const ok = choice.id === vsQ.c.id;
    setVsPicked(choice);
    setVsPhase("feedback");
    if (ok) {
      sndCorrect(); setPraise(pick(PRAISE));
      /* ぜんぶとりきり(196)は となりの国も+1。Wゲットは おまけ+2 */
      const isFull = vsN >= 99999;
      const bonusN = vsEvent === "double" ? 2 : isFull ? 1 : 0;
      const terrAfter = { ...vsTerr, [vsQ.c.id]: vsTurn };
      const bonus = nearestUnclaimed(terrAfter, vsQ.c, bonusN);
      setVsBonus(bonus);
      setVsTerr(() => {
        const next = { ...terrAfter };
        bonus.forEach((b) => { next[b.id] = vsTurn; });
        return next;
      });
      setConfetti(true); setTimeout(() => setConfetti(false), 1800);
    } else {
      sndWrong(); setVsBonus([]); /* まちがえた国は未占領のまま。あとでまた出てくる */
    }
  };

  const vsNext = () => {
    const claimed = Object.keys(vsTerr).length;
    const finished = claimed >= COUNTRIES.length || vsIdx + 1 >= vsN;
    if (finished) { setScreen("vsResult"); return; }
    const nextIdx = vsIdx + 1;
    const turn = nextIdx % 2;
    /* Wゲットチャンス：5問目以降、まけている側に25%で発生 */
    const counts = [0, 0];
    Object.values(vsTerr).forEach((o) => counts[o]++);
    const behind = counts[turn] < counts[1 - turn];
    const event = behind && nextIdx >= 4 && Math.random() < 0.25 ? "double" : null;
    if (event) sndSpecial();
    setVsIdx(nextIdx);
    setVsQ(makeVsQuestion(vsTerr, vsQ ? vsQ.c.id : null));
    setVsTurn(turn);
    setVsPicked(null);
    setVsEvent(event);
    setVsBonus([]);
    setVsPhase("turn");
  };

  /* --- ガチャ --- */
  const goGacha = (mode, from) => {
    setGachaMode(mode); setGachaFrom(from);
    setGachaPhase("ready"); setGachaResult(null);
    setScreen("gacha");
  };
  const spinGacha = () => {
    sndGacha();
    setGachaPhase("spin");
    const result = rollGacha(gachaMode, save, masteredCount);
    setTimeout(() => { setGachaResult(result); setGachaPhase("drop"); }, 1400);
  };
  const openCapsule = () => {
    if (!gachaResult) return;
    sndReveal(gachaResult.ra);
    setGachaPhase("open");
    setConfetti(true);
    setTimeout(() => setConfetti(false), 2600);
    updateSave((sv) => ({
      ...sv,
      stickers: { ...sv.stickers, [gachaResult.id]: (sv.stickers[gachaResult.id] || 0) + 1 },
    }));
  };

  const masteredCount = useMemo(() => COUNTRIES.filter((c) => masteredSlots(save, c.id) === SLOTS.length).length, [save]);

  const wrap = {
    minHeight: "100vh", background: "linear-gradient(180deg,#eaf6ff,#d7ecff)",
    fontFamily: "'Hiragino Maru Gothic ProN','BIZ UDPGothic','Yu Gothic','Meiryo',sans-serif",
    color: "#2a3a4a", padding: "16px 14px 32px", boxSizing: "border-box",
  };
  const card = {
    background: "#fbfdff", borderRadius: 22, padding: 16,
    boxShadow: "0 6px 18px rgba(40,80,120,.12)", maxWidth: 480, margin: "0 auto 14px",
  };
  const css = `
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
    @keyframes targetBlink { 0%,100%{fill:#ff5c46} 50%{fill:#ffd83d} }
    @keyframes fall { to { transform: translateY(110vh) rotate(360deg); } }
    @keyframes pop { 0%{transform:scale(0)} 70%{transform:scale(1.15)} 100%{transform:scale(1)} }
    @keyframes floaty { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
    @keyframes wiggle { 0%,100%{transform:rotate(-6deg)} 50%{transform:rotate(6deg)} }
    @keyframes bounce { 0%{transform:translateY(-160px)} 55%{transform:translateY(0)} 72%{transform:translateY(-26px)} 100%{transform:translateY(0)} }
    @keyframes spinHandle { from{transform:rotate(0)} to{transform:rotate(720deg)} }
    @keyframes rainbowBg { 0%{filter:hue-rotate(0)} 100%{filter:hue-rotate(360deg)} }
    @keyframes glowPulse { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.3)} }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
    ruby rt { user-select: none; }
  `;

  /* ===== ホーム ===== */
  if (screen === "home") {
    return (
      <div style={wrap}><style>{css}</style>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "#7a8aa0" }}>👧 だれが あそぶ？</span>
          {["p1", "p2"].map((pid) => {
            const active = saveDoc.activeProfile === pid;
            const label = saveDoc.profiles[pid].name === "（入力）"
              ? (pid === "p1" ? "① ひとりめ" : "② ふたりめ")
              : saveDoc.profiles[pid].name;
            return (
              <button key={pid} onClick={() => switchProfile(pid)} style={{
                padding: "5px 14px", borderRadius: 999, fontFamily: "inherit",
                border: active ? "2.5px solid #2f7fd4" : "2.5px solid #d5dfe9",
                background: active ? "#eaf6ff" : "#fff", color: "#2a3a4a",
                fontWeight: 800, fontSize: 13, cursor: "pointer",
              }}>{label}</button>
            );
          })}
        </div>
        <div style={{ textAlign: "center", margin: "10px 0 6px" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#5a7ba0", letterSpacing: ".25em" }}>196かこくを マスターしよう</div>
          <h1 style={{ margin: "4px 0", fontSize: 34, fontWeight: 900, color: "#2f7fd4", textShadow: "0 3px 0 rgba(0,0,0,.08)" }}>
            せかいちず<br />クエスト
          </h1>
          <div style={{ fontSize: 30, animation: "floaty 2.4s ease-in-out infinite", display: "inline-block" }}>🌍✨</div>
        </div>
        <div style={card}>
          <WorldMap height="24vh" masteryColor={(c) => {
            const m = masteredSlots(save, c.id);
            return m === SLOTS.length ? "#ffd24d" : m > 0 ? CONT[c.cont].color : "#e8e2d5";
          }} />
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 15, fontWeight: 800 }}>
            マスターした{" "}<Ruby t={"{国|くに}"} />：<span style={{ color: "#2f7fd4", fontSize: 20 }}>{masteredCount}</span> / 196
          </div>
          <div style={{ textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "#7a8aa0", marginTop: 4 }}>
            🗺️なまえ・🚩こっき・🏛️しゅと の 3つを おぼえると きんいろに！
          </div>
        </div>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "grid", gap: 10 }}>
          <BigBtn color="#3dae7a" onClick={() => setScreen("tripHome")} style={{ fontSize: 22 }}>🧳 せかいのたび</BigBtn>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <BigBtn color="#2f9fd4" onClick={() => chooseMode("name")} style={{ fontSize: 17 }}>🗺️ せかい国名<br/>モード</BigBtn>
            <BigBtn color="#7a5fd4" onClick={() => chooseMode("capital")} style={{ fontSize: 17 }}>🏛️ しゅと<br/>モード</BigBtn>
            <BigBtn color="#e0663d" onClick={() => chooseMode("flag")} style={{ fontSize: 17 }}>🚩 こっき<br/>モード</BigBtn>
            <BigBtn color="#4cae6e" onClick={() => chooseMode("random")} style={{ fontSize: 17 }}>🎲 ランダム<br/>モード</BigBtn>
          </div>
          <BigBtn color="#e8484f" onClick={() => setScreen("vsSetup")} style={{ fontSize: 21 }}>⚔️ たいりくせいは（ふたりで たいせん）</BigBtn>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <BigBtn color="#5aa7e8" onClick={() => setScreen("book")}>📒 シールずかん</BigBtn>
            <BigBtn color="#8aa0b8" onClick={() => { setMapCont(null); setSelC(null); setScreen("map"); }}>🌍 せかいマップ</BigBtn>
          </div>
        </div>
        <div style={{ ...card, marginTop: 14, display: "flex", justifyContent: "space-around", textAlign: "center", fontSize: 13, fontWeight: 700 }}>
          <div>🎮 あそんだ<br /><span style={{ fontSize: 20, color: "#2f7fd4" }}>{save.plays}</span> かい</div>
          <div>🌟 ぜんもんせいかい<br /><span style={{ fontSize: 20, color: "#2f7fd4" }}>{save.perfects}</span> かい</div>
          <div>🎁 シール<br /><span style={{ fontSize: 20, color: "#2f7fd4" }}>{Object.values(save.stickers || {}).reduce((a, b) => a + b, 0)}</span> まい</div>
        </div>
      </div>
    );
  }

  /* ===== クイズ ===== */
  if (screen === "quiz") {
    const q = quiz[qIdx];
    const isCorrect = picked && picked.id === q.c.id;
    const qt = q.qType;
    const view = phase === "feedback" || zoomStage === "country" ? viewForCountry(q.c)
      : zoomStage === "continent" ? CONT_VIEW[q.c.cont]
      : WORLD_VIEW;
    return (
      <div style={{ ...wrap, minHeight: "auto", height: "100dvh", padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <style>{css}</style>
        {confetti && <Confetti />}

        {/* すすみぐあい */}
        <div style={{ flex: "none", display: "flex", justifyContent: "center", alignItems: "center", gap: 6, padding: "6px 0 4px" }}>
          {quiz.map((_, i) => (
            <div key={i} style={{
              width: i === qIdx ? 14 : 10, height: i === qIdx ? 14 : 10, borderRadius: "50%",
              background: i < qIdx ? "#4cae6e" : i === qIdx ? "#2f9fd4" : "#c9d8e8", transition: "all .3s",
            }} />
          ))}
        </div>

        {/* 地図 or 国旗エリア */}
        <div style={{ flex: "none", padding: "0 12px", position: "relative", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          {qt === "flag" && phase !== "feedback" ? (
            <div style={{
              height: "27vh", borderRadius: 20, background: "linear-gradient(180deg,#fff,#eef4fb)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "inset 0 2px 10px rgba(40,90,140,.12)",
            }}>
              <Flag c={q.c} w={160} style={{ animation: "floaty 2.4s ease-in-out infinite" }} />
            </div>
          ) : (
            <WorldMap
              view={view}
              target={q.c}
              revealed={phase === "feedback"}
              height="27vh"
            />
          )}
          {phase === "feedback" && (
            <div style={{
              position: "absolute", left: "50%", bottom: 10, transform: "translateX(-50%)",
              background: isCorrect ? "#3f9c3a" : "#d05a4a", color: "#fff", padding: "6px 18px",
              borderRadius: 999, fontWeight: 900, fontSize: 17, whiteSpace: "nowrap",
              boxShadow: "0 3px 8px rgba(0,0,0,.25)", animation: "pop .35s",
            }}>
              {isCorrect ? `⭕ ${praise}` : "❌ ざんねん！"}
            </div>
          )}
        </div>

        {/* もんだいカード */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "8px 14px", paddingBottom: phase === "feedback" ? 88 : 10, maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          <div style={{ ...card, margin: 0, padding: "10px 12px", opacity: showQ ? 1 : 0, transform: showQ ? "translateY(0)" : "translateY(12px)", transition: "all .45s" }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: "#2f7fd4", marginBottom: 6 }}>
              {qt === "name" && <Ruby t={"ここは ど〜こだ？（{第|だい}" + (qIdx + 1) + "{問|もん}）"} />}
              {qt === "capital" && <Ruby t={"この {国|くに}の しゅとは ど〜こだ？"} />}
              {qt === "flag" && <Ruby t={"この こっきは どこの {国|くに}かな？"} />}
            </div>

            {/* 国旗はいつも問題とセットで表示（こっきモードは上に大きく出ている） */}
            {qt !== "flag" && (
            <div style={{ display: "flex", gap: 12, alignItems: qt === "capital" ? "center" : "flex-start" }}>
              <Flag c={q.c} w={62} style={{ flex: "none", marginTop: 2 }} />
              {qt === "name" ? (
                <ul style={{ margin: 0, paddingLeft: 14, fontSize: 13.5, lineHeight: 1.7, fontWeight: 700, flex: 1 }}>
                  {q.hints.map((h, i) => (
                    <li key={i}>{HINT_ICON[h.t] || ""} <Ruby t={h.s} /></li>
                  ))}
                  <li style={{ color: "#9a6b2f" }}>🏛️ しゅとは <Ruby t={q.c.cap} /></li>
                </ul>
              ) : (
                <div style={{ flex: 1, fontSize: 21, fontWeight: 900 }}>
                  {q.c.k ? <ruby>{q.c.n}<rt style={{ fontSize: "0.5em", color: "#7a8aa0" }}>{q.c.k}</rt></ruby> : q.c.n}
                </div>
              )}
            </div>
            )}

            {q.choices && (
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {q.choices.map((c) => {
                  const label = qt === "capital" ? c.cap : null;
                  let bg = "#fff", border = "#bcd2e8";
                  if (phase === "feedback") {
                    if (c.id === q.c.id) { bg = "#e0f6db"; border = "#7ac974"; }
                    else if (picked && c.id === picked.id) { bg = "#fde3df"; border = "#ef8a7a"; }
                  }
                  return (
                    <button key={c.id} onClick={() => answer(c)} disabled={phase !== "answer"}
                      style={{
                        padding: "7px 10px", borderRadius: 13, border: `2.5px solid ${border}`,
                        background: bg, fontSize: 16, fontWeight: 800, fontFamily: "inherit",
                        cursor: phase === "answer" ? "pointer" : "default", textAlign: "center", color: "#2a3a4a",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      }}>
                      {label
                        ? <Ruby t={label} />
                        : c.k ? <ruby>{c.n}<rt style={{ fontSize: "0.5em", color: "#7a8aa0" }}>{c.k}</rt></ruby> : c.n}
                    </button>
                  );
                })}
              </div>
            )}

            {phase === "feedback" && (
              <div style={{ marginTop: 8, textAlign: "center", fontSize: 13.5, fontWeight: 800, color: "#5a7ba0" }}>
                {!isCorrect && (
                  <div>こたえは「{qt === "capital" ? <Ruby t={q.c.cap} /> : q.c.n}」だよ。つぎは きっと できる！</div>
                )}
                <div style={{ marginTop: 6, display: "flex", justifyContent: "center", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Flag c={q.c} w={44} />
                  <b>{q.c.n}</b>
                  <span>🏛️ <Ruby t={q.c.cap} /></span>
                  <span style={{ fontSize: 11, background: CONT[q.c.cont].color, padding: "2px 9px", borderRadius: 999 }}>{CONT[q.c.cont].label}</span>
                </div>
                {/* 3スロットの進み具合 */}
                <div style={{ marginTop: 6, display: "flex", justifyContent: "center", gap: 8, fontSize: 12 }}>
                  {SLOTS.map((sl) => {
                    const v = progOf(save, q.c.id)[sl];
                    const done = v >= MASTER_AT;
                    return (
                      <span key={sl} style={{
                        padding: "2px 9px", borderRadius: 999, fontWeight: 800,
                        background: done ? "#ffe9a8" : "#eef2f7", color: done ? "#a06000" : "#8a9ab0",
                        border: done ? "1.5px solid #f0c860" : "1.5px solid #d5dfe9",
                      }}>{SLOT_ICON[sl]}{done ? "✓" : `${v}/${MASTER_AT}`}</span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {phase === "feedback" && (
          <div style={{
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
            padding: "12px 14px calc(10px + env(safe-area-inset-bottom))",
            background: "linear-gradient(180deg, rgba(215,236,255,0), #d7ecff 45%)",
          }}>
            <div style={{ maxWidth: 480, margin: "0 auto" }}>
              <BigBtn color="#2f9fd4" onClick={nextQ}>
                {qIdx + 1 >= quiz.length ? "けっかを みる！" : "つぎの もんだいへ ▶"}
              </BigBtn>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ===== けっか ===== */
  if (screen === "result") {
    const perfect = correctCount === quiz.length;
    return (
      <div style={wrap}><style>{css}</style>
        {perfect && <Confetti count={40} />}
        <div style={{ ...card, textAlign: "center", marginTop: 26 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#5a7ba0" }}>クイズ クリア！</div>
          <div style={{ fontSize: 38, margin: "8px 0", animation: "pop .5s" }}>
            {Array.from({ length: quiz.length }).map((_, i) => (
              <span key={i} style={{ filter: i < correctCount ? "none" : "grayscale(1) opacity(.35)" }}>⭐</span>
            ))}
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#2f7fd4" }}>
            {quiz.length}もんちゅう {correctCount}もん せいかい！
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6, color: "#5a7ba0" }}>
            {perfect ? "ぜんもんせいかい！！すごすぎる！！🎉" : correctCount >= 6 ? "とっても いいちょうし！" : "ちょうせんしたのが えらい！"}
          </div>
          {perfect ? (
            <>
              <BigBtn onClick={() => goGacha("rainbow", "solo")} style={{
                marginTop: 16, background: "linear-gradient(90deg,#ff5e7e,#ffb800,#39c66d,#3da9ff,#b56cff)",
                animation: "rainbowBg 4s linear infinite", fontSize: 21,
              }}>
                🌈 レインボーガチャを まわす！
              </BigBtn>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#b56cff", marginTop: 8 }}>
                ぜんもんせいかいの ごほうび！レアシールが でやすいよ！
              </div>
            </>
          ) : (
            <BigBtn color="#f0a020" onClick={() => goGacha("normal", "solo")} style={{ marginTop: 16, fontSize: 21 }}>
              🎁 ガチャガチャを まわす！
            </BigBtn>
          )}
          <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
            <BigBtn color="#2f9fd4" onClick={() => startQuiz(quizMode, quizRegion)}>もういっかい あそぶ！</BigBtn>
            <BigBtn color="#8aa0b8" onClick={() => setScreen("home")}>🏠 ホーム</BigBtn>
          </div>
        </div>
      </div>
    );
  }

  /* ===== せかいのたび：パックせんたく ===== */
  if (screen === "tripHome") {
    const packs = availablePacks(save);
    const locked = nextLockedPack(save);
    return (
      <div style={wrap}><style>{css}</style>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", color: "#3dae7a", fontSize: 24, fontWeight: 900, margin: "8px 0" }}>🧳 せかいのたび</h2>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#5a7ba0", textAlign: "center", marginBottom: 10 }}>
            <Ruby t={"パックを えらんで たびに でよう！"} />
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {packs.map((tp) => {
              const stamp = (save.trips.stamps && save.trips.stamps[tp.id]) || 0;
              const packCs = tp.ids.map((id) => byId.get(id)).filter(Boolean);
              return (
                <button key={tp.id} onClick={() => startTrip(tp)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  borderRadius: 16, border: "2.5px solid #bcd2e8", background: "#fff",
                  fontFamily: "inherit", cursor: "pointer", textAlign: "left",
                }}>
                  <span style={{ fontSize: 30 }}>{tp.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 900, fontSize: 15 }}>{tp.label}</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
                      {packCs.map((c) => <Flag key={c.id} c={c} w={24} />)}
                    </div>
                  </div>
                  <span style={{ fontSize: 22 }}>{stamp >= 3 ? "🏅" : stamp >= 1 ? "🎫" : "☆"}</span>
                </button>
              );
            })}
            {locked && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 16, border: "2.5px dashed #c3d2e0", background: "#eef2f7", opacity: 0.8,
              }}>
                <span style={{ fontSize: 30, filter: "grayscale(1)" }}>🔒</span>
                <div style={{ flex: 1, fontWeight: 800, fontSize: 13, color: "#8a9ab0" }}>
                  つぎの たびは まだ ひみつ…
                </div>
              </div>
            )}
          </div>
          <BigBtn color="#8aa0b8" onClick={() => setScreen("home")} style={{ marginTop: 12 }}>🏠 ホームへ もどる</BigBtn>
        </div>
      </div>
    );
  }

  /* ===== せかいのたび：セッション ===== */
  if (screen === "trip" && tripQuiz.length > 0) {
    const item = tripQuiz[tIdx];
    const c = item.c;
    const qType = item.qType;
    const isMeet = qType === "meet2";
    const isMap = qType === "map";
    const isCorrect = tPicked && tPicked.id === c.id;
    const SECTION_COLOR = { "であい": "#3dae7a", "みわける": "#2f9fd4", "ちょうせん": "#e8484f", "おかえり": "#a86fe0" };
    const sectionColor = SECTION_COLOR[item.section];

    /* --- であい：くにカード導入（タップでスキップ可） --- */
    if (isMeet && tPhase === "cardintro") {
      return (
        <div style={{ ...wrap, minHeight: "auto", height: "100dvh", padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
          onClick={skipTripIntro}>
          <style>{css}</style>
          <div style={{ flex: "none", textAlign: "center", padding: "6px 0 4px", fontWeight: 900, fontSize: 13, color: sectionColor }}>
            🧳 であい（{tIdx + 1}/{tripQuiz.length}）
          </div>
          <div style={{ flex: "none", padding: "0 12px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
            <WorldMap view={viewForCountry(c)} target={c} revealed height="24vh" />
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
            <div style={{ ...card, margin: 0, textAlign: "center" }}>
              <Flag c={c} w={104} />
              <div style={{ fontSize: 25, fontWeight: 900, marginTop: 8 }}>
                {c.k ? <ruby>{c.n}<rt style={{ fontSize: "0.5em", color: "#7a8aa0" }}>{c.k}</rt></ruby> : c.n}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#5a7ba0", marginTop: 4 }}>🏛️ <Ruby t={c.cap} /></div>
              {c.h && <div style={{ fontSize: 13.5, fontWeight: 700, color: "#5a7ba0", marginTop: 8 }}>{HINT_ICON[c.h[0].t] || ""} <Ruby t={c.h[0].s} /></div>}
            </div>
          </div>
          <div style={{ flex: "none", padding: "10px 14px calc(10px + env(safe-area-inset-bottom))" }}>
            <div style={{ maxWidth: 480, margin: "0 auto" }}>
              <BigBtn color="#3dae7a" onClick={skipTripIntro}>つぎへ ▶（タップでOK）</BigBtn>
            </div>
          </div>
        </div>
      );
    }

    /* --- ズーム〜こたえ合わせ --- */
    const view = tPhase === "feedback" ? viewForCountry(c)
      : isMap ? CONT_VIEW[c.cont]
      : (tZoomed ? viewForCountry(c) : WORLD_VIEW);
    return (
      <div style={{ ...wrap, minHeight: "auto", height: "100dvh", padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={tPhase === "zoom" ? skipTripZoom : undefined}>
        <style>{css}</style>
        {confetti && <Confetti />}

        <div style={{ flex: "none", display: "flex", justifyContent: "center", alignItems: "center", gap: 6, padding: "6px 0 4px" }}>
          {tripQuiz.map((_, i) => (
            <div key={i} style={{
              width: i === tIdx ? 14 : 10, height: i === tIdx ? 14 : 10, borderRadius: "50%",
              background: i < tIdx ? "#4cae6e" : i === tIdx ? sectionColor : "#c9d8e8", transition: "all .3s",
            }} />
          ))}
        </div>
        <div style={{ flex: "none", textAlign: "center", fontWeight: 900, fontSize: 12.5, color: sectionColor, marginBottom: 2 }}>
          {item.section === "であい" ? "🧳 であい" : item.section === "みわける" ? "🔍 みわける" : item.section === "ちょうせん" ? "🔥 ちょうせん" : "🔄 おかえり"}
          {tAttempt > 1 && <span style={{ marginLeft: 8, color: "#d05a4a" }}>もういちど！</span>}
        </div>

        <div style={{ flex: "none", padding: "0 12px", position: "relative", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          {qType === "flag" && tPhase !== "feedback" ? (
            <div style={{
              height: "24vh", borderRadius: 20, background: "linear-gradient(180deg,#fff,#eef4fb)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "inset 0 2px 10px rgba(40,90,140,.12)",
            }}>
              <Flag c={c} w={150} style={{ animation: "floaty 2.4s ease-in-out infinite" }} />
            </div>
          ) : isMeet ? (
            <div style={{
              height: "24vh", borderRadius: 20, background: "linear-gradient(180deg,#fff,#eef4fb)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "inset 0 2px 10px rgba(40,90,140,.12)",
            }}>
              <Flag c={c} w={150} />
            </div>
          ) : (
            <WorldMap
              view={view}
              target={isMap && tPhase !== "feedback" ? null : c}
              revealed={tPhase === "feedback"}
              height="24vh"
              selected={isMap && tPicked ? tPicked : null}
              onTapCountry={isMap && tPhase === "answer" ? tripMapAnswer : null}
              tappableCont={isMap ? c.cont : null}
            />
          )}
          {tPhase === "feedback" && (
            <div style={{
              position: "absolute", left: "50%", bottom: 10, transform: "translateX(-50%)",
              background: isCorrect ? "#3f9c3a" : "#d05a4a", color: "#fff", padding: "6px 18px",
              borderRadius: 999, fontWeight: 900, fontSize: 17, whiteSpace: "nowrap",
              boxShadow: "0 3px 8px rgba(0,0,0,.25)", animation: "pop .35s",
            }}>
              {isCorrect ? `⭕ ${praise}` : "❌ ざんねん！"}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "8px 14px", paddingBottom: tPhase === "feedback" ? 88 : 10, maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          <div style={{ ...card, margin: 0, padding: "10px 12px", opacity: tShowQ || tPhase === "feedback" ? 1 : 0, transition: "all .3s" }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: sectionColor, marginBottom: 6 }}>
              {isMeet && <Ruby t={"このこっき、なんてくに？"} />}
              {!isMeet && qType === "name" && <Ruby t={"ここは ど〜こだ？"} />}
              {!isMeet && qType === "capital" && <Ruby t={"この {国|くに}の しゅとは ど〜こだ？"} />}
              {!isMeet && qType === "flag" && <Ruby t={"この こっきは どこの {国|くに}かな？"} />}
              {isMap && <Ruby t={"この {国|くに}を ちずで タップしてね"} />}
            </div>

            {!isMeet && qType !== "flag" && !isMap && (
              <div style={{ display: "flex", gap: 12, alignItems: qType === "capital" ? "center" : "flex-start" }}>
                <Flag c={c} w={62} style={{ flex: "none", marginTop: 2 }} />
                {qType === "name" ? (
                  <ul style={{ margin: 0, paddingLeft: 14, fontSize: 13.5, lineHeight: 1.7, fontWeight: 700, flex: 1 }}>
                    {item.section === "おかえり" && <li style={{ color: "#a86fe0" }}>🔄 まえに でてきた {"国"}だよ</li>}
                    <li style={{ color: "#9a6b2f" }}>🏛️ しゅとは <Ruby t={c.cap} /></li>
                  </ul>
                ) : (
                  <div style={{ flex: 1, fontSize: 21, fontWeight: 900 }}>
                    {c.k ? <ruby>{c.n}<rt style={{ fontSize: "0.5em", color: "#7a8aa0" }}>{c.k}</rt></ruby> : c.n}
                  </div>
                )}
              </div>
            )}
            {isMap && (
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <Flag c={c} w={62} style={{ flex: "none", marginTop: 2 }} />
                <ul style={{ margin: 0, paddingLeft: 14, fontSize: 13.5, lineHeight: 1.7, fontWeight: 700, flex: 1 }}>
                  {c.h && <li>{HINT_ICON[c.h[0].t] || ""} <Ruby t={c.h[0].s} /></li>}
                  <li>{CONT[c.cont].label}に あるよ</li>
                </ul>
              </div>
            )}

            {item.choices && (
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {item.choices.map((ch) => {
                  const label = qType === "capital" ? ch.cap : null;
                  let bg = "#fff", border = "#bcd2e8";
                  if (tPhase === "feedback") {
                    if (ch.id === c.id) { bg = "#e0f6db"; border = "#7ac974"; }
                    else if (tPicked && ch.id === tPicked.id) { bg = "#fde3df"; border = "#ef8a7a"; }
                  }
                  return (
                    <button key={ch.id} onClick={() => tripAnswer(ch)} disabled={tPhase !== "answer"}
                      style={{
                        padding: "7px 10px", borderRadius: 13, border: `2.5px solid ${border}`,
                        background: bg, fontSize: 16, fontWeight: 800, fontFamily: "inherit",
                        cursor: tPhase === "answer" ? "pointer" : "default", textAlign: "center", color: "#2a3a4a",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      }}>
                      {label
                        ? <Ruby t={label} />
                        : ch.k ? <ruby>{ch.n}<rt style={{ fontSize: "0.5em", color: "#7a8aa0" }}>{ch.k}</rt></ruby> : ch.n}
                    </button>
                  );
                })}
              </div>
            )}
            {isMap && !item.choices && tPhase === "answer" && (
              <div style={{ textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "#8a9ab0", marginTop: 8 }}>
                ↑ うえの ちずを タップしてね
              </div>
            )}

            {tPhase === "feedback" && (
              <div style={{ marginTop: 8, textAlign: "center", fontSize: 13.5, fontWeight: 800, color: "#5a7ba0" }}>
                {!isCorrect && (
                  <div>こたえは「{qType === "capital" ? <Ruby t={c.cap} /> : c.n}」だよ。つぎは きっと できる！</div>
                )}
                <div style={{ marginTop: 6, display: "flex", justifyContent: "center", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Flag c={c} w={44} />
                  <b>{c.n}</b>
                  <span>🏛️ <Ruby t={c.cap} /></span>
                </div>
              </div>
            )}
          </div>
        </div>

        {tPhase === "feedback" && (
          <div style={{
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
            padding: "12px 14px calc(10px + env(safe-area-inset-bottom))",
            background: "linear-gradient(180deg, rgba(215,236,255,0), #d7ecff 45%)",
          }}>
            <div style={{ maxWidth: 480, margin: "0 auto" }}>
              <BigBtn color={tOutcome && tOutcome.retry ? "#d05a4a" : "#2f9fd4"} onClick={tripAdvanceOrRetry}>
                {tOutcome && tOutcome.retry ? "もういちど ちょうせん！ 🔁"
                  : tIdx + 1 >= tripQuiz.length ? "たびの けっかを みる！" : "つぎの もんだいへ ▶"}
              </BigBtn>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ===== せかいのたび：けっか ===== */
  if (screen === "tripResult" && tStampResult) {
    const gold = tStampResult.stampValue >= 3;
    return (
      <div style={wrap}><style>{css}</style>
        <Confetti count={gold ? 44 : 28} />
        <div style={{ ...card, textAlign: "center", marginTop: 26 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#5a7ba0" }}>たび クリア！</div>
          <div style={{ fontSize: 60, margin: "10px 0", animation: "pop .5s" }}>{gold ? "🏅" : "🎫"}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#3dae7a" }}>
            {trip ? trip.label : ""}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6, color: "#5a7ba0" }}>
            {tStampResult.total}もんちゅう {tStampResult.correctCount}もん いっぱつせいかい！
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, marginTop: 6, color: gold ? "#e8a000" : "#5a7ba0" }}>
            {gold ? "🏅 きんいろスタンプ げっと！3だんはしご かんとう！" : "🎫 パスポートスタンプを ゲット！"}
          </div>
          <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
            <BigBtn color="#3dae7a" onClick={() => setScreen("tripHome")}>🧳 つぎの たびへ</BigBtn>
            <BigBtn color="#8aa0b8" onClick={() => setScreen("home")}>🏠 ホーム</BigBtn>
          </div>
        </div>
      </div>
    );
  }

  /* ===== せかいマップ ===== */
  if (screen === "map") {
    const view = mapCont ? CONT_VIEW[mapCont] : WORLD_VIEW;
    return (
      <div style={wrap}><style>{css}</style>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", color: "#4cae6e", fontSize: 22, fontWeight: 900, margin: "8px 0" }}>🌍 せかいマップ</h2>
          <div style={{ ...card, padding: 12 }}>
            <WorldMap view={view} height="34vh" selected={selC}
              masteryColor={(c) => {
                const m = masteredSlots(save, c.id);
                return m === SLOTS.length ? "#ffd24d" : m > 0 ? CONT[c.cont].color : "#e8e2d5";
              }}
              onTapCountry={mapCont ? (c) => setSelC(c) : null}
              tappableCont={mapCont}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 10 }}>
              <button onClick={() => { setMapCont(null); setSelC(null); }} style={{
                fontSize: 12, fontWeight: 800, padding: "4px 11px", borderRadius: 999, fontFamily: "inherit",
                border: "2px solid #8aa0b8", background: mapCont === null ? "#8aa0b8" : "#fff",
                color: mapCont === null ? "#fff" : "#5a7ba0", cursor: "pointer",
              }}>ぜんぶ</button>
              {CONT_KEYS.map((k) => (
                <button key={k} onClick={() => { setMapCont(k); setSelC(null); }} style={{
                  fontSize: 12, fontWeight: 800, padding: "4px 11px", borderRadius: 999, fontFamily: "inherit",
                  border: `2px solid ${CONT[k].color}`, background: mapCont === k ? CONT[k].color : "#fff",
                  color: "#4a3a2a", cursor: "pointer",
                }}>{CONT[k].label}</button>
              ))}
            </div>

            {selC ? (
              <div style={{ marginTop: 10, background: "#eef6ff", borderRadius: 14, padding: "10px 12px", textAlign: "center", animation: "pop .25s" }}>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
                  <Flag c={selC} w={52} />
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>
                      {selC.k ? <ruby>{selC.n}<rt style={{ fontSize: "0.5em", color: "#7a8aa0" }}>{selC.k}</rt></ruby> : selC.n}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#5a7ba0" }}>🏛️ <Ruby t={selC.cap} /></div>
                  </div>
                </div>
                <div style={{ marginTop: 6, display: "flex", justifyContent: "center", gap: 8, fontSize: 12 }}>
                  {SLOTS.map((sl) => {
                    const done = progOf(save, selC.id)[sl] >= MASTER_AT;
                    return <span key={sl} style={{
                      padding: "2px 9px", borderRadius: 999, fontWeight: 800,
                      background: done ? "#ffe9a8" : "#eef2f7", color: done ? "#a06000" : "#8a9ab0",
                    }}>{SLOT_ICON[sl]} {SLOT_LABEL[sl]}{done ? "✓" : ""}</span>;
                  })}
                </div>
                {selC.h && <div style={{ fontSize: 13, fontWeight: 700, color: "#5a7ba0", marginTop: 6 }}>{HINT_ICON[selC.h[0].t]} <Ruby t={selC.h[0].s} /></div>}
              </div>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 700, color: "#7a8aa0", textAlign: "center", marginTop: 8 }}>
                {mapCont
                  ? <Ruby t={"ちずを タップすると {国|くに}の じょうほうが みられるよ！"} />
                  : "たいりくを えらんで ズームしてみよう！"}
              </div>
            )}
          </div>
          <BigBtn color="#8aa0b8" onClick={() => setScreen("home")} style={{ marginTop: 10 }}>🏠 ホームへ もどる</BigBtn>
        </div>
      </div>
    );
  }

  /* ===== 地域をえらぶ ===== */
  if (screen === "regionSelect" && pendingMode) {
    const modeLabel = pendingMode === "name" ? "🗺️ せかい国名モード" : pendingMode === "capital" ? "🏛️ しゅとモード" : "🚩 こっきモード";
    const regionColor = { world: "#2f9fd4", americas: "#e07070", europe: "#a86fe0", africa: "#d4a017", easia: "#e0663d", wasia: "#c98f4e", oceania: "#4cae9e" };
    return (
      <div style={wrap}><style>{css}</style>
        <div style={{ ...card, textAlign: "center", marginTop: 26 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#2f7fd4" }}>{modeLabel}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#5a7ba0", marginTop: 6 }}>どこの {"国"}じまで あそぶ？</div>
          <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
            {Object.entries(QUIZ_REGIONS).map(([key, r]) => {
              const n = COUNTRIES.filter(r.f).length;
              const mastered = COUNTRIES.filter(r.f).filter((c) => masteredSlots(save, c.id) === SLOTS.length).length;
              return (
                <BigBtn key={key} color={regionColor[key]} onClick={() => startQuiz(pendingMode, key)} style={{ fontSize: 17, position: "relative" }}>
                  {r.label}
                  <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, opacity: 0.9, marginTop: 2 }}>
                    {n}かこく（マスター {mastered}）
                  </span>
                </BigBtn>
              );
            })}
            <BigBtn color="#8aa0b8" onClick={() => setScreen("home")}>もどる</BigBtn>
          </div>
        </div>
      </div>
    );
  }

  /* ===== ガチャ ===== */
  if (screen === "gacha") {
    const capColors = ["#ff8a8a", "#8ad0ff", "#ffd86b", "#a8e6a1", "#d9a8ff"];
    const capColor = gachaResult ? capColors[gachaResult.id.length % capColors.length] : "#ffd86b";
    const ra = gachaResult ? RARITY[gachaResult.ra] : null;
    const newCount = gachaResult ? (save.stickers[gachaResult.id] || 0) : 0;
    const title = gachaMode === "celeb" ? "🏆 おいわいガチャ" : gachaMode === "rainbow" ? "🌈 レインボーガチャ" : "🎁 ガチャガチャ";
    const tcolor = gachaMode === "celeb" ? "#c07800" : gachaMode === "rainbow" ? "#b56cff" : "#e8633c";
    return (
      <div style={wrap}><style>{css}</style>
        {confetti && <Confetti count={gachaResult ? 26 + RARITY[gachaResult.ra].lv * 8 : 26} />}
        <div style={{ ...card, textAlign: "center", marginTop: 24, paddingBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: tcolor, marginBottom: 8 }}>{title}</div>

          {gachaPhase !== "open" && (
            <div style={{ position: "relative", width: 190, height: 240, margin: "0 auto" }}>
              <div style={{
                position: "absolute", top: 0, left: 15, width: 160, height: 150, borderRadius: "50%",
                background: "radial-gradient(circle at 32% 30%, #ffffffcc, #cfe9ff 55%, #9fc6e8)",
                border: "5px solid #2f7fd4", overflow: "hidden",
              }}>
                {capColors.map((c, i) => (
                  <div key={i} style={{
                    position: "absolute", width: 38, height: 38, borderRadius: "50%",
                    background: `linear-gradient(180deg, ${c} 50%, #fff 50%)`,
                    left: 12 + (i % 3) * 45, top: 60 + Math.floor(i / 3) * 40,
                    border: "2px solid rgba(0,0,0,.12)",
                    animation: gachaPhase === "spin" ? `wiggle .25s ease-in-out infinite` : "none",
                  }} />
                ))}
              </div>
              <div style={{
                position: "absolute", top: 145, left: 35, width: 120, height: 75,
                background: "#2f7fd4", borderRadius: "0 0 18px 18px",
              }}>
                <div style={{
                  position: "absolute", left: 38, top: 14, width: 44, height: 44, borderRadius: "50%",
                  background: "#fff", border: "5px solid #1d5a9e",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  animation: gachaPhase === "spin" ? "spinHandle 1.4s ease-in-out" : "none",
                }}>
                  <div style={{ width: 8, height: 30, background: "#1d5a9e", borderRadius: 4 }} />
                </div>
              </div>
              {gachaPhase === "drop" && gachaResult && (
                <div onClick={openCapsule} style={{
                  position: "absolute", bottom: -6, left: 65, width: 60, height: 60, borderRadius: "50%",
                  background: `linear-gradient(180deg, ${capColor} 50%, #fff 50%)`,
                  border: "3px solid rgba(0,0,0,.15)", cursor: "pointer",
                  animation: "bounce .9s cubic-bezier(.3,.6,.4,1)", boxShadow: "0 4px 10px rgba(0,0,0,.2)",
                }} />
              )}
            </div>
          )}

          {gachaPhase === "ready" && (
            <BigBtn color="#f0a020" onClick={spinGacha} style={{ marginTop: 14, fontSize: 22 }}>まわす！</BigBtn>
          )}
          {gachaPhase === "spin" && (
            <div style={{ fontWeight: 900, fontSize: 18, marginTop: 14, color: "#5a7ba0" }}>ガラガラガラ…！</div>
          )}
          {gachaPhase === "drop" && gachaResult && (
            <div style={{ fontWeight: 900, fontSize: 18, marginTop: 14, color: "#e8633c", animation: "pulse 1s infinite" }}>
              👆 カプセルを タップして あけて！
            </div>
          )}

          {gachaPhase === "open" && gachaResult && (
            <div style={{ animation: "pop .5s" }}>
              <div style={{
                display: "inline-block", padding: "4px 16px", borderRadius: 999, marginBottom: 12,
                background: ra.rainbow ? "linear-gradient(90deg,#ff5e7e,#ffb800,#39c66d,#3da9ff,#b56cff)" : ra.color,
                color: "#fff", fontWeight: 900, fontSize: 14,
                ...((ra.rainbow || gachaResult.ra === "UR") ? { animation: "rainbowBg 3s linear infinite" } : {}),
                ...(ra.lv >= 4 ? { boxShadow: `0 0 12px ${ra.color}` } : {}),
              }}>
                {ra.star} {ra.label}！
              </div>
              <div style={revealFrame(gachaResult.ra)}>
                {gachaResult.e}
                {ra.lv >= 6 && (<>
                  <span style={{ position: "absolute", top: -14, left: -8, fontSize: 26, animation: "floaty 1.4s ease-in-out infinite" }}>✨</span>
                  <span style={{ position: "absolute", top: -14, right: -8, fontSize: 26, animation: "floaty 1.8s ease-in-out infinite" }}>✨</span>
                  <span style={{ position: "absolute", bottom: -14, left: -8, fontSize: 26, animation: "floaty 2.1s ease-in-out infinite" }}>✨</span>
                  <span style={{ position: "absolute", bottom: -14, right: -8, fontSize: 26, animation: "floaty 1.2s ease-in-out infinite" }}>✨</span>
                </>)}
              </div>
              <div style={{ fontSize: 21, fontWeight: 900, marginTop: 12 }}>{gachaResult.name}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#5a7ba0" }}>
                {newCount >= 3 ? "✨ 3まい コンプリート！" : `${newCount} / 3 まいめ ゲット！`}
              </div>
              <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
                {gachaFrom === "vs" ? (
                  <BigBtn color="#e8484f" onClick={() => setScreen("vsSetup")}>⚔️ もういっかい たいせん！</BigBtn>
                ) : (
                  <BigBtn color="#2f9fd4" onClick={() => startQuiz(quizMode, quizRegion)}>もういっかい あそぶ！</BigBtn>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                  <BigBtn color="#5aa7e8" onClick={() => setScreen("book")}>📒 ずかん</BigBtn>
                  <BigBtn color="#8aa0b8" onClick={() => setScreen("home")}>🏠 ホーム</BigBtn>
                </div>
              </div>
            </div>
          )}

          {gachaPhase === "drop" && !gachaResult && (
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#f0a020", marginTop: 10 }}>
                🏆 シール ぜんぶ コンプリート！！<br />きみは せかいちずマスターだ！
              </div>
              <BigBtn color="#8aa0b8" onClick={() => setScreen("home")} style={{ marginTop: 12 }}>🏠 ホーム</BigBtn>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ===== シールずかん ===== */
  if (screen === "book") {
    const unlockedStickers = STICKERS.filter((st) => (RARITY[st.ra].need || 0) <= masteredCount);
    const kinds = unlockedStickers.filter((st) => (save.stickers[st.id] || 0) > 0).length;
    return (
      <div style={wrap}><style>{css}</style>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", color: "#5aa7e8", fontSize: 24, fontWeight: 900, margin: "10px 0" }}>📒 せかいいさんシールずかん</h2>
          <div style={{ textAlign: "center", fontWeight: 800, fontSize: 14, marginBottom: 10, color: "#5a7ba0" }}>
            あつめたしゅるい：<span style={{ color: "#e8633c", fontSize: 18 }}>{kinds}</span> / {unlockedStickers.length}
          </div>
          {[...TIER_ORDER].reverse().map((raKey) => {
            const R = RARITY[raKey];
            const locked = (R.need || 0) > masteredCount;
            return (
              <div key={raKey} style={{ ...card, padding: 12 }}>
                <div style={{
                  display: "inline-block", padding: "2px 12px", borderRadius: 999, marginBottom: 10,
                  background: R.rainbow ? "linear-gradient(90deg,#ff5e7e,#ffb800,#39c66d,#3da9ff,#b56cff)" : R.color,
                  color: "#fff", fontWeight: 900, fontSize: 13,
                  ...(R.rainbow ? { animation: "rainbowBg 4s linear infinite" } : {}),
                  ...(locked ? { filter: "grayscale(.6) opacity(.7)" } : {}),
                }}>{R.star} {R.label}</div>

                {locked ? (
                  <div style={{
                    textAlign: "center", padding: "14px 8px", color: "#8a9ab0", fontWeight: 800,
                    fontSize: 13.5, background: "#eef2f7", borderRadius: 14, border: "2px dashed #c3d2e0",
                  }}>
                    🔒 {"国"}を <b style={{ color: "#e8633c" }}>{R.need}かこく</b> マスターすると とうじょう！<br />
                    （いま {masteredCount}かこく／あと {R.need - masteredCount}）
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                    {STICKERS.filter((st) => st.ra === raKey).map((st) => {
                      const cnt = save.stickers[st.id] || 0;
                      return (
                        <div key={st.id} style={{
                          borderRadius: 16, padding: "10px 4px", textAlign: "center",
                          background: cnt ? R.bg : "#eef2f7",
                          border: `2.5px ${cnt ? "solid" : "dashed"} ${cnt ? R.color : "#b8c8d8"}`,
                          position: "relative",
                          ...(cnt && R.lv >= 4 ? { boxShadow: `0 0 10px ${R.color}66` } : {}),
                        }}>
                          <div style={{ fontSize: 38, filter: cnt ? "none" : "grayscale(1) opacity(.3)" }}>{st.e}</div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: cnt ? "#2a3a4a" : "#9aa8ba", minHeight: 28 }}>
                            {cnt ? st.name : "？？？"}
                          </div>
                          {cnt > 0 && (
                            <div style={{
                              position: "absolute", top: -7, right: -5, background: cnt >= 3 ? "#f0a020" : "#e8633c",
                              color: "#fff", borderRadius: 999, fontSize: 11, fontWeight: 900, padding: "2px 7px",
                            }}>{cnt >= 3 ? "MAX" : `×${cnt}`}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <BigBtn color="#8aa0b8" onClick={() => setScreen("home")}>🏠 ホームへ もどる</BigBtn>
        </div>
      </div>
    );
  }

  /* ===== たいりくせいは：せってい ===== */
  if (screen === "vsSetup") {
    return (
      <div style={wrap}><style>{css}</style>
        <div style={{ ...card, textAlign: "center", marginTop: 30 }}>
          <div style={{ fontSize: 25, fontWeight: 900, color: "#e8484f" }}>⚔️ たいりくせいは</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#5a7ba0", marginTop: 10, lineHeight: 1.95, textAlign: "left", background: "#eef6ff", borderRadius: 14, padding: "10px 14px" }}>
            <div>🌍 こうたいに こたえて、せいかいした {"国"}が じぶんの じんちに！</div>
            <div style={{ marginTop: 4 }}>🔴🔵 とった {"国"}の かずが {"多"}い ほうの かち！</div>
            <div style={{ marginTop: 4 }}>❌ まちがえた {"国"}は あとで また でてくるよ</div>
            <div style={{ marginTop: 4 }}>👑 「ぜんぶ とりきり」は せいかいすると となりの {"国"}も 1つ もらえる！</div>
            <div style={{ marginTop: 4 }}>🌟 まけていると「Wゲットチャンス」！ せいかいで おまけ2かこく！</div>
          </div>
          <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
            <BigBtn color="#4cae6e" onClick={() => startVs(30)}>🌱 30もん たいせん</BigBtn>
            <BigBtn color="#f0a020" onClick={() => startVs(90)}>🔥 90もん たいせん</BigBtn>
            <BigBtn color="#e8484f" onClick={() => startVs(99999)} style={{ fontSize: 21 }}>👑 196かこく ぜんぶ とりきり！</BigBtn>
            <BigBtn color="#8aa0b8" onClick={() => setScreen("home")}>もどる</BigBtn>
          </div>
        </div>
      </div>
    );
  }

  /* ===== たいりくせいは：バトル ===== */
  if (screen === "vs" && vsQ) {
    const pcolor = vsTurn === 0 ? "#e8484f" : "#3d7fe0";
    const pname = vsTurn === 0 ? "プレイヤー1" : "プレイヤー2";
    const pmark = vsTurn === 0 ? "🔴" : "🔵";
    const vsOk = vsPicked && vsPicked.id === vsQ.c.id;
    const counts = [0, 0];
    Object.values(vsTerr).forEach((o) => counts[o]++);
    const view = vsPhase === "feedback" || zoomStage === "country" ? viewForCountry(vsQ.c)
      : zoomStage === "continent" ? CONT_VIEW[vsQ.c.cont]
      : WORLD_VIEW;
    const terrColor = (c) => vsTerr[c.id] === 0 ? "#ff9d8f" : vsTerr[c.id] === 1 ? "#7fb5f2" : "#efe8db";
    return (
      <div style={{ ...wrap, minHeight: "auto", height: "100dvh", padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <style>{css}</style>
        {confetti && <Confetti count={20} />}

        {vsPhase === "turn" && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 60, background: "rgba(20,40,70,.72)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ textAlign: "center" }}>
              {vsEvent === "double" && (
                <div style={{ animation: "pop .4s", marginBottom: 12 }}>
                  <div style={{ color: "#ffd83d", fontWeight: 900, fontSize: 24 }}>🌟 Wゲットチャンス！ 🌟</div>
                  <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, marginTop: 6 }}>
                    せいかいすると おまけで もう2かこく もらえる！
                  </div>
                </div>
              )}
              <div style={{
                display: "inline-block", background: pcolor, color: "#fff", fontWeight: 900, fontSize: 26,
                padding: "12px 30px", borderRadius: 999, animation: "pop .45s .15s both",
                boxShadow: "0 4px 14px rgba(0,0,0,.35)",
              }}>
                {pmark} {pname}の ばん！
              </div>
            </div>
          </div>
        )}

        {/* スコアバー */}
        <div style={{ flex: "none", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px 4px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box", fontWeight: 900 }}>
          <span style={{ color: "#e8484f", fontSize: 15, ...(vsTurn === 0 ? { background: "#ffe3e3", borderRadius: 999, padding: "2px 10px" } : {}) }}>
            🔴 {counts[0]}かこく
          </span>
          <span style={{ fontSize: 13, color: "#5a7ba0" }}>
            {vsN >= 99999 ? `のこり ${COUNTRIES.length - counts[0] - counts[1]}` : `${vsIdx + 1} / ${vsN}もん`}
          </span>
          <span style={{ color: "#3d7fe0", fontSize: 15, ...(vsTurn === 1 ? { background: "#e0edff", borderRadius: 999, padding: "2px 10px" } : {}) }}>
            🔵 {counts[1]}かこく
          </span>
        </div>

        {/* 地図（陣地の塗り分け＋ターゲットズーム） */}
        <div style={{ flex: "none", padding: "0 12px", position: "relative", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          <WorldMap view={view} target={vsQ.c} revealed={vsPhase === "feedback"} height="26vh" masteryColor={terrColor} />
          {vsPhase === "feedback" && (
            <div style={{
              position: "absolute", left: "50%", bottom: 10, transform: "translateX(-50%)",
              background: vsOk ? "#3f9c3a" : "#d05a4a", color: "#fff", padding: "6px 18px",
              borderRadius: 999, fontWeight: 900, fontSize: 17, whiteSpace: "nowrap",
              boxShadow: "0 3px 8px rgba(0,0,0,.25)", animation: "pop .35s",
            }}>
              {vsOk ? `⭕ ${praise}` : "❌ ざんねん！"}
            </div>
          )}
        </div>

        {/* もんだいカード */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "8px 14px", paddingBottom: vsPhase === "feedback" ? 88 : 10, maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          <div style={{ ...card, margin: 0, padding: "10px 12px", borderTop: `5px solid ${pcolor}`, opacity: vsPhase === "turn" ? 0 : 1, transition: "opacity .4s" }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: pcolor, marginBottom: 6 }}>
              {pmark} {pname}への もんだい：<Ruby t={"ここは ど〜こだ？"} />
              {vsEvent === "double" && <span style={{ background: "#a86fe0", color: "#fff", fontSize: 11, padding: "2px 8px", borderRadius: 999, marginLeft: 6, verticalAlign: "middle" }}>🌟Wゲット</span>}
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <Flag c={vsQ.c} w={62} style={{ flex: "none", marginTop: 2 }} />
              <ul style={{ margin: 0, paddingLeft: 14, fontSize: 13.5, lineHeight: 1.7, fontWeight: 700, flex: 1 }}>
                {vsQ.hints.map((h, i) => (
                  <li key={i}>{HINT_ICON[h.t] || ""} <Ruby t={h.s} /></li>
                ))}
              </ul>
            </div>
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {vsQ.choices.map((c) => {
                let bg = "#fff", border = "#bcd2e8";
                if (vsPhase === "feedback") {
                  if (c.id === vsQ.c.id) { bg = "#e0f6db"; border = "#7ac974"; }
                  else if (vsPicked && c.id === vsPicked.id) { bg = "#fde3df"; border = "#ef8a7a"; }
                }
                return (
                  <button key={c.id} onClick={() => vsAnswer(c)} disabled={vsPhase !== "answer"}
                    style={{
                      padding: "7px 10px", borderRadius: 13, border: `2.5px solid ${border}`,
                      background: bg, fontSize: 16, fontWeight: 800, fontFamily: "inherit",
                      cursor: vsPhase === "answer" ? "pointer" : "default", textAlign: "center", color: "#2a3a4a",
                    }}>
                    {c.k ? <ruby>{c.n}<rt style={{ fontSize: "0.5em", color: "#7a8aa0" }}>{c.k}</rt></ruby> : c.n}
                  </button>
                );
              })}
            </div>
            {vsPhase === "feedback" && (
              <div style={{ marginTop: 8, textAlign: "center", fontSize: 13.5, fontWeight: 800, color: "#5a7ba0" }}>
                {vsOk
                  ? <span style={{ color: pcolor }}>
                      「{vsQ.c.n}」を じんちに した！
                      {vsBonus.length > 0 && <><br />{vsEvent === "double" ? "🌟 Wゲット！" : "🗺️ となりの"} おまけで {vsBonus.map((b) => "「" + b.n + "」").join("と")} も ゲット！</>}
                    </span>
                  : <span>こたえは「{vsQ.c.n}」だったよ！この {"国"}は また でてくる！</span>}
              </div>
            )}
          </div>
        </div>

        {vsPhase === "feedback" && (
          <div style={{
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
            padding: "12px 14px calc(10px + env(safe-area-inset-bottom))",
            background: "linear-gradient(180deg, rgba(215,236,255,0), #d7ecff 45%)",
          }}>
            <div style={{ maxWidth: 480, margin: "0 auto" }}>
              <BigBtn color="#2f9fd4" onClick={vsNext}>
                {(Object.keys(vsTerr).length >= COUNTRIES.length || vsIdx + 1 >= vsN) ? "けっかを みる！" : "つぎの もんだいへ ▶"}
              </BigBtn>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ===== たいりくせいは：けっか ===== */
  if (screen === "vsResult") {
    const counts = [0, 0];
    Object.values(vsTerr).forEach((o) => counts[o]++);
    const draw = counts[0] === counts[1];
    const winner = counts[0] > counts[1] ? 0 : 1;
    const wcolor = winner === 0 ? "#e8484f" : "#3d7fe0";
    return (
      <div style={wrap}><style>{css}</style>
        <Confetti count={40} />
        <div style={{ ...card, textAlign: "center", marginTop: 26 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#5a7ba0" }}>たいりくせいは けっか</div>
          {draw ? (
            <div style={{ fontSize: 26, fontWeight: 900, margin: "10px 0", animation: "pop .5s" }}>🤝 ひきわけ！</div>
          ) : (
            <div style={{ fontSize: 26, fontWeight: 900, margin: "10px 0", color: wcolor, animation: "pop .5s" }}>
              {winner === 0 ? "🔴 プレイヤー1" : "🔵 プレイヤー2"}の かち！！
            </div>
          )}
          <WorldMap height="24vh" masteryColor={(c) => vsTerr[c.id] === 0 ? "#ff9d8f" : vsTerr[c.id] === 1 ? "#7fb5f2" : "#efe8db"} />
          <div style={{ display: "flex", justifyContent: "space-around", fontSize: 17, fontWeight: 900, marginTop: 10 }}>
            <span style={{ color: "#e8484f" }}>🔴 {counts[0]} かこく</span>
            <span style={{ color: "#3d7fe0" }}>🔵 {counts[1]} かこく</span>
          </div>
          <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
            {!draw && (
              <BigBtn onClick={() => goGacha("celeb", "vs")} style={{
                background: "linear-gradient(90deg,#f0a020,#ffd24d,#f0a020)", fontSize: 20,
              }}>
                🏆 かった {winner === 0 ? "プレイヤー1" : "プレイヤー2"}は おいわいガチャ！
              </BigBtn>
            )}
            <BigBtn color="#e8484f" onClick={() => setScreen("vsSetup")}>⚔️ もういっかい たいせん！</BigBtn>
            <BigBtn color="#8aa0b8" onClick={() => setScreen("home")}>🏠 ホーム</BigBtn>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
