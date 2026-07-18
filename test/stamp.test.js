import test from "node:test";
import assert from "node:assert/strict";
import { makeStamp, shapeOf, STAMP_SHAPES } from "../src/data/stamp.js";

const JPN = { id: "JPN", cont: "asia", nameKana: "にほん" };
const AUS = { id: "AUS", cont: "oceania", nameKana: "オーストラリア" };

test("makeStamp: 同じ引数なら常に同じSVG文字列（シード再現性・Math.random不使用）", () => {
  const a = makeStamp(JPN, "2026-07-18");
  const b = makeStamp(JPN, "2026-07-18");
  assert.equal(a, b);
});

test("makeStamp: 呼び出しを繰り返しても揺れない（100回連続一致）", () => {
  const first = makeStamp(AUS, "2026-01-05", { gold: true });
  for (let i = 0; i < 100; i++) {
    assert.equal(makeStamp(AUS, "2026-01-05", { gold: true }), first);
  }
});

test("shapeOf: 同じ国idは常に同じ形（決定性）", () => {
  assert.equal(shapeOf("JPN"), shapeOf("JPN"));
  assert.equal(shapeOf("AUS"), shapeOf("AUS"));
});

test("shapeOf: 形はSTAMP_SHAPESのいずれか（hash(id)%5）", () => {
  for (const id of ["JPN", "AUS", "FRA", "KEN", "BRA", "IND", "GBR"]) {
    assert.ok(STAMP_SHAPES.includes(shapeOf(id)), id);
  }
});

test("shapeOf: 5種類の形をどれも取りうる（十分な国数で分布を確認）", () => {
  const ids = ["JPN","USA","CHN","KOR","IND","THA","VNM","PHL","IDN","GBR","FRA","DEU","ITA","ESP","RUS","AUS","NZL","CAN","BRA","MEX","ARG","EGY","KEN","ZAF","SAU","TUR"];
  const shapes = new Set(ids.map(shapeOf));
  assert.equal(shapes.size, STAMP_SHAPES.length);
});

test("makeStamp: 日付が変わると同じ国でも見た目（かすれ・回転）が変わりうる", () => {
  const d1 = makeStamp(JPN, "2026-07-18");
  const d2 = makeStamp(JPN, "2026-08-01");
  assert.notEqual(d1, d2);
});

test("makeStamp: 形は日付に依存せず国idだけで決まる（同じ<circle>/<rect>等が両日で一致）", () => {
  const extractShapeTag = (svg) => svg.match(/<(circle|rect|polygon|ellipse|path) [^]*?\/>/)[0];
  const d1 = makeStamp(JPN, "2026-07-18");
  const d2 = makeStamp(JPN, "2026-12-31");
  assert.equal(extractShapeTag(d1), extractShapeTag(d2));
});

test("makeStamp: gold未指定/falseでは金の重ね押しレイヤーを含まない", () => {
  const normal = makeStamp(JPN, "2026-07-18");
  assert.equal((normal.match(/#c9971f/g) || []).length, 0);
});

test("makeStamp: gold:trueで金インク(#c9971f)の重ね押しレイヤーを含む", () => {
  const gold = makeStamp(JPN, "2026-07-18", { gold: true });
  assert.ok(gold.includes("#c9971f"));
});

test("makeStamp: ひらがな国名を主役として大きく含む", () => {
  const svg = makeStamp(JPN, "2026-07-18");
  assert.ok(svg.includes(">にほん<"));
});

test("makeStamp: おみやげ絵文字を含む（JPNは🍣）", () => {
  const svg = makeStamp(JPN, "2026-07-18");
  assert.ok(svg.includes("🍣"));
});

test("makeStamp: ISO3コードを小さく含む（装飾）", () => {
  const svg = makeStamp(JPN, "2026-07-18");
  assert.ok(svg.includes(">JPN<"));
  assert.ok(svg.includes('font-size="6"'));
});

test("makeStamp: 日付は YYYY.M.D 形式で中央帯に含む", () => {
  const svg = makeStamp(JPN, "2026-07-18");
  assert.ok(svg.includes(">2026.7.18<"));
});

test("makeStamp: 大陸ごとにインク色（描画色）が異なる", () => {
  const jpn = makeStamp(JPN, "2026-07-18"); // asia
  const aus = makeStamp(AUS, "2026-07-18"); // oceania
  const inkOf = (svg) => svg.match(/stroke="(#[0-9a-f]{6})"/)[1];
  assert.notEqual(inkOf(jpn), inkOf(aus));
});

test("makeStamp: 未定義国（TIER3）でもクラッシュせずおもいで代替おみやげで生成できる", () => {
  const svg = makeStamp({ id: "XYZ", cont: "africa", nameKana: "テストこく" }, "2026-07-18");
  assert.ok(svg.includes("🦒"));
});
