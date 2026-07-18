/* HANDOFF v2.3 §5: ぜいかんけんさ（かえりみちの復習）の純粋ロジック（PR3）。
   出題プール = 今日訪れた3か国 + 過去の旅で スタンプ済み（=おみやげ所持）の国から、
   srsWeight上位（trip.jsのpickTopBySrsWeightRandomをそのまま再利用）。
   「この🥐、どこで もらった？」→ 選択肢は国旗4枚（souvenirs.jsの絵文字が手がかり、
   答えは国旗そのもの＝絵文字⇔国名の連合だけを覚える弊害を防ぐ）。
   不正解時のルールは§3と同一のため、格下げ判定はshinsa.jsのisDowngradedを再利用する。
   §5「当日国非更新」: 今日の3か国はしんさ本体（shinsa.js §2.5）で訪問時にsrsを
   更新済みのため、ぜいかんでは同一旅内の二重カウントを避けるためsrsを更新しない
   （prog・choicesの見た目には影響しない。recentは全問で更新し隠し難易度の材料にする）。 */
import { createMakeChoices } from "./choices.js";
import { pickTopBySrsWeightRandom } from "./trip.js";
import { isDowngraded } from "./shinsa.js";
import { pushRecent } from "./save.js";

function shuffleWith(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* 出題プールのid集合: 今日の3か国 ∪ 過去にスタンプ済みの国（今日分を除く） */
export function customsPoolIds(todayIds, save) {
  const stamps = (save.passport && save.passport.stamps) || {};
  const pastIds = Object.keys(stamps).filter((id) => !todayIds.includes(id));
  return [...new Set([...todayIds, ...pastIds])];
}

/* countries: 誤答候補プール（COUNTRIES相当）。souvenirOfは呼び出し側の都合で埋め込む
   （souvenirs.js側の関数をそのまま渡せるよう、opts.souvenirOfで注入可能にしておく）。 */
export function buildCustomsQueue(countries, todayIds, save, souvenirOf, opts = {}) {
  const { count = 3, now = Date.now(), rng = Math.random, makeChoices } = opts;
  const poolIds = new Set(customsPoolIds(todayIds, save));
  const pool = countries.filter((c) => poolIds.has(c.id));
  const picked = pickTopBySrsWeightRandom(pool, Math.min(count, pool.length), save, now, rng);
  const mc = makeChoices || createMakeChoices(countries);
  return picked.map((c) => ({
    countryId: c.id,
    souvenir: souvenirOf(c.id, c.cont),
    isToday: todayIds.includes(c.id),
    attemptNumber: 1,
    choices: shuffleWith(rng, mc(c, "name", { count: 4 })),
  }));
}

/* §3: 正誤判定のみ（副作用なし）。 */
export function customsAnswerOutcome(item, chosenId) {
  return { ok: chosenId === item.countryId };
}

/* §3と同一の不正解ルール: 同じぜいかんキューの末尾に再出題を積む。
   格下げ（2択）はshinsa.jsのisDowngradedをそのまま使う（隠し難易度はsave全体の属性のため）。 */
export function buildCustomsRetryItem(item, countries, hiddenDifficulty, opts = {}) {
  const { rng = Math.random, makeChoices } = opts;
  const country = countries.find((c) => c.id === item.countryId);
  const attemptNumber = item.attemptNumber + 1;
  const count = isDowngraded(attemptNumber, hiddenDifficulty) ? 2 : 4;
  const mc = makeChoices || createMakeChoices(countries);
  return {
    ...item,
    attemptNumber,
    choices: shuffleWith(rng, mc(country, "name", { count })),
  };
}

/* 初回解答のみrecentを更新する（水増し防止・§3）。srsは「当日国非更新」（§5）に従い、
   todayIdsに含まれる国は更新しない。過去旅の国のみ正解でstreak+1／不正解でstreak=0。 */
export function applyCustomsAnswer(save, countryId, ok, attemptNumber, todayIds, now = Date.now()) {
  if (attemptNumber !== 1) return save;
  const withRecent = { ...save, recent: pushRecent(save.recent, ok) };
  if (todayIds.includes(countryId)) return withRecent; // §5 当日国非更新（同一旅内の二重カウント禁止）
  const prevSrs = (save.srs && save.srs[countryId]) || { streak: 0, lastAt: 0 };
  return {
    ...withRecent,
    srs: { ...save.srs, [countryId]: ok ? { streak: prevSrs.streak + 1, lastAt: now } : { streak: 0, lastAt: now } },
  };
}
