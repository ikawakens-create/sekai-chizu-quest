/* 「せかいのたび」セッションの純粋ロジック（HANDOFF v1.1 §4/§5/§6）。
   React状態を持たず、App.jsxからもテストからも同じ関数を呼べるようにする。
   抽選の重み付けはsrsWeight（§6）に一本化。[おかえり]枠のみsrsWeight降順の
   上位からランダム選出する（B-2の加齢重み付き抽選から置き換え）。 */
import { TRIPS } from "./trips.js";
import { pushRecent } from "./save.js";

const SLOTS = ["name", "flag", "cap"];
const MASTER_AT = 2;

export const progOf = (save, id) => (save.prog && save.prog[id]) || { name: 0, flag: 0, cap: 0 };
export const totalCorrect = (p) => p.name + p.flag + p.cap;
export const masteredSlotCount = (save, id) => SLOTS.filter((s) => progOf(save, id)[s] >= MASTER_AT).length;

/* §4 3段はしご: 0=であう / 1=みわける / 2=おもいだす（維持・挑戦） */
export function stageOf(save, id) {
  const p = progOf(save, id);
  if (totalCorrect(p) === 0) return 0;
  if (masteredSlotCount(save, id) < SLOTS.length) return 1;
  return 2;
}

const slotOfTripQType = (qType) => (qType === "capital" ? "cap" : qType === "flag" ? "flag" : "name");

/* ---------- パック解放（§5.1） ---------- */
const UNLOCK_AT = 6; /* 直前Tierを規定数クリアで次Tier解放 */

export function unlockedTierMax(save, trips = TRIPS) {
  const doneIds = new Set((save.trips && save.trips.done) || []);
  const tiers = [...new Set(trips.map((t) => t.tier))].sort((a, b) => a - b);
  let maxTier = tiers[0] || 1;
  for (const tier of tiers) {
    const packsOfTier = trips.filter((t) => t.tier === tier);
    const doneOfTier = packsOfTier.filter((t) => doneIds.has(t.id)).length;
    if (doneOfTier < Math.min(UNLOCK_AT, packsOfTier.length)) break;
    const nextTier = tiers.find((t) => t > tier);
    if (nextTier === undefined) break;
    maxTier = nextTier;
  }
  return maxTier;
}
export function availablePacks(save, trips = TRIPS) {
  const maxTier = unlockedTierMax(save, trips);
  return trips.filter((t) => t.tier <= maxTier);
}
/* ホームにチラ見せする「次の1パックだけ」。全ロック一覧は見せない */
export function nextLockedPack(save, trips = TRIPS) {
  const maxTier = unlockedTierMax(save, trips);
  return trips.find((t) => t.tier > maxTier) || null;
}

/* ---------- §6 軽量SRS：忘却リスク = 経過日数 / (streak+1)。未学習は中立、上限10でクランプ ---------- */
export function srsWeight(save, id, now = Date.now()) {
  const s = save.srs[id];
  if (!s) return 3;
  const days = (now - s.lastAt) / 86400000;
  return Math.min(10, 1 + (days / (s.streak + 1)) * 2);
}

function shuffleWith(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* 抽選の重み付けはsrsWeightに一本化（PR4でB-2の簡易重みから差し替え） */
export function pickBySimpleWeight(pool, count, srs, now = Date.now(), rng = Math.random) {
  const weightOf = (id) => srsWeight({ srs }, id, now);
  let remaining = [...pool];
  const out = [];
  while (out.length < count && remaining.length > 0) {
    const weights = remaining.map((c) => weightOf(c.id) + 1); /* +1: 重み0を避ける */
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng() * total;
    let idx = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) {
      if (roll < weights[i]) { idx = i; break; }
      roll -= weights[i];
    }
    out.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return out;
}

/* [おかえり]専用: srsWeight降順の上位からランダム選出（PR4でB-2の加齢重み付き抽選から置き換え） */
export function pickTopBySrsWeightRandom(pool, count, save, now, rng) {
  const sorted = [...pool].sort((a, b) => srsWeight(save, b.id, now) - srsWeight(save, a.id, now));
  const top = sorted.slice(0, Math.min(sorted.length, Math.max(count * 3, count)));
  return shuffleWith(rng, top).slice(0, count);
}

/* base(既に選ばれた分)にfallbackPoolsの国を重複なしで補い、ちょうどcount件にする */
function fillDistinct(base, count, fallbackPools, rng) {
  const out = [...base];
  const usedIds = new Set(out.map((c) => c.id));
  for (const pool of fallbackPools) {
    if (out.length >= count) break;
    for (const c of shuffleWith(rng, pool)) {
      if (out.length >= count) break;
      if (usedIds.has(c.id)) continue;
      out.push(c);
      usedIds.add(c.id);
    }
  }
  return out.slice(0, count);
}

/* ---------- セッション構成（§5.2）: 10問 = であい3 / みわける4 / ちょうせん2 / おかえり1 ---------- */
export function buildTripSession(countries, save, trip, { now = Date.now(), rng = Math.random } = {}) {
  const byId = new Map(countries.map((c) => [c.id, c]));
  const packCountries = trip.ids.map((id) => byId.get(id)).filter(Boolean);

  /* [であい] 新パック3か国 × くにカード→即2択（こっき→なまえ） */
  const meet = packCountries.map((c) => ({ section: "であい", qType: "meet2", c }));

  const stage1Pool = countries.filter((c) => stageOf(save, c.id) === 1);
  const stage2Pool = countries.filter((c) => stageOf(save, c.id) === 2);
  const rotateTypes = ["name", "flag", "capital"];

  /* [みわける] stage1から抽選。在庫が足りない序盤は新3か国の再出題で埋める */
  const discernBase = pickBySimpleWeight(stage1Pool, Math.min(4, stage1Pool.length), save.srs, now, rng);
  const discernPicked = fillDistinct(discernBase, 4, [packCountries, countries], rng);
  const discern = discernPicked.map((c, i) => ({ section: "みわける", qType: rotateTypes[i % rotateTypes.length], c }));

  /* [ちょうせん] stage2から: 地図タップ or しゅと4択。stage2が無ければstage1で代用 */
  const challengeSourcePool = stage2Pool.length > 0 ? stage2Pool : stage1Pool;
  const challengeBase = pickBySimpleWeight(challengeSourcePool, Math.min(2, challengeSourcePool.length), save.srs, now, rng);
  const usedForChallenge = new Set([...meet, ...discern].map((x) => x.c.id));
  const challengePicked = fillDistinct(challengeBase, 2, [countries.filter((c) => !usedForChallenge.has(c.id)), countries], rng);
  const challengeTypes = ["map", "capital"];
  const challenge = challengePicked.map((c, i) => ({ section: "ちょうせん", qType: challengeTypes[i % challengeTypes.length], c }));

  /* [おかえり] 「わすれかけ」上位（srsWeight降順の上位からランダム選出）から */
  const usedAll = new Set([...meet, ...discern, ...challenge].map((x) => x.c.id));
  const recallPool = countries.filter((c) => !usedAll.has(c.id) && stageOf(save, c.id) >= 1);
  const recallBase = pickTopBySrsWeightRandom(recallPool, Math.min(1, recallPool.length), save, now, rng);
  const recallPicked = fillDistinct(recallBase, 1, [countries.filter((c) => !usedAll.has(c.id)), countries], rng);
  const recall = recallPicked.map((c, i) => ({ section: "おかえり", qType: rotateTypes[i % rotateTypes.length], c }));

  return [...meet, ...discern, ...challenge, ...recall];
}

/* であい(stage0)の誤答: 別大陸・別フラググループから1つ（§4） */
export function pickMeetWrong(countries, c, flagGroups, rng = Math.random) {
  const sameGroupIds = new Set(
    flagGroups.filter((g) => g.ids.includes(c.id)).flatMap((g) => g.ids)
  );
  const eligible = countries.filter((x) => x.id !== c.id && x.cont !== c.cont && !sameGroupIds.has(x.id));
  const pool = eligible.length > 0 ? eligible : countries.filter((x) => x.id !== c.id);
  return pool[Math.floor(rng() * pool.length)];
}

/* ---------- まちがえたときのルール（§5.3・B-4・A-1） ---------- */
/* attemptNumber: 今回が同一問題への何回目の解答か（1=初回）
   updateSave: prog/srs/recentを書き込んでよいか（初回のみtrue）
   retry: 選択肢シャッフルで即再出題するか
   forcedAdvance: 3回連続不正解による強制前進か */
export function tripAnswerOutcome(attemptNumber, ok) {
  const updateSave = attemptNumber === 1;
  if (ok) return { updateSave, retry: false, forcedAdvance: false };
  const forcedAdvance = attemptNumber >= 3;
  return { updateSave, retry: !forcedAdvance, forcedAdvance };
}

/* 初回解答のみsrs/prog/recentを更新する。再出題（2回目以降）はsave据え置き（B-4） */
export function applyTripAnswer(save, c, qType, ok, attemptNumber, now = Date.now()) {
  const { updateSave } = tripAnswerOutcome(attemptNumber, ok);
  if (!updateSave) return save;
  const slot = slotOfTripQType(qType);
  const nextProg = ok
    ? { ...save.prog, [c.id]: { ...progOf(save, c.id), [slot]: progOf(save, c.id)[slot] + 1 } }
    : save.prog;
  const prevSrs = (save.srs && save.srs[c.id]) || { streak: 0, lastAt: 0 };
  const nextSrs = {
    ...save.srs,
    [c.id]: ok ? { streak: prevSrs.streak + 1, lastAt: now } : { streak: 0, lastAt: now },
  };
  return { ...save, prog: nextProg, srs: nextSrs, recent: pushRecent(save.recent, ok) };
}

/* ---------- パック完了とスタンプ（§5.4） ---------- */
export function computeStampValue(save, trip) {
  const allMastered = trip.ids.every((id) => masteredSlotCount(save, id) === SLOTS.length);
  return allMastered ? 3 : 1; /* 3段はしご完登=金スタンプ / それ以外=通常スタンプ */
}
export function finishTrip(save, trip, now = Date.now()) {
  const done = Array.isArray(save.trips && save.trips.done) ? save.trips.done : [];
  const stamps = (save.trips && save.trips.stamps) || {};
  const nextValue = computeStampValue(save, trip);
  const prevValue = stamps[trip.id] || 0;
  return {
    ...save,
    trips: {
      done: done.includes(trip.id) ? done : [...done, trip.id],
      stamps: { ...stamps, [trip.id]: Math.max(prevValue, nextValue) },
    },
  };
}

/* 将来のガチャ接続（Phase 5）用フック: 本PRでは数を返すだけ */
export const stampCountOf = (save) => Object.values((save.trips && save.trips.stamps) || {}).filter((v) => v > 0).length;
