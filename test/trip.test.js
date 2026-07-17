import test from "node:test";
import assert from "node:assert/strict";
import {
  stageOf, progOf, masteredSlotCount,
  unlockedTierMax, availablePacks, nextLockedPack,
  srsWeight, pickBySimpleWeight, pickTopBySrsWeightRandom, buildTripSession, pickMeetWrong,
  tripAnswerOutcome, applyTripAnswer,
  computeStampValue, finishTrip, stampCountOf,
} from "../src/data/trip.js";

/* シード付き擬似乱数（テストの決定性のため。mulberry32） */
function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 24か国・4大陸のフィクスチャ（fillDistinctのフォールバックが十分機能する規模） */
const CONTS = ["asia", "europe", "africa", "namerica"];
const FIXTURE_COUNTRIES = Array.from({ length: 24 }, (_, i) => ({
  id: `C${i}`,
  cont: CONTS[i % CONTS.length],
  cap: `Cap${i}`,
}));
const byId = new Map(FIXTURE_COUNTRIES.map((c) => [c.id, c]));

const TRIP_FIXTURE = { id: "t1-1", label: "テストのたび", icon: "🐼", ids: ["C0", "C1", "C2"], tier: 1 };

const FLAG_GROUPS_FIXTURE = [
  { id: "g1", label: "グループ1", ids: ["C0", "C4", "C8"] },
];

function emptySave() {
  return { prog: {}, srs: {}, trips: { done: [], stamps: {} }, recent: [] };
}

/* ---------- stageOf（§4 3段はしご） ---------- */
test("stageOf: 未回答は0(であう)", () => {
  const save = emptySave();
  assert.equal(stageOf(save, "C0"), 0);
});
test("stageOf: 一部スロットが正解済みだが未マスターは1(みわける)", () => {
  const save = { ...emptySave(), prog: { C0: { name: 2, flag: 1, cap: 0 } } };
  assert.equal(stageOf(save, "C0"), 1);
});
test("stageOf: 全スロットがMASTER_AT(2)以上は2(おもいだす)", () => {
  const save = { ...emptySave(), prog: { C0: { name: 2, flag: 2, cap: 2 } } };
  assert.equal(stageOf(save, "C0"), 2);
});
test("progOf/masteredSlotCount: 未登録国は0件扱いで安全", () => {
  const save = emptySave();
  assert.deepEqual(progOf(save, "ZZZ"), { name: 0, flag: 0, cap: 0 });
  assert.equal(masteredSlotCount(save, "ZZZ"), 0);
});

/* ---------- buildTripSession: 10問構成比（§5.2） ---------- */
test("buildTripSession: 新規セーブ(全国stage0)でも10問=であい3/みわける4/ちょうせん2/おかえり1", () => {
  for (let seed = 0; seed < 20; seed++) {
    const session = buildTripSession(FIXTURE_COUNTRIES, emptySave(), TRIP_FIXTURE, { rng: seededRng(seed) });
    assert.equal(session.length, 10);
    const bySection = {};
    for (const q of session) bySection[q.section] = (bySection[q.section] || 0) + 1;
    assert.equal(bySection["であい"], 3);
    assert.equal(bySection["みわける"], 4);
    assert.equal(bySection["ちょうせん"], 2);
    assert.equal(bySection["おかえり"], 1);
  }
});

test("buildTripSession: であいの3問はパックの3か国そのもの", () => {
  const session = buildTripSession(FIXTURE_COUNTRIES, emptySave(), TRIP_FIXTURE, { rng: seededRng(1) });
  const meet = session.filter((q) => q.section === "であい");
  assert.deepEqual(meet.map((q) => q.c.id).sort(), ["C0", "C1", "C2"]);
  for (const q of meet) assert.equal(q.qType, "meet2");
});

test("buildTripSession: 進行中セーブ(stage1/stage2が混在)でも10問構成比が維持される", () => {
  const save = emptySave();
  // C10..C15をstage1(一部正解・未マスター)、C16..C19をstage2(全マスター)にする
  for (let i = 10; i <= 15; i++) save.prog[`C${i}`] = { name: 1, flag: 0, cap: 0 };
  for (let i = 16; i <= 19; i++) save.prog[`C${i}`] = { name: 2, flag: 2, cap: 2 };
  for (let seed = 0; seed < 10; seed++) {
    const session = buildTripSession(FIXTURE_COUNTRIES, save, TRIP_FIXTURE, { rng: seededRng(seed) });
    assert.equal(session.length, 10);
    const bySection = {};
    for (const q of session) bySection[q.section] = (bySection[q.section] || 0) + 1;
    assert.equal(bySection["であい"], 3);
    assert.equal(bySection["みわける"], 4);
    assert.equal(bySection["ちょうせん"], 2);
    assert.equal(bySection["おかえり"], 1);
  }
});

test("buildTripSession: みわけるはstage1国を優先して選ぶ（在庫が十分にある場合）", () => {
  const save = emptySave();
  for (let i = 10; i <= 15; i++) save.prog[`C${i}`] = { name: 1, flag: 0, cap: 0 };
  const session = buildTripSession(FIXTURE_COUNTRIES, save, TRIP_FIXTURE, { rng: seededRng(3) });
  const discern = session.filter((q) => q.section === "みわける");
  for (const q of discern) assert.ok(["C10", "C11", "C12", "C13", "C14", "C15"].includes(q.c.id));
});

test("buildTripSession: ちょうせんはstage2国を優先して選ぶ（在庫が十分にある場合）", () => {
  const save = emptySave();
  for (let i = 16; i <= 19; i++) save.prog[`C${i}`] = { name: 2, flag: 2, cap: 2 };
  const session = buildTripSession(FIXTURE_COUNTRIES, save, TRIP_FIXTURE, { rng: seededRng(7) });
  const challenge = session.filter((q) => q.section === "ちょうせん");
  for (const q of challenge) assert.ok(["C16", "C17", "C18", "C19"].includes(q.c.id));
});

/* ---------- pickBySimpleWeight（B-2: srs[id].lastAtが古い順の簡易重み） ---------- */
test("pickBySimpleWeight: lastAtが古い国ほど選ばれやすい", () => {
  const now = 1_000_000;
  const srs = {
    OLD: { streak: 0, lastAt: now - 1000 * 60 * 60 * 24 * 30 }, // 30日前
    NEW: { streak: 3, lastAt: now - 1000 * 60 },                // 1分前
  };
  const pool = [{ id: "OLD" }, { id: "NEW" }];
  let oldFirstCount = 0;
  for (let seed = 0; seed < 200; seed++) {
    const picked = pickBySimpleWeight(pool, 1, srs, now, seededRng(seed));
    if (picked[0].id === "OLD") oldFirstCount++;
  }
  assert.ok(oldFirstCount > 150, `OLDが選ばれた回数=${oldFirstCount}/200 のはず十分多い`);
});

test("pickBySimpleWeight: 未記録は中立（極端に有利/不利にならない）", () => {
  const now = 1_000_000;
  const srs = { OLD: { streak: 0, lastAt: now - 1000 * 60 * 60 * 24 * 365 } }; // 1年前=かなり古い
  const pool = [{ id: "OLD" }, { id: "UNRECORDED" }];
  let unrecordedCount = 0;
  for (let seed = 0; seed < 200; seed++) {
    const picked = pickBySimpleWeight(pool, 1, srs, now, seededRng(seed));
    if (picked[0].id === "UNRECORDED") unrecordedCount++;
  }
  // 中立=OLD(1年古い)ほどは有利でないので、勝率は五分未満のはず。ただし0にはならない
  assert.ok(unrecordedCount > 0 && unrecordedCount < 100, `UNRECORDEDが選ばれた回数=${unrecordedCount}/200`);
});

/* ---------- srsWeight（§6 軽量SRS：境界値） ---------- */
test("srsWeight: 未学習(srsエントリなし)は中立の3を返す", () => {
  const save = { srs: {} };
  assert.equal(srsWeight(save, "ZZZ", 1_000_000), 3);
});

test("srsWeight: streakが増えるほど重みは小さくなる（同じ経過日数で比較）", () => {
  const now = 1_000_000_000;
  const lastAt = now - 1000 * 60 * 60 * 24 * 1; // 1日前で固定（クランプを避ける）
  const save = {
    srs: {
      LOW: { streak: 0, lastAt },
      MID: { streak: 1, lastAt },
      HIGH: { streak: 4, lastAt },
    },
  };
  const wLow = srsWeight(save, "LOW", now);
  const wMid = srsWeight(save, "MID", now);
  const wHigh = srsWeight(save, "HIGH", now);
  assert.ok(wLow > wMid, `streak0(${wLow}) > streak1(${wMid}) のはず`);
  assert.ok(wMid > wHigh, `streak1(${wMid}) > streak4(${wHigh}) のはず`);
});

test("srsWeight: 経過日数が増えるほど重みは大きくなる（同じstreakで比較）", () => {
  const now = 1_000_000_000;
  const save = {
    srs: {
      RECENT: { streak: 1, lastAt: now - 1000 * 60 * 60 * 24 * 1 },  // 1日前
      OLDER: { streak: 1, lastAt: now - 1000 * 60 * 60 * 24 * 5 },   // 5日前
    },
  };
  const wRecent = srsWeight(save, "RECENT", now);
  const wOlder = srsWeight(save, "OLDER", now);
  assert.ok(wOlder > wRecent, `5日前(${wOlder}) > 1日前(${wRecent}) のはず`);
});

test("srsWeight: 上限10でクランプされる（経過日数が極端に大きい場合）", () => {
  const now = 1_000_000_000;
  const save = { srs: { ANCIENT: { streak: 0, lastAt: now - 1000 * 60 * 60 * 24 * 365 } } }; // 1年前
  assert.equal(srsWeight(save, "ANCIENT", now), 10);
});

test("srsWeight: 式の値そのものが仕様通り（min(10, 1 + days/(streak+1)*2)）", () => {
  const now = 1_000_000_000;
  const days = 2;
  const streak = 1;
  const save = { srs: { C: { streak, lastAt: now - days * 86400000 } } };
  const expected = Math.min(10, 1 + (days / (streak + 1)) * 2);
  assert.equal(srsWeight(save, "C", now), expected);
  assert.equal(srsWeight(save, "C", now), 3); // 1 + 2/2*2 = 3
});

/* ---------- pickTopBySrsWeightRandom（[おかえり]枠: srsWeight降順の上位からランダム選出） ---------- */
test("pickTopBySrsWeightRandom: srsWeightが低い（＝忘却リスクが低い）国は選ばれず、上位の国だけが選ばれる", () => {
  const now = 1_000_000_000;
  // 降順に厳密ランク付け: C0(9) > C1(7) > C2(5) > C3(3) > C4(1)
  const save = {
    srs: {
      C0: { streak: 0, lastAt: now - 4 * 86400000 },
      C1: { streak: 0, lastAt: now - 3 * 86400000 },
      C2: { streak: 0, lastAt: now - 2 * 86400000 },
      C3: { streak: 0, lastAt: now - 1 * 86400000 },
      C4: { streak: 0, lastAt: now },
    },
  };
  const pool = ["C0", "C1", "C2", "C3", "C4"].map((id) => ({ id }));
  const seen = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const picked = pickTopBySrsWeightRandom(pool, 1, save, now, seededRng(seed));
    assert.equal(picked.length, 1);
    seen.add(picked[0].id);
  }
  // 上位3件(C0,C1,C2)は候補ウィンドウ内、下位2件(C3,C4=srsWeight最低)は常に除外される
  assert.ok(seen.has("C0") || seen.has("C1") || seen.has("C2"), "上位のいずれかは選ばれるはず");
  assert.ok(!seen.has("C3"), "srsWeightが低いC3は選ばれないはず");
  assert.ok(!seen.has("C4"), "srsWeightが最も低いC4は選ばれないはず");
});

test("pickTopBySrsWeightRandom: 上位ウィンドウ内では毎回同じ1件に固定されずランダム性がある", () => {
  const now = 1_000_000_000;
  const save = {
    srs: {
      C0: { streak: 0, lastAt: now - 4 * 86400000 },
      C1: { streak: 0, lastAt: now - 3 * 86400000 },
      C2: { streak: 0, lastAt: now - 2 * 86400000 },
      C3: { streak: 0, lastAt: now - 1 * 86400000 },
      C4: { streak: 0, lastAt: now },
    },
  };
  const pool = ["C0", "C1", "C2", "C3", "C4"].map((id) => ({ id }));
  const seen = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const picked = pickTopBySrsWeightRandom(pool, 1, save, now, seededRng(seed));
    seen.add(picked[0].id);
  }
  assert.ok(seen.size >= 2, `上位ウィンドウ内から複数の国が選ばれるはず（実際=${[...seen]}）`);
});

/* ---------- pickMeetWrong（stage0の誤答: 別大陸・別フラググループ） ---------- */
test("pickMeetWrong: 同大陸・同フラググループの国を誤答に選ばない", () => {
  const target = byId.get("C0"); // asia, group g1所属
  for (let seed = 0; seed < 50; seed++) {
    const wrong = pickMeetWrong(FIXTURE_COUNTRIES, target, FLAG_GROUPS_FIXTURE, seededRng(seed));
    assert.notEqual(wrong.cont, target.cont);
    assert.notEqual(wrong.id, "C4"); // 同グループ
    assert.notEqual(wrong.id, "C8"); // 同グループ
  }
});

/* ---------- まちがえたときのルール（§5.3・B-4・A-1） ---------- */
test("tripAnswerOutcome: 不正解が続いても3回目で強制前進し、無限に不正解終了しない", () => {
  let o = tripAnswerOutcome(1, false);
  assert.equal(o.retry, true); assert.equal(o.forcedAdvance, false); assert.equal(o.updateSave, true);
  o = tripAnswerOutcome(2, false);
  assert.equal(o.retry, true); assert.equal(o.forcedAdvance, false); assert.equal(o.updateSave, false);
  o = tripAnswerOutcome(3, false);
  assert.equal(o.retry, false); assert.equal(o.forcedAdvance, true); assert.equal(o.updateSave, false);
});
test("tripAnswerOutcome: 正解ならどの回でもretry=falseで先へ進める", () => {
  for (const n of [1, 2, 3]) {
    const o = tripAnswerOutcome(n, true);
    assert.equal(o.retry, false);
    assert.equal(o.forcedAdvance, false);
  }
});
test("tripAnswerOutcome: 初回のみupdateSave=true（再出題は据え置き）", () => {
  assert.equal(tripAnswerOutcome(1, true).updateSave, true);
  assert.equal(tripAnswerOutcome(1, false).updateSave, true);
  assert.equal(tripAnswerOutcome(2, true).updateSave, false);
  assert.equal(tripAnswerOutcome(2, false).updateSave, false);
  assert.equal(tripAnswerOutcome(3, true).updateSave, false);
  assert.equal(tripAnswerOutcome(3, false).updateSave, false);
});

test("applyTripAnswer: 初回不正解でsrs/recentは更新されるがprogは増えない", () => {
  const save = applyTripAnswer(emptySave(), { id: "C0" }, "name", false, 1, 1000);
  assert.equal(save.recent.length, 1);
  assert.equal(save.recent[0].ok, false);
  assert.deepEqual(save.srs.C0, { streak: 0, lastAt: 1000 });
  assert.equal(save.prog.C0, undefined);
});

test("applyTripAnswer: 初回正解でprog/srs/recentがすべて更新される", () => {
  const save = applyTripAnswer(emptySave(), { id: "C0" }, "flag", true, 1, 1000);
  assert.equal(save.recent.length, 1);
  assert.equal(save.recent[0].ok, true);
  assert.deepEqual(save.srs.C0, { streak: 1, lastAt: 1000 });
  assert.equal(save.prog.C0.flag, 1);
});

test("applyTripAnswer: 再出題（2回目）の正解はprog・srs・recentいずれも加算しない", () => {
  let save = applyTripAnswer(emptySave(), { id: "C0" }, "name", false, 1, 1000);
  const afterFirst = JSON.parse(JSON.stringify(save));
  save = applyTripAnswer(save, { id: "C0" }, "name", true, 2, 2000);
  assert.deepEqual(save, afterFirst);
});

test("applyTripAnswer: 3回連続不正解でも2回目・3回目の不正解はsaveに加算されない", () => {
  let save = applyTripAnswer(emptySave(), { id: "C0" }, "name", false, 1, 1000);
  const afterFirst = JSON.parse(JSON.stringify(save));
  save = applyTripAnswer(save, { id: "C0" }, "name", false, 2, 2000);
  save = applyTripAnswer(save, { id: "C0" }, "name", false, 3, 3000);
  assert.deepEqual(save, afterFirst);
});

test("不正解終了が起きない: 全問3回連続不正解でもtripAnswerOutcomeは必ずforcedAdvanceでセッションを前進させられる", () => {
  const save = emptySave();
  let s = save;
  const session = buildTripSession(FIXTURE_COUNTRIES, save, TRIP_FIXTURE, { rng: seededRng(5) });
  let advancedCount = 0;
  for (const q of session) {
    let attempt = 1;
    let advanced = false;
    while (!advanced) {
      const outcome = tripAnswerOutcome(attempt, false); // 常に不正解
      s = applyTripAnswer(s, q.c, q.qType, false, attempt, 1000 * attempt);
      if (!outcome.retry) { advanced = true; advancedCount++; }
      attempt++;
      assert.ok(attempt <= 4, "3回で必ず強制前進するはず（無限ループ検知）");
    }
  }
  assert.equal(advancedCount, session.length);
});

/* ---------- パック解放（§5.1） ---------- */
const TIER_TRIPS = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `t1-${i + 1}`, label: `tier1-${i}`, icon: "🐼", ids: ["C0"], tier: 1 })),
  { id: "t2-1", label: "tier2-1", icon: "🎏", ids: ["C1"], tier: 2 },
];

test("unlockedTierMax: 初期状態はtier1のみ解放", () => {
  assert.equal(unlockedTierMax(emptySave(), TIER_TRIPS), 1);
});
test("unlockedTierMax: tier1を6パック完了するとtier2が解放される", () => {
  const save = { ...emptySave(), trips: { done: ["t1-1", "t1-2", "t1-3", "t1-4", "t1-5", "t1-6"], stamps: {} } };
  assert.equal(unlockedTierMax(save, TIER_TRIPS), 2);
});
test("unlockedTierMax: 5パックだけではtier2は解放されない", () => {
  const save = { ...emptySave(), trips: { done: ["t1-1", "t1-2", "t1-3", "t1-4", "t1-5"], stamps: {} } };
  assert.equal(unlockedTierMax(save, TIER_TRIPS), 1);
});
test("availablePacks: tier2解放前はtier1のパックのみ返す", () => {
  const packs = availablePacks(emptySave(), TIER_TRIPS);
  assert.ok(packs.every((p) => p.tier === 1));
  assert.equal(packs.length, 8);
});
test("nextLockedPack: tier2解放前は次のtier2パックを1つだけチラ見せする", () => {
  const locked = nextLockedPack(emptySave(), TIER_TRIPS);
  assert.equal(locked.id, "t2-1");
});
test("nextLockedPack: 全tier解放済みならnull（見せるロックが無い）", () => {
  const save = { ...emptySave(), trips: { done: ["t1-1", "t1-2", "t1-3", "t1-4", "t1-5", "t1-6", "t2-1"], stamps: {} } };
  assert.equal(nextLockedPack(save, TIER_TRIPS), null);
});

/* ---------- パック完了とスタンプ（§5.4） ---------- */
test("computeStampValue: パック内が未マスターなら通常スタンプ(1)", () => {
  const save = emptySave();
  assert.equal(computeStampValue(save, TRIP_FIXTURE), 1);
});
test("computeStampValue: パック内3か国が全スロットマスター済みなら金スタンプ(3)", () => {
  const save = emptySave();
  for (const id of TRIP_FIXTURE.ids) save.prog[id] = { name: 2, flag: 2, cap: 2 };
  assert.equal(computeStampValue(save, TRIP_FIXTURE), 3);
});

test("finishTrip: 初回完了でtrips.doneに追加されstamps=1が記録される", () => {
  const save = finishTrip(emptySave(), TRIP_FIXTURE, 5000);
  assert.deepEqual(save.trips.done, ["t1-1"]);
  assert.equal(save.trips.stamps["t1-1"], 1);
});
test("finishTrip: 3段はしご完登済みなら金スタンプ(3)が記録される", () => {
  const save = emptySave();
  for (const id of TRIP_FIXTURE.ids) save.prog[id] = { name: 2, flag: 2, cap: 2 };
  const next = finishTrip(save, TRIP_FIXTURE, 5000);
  assert.equal(next.trips.stamps["t1-1"], 3);
});
test("finishTrip: 既に金スタンプ済みなら再プレイで降格しない", () => {
  let save = { ...emptySave(), trips: { done: ["t1-1"], stamps: { "t1-1": 3 } } };
  save = finishTrip(save, TRIP_FIXTURE, 6000);
  assert.equal(save.trips.stamps["t1-1"], 3);
  assert.deepEqual(save.trips.done, ["t1-1"]); // 重複追加しない
});
test("stampCountOf: スタンプが付いたパック数を返す（ガチャ接続フック）", () => {
  const save = { ...emptySave(), trips: { done: ["t1-1", "t1-2"], stamps: { "t1-1": 1, "t1-2": 3, "t1-3": 0 } } };
  assert.equal(stampCountOf(save), 2);
});
