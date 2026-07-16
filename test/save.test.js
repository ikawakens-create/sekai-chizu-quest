import test from "node:test";
import assert from "node:assert/strict";
import {
  emptySaveV2, migrateFromV1, mergeSaveV2, loadSaveV2, persistSaveV2,
  pushRecent, hiddenDifficultyOf,
} from "../src/data/save.js";

/* localStorage互換の最小モック（Map裏付け） */
function makeMockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

test("emptySaveV2: 初回起動はp1(voice:false)/p2(voice:true)の空プロフィール2枠", () => {
  const s = emptySaveV2();
  assert.equal(s.version, 2);
  assert.equal(s.activeProfile, "p1");
  assert.equal(s.profiles.p1.voice, false);
  assert.equal(s.profiles.p2.voice, true);
  for (const pid of ["p1", "p2"]) {
    const p = s.profiles[pid];
    assert.deepEqual(p.prog, {});
    assert.equal(p.plays, 0);
    assert.equal(p.perfects, 0);
    assert.deepEqual(p.stickers, {});
    assert.deepEqual(p.srs, {});
    assert.deepEqual(p.trips, { done: [], stamps: {} });
    assert.deepEqual(p.daily, {});
    assert.deepEqual(p.recent, []);
  }
});

test("migrateFromV1: v1のprog/plays/perfects/stickersがp1へ欠損ゼロで移行される", () => {
  const v1 = {
    prog: {
      JPN: { name: 2, flag: 2, cap: 1 },
      USA: { name: 1, flag: 0, cap: 0 },
      FRA: { name: 2, flag: 2, cap: 2 },
    },
    plays: 37,
    perfects: 5,
    stickers: { moai: 2, liberty: 1, dragon: 3 },
  };
  const migrated = migrateFromV1(v1);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.activeProfile, "p1");
  // 欠損ゼロ: 移行前後でJSONとして完全一致する
  assert.deepEqual(migrated.profiles.p1.prog, v1.prog);
  assert.equal(migrated.profiles.p1.plays, v1.plays);
  assert.equal(migrated.profiles.p1.perfects, v1.perfects);
  assert.deepEqual(migrated.profiles.p1.stickers, v1.stickers);
  // 新フィールドは空の入れ物として初期化される
  assert.deepEqual(migrated.profiles.p1.srs, {});
  assert.deepEqual(migrated.profiles.p1.trips, { done: [], stamps: {} });
  assert.deepEqual(migrated.profiles.p1.daily, {});
  assert.deepEqual(migrated.profiles.p1.recent, []);
  // p2は空のまま
  assert.deepEqual(migrated.profiles.p2, emptySaveV2().profiles.p2);
});

test("migrateFromV1: 空/欠損フィールドのv1でも例外を投げず安全にフォールバックする", () => {
  assert.doesNotThrow(() => migrateFromV1({}));
  assert.doesNotThrow(() => migrateFromV1(null));
  const m = migrateFromV1({ prog: { JPN: { name: 1, flag: 0, cap: 0 } } });
  assert.deepEqual(m.profiles.p1.prog, { JPN: { name: 1, flag: 0, cap: 0 } });
  assert.equal(m.profiles.p1.plays, 0);
  assert.equal(m.profiles.p1.perfects, 0);
  assert.deepEqual(m.profiles.p1.stickers, {});
});

test("mergeSaveV2: 完全なv2ドキュメントはラウンドトリップで一切欠損しない", () => {
  const full = {
    version: 2,
    activeProfile: "p2",
    profiles: {
      p1: {
        name: "おねえちゃん", voice: false,
        prog: { JPN: { name: 2, flag: 2, cap: 2 } }, plays: 10, perfects: 2,
        stickers: { moai: 1 },
        srs: { JPN: { lastAt: 1700000000000, streak: 3 } },
        trips: { done: ["t1-1"], stamps: { JPN: 2 } },
        daily: { "2026-07-16": { score: 4, total: 5 } },
        recent: [{ ok: true }, { ok: false }],
      },
      p2: {
        name: "いもうと", voice: true,
        prog: {}, plays: 0, perfects: 0, stickers: {},
        srs: {}, trips: { done: [], stamps: {} }, daily: {}, recent: [],
      },
    },
  };
  const merged = mergeSaveV2(JSON.parse(JSON.stringify(full)));
  assert.deepEqual(merged, full);
});

test("mergeSaveV2: 一部フィールドが欠けたv2でも欠損分だけ補い他は保持する", () => {
  const partial = {
    version: 2,
    activeProfile: "p1",
    profiles: {
      p1: { prog: { JPN: { name: 1, flag: 0, cap: 0 } }, plays: 3 }, // 他フィールド無し
      // p2キー自体が無い
    },
  };
  const merged = mergeSaveV2(partial);
  assert.deepEqual(merged.profiles.p1.prog, { JPN: { name: 1, flag: 0, cap: 0 } });
  assert.equal(merged.profiles.p1.plays, 3);
  assert.equal(merged.profiles.p1.perfects, 0);
  assert.deepEqual(merged.profiles.p1.recent, []);
  assert.deepEqual(merged.profiles.p2, emptySaveV2().profiles.p2);
});

test("mergeSaveV2: null/不正な入力は空のv2を返す", () => {
  assert.deepEqual(mergeSaveV2(null), emptySaveV2());
  assert.deepEqual(mergeSaveV2(undefined), emptySaveV2());
  assert.deepEqual(mergeSaveV2("broken"), emptySaveV2());
});

test("loadSaveV2: v2が既にあればそれを読み込む（v1は参照しない）", () => {
  const v2doc = migrateFromV1({ prog: {}, plays: 1, perfects: 0, stickers: {} });
  const storage = makeMockStorage({
    "sekai-chizu-quest-v2": JSON.stringify(v2doc),
    "sekai-chizu-quest-v1": JSON.stringify({ prog: { SHOULD_NOT_BE_USED: {} }, plays: 999, perfects: 999, stickers: {} }),
  });
  const loaded = loadSaveV2(storage);
  assert.equal(loaded.profiles.p1.plays, 1);
  assert.equal(loaded.profiles.p1.prog.SHOULD_NOT_BE_USED, undefined);
});

test("loadSaveV2: v2が無くv1のみある場合は移行し、v1キーは温存(削除もrewriteもされない)", () => {
  const v1raw = JSON.stringify({
    prog: { JPN: { name: 2, flag: 1, cap: 0 } },
    plays: 12, perfects: 1,
    stickers: { camel: 2 },
  });
  const storage = makeMockStorage({ "sekai-chizu-quest-v1": v1raw });
  const loaded = loadSaveV2(storage);
  assert.equal(loaded.profiles.p1.plays, 12);
  assert.equal(loaded.profiles.p1.perfects, 1);
  assert.deepEqual(loaded.profiles.p1.stickers, { camel: 2 });
  assert.deepEqual(loaded.profiles.p1.prog, { JPN: { name: 2, flag: 1, cap: 0 } });
  // v1キーはそのまま残っている（内容も一切変わっていない）
  assert.equal(storage.getItem("sekai-chizu-quest-v1"), v1raw);
  // 移行結果はv2として書き出されている
  assert.ok(storage.getItem("sekai-chizu-quest-v2"));
  const persisted = JSON.parse(storage.getItem("sekai-chizu-quest-v2"));
  assert.equal(persisted.profiles.p1.plays, 12);
});

test("loadSaveV2: v1もv2も無ければ空のv2を返す", () => {
  const storage = makeMockStorage({});
  const loaded = loadSaveV2(storage);
  assert.deepEqual(loaded, emptySaveV2());
});

test("loadSaveV2: 壊れたJSONでも例外を投げず空のv2にフォールバックする", () => {
  const storage = makeMockStorage({ "sekai-chizu-quest-v2": "{not json" });
  assert.doesNotThrow(() => loadSaveV2(storage));
  assert.deepEqual(loadSaveV2(storage), emptySaveV2());
});

test("persistSaveV2: 書き込んだJSONをloadSaveV2で読み戻せる", () => {
  const storage = makeMockStorage({});
  const doc = migrateFromV1({ prog: {}, plays: 5, perfects: 0, stickers: {} });
  persistSaveV2(doc, storage);
  const loaded = loadSaveV2(storage);
  assert.equal(loaded.profiles.p1.plays, 5);
});

test("pushRecent: 先頭にpushし、20件を超えたら末尾を破棄するリングバッファ", () => {
  let recent = [];
  for (let i = 0; i < 25; i++) {
    recent = pushRecent(recent, i % 2 === 0);
  }
  assert.equal(recent.length, 20);
  // 最新（i=24, 偶数=true）が先頭
  assert.equal(recent[0].ok, true);
  // 最古の5件（i=0..4）は破棄され、i=5(ok:false)が末尾になっている
  assert.equal(recent[19].ok, false);
});

test("pushRecent: 空/未定義から積み上げても壊れない", () => {
  const r1 = pushRecent(undefined, true);
  assert.deepEqual(r1, [{ ok: true }]);
  const r2 = pushRecent(null, false);
  assert.deepEqual(r2, [{ ok: false }]);
});

test("hiddenDifficultyOf: 10件未満は常に'normal'（サンプル不足）", () => {
  assert.equal(hiddenDifficultyOf([]), "normal");
  const nineAllCorrect = Array.from({ length: 9 }, () => ({ ok: true }));
  assert.equal(hiddenDifficultyOf(nineAllCorrect), "normal");
  const nineAllWrong = Array.from({ length: 9 }, () => ({ ok: false }));
  assert.equal(hiddenDifficultyOf(nineAllWrong), "normal");
});

test("hiddenDifficultyOf: 正答率85%超で'hard'（10件中9正解=90%）", () => {
  const recent = [
    ...Array.from({ length: 9 }, () => ({ ok: true })),
    { ok: false },
  ];
  assert.equal(hiddenDifficultyOf(recent), "hard");
});

test("hiddenDifficultyOf: 正答率ちょうど85%は'hard'にならない（境界値）", () => {
  // 20件中17正解 = 85.0%（85%超ではない）
  const recent = [
    ...Array.from({ length: 17 }, () => ({ ok: true })),
    ...Array.from({ length: 3 }, () => ({ ok: false })),
  ];
  assert.equal(hiddenDifficultyOf(recent), "normal");
});

test("hiddenDifficultyOf: 正答率60%未満で'easy'（10件中5正解=50%）", () => {
  const recent = [
    ...Array.from({ length: 5 }, () => ({ ok: true })),
    ...Array.from({ length: 5 }, () => ({ ok: false })),
  ];
  assert.equal(hiddenDifficultyOf(recent), "easy");
});

test("hiddenDifficultyOf: 正答率ちょうど60%は'easy'にならない（境界値・中立を維持）", () => {
  // 10件中6正解 = 60.0%（60%未満ではない）
  const recent = [
    ...Array.from({ length: 6 }, () => ({ ok: true })),
    ...Array.from({ length: 4 }, () => ({ ok: false })),
  ];
  assert.equal(hiddenDifficultyOf(recent), "normal");
});
