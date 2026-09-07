# game-ad-delivery

記事に iframe 1個で差し込めるゲーム広告の配信ファイル一式。

**メディア担当者に渡すのはこの URL → https://yamanryosuke.github.io/game-ad-delivery/**

```
/                  ゲームメニュー。プレビュー付きで、ゲームごとに埋め込みコードをコピーできる
/guide/            掲載の手引き（貼り方・確認・トラブル切り分け・sandbox・計測）
/preview/          記事に埋め込んだ掲載イメージ。?game=suika などで中身を切り替えられる
/shared/           全ゲーム共通の部品
/suika/            くだものおとし
/flappy/           すきまくぐり
/runner/           とびこえランナー
/campaign001/      あの板、2人乗れた説（最初に作ったもの）
```

## ゲーム

| ディレクトリ | 名前 | 内容 |
|---|---|---|
| `suika` | くだものおとし | 同じくだもの同士をくっつけて大きくする落ちものパズル |
| `flappy` | すきまくぐり | タップで飛んで柱のすきまを抜ける |
| `runner` | とびこえランナー | タップでジャンプして障害物をよける |
| `campaign001` | あの板、2人乗れた説 | 板の上でバランスを取る一発ネタ |

表示はすべて**正方形（1:1）で統一**してある。ゲームを差し替えても、
メディアに渡す iframe のコードの形と枠の大きさは変わらない。

## 共通部品（`/shared/`）

| ファイル | 役割 |
|---|---|
| `ad-sdk.js` | 親ページへの `postMessage` と CTA のクリック計測 |
| `embed-button.js` | 画面右下の「埋め込みコード」コピーボタン。見た目も自前で持つ |
| `sfx.js` | Web Audio API の最小ラッパー。効果音ファイルを持たず合成する |
| `game.css` | ゲームの枠まわり（正方形の canvas・開始画面・終了バー） |
| `page.css` / `page.js` | 説明ページ（メニュー・手引き）用 |

`embed-button.js` は**直接開いたときと `?tools=1` のときだけ**ボタンを出す。
メディアが記事に埋め込んだときは何も表示しない。読者に開発用のボタンを見せないため。

## 掲載コード

```html
<div style="position:relative;width:100%;max-width:720px;margin:0 auto;aspect-ratio:1/1;background:#0d1017">
  <iframe
    src="https://yamanryosuke.github.io/game-ad-delivery/suika/"
    style="position:absolute;inset:0;width:100%;height:100%;border:0"
    allow="autoplay; fullscreen"
    title="ゲーム広告：くだものおとし"
    loading="lazy"></iframe>
</div>
```

## 仕様

- HTML / CSS / JavaScript（Canvas 2D）。外部ライブラリなし
- Cookie 不使用・個人情報の取得なし
- 音はユーザーが「はじめる」を押した後のみ再生（Autoplay Policy 対策）
- 親ページへ `postMessage` でイベントを送信（受信側の実装は任意）
  `game_ready` / `first_interaction` / `game_start` / `game_complete` / `cta_click`
- `campaign` フィールドでどのゲームかを区別できる

## ゲームを1本足すとき

1. 既存のゲームのディレクトリを複製して名前を変える
2. `index.html` の `<title>`、開始画面の文言、`#btnCta` の `href` を直す
3. `game.js` の中身を差し替え、`AdSDK.init({ campaign: '<ディレクトリ名>' })` を合わせる
4. ルートの `index.html` の `GAMES` 配列に1行足す

## ローカルで確認する

```bash
python -m http.server 8790
```

http://localhost:8790/ を開く。
