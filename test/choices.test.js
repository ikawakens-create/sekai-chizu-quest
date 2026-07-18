import test from "node:test";
import assert from "node:assert/strict";
import { createMakeChoices } from "../src/data/choices.js";
import { FLAG_GROUPS } from "../src/data/flag-groups.js";

/* テスト用の最小フィクスチャ（本物のCOUNTRIESと同じ形: id, cont, cap） */
const FIXTURE = [
  { id: "IDN", cont: "asia",     cap: "ジャカルタ" },
  { id: "MCO", cont: "europe",   cap: "モナコ" },
  { id: "POL", cont: "europe",   cap: "ワルシャワ" },
  { id: "SGP", cont: "asia",     cap: "シンガポール" },
  { id: "BHR", cont: "asia",     cap: "マナーマ" },
  { id: "QAT", cont: "asia",     cap: "ドーハ" },
  { id: "USA", cont: "namerica", cap: "ワシントンDC" },
  { id: "VNM", cont: "asia",     cap: "ハノイ" },
  { id: "THA", cont: "asia",     cap: "バンコク" },
  { id: "JPN", cont: "asia",     cap: "とうきょう" },
  { id: "KOR", cont: "asia",     cap: "ソウル" },
  { id: "BRA", cont: "samerica", cap: "ブラジリア" },
  { id: "EGY", cont: "africa",   cap: "カイロ" },
  { id: "KEN", cont: "africa",   cap: "ナイロビ" },
  { id: "SAMECAP", cont: "asia", cap: "ジャカルタ" }, // IDNと同じ首都表記（capテスト用）
];

const makeChoices = createMakeChoices(FIXTURE);
const idsOf = (choices) => choices.map((x) => x.id);
const REDWHITE_OTHERS = ["MCO", "POL", "SGP", "BHR", "QAT"]; // IDNと同じ国旗グループ(自身を除く)
const ASIA_OTHERS = ["SGP", "BHR", "QAT", "VNM", "THA", "JPN", "KOR"]; // IDNと同じ大陸(自身を除く)
const OTHER_CONT = ["MCO", "POL", "USA", "BRA", "EGY", "KEN"]; // IDNと異なる大陸

test("後方互換: opts無しの場合は従来どおり同大陸→他大陸の順で3択の誤答を返す", () => {
  const target = FIXTURE.find((c) => c.id === "IDN");
  for (let i = 0; i < 50; i++) {
    const choices = makeChoices(target, "name");
    assert.equal(choices.length, 4);
    assert.ok(choices.some((c) => c.id === "IDN"));
    const wrong = choices.filter((c) => c.id !== "IDN");
    assert.equal(wrong.length, 3);
    // 同大陸(asia)候補が6か国もいるので、旧アルゴリズムなら必ず同大陸のみで埋まる
    for (const w of wrong) assert.equal(w.cont, "asia");
  }
});

test("後方互換: opts={}を渡しても従来どおりの挙動になる", () => {
  const target = FIXTURE.find((c) => c.id === "IDN");
  const choices = makeChoices(target, "name", {});
  const wrong = choices.filter((c) => c.id !== "IDN");
  for (const w of wrong) assert.equal(w.cont, "asia");
});

test("誤答の優先順位(ふつう): 既習国(learnedIds) > 同フラググループ > 同大陸 > その他", () => {
  const target = FIXTURE.find((c) => c.id === "IDN");
  for (let i = 0; i < 50; i++) {
    const choices = makeChoices(target, "name", { learnedIds: ["USA"], flagGroups: FLAG_GROUPS });
    const wrong = idsOf(choices.filter((c) => c.id !== "IDN"));
    assert.equal(wrong.length, 3);
    // 既習国は候補が1つしかないので必ず含まれる
    assert.ok(wrong.includes("USA"), "既習国が最優先で含まれるべき");
    // 残り2つは同グループ候補(5か国)で必ず埋まり、同大陸だけの国は出ない
    const rest = wrong.filter((id) => id !== "USA");
    assert.equal(rest.length, 2);
    for (const id of rest) assert.ok(REDWHITE_OTHERS.includes(id), `${id} は同フラググループ由来であるべき`);
  }
});

test("誤答の優先順位(ふつう・学習国なし): 同フラググループが同大陸より優先される", () => {
  const target = FIXTURE.find((c) => c.id === "IDN");
  for (let i = 0; i < 50; i++) {
    const choices = makeChoices(target, "name", { flagGroups: FLAG_GROUPS });
    const wrong = idsOf(choices.filter((c) => c.id !== "IDN"));
    assert.equal(wrong.length, 3);
    for (const id of wrong) assert.ok(REDWHITE_OTHERS.includes(id), `${id} はフラググループ候補5か国以外から出るべきでない`);
  }
});

test("誤答の優先順位: グループ・学習国指定なしなら同大陸が最優先される", () => {
  const target = FIXTURE.find((c) => c.id === "JPN");
  for (let i = 0; i < 50; i++) {
    const choices = makeChoices(target, "name", { difficulty: "normal" });
    const wrong = idsOf(choices.filter((c) => c.id !== "JPN"));
    assert.equal(wrong.length, 3);
    for (const id of wrong) assert.equal(FIXTURE.find((c) => c.id === id).cont, "asia");
  }
});

test("誤答の優先順位: 同大陸の在庫が足りない場合は他大陸で補完する", () => {
  const target = FIXTURE.find((c) => c.id === "EGY"); // 同大陸(africa)候補はKENのみ
  for (let i = 0; i < 30; i++) {
    const choices = makeChoices(target, "name", { difficulty: "normal" });
    const wrong = idsOf(choices.filter((c) => c.id !== "EGY"));
    assert.equal(wrong.length, 3);
    assert.ok(wrong.includes("KEN"), "同大陸候補は必ず含まれるべき");
  }
});

test("誤答の優先順位(hard=かくれ難易度・高正答率): 同フラググループが既習国より優先される", () => {
  const target = FIXTURE.find((c) => c.id === "IDN");
  for (let i = 0; i < 50; i++) {
    const choices = makeChoices(target, "name", { difficulty: "hard", learnedIds: ["USA"], flagGroups: FLAG_GROUPS });
    const wrong = idsOf(choices.filter((c) => c.id !== "IDN"));
    assert.equal(wrong.length, 3);
    // グループ候補が5つあるので、既習国(USA)は選ばれないはず
    assert.ok(!wrong.includes("USA"), "hardではグループが優先され既習国は出ないはず");
    for (const id of wrong) assert.ok(REDWHITE_OTHERS.includes(id));
  }
});

test("誤答の優先順位(easy=かくれ難易度・低正答率): 別大陸・別グループが優先される", () => {
  const target = FIXTURE.find((c) => c.id === "IDN");
  for (let i = 0; i < 50; i++) {
    const choices = makeChoices(target, "name", { difficulty: "easy", learnedIds: ["USA"], flagGroups: FLAG_GROUPS });
    const wrong = idsOf(choices.filter((c) => c.id !== "IDN"));
    assert.equal(wrong.length, 3);
    for (const id of wrong) {
      assert.ok(OTHER_CONT.includes(id), `${id} は別大陸から出るべき(消去法が効くように)`);
      assert.ok(!ASIA_OTHERS.includes(id));
    }
  }
});

test("しゅと問題では同じ首都表記の国を誤答に選ばない(cap除外)", () => {
  const target = FIXTURE.find((c) => c.id === "IDN");
  for (let i = 0; i < 30; i++) {
    const choices = makeChoices(target, "cap", { flagGroups: FLAG_GROUPS });
    const wrong = choices.filter((c) => c.id !== "IDN");
    assert.ok(!wrong.some((c) => c.id === "SAMECAP"), "同じ首都表記の国は除外されるべき");
  }
});

test("正解の国自身が誤答として選ばれることはない", () => {
  const target = FIXTURE.find((c) => c.id === "IDN");
  for (let i = 0; i < 30; i++) {
    const choices = makeChoices(target, "name", { learnedIds: ["IDN"], flagGroups: FLAG_GROUPS });
    const wrong = choices.filter((c) => c.id !== "IDN");
    assert.equal(wrong.length, 3);
    assert.ok(!wrong.some((c) => c.id === "IDN"));
  }
});

/* --- count opt（HANDOFF v2.3 §2 こっき2〜4択・§3 格下げ2択） --- */
test("countオプション: 省略時は従来どおり4択（後方互換）", () => {
  const target = FIXTURE.find((c) => c.id === "IDN");
  const choices = makeChoices(target, "name", { flagGroups: FLAG_GROUPS });
  assert.equal(choices.length, 4);
});

test("countオプション: count=2なら正解1+誤答1の合計2択になる", () => {
  const target = FIXTURE.find((c) => c.id === "IDN");
  for (let i = 0; i < 30; i++) {
    const choices = makeChoices(target, "name", { flagGroups: FLAG_GROUPS, count: 2 });
    assert.equal(choices.length, 2);
    assert.ok(choices.some((c) => c.id === "IDN"));
  }
});

test("countオプション: count=2でも優先順位(同フラググループ優先)は維持される", () => {
  const target = FIXTURE.find((c) => c.id === "IDN");
  for (let i = 0; i < 30; i++) {
    const choices = makeChoices(target, "name", { flagGroups: FLAG_GROUPS, count: 2 });
    const wrong = choices.filter((c) => c.id !== "IDN");
    assert.equal(wrong.length, 1);
    assert.ok(REDWHITE_OTHERS.includes(wrong[0].id), "count=2でも同フラググループから選ばれるべき");
  }
});

test("countオプション: opts無し(レガシー経路)でもcountを尊重する", () => {
  const target = FIXTURE.find((c) => c.id === "IDN");
  const choices = makeChoices(target, "name", { count: 2 });
  assert.equal(choices.length, 2);
  assert.ok(choices.some((c) => c.id === "IDN"));
});

test("countオプション: count=3なら正解1+誤答2の合計3択になる", () => {
  const target = FIXTURE.find((c) => c.id === "IDN");
  const choices = makeChoices(target, "name", { flagGroups: FLAG_GROUPS, count: 3 });
  assert.equal(choices.length, 3);
  assert.ok(choices.some((c) => c.id === "IDN"));
});
