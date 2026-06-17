'use strict';

// ── Canvas setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 480;
canvas.height = 600;

function resizeCanvas() {
  const maxW = Math.min(canvas.parentElement.clientWidth, 480);
  canvas.style.width = maxW + 'px';
  canvas.style.height = (maxW * (600 / 480)) + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Constants ─────────────────────────────────────────────────────────────────
const W = 480;
const H = 600;
const NUM_ROWS = 10;
const ROW_H = H / NUM_ROWS; // 60

// Row layout (top = 0, bottom = 9)
const LANES = [
  { type: 'goal',   color: '#14532d' },                         // 0
  { type: 'road',   color: '#1c1c2e', dir:  1, speed: 100 },   // 1
  { type: 'road',   color: '#16161e', dir: -1, speed: 80  },   // 2
  { type: 'road',   color: '#1c1c2e', dir:  1, speed: 130 },   // 3
  { type: 'median', color: '#3b1a00' },                         // 4
  { type: 'road',   color: '#16161e', dir: -1, speed: 90  },   // 5
  { type: 'road',   color: '#1c1c2e', dir:  1, speed: 110 },   // 6
  { type: 'road',   color: '#16161e', dir: -1, speed: 70  },   // 7
  { type: 'road',   color: '#1c1c2e', dir:  1, speed: 120 },   // 8
  { type: 'start',  color: '#14532d' },                         // 9
];

const CARS_PER_ROW = [0, 3, 2, 3, 0, 2, 3, 2, 3, 0];

const CAR_COLORS = [
  '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6',
  '#10b981', '#f97316', '#ec4899', '#06b6d4',
];

// ── Game state ────────────────────────────────────────────────────────────────
let g = {};
let bestScore = parseInt(localStorage.getItem('crossroad_best') || '0', 10);

function initGame() {
  if (g.frameId) cancelAnimationFrame(g.frameId);

  g = {
    running: true,
    over: false,
    score: 0,
    lives: 3,
    level: 1,
    playerRow: 9,
    playerCol: 4,
    playerDead: false,
    deathTimer: 0,
    highestRow: 9,  // tracks max row reached (lower index = further up)
    cars: [],
    lastTime: null,
    frameId: null,
    flashTimer: 0,
    flashText: '',
  };

  spawnCars();
  updateHUD();
  document.getElementById('best').textContent = bestScore;
}

// ── Cars ──────────────────────────────────────────────────────────────────────
function spawnCars() {
  g.cars = [];
  const speedMult = 1 + (g.level - 1) * 0.18;

  LANES.forEach((lane, row) => {
    if (lane.type !== 'road') return;
    const count = CARS_PER_ROW[row];
    const speed = lane.speed * speedMult;
    const gap = W / count;

    for (let i = 0; i < count; i++) {
      const carW = 75 + Math.random() * 45;
      // Stagger initial positions with a random offset within each slot
      let startX = gap * i + Math.random() * (gap * 0.4);
      // If car moves left, place it differently so they spread out
      if (lane.dir < 0) startX = W - startX;

      g.cars.push({
        row,
        x: startX,
        speed,
        dir: lane.dir,
        w: carW,
        h: 36,
        color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
        // Second color for roof accent
        accent: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      });
    }
  });
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('score').textContent = g.score;
  document.getElementById('level').textContent = g.level;
  document.getElementById('best').textContent = bestScore;
  const full = Math.max(0, g.lives);
  document.getElementById('lives').textContent = '♥'.repeat(full) + '♡'.repeat(Math.max(0, 3 - full));
}

// ── Player movement ───────────────────────────────────────────────────────────
function movePlayer(dRow, dCol) {
  if (!g.running || g.over || g.playerDead) return;

  const newRow = Math.max(0, Math.min(9, g.playerRow + dRow));
  const newCol = Math.max(0, Math.min(7, g.playerCol + dCol));

  // Award points for advancing up (each new row = 10 pts)
  if (newRow < g.playerRow && newRow < g.highestRow) {
    const rowsGained = g.highestRow - newRow;
    g.score += rowsGained * 10;
    g.highestRow = newRow;
    updateHUD();
  }

  g.playerRow = newRow;
  g.playerCol = newCol;

  if (g.playerRow === 0) {
    reachedGoal();
  }
}

function reachedGoal() {
  const bonus = 150 + g.level * 25;
  g.score += bonus;
  if (g.score > bestScore) {
    bestScore = g.score;
    localStorage.setItem('crossroad_best', bestScore);
  }
  g.level++;
  g.highestRow = 9;
  g.playerRow = 9;
  g.playerCol = 4;
  spawnCars();
  updateHUD();
  showFlash('LEVEL ' + g.level + '!  +' + bonus);
}

function showFlash(text) {
  g.flashText = text;
  g.flashTimer = 1.8;
}

// ── Collision ─────────────────────────────────────────────────────────────────
function checkCollisions() {
  if (g.playerDead) return;
  if (LANES[g.playerRow].type !== 'road') return;

  // Player hitbox (slightly inset)
  const px = g.playerCol * 60 + 8;
  const py = g.playerRow * ROW_H + 10;
  const pw = 44;
  const ph = 38;

  for (const car of g.cars) {
    if (car.row !== g.playerRow) continue;
    const cy = car.row * ROW_H + (ROW_H - car.h) / 2;
    if (px < car.x + car.w && px + pw > car.x && py < cy + car.h && py + ph > cy) {
      killPlayer();
      return;
    }
  }
}

function killPlayer() {
  if (g.playerDead || g.over) return;

  g.playerDead = true;
  g.deathTimer = 1.4;
  g.lives--;
  updateHUD();

  if (g.lives <= 0) {
    g.lives = 0;
    updateHUD();

    setTimeout(() => {

      showGameOver();
    }, 1400);
  }
}


// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (!g.running) return;

  if (g.playerDead) {
    g.deathTimer -= dt;
    if (g.deathTimer <= 0 && g.lives > 0) {
      g.playerDead = false;
      g.playerRow = 9;
      g.playerCol = 4;
      g.highestRow = 9;
    }
  }

  if (g.flashTimer > 0) g.flashTimer -= dt;

  for (const car of g.cars) {
    car.x += car.speed * car.dir * dt;
    if (car.dir > 0 && car.x > W) car.x = -car.w;
    else if (car.dir < 0 && car.x + car.w < 0) car.x = W;
  }

  checkCollisions();
}

// ── Render helpers ────────────────────────────────────────────────────────────
function rr(x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

function drawLanes() {
  for (let row = 0; row < NUM_ROWS; row++) {
    const lane = LANES[row];
    const y = row * ROW_H;

    ctx.fillStyle = lane.color;
    ctx.fillRect(0, y, W, ROW_H);

    if (lane.type === 'road') {
      // Dashed center line
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      ctx.setLineDash([18, 18]);
      ctx.beginPath();
      ctx.moveTo(0, y + ROW_H * 0.5);
      ctx.lineTo(W, y + ROW_H * 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Direction arrows (subtle)
      const arrowDir = lane.dir;
      const arrowY = y + ROW_H * 0.5;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let ax = 40; ax < W; ax += 80) {
        ctx.fillText(arrowDir > 0 ? '→' : '←', ax, arrowY);
      }
      ctx.restore();
    }

    if (lane.type === 'goal') {
      // Checkerboard finish area
      for (let col = 0; col < 8; col++) {
        const shade = (col % 2 === 0) ? '#166534' : '#14532d';
        ctx.fillStyle = shade;
        ctx.fillRect(col * 60, y, 60, ROW_H);
      }
      // Flag strip at top
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(0, y, W, 4);
      // Label
      ctx.fillStyle = '#bbf7d0';
      ctx.font = 'bold 13px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏁 FINISH', W / 2, y + ROW_H / 2);
    }

    if (lane.type === 'median') {
      // Striped median
      for (let col = 0; col < 8; col++) {
        ctx.fillStyle = col % 2 === 0 ? '#92400e' : '#451a03';
        ctx.fillRect(col * 60, y, 60, ROW_H);
      }
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(0, y, W, 3);
      ctx.fillRect(0, y + ROW_H - 3, W, 3);
      ctx.fillStyle = 'rgba(251,191,36,0.5)';
      ctx.font = '11px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('— SAFE ZONE —', W / 2, y + ROW_H / 2);
    }

    if (lane.type === 'start') {
      for (let col = 0; col < 8; col++) {
        const shade = (col % 2 === 0) ? '#166534' : '#14532d';
        ctx.fillStyle = shade;
        ctx.fillRect(col * 60, y, 60, ROW_H);
      }
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(0, y + ROW_H - 4, W, 4);
      ctx.fillStyle = '#bbf7d0';
      ctx.font = 'bold 12px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚶 START', W / 2, y + ROW_H / 2);
    }
  }
}

function drawCar(car) {
  const cy = car.row * ROW_H + (ROW_H - car.h) / 2;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  rr(car.x + 3, cy + 4, car.w, car.h, 7);
  ctx.fill();

  // Body
  ctx.fillStyle = car.color;
  ctx.beginPath();
  rr(car.x, cy, car.w, car.h, 7);
  ctx.fill();

  // Roof / windshield area
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  rr(car.x + car.w * 0.22, cy + 5, car.w * 0.56, car.h - 14, 4);
  ctx.fill();

  // Roof highlight
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  rr(car.x + car.w * 0.23, cy + 6, car.w * 0.54, 6, 3);
  ctx.fill();

  // Headlights / taillights
  const frontX = car.dir > 0 ? car.x + car.w - 8 : car.x + 2;
  const backX  = car.dir > 0 ? car.x + 2          : car.x + car.w - 8;

  ctx.fillStyle = '#fef9c3';
  ctx.fillRect(frontX, cy + 5, 6, 7);
  ctx.fillRect(frontX, cy + car.h - 12, 6, 7);

  ctx.fillStyle = '#ef4444';
  ctx.fillRect(backX, cy + 5, 6, 7);
  ctx.fillRect(backX, cy + car.h - 12, 6, 7);
}

function drawPlayer() {
  // Blink when dead
  if (g.playerDead && Math.floor(g.deathTimer * 7) % 2 === 0) return;

  const px = g.playerCol * 60 + 5;
  const py = g.playerRow * ROW_H + 7;

  // Glow ring when on safe zone
  const lane = LANES[g.playerRow];
  if (lane.type === 'goal' || lane.type === 'start' || lane.type === 'median') {
    ctx.fillStyle = 'rgba(34, 211, 238, 0.2)';
    ctx.beginPath();
    ctx.ellipse(px + 25, py + 28, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw frog emoji
  ctx.font = '38px serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('🐸', px, py + 38);
}

function drawFlash() {
  if (g.flashTimer <= 0 || !g.flashText) return;
  const alpha = Math.min(1, g.flashTimer / 0.4);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fbbf24';
  ctx.strokeStyle = '#07071a';
  ctx.lineWidth = 4;
  ctx.font = 'bold 20px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(g.flashText, W / 2, H / 2);
  ctx.fillText(g.flashText, W / 2, H / 2);
  ctx.restore();
}

// ── Main render ───────────────────────────────────────────────────────────────
function render() {
  ctx.clearRect(0, 0, W, H);
  drawLanes();

  for (const car of g.cars) drawCar(car);

  if (g.running || g.over) drawPlayer();

  drawFlash();
}

// ── Game loop ─────────────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  if (!g.running) return;
  if (g.lastTime === null) g.lastTime = timestamp;
  const dt = Math.min((timestamp - g.lastTime) / 1000, 0.05);
  g.lastTime = timestamp;
  update(dt);
  render();
  g.frameId = requestAnimationFrame(gameLoop);
}

// ── UI screens ────────────────────────────────────────────────────────────────
function showScreen(id) {
  ['start-screen', 'game-over-screen'].forEach(s => {
    document.getElementById(s).classList.add('hidden');
  });
  if (id) document.getElementById(id).classList.remove('hidden');
}

function showGameOver() {
  g.running = false;
  g.over = true;

  document.getElementById('final-score').textContent = g.score;

  if (g.score > bestScore) {
    bestScore = g.score;
    localStorage.setItem('crossroad_best', bestScore);
    updateHUD();
  }

  const nameEntry = document.getElementById('name-entry');

  nameEntry.innerHTML = `
    <p id="rank-message">Enter your name to save your score!</p>
    <input type="text" id="player-name" placeholder="Enter your name" maxlength="20" autocomplete="off" spellcheck="false" />
    <button id="submit-score" class="btn primary">SUBMIT</button>
  `;

  showScreen('game-over-screen');
  bindSubmitBtn();
 // Check if score is in top 10 and update message accordingly
  checkIfTop10(g.score);
}


function bindSubmitBtn() {
  document.getElementById('submit-score').addEventListener('click', async () => {
    const name = (document.getElementById('player-name').value || '').trim();
    if (!name) {
      document.getElementById('player-name').focus();
      return;
    }
    const btn = document.getElementById('submit-score');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    await submitScore(name, g.score);
    document.getElementById('name-entry').innerHTML =
      '<p class="submit-success">🎉 Score saved! Check the leaderboard.</p>';
    loadLeaderboard();
  });
}

async function checkIfTop10(score) {
  try {
    const res = await fetch('/api/leaderboard');
    const scores = await res.json();
    const msg = document.getElementById('rank-message');
    if (!msg) return;
    if (scores.length < 10 || score > (scores[scores.length - 1]?.score || 0)) {
      const rank = scores.filter(s => s.score > score).length + 1;
      msg.textContent = `You ranked #${rank}! Enter your name:`;
      msg.style.color = '#22c55e';
    } else {
      msg.textContent = 'You didn\'t make the top 10 — try again!';
    }
  } catch {
    // API unreachable, still let them submit
  }
}

// ── Leaderboard API ───────────────────────────────────────────────────────────
async function loadLeaderboard() {
  const el = document.getElementById('leaderboard-content');
  try {
    const res = await fetch('/api/leaderboard');
    const scores = await res.json();

    if (!Array.isArray(scores) || scores.length === 0) {
      el.innerHTML = '<p class="lb-empty">No scores yet — be the first!</p>';
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    el.innerHTML = scores.map((s, i) => {
      const rankEl = i < 3
        ? `<span class="lb-rank">${medals[i]}</span>`
        : `<span class="lb-rank-num">#${i + 1}</span>`;
      const cls = i < 3 ? `lb-entry top-${i + 1}` : 'lb-entry';
      const date = new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return `
        <div class="${cls}">
          ${rankEl}
          <div style="flex:1;min-width:0">
            <div class="lb-name">${esc(s.name)}</div>
            <div class="lb-date">${date}</div>
          </div>
          <span class="lb-score">${s.score}</span>
        </div>`;
    }).join('');
  } catch {
    el.innerHTML = '<p class="lb-error">Could not load leaderboard.</p>';
  }
}

async function submitScore(name, score) {
  try {
    await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score }),
    });
  } catch (err) {
    console.error('Submit failed:', err);
  }
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Controls ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (document.activeElement.tagName === 'INPUT') return;
  switch (e.key) {
    case 'ArrowUp':    case 'w': case 'W': e.preventDefault(); movePlayer(-1,  0); break;
    case 'ArrowDown':  case 's': case 'S': e.preventDefault(); movePlayer( 1,  0); break;
    case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); movePlayer( 0, -1); break;
    case 'ArrowRight': case 'd': case 'D': e.preventDefault(); movePlayer( 0,  1); break;
  }
});

document.querySelectorAll('.ctrl-btn').forEach(btn => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const dir = btn.dataset.dir;
    if (dir === 'up')    movePlayer(-1,  0);
    if (dir === 'down')  movePlayer( 1,  0);
    if (dir === 'left')  movePlayer( 0, -1);
    if (dir === 'right') movePlayer( 0,  1);
  });
});

// Swipe on canvas
let touchStart = null;
canvas.addEventListener('touchstart', (e) => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  e.preventDefault();
  if (Math.abs(dx) > Math.abs(dy)) {
    movePlayer(0, dx > 0 ? 1 : -1);
  } else {
    movePlayer(dy > 0 ? 1 : -1, 0);
  }
}, { passive: false });

// ── Button bindings ───────────────────────────────────────────────────────────
document.getElementById('start-btn').addEventListener('click', () => {
  showScreen(null);
  initGame();
  g.lastTime = null;
  g.frameId = requestAnimationFrame(gameLoop);
});

document.getElementById('play-again').addEventListener('click', () => {
  showScreen(null);
  initGame();
  g.lastTime = null;
  g.frameId = requestAnimationFrame(gameLoop);
});

// ── Boot ──────────────────────────────────────────────────────────────────────
loadLeaderboard();
document.getElementById('best').textContent = bestScore;

// Draw a static preview frame behind start screen
g = { playerRow: 9, playerCol: 4, cars: [], playerDead: false, deathTimer: 0 };
LANES.forEach((lane, row) => {
  if (lane.type !== 'road') return;
  const gap = W / CARS_PER_ROW[row];
  for (let i = 0; i < CARS_PER_ROW[row]; i++) {
    g.cars.push({
      row, x: gap * i + Math.random() * 20,
      w: 80 + Math.random() * 40, h: 36,
      dir: lane.dir, speed: lane.speed,
      color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
    });
  }
});
render();
