# game-ad-delivery

記事内にゲーム広告を iframe で掲載するための、配信ファイル一式。

**メディア担当者向けの案内はこちら → https://yamanryosuke.github.io/game-ad-delivery/**

```
/                     案内ページ（貼るコード・確認手順・トラブル切り分け）
/campaign001/         配信物。iframe の src はここを指す
/preview/             記事に埋め込んだ掲載イメージ（見本）
```

## 掲載コード

```html
<div style="position:relative;width:100%;max-width:720px;margin:0 auto;aspect-ratio:1/1;background:#0a1224">
  <iframe
    src="https://yamanryosuke.github.io/game-ad-delivery/campaign001/"
    style="position:absolute;inset:0;width:100%;height:100%;border:0"
    allow="autoplay; fullscreen"
    title="ゲーム広告：あの板、2人乗れた説"
    loading="lazy"></iframe>
</div>
```

## 仕様

- HTML / CSS / JavaScript（Canvas 2D）。外部ライブラリなし
- 表示は正方形（原寸 720×720、最大幅 720px）
- Cookie 不使用・個人情報の取得なし
- 音はユーザーが開始ボタンを押した後のみ再生
- 親ページへ `postMessage` でイベントを送信（`game_ready` / `first_interaction` /
  `game_start` / `game_complete` / `cta_click`）。受信側の実装は任意

## 新しいキャンペーンを追加するとき

`campaign001/` を複製して番号を変え、次の3点を差し替える。

1. `js/game.js` の `CAMPAIGN_ID`
2. `js/game.js` の `PARENT_ORIGIN`（掲載先ドメインが確定していれば固定する）
3. `index.html` の `#btnCta` の `href`（広告主の LP）
