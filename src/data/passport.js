/* HANDOFF v2.3 §6.2: パスポート画面が使う並び順・ページ分割・航跡集計（純粋関数・UI非依存）。
   stamp.js（1個のスタンプ生成）とは別に、save.passport全体を扱う側をここに置く。 */

export const STAMPS_PER_PAGE = 6;

/* save.passport.stamps（{[id]: {dates, gold}}）を押印順（各国いちばん最初の日付の昇順）に
   並べる。同日タイ（同じ旅で複数国を訪問）はid昇順で安定させる。dates欠損/空は
   常に最後尾（""は文字列比較で最小になるため、代わりに大きな番兵を使う）。 */
export function orderedStamps(stamps) {
  const entries = Object.entries(stamps || {});
  return entries
    .map(([id, s]) => ({ id, dates: (s && s.dates) || [], gold: !!(s && s.gold) }))
    .sort((a, b) => {
      const da = a.dates[0] || "9999-99-99";
      const db = b.dates[0] || "9999-99-99";
      if (da !== db) return da < db ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/* 押印順リストを1ページperPage個（既定6）ずつに分割する。0件は空配列。 */
export function paginateStamps(list, perPage = STAMPS_PER_PAGE) {
  const pages = [];
  const items = Array.isArray(list) ? list : [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages;
}

/* ホームの世界地図に残す航跡は直近1旅分のみ（§6.2「ぐちゃぐちゃ防止」）。
   routesが空/未定義ならば空配列。 */
export function lastRouteIds(routes) {
  if (!Array.isArray(routes) || routes.length === 0) return [];
  const last = routes[routes.length - 1];
  return (last && last.ids) || [];
}

/* たびのきろく（最終ページ）用: 全航跡から重複を除いた国id集合。
   contOf(id)を渡した場合のみ大陸で絞り込む（省略時は全大陸）。 */
export function allRouteIds(routes, contOf, cont) {
  const out = new Set();
  for (const r of (Array.isArray(routes) ? routes : [])) {
    for (const id of (r && r.ids) || []) {
      if (!cont || (contOf && contOf(id) === cont)) out.add(id);
    }
  }
  return out;
}
