/* HANDOFF v2.3 §2/§2.5/§3: にゅうこくしんさ「しんさ3れん」の純粋ロジック（PR2b）。
   1訪問＝3問固定（flag/name/loc）。誤答選択肢はsrc/data/choices.js（count opt追加済み）を、
   ピンの地図フィッティング・重なり解消はsrc/data/mapView.jsを再利用する。
   本モジュールはUI非依存・純粋関数のみ。App.jsxへの結線・幕間・のりつぎ・ぜいかん等の
   フロー全体はPR3（旅フロー全面置換）で行う。

   §8.1の「stage/金の定義は§2.5に一本化。capは既存モード専用として残しstage判定から除外」の
   指示どおり、本モジュールのstageOf/progOfはtrip.js（既存モード・v1.1）のstageOf/progOfとは
   別物（flag/name/locの3スロットのみを見る）。App.jsx側で両方importする際は名前が衝突するため
   エイリアスが必要になる（PR3で対応）。 */

import { createMakeChoices } from "./choices.js";
import { pushRecent } from "./save.js";

export const SHINSA_SLOTS = ["flag", "name", "loc"];
const MASTER_SLOT_AT = 3;   // §2.5 金スタンプ「マスター」条件: 3スロットすべて≥3
const MASTER_STREAK_AT = 3; //                                  かつ streak≥3

export const progOf = (save, id) => {
  const p = (save.prog && save.prog[id]) || {};
  return { flag: p.flag || 0, name: p.name || 0, loc: p.loc || 0 };
};

/* §2.5: stageOf(id) = (flag≥1)+(name≥1)+(loc≥1)。0〜3 */
export function stageOf(save, id) {
  const p = progOf(save, id);
  return (p.flag >= 1 ? 1 : 0) + (p.name >= 1 ? 1 : 0) + (p.loc >= 1 ? 1 : 0);
}

/* §2.5「マスター」= 3スロットすべて≥3 かつ streak≥3（既存MASTER_AT=2は既存モード専用で温存） */
export function isMastered(save, id) {
  const p = progOf(save, id);
  const s = (save.srs && save.srs[id]) || { streak: 0 };
  return p.flag >= MASTER_SLOT_AT && p.name >= MASTER_SLOT_AT && p.loc >= MASTER_SLOT_AT && s.streak >= MASTER_STREAK_AT;
}

/* §2「再訪の出し分け」: 逆走(試験方向)はstageOf=3の国でのみ発火。0〜2は順走のまま。 */
export function visitDirectionFor(stageOfBeforeVisit) {
  return stageOfBeforeVisit === 3 ? "reverse" : "forward";
}

const FORWARD_ORDER = ["flag", "name", "loc"]; // こっき→なまえ→ばしょ（手がかり連鎖）
const REVERSE_ORDER = ["loc", "name", "flag"]; // ばしょ→なまえ→こっき（手がかり連鎖なし）
export function subquestionOrderFor(direction) {
  return direction === "reverse" ? [...REVERSE_ORDER] : [...FORWARD_ORDER];
}

/* §2表 + 再訪の出し分けにもとづく誤答優先度（choices.jsのdifficultyへマッピング）。
   [実装解釈メモ]
   - reverse（辛口・試験方向）: HANDOFF原文「誤答は同フラググループ→同大陸優先」を、
     全3問に一律 choices.js の "hard" (グループ最優先) として適用する。
   - forward・初訪問(stageOf=0): §2表の各問固有の基本戦略をそのまま適用
     （flag=easy/別大陸別グループ優先、name=normal/既習国優先、loc=normal/同大陸寄り）。
   - forward・再訪(stageOf 1〜2): 「誤答選択肢のみ辛口化」を、基本戦略から1段階厳しくする
     形で解釈（flag: easy→normal、name/loc: normal→hard）。
   この段階付け方は本文に数値的な明記が無いための実装判断であり、Opusレビュー時に
   別解が妥当と判断されれば本関数のみの変更で対応できるよう純粋関数として切り出している。 */
export function distractorDifficultyFor(qType, direction, stageOfBeforeVisit) {
  if (direction === "reverse") return "hard";
  if (stageOfBeforeVisit === 0) {
    if (qType === "flag") return "easy";
    return "normal";
  }
  if (qType === "flag") return "normal";
  return "hard";
}

/* §2「こっき2〜4択（隠し難易度で可変）」の解釈: 低群(easy)=2択・ふつう(normal)=3択・高群(hard)=4択。
   name/locは常に4択が基準（§2表どおり）。 */
export function flagChoiceCountFor(hiddenDifficulty) {
  if (hiddenDifficulty === "easy") return 2;
  if (hiddenDifficulty === "hard") return 4;
  return 3;
}

/* §3: 無限ループ防御の格下げ判定。3回目の解答から2択、隠し難易度が低群のプロフィールは
   2回目から2択（テンポ崩壊の防止を優先）。attemptNumberは「今回が何回目の解答か」。 */
export function isDowngraded(attemptNumber, hiddenDifficulty) {
  const threshold = hiddenDifficulty === "easy" ? 2 : 3;
  return attemptNumber >= threshold;
}

export function choiceCountFor(qType, attemptNumber, hiddenDifficulty) {
  if (isDowngraded(attemptNumber, hiddenDifficulty)) return 2;
  if (qType === "flag") return flagChoiceCountFor(hiddenDifficulty);
  return 4;
}

function buildSubquestion(country, countries, flagGroups, opts) {
  const {
    qType, direction, stageOfBeforeVisit, hiddenDifficulty = "normal",
    attemptNumber = 1, learnedIds, forceRescue2Choice = false, makeChoices,
  } = opts;
  let count = choiceCountFor(qType, attemptNumber, hiddenDifficulty);
  if (qType === "loc" && attemptNumber === 1 && forceRescue2Choice) count = 2; // §8.1移行救済国の例外
  const mc = makeChoices || createMakeChoices(countries);
  /* field: "cap"のみ特別扱い(首都表記の重複除外)なのでflag/name/locはどれでも同じ挙動。
     locはピン候補選定にそのまま使う（表示は地図側=mapView.layoutPinsの責務）。 */
  const choices = mc(country, qType, { difficulty: distractorDifficultyFor(qType, direction, stageOfBeforeVisit), learnedIds, flagGroups, count });
  return {
    slot: qType, qType, direction, stageOfBeforeVisit, attemptNumber,
    correctId: country.id, choiceCount: count, choices, learnedIds,
    showFlagContext: qType === "name" && direction === "forward", // §2 Q2: 正解の国旗を画面に残す（順走のみ・手がかり連鎖）
  };
}

/* 訪問開始時の3問キュー（順走/逆走の出し分け込み）を構築する。
   countries: 誤答候補プール（COUNTRIES相当）。flagGroups: FLAG_GROUPS。
   opts.makeChoices を渡せばApp.jsx側で構築済みの共有クロージャを再利用できる（省略時は都度生成）。 */
export function buildVisitQueue(country, countries, flagGroups, save, opts = {}) {
  const { hiddenDifficulty = "normal", learnedIds, forceRescueLoc2Choice = false, makeChoices } = opts;
  const stageOfBeforeVisit = stageOf(save, country.id);
  const direction = visitDirectionFor(stageOfBeforeVisit);
  return subquestionOrderFor(direction).map((qType) => buildSubquestion(country, countries, flagGroups, {
    qType, direction, stageOfBeforeVisit, hiddenDifficulty, attemptNumber: 1, learnedIds, makeChoices,
    forceRescue2Choice: qType === "loc" && forceRescueLoc2Choice,
  }));
}

/* §3: 正誤判定のみ（副作用なし）。choicesはshuffle済みのため、正解idとの一致で判定する。 */
export function subquestionAnswerOutcome(item, chosenId) {
  return { ok: chosenId === item.correctId };
}

/* §3: 不正解時、同じ訪問の末尾キューへ積む次回分（attempt+1）を作る。
   格下げ（2択）はchoiceCountFor内のisDowngradedで自動的に反映される。 */
export function buildRetryItem(item, countries, flagGroups, hiddenDifficulty, opts = {}) {
  const country = countries.find((c) => c.id === item.correctId);
  return buildSubquestion(country, countries, flagGroups, {
    qType: item.qType, direction: item.direction, stageOfBeforeVisit: item.stageOfBeforeVisit,
    hiddenDifficulty, attemptNumber: item.attemptNumber + 1, learnedIds: item.learnedIds,
    makeChoices: opts.makeChoices,
  });
}

/* §2.5: 各サブ問の初回正解のみ対応スロットを+1する。再出題(attemptNumber>=2)は
   正解でも不正解でも prog を変更しない（水増し防止）。隠し難易度の材料となる
   recent（直近の初回解答結果）も同じ「初回のみ」ルールで更新する。 */
export function applyShinsaSlotAnswer(save, countryId, slot, ok, attemptNumber) {
  if (attemptNumber !== 1) return save;
  /* progOf()はflag/name/loc以外(cap等)を切り捨てた読み取り専用ビューなので、
     書き込み時は元のprog[countryId]（cap等を含む）をそのまま引き継ぐ */
  const prevRaw = (save.prog && save.prog[countryId]) || {};
  const nextProg = ok ? { ...prevRaw, [slot]: (prevRaw[slot] || 0) + 1 } : prevRaw;
  return {
    ...save,
    prog: { ...save.prog, [countryId]: nextProg },
    recent: pushRecent(save.recent, ok),
  };
}

/* §2.5: 国単位srsは訪問の3スロット初回判定で更新する。3問すべて初回正解 → streak+1、
   1問でも初回不正解 → streak=0。lastAtはいずれも訪問時刻。
   firstAttemptResults = { flag: bool, name: bool, loc: bool }（各スロットのattempt=1の正誤）。
   呼び出しは訪問のキューが完全に空になった（3スロットとも通過した）タイミングで1回だけ行う。 */
export function finishVisitSrs(save, countryId, firstAttemptResults, now = Date.now()) {
  const allFirstCorrect = SHINSA_SLOTS.every((s) => firstAttemptResults[s] === true);
  const prevSrs = (save.srs && save.srs[countryId]) || { streak: 0, lastAt: 0 };
  return {
    ...save,
    srs: { ...save.srs, [countryId]: { streak: allFirstCorrect ? prevSrs.streak + 1 : 0, lastAt: now } },
  };
}
