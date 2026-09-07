/*
 * adapter.js — HTML5 ディスプレイ広告版だけに入る、CTA の委譲先アダプタ
 *
 * ディスプレイ広告のクリックは clickTag を通す決まりになっている。
 * clickTag は「アドサーバーが遷移先と計測用 URL を差し替えるための変数」で、
 * 素材の中に遷移先をハードコードしてしまうと、
 *
 *   ・クリック計測が通らない（何回押されたか分からない）
 *   ・入稿後に遷移先を差し替えられない（素材を作り直すことになる）
 *
 * という2つが同時に起きる。だから window.open(clickTag) の形にする。
 *
 * プレイアブル広告版（playable/adapter.js）とは事情が違う点に注意。
 * あちらは遷移そのものが禁止でネットワークの API を呼ぶ。こちらは普通に開く。
 *
 * なお、素材の全面を <a> で包む書き方もよく使われるが、ここでは使っていない。
 * 全面がクリック領域になると、ゲームを操作するタップまで遷移になってしまう。
 * 遊べる素材では CTA ボタンを出口にするのが正しい。
 * （アドサーバーによっては全面クリックを要求されることがあるため、入稿時に要確認）
 */
(function () {
  'use strict';

  window.__adNetworkCta = function (href) {
    var url = (typeof window.clickTag === 'string' && window.clickTag) || href;
    var opened = null;
    try {
      opened = window.open(url, '_blank');
    } catch (e) {
      console.warn('[display] window.open に失敗:', e);
    }
    var payload = {
      source: 'game-ad',
      event: 'cta_dispatch',
      data: { network: 'clickTag', href: url, handled: true },
      ts: Date.now()
    };
    console.log('[display] CTA → clickTag:', url);
    try {
      if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*');
    } catch (e) { /* 掲載先がクロスオリジンでも落とさない */ }
    document.dispatchEvent(new CustomEvent('gamead:cta_dispatch', { detail: payload }));
    return opened;
  };
})();
