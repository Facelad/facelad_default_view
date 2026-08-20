import { ACTIONS, COLORS, W } from './engine.js';

const GROUND = 260;
const PW = 24;
const PH = 28;
const PX = 60;

const GRAVITY = 2000;
const JUMP_V = -640; // ápice ≈ 102 px, ~0.64 s en el aire
const CUT = 0.45; // recorte del impulso al soltar: salto corto

const SPEED_MIN = 240;
const SPEED_MAX = 460;
const SPEED_RAMP = 8; // px/s por segundo

const HIT_INSET = 3; // perdón en la caja del jugador
const PX_PER_POINT = 12;

/** @type {import('./engine.js').GameModule} */
export default {
  id: 'runner',
  name: 'Corredor',
  hint: 'Espacio o Enter para saltar (mantén para saltar más alto)',
  hintTouch: 'Toca para saltar (mantén para saltar más alto)',
  pad: false,

  create(api) {
    let py = GROUND - PH;
    let vy = 0;
    let grounded = true;
    let speed = SPEED_MIN;
    let elapsed = 0;
    let distance = 0;
    let untilSpawn = 0;
    let obstacles = [];
    let dots = [];
    let dead = false;

    function nextGap() {
      /*
       * El hueco se mide en PÍXELES, no en segundos. A 460 px/s el jugador
       * recorre ~294 px durante los 0.64 s que dura un salto, así que una
       * cadencia temporal fija acaba generando huecos imposibles conforme
       * sube la velocidad. Esta fórmula mantiene el hueco por encima del
       * alcance del salto con margen.
       */
      return Math.max(230, speed * 0.75 + 60) + api.randInt(0, 140);
    }

    function spawn() {
      const h = api.randInt(26, 44);
      const w = api.randInt(14, 22);
      obstacles.push({ x: W + 10, w, h });
      // De vez en cuando, un par pegado: se salvan con el mismo salto pero
      // obligan a calcular mejor el momento.
      if (api.rand(0, 1) < 0.25) obstacles.push({ x: W + 10 + w + 8, w: api.randInt(12, 18), h: api.randInt(24, 36) });
      untilSpawn = nextGap();
    }

    function reset() {
      py = GROUND - PH;
      vy = 0;
      grounded = true;
      speed = SPEED_MIN;
      elapsed = 0;
      distance = 0;
      obstacles = [];
      untilSpawn = 260;
      dead = false;
      dots = [];
      for (let i = 0; i < 8; i += 1) {
        dots.push({ x: api.rand(0, W), y: api.rand(30, GROUND - 70), r: api.rand(1, 2.5) });
      }
    }

    function onAction(action) {
      if (action === ACTIONS.PRIMARY || action === ACTIONS.UP) {
        if (grounded) {
          vy = JUMP_V;
          grounded = false;
        }
        return;
      }
      // Soltar mientras se sube recorta el impulso. Son dos líneas, y es la
      // diferencia entre sentirse como el juego del dinosaurio o sentirse mal.
      if (action === ACTIONS.PRIMARY_UP && vy < 0) vy *= CUT;
    }

    function update(dt) {
      if (dead) return;
      elapsed += dt;
      speed = Math.min(SPEED_MAX, SPEED_MIN + elapsed * SPEED_RAMP);
      const dx = speed * dt;
      distance += dx;
      api.setScore(distance / PX_PER_POINT);

      vy += GRAVITY * dt;
      py += vy * dt;
      if (py >= GROUND - PH) {
        py = GROUND - PH;
        vy = 0;
        grounded = true;
      }

      untilSpawn -= dx;
      if (untilSpawn <= 0) spawn();

      for (const ob of obstacles) ob.x -= dx;
      obstacles = obstacles.filter((ob) => ob.x + ob.w > -20);

      if (!api.reducedMotion) {
        for (const dot of dots) {
          dot.x -= dx * 0.35;
          if (dot.x < -4) {
            dot.x = W + 4;
            dot.y = api.rand(30, GROUND - 70);
          }
        }
      }

      const left = PX + HIT_INSET;
      const right = PX + PW - HIT_INSET;
      const top = py + HIT_INSET;
      const bottom = py + PH;
      for (const ob of obstacles) {
        if (right > ob.x && left < ob.x + ob.w && bottom > GROUND - ob.h && top < GROUND) {
          dead = true;
          api.gameOver();
          return;
        }
      }
    }

    function draw(ctx) {
      ctx.fillStyle = COLORS.grid;
      for (const dot of dots) {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = COLORS.dim;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, GROUND + 0.5);
      ctx.lineTo(W, GROUND + 0.5);
      ctx.stroke();

      // Guiones desplazados con la distancia recorrida: dan sensación de avance
      // sin necesidad de mantener un array de partículas.
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      const offset = distance % 40;
      for (let x = -offset; x < W; x += 40) {
        ctx.moveTo(x, GROUND + 10.5);
        ctx.lineTo(x + 20, GROUND + 10.5);
      }
      ctx.stroke();

      ctx.fillStyle = COLORS.danger;
      for (const ob of obstacles) ctx.fillRect(ob.x, GROUND - ob.h, ob.w, ob.h);

      ctx.fillStyle = grounded ? COLORS.mint : COLORS.white;
      ctx.fillRect(PX, py, PW, PH);
      // Un ojo, para que se lea como criatura y no como rectángulo.
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(PX + PW - 9, py + 6, 4, 4);
    }

    return { reset, update, draw, onAction };
  },
};
