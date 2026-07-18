import test from "node:test";
import assert from "node:assert/strict";
import { SOUVENIRS, SOUVENIR_PENDING_IDS, souvenirOf } from "../src/data/souvenirs.js";
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
