/*
 * adapter.js — プレイアブル広告版だけに入る、CTA の委譲先アダプタ
 *
 * プレイアブル広告は「広告ネットワークのコンテナの中で動く単体 HTML」なので、
 * ストアへ送る手段がネットワークごとに違う。ゲーム側にネットワーク判定を書くと
 * 配信先が増えるたびにゲームを触ることになるため、ここで吸収する。
 *
 *   Meta     window.FbPlayableAd.onCTAClick()
 *   TikTok   window.openAppStore()
 *   MRAID系  window.mraid.open(url)      … Unity / AppLovin / ironSource など
 *   なし     親へ postMessage するだけ    … 掲載イメージのページ / 単体で開いたとき
 *
 * 判定は「読み込み時」ではなく「クリック時」に行う。ネットワークの SDK は
 * コンテナ側があとから注入することがあり、起動時点ではまだ存在しないため。
 *
 * このファイルは iframe 配信版（各ゲームの index.html）には入らない。
 * 入るのは tools/build-playable.py が生成した単体 HTML だけ。
 */
(function () {
  'use strict';

  function detect() {
    if (window.FbPlayableAd && typeof window.FbPlayableAd.onCTAClick === 'function') return 'meta';
    if (typeof window.openAppStore === 'function') return 'tiktok';
    if (window.mraid && typeof window.mraid.open === 'function') return 'mraid';
    return 'none';
  }

  function notify(network, href, handled) {
    var payload = {
      source: 'game-ad',
      event: 'cta_dispatch',
      data: { network: network, href: href, handled: handled },
      ts: Date.now()
    };
    console.log('[playable] CTA →', network, handled ? '(ネットワークAPIへ委譲)' : '(委譲先なし)');
    try {
      if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*');
    } catch (e) { /* コンテナがクロスオリジンでも落とさない */ }
    document.dispatchEvent(new CustomEvent('gamead:cta_dispatch', { detail: payload }));
  }

  window.__adNetworkCta = function (href) {
    var network = detect();
    switch (network) {
      case 'meta':
        window.FbPlayableAd.onCTAClick();
        break;
      case 'tiktok':
        window.openAppStore();
        break;
      case 'mraid':
        window.mraid.open(href);
        break;
      default:
        // ここで location を書き換えたくなるが、やってはいけない。
        // TikTok は JS リダイレクトを明示的に禁止しており、審査で弾かれる。
        // 遷移させるかどうかは、埋め込んでいる側の責任にする。
        break;
    }
    notify(network, href, network !== 'none');
  };

  window.__adNetwork = detect;
})();
