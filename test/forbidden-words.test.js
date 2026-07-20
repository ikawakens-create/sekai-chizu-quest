import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/* HANDOFF v2.3 §0-2/§10（PR6）: たびモード内のUIテキストに禁止語4つ
   （モード/クイズ/テスト/せいせき）が出ないことをgrepで機械確認する。
   trip系画面（tripHome/trip/passport）はApp.jsx内のコメント見出しで区切られているので、
   その範囲だけを切り出し、さらにブロックコメント（既存モード専用コードへの言及・
   実装メモ）を除いてから判定する。コメントや内部識別子はスコープ外（§0-2原文どおり
   「たびモード内のUIテキスト」限定）なので、対象読み取りの前に取り除く。 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(path.join(__dirname, "../src/App.jsx"), "utf8");

const FORBIDDEN = /モード|クイズ|テスト|せいせき/g;

function sliceBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker);
  assert.ok(start !== -1, `start marker not found: ${startMarker}`);
  assert.ok(end !== -1 && end > start, `end marker not found after start: ${endMarker}`);
  return src.slice(start, end);
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

test("trip系画面（tripHome/trip）のUIテキストに禁止語が無い", () => {
  const section = sliceBetween(
    appSrc,
    "/* ===== せかいのたび：パックせんたく ===== */",
    "/* ===== せかいマップ ===== */"
  );
  const uiText = stripComments(section);
  assert.deepEqual(uiText.match(FORBIDDEN), null);
});

test("パスポート画面（screen===passport）のUIテキストに禁止語が無い", () => {
  const section = sliceBetween(
    appSrc,
    "/* ===== パスポート（HANDOFF",
    "/* ===== たいりくせいは：せってい ===== */"
  );
  const uiText = stripComments(section);
  assert.deepEqual(uiText.match(FORBIDDEN), null);
});

/* 「もんだい」は禁止語ではない（§0-2の例外規定どおり消さない）。誤って正規表現に
   混入させていないことの自己チェック。 */
test("禁止語リストに「もんだい」は含まれない（消してはいけない語の混入防止）", () => {
  assert.equal(/モード|クイズ|テスト|せいせき/.test("もんだい"), false);
});
