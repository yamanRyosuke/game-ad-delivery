/*
 * embed-button.js — 画面右下に「埋め込みコード」のコピーボタンを出す
 *
 * ★ 表示するのは次の場合だけ:
 *     - ゲームを直接開いたとき（iframe に入っていない）
 *     - ?tools=1 が付いているとき（メニューページのプレビュー用）
 *
 *   メディアが記事に埋め込んだときは何も表示しない。
 *   これが読者に見えると、広告の中に開発用のボタンが混ざることになる。
 *
 * 見た目もこのファイルの中で完結させてある。どのゲームの CSS でも同じように出る。
 * ゲーム側は <div id="stage"> を持っていればよく、他に何もしなくてよい。
 */
(() => {
  'use strict';

  const embedded = window.parent !== window;
  const tools = new URLSearchParams(location.search).get('tools') === '1';
  if (embedded && !tools) return;

  const stage = document.getElementById('stage');
  if (!stage) return;

  // タイトルは <title> の「｜」より前を使う（例: くだものおとし｜ゲーム広告）
  const name = (document.title || 'ゲーム広告').split(/[｜|]/)[0].trim();

  function snippet() {
    // 自分の URL から組み立てる。?tools=1 などのクエリは付けない。
    const url = location.origin + location.pathname.replace(/index\.html$/, '');
    return '<div style="position:relative;width:100%;max-width:720px;margin:0 auto;' +
           'aspect-ratio:1/1;background:#0d1017">\n' +
           '  <iframe\n' +
           '    src="' + url + '"\n' +
           '    style="position:absolute;inset:0;width:100%;height:100%;border:0"\n' +
           '    allow="autoplay; fullscreen"\n' +
           '    title="ゲーム広告：' + name + '"\n' +
           '    loading="lazy"></iframe>\n' +
           '</div>';
  }

  const style = document.createElement('style');
  style.textContent = [
    '#embedBtn{position:absolute;right:10px;bottom:10px;z-index:5;',
    'font:700 clamp(10px,2.6vw,12px)/1.2 "Hiragino Sans","Noto Sans JP",system-ui,sans-serif;',
    'padding:7px 11px;border-radius:4px;cursor:pointer;',
    'background:rgba(27,36,54,.86);border:1px solid #46586f;color:#cbd6e4;',
    '-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);}',
    '#embedBtn:hover{background:rgba(36,48,73,.95);color:#fff;}',
    '#embedBtn .m{opacity:.65;margin-right:2px;}',
    '#embedBtn.done{background:#1d7a4d;border-color:#1d7a4d;color:#fff;}',
    /* 終了後のバーが出ている間は、その上へ逃がす（重なり防止） */
    'body[data-state="done"] #embedBtn{bottom:74px;}',
  ].join('');
  document.head.appendChild(style);

  const LABEL = '<span class="m" aria-hidden="true">&lt;/&gt;</span> 埋め込みコード';
  const btn = document.createElement('button');
  btn.id = 'embedBtn';
  btn.type = 'button';
  btn.innerHTML = LABEL;
  btn.title = 'このゲームを記事に貼るための iframe コードをコピーします';
  stage.appendChild(btn);

  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const text = snippet();
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      // clipboard API が使えない環境（http:// など）向けの保険
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* 何もできない */ }
      ta.remove();
    }
    btn.classList.add('done');
    btn.textContent = 'コピーしました';
    setTimeout(() => { btn.classList.remove('done'); btn.innerHTML = LABEL; }, 1800);
    console.log('[game-ad] 埋め込みコードをコピーしました\n' + text);
  });
})();
