/*
 * ad-sdk.js — 広告ゲーム共通の配信まわり
 *
 * どのゲームも「ゲームの中身」以外は同じことをする。その部分だけをここに集めた。
 *
 *   - 親ページ（Web メディア）への postMessage
 *   - CTA のクリック計測
 *
 * 右下の「埋め込みコード」ボタンは embed-button.js が別に受け持つ。
 *
 * ゲーム側は AdSDK.init() を1回呼び、あとは start() / complete() / interaction()
 * を適切なタイミングで呼ぶだけでよい。
 */
(() => {
  'use strict';

  // ===========================================================================
  // ★★★ 本番では targetOrigin を必ず配信先ドメインに限定すること ★★★
  //
  // '*' のままだと、このゲームを iframe で埋め込んだ「任意の」ページが
  // スコア・プレイ時間・行動ログを受け取れてしまう。
  //
  //   const PARENT_ORIGIN = 'https://media-example.jp';
  //
  // 複数メディアへ配信する場合は、配信時に生成する設定ファイル、または
  // iframe の URL パラメータでオリジンを受け取り、許可リストと突き合わせてから
  // 使う。URL パラメータをそのまま targetOrigin に渡してはいけない。
  //
  // 掲載テスト中は、どのメディアに貼られるか未確定のため '*' にしてある。
  // ===========================================================================
  const PARENT_ORIGIN = '*';
  const AD_SOURCE = 'game-ad';

  const embedded = window.parent !== window;

  let campaign = 'unknown';
  let sentFirstInteraction = false;
  let startedAt = 0;

  // ---- 親ページへ送る -------------------------------------------------------
  function emit(event, data) {
    const payload = {
      source: AD_SOURCE,
      campaign: campaign,
      event: event,
      data: data || {},
      ts: Date.now(),
    };
    console.log('[game-ad] emit:', event, payload.data);
    try {
      if (embedded) window.parent.postMessage(payload, PARENT_ORIGIN);
    } catch (e) {
      console.warn('[game-ad] postMessage に失敗:', e);
    }
    // 直接開いたときにも確認できるよう、同一ドキュメント内にも流す
    document.dispatchEvent(new CustomEvent('gamead:' + event, { detail: payload }));
  }

  // 「人間が最初にこのゲームに触った瞬間」。1回だけ送る。
  function interaction(kind) {
    if (sentFirstInteraction) return;
    sentFirstInteraction = true;
    emit('first_interaction', { kind: kind });
  }

  // ---- CTA ------------------------------------------------------------------
  // iframe の中からリンクを踏んでも親ページを遷移させないことが重要。
  // それを担保しているのは JS ではなく HTML 側の属性:
  //   target="_blank"           → 新しいタブで開く（親フレームを書き換えない）
  //   rel="noopener noreferrer" → 遷移先から window.opener 経由で操作されるのを防ぐ
  // ここでは遷移を止めず、計測だけ行う。
  function wireCta() {
    const cta = document.getElementById('btnCta');
    if (!cta) return;
    cta.addEventListener('click', () => {
      emit('cta_click', {
        href: cta.getAttribute('href'),
        label: (cta.textContent || '').trim(),
        placement: 'after_game',
      });
    });
  }

  // ---- 公開 API -------------------------------------------------------------
  window.AdSDK = {
    /** ゲーム読み込み直後に1回だけ呼ぶ。 */
    init(opts) {
      const o = opts || {};
      campaign = o.campaign || 'unknown';
      wireCta();
      emit('game_ready', {
        embedded: embedded,
        canvas: o.canvas || '720x720',
        ua: navigator.userAgent,
      });
    },

    /** ゲーム開始時に呼ぶ。 */
    start(data) {
      startedAt = performance.now();
      emit('game_start', data || {});
    },

    /** ゲーム終了時に呼ぶ。playTimeMs は自動で足す。 */
    complete(data) {
      const d = Object.assign({}, data || {});
      if (d.playTimeMs === undefined) {
        d.playTimeMs = startedAt ? Math.round(performance.now() - startedAt) : 0;
      }
      emit('game_complete', d);
    },

    interaction: interaction,
    emit: emit,
    embedded: embedded,
  };
})();
