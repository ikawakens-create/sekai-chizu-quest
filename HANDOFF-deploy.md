# HANDOFF: せかいちずクエスト GitHub Pages 公開手順

> **実行担当**: Claude Code Web（Sonnet / Opus どちらでも可）
> **目的**: 添付zipの内容を GitHub リポジトリ化し、GitHub Pages で公開して、スマホ（Android / iPhone）からPWAとしてインストールできる状態にする。
> **前例**: 「にっぽんちずクエスト」「おたからミッション」と同じ GitHub Pages 方式。
> このドキュメントの手順は上から順に、省略せずに実行すること。

---

## 0. 前提と成果物

- 成果物URL: `https://<GitHubユーザー名>.github.io/sekai-chizu-quest/`
- リポジトリ名: `sekai-chizu-quest`（public。privateだと無料プランでPagesが使えない）
- デプロイ方式: **GitHub Actions**（`.github/workflows/deploy.yml` を同梱済み。mainにpushするだけで自動デプロイ）
- `pwa/` 配下は**相対パス（`./`）だけで構成済み**なので、サブパス配信（`/sekai-chizu-quest/`）でそのまま動く。パスの書き換えは不要。

## 1. リポジトリ作成と初回push

```bash
# zipを展開したディレクトリで
git init
git add -A
git commit -m "feat: せかいちずクエスト v1.0（196か国・5モード・ガチャ・たいりくせいは）"
gh repo create sekai-chizu-quest --public --source=. --push
# gh が無い場合は GitHub上でリポジトリを作って:
# git remote add origin https://github.com/<user>/sekai-chizu-quest.git
# git branch -M main && git push -u origin main
```

**コミット構成の注意**: 今回は完成品の一括初回コミットでよい。以後の修正は「1機能=1コミット」、ヒント修正は「大陸ごとに1コミット」。

## 2. GitHub Pages の有効化（1回だけ・手動）

リポジトリの **Settings → Pages → Build and deployment → Source** を **「GitHub Actions」** に変更する。
（"Deploy from a branch" のままだとワークフローが動いても公開されない。ここが唯一の手動設定）

その後 Actions タブで `Deploy PWA to GitHub Pages` が成功していることを確認。
初回はpush済みなら自動で走っている。失敗していたら「Re-run all jobs」。

## 3. 動作確認チェックリスト（デプロイ後に必ず全部）

PCブラウザで `https://<user>.github.io/sekai-chizu-quest/` を開き:

- [ ] ホーム画面が表示され、地図に色がつく（真っ白ならapp.jsの404 → Actionsログ確認）
- [ ] クイズを1問プレイ → **国旗が表示される**（×アイコンなら `flags/` がデプロイされていない）
- [ ] DevTools → Application → Manifest にエラーがない
- [ ] DevTools → Application → Service Workers が activated
- [ ] DevTools → Network を Offline にしてリロード → 動く（SWキャッシュ確認）
- [ ] クイズ結果 → ガチャ → シールずかんに反映される（window未対応環境向けlocalStorage保存の確認）

## 4. スマホへのインストール手順（家族向けに共有する内容）

**Android（OPPO / Chrome）**:
1. Chrome で公開URLを開く
2. 一度クイズを1問遊ぶ（国旗キャッシュのウォームアップ）
3. メニュー（⋮）→「ホーム画面に追加」→「インストール」
4. ホームの🌍アイコンから起動（全画面・オフラインOK）

**iPhone（Safari）**:
1. Safari で公開URLを開く
2. 共有ボタン →「ホーム画面に追加」

## 5. 更新時のルール（重要・毎回）

1. コード修正 → `npm run build`（pwa/app.js を再生成）
2. **`pwa/sw.js` の1行目付近 `const CACHE = "sekai-quest-v1"` の数字を+1する**（v1→v2）。
   これを忘れると**利用者のスマホに古いバージョンが残り続ける**。デプロイ=キャッシュ名バンプ、をセットで。
3. commit → push（Actionsが自動デプロイ）

## 6. リポジトリ構成と「触ってはいけないファイル」

```
pwa/                  # 公開される完成物（Pagesのデプロイ対象はここだけ）
  app.js              # ← 生成物。直接編集禁止。src/を直してnpm run build
  flags/*.svg         # 国旗196枚（flag-icons, MIT）
  sw.js               # 更新時はCACHE名をバンプ（§5）
src/
  App.jsx             # アプリ本体（編集はここ）
  main.jsx
  data/world.geo.js   # ← 自動生成物。直接編集禁止。build-maps.mjsを直してnpm run build:maps
  data/ja.js          # 首都196・国名かな
  data/hints-*.js     # ヒント980個（5ファイル・大陸別）。修正時は該当大陸ファイルのみ
build-maps.mjs        # 地図データ生成（Natural Earth 50m → Equal Earth SVG）
build-artifact.mjs    # Claude Artifact用の単一JSX生成（npm run build:artifact）
.github/workflows/deploy.yml  # 自動デプロイ（編集不要。build:artifactは含まない）
```

**`npm run build` と `npm run build:artifact` は別物**:
- `npm run build`（esbuild）… `pwa/app.js` を再生成する。公開・デプロイ対象はこちら。ソースから再ビルドしてバイト一致することを確認する。
- `npm run build:artifact`（`build-artifact.mjs`）… claude.ai用の単一ファイル `sekai-chizu-quest.jsx` を生成する。`src/data/*` の各モジュールを1ファイルにインライン化し、React以外のローカルimportが1つも残っていない状態になって初めて成功する。インライン化し忘れたモジュールが残っていれば、書き出さずに未処理モジュール名を挙げてエラーで失敗する（＝壊れた成果物を黙って出さない）。CI（deploy.yml）には組み込まれていない、ローカル専用のユーティリティ。

## 7. 品質ゲート（変更をpushする前に必ず）

```bash
npm run build                    # エラーなくビルドできる
node --input-type=module -e '   # ヒント検証（変更した場合）
import { COUNTRY_GEO } from "./src/data/world.geo.js";
import { HINTS_ASIA } from "./src/data/hints-asia.js";
import { HINTS_EUROPE } from "./src/data/hints-europe.js";
import { HINTS_AFRICA } from "./src/data/hints-africa.js";
import { HINTS_AMERICAS } from "./src/data/hints-americas.js";
import { HINTS_OCEANIA } from "./src/data/hints-oceania.js";
const H = { ...HINTS_ASIA, ...HINTS_EUROPE, ...HINTS_AFRICA, ...HINTS_AMERICAS, ...HINTS_OCEANIA };
let e = 0;
for (const c of COUNTRY_GEO) {
  const hs = H[c.id]; if (!hs || hs.length < 5) { console.log("NG本数:", c.id); e++; continue; }
  if (!hs.some(h => h.t === "japan")) { console.log("NG japan:", c.id); e++; }
  for (const h of hs) {
    const rest = h.s.replace(/\{[^|}]+\|[^}]+\}/g, "");
    if (/[\u4e00-\u9faf]/.test(rest)) { console.log("NGふりがな:", c.id, h.s); e++; }
  }
}
console.log(e ? "❌ " + e + "件" : "✅ ヒント検証OK");
'
```

## 8. 守るべき製品ポリシー（HANDOFF-sekai-chizu-quest.md §8 より）

- 対象は196（国連193+バチカン+パレスチナ+台湾）。増減させない
- ヒント・UIで領土問題・現在の紛争に触れない。台湾・パレスチナは「くに・ちいき」の枠で扱う
- 196か国以外の陸地（西サハラ・グリーンランド等）はグレーの「その他の陸地」のまま。色分け・タップ対象にしない
- 国旗は絵文字ではなくSVG（`pwa/flags/`）。Android互換のため

## 9. トラブルシューティング

| 症状 | 原因と対処 |
|---|---|
| ページが404 | Settings→PagesのSourceが「GitHub Actions」になっていない（§2） |
| 地図が出ない・真っ白 | app.jsが古い/欠落 → `npm run build` してpush。Actionsログで `npm ci` 失敗が無いか確認 |
| 国旗が表示されない | `pwa/flags/` がコミットから漏れている（`.gitignore` を確認） |
| 更新が反映されない | sw.jsのCACHE名バンプ忘れ（§5）。応急処置はスマホ側でサイトデータ削除 |
| Actionsで npm ci 失敗 | package-lock.json がコミットされているか確認 |

## 10. 次フェーズ（今回はやらない・参考）

- Phase 6: たいりくせいはのイベント拡充（うばいとりバトル⚡・ラッキーもんだい🍀 — 日本版 app.js の `beginVsQuestion` 参照）
- ヒントの事実修正: 家族テストで見つかった誤りを大陸ファイル単位で修正
