/*
 * page.js — 説明ページ共通の「コピー」ボタン
 *
 * .codebox の中の <pre> の中身を、同じ .codebox の中のボタンでコピーする。
 */
(() => {
  'use strict';

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (e) { /* 下の保険へ */ }
    // clipboard API が使えない環境（http:// など）向け
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e2) { /* 何もできない */ }
    ta.remove();
  }

  function flash(btn, label) {
    const before = btn.textContent;
    btn.textContent = label || 'コピーしました';
    btn.classList.add('done');
    setTimeout(() => { btn.textContent = before; btn.classList.remove('done'); }, 1800);
  }

  document.querySelectorAll('.codebox__copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pre = btn.parentElement.querySelector('pre');
      if (!pre) return;
      await copy(pre.textContent);
      flash(btn);
    });
  });

  window.PageCopy = { copy: copy, flash: flash };
})();
