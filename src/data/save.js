/* セーブv2（プロフィール2枠）。
   v1（sekai-chizu-quest-v1: {prog, plays, perfects, stickers}）は緊急退避用に温存し、
   一切書き換えない。読み込み時にv2が無ければv1から1回だけ移行してv2へ書き出す。 */

const V1_KEY = "sekai-chizu-quest-v1";
const V2_KEY = "sekai-chizu-quest-v2";

const emptyProfile = (name, voice) => ({
  name, voice,
  prog: {}, plays: 0, perfects: 0, stickers: {},
  srs: {},
  trips: { done: [], stamps: {} },
  daily: {},
  recent: [], // 直近の初回解答結果 {ok:boolean} を先頭にpushする20件リングバッファ
});

export const emptySaveV2 = () => ({
  version: 2,
  activeProfile: "p1",
  profiles: {
    p1: emptyProfile("（入力）", false),
    p2: emptyProfile("（入力）", true),
  },
});

/* v1データ({prog,plays,perfects,stickers})をp1へ取り込む。p2・srs/trips/daily/recentは空のまま */
export function migrateFromV1(v1) {
  const base = emptySaveV2();
  const src = v1 && typeof v1 === "object" ? v1 : {};
  return {
    ...base,
    profiles: {
      ...base.profiles,
      p1: {
        ...base.profiles.p1,
        prog: src.prog && typeof src.prog === "object" ? src.prog : {},
        plays: Number.isFinite(src.plays) ? src.plays : 0,
        perfects: Number.isFinite(src.perfects) ? src.perfects : 0,
        stickers: src.stickers && typeof src.stickers === "object" ? src.stickers : {},
      },
    },
  };
}

/* 保存済みv2 JSON（欠損・破損の可能性あり）を、欠けたフィールドを補いながら安全に読み込む */
export function mergeSaveV2(raw) {
  const base = emptySaveV2();
  const mergeProfile = (basep, rp) => {
    rp = rp && typeof rp === "object" ? rp : {};
    return {
      name: typeof rp.name === "string" ? rp.name : basep.name,
      voice: typeof rp.voice === "boolean" ? rp.voice : basep.voice,
      prog: rp.prog && typeof rp.prog === "object" ? rp.prog : {},
      plays: Number.isFinite(rp.plays) ? rp.plays : 0,
      perfects: Number.isFinite(rp.perfects) ? rp.perfects : 0,
      stickers: rp.stickers && typeof rp.stickers === "object" ? rp.stickers : {},
      srs: rp.srs && typeof rp.srs === "object" ? rp.srs : {},
      trips: {
        done: Array.isArray(rp.trips && rp.trips.done) ? rp.trips.done : [],
        stamps: rp.trips && typeof rp.trips.stamps === "object" ? rp.trips.stamps : {},
      },
      daily: rp.daily && typeof rp.daily === "object" ? rp.daily : {},
      recent: Array.isArray(rp.recent) ? rp.recent.slice(0, 20) : [],
    };
  };
  if (!raw || typeof raw !== "object") return base;
  const profiles = raw.profiles && typeof raw.profiles === "object" ? raw.profiles : {};
  return {
    version: 2,
    activeProfile: raw.activeProfile === "p2" ? "p2" : "p1",
    profiles: {
      p1: mergeProfile(base.profiles.p1, profiles.p1),
      p2: mergeProfile(base.profiles.p2, profiles.p2),
    },
  };
}

const defaultStorage = () => (typeof localStorage !== "undefined" ? localStorage : null);

/* v2があればそれを読み込み、無ければv1から移行（v1キーは温存・削除しない） */
export function loadSaveV2(storage = defaultStorage()) {
  try {
    const v2raw = storage && storage.getItem(V2_KEY);
    if (v2raw) return mergeSaveV2(JSON.parse(v2raw));
    const v1raw = storage && storage.getItem(V1_KEY);
    if (v1raw) {
      const migrated = migrateFromV1(JSON.parse(v1raw));
      persistSaveV2(migrated, storage);
      return migrated;
    }
  } catch (e) { /* 破損データは初期状態にフォールバック */ }
  return emptySaveV2();
}

export function persistSaveV2(doc, storage = defaultStorage()) {
  try { storage && storage.setItem(V2_KEY, JSON.stringify(doc)); } catch (e) {}
}

/* 直近の初回解答結果を先頭にpushし、20件を超えたら末尾を破棄するリングバッファ。
   強制再出題（PR3）の結果はここに入れない＝呼び出し元の責務。 */
export function pushRecent(recent, ok) {
  const next = [{ ok: !!ok }, ...(Array.isArray(recent) ? recent : [])];
  return next.slice(0, 20);
}

/* recent（直近20問・初回解答のみ）から隠し難易度を判定する。
   10件未満はサンプル不足として常に"normal"（ふつう）。本人には一切見せない。 */
export function hiddenDifficultyOf(recent) {
  const list = Array.isArray(recent) ? recent : [];
  if (list.length < 10) return "normal";
  const okCount = list.filter((r) => r && r.ok).length;
  const rate = okCount / list.length;
  if (rate > 0.85) return "hard";
  if (rate < 0.6) return "easy";
  return "normal";
}
