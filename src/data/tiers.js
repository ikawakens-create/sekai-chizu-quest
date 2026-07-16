/* Tier定義: 子どもの「聞いたことある順」。地理的整理は意図的に無視する */
export const TIER1 = [ /* 約25か国: 生活・ニュース・スポーツ・食で既知の国 */
  "JPN","USA","CHN","KOR","IND","THA","VNM","PHL","IDN",
  "GBR","FRA","DEU","ITA","ESP","RUS",
  "AUS","NZL","CAN","BRA","MEX","ARG",
  "EGY","KEN","ZAF","SAU","TUR",
];
export const TIER2 = [ /* 約35か国: たまに聞く国 */
  "PRK","TWN","MNG","SGP","MYS","MMR","KHM","LKA","NPL","PAK",
  "NLD","BEL","CHE","AUT","SWE","NOR","DNK","FIN","ISL","IRL",
  "PRT","GRC","POL","UKR","CZE","HUN",
  "CUB","JAM","CHL","PER","COL",
  "MAR","NGA","ETH","ARE","ISR","IRN","IRQ",
];
/* TIER3 = 上記以外の全国。配列は持たず判定関数で */
export const tierOf = (id) =>
  TIER1.includes(id) ? 1 : TIER2.includes(id) ? 2 : 3;
