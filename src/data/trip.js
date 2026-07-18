/* 「せかいのたび」の土台ロジック（HANDOFF v2.3）。
   React状態を持たず、App.jsxからもテストからも同じ関数を呼べるようにする。

   v1.1のセッション構成（であい3/みわける4/ちょうせん2/おかえり1・buildTripSession）と
   まちがえたときのルール（tripAnswerOutcome/applyTripAnswer）・パック完了スタンプ
   （computeStampValue/finishTrip/stampCountOf）はv2.3で全面置換され廃止した
   （HANDOFF v2.3 §9）。訪問1件の出題・正誤判定・スロット加算はsrc/data/shinsa.js
   （§2/§2.5/§3）へ、押印はsrc/data/stamp.jsの makeStamp/applyStamp（§6）へ移管している。

   本ファイルに残すのは：
   - progOf/stageOf/masteredSlotCount: name/flag/capの3スロット版。cap（しゅと）は
     たびモードのスコープ外になったため既存モード（ソロクイズ・たいりくせいは）専用として温存する
     （HANDOFF v2.3 §2.5「capは既存モード専用で残すがstage判定から除外」）。しんさ3れんの
     flag/name/loc版stageOf/progOfはshinsa.jsにあり名前が衝突するため、両方importする側
     （App.jsx）でエイリアスが必要（混同禁止）。
   - パック解放（unlockedTierMax/availablePacks/nextLockedPack）・軽量SRS（srsWeight）・
     重み付き抽選（pickBySimpleWeight/pickTopBySrsWeightRandom）: v2.3でもそのまま流用。
   - 新規: 1旅の訪問国確定（パック2＋のりつぎ1、§4/§8.3）とパッククリア判定。 */
import { TRIPS } from "./trips.js";

const SLOTS = ["name", "flag", "cap"];
export const MASTER_AT = 2;

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

/* ---------- §8.3 パッククリア判定・パック解放の「done」算出 ----------
   パッククリア = 内包全国が(しんさ3れんの)stageOf ≥ 1。stageOfの実体はshinsa.js側にあり
   本ファイルはそれに依存しないため、呼び出し側（App.jsx）が国idを渡す判定関数
   isVisited(id) を注入する（trip.js↔shinsa.jsの循環依存・名前衝突を避ける設計）。 */
export function isPackCleared(pack, isVisited) {
  return pack.ids.every((id) => isVisited(id));
}
/* unlockedTierMaxが読む save.trips.done を、永続化せずその都度算出する。
   「充当国のクリア判定帰属」（§8.3 ADR）: のりつぎ・隣接パック充当で訪れた国も
   isVisitedがtrueを返す時点でどのパックの判定にも等しく効く。パック側は充当元/充当先の
   区別を一切持たない（国の習熟という一枚岩の事実から毎回導出するため、帰属の特別処理は不要）。 */
export function packDoneIds(allPacks, isVisited) {
  return allPacks.filter((p) => isPackCleared(p, isVisited)).map((p) => p.id);
}

/* ---------- §8.3 行き先カードの供給：パック内の未訪問国から埋める ----------
   隣接パックの定義（ADR・Sonnet裁定・PR3）: allAvailablePacks に渡された配列の宣言順で、
   自パックを除く解放済み全パックを優先度順の充当プールとする（tierや地理的近さは見ない、
   trips.jsの記述順=導入順をそのまま「隣接」とみなす最も単純な規則）。 */
export function unvisitedInPack(pack, isVisited) {
  return pack.ids.filter((id) => !isVisited(id));
}
export function fillPackDestinations(pack, allAvailablePacks, countries, save, count, opts = {}) {
  const { isVisited, now = Date.now(), rng = Math.random } = opts;
  const byId = new Map(countries.map((c) => [c.id, c]));
  const ownUnvisited = unvisitedInPack(pack, isVisited).map((id) => byId.get(id)).filter(Boolean);
  const picked = pickBySimpleWeight(ownUnvisited, Math.min(count, ownUnvisited.length), save.srs, now, rng);
  if (picked.length >= count) return picked;
  const usedIds = new Set(picked.map((c) => c.id));
  const adjacentIds = [...new Set(
    allAvailablePacks.filter((p) => p.id !== pack.id).flatMap((p) => p.ids)
      .filter((id) => !isVisited(id) && !usedIds.has(id))
  )];
  const adjacentPool = adjacentIds.map((id) => byId.get(id)).filter(Boolean);
  return fillDistinct(picked, count, [adjacentPool], rng);
}

/* ---------- §4 のりつぎ（トランジット）候補選出 ----------
   候補は呼び出し側でstageOf(shinsa)≥1に絞り込み済みの国リストを渡す想定（trip.jsは
   shinsa.jsのstageOfに依存しない）。係数 W = srsWeight(id) * (同大陸なら1.5倍) 。 */
export function pickTransferCountry(candidates, targetConts, save, opts = {}) {
  const { now = Date.now(), rng = Math.random } = opts;
  if (!candidates || candidates.length === 0) return null;
  const contSet = new Set(targetConts);
  const weights = candidates.map((c) => srsWeight(save, c.id, now) * (contSet.has(c.cont) ? 1.5 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    if (roll < weights[i]) return candidates[i];
    roll -= weights[i];
  }
  return candidates[candidates.length - 1];
}

/* ---------- §4+§8.3 1旅の訪問国確定：パックから2か国＋のりつぎ1か国 ----------
   のりつぎ候補（呼び出し側でstageOf(shinsa)≥1にフィルタ済み）が無ければ、
   「候補ゼロの場合はのりつぎ無し・新規3か国でよい」（§4）に従いパックから3か国に増やす。 */
export function buildTripVisits(pack, allAvailablePacks, countries, save, transferEligible, opts = {}) {
  const { isVisited, now = Date.now(), rng = Math.random } = opts;
  const two = fillPackDestinations(pack, allAvailablePacks, countries, save, 2, { isVisited, now, rng });
  const usedIds = new Set(two.map((c) => c.id));
  const candidates = (transferEligible || []).filter((c) => !usedIds.has(c.id));
  const transfer = pickTransferCountry(candidates, two.map((c) => c.cont), save, { now, rng });
  if (!transfer) {
    const three = fillPackDestinations(pack, allAvailablePacks, countries, save, 3, { isVisited, now, rng });
    const extra = three.find((c) => !usedIds.has(c.id));
    return { visits: extra ? [...two, extra] : two, transferId: null };
  }
  return { visits: [...two, transfer], transferId: transfer.id };
}

/* ---------- §0-3 幕間宣言（にゅうこくしんさ／のりつぎ）の出し分け ----------
   「構造は宣言する」（§0-3）: パートが変わるたび幕間で「いま何が起きているか」を
   一言宣言する。何を宣言するかは以下の2つの境界だけで決まる純粋なマッピングとして
   切り出す（App.jsx側の分岐ドリフトを防ぐ・highlightModeFor同様の一本化パターン）。
   - kind: のりつぎ国の訪問か、パック本来の国の訪問か（§4）
   - showReverseFlavor: 辛口化(逆走)を物語として宣言するセリフを添えるか（§2）。
     逆走はstageOf=3でのみ発火するため、直後の幕間でのみ真になる */
export function gateSceneFor(isTransfer, direction) {
  return {
    kind: isTransfer ? "transfer" : "entry",
    showReverseFlavor: direction === "reverse",
  };
}
