import test from "node:test";
import assert from "node:assert/strict";
import {
  stageOf, progOf, masteredSlotCount,
  unlockedTierMax, availablePacks, nextLockedPack,
  srsWeight, pickBySimpleWeight, pickTopBySrsWeightRandom,
  isPackCleared, packDoneIds, unvisitedInPack, fillPackDestinations,
  pickTransferCountry, buildTripVisits,
} from "../src/data/trip.js";
import { mulberry32 } from "../src/data/rng.js";

/* シード付き擬似乱数（テストの決定性のため。mulberry32。src/data/rng.js の実装を使用） */
const seededRng = mulberry32;

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

/* ---------- §8.3 パッククリア判定・done算出 ---------- */
test("isPackCleared: 内包全国がisVisited=trueなら真", () => {
  const visited = new Set(["C0", "C1", "C2"]);
  assert.equal(isPackCleared(TRIP_FIXTURE, (id) => visited.has(id)), true);
});
test("isPackCleared: 1国でも未訪問なら偽", () => {
  const visited = new Set(["C0", "C1"]);
  assert.equal(isPackCleared(TRIP_FIXTURE, (id) => visited.has(id)), false);
});
test("packDoneIds: クリア済みパックのidだけを返す（save.trips.doneを永続化せず都度算出）", () => {
  const packs = [TRIP_FIXTURE, { id: "t1-2", label: "べつのたび", icon: "🍕", ids: ["C3"], tier: 1 }];
  const visited = new Set(["C0", "C1", "C2"]); // TRIP_FIXTUREのみクリア、t1-2は未訪問
  assert.deepEqual(packDoneIds(packs, (id) => visited.has(id)), ["t1-1"]);
});
test("packDoneIds: 充当国のクリア判定帰属（ADR）: のりつぎ等で訪れた他パックの国も、その国自身のisVisitedがtrueになった時点で当該パックのクリアに数える", () => {
  // t1-2の国C3は「のりつぎ」等でどこかの旅で訪れたことにする（充当元パックの区別はisVisited側が持たない）
  const packs = [TRIP_FIXTURE, { id: "t1-2", label: "べつのたび", icon: "🍕", ids: ["C3"], tier: 1 }];
  const visited = new Set(["C3"]);
  assert.deepEqual(packDoneIds(packs, (id) => visited.has(id)), ["t1-2"]);
});

/* ---------- §8.3 行き先カードの供給：パック内未訪問国＋隣接パック充当 ---------- */
test("unvisitedInPack: 未訪問国のみを返す", () => {
  const visited = new Set(["C0"]);
  assert.deepEqual(unvisitedInPack(TRIP_FIXTURE, (id) => visited.has(id)), ["C1", "C2"]);
});

test("fillPackDestinations: パック内に十分な未訪問国があればパック内から選ぶ（隣接パックへ充当しない）", () => {
  const save = emptySave();
  for (let seed = 0; seed < 10; seed++) {
    const picked = fillPackDestinations(TRIP_FIXTURE, [TRIP_FIXTURE], FIXTURE_COUNTRIES, save, 2, {
      isVisited: () => false, rng: seededRng(seed),
    });
    assert.equal(picked.length, 2);
    for (const c of picked) assert.ok(TRIP_FIXTURE.ids.includes(c.id));
  }
});

test("fillPackDestinations: パック内の未訪問が足りない終盤は隣接パック（自パック以外の解放済みパック）から充当する", () => {
  const save = emptySave();
  const adjacent = { id: "t1-2", label: "べつのたび", icon: "🍕", ids: ["C9", "C10", "C11"], tier: 1 };
  const visited = new Set(["C0", "C1"]); // TRIP_FIXTURE(C0,C1,C2)は未訪問がC2の1件のみ
  const picked = fillPackDestinations(TRIP_FIXTURE, [TRIP_FIXTURE, adjacent], FIXTURE_COUNTRIES, save, 2, {
    isVisited: (id) => visited.has(id), rng: seededRng(1),
  });
  assert.equal(picked.length, 2);
  assert.ok(picked.some((c) => c.id === "C2"), "自パックの残り未訪問国は必ず含む");
  assert.ok(picked.some((c) => adjacent.ids.includes(c.id)), "不足分は隣接パックから充当される");
});

test("fillPackDestinations: 隣接パックも訪問済みのidは充当候補から除外する", () => {
  const save = emptySave();
  const adjacent = { id: "t1-2", label: "べつのたび", icon: "🍕", ids: ["C9"], tier: 1 };
  const visited = new Set(["C0", "C1", "C9"]); // C9は隣接パック内だが既訪問
  const picked = fillPackDestinations(TRIP_FIXTURE, [TRIP_FIXTURE, adjacent], FIXTURE_COUNTRIES, save, 2, {
    isVisited: (id) => visited.has(id), rng: seededRng(1),
  });
  assert.ok(!picked.some((c) => c.id === "C9"), "訪問済みのC9は充当されないはず");
});

/* ---------- §4 のりつぎ（トランジット）候補選出 ---------- */
test("pickTransferCountry: 候補が空ならnull（§4「候補ゼロの場合はのりつぎ無し」）", () => {
  assert.equal(pickTransferCountry([], ["asia"], emptySave()), null);
});

test("pickTransferCountry: 同大陸の候補は係数1.5倍で優先的に選ばれる", () => {
  const now = 1_000_000_000;
  const save = {
    srs: {
      SAME: { streak: 0, lastAt: now - 2 * 86400000 },
      OTHER: { streak: 0, lastAt: now - 2 * 86400000 }, // srsWeightは同値、大陸だけ違う
    },
  };
  const candidates = [
    { id: "SAME", cont: "asia" },
    { id: "OTHER", cont: "europe" },
  ];
  let sameCount = 0;
  for (let seed = 0; seed < 200; seed++) {
    const picked = pickTransferCountry(candidates, ["asia"], save, { now, rng: seededRng(seed) });
    if (picked.id === "SAME") sameCount++;
  }
  // 理論値は1.5/(1.5+1)=60%(≒120/200)。等倍(50%)より明確に有利であることのみ確認する
  assert.ok(sameCount > 105, `同大陸候補(重み1.5倍)が選ばれた回数=${sameCount}/200のはず有利`);
});

/* ---------- §4+§8.3 1旅の訪問国確定：パック2＋のりつぎ1 ---------- */
test("buildTripVisits: のりつぎ候補があれば3件=パック国2＋のりつぎ1、重複なし", () => {
  const save = emptySave();
  const transferEligible = FIXTURE_COUNTRIES.filter((c) => c.id.startsWith("C1")); // C1,C10..C19
  for (let seed = 0; seed < 10; seed++) {
    const { visits, transferId } = buildTripVisits(
      TRIP_FIXTURE, [TRIP_FIXTURE], FIXTURE_COUNTRIES, save, transferEligible,
      { isVisited: () => false, rng: seededRng(seed) }
    );
    assert.equal(visits.length, 3);
    assert.equal(new Set(visits.map((c) => c.id)).size, 3, "重複なし");
    assert.ok(transferId, "のりつぎ国が選出されているはず");
    assert.ok(!TRIP_FIXTURE.ids.includes(transferId) || visits.filter((c) => c.id === transferId).length === 1);
  }
});

test("buildTripVisits: のりつぎ候補ゼロなら、のりつぎ無し・パックから3か国で埋める（§4境界ケース）", () => {
  const save = emptySave();
  const { visits, transferId } = buildTripVisits(
    TRIP_FIXTURE, [TRIP_FIXTURE], FIXTURE_COUNTRIES, save, [], // 候補ゼロ
    { isVisited: () => false, rng: seededRng(2) }
  );
  assert.equal(transferId, null);
  assert.equal(visits.length, 3);
  assert.equal(new Set(visits.map((c) => c.id)).size, 3);
  for (const c of visits) assert.ok(TRIP_FIXTURE.ids.includes(c.id));
});

test("buildTripVisits: のりつぎ候補が今回選ばれたパック国と重複する場合は除外して選ぶ", () => {
  const save = emptySave();
  // TRIP_FIXTUREの3か国自身をのりつぎ候補プールに混ぜても、パック側の2件と重複しない
  const transferEligible = FIXTURE_COUNTRIES.filter((c) => TRIP_FIXTURE.ids.includes(c.id));
  for (let seed = 0; seed < 10; seed++) {
    const { visits } = buildTripVisits(
      TRIP_FIXTURE, [TRIP_FIXTURE], FIXTURE_COUNTRIES, save, transferEligible,
      { isVisited: () => false, rng: seededRng(seed) }
    );
    assert.equal(new Set(visits.map((c) => c.id)).size, visits.length, "重複が発生していないはず");
  }
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

