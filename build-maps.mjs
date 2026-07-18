import fs from "fs";
import { feature, mesh, merge } from "topojson-client";
import { presimplify, quantile, simplify } from "topojson-simplify";
import { geoEqualEarth, geoPath, geoGraticule, geoArea } from "d3-geo";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const wc = require("world-countries");
const W = 900, H = 460;

/* 50m（高精細）を読み込み、見た目を保ったまま点を間引く */
let topo = require("world-atlas/countries-50m.json");
topo = presimplify(topo);
topo = simplify(topo, quantile(topo, 0.2)); // 重要な点だけ残して軽量化

/* 対象196か国 = 国連加盟193 + バチカン + パレスチナ + 台湾 */
const targets = wc.filter((c) => c.unMember || ["VAT", "PSE", "TWN"].includes(c.cca3));
const targetN3 = new Set(targets.map((c) => Number(c.ccn3)));

const allGeoms = topo.objects.countries.geometries;
const fc = feature(topo, topo.objects.countries);

/* 50mでは離島が本国と同じIDを持つことがある → 面積最大のフィーチャを本体として選ぶ */
const geoById = new Map();
const mainIndexByN3 = new Map();
fc.features.forEach((f, i) => {
  const n3 = Number(f.id);
  if (!Number.isFinite(n3)) return;
  const prev = geoById.get(n3);
  if (!prev || geoArea(f) > geoArea(prev)) { geoById.set(n3, f); mainIndexByN3.set(n3, i); }
});

const CONT = { Asia: "asia", Europe: "europe", Africa: "africa", Oceania: "oceania" };
const SOUTH_AM = new Set(["South America"]);
function contOf(c) {
  if (c.region === "Americas") return SOUTH_AM.has(c.subregion) ? "samerica" : "namerica";
  return CONT[c.region] || "asia";
}

const projection = geoEqualEarth().fitSize([W, H], { type: "Sphere" });
const path = geoPath(projection);
const round = (d) => d.replace(/-?\d+\.?\d*/g, (n) => (Math.round(parseFloat(n) * 10) / 10).toString());

const out = [];
const noPoly = [];
const microList = [];

for (const c of targets) {
  const f = geoById.get(Number(c.ccn3));
  let d = "", cx, cy, zoom = 4, micro = false, bw = 0, bh = 0;

  if (f) {
    const raw = path(f);
    d = raw ? round(raw) : "";
    const b = path.bounds(f);
    const w = b[1][0] - b[0][0], h = b[1][1] - b[0][1];
    bw = Math.round(w * 10) / 10;
    bh = Math.round(h * 10) / 10;
    const ctr = path.centroid(f);
    cx = Math.round(ctr[0] * 10) / 10;
    cy = Math.round(ctr[1] * 10) / 10;
    const z = Math.min(W * 0.55 / Math.max(w, 1), H * 0.55 / Math.max(h, 1));
    zoom = Math.round(Math.min(Math.max(z, 1.2), 22) * 10) / 10;
    /* ポリゴンはあるが世界図でほぼ見えない極小国 → マーカーも重ねる */
    if (w < 3 && h < 3) { micro = true; microList.push(c.cca3); }
  } else {
    const p = projection([c.latlng[1], c.latlng[0]]);
    cx = Math.round(p[0] * 10) / 10;
    cy = Math.round(p[1] * 10) / 10;
    zoom = 18;
    micro = true;
    bw = 0; bh = 0;
    noPoly.push(c.cca3);
  }

  out.push({
    id: c.cca3, n: c.translations.jpn.common, en: c.name.common,
    cont: contOf(c), flag: c.cca2.toLowerCase(),
    capEn: (c.capital && c.capital[0]) || "",
    area: Math.round(c.area),
    d, cx, cy, zoom, micro, bw, bh,
  });
}
out.sort((a, b) => (a.cont === b.cont ? b.area - a.area : a.cont.localeCompare(b.cont)));

/* --- 196か国以外の陸地（西サハラ・グリーンランド・南極など）を1本のグレー地形に --- */
const otherGeoms = allGeoms.filter((g, i) => {
  const n3 = Number(g.id);
  return !(targetN3.has(n3) && mainIndexByN3.get(n3) === i);
});
const OTHER = round(path(merge(topo, otherGeoms)) || "");

/* --- 国境線（内側）と海岸線を1本ずつのパスに（二重線にならない） --- */
const BORDERS = round(path(mesh(topo, topo.objects.countries, (a, b) => a !== b)) || "");
const COAST = round(path(mesh(topo, topo.objects.countries, (a, b) => a === b)) || "");

/* --- 経緯線グリッド（15度きざみ）と赤道 --- */
const graticule = geoGraticule().step([15, 15]);
const GRAT = round(path(graticule()));
const EQ = round(path({ type: "LineString", coordinates: Array.from({ length: 361 }, (_, i) => [i - 180, 0]) }));

const js =
  `/* 自動生成: build-maps.mjs — 手で編集しないこと（Natural Earth 50m 簡略化版） */\n` +
  `export const MAP_W = ${W};\nexport const MAP_H = ${H};\n\n` +
  `export const GRATICULE = ${JSON.stringify(GRAT)};\n` +
  `export const EQUATOR = ${JSON.stringify(EQ)};\n` +
  `export const OTHER_LAND = ${JSON.stringify(OTHER)};\n` +
  `export const BORDERS = ${JSON.stringify(BORDERS)};\n` +
  `export const COAST = ${JSON.stringify(COAST)};\n\n` +
  `export const COUNTRY_GEO = ${JSON.stringify(out, null, 0)};\n`;

fs.writeFileSync("world.geo.js", js);

const byCont = {};
out.forEach((c) => { byCont[c.cont] = (byCont[c.cont] || 0) + 1; });
console.log("生成:", out.length, "か国 /", "大陸別:", JSON.stringify(byCont));
console.log("ポリゴンなし:", noPoly.length, "→", noPoly.join(","));
console.log("極小(マーカー併用):", microList.length, "→", microList.join(","));
console.log("ファイルサイズ:", (fs.statSync("world.geo.js").size / 1024).toFixed(0) + "KB");
