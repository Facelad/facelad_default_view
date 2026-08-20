import { ACTIONS, COLORS } from './engine.js';

const CELL = 16;
const COLS = 30; // 480 / 16
const ROWS = 20; // 320 / 16
const START_LEN = 4;
const BASE_TICK = 0.14;
const TICK_STEP = 0.006;
const MIN_TICK = 0.06;

const DIRS = {
  [ACTIONS.UP]: { x: 0, y: -1 },
  [ACTIONS.DOWN]: { x: 0, y: 1 },
  [ACTIONS.LEFT]: { x: -1, y: 0 },
  [ACTIONS.RIGHT]: { x: 1, y: 0 },
};

function roundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** @type {import('./engine.js').GameModule} */
export default {
  id: 'snake',
  name: 'Snake',
  hint: 'Flechas o WASD para girar',
  hintTouch: 'Desliza sobre el tablero o usa el pad',
  pad: true,

  create(api) {
    let body = [];
    let dir = DIRS[ACTIONS.RIGHT];
    let queued = [];
    let food = { x: 0, y: 0 };
    let timer = 0;
    let tick = BASE_TICK;
    let dead = false;

    function occupied(x, y) {
      for (const cell of body) if (cell.x === x && cell.y === y) return true;
      return false;
    }

    function placeFood() {
      // Muestreo por rechazo: barato mientras el tablero esté mayormente vacío.
      for (let i = 0; i < 50; i += 1) {
        const x = api.randInt(0, COLS - 1);
        const y = api.randInt(0, ROWS - 1);
        if (!occupied(x, y)) {
          food = { x, y };
          return true;
        }
      }
      // Cerca del tablero lleno el muestreo deja de converger: escanear libres.
      const free = [];
      for (let y = 0; y < ROWS; y += 1) {
        for (let x = 0; x < COLS; x += 1) if (!occupied(x, y)) free.push({ x, y });
      }
      if (!free.length) return false;
      food = free[api.randInt(0, free.length - 1)];
      return true;
    }

    function reset() {
      body = [];
      for (let i = 0; i < START_LEN; i += 1) body.push({ x: 5 - i, y: 10 });
      dir = DIRS[ACTIONS.RIGHT];
      queued = [];
      timer = 0;
      tick = BASE_TICK;
      dead = false;
      placeFood();
    }

    function onAction(action) {
      const next = DIRS[action];
      if (!next) return;
      if (queued.length >= 2) return;
      /*
       * Se compara contra la última dirección ENCOLADA, no contra la actual.
       * Yendo a la derecha, pulsar arriba y luego abajo dentro del mismo tick
       * pasaría ambos filtros si se validara contra "derecha", y el segundo
       * paso metería la cabeza en el cuello. Contra la encolada, "abajo" se
       * rechaza por ser reversa de "arriba".
       */
      const ref = queued.length ? queued[queued.length - 1] : dir;
      if (next.x === -ref.x && next.y === -ref.y) return;
      if (next.x === ref.x && next.y === ref.y) return;
      queued.push(next);
    }

    function step() {
      if (queued.length) dir = queued.shift();
      const head = { x: body[0].x + dir.x, y: body[0].y + dir.y };

      if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) {
        dead = true;
        api.gameOver();
        return;
      }

      const ate = head.x === food.x && head.y === food.y;
      // Si no comemos, la cola se libera en este mismo paso, así que no es
      // colisión: sin esta exclusión un giro cerrado a longitud máxima mata.
      const limit = ate ? body.length : body.length - 1;
      for (let i = 0; i < limit; i += 1) {
        if (body[i].x === head.x && body[i].y === head.y) {
          dead = true;
          api.gameOver();
          return;
        }
      }

      body.unshift(head);
      if (!ate) {
        body.pop();
        return;
      }

      api.addScore(10);
      tick = Math.max(MIN_TICK, tick - TICK_STEP);
      if (!placeFood()) {
        dead = true;
        api.gameOver();
      }
    }

    function update(dt) {
      if (dead) return;
      timer += dt;
      while (timer >= tick && !dead) {
        timer -= tick;
        step();
      }
    }

    function draw(ctx) {
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < COLS; x += 1) {
        ctx.moveTo(x * CELL, 0);
        ctx.lineTo(x * CELL, ROWS * CELL);
      }
      for (let y = 1; y < ROWS; y += 1) {
        ctx.moveTo(0, y * CELL);
        ctx.lineTo(COLS * CELL, y * CELL);
      }
      ctx.stroke();

      ctx.fillStyle = COLORS.mint;
      ctx.beginPath();
      ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL * 0.3, 0, Math.PI * 2);
      ctx.fill();

      for (let i = body.length - 1; i >= 0; i -= 1) {
        ctx.fillStyle = i === 0 ? COLORS.white : COLORS.mint;
        roundRect(ctx, body[i].x * CELL + 1, body[i].y * CELL + 1, CELL - 2, CELL - 2, 3);
        ctx.fill();
      }
    }

    return { reset, update, draw, onAction };
  },
};
