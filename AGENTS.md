## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Content & Text Decoration Rules (日本語執筆ルール)

Markdown記法（CommonMark仕様）では、単語間にスペースのない日本語文字（ひらがな・漢字・助詞・約物）と記号（`**` や `*`、`~~`）が隣接しているとパースに失敗し、記号がそのまま平文として画面に露出してしまいます。
そのため、記事（.md / .mdx）内での文字装飾は**HTMLタグで記述することをルール**とします。

- **太字（ボールド）**：`<b>重要語句</b>` または `<strong>重要語句</strong>` （`**` は使用禁止）
- **斜体（イタリック）**：`<i>テキスト</i>` または `<em>テキスト</em>` （`*` や `_` は使用禁止）
- **取り消し線**：`<s>テキスト</s>` または `<del>テキスト</del>` （`~~` は使用禁止）
- **マーカー線（ハイライト）**：`<mark>注目テキスト</mark>`
- **下線**：`<u>テキスト</u>`
- **ショートカットキー**：`<kbd>Key</kbd>`

## Decorative Box Components

- `<AdviceBox title="タイトル">...</AdviceBox>`: アドバイス、注意点、ワンポイントヒント用（アンバー調・電球アイコン付き）。
- `<ConclusionBox>...</ConclusionBox>`: この記事の結論・要点まとめ用（ブルー調）。**1記事につき最後の「まとめ（総括）」でのみ使用すること（冒頭など複数箇所での重複使用は禁止）**。
- `<ProblemBox>...</ProblemBox>`: 読者の悩み・問題提起用（グレー調）。

