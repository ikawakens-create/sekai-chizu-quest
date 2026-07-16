/* 誤答選択肢の生成ロジック。
   既存4モード（ランダム/国名/首都/こっき）は opts なしで呼び出し、従来と完全に同じ挙動を維持する。
   「せかいのたび」モード（PR3以降）は opts = {difficulty, learnedIds, flagGroups} を渡し、
   誤答の優先順位を切り替える（§4 3段はしご「みわける」/ §3.3 隠し難易度）。 */

const plainCap = (s) => s.replace(/\{([^|}]+)\|[^}]+\}/g, "$1");

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function legacyChoices(countries, c, field) {
  const same = shuffle(countries.filter((x) => x.cont === c.cont && x.id !== c.id && (field !== "cap" || plainCap(x.cap) !== plainCap(c.cap))));
  const others = shuffle(countries.filter((x) => x.cont !== c.cont && x.id !== c.id));
  const wrong = [...same, ...others].slice(0, 3);
  return shuffle([c, ...wrong]);
}

/* countries（合成済みの国リスト）を束縛した makeChoices(c, field, opts) を返す */
export function createMakeChoices(countries) {
  return function makeChoices(c, field, opts = {}) {
    const { difficulty, learnedIds, flagGroups } = opts;

    /* 後方互換: 追加引数が一切無い場合は従来のアルゴリズムをそのまま実行する */
    if (!difficulty && !learnedIds && !flagGroups) {
      return legacyChoices(countries, c, field);
    }

    const eligible = (x) => x.id !== c.id && (field !== "cap" || plainCap(x.cap) !== plainCap(c.cap));

    const learnedSet = learnedIds ? new Set(learnedIds) : null;
    const groupIdSet = flagGroups
      ? new Set(flagGroups.filter((g) => g.ids.includes(c.id)).flatMap((g) => g.ids))
      : null;

    const learnedPool = learnedSet ? shuffle(countries.filter((x) => eligible(x) && learnedSet.has(x.id))) : [];
    const groupPool = groupIdSet ? shuffle(countries.filter((x) => eligible(x) && groupIdSet.has(x.id))) : [];
    const contPool = shuffle(countries.filter((x) => eligible(x) && x.cont === c.cont));
    const otherPool = shuffle(countries.filter((x) => eligible(x) && x.cont !== c.cont));

    /* 優先順位:
       - normal（ふつう）: 既習国 → 同フラググループ → 同大陸 → その他（§4 表の「みわける」既定）
       - hard（かくれ難易度・正答率85%超）: 同フラググループを最優先＝誤答の類似度を上げる（§3.3）
       - easy（かくれ難易度・正答率60%未満）: 別大陸・別グループを優先＝消去法が効く（§3.3） */
    const order =
      difficulty === "easy" ? [otherPool, contPool, groupPool, learnedPool] :
      difficulty === "hard" ? [groupPool, learnedPool, contPool, otherPool] :
      [learnedPool, groupPool, contPool, otherPool];

    const wrong = [];
    const used = new Set([c.id]);
    for (const pool of order) {
      for (const x of pool) {
        if (wrong.length >= 3) break;
        if (used.has(x.id)) continue;
        wrong.push(x);
        used.add(x.id);
      }
      if (wrong.length >= 3) break;
    }
    if (wrong.length < 3) {
      for (const x of shuffle(countries.filter((x) => eligible(x) && !used.has(x.id)))) {
        if (wrong.length >= 3) break;
        wrong.push(x);
        used.add(x.id);
      }
    }
    return shuffle([c, ...wrong]);
  };
}
