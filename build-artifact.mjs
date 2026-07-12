import fs from "fs";

let src = fs.readFileSync("src/App.jsx", "utf8");
const geo = fs.readFileSync("src/data/world.geo.js", "utf8");
const ja = fs.readFileSync("src/data/ja.js", "utf8");
const hintsAsia = fs.readFileSync("src/data/hints-asia.js", "utf8");
const hintsEurope = fs.readFileSync("src/data/hints-europe.js", "utf8");
const hintsAfrica = fs.readFileSync("src/data/hints-africa.js", "utf8");
const hintsAmericas = fs.readFileSync("src/data/hints-americas.js", "utf8");
const hintsOceania = fs.readFileSync("src/data/hints-oceania.js", "utf8");

function replaceOnce(from, to, label) {
  if (!src.includes(from)) throw new Error("置換対象が見つからない: " + label);
  src = src.replace(from, to);
}

/* 1) データimportを削除（あとで本体を埋め込む） */
replaceOnce(`import { COUNTRY_GEO, GRATICULE, EQUATOR, OTHER_LAND, BORDERS, COAST, MAP_W, MAP_H } from "./data/world.geo.js";\n`, "", "geo import");
replaceOnce(`import { CAP_JA, NAME_OVERRIDE, NAME_KANA, DEMO_HINTS } from "./data/ja.js";\n`, "", "ja import");
replaceOnce(`import { HINTS_ASIA } from "./data/hints-asia.js";\n`, "", "hints import");
replaceOnce(`import { HINTS_EUROPE } from "./data/hints-europe.js";\n`, "", "eu import");
replaceOnce(`import { HINTS_AFRICA } from "./data/hints-africa.js";\n`, "", "af import");
replaceOnce(`import { HINTS_AMERICAS } from "./data/hints-americas.js";\n`, "", "am import");
replaceOnce(`import { HINTS_OCEANIA } from "./data/hints-oceania.js";\n`, "", "oc import");

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

/* 3) 保存: localStorage → window.storage（Artifact永続化API） */
replaceOnce(
`function loadSave() {
  try { const r = localStorage.getItem(SAVE_KEY); if (r) return { ...emptySave(), ...JSON.parse(r) }; } catch (e) {}
  return emptySave();
}
function persistSave(d) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) {} }`,
`async function loadSave() {
  try {
    const r = await window.storage.get(SAVE_KEY);
    if (r && r.value) return { ...emptySave(), ...JSON.parse(r.value) };
  } catch (e) { /* まだデータがない */ }
  return emptySave();
}
function persistSave(d) { try { window.storage.set(SAVE_KEY, JSON.stringify(d)); } catch (e) {} }`, "storage");

replaceOnce(
`useEffect(() => { setSave(loadSave()); }, []);`,
`useEffect(() => { loadSave().then(setSave); }, []);`, "load effect");

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
  src.slice(importLine.length);

fs.writeFileSync("sekai-chizu-quest.jsx", src);
console.log("artifact生成 OK:", (fs.statSync("sekai-chizu-quest.jsx").size / 1024).toFixed(0) + "KB");
