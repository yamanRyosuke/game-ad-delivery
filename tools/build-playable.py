# -*- coding: utf-8 -*-
"""
各ゲームの iframe 配信版から、プレイアブル広告版（単体 HTML）を生成する。

なぜビルドが要るか:
  iframe 配信版は index.html / shared/*.js / assets/ に分かれている。
  一方プレイアブル広告は「外部への HTTP リクエスト禁止」なので、
  CSS も JS も画像も、全部 1枚の HTML に埋め込まないといけない。
  2つを手で維持すると必ず片方が腐るため、単体版は常にここから生成する。

  畳む処理そのものは tools/adbundle.py（ディスプレイ広告版と共通）。
  ここが持つのは「プレイアブル広告に固有の事情」だけ。

出力（playable/build/ 配下。GitHub Pages で配信するため commit する）:
  <id>.html            Meta 用の単体 HTML。掲載イメージのページもこれを読む
  <id>-playable.zip    TikTok 用（index.html + config.json）
  manifest.json        掲載イメージのページが読む、実測サイズの一覧

使い方:
  python tools/build-playable.py
"""
import json
import os
import re
import sys
import zipfile
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import adbundle  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'playable', 'build')

# メニュー（index.html）と同じ並び・同じ名前にしておく
GAMES = [
    ('suika', 'くだものおとし'),
    ('flappy', 'すきまくぐり'),
    ('runner', 'とびこえランナー'),
    ('campaign001', 'あの板、2人乗れた説'),
]

LIMIT_META_SINGLE_HTML = 2 * 1024 * 1024   # Meta: 単体 HTML は 2MB 未満
LIMIT_TIKTOK_ZIP = 5 * 1024 * 1024         # TikTok: zip 5MB 未満
LIMIT_META_ZIP_FILES = 100                 # Meta: zip 内 100 ファイルまで

# 仕様チェック。プレイアブル広告は外部リクエストが1件も許されない。
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
    # 閉じタグの欠けは、畳む処理を壊したときに真っ先に出る症状。
    # ブラウザが黙って復元してしまい気付きにくいので、ここで必ず止める。
    for tag in ('</body>', '</html>'):
        if tag not in html:
            problems.append('HTML の構造が壊れている（%s が無い）' % tag)
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
    adapter = adbundle.read(os.path.join(ROOT, 'playable', 'adapter.js'))
    shell_css = adbundle.read(os.path.join(ROOT, 'playable', 'shell.css'))
    # TikTok の config.json: 0=縦横両対応 / 1=縦のみ / 2=横のみ
    # Meta が縦向き必須なので、素材は縦に寄せて 1 で出す。
    config = json.dumps({'orientation': 1}, indent=2) + '\n'
    stamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    entries, failed = [], False
    for game_id, name in GAMES:
        note = ('<!--\n'
                '  プレイアブル広告版（単体 HTML）: ' + name + '\n'
                '  tools/build-playable.py が生成したもの。直接編集しないこと。\n'
                '  直すのは ' + game_id + '/ と shared/ と playable/ の側。\n'
                '  ビルド日時: ' + stamp + '\n'
                '-->')
        html, stats = adbundle.bundle(
            os.path.join(ROOT, game_id),
            head_extra=note,
            css_extra='/* ---- playable/shell.css ---- */\n' + shell_css,
            pre_scripts=[('playable/adapter.js', adapter)])

        adbundle.write(os.path.join(OUT_DIR, '%s.html' % game_id), html)

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

        e = {'id': game_id, 'name': name,
             'htmlBytes': html_bytes, 'zipBytes': zip_bytes,
             'metaLimitBytes': LIMIT_META_SINGLE_HTML,
             'tiktokLimitBytes': LIMIT_TIKTOK_ZIP,
             'problems': problems}
        e.update(stats)
        entries.append(e)

    adbundle.write(os.path.join(OUT_DIR, 'manifest.json'),
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
