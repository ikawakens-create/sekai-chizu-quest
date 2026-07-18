import test from "node:test";
import assert from "node:assert/strict";
import { SOUVENIRS, SOUVENIR_PENDING_IDS, souvenirOf, souvenirImgSrc, souvenirDisplay } from "../src/data/souvenirs.js";
import { TIER1, TIER2 } from "../src/data/tiers.js";

test("SOUVENIRS: TIER1+TIER2から要検討3件(PRK/MMR/ISR)を除いた61か国ちょうど", () => {
  const expected = new Set([...TIER1, ...TIER2].filter((id) => !SOUVENIR_PENDING_IDS.includes(id)));
  const actual = new Set(Object.keys(SOUVENIRS));
  assert.equal(actual.size, 61);
  assert.deepEqual(actual, expected);
});

test("SOUVENIRS: 要検討3件（PRK/MMR/ISR）はキーとして含まれない", () => {
  for (const id of SOUVENIR_PENDING_IDS) {
    assert.equal(Object.prototype.hasOwnProperty.call(SOUVENIRS, id), false, id);
  }
});

test("SOUVENIRS: 各エントリは絵文字(e)とひらがな名(n)を持つ", () => {
  for (const [id, s] of Object.entries(SOUVENIRS)) {
    assert.ok(typeof s.e === "string" && s.e.length > 0, `${id}: e`);
    assert.ok(typeof s.n === "string" && s.n.length > 0, `${id}: n`);
  }
});

test("SOUVENIRS: 絵文字(e)は61か国すべてで重複なし", () => {
  const emojis = Object.values(SOUVENIRS).map((s) => s.e);
  assert.equal(new Set(emojis).size, emojis.length);
});

test("SOUVENIRS: v2.3差し替え裁定の5件が反映されている", () => {
  assert.equal(SOUVENIRS.SWE.e, "🦌");
  assert.equal(SOUVENIRS.DNK.e, "🍪");
  assert.equal(SOUVENIRS.VNM.e, "👒");
  assert.equal(SOUVENIRS.POL.e, "🎹");
  assert.equal(SOUVENIRS.SAU.e, "🦅");
});

test("souvenirOf: 定義済み国はSOUVENIRSの値をそのまま返す", () => {
  assert.deepEqual(souvenirOf("JPN", "asia"), SOUVENIRS.JPN);
});

test("souvenirOf: 未定義国（TIER3）は大陸絵文字＋「おもいで」にフォールバック", () => {
  const s = souvenirOf("XYZ", "africa");
  assert.equal(s.n, "おもいで");
  assert.equal(s.e, "🦒");
});

test("souvenirOf: 未知の大陸でも既定の絵文字にフォールバックしクラッシュしない", () => {
  const s = souvenirOf("XYZ", "unknown-cont");
  assert.equal(s.n, "おもいで");
  assert.ok(typeof s.e === "string" && s.e.length > 0);
});

/* ---------- HANDOFF v2.3 §6.2差し替え対応: 画像フォールバックの器 ---------- */

test("SOUVENIRS: imgはオプショナル。指定が無い既存エントリでもe/nは変わらず必須のまま", () => {
  for (const [id, s] of Object.entries(SOUVENIRS)) {
    if (s.img === undefined) continue;
    assert.ok(typeof s.e === "string" && s.e.length > 0, `${id}: img指定時もeは必須`);
  }
});

test("SOUVENIRS: JPN/NLDは配線確認用サンプルとしてimgを持つ（他は不要のまま）", () => {
  assert.equal(SOUVENIRS.JPN.img, "jpn.svg");
  assert.equal(SOUVENIRS.NLD.img, "nld.svg");
  const withImg = Object.values(SOUVENIRS).filter((s) => s.img !== undefined);
  assert.equal(withImg.length, 2);
});

test("souvenirImgSrc: ファイル名は ./souvenirs/ 配下のパスに解決する（flags/と同じアセット方針）", () => {
  assert.equal(souvenirImgSrc("jpn.svg"), "./souvenirs/jpn.svg");
});

test("souvenirImgSrc: data:/http(s): で始まる値はそのまま通す（build:artifactのdata URI化と二重変換防止）", () => {
  assert.equal(souvenirImgSrc("data:image/svg+xml;base64,AAAA"), "data:image/svg+xml;base64,AAAA");
  assert.equal(souvenirImgSrc("https://example.com/x.svg"), "https://example.com/x.svg");
});

test("souvenirDisplay: imgありは kind:'img' + 解決済みsrcを返す", () => {
  const d = souvenirDisplay({ e: "🍣", n: "おすし", img: "jpn.svg" });
  assert.deepEqual(d, { kind: "img", src: "./souvenirs/jpn.svg" });
});

test("souvenirDisplay: img未指定は kind:'emoji' + 絵文字を返す（後方互換）", () => {
  const d = souvenirDisplay({ e: "🍣", n: "おすし" });
  assert.deepEqual(d, { kind: "emoji", text: "🍣" });
});

test("souvenirDisplay: 既存61か国のうちimg未指定のエントリは全てemoji分岐になる（後方互換の一括確認）", () => {
  for (const [id, s] of Object.entries(SOUVENIRS)) {
    if (s.img !== undefined) continue;
    assert.deepEqual(souvenirDisplay(s), { kind: "emoji", text: s.e }, id);
  }
});
