---
name: teluis-design-system
description: >-
  Rules and context for the TELUIS blog design system. Use this skill when making frontend changes, adding new components, or modifying Astro layouts to ensure consistency with the established responsive design, Cocoon-like styling, and navigation UI.
---

# TELUIS Design System & Frontend Guidelines

TELUISブログのUIコンポーネントやデザインを変更・追加する際は、以下のデザインシステムとルールに従ってください。

## 1. 全体レイアウト・レスポンシブのルール
- **メイン幅**: コンテンツの最大幅は `1200px` です（`max-width: 1200px; width: 100%;`）。画面幅が狭いスマホ端末などでもはみ出さないよう、`box-sizing: border-box;` を適用しています。
- **モバイル対応（レスポンシブ）**: 画面幅 `720px` や `800px` 以下をブレイクポイントとし、2カラムレイアウト（メイン＋サイドバー）は1カラム（縦積み）に切り替わるようにします。

## 2. ヘッダーナビゲーション (Header.astro)
- **追従（Sticky）**: ヘッダーは画面上部に固定（`position: sticky; top: 0; z-index: 1000;`）され、下にスクロールしても付いてくる仕様です。
- **ハンバーガーメニュー**: スマホ画面（幅 `720px` 以下）では、PC用の横並びメニューが非表示になり、右上の「三（ハンバーガーアイコン）」をタップすることでメニューが展開される仕組みを採用しています。
- **メニュー項目**: `Home`, `Category`, `About`, `Contact` の4つです。（※`Blog` メニューは廃止されました）

## 3. カードデザイン (Cocoon風)
- 記事のリストやサイドバーのウィジェットなどは、Cocoonテーマのようなカード型のデザインを採用しています。
- **`.box` クラス**: 背景白、薄いグレーのボーダー、控えめな角丸（`border-radius: 4px;`）を持つコンテナです。これをベースにUIを構築します。
- **ホバーエフェクト**: 記事カードなどクリックできる要素は、ホバー時にわずかに上に浮き上がる（`transform: translateY(-3px)`）か、背景色がほんのり明るくなる等の控えめなアニメーションを付けます。

## 4. カテゴリ（Categories）
- 以前の「タグ（tags）」機能は「カテゴリ（categories）」へ統合・移行されました。
- **UI表示**: カテゴリは「青い角丸のバッジ（例：`#e0f2fe` 背景に `#0369a1` の文字）」として表示されます。
- **URL**: `/category/[category_name]` というルーティングで、各カテゴリの一覧ページが動的に生成されます。
- **カテゴリ一覧 (`/category/index.astro`)**: グリッドレイアウトでカテゴリ一覧を表示します。カテゴリ名が長くても崩れないよう、記事数バッジには `white-space: nowrap; flex-shrink: 0;` を設定し、名前部分は `word-break: break-word;` で改行させます。
- **カテゴリ別記事一覧 (`/category/[category_name].astro`)**: トップページと同じ画像付きの `.entry-card` （アイキャッチ画像左、タイトル右のリスト）を使用し、統一感を持たせます。

## 5. ページネーションとトップページ
- **トップページ (`/[...page].astro`)**: Astroの `paginate` 機能を利用し、1ページあたり最大10件の記事を表示します。
- **ヒーローバナー**: サイト上部の大きな看板画像 (`/brand/テルイズヘッダ_トリミング.jpg`) は、トップページの1ページ目 (`page.currentPage === 1`) でのみ表示します。
- **ページャー**: 記事リストの末尾に `« 前へ` `1 / 5 ページ` `次へ »` のようなページネーションを設置します。

## 6. ブランドアセットとプロフィール
- **ロゴ (`Header.astro`)**: 横長のロゴ画像 (`/brand/teluis_horizontal_logo.jpg`) を使用します。上下の余白を削るため、コンテナに `height: 40px; overflow: hidden;` を指定し、画像自体を `height: 70px; mix-blend-mode: multiply;` とすることでヘッダーを高くせずに文字を大きく見せるCSSテクニックを使用しています。
- **プロフィール (サイドバー)**: `teluis_avatar.jpg` を使ったメインのプロフィールに加え、`テルイズ妻.png` を使った共同運営者（TELUIS 妻）のプロフィールをサイドバーや `about.astro` に常設しています。
- 画像はすべて `public/brand/` フォルダ内のものを利用します。

## 7. カラーパレット (global.css)
- `--bg-main`: `#f3f4f5` (薄いグレー、全体の背景)
- `--bg-content`: `#ffffff` (白、カードやコンテンツ部分の背景)
- `--theme-accent`: `#007cba` (アクセントカラーの青、リンクやバッジに使用)
- `--text-main`: `#333333` (基本の濃いグレー文字)
- `--text-light`: `#777777` (日付などの補助的な薄い文字)
- `--border-color`: `#dfdfdf` (枠線用)

## 8. コンポーネント追加時の注意
- Astroコンポーネント内に `<style>` を記述する際は、他の要素に影響を与えないようスコープ付きCSS（デフォルト）を活用するか、全ページ共通のスタイルは `global.css` に記載してください。
- ユーザーに「デザインが崩れた」「レスポンシブがおかしい」と言われた場合は、真っ先に `width: 100%` や `box-sizing: border-box`、フレックスボックスの `flex-wrap: wrap` の指定漏れを疑ってください。
