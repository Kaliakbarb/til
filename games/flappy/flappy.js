const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const W = 400, H = 600, GROUND = H - 60;
const BIRD_X = 90, R = 14, GRAVITY = 0.45, FLAP_V = -7.2;
const PIPE_W = 70, GAP = 150, SPEED = 2.6;

let state, birdY, vel, pipes, score, frames, best = 0;

function reset() {
  state = 'ready';
  birdY = H / 2;
  vel = 0;
  pipes = [];
  score = 0;
  frames = 0;
}

function flap() {
  if (state === 'over') reset();
  else {
    state = 'play';
    vel = FLAP_V;
  }
}

function update() {
  if (frames % 90 === 0)
    pipes.push({ x: W, top: 60 + Math.random() * (GROUND - 60 - GAP - 60), passed: false });
  frames++;
  vel += GRAVITY;
  birdY += vel;
  for (const p of pipes) {
    p.x -= SPEED;
    if (!p.passed && p.x + PIPE_W < BIRD_X) { p.passed = true; score++; }
  }
  pipes = pipes.filter(p => p.x >= -80);
  const hitPipe = pipes.some(p =>
    BIRD_X + R > p.x && BIRD_X - R < p.x + PIPE_W &&
    (birdY - R < p.top || birdY + R > p.top + GAP));
  if (birdY + R > GROUND || birdY - R < 0 || hitPipe) {
    state = 'over';
    best = Math.max(best, score);
  }
}

const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const text = (s, x, y) => { ctx.fillStyle = '#fff'; ctx.font = '28px sans-serif'; ctx.fillText(s, x, y); };

function draw() {
  rect(0, 0, W, H, '#0e1420');
  rect(0, GROUND, W, H - GROUND, '#1a2233');
  for (const p of pipes) {
    rect(p.x, 0, PIPE_W, p.top, '#2dd4bf');
    rect(p.x, p.top + GAP, PIPE_W, GROUND - p.top - GAP, '#2dd4bf');
  }
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(BIRD_X, birdY, R, 0, Math.PI * 2);
  ctx.fill();
  text(score, 20, 40);
  if (state === 'ready') text('press space', 130, 300);
  if (state === 'over') {
    text('game over', 140, 270);
    text(`score ${score}  best ${best}`, 100, 310);
    text('space to restart', 105, 350);
  }
}

function frame() {
  if (state === 'play') update();
  draw();
  requestAnimationFrame(frame);
}

document.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); flap(); }
});
canvas.addEventListener('mousedown', flap);
canvas.addEventListener('touchstart', e => { e.preventDefault(); flap(); });

reset();
frame();
