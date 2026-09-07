# game-ad-delivery

記事に iframe 1個で差し込めるゲーム広告の配信ファイル一式。

**メディア担当者に渡すのはこの URL → https://yamanryosuke.github.io/game-ad-delivery/**

```
/                  ゲームメニュー。プレビュー付きで、ゲームごとに埋め込みコードをコピーできる
/guide/            掲載の手引き（貼り方・確認・トラブル切り分け・sandbox・計測）
/preview/          記事に埋め込んだ掲載イメージ。?game=suika などで中身を切り替えられる
/playable/         SNS のフィード内で遊べる「プレイアブル広告」版（掲載イメージと単体HTML）
/tools/            プレイアブル広告版のビルドスクリプト
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

## プレイアブル広告版（`/playable/`）

同じゲームを、TikTok や Meta の**縦型フィードの中でその場で遊べる**形式にしたもの。
掲載イメージ → https://yamanryosuke.github.io/game-ad-delivery/playable/

記事に貼る iframe 版とは要求が真逆で、**外部への HTTP リクエストが一切禁止**されている。
そのため CSS も JS も画像も、全部 1枚の HTML に埋め込む必要がある。

| | 記事に貼る iframe 版 | プレイアブル広告版 |
|---|---|---|
| ファイル | HTML・JS・画像に分割 | 単体 HTML 1枚 |
| 外部通信 | 自由 | 禁止 |
| 遷移 | `<a target="_blank">` | リンク遷移も JS リダイレクトも禁止。ネットワークの API を呼ぶ |
| 表示比率 | 正方形（1:1） | 縦向き（Meta は縦向き必須） |

### ビルド

**単体版は手で作らない。`shared/` と各ゲームから常に生成する。**
両方を手で維持すると必ず片方が腐るため。

```bash
python tools/build-playable.py
```

`playable/build/<id>.html`（Meta 用）と `playable/build/<id>-playable.zip`（TikTok 用）、
それに掲載イメージのページが読む `manifest.json` が出る。
GitHub Pages で配信するので、生成物も commit する。

ビルドは生成と同時に**仕様チェックを走らせ、1つでも NG があれば失敗で止まる。**
サイズ上限・外部リクエストの混入・CTA API の実装の3種類を見ている。

### CTA の委譲

ストアへ送る手段はネットワークごとに違うが、**ゲーム側にネットワーク判定は書いていない。**
`playable/adapter.js` が吸収し、クリック時に「そこにある SDK」を見て委譲する。

| 検出したもの | 呼ぶ API |
|---|---|
| `window.FbPlayableAd` | `FbPlayableAd.onCTAClick()` |
| `window.openAppStore` | `window.openAppStore()` |
| `window.mraid` | `mraid.open(url)`（Unity / AppLovin など） |
| どれも無い | 何もしない（親へ `cta_dispatch` を postMessage するだけ） |

`shared/ad-sdk.js` は `window.__adNetworkCta` があるときだけそちらへ委譲する。
iframe 配信版には `adapter.js` が入らないので、従来どおり `<a target="_blank">` が働く。

### 注意

**この枠はアプリ広告の枠。** TikTok は App Promotion 目的に限定されており、Meta も同様。
ストアに実在するアプリが要るため、Web の LP へ誘導する案件では使えない可能性がある。

入稿前に Meta の Playable Preview Tool（開発者向け・無料）で検証すること。

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
5. `tools/build-playable.py` の `GAMES` にも1行足し、`python tools/build-playable.py` を実行する
   （プレイアブル広告版は生成物なので、`playable/build/` の中身も一緒に commit する）

## ローカルで確認する

```bash
python -m http.server 8790
```

http://localhost:8790/ を開く。
