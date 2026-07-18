import test from "node:test";
import assert from "node:assert/strict";
import {
  framingScale, viewFromScale, viewForCountry, viewForCountries,
  showInsetFor, highlightModeFor, zoomStageAt,
  clampView, applyPinchZoom, MAX_MANUAL_SCALE, MIN_MANUAL_SCALE,
} from "../src/data/mapView.js";
import { COUNTRY_GEO, MAP_W, MAP_H } from "../src/data/world.geo.js";

const MAP = { w: 900, h: 460 }; // 実際のMAP_W/MAP_H相当

test("framingScale: 小国（bbox短辺が小さい）は高倍率までズームする（ルクセンブルクは寄る）", () => {
  const tiny = framingScale({ bw: 6, bh: 4 }, MAP); // 短辺4 → 20%達成には大きな倍率が要る
  assert.ok(tiny.s > 5, `expected large zoom, got s=${tiny.s}`);
});

test("framingScale: 巨大国（bbox短辺が既に大きい）は最小倍率のまま（ロシアは引き）", () => {
  const huge = framingScale({ bw: 500, bh: 300 }, MAP); // 短辺300は画面短辺460の20%(92)を優に超える
  assert.equal(huge.s, 1);
});

test("framingScale: 目標フラクション(20%)をおおむね達成する（上限に当たらない範囲）", () => {
  const mid = framingScale({ bw: 40, bh: 20 }, MAP, { maxScale: 100 });
  assert.ok(Math.abs(mid.achievedFraction - 0.2) < 1e-6, `got ${mid.achievedFraction}`);
});

test("framingScale: 上限倍率でも20%に届かない極小国はneedsInset=true", () => {
  const micro = framingScale({ bw: 1, bh: 0.8 }, MAP, { maxScale: 24, insetFraction: 0.10 });
  assert.equal(micro.needsInset, true);
});

test("framingScale: 十分ズームでき10%以上を達成できる国はneedsInset=false", () => {
  const ok = framingScale({ bw: 10, bh: 8 }, MAP, { maxScale: 24, insetFraction: 0.10 });
  assert.equal(ok.needsInset, false);
});

test("framingScale: bbox情報なし（ポリゴンなしの国＝マーカーのみ）は上限倍率＋必ずインセット", () => {
  const noPoly = framingScale({ bw: 0, bh: 0 }, MAP, { maxScale: 24 });
  assert.equal(noPoly.s, 24);
  assert.equal(noPoly.needsInset, true);
});

test("framingScale: maxScale/minScaleでクランプされる", () => {
  const clampedHigh = framingScale({ bw: 0.5, bh: 0.5 }, MAP, { maxScale: 24 });
  assert.equal(clampedHigh.s, 24);
  const clampedLow = framingScale({ bw: 2000, bh: 2000 }, MAP, { minScale: 1 });
  assert.equal(clampedLow.s, 1);
});

test("viewFromScale: 中心を画面中央に据え、マップ範囲外へはみ出さないようクランプする", () => {
  const v = viewFromScale(1, 0, 0, MAP); // 左上端に寄せようとしてもクランプされる
  assert.ok(v.tx <= 0 && v.tx >= MAP.w - 1 * MAP.w);
  assert.ok(v.ty <= 0 && v.ty >= MAP.h - 1 * MAP.h);
});

test("viewForCountry: needsInset/achievedFractionを含めて返す", () => {
  const v = viewForCountry({ cx: 450, cy: 230, bw: 500, bh: 300 }, MAP);
  assert.equal(v.s, 1);
  assert.equal(v.needsInset, false);
});

/* --- フレーミング適用範囲: 単独国(viewForCountry) vs Q3の4候補(viewForCountries) --- */
test("フレーミング適用範囲: 単独国フォーカスは20%基準（bboxベース）で個別にズームする", () => {
  const small = { cx: 100, cy: 100, bw: 3, bh: 2 };
  const v = viewForCountry(small, MAP, { maxScale: 24 });
  assert.ok(v.s > 1, "小国は世界ビューのまま(s=1)にはならないはず");
});

test("フレーミング適用範囲: Q3の4候補はviewForCountriesで一括フィッティングし、20%基準を適用しない", () => {
  // 4候補は互いに離れて散らばっている想定。viewForCountryなら各国ごとに高倍率になるはずの
  // 小さいbboxを持つ国でも、viewForCountriesは「4国が全部収まる」低〜中倍率を返す。
  const candidates = [
    { cx: 100, cy: 100, bw: 2, bh: 2 },
    { cx: 700, cy: 100, bw: 2, bh: 2 },
    { cx: 100, cy: 400, bw: 2, bh: 2 },
    { cx: 700, cy: 400, bw: 2, bh: 2 },
  ];
  const fit = viewForCountries(candidates, MAP, { maxScale: 24 });
  const singleWouldBe = viewForCountry(candidates[0], MAP, { maxScale: 24 });
  assert.ok(fit.s < singleWouldBe.s, `4候補フィット(${fit.s})は単独国ズーム(${singleWouldBe.s})より低倍率のはず`);
  // 4候補全員が画面内（クランプ後のtx/ty込みで）に収まることを、各国中心が
  // 表示範囲 [-tx/s, (-tx+MAP.w)/s] 内にあることで確認する。
  for (const c of candidates) {
    const screenX = fit.s * c.cx + fit.tx;
    const screenY = fit.s * c.cy + fit.ty;
    assert.ok(screenX >= -1 && screenX <= MAP.w + 1, `x out of view: ${screenX}`);
    assert.ok(screenY >= -1 && screenY <= MAP.h + 1, `y out of view: ${screenY}`);
  }
});

test("viewForCountries: 単一国のみの場合は最小倍率でその国を中心に表示する", () => {
  const v = viewForCountries([{ cx: 200, cy: 100 }], MAP, { minScale: 1 });
  assert.equal(v.s, 1);
});

test("viewForCountries: 空配列でもクラッシュせず既定ビューを返す", () => {
  const v = viewForCountries([], MAP);
  assert.equal(v.s, 1);
});

test("viewForCountries: maxScaleでクランプされる（4候補が近接していても寄りすぎない）", () => {
  const close = [
    { cx: 400, cy: 200 }, { cx: 401, cy: 200 }, { cx: 400, cy: 201 }, { cx: 401, cy: 201 },
  ];
  const v = viewForCountries(close, MAP, { pad: 5, maxScale: 3 });
  assert.equal(v.s, 3);
});

/* --- インセット --- */
test("showInsetFor: micro=trueの国は常にインセット対象", () => {
  assert.equal(showInsetFor({ micro: true }, { needsInset: false }), true);
});
test("showInsetFor: viewがneedsInset=trueならインセット対象", () => {
  assert.equal(showInsetFor({ micro: false }, { needsInset: true }), true);
});
test("showInsetFor: どちらもfalseならインセット不要", () => {
  assert.equal(showInsetFor({ micro: false }, { needsInset: false }), false);
});

/* --- 強調/減光ルール（致命的A） --- */
test("highlightModeFor: Q3（ピン4択・回答前）は候補を完全同一に扱う", () => {
  assert.equal(highlightModeFor({ screen: "pinChoice", phase: "answer" }), "candidatesEqual");
});
test("highlightModeFor: Q3でも回答確定後(feedback)は通常のreveal強調", () => {
  assert.equal(highlightModeFor({ screen: "pinChoice", phase: "feedback" }), "reveal");
});
test("highlightModeFor: くにカード/Q1/Q2など答えが既知の画面は常にreveal", () => {
  assert.equal(highlightModeFor({ screen: "cardKnown", phase: "answer" }), "reveal");
  assert.equal(highlightModeFor({ screen: "cardKnown", phase: "feedback" }), "reveal");
});

/* --- 2段ズーム演出 --- */
test("zoomStageAt: 経過時間に応じて world → continent → country の順に進む", () => {
  assert.equal(zoomStageAt(0), "world");
  assert.equal(zoomStageAt(399), "world");
  assert.equal(zoomStageAt(400), "continent");
  assert.equal(zoomStageAt(799), "continent");
  assert.equal(zoomStageAt(800), "country");
  assert.equal(zoomStageAt(5000), "country");
});

/* --- 実データ回帰テスト（PR2a作業中に発見: 日付変更線をまたぐ国が混じる大陸グループの
   viewForCountriesは、外れ値を除外しないと bbox が地図全幅に広がり s=1（無ズーム）に
   潰れてしまう。App.jsx側でオセアニアはWSM/TON/KIRを除外して使う想定で、その除外が
   実際に効くことをここで固定する） --- */
const MAP_REAL = { w: MAP_W, h: MAP_H };
const byIdReal = new Map(COUNTRY_GEO.map((c) => [c.id, c]));

test("viewForCountries回帰: 日付変更線をまたぐ国(WSM/TON/KIR)を含めたままオセアニア全体を フィットさせるとズームできない(s=1)", () => {
  const pts = COUNTRY_GEO.filter((c) => c.cont === "oceania");
  const v = viewForCountries(pts, MAP_REAL);
  assert.equal(v.s, 1, "外れ値を含めると地図全幅になり無ズームになるはず（現象の固定）");
});

test("viewForCountries回帰: WSM/TON/KIRを除外すればオセアニアは正しくズームできる", () => {
  const outliers = new Set(["WSM", "TON", "KIR"]);
  const pts = COUNTRY_GEO.filter((c) => c.cont === "oceania" && !outliers.has(c.id));
  const v = viewForCountries(pts, MAP_REAL);
  assert.ok(v.s > 1.5, `除外後は十分ズームされるはず。got s=${v.s}`);
});

test("viewForCountry回帰: FJI（bboxの幅が日付変更線の影響で肥大化）でも短辺基準のため単独国フォーカスは正しくズームする", () => {
  const fji = byIdReal.get("FJI");
  const v = viewForCountry(fji, MAP_REAL);
  assert.ok(v.s > 2, `FJIは短辺(高さ)基準でズームされるはず。got s=${v.s}`);
  assert.equal(v.needsInset, false);
});

test("viewForCountry: LUX/MCOは上限倍率まで寄ってもneedsInset=true（インセット表示対象）", () => {
  for (const id of ["LUX", "MCO"]) {
    const c = byIdReal.get(id);
    const v = viewForCountry(c, MAP_REAL);
    assert.equal(v.needsInset, true, id);
    assert.ok(showInsetFor(c, v), id);
  }
});

test("viewForCountry: RUSはほぼ最小倍率のまま（ロシアは引き。極小国のような高倍率にはならない）", () => {
  const rus = byIdReal.get("RUS");
  const v = viewForCountry(rus, MAP_REAL);
  assert.ok(v.s < 1.5, `巨大国なので低倍率のはず。got s=${v.s}`);
  assert.equal(v.needsInset, false);
});

/* --- §2.2.5 ピンチズーム（PR2a-bis） --- */
test("clampView: マップ範囲からはみ出す並進はクランプされる", () => {
  const v = clampView(2, 500, 500, MAP); // わざと大きくはみ出す値
  assert.ok(v.tx <= 0 && v.tx >= MAP.w - 2 * MAP.w);
  assert.ok(v.ty <= 0 && v.ty >= MAP.h - 2 * MAP.h);
});
test("clampView: viewFromScaleと同じクランプ規則を共有している（同じ入力なら同じ出力）", () => {
  const a = viewFromScale(3, 400, 200, MAP);
  const b = clampView(3, MAP.w / 2 - 3 * 400, MAP.h / 2 - 3 * 200, MAP);
  assert.deepEqual(a, b);
});

test("applyPinchZoom: scaleFactor>1でズームインする（範囲内なら倍率がそのまま反映される）", () => {
  const base = { s: 2, tx: -100, ty: -50 };
  const anchor = { x: 450, y: 230 }; // 画面中央あたり
  const v = applyPinchZoom(base, anchor, 1.5, MAP);
  assert.equal(v.s, 3); // 2 * 1.5、上限内なのでそのまま
});

test("applyPinchZoom: scaleFactor<1でズームアウトする", () => {
  const base = { s: 4, tx: -300, ty: -150 };
  const anchor = { x: 450, y: 230 };
  const v = applyPinchZoom(base, anchor, 0.5, MAP);
  assert.equal(v.s, 2);
});

test("applyPinchZoom: 倍率は既存のframingScale上限(既定maxScale=24)と整合したMAX_MANUAL_SCALEでクランプされる", () => {
  const base = { s: 20, tx: 0, ty: 0 };
  const v = applyPinchZoom(base, { x: 450, y: 230 }, 3, MAP); // 60倍相当を狙うが上限で止まる
  assert.equal(v.s, MAX_MANUAL_SCALE);
});

test("applyPinchZoom: 最小倍率(MIN_MANUAL_SCALE)未満にはズームアウトできない", () => {
  const base = { s: 1, tx: 0, ty: 0 };
  const v = applyPinchZoom(base, { x: 450, y: 230 }, 0.1, MAP);
  assert.equal(v.s, MIN_MANUAL_SCALE);
});

test("applyPinchZoom: アンカー点の直下の地図座標がズーム前後で画面上の同じ位置に留まる（アンカー固定）", () => {
  const base = { s: 2, tx: -200, ty: -100 };
  const anchor = { x: 500, y: 300 };
  const mapXBefore = (anchor.x - base.tx) / base.s;
  const mapYBefore = (anchor.y - base.ty) / base.s;
  const v = applyPinchZoom(base, anchor, 2, MAP, { maxScale: 100 }); // クランプに当たらない範囲で検証
  const screenXAfter = v.s * mapXBefore + v.tx;
  const screenYAfter = v.s * mapYBefore + v.ty;
  assert.ok(Math.abs(screenXAfter - anchor.x) < 1e-6, `x座標がずれた: ${screenXAfter}`);
  assert.ok(Math.abs(screenYAfter - anchor.y) < 1e-6, `y座標がずれた: ${screenYAfter}`);
});

test("applyPinchZoom: クランプ後もマップ範囲からはみ出さない（画面端付近でのピンチでも破綻しない）", () => {
  const base = { s: 1, tx: 0, ty: 0 };
  const v = applyPinchZoom(base, { x: 0, y: 0 }, 5, MAP); // 左上端を中心に大きくズーム
  assert.ok(v.tx <= 0 && v.tx >= MAP.w - v.s * MAP.w);
  assert.ok(v.ty <= 0 && v.ty >= MAP.h - v.s * MAP.h);
});

test("applyPinchZoom: scaleFactor=1では倍率が変わらない（クランプ内なら実質ノーオペ）", () => {
  const base = { s: 3, tx: -450, ty: -230 };
  const v = applyPinchZoom(base, { x: 450, y: 230 }, 1, MAP);
  assert.equal(v.s, base.s);
  assert.ok(Math.abs(v.tx - base.tx) < 1e-9);
  assert.ok(Math.abs(v.ty - base.ty) < 1e-9);
});
