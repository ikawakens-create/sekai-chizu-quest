/* 視覚的に混同しやすい国旗グループ。「みわける」段階の誤答生成と
   「にてるこっきバトル」の出題単位。1国が複数グループに属してよい */
export const FLAG_GROUPS = [
  { id: "redwhite",   label: "あかしろコンビ",       ids: ["IDN","MCO","POL","SGP","BHR","QAT"] },
  { id: "chad-rom",   label: "そっくりトリコロール", ids: ["TCD","ROU","MDA","AND"] },
  { id: "irl-civ",    label: "かがみのくにぐに",     ids: ["IRL","CIV","ITA","MEX"] },
  { id: "nordic",     label: "ほくおうじゅうじ",     ids: ["DNK","NOR","SWE","FIN","ISL"] },
  { id: "tricolor-h", label: "よこじまのくに",       ids: ["NLD","LUX","RUS","PRY","HRV","SVN","SVK","SRB"] },
  { id: "bolivar",    label: "きあおあか3きょうだい", ids: ["COL","ECU","VEN"] },
  { id: "panafrica",  label: "アフリカのなかま",     ids: ["MLI","SEN","GIN","CMR","GHA","BEN"] },
  { id: "aus-nz",     label: "みなみじゅうじせい",   ids: ["AUS","NZL","FJI","TUV"] },
  { id: "stars",      label: "ほしとしましま",       ids: ["USA","LBR","MYS","URY","GRC"] },
  { id: "bluewhite",  label: "あおしろサンド",       ids: ["HND","SLV","NIC","GTM","ARG"] },
  { id: "panarab",    label: "アラブのなかま",       ids: ["JOR","PSE","SDN","KWT","ARE","EGY","YEM","SYR","IRQ"] },
  { id: "crescent",   label: "あかいみかづき",       ids: ["TUR","TUN","DZA","PAK","MRT"] },
  { id: "crosses",    label: "じゅうじのくに",       ids: ["CHE","GEO","GRC","TON","DNK"] },
  { id: "greenstar",  label: "みどりのくに",         ids: ["PAK","MRT","TKM"] }, /* v1.1: 星の無いSAU・天球儀のBRAを除外 */
  { id: "orangegrn",  label: "オレンジとみどり",     ids: ["IND","NER","IRL","CIV"] },
];
export const groupsOf = (id) => FLAG_GROUPS.filter(g => g.ids.includes(id));
