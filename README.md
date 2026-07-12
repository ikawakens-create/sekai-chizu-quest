# せかいちずクエスト（Phase 3 プロトタイプ）

「にっぽんちずクエスト」の世界地図版。196か国の **国名・国旗・首都** をクイズでおぼえる。

## いま動くもの（Phase 3）
- ソロクイズ10問：出題5タイプをローテーション
  - 🗺️ ちず→国名 / 🚩 こっき→国名 / 🏛️ 国名→首都 / 📍 こっき→ちずタップ / ⭐ ヒントだけ
- 1国3スロット習熟度（なまえ・こっき・しゅと、各2回正解でマスター → 金色）
- 未マスターの国を優先出題する重み付き抽選
- Equal Earth世界地図・国ごとの自動ズーム・小国29か国はマーカー表示
- せかいマップ（大陸ズーム＋タップで国情報）
- PWA（オフライン動作・ホーム画面インストール）

## まだのもの
- ガチャ・シールずかん → Phase 5（日本版から移植）
- たいりくせいはのイベント拡充（うばいとりバトル等）→ Phase 6

## Phase 4 完了：ヒント全196か国
- 計980個（各国5個、🇯🇵日本との関係を必ず1個以上）
- データ: src/data/hints-{asia,europe,africa,americas,oceania}.js
- 検証済み: 全国カバー / japan必須 / ふりがな漏れゼロ / カテゴリ正当

## フォルダ構成
- `pwa/` … そのまま公開できる完成物（GitHub Pages にpush）
- `src/` … ソース（App.jsx / data/world.geo.js / data/ja.js）
- `build-maps.mjs` … 地図データ再生成スクリプト

## ビルド
```bash
npm install
npx esbuild src/main.jsx --bundle --minify --outfile=pwa/app.js --loader:.js=jsx
```

## ローカル確認
```bash
cd pwa && npx serve .
```

## ライセンス
- 地図: Natural Earth（パブリックドメイン）
- 国旗: flag-icons（MIT）
