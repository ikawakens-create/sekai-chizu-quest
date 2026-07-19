/* HANDOFF v2.3 §8.2: 国ごとのおみやげ（絵文字1つ＋ひらがな名）。
   TIER1+TIER2（tiers.js）の61か国分。v2.3差し替え裁定（SWE🦌・DNK🍪・VNM👒・POL🎹・SAU🦅、
   CHLは条件付き維持）を反映した確定データをそのまま使用する。
   要検討3件（PRK・MMR・ISR）は非政治的な適案が未確定のため、決定までパック編成・のりつぎ選出から
   除外する（本ファイルにも意図的にキーを含めない）。

   HANDOFF v2.3 §6.2差し替え対応（PR4先行・画像フォールバックの器）:
   各エントリは任意で img（例: "jpn.svg"）を追加できる。e（絵文字）は
   img が無い/読めない環境向けのフォールバックとして必須のまま。
   196か国化で絵文字非対応の国・端末が出ることを見越し、器だけを先に用意する
   （実イラストの追加は本対応のスコープ外。JPN/NLDの2件のみ配線確認用サンプル）。 */
export const SOUVENIRS = {
  /* --- TIER1 --- */
  JPN: { e: "🍣", n: "おすし", img: "jpn.svg" }, USA: { e: "🍔", n: "ハンバーガー" },
  CHN: { e: "🐼", n: "パンダ" },        KOR: { e: "🎤", n: "アイドルのマイク" },
  IND: { e: "🍛", n: "カレー" },        THA: { e: "🐘", n: "ぞう" },
  VNM: { e: "👒", n: "ノンラー（ぼうし）" }, PHL: { e: "🍌", n: "バナナ" },
  IDN: { e: "🦎", n: "コモドドラゴン" }, GBR: { e: "💂", n: "えいへいさん" },
  FRA: { e: "🥐", n: "クロワッサン" },  DEU: { e: "🥨", n: "プレッツェル" },
  ITA: { e: "🍕", n: "ピザ" },          ESP: { e: "💃", n: "フラメンコ" },
  RUS: { e: "🪆", n: "マトリョーシカ" }, AUS: { e: "🐨", n: "コアラ" },
  NZL: { e: "🥝", n: "キウイ" },        CAN: { e: "🍁", n: "メープル" },
  BRA: { e: "⚽", n: "サッカーボール" }, MEX: { e: "🌮", n: "タコス" },
  ARG: { e: "🥩", n: "おにく（アサード）" }, EGY: { e: "🐫", n: "らくだ" },
  KEN: { e: "🦁", n: "ライオン" },      ZAF: { e: "🦓", n: "しまうま" },
  SAU: { e: "🦅", n: "たか（たかがり）" }, TUR: { e: "🎈", n: "ききゅう" },
  /* --- TIER2 --- */
  TWN: { e: "🧋", n: "タピオカ" },      MNG: { e: "🐎", n: "うま" },
  SGP: { e: "⛲", n: "マーライオン" },   MYS: { e: "🦧", n: "オランウータン" },
  KHM: { e: "🛕", n: "アンコールワット" }, LKA: { e: "🫖", n: "こうちゃ" },
  NPL: { e: "🏔", n: "エベレスト" },    PAK: { e: "🏏", n: "クリケット" },
  NLD: { e: "🌷", n: "チューリップ", img: "nld.svg" }, BEL: { e: "🍫", n: "チョコレート" },
  CHE: { e: "🫕", n: "チーズフォンデュ" }, AUT: { e: "🎻", n: "バイオリン" },
  SWE: { e: "🦌", n: "ヘラジカ" },      NOR: { e: "⛷", n: "スキー" },
  DNK: { e: "🍪", n: "バタークッキー" }, FIN: { e: "🎅", n: "サンタクロース" },
  ISL: { e: "🌋", n: "かざん" },        IRL: { e: "🍀", n: "クローバー" },
  PRT: { e: "🐓", n: "にわとり" },      GRC: { e: "🏛", n: "しんでん" },
  POL: { e: "🎹", n: "ピアノ（ショパン）" }, UKR: { e: "🌻", n: "ひまわり" },
  CZE: { e: "🏰", n: "おしろ" },        HUN: { e: "🌶", n: "パプリカ" },
  CUB: { e: "🎺", n: "トランペット" },  JAM: { e: "🏃", n: "はやいランナー" },
  CHL: { e: "🗿", n: "モアイ" },        PER: { e: "🦙", n: "アルパカ" },
  COL: { e: "🦜", n: "オウム" },        MAR: { e: "🍊", n: "オレンジ" },
  NGA: { e: "🥁", n: "たいこ" },        ETH: { e: "☕", n: "コーヒー" },
  ARE: { e: "🏙", n: "ちょうこうそうビル" }, IRN: { e: "🐈", n: "ペルシャねこ" },
  IRQ: { e: "🏺", n: "こだいのつぼ" },
};

/* CHLは「くにカードの一言」側でのフォロー前提（§8.2）: くにカード表示時に
   「チリの とおくの しまに あるよ」を補足すること（本ファイルの責務外・PR3で対応）。 */
export const SOUVENIR_NOTES = {
  CHL: "チリの とおくの しまに あるよ",
};

/* 決定未了で今はパックに出さない国（§8.2「要検討3件」） */
export const SOUVENIR_PENDING_IDS = ["PRK", "MMR", "ISR"];

/* TIER3（未定義国）向けの大陸フォールバック絵文字。旅の行き先はTIER1/2のみのため
   実際に使われることは無い想定だが、makeStamp等が任意の国idを渡された場合の保険。 */
const CONT_FALLBACK_EMOJI = {
  asia: "🌏", europe: "🏰", africa: "🦒",
  namerica: "🗽", samerica: "🌎", oceania: "🏝",
};

/* id→おみやげを解決する。未定義国は大陸絵文字＋「おもいで」で代替する（§8.2）。 */
export function souvenirOf(id, cont) {
  return SOUVENIRS[id] || { e: CONT_FALLBACK_EMOJI[cont] || "🌍", n: "おもいで" };
}

/* img（アセットのファイル名）→実際に読み込むsrcを解決する。
   既存 flags/ と同様、画像はバンドルに埋め込まず別アセット（./souvenirs/）として配信し、
   sw.jsのcache-first（PR0・NETWORK_FIRST_PATHS対象外のため既定でcache-first）に乗せる。
   build:artifact（単一ファイル化）はこの関数を経由させず、img自体をdata: URIへ
   置き換えるため、data:/httpから始まる値はそのまま通す（二重変換防止）。 */
export function souvenirImgSrc(img) {
  if (/^(data:|https?:\/\/)/.test(img)) return img;
  return `./souvenirs/${img}`;
}

/* HTML文脈（App.jsx Souvenirコンポーネント）・SVG文脈（stamp.js makeStamp）が
   共通で使う唯一の分岐点。img有無だけを見て絵文字/画像のどちらで出すかを決める
   （表示ヘルパーの一本化。§6.2の新規パスポート画面もこの関数経由で実装すること）。 */
export function souvenirDisplay(souvenir) {
  return souvenir.img
    ? { kind: "img", src: souvenirImgSrc(souvenir.img) }
    : { kind: "emoji", text: souvenir.e };
}
