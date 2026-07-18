import test from "node:test";
import assert from "node:assert/strict";
import {
  customsPoolIds, buildCustomsQueue, customsAnswerOutcome, buildCustomsRetryItem, applyCustomsAnswer,
  advanceCustomsQueue,
} from "../src/data/customs.js";
import { mulberry32 } from "../src/data/rng.js";

const seededRng = mulberry32;

const CONTS = ["asia", "europe", "africa", "namerica"];
const COUNTRIES = Array.from({ length: 12 }, (_, i) => ({
  id: `C${i}`, cont: CONTS[i % CONTS.length], cap: `Cap${i}`,
}));
const souvenirOf = (id, cont) => ({ e: `emoji-${id}`, n: `omiyage-${id}` });

function emptySave() {
  return { srs: {}, recent: [], passport: { stamps: {}, bonus: [], routes: [] } };
}

/* ---------- customsPoolIds: 出題プール = 今日の3か国 + 過去のスタンプ国 ---------- */
test("customsPoolIds: スタンプが無ければ今日の3か国のみ", () => {
  const save = emptySave();
  assert.deepEqual(customsPoolIds(["C0", "C1", "C2"], save).sort(), ["C0", "C1", "C2"]);
});
test("customsPoolIds: 過去のスタンプ国（今日分を除く）を合わせたプールになる", () => {
  const save = { ...emptySave(), passport: { stamps: { C0: {}, C5: {}, C6: {} }, bonus: [], routes: [] } };
  // C0は今日分と重複するので1回だけ数える
  assert.deepEqual(customsPoolIds(["C0", "C1", "C2"], save).sort(), ["C0", "C1", "C2", "C5", "C6"]);
});

/* ---------- buildCustomsQueue ---------- */
test("buildCustomsQueue: 3問返し、各問はプール内の国旗4択（正解を含む）になる", () => {
  const save = { ...emptySave(), passport: { stamps: { C5: {}, C6: {}, C7: {} }, bonus: [], routes: [] } };
  const queue = buildCustomsQueue(COUNTRIES, ["C0", "C1", "C2"], save, souvenirOf, { rng: seededRng(1) });
  assert.equal(queue.length, 3);
  for (const item of queue) {
    assert.equal(item.choices.length, 4);
    assert.ok(item.choices.some((c) => c.id === item.countryId));
    assert.equal(item.attemptNumber, 1);
    assert.deepEqual(item.souvenir, souvenirOf(item.countryId));
  }
});
test("buildCustomsQueue: isTodayフラグは今日の3か国にのみtrue", () => {
  const save = { ...emptySave(), passport: { stamps: { C5: {}, C6: {}, C7: {} }, bonus: [], routes: [] } };
  const todayIds = ["C0", "C1", "C2"];
  const queue = buildCustomsQueue(COUNTRIES, todayIds, save, souvenirOf, { rng: seededRng(2) });
  for (const item of queue) assert.equal(item.isToday, todayIds.includes(item.countryId));
});
test("buildCustomsQueue: プールが3件未満(序盤=今日の3か国のみ)でもcount件以内で返す", () => {
  const save = emptySave();
  const queue = buildCustomsQueue(COUNTRIES, ["C0", "C1", "C2"], save, souvenirOf, { rng: seededRng(3) });
  assert.equal(queue.length, 3);
  assert.deepEqual(queue.map((i) => i.countryId).sort(), ["C0", "C1", "C2"]);
});

/* ---------- customsAnswerOutcome / buildCustomsRetryItem（§3と同一の不正解ルール） ---------- */
test("customsAnswerOutcome: 正解idと一致すればok:true", () => {
  const item = { countryId: "C0" };
  assert.equal(customsAnswerOutcome(item, "C0").ok, true);
  assert.equal(customsAnswerOutcome(item, "C1").ok, false);
});
test("buildCustomsRetryItem: attemptNumberが+1され、3回目は2択に自動格下げ（ふつう/高群）", () => {
  const item = { countryId: "C0", attemptNumber: 1, isToday: true, souvenir: souvenirOf("C0") };
  const retry2 = buildCustomsRetryItem(item, COUNTRIES, "normal", { rng: seededRng(1) });
  assert.equal(retry2.attemptNumber, 2);
  assert.equal(retry2.choices.length, 4);
  const retry3 = buildCustomsRetryItem(retry2, COUNTRIES, "normal", { rng: seededRng(1) });
  assert.equal(retry3.attemptNumber, 3);
  assert.equal(retry3.choices.length, 2);
});
test("buildCustomsRetryItem: 低群プロフィールは2回目から2択に格下げ", () => {
  const item = { countryId: "C0", attemptNumber: 1, isToday: true, souvenir: souvenirOf("C0") };
  const retry2 = buildCustomsRetryItem(item, COUNTRIES, "easy", { rng: seededRng(1) });
  assert.equal(retry2.choices.length, 2);
});

/* ---------- applyCustomsAnswer: 「当日国非更新」境界ケース（§5） ---------- */
test("§5境界: 今日の国は正解してもsrsが変化しない（当日国非更新）", () => {
  const save = { ...emptySave(), srs: { C0: { streak: 2, lastAt: 500 } } };
  const next = applyCustomsAnswer(save, "C0", true, 1, ["C0", "C1", "C2"], 9999);
  assert.deepEqual(next.srs.C0, { streak: 2, lastAt: 500 }, "今日の国のsrsは訪問時の値のまま変化しないはず");
});
test("§5境界: 今日の国は不正解でもsrsが変化しない（同一旅内の二重カウント禁止）", () => {
  const save = { ...emptySave(), srs: { C0: { streak: 2, lastAt: 500 } } };
  const next = applyCustomsAnswer(save, "C0", false, 1, ["C0", "C1", "C2"], 9999);
  assert.deepEqual(next.srs.C0, { streak: 2, lastAt: 500 });
});
test("§5境界: 今日の国でもrecentは通常どおり更新される（隠し難易度の材料には使う）", () => {
  const save = emptySave();
  const next = applyCustomsAnswer(save, "C0", true, 1, ["C0", "C1", "C2"], 9999);
  assert.deepEqual(next.recent[0], { ok: true });
});
test("過去旅の国は正解でstreak+1・lastAt=訪問時刻に更新される", () => {
  const save = { ...emptySave(), srs: { C9: { streak: 2, lastAt: 500 } } };
  const next = applyCustomsAnswer(save, "C9", true, 1, ["C0", "C1", "C2"], 9999);
  assert.deepEqual(next.srs.C9, { streak: 3, lastAt: 9999 });
});
test("過去旅の国は不正解でstreak=0にリセットされる", () => {
  const save = { ...emptySave(), srs: { C9: { streak: 5, lastAt: 500 } } };
  const next = applyCustomsAnswer(save, "C9", false, 1, ["C0", "C1", "C2"], 9999);
  assert.deepEqual(next.srs.C9, { streak: 0, lastAt: 9999 });
});
test("再出題（attempt>=2）は今日の国・過去旅の国いずれもsave非更新（水増し防止）", () => {
  const save = { ...emptySave(), srs: { C9: { streak: 1, lastAt: 100 } } };
  const before = JSON.parse(JSON.stringify(save));
  const next = applyCustomsAnswer(save, "C9", true, 2, ["C0", "C1", "C2"], 9999);
  assert.deepEqual(next, before);
});

/* ---------- advanceCustomsQueue: App.jsx側が呼ぶオーケストレーション関数（PR3） ---------- */
test("advanceCustomsQueue: 全問初回正解ならdoneはキュー末尾でのみ1回発生する", () => {
  const save = emptySave();
  const queue = buildCustomsQueue(COUNTRIES, ["C0", "C1", "C2"], save, souvenirOf, { rng: seededRng(1) });
  let state = { queue, idx: 0 };
  let doneCount = 0;
  while (state.idx < state.queue.length) {
    const item = state.queue[state.idx];
    const result = advanceCustomsQueue(state, item.countryId, COUNTRIES, "normal");
    state = { queue: result.queue, idx: result.idx };
    if (result.done) doneCount++;
  }
  assert.equal(doneCount, 1);
});

test("advanceCustomsQueue: 不正解は末尾に再出題を積み、当日国か過去旅の国かに関わらずsrc更新はapplyCustomsAnswer側の責務のまま", () => {
  const save = { ...emptySave(), passport: { stamps: { C9: {} }, bonus: [], routes: [] } };
  const queue = buildCustomsQueue(COUNTRIES, ["C0", "C1", "C2"], save, souvenirOf, { rng: seededRng(1) });
  const item = queue[0];
  const wrongId = item.choices.find((c) => c.id !== item.countryId).id;
  const result = advanceCustomsQueue({ queue, idx: 0 }, wrongId, COUNTRIES, "normal");
  assert.equal(result.ok, false);
  assert.equal(result.done, false);
  assert.equal(result.queue.length, queue.length + 1, "末尾に再出題(attempt+1)が積まれる");
  assert.equal(result.queue[result.queue.length - 1].attemptNumber, 2);
});
