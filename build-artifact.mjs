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
let rng = fs.readFileSync("src/data/rng.js", "utf8");
let souvenirs = fs.readFileSync("src/data/souvenirs.js", "utf8");
let choices = fs.readFileSync("src/data/choices.js", "utf8");
let flagGroups = fs.readFileSync("src/data/flag-groups.js", "utf8");
let trips = fs.readFileSync("src/data/trips.js", "utf8");
let mapView = fs.readFileSync("src/data/mapView.js", "utf8");
let stamp = fs.readFileSync("src/data/stamp.js", "utf8");
let trip = fs.readFileSync("src/data/trip.js", "utf8");
let shinsa = fs.readFileSync("src/data/shinsa.js", "utf8");
let customs = fs.readFileSync("src/data/customs.js", "utf8");

function replaceOnce(from, to, label) {
  if (!src.includes(from)) throw new Error("置換対象が見つからない: " + label);
  src = src.replace(from, to);
}
function replaceOnceIn(text, from, to, label) {
  if (!text.includes(from)) throw new Error("置換対象が見つからない: " + label);
  return text.replace(from, to);
}
/* モジュール本文からimport文を1行削除するヘルパー。依存先は先に本ファイルへ
   インライン化済みで同じトップレベルスコープに存在するため、import自体は不要になる。 */
function stripImport(text, importLine, label) {
  if (!text.includes(importLine)) throw new Error("import行が見つからない: " + label);
  return text.replace(importLine, "");
}
/* App.jsxはtrip.js/shinsa.jsのstageOf/progOf/isMastered（名前が同じで意味が異なる）を
   legacyXxx/srXxxとしてエイリアスimportして混同を防いでいる（HANDOFF v2.3 §8.1・
   PR2bからの申し送り）。単一ファイル化では実体のエイリアスが存在しないため、
   インライン化時に定義側の識別子そのものをエイリアス名へ改名し、App.jsx側の
   参照とつじつまを合わせる（単語境界一致でモジュール内の呼び出し箇所も一括改名）。
   viewForCountry/shuffle/SLOTSはApp.jsx側の同名ローカル定義と衝突するため同様に改名する。 */
function renameIdentifier(text, from, to, label) {
  const re = new RegExp(`\\b${from}\\b`, "g");
  if (!re.test(text)) throw new Error("改名対象の識別子が見つからない: " + label);
  return text.replace(re, to);
}

/* 1) データimportを削除（あとで本体を埋め込む） */
replaceOnce(`import { COUNTRY_GEO, GRATICULE, EQUATOR, OTHER_LAND, BORDERS, COAST, MAP_W, MAP_H } from "./data/world.geo.js";\n`, "", "geo import");
replaceOnce(`import { CAP_JA, NAME_OVERRIDE, NAME_KANA, DEMO_HINTS } from "./data/ja.js";\n`, "", "ja import");
replaceOnce(`import { HINTS_ASIA } from "./data/hints-asia.js";\n`, "", "hints import");
replaceOnce(`import { HINTS_EUROPE } from "./data/hints-europe.js";\n`, "", "eu import");
replaceOnce(`import { HINTS_AFRICA } from "./data/hints-africa.js";\n`, "", "af import");
replaceOnce(`import { HINTS_AMERICAS } from "./data/hints-americas.js";\n`, "", "am import");
replaceOnce(`import { HINTS_OCEANIA } from "./data/hints-oceania.js";\n`, "", "oc import");
replaceOnce(`import { createMakeChoices } from "./data/choices.js";\n`, "", "choices import");
replaceOnce(`import { emptySaveV2, loadSaveV2, persistSaveV2, pushRecent, hiddenDifficultyOf } from "./data/save.js";\n`, "", "save import");
replaceOnce(`import { FLAG_GROUPS } from "./data/flag-groups.js";\n`, "", "flag-groups import");
replaceOnce(`import { TRIPS } from "./data/trips.js";\n`, "", "trips import");
replaceOnce(
`import {
  progOf as legacyProgOf, masteredSlotCount as legacyMasteredSlotCount, MASTER_AT,
  availablePacks, nextLockedPack,
  isPackCleared, packDoneIds, buildTripVisits, gateSceneFor,
} from "./data/trip.js";\n`, "", "trip import");
replaceOnce(
`import {
  SHINSA_SLOTS, stageOf as srStageOf, progOf as srProgOf, isMastered as srIsMastered,
  buildVisitQueue, advanceVisitQueue, applyShinsaSlotAnswer, finishVisitSrs,
} from "./data/shinsa.js";\n`, "", "shinsa import");
replaceOnce(
`import {
  buildCustomsQueue, advanceCustomsQueue, applyCustomsAnswer,
} from "./data/customs.js";\n`, "", "customs import");
replaceOnce(`import { souvenirOf, SOUVENIR_NOTES } from "./data/souvenirs.js";\n`, "", "souvenirs import");
replaceOnce(`import { makeStamp, applyStamp } from "./data/stamp.js";\n`, "", "stamp import");
replaceOnce(
`import {
  viewForCountry as computeCountryView, viewForCountries, showInsetFor, applyPinchZoom, highlightModeFor,
  layoutPins, mapUnitsForScreenPx, PIN_MIN_TAP_PX,
} from "./data/mapView.js";\n`, "", "mapView import");

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

/* 4) 新規/既存データ・ロジックモジュールのインライン化（依存順）。
   rng/souvenirs/stamp/shinsa/customsはHANDOFF v2.3 PR1〜PR3で追加されたモジュール。
   choices/flag-groups/trips/trip/mapViewは既存モジュールで、これまで未インラインのまま
   ガードに引っかかっていたためここで一括解消する。 */
const rngInline = rng.replace(/^export /gm, "");
const souvenirsInline = souvenirs.replace(/^export /gm, "");

choices = renameIdentifier(choices, "shuffle", "choicesShuffle", "choices.shuffle (App.jsxのshuffleと衝突)");
const choicesInline = choices.replace(/^export /gm, "");

const flagGroupsInline = flagGroups.replace(/^export /gm, "");
const tripsInline = trips.replace(/^export /gm, "");

mapView = renameIdentifier(mapView, "viewForCountry", "computeCountryView", "mapView.viewForCountry (App.jsxのラッパーと衝突)");
const mapViewInline = mapView.replace(/^export /gm, "");

stamp = stripImport(stamp, `import { souvenirOf } from "./souvenirs.js";\n`, "stamp->souvenirs");
stamp = stripImport(stamp, `import { mulberry32, hashString } from "./rng.js";\n`, "stamp->rng");
const stampInline = stamp.replace(/^export /gm, "");

trip = stripImport(trip, `import { TRIPS } from "./trips.js";\n`, "trip->trips");
trip = renameIdentifier(trip, "SLOTS", "LEGACY_SLOTS", "trip.SLOTS (App.jsxのSLOTSと衝突)");
trip = renameIdentifier(trip, "progOf", "legacyProgOf", "trip.progOf (App.jsxのエイリアスに合わせる)");
trip = renameIdentifier(trip, "stageOf", "legacyStageOf", "trip.stageOf (shinsa.stageOfと衝突)");
trip = renameIdentifier(trip, "masteredSlotCount", "legacyMasteredSlotCount", "trip.masteredSlotCount (App.jsxのエイリアスに合わせる)");
const tripInline = trip.replace(/^export /gm, "");

shinsa = stripImport(shinsa, `import { createMakeChoices } from "./choices.js";\n`, "shinsa->choices");
shinsa = stripImport(shinsa, `import { pushRecent } from "./save.js";\n`, "shinsa->save");
shinsa = renameIdentifier(shinsa, "progOf", "srProgOf", "shinsa.progOf (App.jsxのエイリアスに合わせる)");
shinsa = renameIdentifier(shinsa, "stageOf", "srStageOf", "shinsa.stageOf (App.jsxのエイリアスに合わせる)");
shinsa = renameIdentifier(shinsa, "isMastered", "srIsMastered", "shinsa.isMastered (App.jsxのエイリアスに合わせる)");
const shinsaInline = shinsa.replace(/^export /gm, "");

customs = stripImport(customs, `import { createMakeChoices } from "./choices.js";\n`, "customs->choices");
customs = stripImport(customs, `import { pickTopBySrsWeightRandom } from "./trip.js";\n`, "customs->trip");
customs = stripImport(customs, `import { isDowngraded } from "./shinsa.js";\n`, "customs->shinsa");
customs = stripImport(customs, `import { pushRecent } from "./save.js";\n`, "customs->save");
customs = renameIdentifier(customs, "shuffleWith", "customsShuffleWith", "customs.shuffleWith (trip.shuffleWithと衝突)");
const customsInline = customs.replace(/^export /gm, "");

/* 5) データ本体を先頭（reactのimport直後）に埋め込む */
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
  "\n/* ======== 乱数（シード付き・rng.js） ======== */\n" + rngInline + "\n" +
  "\n/* ======== おみやげ（souvenirs.js） ======== */\n" + souvenirsInline + "\n" +
  "\n/* ======== 誤答選択肢生成（choices.js） ======== */\n" + choicesInline + "\n" +
  "\n/* ======== にてるこっきグループ（flag-groups.js） ======== */\n" + flagGroupsInline + "\n" +
  "\n/* ======== たびパック定義（trips.js） ======== */\n" + tripsInline + "\n" +
  "\n/* ======== 地図表示ロジック（mapView.js） ======== */\n" + mapViewInline + "\n" +
  "\n/* ======== パスポートスタンプ（stamp.js） ======== */\n" + stampInline + "\n" +
  "\n/* ======== たびの土台ロジック（trip.js） ======== */\n" + tripInline + "\n" +
  "\n/* ======== しんさ3れん（shinsa.js） ======== */\n" + shinsaInline + "\n" +
  "\n/* ======== ぜいかんけんさ（customs.js） ======== */\n" + customsInline + "\n" +
  src.slice(importLine.length);

/* 6) ガード: Reactインポート以外のローカルimport（"./..."）が1つでも残っていたら、
   単一ファイルとして未完成（＝壊れた成果物）とみなし書き出さずに失敗させる。
   複数行のimport（`import {\n ... \n} from "./x.js";`）も拾えるよう[\s\S]で行またぎに対応。 */
const remainingImportRe = /import\s+[\s\S]*?\s+from\s+"(\.\/[^"]+)";/g;
const remainingModules = [...src.matchAll(remainingImportRe)].map((m) => m[1]);
if (remainingModules.length > 0) {
  throw new Error("単一ファイル未完成：以下のローカルimportが未インラインです → " + remainingModules.join(", "));
}

fs.writeFileSync("sekai-chizu-quest.jsx", src);
console.log("artifact生成 OK:", (fs.statSync("sekai-chizu-quest.jsx").size / 1024).toFixed(0) + "KB");
