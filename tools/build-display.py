# -*- coding: utf-8 -*-
"""
各ゲームの iframe 配信版から、HTML5 ディスプレイ広告版を生成する。

プレイアブル広告（TikTok / Meta）はアプリ広告の枠に限られるが、
ディスプレイ広告なら目的を選ばない。Web の LP へ誘導する案件でも使える。
そのぶん容量の制限は厳しく、Google Ads は zip 600KB・40ファイルまで。

畳む処理そのものは tools/adbundle.py（プレイアブル広告版と共通）。
ここが持つのは「ディスプレイ広告に固有の事情」だけ。

  ・<meta name="ad.size"> で広告サイズを宣言する
  ・clickTag 変数を素直な形で置く（難読化・圧縮するとアドサーバーが読めない）
  ・広告サイズごとに外枠を作る（枠が小さいので開始画面の文字も詰める）

出力（display/build/ 配下。GitHub Pages で配信するため commit する）:
  <id>-<W>x<H>.html   掲載イメージのページが読む
  <id>-<W>x<H>.zip    入稿するのはこれ
  manifest.json       掲載イメージのページが読む、実測サイズの一覧

使い方:
  python tools/build-display.py
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
OUT_DIR = os.path.join(ROOT, 'display', 'build')

GAMES = [
    ('suika', 'くだものおとし'),
    ('flappy', 'すきまくぐり'),
    ('runner', 'とびこえランナー'),
    ('campaign001', 'あの板、2人乗れた説'),
]

# 遊べる形にできるサイズだけを対象にする。
# 728x90 や 320x50 のような帯サイズは、正方形のゲームが入らない。
# 無理に押し込むより、そこは静止画のティザーにして LP へ送るのが正しい。
SIZES = [
    (300, 250, 'レクタングル', '最も配信量が多い定番サイズ'),
    (336, 280, 'ラージレクタングル', '記事内に置かれることが多い'),
    (250, 250, 'スクエア', '枠が狭いページ向け'),
    (300, 600, 'ハーフページ', '縦長。サイドバー向けで視認時間が長い'),
    (320, 480, 'モバイル全画面', 'インタースティシャル。実質フルスクリーン'),
]

LIMIT_ZIP = 600 * 1024   # Google Ads: zip 600KB 以下
LIMIT_FILES = 40         # Google Ads: zip 内 40 ファイルまで


def shell_css(w, h):
    """広告サイズごとの外枠。枠の実寸が小さいので、文字も一緒に詰める。"""
    portrait = (h / float(w)) >= 1.3
    base = min(w, h)
    if base < 260:
        f_h1, f_p, f_btn = 15, 10, 11
    elif base < 320:
        f_h1, f_p, f_btn = 17, 11, 12
    else:
        f_h1, f_p, f_btn = 19, 12, 13
    cta_h = 60 if h < 520 else 76

    css = ['/* ---- HTML5 ディスプレイ広告 %dx%d 用の外枠 ---- */' % (w, h),
           '/* 広告枠は %dx%d の固定サイズ。はみ出すとスクロールバーが出て審査に落ちる。 */' % (w, h),
           'html, body { width: %dpx; height: %dpx; overflow: hidden; }' % (w, h),
           '',
           '/* 枠が小さいぶん、開始画面の文字とボタンを詰める */',
           '#start .card { width: 94%; }',
           '#start h1 { font-size: %dpx; margin: 0 0 6px; }' % f_h1,
           '#start p  { font-size: %dpx; margin: 0 0 12px; line-height: 1.5; }' % f_p,
           '#start .btns { gap: 8px; }',
           'button, #btnCta { font-size: %dpx; padding: 8px 12px; }' % f_btn,
           '']

    if portrait:
        css += [
            '/* 縦長サイズ。canvas の下に CTA バーを置く場所がある。',
            '   終了前から場所を空けておくことで、CTA 出現時に画面が動かない。 */',
            'body { flex-direction: column; align-items: stretch; justify-content: flex-start; }',
            '#stage {',
            '  position: relative; flex: 1 1 auto;',
            '  display: flex; align-items: center; justify-content: center;',
            '  width: 100%%; min-height: 0; padding-bottom: %dpx;' % cta_h,
            '}',
            '#game { width: min(100vw, calc(100vh - %dpx)); height: min(100vw, calc(100vh - %dpx)); }'
            % (cta_h, cta_h),
            '#after {',
            '  height: %dpx; box-sizing: border-box;' % cta_h,
            '  padding: 0 10px; background: #0d1017; flex-wrap: nowrap; gap: 8px;',
            '}',
            '#btnCta { flex: 1 1 auto; max-width: 190px; text-align: center; }',
            '#btnReplay { flex: 0 0 auto; }',
        ]
    else:
        css += [
            '/* 横長〜正方形サイズ。canvas を短辺いっぱいに置き、CTA は下に重ねる。',
            '   下に余白を作れないので、shared/game.css の重ね表示のままでよい。 */',
            '#game { width: min(100vw, 100vh); height: min(100vw, 100vh); }',
            '#after { padding: 8px 8px 10px; gap: 8px; }',
        ]
    return '\n'.join(css) + '\n'


def head_extra(game_id, name, w, h, href, stamp):
    return (
        '<!--\n'
        '  HTML5 ディスプレイ広告版: ' + name + '（' + str(w) + 'x' + str(h) + '）\n'
        '  tools/build-display.py が生成したもの。直接編集しないこと。\n'
        '  直すのは ' + game_id + '/ と shared/ と display/ の側。\n'
        '  ビルド日時: ' + stamp + '\n'
        '-->\n'
        '<meta name="ad.size" content="width=' + str(w) + ',height=' + str(h) + '">\n'
        '<' + 'script>\n'
        '/* clickTag: アドサーバーが遷移先と計測用 URL を差し替えるための変数。\n'
        '   難読化・圧縮してはいけない（アドサーバーが読めなくなる）。\n'
        '   ここに書いてある URL は、差し替えられなかったときの保険。 */\n'
        'var clickTag = "' + href + '";\n'
        '</' + 'script>'
    )


def check(html, zip_bytes, zip_files, w, h):
    problems = []
    # 閉じタグの欠けは、畳む処理を壊したときに真っ先に出る症状。
    # ブラウザが黙って復元してしまい気付きにくいので、ここで必ず止める。
    for tag in ('</body>', '</html>'):
        if tag not in html:
            problems.append('HTML の構造が壊れている（%s が無い）' % tag)
    if zip_bytes > LIMIT_ZIP:
        problems.append('zip が 600KB を超えている')
    if zip_files > LIMIT_FILES:
        problems.append('zip 内のファイルが 40 を超えている')
    if 'name="ad.size" content="width=%d,height=%d"' % (w, h) not in html:
        problems.append('ad.size メタタグが無い、または寸法が合っていない')
    if not re.search(r'^var clickTag = "[^"]+";$', html, flags=re.M):
        problems.append('clickTag が素直な形で宣言されていない')
    if 'window.open(' not in html:
        problems.append('clickTag を開く処理が無い')
    if 'document.write' in html:
        problems.append('document.write を使っている')
    # <a href="http..."> が残っていると、アドサーバーを通さない直リンクになる
    if re.search(r'<a\s[^>]*href="https?://', html, flags=re.I):
        problems.append('遷移先を直リンクしている（clickTag を通していない）')
    return problems


def main():
    adapter = adbundle.read(os.path.join(ROOT, 'display', 'adapter.js'))
    stamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    entries, failed = [], False
    for game_id, name in GAMES:
        for w, h, size_name, size_note in SIZES:
            # href（遷移先）は各ゲームの index.html が持っているものを使う。
            # 一度 bundle して取り出し、それを clickTag に載せてもう一度畳む。
            _, stats = adbundle.bundle(os.path.join(ROOT, game_id))
            href = stats['href']

            html, stats = adbundle.bundle(
                os.path.join(ROOT, game_id),
                head_extra=head_extra(game_id, name, w, h, href, stamp),
                css_extra=shell_css(w, h),
                pre_scripts=[('display/adapter.js', adapter)])

            slug = '%s-%dx%d' % (game_id, w, h)
            adbundle.write(os.path.join(OUT_DIR, slug + '.html'), html)

            zip_path = os.path.join(OUT_DIR, slug + '.zip')
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
                # 第1階層に index.html を置く
                z.writestr('index.html', html)
                zip_files = len(z.namelist())

            zip_bytes = os.path.getsize(zip_path)
            problems = check(html, zip_bytes, zip_files, w, h)
            if problems:
                failed = True

            entries.append({
                'slug': slug, 'game': game_id, 'gameName': name,
                'w': w, 'h': h, 'sizeName': size_name, 'sizeNote': size_note,
                'htmlBytes': len(html.encode('utf-8')), 'zipBytes': zip_bytes,
                'zipLimitBytes': LIMIT_ZIP, 'files': zip_files, 'fileLimit': LIMIT_FILES,
                'clickTag': href, 'problems': problems,
            })

    adbundle.write(os.path.join(OUT_DIR, 'manifest.json'), json.dumps({
        'builtAt': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'games': [{'id': g, 'name': n} for g, n in GAMES],
        'sizes': [{'w': w, 'h': h, 'name': sn, 'note': nt} for w, h, sn, nt in SIZES],
        'creatives': entries,
    }, ensure_ascii=False, indent=2) + '\n')

    print('')
    print('%-24s %-12s %10s %10s %7s' % ('slug', 'サイズ', 'HTML', 'zip', '判定'))
    print('-' * 70)
    for e in entries:
        print('%-24s %-12s %7.1f KB %7.1f KB %7s' % (
            e['slug'], '%dx%d' % (e['w'], e['h']),
            e['htmlBytes'] / 1024.0, e['zipBytes'] / 1024.0,
            'NG' if e['problems'] else 'OK'))
    worst = max(e['zipBytes'] for e in entries)
    print('')
    print('上限: zip %d KB / %d ファイル（Google Ads）' % (LIMIT_ZIP / 1024, LIMIT_FILES))
    print('最大でも %.1f KB。上限の %.1f%% しか使っていない。'
          % (worst / 1024.0, worst * 100.0 / LIMIT_ZIP))
    for e in entries:
        for p in e['problems']:
            print('  NG  %s: %s' % (e['slug'], p))
    print('')
    if failed:
        print('NG があります。入稿しないこと。')
        sys.exit(1)
    print('すべて通過。%d 本の素材を生成した。' % len(entries))


if __name__ == '__main__':
    main()
