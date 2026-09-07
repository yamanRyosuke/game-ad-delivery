# -*- coding: utf-8 -*-
"""
adbundle.py — ゲーム1本を「単体 HTML」に畳む共通処理

プレイアブル広告版（tools/build-playable.py）と
HTML5 ディスプレイ広告版（tools/build-display.py）は、
入稿要件も外枠も違うが、「index.html + shared/*.js + assets/ を
1枚に畳む」という中身は同じ。その部分だけをここに集めた。

呼ぶ側が指定するのは外側の事情だけ:
  head_extra   … <head> の直後に入れるもの（ad.size メタ、clickTag など）
  css_extra    … 既存 CSS の後ろに足す外枠（縦向き・広告サイズごとの調整）
  pre_scripts  … ゲーム本体より前に走らせる JS（CTA アダプタなど）
"""
import base64
import io
import os
import re
import sys

MIME = {
    '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
}

# 単体版には入れないもの。埋め込みコードのコピーボタンは掲載メニュー専用で、
# 広告の中では意味がないどころか、審査で不要物と見なされる。
DEFAULT_EXCLUDE = ('embed-button.js',)

S_OPEN = '<script>'
S_CLOSE = '</' + 'script>'


def read(path):
    with io.open(path, encoding='utf-8') as f:
        return f.read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def data_uri(path):
    ext = os.path.splitext(path)[1].lower()
    if ext not in MIME:
        sys.exit('未知の拡張子: %s（MIME を tools/adbundle.py に足すこと）' % ext)
    with open(path, 'rb') as f:
        raw = f.read()
    return 'data:%s;base64,%s' % (MIME[ext], base64.b64encode(raw).decode('ascii')), len(raw)


def bundle(game_dir, head_extra='', css_extra='', pre_scripts=(), exclude=DEFAULT_EXCLUDE):
    """ゲーム1本を単体 HTML に畳んで返す。戻り値は (html, stats)。"""
    game_id = os.path.basename(game_dir.rstrip('/\\'))
    html = read(os.path.join(game_dir, 'index.html'))

    # 1. HTML コメントを落とす。
    #    配信版には埋め込みコードの例（外部URL入りの src 属性）がコメントで
    #    書いてあり、残すと「外部リクエストあり」と誤検出される。
    html = re.sub(r'<!--.*?-->', '', html, flags=re.S)

    # 2. 外部 CSS をインライン化
    def inline_css(m):
        href = m.group(1)
        css = read(os.path.normpath(os.path.join(game_dir, href)))
        return '<style>\n/* ---- %s ---- */\n%s</style>' % (href, css)

    html, n_css = re.subn(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>', inline_css, html)

    # 3. 外枠 CSS を既存 CSS の後ろへ足す（後勝ちで上書きさせる）
    if '</head>' not in html:
        sys.exit('%s: </head> が無い' % game_id)
    if css_extra:
        html = html.replace('</head>', '<style>\n' + css_extra + '</style>\n</head>', 1)

    # 4. zip ダウンロードのリンクがあれば外す（外部ファイルを指すため単体版では成立しない）
    html = re.sub(r'\n\s*<a id="btnZip".*?</a>', '', html, flags=re.S)

    # 5. CTA を <a> から <button> へ。
    #    広告の中ではリンク遷移も JS リダイレクトも許されない（プレイアブル）か、
    #    clickTag 経由で開く必要がある（ディスプレイ）。どちらも <a href> ではない。
    m = re.search(r'<a id="btnCta"[^>]*?href="([^"]*)"[^>]*>(.*?)</a>', html, flags=re.S)
    if not m:
        sys.exit('%s: CTA（<a id="btnCta">）が見つからない' % game_id)
    href = m.group(1)
    html = (html[:m.start()] +
            '<button id="btnCta" data-href="%s">%s</button>' % (href, m.group(2).strip()) +
            html[m.end():])

    # 6. 外部 JS をインライン化（除外対象は落とす）
    srcs = re.findall(r'<script\s+src="([^"]+)"\s*>\s*' + S_CLOSE, html)
    js_parts = [(s, read(os.path.normpath(os.path.join(game_dir, s))))
                for s in srcs if not any(s.endswith(x) for x in exclude)]

    all_js = '\n'.join(t for _, t in js_parts)
    if S_CLOSE in all_js:
        sys.exit('%s: JS に閉じ script タグが含まれている。インライン化できない。' % game_id)

    # 7. JS が参照している assets/ の実ファイルを data URI にする
    assets, asset_bytes = {}, 0
    for rel in sorted(set(re.findall(r'\./assets/[A-Za-z0-9_.\-]+', all_js))):
        full = os.path.normpath(os.path.join(game_dir, rel))
        if not os.path.isfile(full):
            continue
        uri, size = data_uri(full)
        assets[rel] = uri
        asset_bytes += size

    parts = []
    for label, text in pre_scripts:
        parts.append(S_OPEN + '\n/* ---- ' + label + ' ---- */\n' + text + S_CLOSE)
    if assets:
        import json
        parts.append(S_OPEN + '\n/* ---- インライン化したアセット ---- */\n'
                     + 'window.__INLINE_ASSETS__ = ' + json.dumps(assets, ensure_ascii=False)
                     + ';\n' + S_CLOSE)
    for src, text in js_parts:
        parts.append(S_OPEN + '\n/* ---- ' + src + ' ---- */\n' + text + S_CLOSE)
    blob = '\n'.join(parts) + '\n'

    # 最初の <script src> を畳んだ中身に置き換え、残りは消す。
    # 「位置を先に控えておいて、あとで splice する」という書き方をしてはいけない。
    # 削除で文字列の長さが変わり、控えた位置が後続の文字に食い込む
    # （実際に </body> の < を1文字持っていかれる不具合を出した）。
    state = {'done': False}

    def swap(m):
        if state['done']:
            return ''
        state['done'] = True
        return '\n' + blob

    html, n_scripts = re.subn(r'\s*<script\s+src="[^"]+"\s*>\s*' + S_CLOSE, swap, html)
    if not state['done']:
        sys.exit('%s: <script src> が1つも無い' % game_id)

    # 8. <head> の直後に入稿要件のものを差し込む
    if head_extra:
        html = html.replace('<head>', '<head>\n' + head_extra, 1)

    return html, {
        'href': href,
        'inlinedCss': n_css,
        'inlinedJs': len(js_parts),
        'inlinedAssets': len(assets),
        'assetBytes': asset_bytes,
    }
