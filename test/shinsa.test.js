import test from "node:test";
import assert from "node:assert/strict";
import {
  SHINSA_SLOTS, progOf, stageOf, isMastered,
  visitDirectionFor, subquestionOrderFor, distractorDifficultyFor,
  flagChoiceCountFor, isDowngraded, choiceCountFor,
  buildVisitQueue, subquestionAnswerOutcome, buildRetryItem,
  applyShinsaSlotAnswer, finishVisitSrs,
} from "../src/data/shinsa.js";

const CONTS = ["asia", "europe", "africa", "namerica"];
const COUNTRIES = Array.from({ length: 24 }, (_, i) => ({
  id: `C${i}`, cont: CONTS[i % CONTS.length], cap: `Cap${i}`, flag: `f${i}`,
}));
const TARGET = COUNTRIES[0]; // C0 / asia
const FLAG_GROUPS = [{ id: "g1", label: "グループ1", ids: ["C0", "C4", "C8"] }];

function emptySave() {
  return { prog: {}, srs: {}, recent: [] };
}

/* ---------- progOf / stageOf ---------- */
test("progOf: 未記録の国は0埋めで返す", () => {
  assert.deepEqual(progOf(emptySave(), "C0"), { flag: 0, name: 0, loc: 0 });
});
test("progOf: capスロットが無くても(既存モードのprogでも)壊れない", () => {
  const save = { prog: { C0: { name: 1, flag: 2, cap: 5 } } };
  assert.deepEqual(progOf(save, "C0"), { flag: 2, name: 1, loc: 0 });
});

test("stageOf: 0/1/2/3の全パターン", () => {
  assert.equal(stageOf({ prog: { C0: { flag: 0, name: 0, loc: 0 } } }, "C0"), 0);
  assert.equal(stageOf({ prog: { C0: { flag: 1, name: 0, loc: 0 } } }, "C0"), 1);
  assert.equal(stageOf({ prog: { C0: { flag: 1, name: 1, loc: 0 } } }, "C0"), 2);
  assert.equal(stageOf({ prog: { C0: { flag: 1, name: 1, loc: 1 } } }, "C0"), 3);
});
test("stageOf: capは無視される（既存モード専用スロットのため）", () => {
  assert.equal(stageOf({ prog: { C0: { flag: 0, name: 0, loc: 0, cap: 99 } } }, "C0"), 0);
});

/* ---------- isMastered ---------- */
test("isMastered: 3スロットすべて≥3かつstreak≥3で真", () => {
  const save = { prog: { C0: { flag: 3, name: 3, loc: 3 } }, srs: { C0: { streak: 3 } } };
  assert.equal(isMastered(save, "C0"), true);
});
test("isMastered: いずれか1スロットが2以下なら偽", () => {
  const save = { prog: { C0: { flag: 2, name: 3, loc: 3 } }, srs: { C0: { streak: 3 } } };
  assert.equal(isMastered(save, "C0"), false);
});
test("isMastered: streakが2以下なら偽（スロットは満たしていても）", () => {
  const save = { prog: { C0: { flag: 3, name: 3, loc: 3 } }, srs: { C0: { streak: 2 } } };
  assert.equal(isMastered(save, "C0"), false);
});
test("isMastered: 既存モードのMASTER_AT=2は関係ない（3未満なら常に偽）", () => {
  const save = { prog: { C0: { flag: 2, name: 2, loc: 2 } }, srs: { C0: { streak: 5 } } };
  assert.equal(isMastered(save, "C0"), false);
});

/* ---------- 出し分け（順走/逆走） ---------- */
test("visitDirectionFor: stageOf=3のみreverse、それ以外はforward", () => {
  assert.equal(visitDirectionFor(0), "forward");
  assert.equal(visitDirectionFor(1), "forward");
  assert.equal(visitDirectionFor(2), "forward");
  assert.equal(visitDirectionFor(3), "reverse");
});

test("subquestionOrderFor: forwardはこっき→なまえ→ばしょ", () => {
  assert.deepEqual(subquestionOrderFor("forward"), ["flag", "name", "loc"]);
});
test("subquestionOrderFor: reverseはばしょ→なまえ→こっき（手がかり連鎖なし）", () => {
  assert.deepEqual(subquestionOrderFor("reverse"), ["loc", "name", "flag"]);
});

/* ---------- 誤答優先度 ---------- */
test("distractorDifficultyFor: reverseは全問一律hard（同グループ→同大陸優先の辛口化）", () => {
  assert.equal(distractorDifficultyFor("flag", "reverse", 3), "hard");
  assert.equal(distractorDifficultyFor("name", "reverse", 3), "hard");
  assert.equal(distractorDifficultyFor("loc", "reverse", 3), "hard");
});
test("distractorDifficultyFor: forward初訪問(stageOf=0)は表どおりflag=easy・name/loc=normal", () => {
  assert.equal(distractorDifficultyFor("flag", "forward", 0), "easy");
  assert.equal(distractorDifficultyFor("name", "forward", 0), "normal");
  assert.equal(distractorDifficultyFor("loc", "forward", 0), "normal");
});
test("distractorDifficultyFor: forward再訪(stageOf1〜2)は辛口化（flag=normal・name/loc=hard）", () => {
  for (const s of [1, 2]) {
    assert.equal(distractorDifficultyFor("flag", "forward", s), "normal");
    assert.equal(distractorDifficultyFor("name", "forward", s), "hard");
    assert.equal(distractorDifficultyFor("loc", "forward", s), "hard");
  }
});

/* ---------- 選択肢数 ---------- */
test("flagChoiceCountFor: 低群=2・ふつう=3・高群=4", () => {
  assert.equal(flagChoiceCountFor("easy"), 2);
  assert.equal(flagChoiceCountFor("normal"), 3);
  assert.equal(flagChoiceCountFor("hard"), 4);
});

test("isDowngraded: ふつう/高群は3回目から、低群は2回目から2択", () => {
  assert.equal(isDowngraded(1, "normal"), false);
  assert.equal(isDowngraded(2, "normal"), false);
  assert.equal(isDowngraded(3, "normal"), true);
  assert.equal(isDowngraded(1, "easy"), false);
  assert.equal(isDowngraded(2, "easy"), true);
});

test("choiceCountFor: 格下げが最優先（flagでも格下げなら2択に固定）", () => {
  assert.equal(choiceCountFor("flag", 3, "hard"), 2);
  assert.equal(choiceCountFor("flag", 1, "hard"), 4);
  assert.equal(choiceCountFor("name", 1, "normal"), 4);
  assert.equal(choiceCountFor("loc", 1, "normal"), 4);
});

/* ---------- buildVisitQueue ---------- */
test("buildVisitQueue: 初訪問(stageOf=0)はforward順・こっき→なまえ→ばしょ", () => {
  const q = buildVisitQueue(TARGET, COUNTRIES, FLAG_GROUPS, emptySave());
  assert.deepEqual(q.map((i) => i.qType), ["flag", "name", "loc"]);
  assert.equal(q.every((i) => i.direction === "forward"), true);
});

test("buildVisitQueue: stageOf=3の再訪はreverse順・ばしょ→なまえ→こっき", () => {
  const save = { prog: { C0: { flag: 1, name: 1, loc: 1 } }, srs: {}, recent: [] };
  const q = buildVisitQueue(TARGET, COUNTRIES, FLAG_GROUPS, save);
  assert.deepEqual(q.map((i) => i.qType), ["loc", "name", "flag"]);
  assert.equal(q.every((i) => i.direction === "reverse"), true);
});

test("buildVisitQueue: 各問の選択肢に正解国が含まれ、choiceCount件になっている", () => {
  const q = buildVisitQueue(TARGET, COUNTRIES, FLAG_GROUPS, emptySave(), { hiddenDifficulty: "normal" });
  for (const item of q) {
    assert.equal(item.correctId, "C0");
    assert.ok(item.choices.some((c) => c.id === "C0"));
    assert.equal(item.choices.length, item.choiceCount);
  }
});

test("buildVisitQueue: なまえ問(順走)はshowFlagContext=true、こっき/ばしょはfalse", () => {
  const q = buildVisitQueue(TARGET, COUNTRIES, FLAG_GROUPS, emptySave());
  const byType = Object.fromEntries(q.map((i) => [i.qType, i]));
  assert.equal(byType.name.showFlagContext, true);
  assert.equal(byType.flag.showFlagContext, false);
  assert.equal(byType.loc.showFlagContext, false);
});

test("buildVisitQueue: 逆走(手がかり連鎖なし)はなまえ問でもshowFlagContext=false", () => {
  const save = { prog: { C0: { flag: 1, name: 1, loc: 1 } }, srs: {}, recent: [] };
  const q = buildVisitQueue(TARGET, COUNTRIES, FLAG_GROUPS, save);
  const nameItem = q.find((i) => i.qType === "name");
  assert.equal(nameItem.showFlagContext, false);
});

test("buildVisitQueue: 隠し難易度easyのプロフィールはこっき問が2択になる", () => {
  const q = buildVisitQueue(TARGET, COUNTRIES, FLAG_GROUPS, emptySave(), { hiddenDifficulty: "easy" });
  const flagItem = q.find((i) => i.qType === "flag");
  assert.equal(flagItem.choiceCount, 2);
});

test("buildVisitQueue: 移行救済フラグ(forceRescueLoc2Choice)でばしょ問の初回のみ2択になる", () => {
  const q = buildVisitQueue(TARGET, COUNTRIES, FLAG_GROUPS, emptySave(), { forceRescueLoc2Choice: true });
  const locItem = q.find((i) => i.qType === "loc");
  assert.equal(locItem.choiceCount, 2);
  const flagItem = q.find((i) => i.qType === "flag");
  assert.notEqual(flagItem.choiceCount, 2, "救済フラグはばしょ問にのみ効くはず");
});

/* ---------- 正誤判定・再出題 ---------- */
test("subquestionAnswerOutcome: 正解idと一致すればok:true", () => {
  const item = { correctId: "C0" };
  assert.equal(subquestionAnswerOutcome(item, "C0").ok, true);
  assert.equal(subquestionAnswerOutcome(item, "C1").ok, false);
});

test("buildRetryItem: attemptNumberが+1され、同じslot/qType/directionを保つ", () => {
  const q = buildVisitQueue(TARGET, COUNTRIES, FLAG_GROUPS, emptySave());
  const flagItem = q.find((i) => i.qType === "flag");
  const retry = buildRetryItem(flagItem, COUNTRIES, FLAG_GROUPS, "normal");
  assert.equal(retry.attemptNumber, 2);
  assert.equal(retry.qType, "flag");
  assert.equal(retry.direction, flagItem.direction);
  assert.equal(retry.correctId, "C0");
});

test("buildRetryItem: 3回目は2択に自動格下げされる", () => {
  const q = buildVisitQueue(TARGET, COUNTRIES, FLAG_GROUPS, emptySave());
  const nameItem = q.find((i) => i.qType === "name"); // 初回は4択
  const retry2 = buildRetryItem(nameItem, COUNTRIES, FLAG_GROUPS, "normal"); // attempt=2, まだ4択
  assert.equal(retry2.choiceCount, 4);
  const retry3 = buildRetryItem(retry2, COUNTRIES, FLAG_GROUPS, "normal"); // attempt=3, 格下げ
  assert.equal(retry3.choiceCount, 2);
});

test("buildRetryItem: 低群プロフィールは2回目から2択に格下げされる", () => {
  const q = buildVisitQueue(TARGET, COUNTRIES, FLAG_GROUPS, emptySave(), { hiddenDifficulty: "easy" });
  const nameItem = q.find((i) => i.qType === "name");
  const retry2 = buildRetryItem(nameItem, COUNTRIES, FLAG_GROUPS, "easy");
  assert.equal(retry2.attemptNumber, 2);
  assert.equal(retry2.choiceCount, 2);
});

/* ---------- §2.5 スロット加算・recent更新（§3: 再出題は非加算） ---------- */
test("applyShinsaSlotAnswer: 初回正解でスロット+1、recentにok:trueが積まれる", () => {
  const save = emptySave();
  const next = applyShinsaSlotAnswer(save, "C0", "flag", true, 1);
  assert.equal(next.prog.C0.flag, 1);
  assert.deepEqual(next.recent[0], { ok: true });
});
test("applyShinsaSlotAnswer: 初回不正解はスロット加算なし、recentにok:falseが積まれる", () => {
  const save = emptySave();
  const next = applyShinsaSlotAnswer(save, "C0", "flag", false, 1);
  assert.equal(next.prog.C0 ? next.prog.C0.flag || 0 : 0, 0);
  assert.deepEqual(next.recent[0], { ok: false });
});
test("applyShinsaSlotAnswer: 再出題(attempt>=2)の正解はスロット加算されない（水増し防止）", () => {
  let save = applyShinsaSlotAnswer(emptySave(), "C0", "flag", false, 1); // 初回不正解
  save = applyShinsaSlotAnswer(save, "C0", "flag", true, 2); // 再出題で正解
  assert.equal(progOf(save, "C0").flag, 0, "再出題の正解は加算しない");
});
test("applyShinsaSlotAnswer: 再出題はrecentも更新しない（初回のみのシグナル）", () => {
  let save = applyShinsaSlotAnswer(emptySave(), "C0", "flag", false, 1);
  const beforeLen = save.recent.length;
  save = applyShinsaSlotAnswer(save, "C0", "flag", true, 2);
  assert.equal(save.recent.length, beforeLen, "再出題ではrecentが増えないはず");
});
test("applyShinsaSlotAnswer: 既存のprog(cap等)を破壊しない", () => {
  const save = { prog: { C0: { flag: 0, name: 0, loc: 0, cap: 9 } }, recent: [] };
  const next = applyShinsaSlotAnswer(save, "C0", "flag", true, 1);
  assert.equal(next.prog.C0.cap, 9);
  assert.equal(next.prog.C0.flag, 1);
});

/* ---------- §2.5 訪問単位のsrs更新（境界ケース: 3問中2勝1敗 等） ---------- */
test("finishVisitSrs: 3問すべて初回正解ならstreak+1", () => {
  const save = { srs: { C0: { streak: 2, lastAt: 0 } } };
  const next = finishVisitSrs(save, "C0", { flag: true, name: true, loc: true }, 12345);
  assert.equal(next.srs.C0.streak, 3);
  assert.equal(next.srs.C0.lastAt, 12345);
});
test("finishVisitSrs境界ケース: 3問中2勝1敗（1問でも初回不正解）ならstreak=0", () => {
  const save = { srs: { C0: { streak: 5, lastAt: 0 } } };
  const next = finishVisitSrs(save, "C0", { flag: true, name: false, loc: true }, 999);
  assert.equal(next.srs.C0.streak, 0, "1問でも初回不正解ならstreakはリセットされるべき");
  assert.equal(next.srs.C0.lastAt, 999, "lastAtは正誤に関わらず訪問時刻に更新される");
});
test("finishVisitSrs: 初訪問（srsレコードなし）でも壊れない", () => {
  const next = finishVisitSrs({ srs: {} }, "C0", { flag: true, name: true, loc: true }, 1);
  assert.equal(next.srs.C0.streak, 1);
});
test("finishVisitSrs: 全問不正解でもstreak=0のまま（マイナスにならない）", () => {
  const save = { srs: { C0: { streak: 0, lastAt: 0 } } };
  const next = finishVisitSrs(save, "C0", { flag: false, name: false, loc: false }, 1);
  assert.equal(next.srs.C0.streak, 0);
});

/* ---------- 統合シナリオ: 3問中2勝1敗（1問だけ再出題を経て最終的に正解） ---------- */
test("統合: こっきを初回誤答→再出題で正解しても、prog加算なし・streakは0（2勝1敗の完全な流れ）", () => {
  let save = emptySave();
  const queue = buildVisitQueue(TARGET, COUNTRIES, FLAG_GROUPS, save);
  const firstAttemptResults = {};

  // 1) こっき: 初回不正解
  const flagItem = queue.find((i) => i.qType === "flag");
  let outcome = subquestionAnswerOutcome(flagItem, "WRONG_ID");
  assert.equal(outcome.ok, false);
  save = applyShinsaSlotAnswer(save, TARGET.id, flagItem.slot, outcome.ok, flagItem.attemptNumber);
  firstAttemptResults.flag = outcome.ok;
  const flagRetry = buildRetryItem(flagItem, COUNTRIES, FLAG_GROUPS, "normal");

  // 2) なまえ: 初回正解
  const nameItem = queue.find((i) => i.qType === "name");
  outcome = subquestionAnswerOutcome(nameItem, nameItem.correctId);
  assert.equal(outcome.ok, true);
  save = applyShinsaSlotAnswer(save, TARGET.id, nameItem.slot, outcome.ok, nameItem.attemptNumber);
  firstAttemptResults.name = outcome.ok;

  // 3) ばしょ: 初回正解
  const locItem = queue.find((i) => i.qType === "loc");
  outcome = subquestionAnswerOutcome(locItem, locItem.correctId);
  assert.equal(outcome.ok, true);
  save = applyShinsaSlotAnswer(save, TARGET.id, locItem.slot, outcome.ok, locItem.attemptNumber);
  firstAttemptResults.loc = outcome.ok;

  // 4) こっき再出題(attempt=2): 正解
  outcome = subquestionAnswerOutcome(flagRetry, flagRetry.correctId);
  assert.equal(outcome.ok, true);
  save = applyShinsaSlotAnswer(save, TARGET.id, flagRetry.slot, outcome.ok, flagRetry.attemptNumber);
  // firstAttemptResults.flag は書き換えない（初回の結果のまま）

  // キューが尽きた（3スロットとも通過）のでsrsを訪問単位で確定する
  save = finishVisitSrs(save, TARGET.id, firstAttemptResults, 42);

  assert.equal(progOf(save, "C0").flag, 0, "こっきは初回不正解だったため、再出題の正解でも加算されない");
  assert.equal(save.prog.C0.name, 1);
  assert.equal(save.prog.C0.loc, 1);
  assert.equal(save.srs.C0.streak, 0, "こっきの初回不正解により訪問全体のstreakは0");
  assert.equal(stageOf(save, "C0"), 2, "flag未達(0)のためstageOfは2（name+loc）");
});
