import fs from "fs";

let src = fs.readFileSync("src/App.jsx", "utf8");
const geo = fs.readFileSync("src/data/world.geo.js", "utf8");
const ja = fs.readFileSync("src/data/ja.js", "utf8");
const hintsAsia = fs.readFileSync("src/data/hints-asia.js", "utf8");
const hintsEurope = fs.readFileSync("src/data/hints-europe.js", "utf8");
const hintsAfrica = fs.readFileSync("src/data/hints-africa.js", "utf8");
const hintsAmericas = fs.readFileSync("src/data/hints-americas.js", "utf8");
const hintsOceania = fs.readFileSync("src/data/hints-oceania.js", "utf8");
let save = fs.readFileSync("src/data/save.js", "utf8");

function replaceOnce(from, to, label) {
  if (!src.includes(from)) throw new Error("置換対象が見つからない: " + label);
  src = src.replace(from, to);
}
function replaceOnceIn(text, from, to, label) {
  if (!text.includes(from)) throw new Error("置換対象が見つからない: " + label);
  return text.replace(from, to);
}

/* 1) データimportを削除（あとで本体を埋め込む） */
replaceOnce(`import { COUNTRY_GEO, GRATICULE, EQUATOR, OTHER_LAND, BORDERS, COAST, MAP_W, MAP_H } from "./data/world.geo.js";\n`, "", "geo import");
replaceOnce(`import { CAP_JA, NAME_OVERRIDE, NAME_KANA, DEMO_HINTS } from "./data/ja.js";\n`, "", "ja import");
replaceOnce(`import { HINTS_ASIA } from "./data/hints-asia.js";\n`, "", "hints import");
replaceOnce(`import { HINTS_EUROPE } from "./data/hints-europe.js";\n`, "", "eu import");
replaceOnce(`import { HINTS_AFRICA } from "./data/hints-africa.js";\n`, "", "af import");
replaceOnce(`import { HINTS_AMERICAS } from "./data/hints-americas.js";\n`, "", "am import");
replaceOnce(`import { HINTS_OCEANIA } from "./data/hints-oceania.js";\n`, "", "oc import");
replaceOnce(`import { emptySaveV2, loadSaveV2, persistSaveV2, pushRecent, hiddenDifficultyOf } from "./data/save.js";\n`, "", "save import");

/* 2) 国旗: img → 絵文字（Artifactはファイル同梱不可のため） */
replaceOnce(
`function Flag({ c, w = 96, style }) {
  return (
    <img src={\`./flags/\${c.flag}.svg\`} alt="" width={w} height={w * 0.75}
      style={{ borderRadius: 6, boxShadow: "0 2px 6px rgba(0,0,0,.2)", border: "1px solid rgba(0,0,0,.1)", background: "#fff", ...style }} />
  );
}`,
`function flagEmoji(cc) {
  return String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
function Flag({ c, w = 96, style }) {
  /* プロトタイプは絵文字国旗。PWA版はSVG（flags/xx.svg）に差し替え済み */
  return (
    <span style={{ fontSize: w * 0.72, lineHeight: 1, display: "inline-block",
      filter: "drop-shadow(0 2px 3px rgba(0,0,0,.25))", ...style }}>
      {flagEmoji(c.flag)}
    </span>
  );
}`, "Flag component");

/* 3) 保存: save.js（localStorage前提）→ window.storage（Artifact永続化API）用に差し替え。
   emptySaveV2/migrateFromV1/mergeSaveV2/pushRecent/hiddenDifficultyOfは純粋関数なのでそのまま埋め込み、
   loadSaveV2/persistSaveV2のみwindow.storageのasync APIに差し替える。 */
save = replaceOnceIn(save,
`const defaultStorage = () => (typeof localStorage !== "undefined" ? localStorage : null);

/* v2があればそれを読み込み、無ければv1から移行（v1キーは温存・削除しない） */
export function loadSaveV2(storage = defaultStorage()) {
  try {
    const v2raw = storage && storage.getItem(V2_KEY);
    if (v2raw) return mergeSaveV2(JSON.parse(v2raw));
    const v1raw = storage && storage.getItem(V1_KEY);
    if (v1raw) {
      const migrated = migrateFromV1(JSON.parse(v1raw));
      persistSaveV2(migrated, storage);
      return migrated;
    }
  } catch (e) { /* 破損データは初期状態にフォールバック */ }
  return emptySaveV2();
}

export function persistSaveV2(doc, storage = defaultStorage()) {
  try { storage && storage.setItem(V2_KEY, JSON.stringify(doc)); } catch (e) {}
}`,
`/* v2があればそれを読み込み、無ければv1から移行（v1キーは温存・削除しない） */
export async function loadSaveV2() {
  try {
    const v2 = await window.storage.get(V2_KEY);
    if (v2 && v2.value) return mergeSaveV2(JSON.parse(v2.value));
    const v1 = await window.storage.get(V1_KEY);
    if (v1 && v1.value) {
      const migrated = migrateFromV1(JSON.parse(v1.value));
      persistSaveV2(migrated);
      return migrated;
    }
  } catch (e) { /* 破損データは初期状態にフォールバック */ }
  return emptySaveV2();
}

export function persistSaveV2(doc) {
  try { window.storage.set(V2_KEY, JSON.stringify(doc)); } catch (e) {}
}`, "storage");
const saveInline = save.replace(/^export /gm, "");

replaceOnce(
`useEffect(() => { setSaveDoc(loadSaveV2()); }, []);`,
`useEffect(() => { loadSaveV2().then(setSaveDoc); }, []);`, "load effect");

/* 4) データ本体を先頭（reactのimport直後）に埋め込む */
const geoInline = geo.replace(/^\/\* 自動生成.*\*\/\n/, "").replace(/^export /gm, "");
const jaInline = ja.replace(/^export /gm, "");
const importLine = `import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";\n`;
if (!src.startsWith(importLine)) throw new Error("react import が先頭にない");
src = importLine +
  "\n/* ======== 地図データ（build-maps.mjs 自動生成） ======== */\n" + geoInline +
  "\n/* ======== 日本語データ ======== */\n" + jaInline +
  "\n/* ======== ヒント（Phase 4） ======== */\n" +
  hintsAsia.replace(/^export /gm, "") + "\n" +
  hintsEurope.replace(/^export /gm, "") + "\n" +
  hintsAfrica.replace(/^export /gm, "") + "\n" +
  hintsAmericas.replace(/^export /gm, "") + "\n" +
  hintsOceania.replace(/^export /gm, "") + "\n" +
  "\n/* ======== セーブv2（window.storage版） ======== */\n" + saveInline + "\n" +
  src.slice(importLine.length);

fs.writeFileSync("sekai-chizu-quest.jsx", src);
console.log("artifact生成 OK:", (fs.statSync("sekai-chizu-quest.jsx").size / 1024).toFixed(0) + "KB");
