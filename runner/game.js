/*
 * とびこえランナー — タップでジャンプして障害物をよける
 *
 * 配信まわり（postMessage / CTA / 埋め込みコード）は ../shared/ad-sdk.js が持つ。
 */
(() => {
  'use strict';

  const W = 720, H = 720;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  // ---- パラメータ ---------------------------------------------------------
  const GROUND_Y = 548;
  const PX       = 168;      // プレイヤーの x
  const PW = 40, PH = 56;
  const GRAVITY  = 2900;
  const JUMP_V   = -940;
  const SPEED0   = 350;
  const SPEED_UP = 11;       // 1秒あたりの加速
  const SPEED_MAX = 700;

  const SKY_TOP = '#141b2b', SKY_BOT = '#2b3a55';
  const HILL_A = '#1b2740', HILL_B = '#22314f';
  const GROUND_C = '#38455f', LINE_C = '#5b6d8f';
  const BODY_C = '#7ee0c0', OBST_C = '#e06a5a';

  // ---- 状態 ---------------------------------------------------------------
  let mode = 'idle';        // idle | play | over
  let raf = 0, lastT = 0;
  let py, pv, onGround, runT;
  let obstacles, spawnT, dist, speed, score, best = 0;
  let stars = [], hills = [];

  function reset() {
    py = GROUND_Y - PH; pv = 0; onGround = true; runT = 0;
    obstacles = []; spawnT = 1.1; dist = 0; speed = SPEED0; score = 0;
    stars = [];
    for (let i = 0; i < 46; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * 380,
                   r: Math.random() < 0.2 ? 2 : 1.3 });
    }
    hills = [];
    for (let i = 0; i < 9; i++) {
      hills.push({ x: i * 130 + Math.random() * 60, w: 150 + Math.random() * 130,
                   h: 60 + Math.random() * 90 });
    }
  }

  // ---- 入力 ---------------------------------------------------------------
  function jump() {
    if (mode !== 'play' || !onGround) return;
    pv = JUMP_V;
    onGround = false;
    SFX.tone(480, 0.10, 'square', 0.09, 700);
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    AdSDK.interaction(e.pointerType === 'touch' ? 'touch' : 'pointer');
    jump();
  });
  window.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter' || e.key === 'ArrowUp') {
      e.preventDefault();
      AdSDK.interaction('keyboard');
      jump();
    }
  });

  // ---- 更新 ---------------------------------------------------------------
  function spawnObstacle() {
    // 高さは2種類。低いものは連続で置くことがある。
    const tall = Math.random() < 0.42;
    const h = tall ? 68 + Math.random() * 26 : 38 + Math.random() * 16;
    const w = tall ? 30 + Math.random() * 12 : 34 + Math.random() * 26;
    obstacles.push({ x: W + 40, w: w, h: h, passed: false });
    // 次の間隔は速度に合わせて決める。速いほど広く取らないと避けられない。
    const minGap = (PW + 210) / speed;
    spawnT = minGap + Math.random() * 0.85;
  }

  function gameOver() {
    if (mode !== 'play') return;
    mode = 'over';
    if (score > best) best = score;
    SFX.tone(280, 0.18, 'square', 0.13, 90);
    SFX.noise(0.36, 800, 140, 0.13, 0.04);
    document.body.dataset.state = 'done';
    document.getElementById('after').hidden = false;
    AdSDK.complete({ score: score, best: best, distanceM: score });
  }

  function update(dt) {
    if (mode === 'play') {
      speed = Math.min(SPEED_MAX, speed + SPEED_UP * dt);
      dist += speed * dt;
      score = Math.floor(dist / 24);

      pv += GRAVITY * dt;
      py += pv * dt;
      if (py >= GROUND_Y - PH) { py = GROUND_Y - PH; pv = 0; onGround = true; }
      if (onGround) runT += dt * speed / 90;

      spawnT -= dt;
      if (spawnT <= 0) spawnObstacle();

      for (const o of obstacles) {
        o.x -= speed * dt;
        if (!o.passed && o.x + o.w < PX) {
          o.passed = true;
          SFX.tone(920, 0.06, 'sine', 0.06);
        }
      }
      obstacles = obstacles.filter((o) => o.x > -80);

      // 矩形どうしのあたり判定。見た目より少し小さめにして理不尽さを減らす。
      const bx = PX + 6, bw = PW - 12, by = py + 4, bh = PH - 6;
      for (const o of obstacles) {
        const oy = GROUND_Y - o.h;
        if (bx < o.x + o.w && bx + bw > o.x && by < GROUND_Y && by + bh > oy) {
          gameOver(); return;
        }
      }
    }
    // 背景は終了後も少しだけ動かさない（止めて余韻を出す）
  }

  // ---- 描画 ---------------------------------------------------------------
  function drawRunner() {
    const x = PX, y = py;
    ctx.fillStyle = BODY_C;
    ctx.fillRect(x + 6, y + 12, PW - 12, PH - 24);          // 胴
    ctx.beginPath();                                         // 頭
    ctx.arc(x + PW / 2, y + 10, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = BODY_C;
    ctx.lineWidth = 6; ctx.lineCap = 'round';
    const swing = onGround ? Math.sin(runT) : 0.7;
    const swing2 = onGround ? Math.sin(runT + Math.PI) : -0.4;
    ctx.beginPath();                                         // 脚
    ctx.moveTo(x + PW / 2 - 3, y + PH - 14);
    ctx.lineTo(x + PW / 2 - 3 + swing * 15, y + PH);
    ctx.moveTo(x + PW / 2 + 3, y + PH - 14);
    ctx.lineTo(x + PW / 2 + 3 + swing2 * 15, y + PH);
    ctx.moveTo(x + PW / 2, y + 22);                          // 腕
    ctx.lineTo(x + PW / 2 + swing2 * 14, y + 34);
    ctx.stroke();
  }

  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, SKY_TOP); g.addColorStop(1, SKY_BOT);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND_Y);

    ctx.fillStyle = 'rgba(226,236,250,0.75)';
    for (const s of stars) ctx.fillRect(s.x, s.y, s.r, s.r);

    ctx.fillStyle = '#e9edd6';                               // 月
    ctx.beginPath(); ctx.arc(132, 106, 34, 0, Math.PI * 2); ctx.fill();

    // 丘。手前と奥で速度を変えて奥行きを出す。
    for (let layer = 0; layer < 2; layer++) {
      const par = layer === 0 ? 0.14 : 0.34;
      const base = GROUND_Y - (layer === 0 ? 10 : 0);
      ctx.fillStyle = layer === 0 ? HILL_A : HILL_B;
      for (const hl of hills) {
        const x = ((hl.x - dist * par) % (W + 320) + W + 320) % (W + 320) - 160;
        const h = hl.h * (layer === 0 ? 1.25 : 0.85);
        ctx.beginPath();
        ctx.moveTo(x, base);
        ctx.quadraticCurveTo(x + hl.w / 2, base - h, x + hl.w, base);
        ctx.closePath(); ctx.fill();
      }
    }

    ctx.fillStyle = GROUND_C;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = LINE_C;
    ctx.fillRect(0, GROUND_Y, W, 4);
    for (let x = -((dist * 1.0) % 90); x < W; x += 90) {
      ctx.fillRect(x, GROUND_Y + 34, 46, 4);
    }

    for (const o of obstacles) {
      const oy = GROUND_Y - o.h;
      ctx.fillStyle = OBST_C;
      ctx.fillRect(o.x, oy, o.w, o.h);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(o.x + o.w - 7, oy, 7, o.h);
    }

    drawRunner();

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.font = '800 46px system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(score + ' m', W - 34 + 2, 80 + 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(score + ' m', W - 34, 80);

    if (mode === 'over') {
      ctx.fillStyle = 'rgba(13,16,23,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = '800 46px system-ui, sans-serif';
      ctx.fillText(score + ' m 走った', W / 2, H / 2 - 16);
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.fillStyle = '#b9c6d6';
      ctx.fillText('最高 ' + best + ' m', W / 2, H / 2 + 22);
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

  AdSDK.init({ campaign: 'runner', title: 'ゲーム広告：とびこえランナー' });
})();
