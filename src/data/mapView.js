/* HANDOFF v2.3 §2.2: 地図表示の見やすさ改善（たび画面＋既存モード共通の地図基盤）。
   純粋関数のみ・UI非依存。App.jsx（WorldMap/viewForCountry等）から呼び出される。

   bboxの出典について: HANDOFF原文は「SVG getBBox()で遅延計算」を指示しているが、
   本リポジトリのbuild-maps.mjsはd3-geoの path.bounds() で各国のバウンディングボックスを
   ビルド時に既に計算しており（従来はzoom値の算出にのみ使い捨てていた）、レンダリングされる
   `d` と同一のジオメトリから導出されるため実行時DOM計測と同値になる。ビルド時に確定する
   静的値をそのまま使う方が、DOMハックなしでテスト可能・再現性も自明という点で優れるため、
   country.bw / country.bh（bw=0,bh=0はポリゴンなし＝マーカーのみの国）を入力として使う。 */

const clampT = (v, min) => Math.min(0, Math.max(min, v));

/* 単独国フォーカス画面（くにカード・Q1・Q2）向け: 対象国のbboxの短辺が
   画面（=マップviewBox）短辺の minFraction 以上を占める倍率まで自動ズームする。
   ロシアのような巨大国は既に条件を満たすため引き（低倍率）、ルクセンブルクのような
   極小国は上限いっぱいまで寄る。上限(maxScale)で目標未達なら needsInset=true とし、
   虫めがねインセット（§2.2.3）の要否を呼び出し側へ伝える。 */
export function framingScale(bbox, mapDims, opts = {}) {
  const { minFraction = 0.2, insetFraction = 0.10, minScale = 1, maxScale = 24 } = opts;
  const mapShort = Math.min(mapDims.w, mapDims.h);
  const shortSide = Math.min(bbox.bw || 0, bbox.bh || 0);

  if (shortSide <= 0) {
    /* ポリゴンなし（マーカーのみ）の国は倍率上限まで寄せた上で、必ずインセット対象とする */
    return { s: maxScale, achievedFraction: 0, needsInset: true };
  }

  const idealS = (minFraction * mapShort) / shortSide;
  const s = Math.min(Math.max(idealS, minScale), maxScale);
  const achievedFraction = (shortSide * s) / mapShort;
  return { s, achievedFraction, needsInset: achievedFraction < insetFraction };
}

/* スケールと中心点(cx,cy)から実際のtransform（s/tx/ty）を求める。
   既存viewForCountry/CONT_VIEWと同じ「はみ出さないようクランプ」方式。 */
export function viewFromScale(s, cx, cy, mapDims) {
  const { w, h } = mapDims;
  return {
    s,
    tx: clampT(w / 2 - s * cx, w - s * w),
    ty: clampT(h / 2 - s * cy, h - s * h),
  };
}

/* 単独国フォーカス用の最終ビュー。§2.2.1（20%基準）＋§2.2.3（インセット要否）を合成する。 */
export function viewForCountry(country, mapDims, opts = {}) {
  const { s, achievedFraction, needsInset } = framingScale({ bw: country.bw, bh: country.bh }, mapDims, opts);
  return { ...viewFromScale(s, country.cx, country.cy, mapDims), achievedFraction, needsInset };
}

/* Q3（ピン4択）用: 候補国が全て収まるフィッティング。単独国の20%基準は適用しない
   （§2.2.1: 「Q3は候補4国が収まるフィッティングが優先で20%基準は適用しない」）。
   既存CONT_VIEWと同じ「重心の外接範囲＋パディング」方式を任意の国リストに一般化したもの。 */
export function viewForCountries(countries, mapDims, opts = {}) {
  const { pad = 30, minScale = 1, maxScale = 8 } = opts;
  const { w, h } = mapDims;
  if (!countries || countries.length === 0) return { s: minScale, tx: 0, ty: 0 };
  if (countries.length === 1) return viewFromScale(minScale, countries[0].cx, countries[0].cy, mapDims);

  const xs = countries.map((c) => c.cx), ys = countries.map((c) => c.cy);
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
  const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  const s = Math.max(Math.min(w / (x1 - x0), h / (y1 - y0), maxScale), minScale);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return viewFromScale(s, cx, cy, mapDims);
}

/* インセット（虫めがね窓）表示要否。既存29(現行データでは20)か国の`.micro`マーカー国は
   常に対象。加えて、フレーミング後もbbox短辺がinsetFraction未満の国も対象にする（§2.2.3）。 */
export function showInsetFor(country, view) {
  return !!(country.micro || (view && view.needsInset));
}

/* §2.2.4（致命的A対応）: 正解が既知の画面（くにカード／Q1こっき提示後／Q2）でのみ
   対象国を明色＋パルスで強調してよい。Q3（ピン4択・未回答）は候補間の見た目を完全同一に
   扱い、正解ピンだけが視覚的に漏れることを禁止する。回答確定後(feedback)は通常のreveal。
   context: { screen: "pinChoice" | それ以外, phase: "answer" | "feedback" } */
export function highlightModeFor(context = {}) {
  if (context.screen === "pinChoice" && context.phase !== "feedback") return "candidatesEqual";
  return "reveal";
}

/* §2.2.2: 2段ズーム演出（世界 → 大陸 0.4s → 対象周辺 0.4s）。経過時間からどの段を
   表示すべきかを返す純粋関数。実際のタイマー駆動・CSSトランジションはApp.jsx側の責務。 */
export function zoomStageAt(elapsedMs, opts = {}) {
  const { contDelayMs = 400, settleDelayMs = 800 } = opts;
  if (elapsedMs < contDelayMs) return "world";
  if (elapsedMs < settleDelayMs) return "continent";
  return "country";
}
