import test from "node:test";
import assert from "node:assert/strict";
import { orderedStamps, paginateStamps, lastRouteIds, allRouteIds, STAMPS_PER_PAGE, bonusDateOf } from "../src/data/passport.js";

test("orderedStamps: 各国の最初の日付の昇順に並ぶ（押印順）", () => {
  const stamps = {
    AUS: { dates: ["2026-07-20"], gold: false },
    JPN: { dates: ["2026-07-18"], gold: false },
    KEN: { dates: ["2026-07-19"], gold: true },
  };
  const list = orderedStamps(stamps);
  assert.deepEqual(list.map((s) => s.id), ["JPN", "KEN", "AUS"]);
});

test("orderedStamps: 再訪で日付が追記されても最初の日付（押印した日）で順位が決まる", () => {
  const stamps = {
    AUS: { dates: ["2026-07-18", "2026-08-01"], gold: false }, // 初訪問は最初
    JPN: { dates: ["2026-07-19"], gold: false },
  };
  const list = orderedStamps(stamps);
  assert.deepEqual(list.map((s) => s.id), ["AUS", "JPN"]);
});

test("orderedStamps: 同日タイはid昇順で安定する", () => {
  const stamps = {
    ZAF: { dates: ["2026-07-18"], gold: false },
    AUS: { dates: ["2026-07-18"], gold: false },
    KEN: { dates: ["2026-07-18"], gold: false },
  };
  const list = orderedStamps(stamps);
  assert.deepEqual(list.map((s) => s.id), ["AUS", "KEN", "ZAF"]);
});

test("orderedStamps: 空/未定義でも例外を投げず空配列を返す", () => {
  assert.deepEqual(orderedStamps({}), []);
  assert.deepEqual(orderedStamps(undefined), []);
});

test("orderedStamps: dates欠損の壊れたエントリでも例外を投げず末尾へ回す", () => {
  const stamps = { JPN: { dates: ["2026-07-18"], gold: false }, AUS: {} };
  const list = orderedStamps(stamps);
  assert.deepEqual(list.map((s) => s.id), ["JPN", "AUS"]);
  assert.deepEqual(list[1].dates, []);
});

test("paginateStamps: 6個ちょうどで1ページ", () => {
  const list = Array.from({ length: 6 }, (_, i) => ({ id: `C${i}` }));
  const pages = paginateStamps(list);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].length, 6);
});

test("paginateStamps: 7個は2ページ（6+1）", () => {
  const list = Array.from({ length: 7 }, (_, i) => ({ id: `C${i}` }));
  const pages = paginateStamps(list);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].length, 6);
  assert.equal(pages[1].length, 1);
});

test("paginateStamps: 0個は空配列（ページ無し＝表紙のみ）", () => {
  assert.deepEqual(paginateStamps([]), []);
});

test("paginateStamps: perPageを指定すればその単位で分割する", () => {
  const list = Array.from({ length: 5 }, (_, i) => ({ id: `C${i}` }));
  const pages = paginateStamps(list, 2);
  assert.equal(pages.length, 3);
  assert.equal(pages[2].length, 1);
});

test("STAMPS_PER_PAGE: 既定は6", () => {
  assert.equal(STAMPS_PER_PAGE, 6);
});

test("lastRouteIds: 直近（配列末尾）の旅のidsのみを返す", () => {
  const routes = [
    { tripId: "t1-1", ids: ["JPN", "AUS", "IDN"], date: "2026-07-18" },
    { tripId: "t1-2", ids: ["KEN", "ZAF"], date: "2026-07-19" },
  ];
  assert.deepEqual(lastRouteIds(routes), ["KEN", "ZAF"]);
});

test("lastRouteIds: 空/未定義は空配列", () => {
  assert.deepEqual(lastRouteIds([]), []);
  assert.deepEqual(lastRouteIds(undefined), []);
});

test("allRouteIds: 全航跡から重複を除いた国id集合を返す", () => {
  const routes = [
    { tripId: "t1-1", ids: ["JPN", "AUS"], date: "2026-07-18" },
    { tripId: "t1-2", ids: ["AUS", "KEN"], date: "2026-07-19" },
  ];
  const ids = allRouteIds(routes);
  assert.deepEqual([...ids].sort(), ["AUS", "JPN", "KEN"]);
});

test("allRouteIds: contOf/contを渡すと大陸で絞り込む", () => {
  const routes = [{ tripId: "t1-1", ids: ["JPN", "AUS", "KEN"], date: "2026-07-18" }];
  const contOf = (id) => ({ JPN: "asia", AUS: "oceania", KEN: "africa" }[id]);
  const ids = allRouteIds(routes, contOf, "asia");
  assert.deepEqual([...ids], ["JPN"]);
});

test("allRouteIds: 空でもクラッシュしない", () => {
  assert.deepEqual(allRouteIds([]), new Set());
  assert.deepEqual(allRouteIds(undefined), new Set());
});

/* ---------- bonusDateOf（PR5 §7: bonusIdからtripId経由でroutesの日付を逆引き） ---------- */
test("bonusDateOf: 'BONUS-'+tripIdから一致するroutesの日付を返す", () => {
  const routes = [
    { tripId: "t1-1", ids: ["JPN", "AUS", "KEN"], date: "2026-07-18" },
    { tripId: "t1-2", ids: ["ITA", "USA", "IND"], date: "2026-07-20" },
  ];
  assert.equal(bonusDateOf(routes, "BONUS-t1-2"), "2026-07-20");
});

test("bonusDateOf: 一致するroutesが無ければnull", () => {
  const routes = [{ tripId: "t1-1", ids: ["JPN"], date: "2026-07-18" }];
  assert.equal(bonusDateOf(routes, "BONUS-t9-9"), null);
});

test("bonusDateOf: 空/未定義のroutesでも例外を投げずnull", () => {
  assert.equal(bonusDateOf([], "BONUS-t1-1"), null);
  assert.equal(bonusDateOf(undefined, "BONUS-t1-1"), null);
});
