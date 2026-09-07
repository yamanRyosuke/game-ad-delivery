# -*- coding: utf-8 -*-
"""
各ゲームの iframe 配信版から、プレイアブル広告版（単体 HTML）を生成する。

なぜビルドが要るか:
  iframe 配信版は index.html / shared/*.js / assets/ に分かれている。
  一方プレイアブル広告は「外部への HTTP リクエスト禁止」なので、
  CSS も JS も画像も、全部 1枚の HTML に埋め込まないといけない。
  2つを手で維持すると必ず片方が腐るため、単体版は常にここから生成する。

出力（playable/build/ 配下。GitHub Pages で配信するため commit する）:
  <id>.html            Meta 用の単体 HTML。掲載イメージのページもこれを読む
  <id>-playable.zip    TikTok 用（index.html + config.json）
  manifest.json        掲載イメージのページが読む、実測サイズの一覧

使い方:
  python tools/build-playable.py
"""
import base64
import io
import json
import os
import re
import sys
import zipfile
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'playable', 'build')

# メニュー（index.html）と同じ並び・同じ名前にしておく
GAMES = [
    ('suika', 'くだものおとし'),
    ('flappy', 'すきまくぐり'),
    ('runner', 'とびこえランナー'),
    ('campaign001', 'あの板、2人乗れた説'),
]

# 各社の上限。出どころは playable/index.html に出典リンクを載せてある。
LIMIT_META_SINGLE_HTML = 2 * 1024 * 1024   # Meta: 単体 HTML は 2MB 未満
LIMIT_TIKTOK_ZIP = 5 * 1024 * 1024         # TikTok: zip 5MB 未満
LIMIT_META_ZIP_FILES = 100                 # Meta: zip 内 100 ファイルまで

# 単体版には入れないもの。埋め込みコードのコピーボタンは掲載メニュー専用で、
# 広告ネットワークの中では意味がないどころか、審査で不要物と見なされる。
EXCLUDE_SCRIPTS = ('embed-button.js',)

MIME = {
    '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
}

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
        sys.exit('未知の拡張子: %s（MIME を tools/build-playable.py に足すこと）' % ext)
    with open(path, 'rb') as f:
        raw = f.read()
    return 'data:%s;base64,%s' % (MIME[ext], base64.b64encode(raw).decode('ascii')), len(raw)


def build_one(game_id, name, adapter, shell_css):
    game_dir = os.path.join(ROOT, game_id)
    html = read(os.path.join(game_dir, 'index.html'))

    # 1. HTML コメントを落とす。
    #    配信版には埋め込みコードの例（外部URL入りの src 属性）が
    #    コメントで書いてあり、残すと「外部リクエストあり」と誤検出される。
    html = re.sub(r'<!--.*?-->', '', html, flags=re.S)

    # 2. 外部 CSS をインライン化
    def inline_css(m):
        href = m.group(1)
        css = read(os.path.normpath(os.path.join(game_dir, href)))
        return '<style>\n/* ---- %s ---- */\n%s</style>' % (href, css)

    html, n_css = re.subn(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>', inline_css, html)

    # 3. 縦向き用の外枠 CSS を足す（既存の CSS より後ろに置いて上書きする）
    if '</head>' not in html:
        sys.exit('%s: </head> が無い' % game_id)
    html = html.replace(
        '</head>',
        '<style>\n/* ---- playable/shell.css ---- */\n' + shell_css + '</style>\n</head>', 1)

    # 4. zip ダウンロードのリンクがあれば外す（外部ファイルを指すため単体版では成立しない）
    html = re.sub(r'\n\s*<a id="btnZip".*?</a>', '', html, flags=re.S)

    # 5. CTA を <a> から <button> へ。
    #    ネットワークの中ではリンク遷移も JS リダイレクトも禁止されているため、
    #    遷移させず playable/adapter.js 経由でネットワークの API を呼ぶ形にする。
    m = re.search(r'<a id="btnCta"[^>]*?href="([^"]*)"[^>]*>(.*?)</a>', html, flags=re.S)
    if not m:
        sys.exit('%s: CTA（<a id="btnCta">）が見つからない' % game_id)
    html = (html[:m.start()] +
            '<button id="btnCta" data-href="%s">%s</button>' % (m.group(1), m.group(2).strip()) +
            html[m.end():])

    # 6. 外部 JS をインライン化（除外対象は落とす）
    scripts = re.findall(r'<script\s+src="([^"]+)"\s*>\s*</' + 'script>', html)
    js_parts = []
    for src in scripts:
        if any(src.endswith(x) for x in EXCLUDE_SCRIPTS):
            continue
        js_parts.append((src, read(os.path.normpath(os.path.join(game_dir, src)))))

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

    bundle = S_OPEN + '\n/* ---- playable/adapter.js ---- */\n' + adapter + S_CLOSE + '\n'
    if assets:
        bundle += (S_OPEN + '\n/* ---- インライン化したアセット（外部リクエスト禁止のため） ---- */\n'
                   + 'window.__INLINE_ASSETS__ = ' + json.dumps(assets, ensure_ascii=False)
                   + ';\n' + S_CLOSE + '\n')
    for src, text in js_parts:
        bundle += S_OPEN + '\n/* ---- ' + src + ' ---- */\n' + text + S_CLOSE + '\n'

    # 元の <script src> をまとめて1箇所へ置き換える
    first = re.search(r'<script\s+src="[^"]+"\s*>\s*</' + 'script>', html)
    html = re.sub(r'\s*<script\s+src="[^"]+"\s*>\s*</' + 'script>', '', html)
    html = html[:first.start()] + '\n' + bundle + html[first.start():]

    # 8. 生成物であることを先頭に明記する
    note = ('<!--\n'
            '  プレイアブル広告版（単体 HTML）: ' + name + '\n'
            '  tools/build-playable.py が生成したもの。直接編集しないこと。\n'
            '  直すのは ' + game_id + '/ と shared/ と playable/ の側。\n'
            '  ビルド日時: ' + datetime.now().strftime('%Y-%m-%d %H:%M:%S') + '\n'
            '-->\n')
    html = html.replace('<head>', '<head>\n' + note, 1)

    return html, n_css, len(js_parts), assets, asset_bytes


# --------------------------------------------------------------------------
# 仕様チェック。ここを通らないものは提出しない。
# --------------------------------------------------------------------------
NG_PATTERNS = [
    # data-href のような別属性を拾わないよう、属性名の先頭で区切る
    (r'(?<![\w-])(?:src|href)\s*=\s*["\']https?://', '外部URLの src/href'),
    (r'url\(\s*["\']?https?://', 'CSS から外部URL'),
    (r'<script[^>]+\bsrc\s*=', '外部 JS の読み込み'),
    (r'<link\b', 'link タグ'),
    (r'\bfetch\s*\(', 'fetch()'),
    (r'\bXMLHttpRequest\b', 'XMLHttpRequest'),
    (r'\bnavigator\.sendBeacon\b', 'sendBeacon'),
    (r'\bnew\s+WebSocket\b', 'WebSocket'),
    (r'\bimportScripts\s*\(', 'importScripts()'),
    (r'\bmraid\.js\b', 'mraid.js'),
    (r'\blocation\s*\.\s*(?:href|replace|assign)\s*[=(]', 'JS リダイレクト'),
]


def check(html, html_bytes, zip_bytes, zip_files):
    problems = []
    if html_bytes >= LIMIT_META_SINGLE_HTML:
        problems.append('Meta の単体 HTML 2MB 超過')
    if zip_bytes >= LIMIT_TIKTOK_ZIP:
        problems.append('TikTok の zip 5MB 超過')
    if zip_files > LIMIT_META_ZIP_FILES:
        problems.append('zip 内のファイルが 100 を超えている')
    for pat, label in NG_PATTERNS:
        if re.search(pat, html, flags=re.I):
            problems.append('外部リクエスト禁止に抵触: ' + label)
    for api, label in (('FbPlayableAd.onCTAClick()', 'Meta'),
                       ('openAppStore()', 'TikTok'),
                       ('mraid.open(', 'MRAID')):
        if api not in html:
            problems.append('%s の CTA API が実装されていない' % label)
    return problems


def main():
    adapter = read(os.path.join(ROOT, 'playable', 'adapter.js'))
    shell_css = read(os.path.join(ROOT, 'playable', 'shell.css'))
    # TikTok の config.json: 0=縦横両対応 / 1=縦のみ / 2=横のみ
    # Meta が縦向き必須なので、素材は縦に寄せて 1 で出す。
    config = json.dumps({'orientation': 1}, indent=2) + '\n'

    entries, failed = [], False
    for game_id, name in GAMES:
        html, n_css, n_js, assets, asset_bytes = build_one(game_id, name, adapter, shell_css)

        html_path = os.path.join(OUT_DIR, '%s.html' % game_id)
        write(html_path, html)

        zip_path = os.path.join(OUT_DIR, '%s-playable.zip' % game_id)
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
            # 第1階層に index.html と config.json を置く（TikTok の要件）
            z.writestr('index.html', html)
            z.writestr('config.json', config)
            zip_files = len(z.namelist())

        html_bytes = len(html.encode('utf-8'))
        zip_bytes = os.path.getsize(zip_path)
        problems = check(html, html_bytes, zip_bytes, zip_files)
        if problems:
            failed = True

        entries.append({
            'id': game_id, 'name': name,
            'htmlBytes': html_bytes, 'zipBytes': zip_bytes,
            'metaLimitBytes': LIMIT_META_SINGLE_HTML, 'tiktokLimitBytes': LIMIT_TIKTOK_ZIP,
            'inlinedCss': n_css, 'inlinedJs': n_js,
            'inlinedAssets': len(assets), 'assetBytes': asset_bytes,
            'problems': problems,
        })

    write(os.path.join(OUT_DIR, 'manifest.json'),
          json.dumps({'builtAt': datetime.now().strftime('%Y-%m-%d %H:%M'),
                      'games': entries}, ensure_ascii=False, indent=2) + '\n')

    print('')
    print('%-14s %-18s %10s %10s %8s' % ('id', '名前', '単体HTML', 'zip', '判定'))
    print('-' * 66)
    for e in entries:
        print('%-14s %-18s %8.1f KB %8.1f KB %8s' % (
            e['id'], e['name'], e['htmlBytes'] / 1024.0, e['zipBytes'] / 1024.0,
            'NG' if e['problems'] else 'OK'))
    print('')
    print('上限: 単体HTML %d KB（Meta） / zip %d KB（TikTok）'
          % (LIMIT_META_SINGLE_HTML / 1024, LIMIT_TIKTOK_ZIP / 1024))
    for e in entries:
        for p in e['problems']:
            print('  NG  %s: %s' % (e['id'], p))
    print('')
    if failed:
        print('NG があります。提出しないこと。')
        sys.exit(1)
    print('すべて通過。Meta の Playable Preview Tool にアップして最終確認すること。')


if __name__ == '__main__':
    main()
