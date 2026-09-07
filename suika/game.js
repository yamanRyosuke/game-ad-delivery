/*
 * くだものおとし — 同じくだもの同士をくっつけて大きくしていく
 *
 * 配信まわり（postMessage / CTA / 埋め込みコード）は ../shared/ad-sdk.js が持つ。
 *
 * 物理は「位置ベースの簡易ソルバ」。重力で動かしたあと、壁とくだもの同士の
 * めり込みを数回に分けて押し戻す。厳密ではないが、この遊びには十分で軽い。
 */
(() => {
  'use strict';

  const W = 720, H = 720;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  // ---- 箱の寸法 -----------------------------------------------------------
  const LEFT = 116, RIGHT = 604, FLOOR = 682;
  const DEAD_Y = 176;          // この線を越えたまま止まると終わり
  const SPAWN_Y = 96;

  // ---- 物理 ---------------------------------------------------------------
  const GRAVITY   = 2000;
  const SUBSTEPS  = 2;
  const ITER      = 4;
  const REST      = 0.12;      // 反発。小さいほど「ぬちゃっ」と積む
  const FRICTION  = 0.986;
  const DROP_WAIT = 0.42;      // 連打で降らせすぎないための間隔
  const OVER_HOLD = 1.15;      // 線を越えたまま何秒で終わりにするか

  // ---- くだもの -----------------------------------------------------------
  const R    = [17, 23, 30, 38, 47, 57, 68, 80, 94];
  const COL  = ['#e8544a', '#f2857a', '#a874dc', '#f0913c', '#f5c542',
                '#e2604f', '#eae2b7', '#8ec96a', '#4da84a'];
  const NAME = ['さくらんぼ', 'いちご', 'ぶどう', 'みかん', 'かき',
                'りんご', 'なし', 'もも', 'すいか'];
  const MAXLV = R.length - 1;
  const DROPPABLE = 5;         // 落ちてくるのは小さい5種類まで

  // ---- 状態 ---------------------------------------------------------------
  let mode = 'idle';           // idle | play | over
  let raf = 0, lastT = 0;
  let fruits, nextLv, curLv, aimX, dropCool, score, best = 0, overT, popped;
  let seq = 0;

  function reset() {
    fruits = [];
    curLv = (Math.random() * DROPPABLE) | 0;
    nextLv = (Math.random() * DROPPABLE) | 0;
    aimX = (LEFT + RIGHT) / 2;
    dropCool = 0; score = 0; overT = 0; popped = 0;
  }

  function addFruit(x, y, lv, vx, vy) {
    fruits.push({ x: x, y: y, vx: vx || 0, vy: vy || 0, lv: lv,
                  r: R[lv], age: 0, id: seq++ });
  }

  // ---- 入力 ---------------------------------------------------------------
  function toCanvasX(clientX) {
    const b = canvas.getBoundingClientRect();
    if (!b.width) return aimX;
    return (clientX - b.left) * (W / b.width);
  }

  function clampAim(x) {
    const r = R[curLv];
    return Math.max(LEFT + r + 2, Math.min(RIGHT - r - 2, x));
  }

  function drop() {
    if (mode !== 'play' || dropCool > 0) return;
    addFruit(clampAim(aimX), SPAWN_Y, curLv, 0, 60);
    curLv = nextLv;
    nextLv = (Math.random() * DROPPABLE) | 0;
    dropCool = DROP_WAIT;
    SFX.tone(300, 0.07, 'sine', 0.08, 200);
  }

  canvas.addEventListener('pointermove', (e) => {
    if (mode !== 'play') return;
    aimX = toCanvasX(e.clientX);
  });
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    AdSDK.interaction(e.pointerType === 'touch' ? 'touch' : 'pointer');
    aimX = toCanvasX(e.clientX);
    drop();
  });
  window.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft')  { aimX -= 26; e.preventDefault(); }
    if (e.key === 'ArrowRight') { aimX += 26; e.preventDefault(); }
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
      e.preventDefault();
      AdSDK.interaction('keyboard');
      drop();
    }
  });

  // ---- 物理 ---------------------------------------------------------------
  function merge(a, b) {
    const lv = a.lv + 1;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    a.dead = true; b.dead = true;
    score += (a.lv + 1) * 10;

    if (a.lv >= MAXLV) {
      // いちばん大きいもの同士は、消えて大きな得点になる
      popped++;
      score += 200;
      SFX.tone(660, 0.20, 'sine', 0.16);
      SFX.tone(990, 0.26, 'sine', 0.13, null, 0.09);
      SFX.noise(0.32, 2200, 400, 0.10);
      return;
    }
    addFruit(mx, my, lv, (b.x - a.x) * 0.4, -60);
    SFX.tone(300 + lv * 62, 0.13, 'sine', 0.13, 420 + lv * 70);
  }

  function step(dt) {
    for (const f of fruits) {
      f.age += dt;
      f.vy += GRAVITY * dt;
      f.vx *= FRICTION;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }

    for (let it = 0; it < ITER; it++) {
      // 壁と床
      for (const f of fruits) {
        if (f.x - f.r < LEFT)  { f.x = LEFT + f.r;  if (f.vx < 0) f.vx = -f.vx * REST; }
        if (f.x + f.r > RIGHT) { f.x = RIGHT - f.r; if (f.vx > 0) f.vx = -f.vx * REST; }
        if (f.y + f.r > FLOOR) {
          f.y = FLOOR - f.r;
          if (f.vy > 0) f.vy = -f.vy * REST;
          f.vx *= 0.9;
        }
      }
      // くだもの同士
      for (let i = 0; i < fruits.length; i++) {
        const a = fruits[i];
        if (a.dead) continue;
        for (let j = i + 1; j < fruits.length; j++) {
          const b = fruits[j];
          if (b.dead) continue;
          let dx = b.x - a.x, dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          const min = a.r + b.r;
          if (d >= min) continue;
          if (d < 0.0001) { dx = 0; dy = -1; d = 0.0001; }

          if (a.lv === b.lv) { merge(a, b); continue; }

          const nx = dx / d, ny = dy / d;
          const overlap = min - d;
          // 質量は面積で近似する。大きいものほど動かない。
          const ma = a.r * a.r, mb = b.r * b.r, tot = ma + mb;
          a.x -= nx * overlap * (mb / tot);
          a.y -= ny * overlap * (mb / tot);
          b.x += nx * overlap * (ma / tot);
          b.y += ny * overlap * (ma / tot);

          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            const imp = -(1 + REST) * rel / tot;
            a.vx -= imp * nx * mb; a.vy -= imp * ny * mb;
            b.vx += imp * nx * ma; b.vy += imp * ny * ma;
          }
        }
      }
    }

    if (fruits.some((f) => f.dead)) fruits = fruits.filter((f) => !f.dead);
  }

  function checkOver(dt) {
    // 「線を越えている」かつ「ほぼ止まっている」かつ「落ちたばかりではない」
    const bad = fruits.some((f) =>
      f.age > 0.7 && f.y - f.r < DEAD_Y && Math.abs(f.vy) < 34);
    overT = bad ? overT + dt : 0;
    if (overT >= OVER_HOLD) gameOver();
  }

  function gameOver() {
    if (mode !== 'play') return;
    mode = 'over';
    if (score > best) best = score;
    SFX.tone(260, 0.2, 'square', 0.12, 90);
    SFX.noise(0.4, 700, 130, 0.12, 0.05);
    document.body.dataset.state = 'done';
    document.getElementById('after').hidden = false;
    const biggest = fruits.reduce((m, f) => Math.max(m, f.lv), -1);
    AdSDK.complete({
      score: score, best: best,
      biggest: biggest >= 0 ? NAME[biggest] : '-',
      popped: popped,
    });
  }

  function update(dt) {
    if (mode !== 'play') return;
    if (dropCool > 0) dropCool = Math.max(0, dropCool - dt);
    const h = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) step(h);
    checkOver(dt);
  }

  // ---- 描画 ---------------------------------------------------------------
  function drawFruit(x, y, r, lv, alpha) {
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.fillStyle = COL[lv];
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    // 内側の明るい面と縁で、ぺたっとしないようにする
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.arc(x - r * 0.28, y - r * 0.3, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.beginPath(); ctx.arc(x, y, r - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.fillStyle = '#161c27';
    ctx.fillRect(0, 0, W, H);

    // 箱
    ctx.fillStyle = '#0e131c';
    ctx.fillRect(LEFT, DEAD_Y - 40, RIGHT - LEFT, FLOOR - DEAD_Y + 40);
    ctx.strokeStyle = '#46586f';
    ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(LEFT, DEAD_Y - 40); ctx.lineTo(LEFT, FLOOR);
    ctx.lineTo(RIGHT, FLOOR); ctx.lineTo(RIGHT, DEAD_Y - 40);
    ctx.stroke();

    // 危険ライン
    const warn = overT > 0;
    ctx.strokeStyle = warn ? 'rgba(240,110,90,' + (0.5 + 0.45 * Math.sin(performance.now() / 90)).toFixed(2) + ')'
                           : 'rgba(240,110,90,0.34)';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 10]);
    ctx.beginPath(); ctx.moveTo(LEFT, DEAD_Y); ctx.lineTo(RIGHT, DEAD_Y); ctx.stroke();
    ctx.setLineDash([]);

    for (const f of fruits) drawFruit(f.x, f.y, f.r, f.lv);

    if (mode === 'play') {
      const ax = clampAim(aimX);
      // 落とす位置のガイド
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 9]);
      ctx.beginPath(); ctx.moveTo(ax, SPAWN_Y + R[curLv]); ctx.lineTo(ax, FLOOR); ctx.stroke();
      ctx.setLineDash([]);
      drawFruit(ax, SPAWN_Y, R[curLv], curLv, dropCool > 0 ? 0.3 : 1);
    }

    // 次のくだもの
    ctx.fillStyle = '#8695aa';
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('つぎ', 24, 40);
    drawFruit(78 + R[nextLv], 40, R[nextLv] * 0.62, nextLv);

    // スコア
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = '800 40px system-ui, sans-serif';
    ctx.fillText(String(score), W - 24, 42);

    if (mode === 'over') {
      ctx.fillStyle = 'rgba(13,16,23,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = '800 50px system-ui, sans-serif';
      ctx.fillText(score + ' てん', W / 2, H / 2 - 14);
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.fillStyle = '#b9c6d6';
      ctx.fillText('最高 ' + best + ' てん', W / 2, H / 2 + 26);
    }
  }

  // ---- ループ -------------------------------------------------------------
  function frame(now) {
    const dt = Math.min(0.04, Math.max(0.001, (now - lastT) / 1000));
    lastT = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function startGame() {
    reset();
    mode = 'play';
    document.body.dataset.state = 'playing';
    lastT = performance.now();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
    AdSDK.start({});
  }

  // ---- 画面まわり ---------------------------------------------------------
  const startScreen = document.getElementById('start');
  const afterBar = document.getElementById('after');
  startScreen.hidden = false;

  document.getElementById('btnPlay').addEventListener('click', () => {
    AdSDK.interaction('start_button');
    SFX.unlock();                 // 音の初期化はここだけ = 必ずユーザー操作の後
    startScreen.hidden = true;
    afterBar.hidden = true;
    startGame();
  });
  document.getElementById('btnReplay').addEventListener('click', () => {
    afterBar.hidden = true;
    startGame();
  });

  reset();
  draw();

  AdSDK.init({ campaign: 'suika', title: 'ゲーム広告：くだものおとし' });
})();
