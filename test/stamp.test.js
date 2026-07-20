import test from "node:test";
import assert from "node:assert/strict";
import { makeStamp, shapeOf, STAMP_SHAPES, applyStamp, awardBonus, makeBonusStamp } from "../src/data/stamp.js";

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

test("makeStamp: img未指定の国は従来どおり絵文字<text>で表示する（後方互換・AUSは🐨）", () => {
  const svg = makeStamp(AUS, "2026-07-18");
  assert.ok(svg.includes("🐨"));
  assert.ok(!svg.includes("<image"));
});

test("makeStamp: souvenirsにimgがある国（JPN）は絵文字<text>ではなく<image href>で表示する", () => {
  const svg = makeStamp(JPN, "2026-07-18");
  assert.ok(svg.includes("<image href="));
  assert.ok(!svg.includes(">🍣<"));
});

test("makeStamp: img指定時のhrefはsouvenirImgSrcの解決結果（./souvenirs/配下）", () => {
  const svg = makeStamp(JPN, "2026-07-18");
  assert.ok(svg.includes('<image href="./souvenirs/jpn.svg"'));
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

/* ---------- applyStamp（§6.3: 入国成功で必ず押印・再訪は日付追記） ---------- */
function emptySave() {
  return { passport: { stamps: {}, bonus: [], routes: [] } };
}
test("applyStamp: 初訪問で日付1件・gold未指定はfalseで記録される", () => {
  const save = applyStamp(emptySave(), "JPN", "2026-07-18");
  assert.deepEqual(save.passport.stamps.JPN, { dates: ["2026-07-18"], gold: false });
});
test("applyStamp: 再訪（別日）は同スタンプに日付を追記する", () => {
  let save = applyStamp(emptySave(), "JPN", "2026-07-18");
  save = applyStamp(save, "JPN", "2026-08-01");
  assert.deepEqual(save.passport.stamps.JPN.dates, ["2026-07-18", "2026-08-01"]);
});
test("applyStamp: 同日に2回押しても日付は重複追加しない", () => {
  let save = applyStamp(emptySave(), "JPN", "2026-07-18");
  save = applyStamp(save, "JPN", "2026-07-18");
  assert.deepEqual(save.passport.stamps.JPN.dates, ["2026-07-18"]);
});
test("applyStamp: gold:trueは以後goldのまま（再訪でgold:false扱いに戻さない）", () => {
  let save = applyStamp(emptySave(), "JPN", "2026-07-18", true);
  save = applyStamp(save, "JPN", "2026-08-01", false);
  assert.equal(save.passport.stamps.JPN.gold, true);
});
test("applyStamp: 他国のスタンプは変更しない", () => {
  let save = applyStamp(emptySave(), "JPN", "2026-07-18");
  save = applyStamp(save, "AUS", "2026-07-19");
  assert.ok(save.passport.stamps.JPN);
  assert.ok(save.passport.stamps.AUS);
});

/* ---------- awardBonus（HANDOFF v2.3 §7・受け入れ基準§10: 成績非加算の確認テスト） ---------- */
function saveWithProgress() {
  return {
    prog: { JPN: { flag: 3, name: 2, loc: 1 }, AUS: { flag: 1, name: 0, loc: 0 } },
    srs: { JPN: { streak: 2, lastAt: 1000 } },
    passport: {
      stamps: { JPN: { dates: ["2026-07-18"], gold: false } },
      bonus: ["BONUS-t1-2"],
      routes: [{ tripId: "t1-2", ids: ["JPN"], date: "2026-07-10" }],
    },
  };
}

test("awardBonus: prog/srsは呼び出し前と完全一致のまま変化しない", () => {
  const save = saveWithProgress();
  const next = awardBonus(save, "t1-1");
  assert.deepEqual(next.prog, save.prog);
  assert.deepEqual(next.srs, save.srs);
});

test("awardBonus: passport.stampsとroutesはそのまま保持される（欠損ゼロ）", () => {
  const save = saveWithProgress();
  const next = awardBonus(save, "t1-1");
  assert.deepEqual(next.passport.stamps, save.passport.stamps);
  assert.deepEqual(next.passport.routes, save.passport.routes);
});

test("awardBonus: 既存の他ボーナスを保持しつつ'BONUS-'+tripIdを追記する", () => {
  const save = saveWithProgress();
  const next = awardBonus(save, "t1-1");
  assert.deepEqual(next.passport.bonus, ["BONUS-t1-2", "BONUS-t1-1"]);
});

test("awardBonus: 同一tripIdの二重付与でbonusが重複しない（冪等）", () => {
  const save = saveWithProgress();
  const once = awardBonus(save, "t1-1");
  const twice = awardBonus(once, "t1-1");
  assert.deepEqual(twice.passport.bonus, ["BONUS-t1-2", "BONUS-t1-1"]);
});

test("awardBonus: passport未初期化のsaveでも壊れずbonusを1件だけ書き込む", () => {
  const next = awardBonus({}, "t1-1");
  assert.deepEqual(next.passport, { stamps: {}, bonus: ["BONUS-t1-1"], routes: [] });
});

/* ---------- makeBonusStamp（HANDOFF v2.3 §7: 決定的な特別絵柄） ---------- */
test("makeBonusStamp: 同じ引数なら常に同じSVG文字列（Math.random不使用）", () => {
  const a = makeBonusStamp("BONUS-t1-1", "2026-07-20");
  const b = makeBonusStamp("BONUS-t1-1", "2026-07-20");
  assert.equal(a, b);
});

test("makeBonusStamp: 金インク(#c9971f)固定で描画する", () => {
  const svg = makeBonusStamp("BONUS-t1-1", "2026-07-20");
  assert.ok(svg.includes("#c9971f"));
});

test("makeBonusStamp: 国スタンプ(STAMP_SHAPES)とは別の専用形（circle/rect/ellipse/hexagon/shieldを使わない）", () => {
  const svg = makeBonusStamp("BONUS-t1-1", "2026-07-20");
  assert.ok(!/<circle|<rect|<ellipse|<polygon|M60,6 L110,22/.test(svg));
});

test("makeBonusStamp: 日付を渡せばYYYY.M.D形式で含む", () => {
  const svg = makeBonusStamp("BONUS-t1-1", "2026-07-20");
  assert.ok(svg.includes(">2026.7.20<"));
});

test("makeBonusStamp: 日付が無い(null)場合でもクラッシュせず日付行を省く", () => {
  const svg = makeBonusStamp("BONUS-t1-1", null);
  assert.ok(!/\d{4}\.\d{1,2}\.\d{1,2}/.test(svg));
});

test("makeBonusStamp: bonusIdが異なれば回転/かすれが変わりうる（見た目の区別）", () => {
  const a = makeBonusStamp("BONUS-t1-1", "2026-07-20");
  const b = makeBonusStamp("BONUS-t1-2", "2026-07-20");
  assert.notEqual(a, b);
});
