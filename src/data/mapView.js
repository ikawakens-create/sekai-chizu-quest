/* HANDOFF v2.3 §2.2: 地図表示の見やすさ改善（たび画面＋既存モード共通の地図基盤）。
   純粋関数のみ・UI非依存。App.jsx（WorldMap/viewForCountry等）から呼び出される。

   bboxの出典について: HANDOFF原文は「SVG getBBox()で遅延計算」を指示しているが、
   本リポジトリのbuild-maps.mjsはd3-geoの path.bounds() で各国のバウンディングボックスを
   ビルド時に既に計算しており（従来はzoom値の算出にのみ使い捨てていた）、レンダリングされる
   `d` と同一のジオメトリから導出されるため実行時DOM計測と同値になる。ビルド時に確定する
   静的値をそのまま使う方が、DOMハックなしでテスト可能・再現性も自明という点で優れるため、
   country.bw / country.bh（bw=0,bh=0はポリゴンなし＝マーカーのみの国）を入力として使う。 */

const clampT = (v, min) => Math.min(0, Math.max(min, v));

/* s/tx/tyが常にマップ範囲からはみ出さないようクランプする共通処理。
   viewFromScaleとapplyPinchZoom（§2.2.5 ピンチズーム）の両方から使う「唯一のクランプ規則」。 */
export function clampView(s, tx, ty, mapDims) {
  const { w, h } = mapDims;
  return { s, tx: clampT(tx, w - s * w), ty: clampT(ty, h - s * h) };
}

/* 手動ズーム（ピンチ）の倍率上限。単独国フォーカス(framingScale)の既定maxScaleと揃える。 */
export const MAX_MANUAL_SCALE = 24;
export const MIN_MANUAL_SCALE = 1;

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
  return clampView(s, w / 2 - s * cx, h / 2 - s * cy, mapDims);
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

/* §2.2.5: マップ画面（せかいマップ／たび／たいりくせいは）向けの二本指ピンチズーム。
   baseView（ピンチ開始時点のview）と、ピンチ中心点anchor（viewBox座標系）、
   scaleFactor（現在のピンチ距離 ÷ ピンチ開始時の距離）から新しいviewを計算する。
   anchorの直下にある地図座標が画面上で動かない「アンカー固定ズーム」の標準式。
   クランプはviewFromScaleと同じclampViewを再利用するため、はみ出し禁止規則は常に一貫する。
   ズーム状態そのもの（いつ手動viewを使うか／いつ自動フレーミングへ戻すか）はUI側(App.jsx)の
   責務とし、本関数は「今回のジェスチャーでどこまでズームしたか」だけを計算する。 */
export function applyPinchZoom(baseView, anchor, scaleFactor, mapDims, opts = {}) {
  const { minScale = MIN_MANUAL_SCALE, maxScale = MAX_MANUAL_SCALE } = opts;
  const { s: s0, tx: tx0, ty: ty0 } = baseView;
  const s1 = Math.min(Math.max(s0 * scaleFactor, minScale), maxScale);
  const mapX = (anchor.x - tx0) / s0;
  const mapY = (anchor.y - ty0) / s0;
  return clampView(s1, anchor.x - s1 * mapX, anchor.y - s1 * mapY, mapDims);
}

/* HANDOFF v2.3 §2.1: ピン方式の位置問題（Q3・しんさ3れん）。
   タップ判定は最低56×56px相当。ここではCSSピクセルとは独立に「viewBox単位でどれだけの
   最小間隔を確保すべきか」を、実際に描画されているコンテナの物理サイズ(viewportShortPx)
   から逆算する（HANDOFFの「ビューポート比から逆算」を、xMidYMid sliceの規則に沿って実装。
   固定のSVG単位定数をあてがう旧実装が誤タップ多発の原因だったため、同じ轍を踏まない）。
   viewportShortPx・mapDimsの実測はDOM依存のためApp.jsx側の責務とし、本関数は算数のみ行う。 */
export const PIN_MIN_TAP_PX = 56;
export function mapUnitsForScreenPx(targetPx, viewportShortPx, mapShortSide, s) {
  const screenPxPerMapUnitAtS1 = viewportShortPx / mapShortSide; // xMidYMid slice の基準倍率
  return targetPx / (screenPxPerMapUnitAtS1 * s);
}

/* 候補点(cx,cy)どうしがminSeparation未満に近接しているものを同じクラスタにまとめ、
   クラスタの重心を中心とする円周上へ均等配置してピン位置(pinX,pinY)をずらす。
   候補国そのもの・実位置(x,y)は変更しない＝誤答選択肢戦略を地図都合で壊さない（§2.1）。
   孤立した候補（近接なし）はjittered:falseで実位置そのままを返す。 */
function clusterByProximity(points, minSeparation) {
  const parent = points.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[a] = b; };
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (Math.hypot(points[i].cx - points[j].cx, points[i].cy - points[j].cy) < minSeparation) union(i, j);
    }
  }
  const groups = new Map();
  points.forEach((_, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  });
  return [...groups.values()];
}

export function layoutPins(candidates, opts = {}) {
  const { minSeparation = 20, mapDims } = opts;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const out = new Array(candidates.length);
  for (const idxs of clusterByProximity(candidates, minSeparation)) {
    if (idxs.length === 1) {
      const i = idxs[0];
      out[i] = { id: candidates[i].id, x: candidates[i].cx, y: candidates[i].cy, pinX: candidates[i].cx, pinY: candidates[i].cy, jittered: false };
      continue;
    }
    const n = idxs.length;
    const ccx = idxs.reduce((a, i) => a + candidates[i].cx, 0) / n;
    const ccy = idxs.reduce((a, i) => a + candidates[i].cy, 0) / n;
    const r = minSeparation / (2 * Math.sin(Math.PI / n));
    idxs.forEach((i, k) => {
      const angle = (2 * Math.PI * k) / n - Math.PI / 2;
      let pinX = ccx + r * Math.cos(angle), pinY = ccy + r * Math.sin(angle);
      if (mapDims) { pinX = clamp(pinX, 0, mapDims.w); pinY = clamp(pinY, 0, mapDims.h); }
      out[i] = { id: candidates[i].id, x: candidates[i].cx, y: candidates[i].cy, pinX, pinY, jittered: true };
    });
  }
  return out;
}
