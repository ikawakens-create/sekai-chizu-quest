import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32, hashString } from "../src/data/rng.js";

test("mulberry32: 同じseedなら同じ列を返す（再現性）", () => {
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test("mulberry32: 異なるseedなら（高確率で）異なる列を返す", () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  assert.notEqual(a(), b());
});

test("mulberry32: 出力は常に [0, 1) の範囲", () => {
  const rng = mulberry32(999);
  for (let i = 0; i < 500; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test("hashString: 同じ文字列は常に同じハッシュ値", () => {
  assert.equal(hashString("JPN"), hashString("JPN"));
  assert.equal(hashString("AUS2026-07-18"), hashString("AUS2026-07-18"));
});

test("hashString: 異なる文字列は（高確率で）異なるハッシュ値", () => {
  assert.notEqual(hashString("JPN"), hashString("AUS"));
});

test("hashString: 常に非負の32bit整数", () => {
  for (const s of ["", "A", "JPN", "sekai-chizu-quest"]) {
    const h = hashString(s);
    assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
  }
});
