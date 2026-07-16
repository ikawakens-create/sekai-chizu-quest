/* テーマ別3か国パック。アイコンは絵文字（追加素材ゼロ）。
   抽選ロジック・解放条件・スタンプ演出などのゲームロジックはPR3以降で実装する。
   このファイルはパック定義（データ）のみを持つ。 */
export const TRIPS = [
  { id: "t1-1", label: "どうぶつのたび①",     icon: "🐼", ids: ["CHN","AUS","KEN"], tier: 1 },
  { id: "t1-2", label: "たべもののたび①",     icon: "🍕", ids: ["ITA","USA","IND"], tier: 1 },
  { id: "t1-3", label: "スポーツのたび①",     icon: "⚽", ids: ["BRA","FRA","ESP"], tier: 1 },
  { id: "t1-4", label: "おしろのたび①",       icon: "🏰", ids: ["GBR","DEU","RUS"], tier: 1 },
  { id: "t1-5", label: "おまつりのたび①",     icon: "🎏", ids: ["JPN","KOR","THA"], tier: 1 },
  { id: "t1-6", label: "うみとしまのたび①",   icon: "🏝️", ids: ["NZL","PHL","IDN"], tier: 1 },
  { id: "t1-7", label: "さばくのたび①",       icon: "🐫", ids: ["EGY","SAU","TUR"], tier: 1 },
  { id: "t1-8", label: "だいちのたび①",       icon: "🌵", ids: ["MEX","ARG","ZAF"], tier: 1 },
  /* CAN・VNM は tier1 未所属（次パック追加時に組み込み予定）。
     tier2解放後に t2-* パックを追加する。 */
];
