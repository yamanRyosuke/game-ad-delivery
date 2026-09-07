/*
 * すきまくぐり — タップで飛んで柱のすきまを抜ける
 *
 * 配信まわり（postMessage / CTA / 埋め込みコード）は ../shared/ad-sdk.js が持つ。
 * このファイルはゲームの中身だけ。
 */
(() => {
  'use strict';

  const W = 720, H = 720;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  // ---- パラメータ ---------------------------------------------------------
  const GROUND_Y = 636;
  const BIRD_X   = 224;
  const BIRD_R   = 22;
  const GRAVITY  = 1560;
  const FLAP_V   = -470;
  const PIPE_W   = 98;
  const GAP      = 214;
  const SPEED    = 236;
  const SPAWN_S  = 1.42;
  const MARGIN   = 96;   // 柱のすきまが画面端に寄りすぎないように

  const SKY_TOP = '#1d3f68', SKY_BOT = '#3d7fae';
  const PIPE_A  = '#5aa64f', PIPE_B  = '#3f7d38';
  const GROUND  = '#c8a86a', GROUND_D = '#a5854c';

  // ---- 状態 ---------------------------------------------------------------
  let mode = 'idle';        // idle | play | over
  let raf = 0, lastT = 0;
  let birdY, birdV, wing, dead;
  let pipes, spawnT, scroll, score, best = 0;
  let clouds = [];

  function reset() {
    birdY = 300; birdV = 0; wing = 0; dead = 0;
    pipes = []; spawnT = 0.45; scroll = 0; score = 0;
    clouds = [];
    for (let i = 0; i < 5; i++) {
      clouds.push({ x: Math.random() * W, y: 70 + Math.random() * 220,
                    s: 26 + Math.random() * 30, v: 8 + Math.random() * 14 });
    }
  }

  // ---- 入力 ---------------------------------------------------------------
  function flap() {
    if (mode !== 'play') return;
    birdV = FLAP_V;
    wing = 1;
    SFX.tone(560, 0.09, 'square', 0.10, 760);
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    AdSDK.interaction(e.pointerType === 'touch' ? 'touch' : 'pointer');
    flap();
  });
  window.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
      e.preventDefault();
      AdSDK.interaction('keyboard');
      flap();
    }
  });

  // ---- 更新 ---------------------------------------------------------------
  function spawnPipe() {
    const gapY = MARGIN + GAP / 2 + Math.random() * (GROUND_Y - GAP - MARGIN * 2);
    pipes.push({ x: W + PIPE_W, gapY: gapY, passed: false });
  }

  function hitPipe(p) {
    // 円と矩形のあたり判定。上下2本ぶん見る。
    const nx = Math.max(p.x, Math.min(BIRD_X, p.x + PIPE_W));
    if (Math.abs(nx - BIRD_X) > BIRD_R) return false;
    const top = p.gapY - GAP / 2, bot = p.gapY + GAP / 2;
    const nyTop = Math.min(top, Math.max(0, birdY));
    const nyBot = Math.max(bot, Math.min(GROUND_Y, birdY));
    const dTop = Math.hypot(nx - BIRD_X, nyTop - birdY);
    const dBot = Math.hypot(nx - BIRD_X, nyBot - birdY);
    return dTop < BIRD_R || dBot < BIRD_R;
  }

  function gameOver() {
    if (mode !== 'play') return;
    mode = 'over';
    if (score > best) best = score;
    SFX.tone(300, 0.16, 'square', 0.14, 120);
    SFX.noise(0.34, 900, 160, 0.14, 0.05);
    document.body.dataset.state = 'done';
    document.getElementById('after').hidden = false;
    AdSDK.complete({ score: score, best: best, pipes: score });
  }

  function update(dt) {
    scroll += SPEED * dt;
    for (const c of clouds) {
      c.x -= c.v * dt;
      if (c.x < -c.s * 2) { c.x = W + c.s * 2; c.y = 70 + Math.random() * 220; }
    }
    if (mode !== 'play') return;

    birdV += GRAVITY * dt;
    birdY += birdV * dt;
    if (wing > 0) wing = Math.max(0, wing - dt * 5);

    spawnT -= dt;
    if (spawnT <= 0) { spawnPipe(); spawnT = SPAWN_S; }

    for (const p of pipes) {
      p.x -= SPEED * dt;
      if (!p.passed && p.x + PIPE_W < BIRD_X) {
        p.passed = true;
        score++;
        SFX.tone(880, 0.09, 'sine', 0.11);
        SFX.tone(1180, 0.10, 'sine', 0.09, null, 0.07);
      }
    }
    pipes = pipes.filter((p) => p.x > -PIPE_W - 10);

    if (birdY + BIRD_R >= GROUND_Y) { birdY = GROUND_Y - BIRD_R; gameOver(); return; }
    if (birdY - BIRD_R < 0) { birdY = BIRD_R; birdV = 0; }
    for (const p of pipes) if (hitPipe(p)) { gameOver(); return; }
  }

  // ---- 描画 ---------------------------------------------------------------
  function drawBird() {
    const rot = Math.max(-0.5, Math.min(1.1, birdV / 620));
    ctx.save();
    ctx.translate(BIRD_X, birdY);
    ctx.rotate(rot);
    ctx.fillStyle = '#f6d743';
    ctx.beginPath(); ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8b62c';                       // 翼
    ctx.beginPath();
    ctx.ellipse(-4, 2 + wing * 7, 12, 7 - wing * 3, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';                          // 目
    ctx.beginPath(); ctx.arc(9, -7, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#243049';
    ctx.beginPath(); ctx.arc(11, -7, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f08a3c';                       // くちばし
    ctx.beginPath();
    ctx.moveTo(18, -1); ctx.lineTo(31, 3); ctx.lineTo(18, 8);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawPipe(p) {
    const top = p.gapY - GAP / 2, bot = p.gapY + GAP / 2;
    const lip = 26;
    for (const seg of [[0, top], [bot, GROUND_Y - bot]]) {
      const y = seg[0], h = seg[1];
      if (h <= 0) continue;
      ctx.fillStyle = PIPE_A;
      ctx.fillRect(p.x, y, PIPE_W, h);
      ctx.fillStyle = PIPE_B;
      ctx.fillRect(p.x + PIPE_W - 16, y, 16, h);
    }
    ctx.fillStyle = PIPE_A;
    ctx.fillRect(p.x - 7, top - lip, PIPE_W + 14, lip);
    ctx.fillRect(p.x - 7, bot, PIPE_W + 14, lip);
    ctx.fillStyle = PIPE_B;
    ctx.fillRect(p.x + PIPE_W - 9, top - lip, 16, lip);
    ctx.fillRect(p.x + PIPE_W - 9, bot, 16, lip);
  }

  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, SKY_TOP); g.addColorStop(1, SKY_BOT);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND_Y);

    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (const c of clouds) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.s, 0, Math.PI * 2);
      ctx.arc(c.x + c.s * 0.8, c.y + 6, c.s * 0.72, 0, Math.PI * 2);
      ctx.arc(c.x - c.s * 0.8, c.y + 8, c.s * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of pipes) drawPipe(p);

    ctx.fillStyle = GROUND;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = GROUND_D;
    ctx.fillRect(0, GROUND_Y, W, 9);
    for (let x = -((scroll * 0.6) % 56); x < W; x += 56) {
      ctx.fillRect(x, GROUND_Y + 22, 30, 6);
    }

    drawBird();

    // スコア
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.font = '800 68px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(score), W / 2 + 3, 111);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(score), W / 2, 108);

    if (mode === 'over') {
      ctx.fillStyle = 'rgba(13,16,23,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = '800 46px system-ui, sans-serif';
      ctx.fillText('くぐった数 ' + score, W / 2, H / 2 - 16);
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.fillStyle = '#b9c6d6';
      ctx.fillText('最高 ' + best, W / 2, H / 2 + 22);
    }
  }

  // ---- ループ -------------------------------------------------------------
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000));
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
    flap();
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

  // 開始前も静止画を出しておく（枠が真っ黒にならないように）
  reset();
  draw();

  AdSDK.init({ campaign: 'flappy', title: 'ゲーム広告：すきまくぐり' });
})();
