import { ACTIONS, COLORS, W, H } from './engine.js';

const SHIP_W = 22;
const SHIP_H = 18;
const SHIP_Y = 282;
const SHIP_SPEED = 300;
const SHIP_MIN_X = 12;
const SHIP_MAX_X = W - 12;

const FIRE_COOLDOWN = 0.22;
const BULLET_VY = -420;
const ENEMY_BULLET_VY = 180;
const MAX_BULLETS = 24;
const MAX_ENEMY_BULLETS = 16;
const MAX_ENEMY_BULLETS_LIVE = 6;

const ENEMY_W = 22;
const ENEMY_H = 16;
const ENEMY_COLS = 5;
const ENEMY_SPACING = 64;
const ENEMY_DEADLINE = 270;

const LIVES = 3;
const INVULN = 1.2;

/** @type {import('./engine.js').GameModule} */
export default {
  id: 'shooter',
  name: 'Nave',
  hint: 'Flechas o A/D para moverte. Dispara sola.',
  hintTouch: 'Arrastra para moverte. Dispara sola.',
  pad: false,

  create(api) {
    let shipX = W / 2;
    let cooldown = 0;
    let lives = LIVES;
    let invuln = 0;
    let wave = 0;
    let time = 0;
    let dead = false;

    // Pools reutilizados con una bandera `alive`. A estos volúmenes no es una
    // necesidad de rendimiento, son cinco líneas que evitan churn de GC en
    // móviles baratos.
    const bullets = Array.from({ length: MAX_BULLETS }, () => ({ x: 0, y: 0, alive: false }));
    const enemyBullets = Array.from({ length: MAX_ENEMY_BULLETS }, () => ({ x: 0, y: 0, alive: false }));
    let enemies = [];
    let stars = [];

    function spawnWave() {
      wave += 1;
      const rows = 2 + Math.min(wave, 2);
      const startX = (W - (ENEMY_COLS - 1) * ENEMY_SPACING) / 2;
      enemies = [];
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < ENEMY_COLS; col += 1) {
          enemies.push({
            baseX: startX + col * ENEMY_SPACING,
            x: startX + col * ENEMY_SPACING,
            y: -40 - row * 42,
            phase: api.rand(0, Math.PI * 2),
            fireIn: api.rand(1.6, 4),
          });
        }
      }
    }

    function reset() {
      shipX = W / 2;
      cooldown = 0;
      lives = LIVES;
      invuln = 0;
      wave = 0;
      time = 0;
      dead = false;
      for (const b of bullets) b.alive = false;
      for (const b of enemyBullets) b.alive = false;
      stars = [];
      for (let i = 0; i < 40; i += 1) {
        stars.push({ x: api.rand(0, W), y: api.rand(0, H), v: api.rand(20, 60), r: api.rand(0.5, 1.6) });
      }
      spawnWave();
    }

    function fire(pool, x, y) {
      for (const b of pool) {
        if (b.alive) continue;
        b.x = x;
        b.y = y;
        b.alive = true;
        return true;
      }
      return false;
    }

    function loseLife() {
      if (invuln > 0) return;
      lives -= 1;
      invuln = INVULN;
      for (const b of enemyBullets) b.alive = false;
      if (lives <= 0) {
        dead = true;
        api.gameOver();
      }
    }

    function update(dt) {
      if (dead) return;
      time += dt;
      if (invuln > 0) invuln -= dt;

      if (api.input.pointer.down) {
        // El lerp es lo que hace que arrastrar se sienta bien en lugar de
        // teletransportar la nave bajo el dedo.
        shipX += (api.input.pointer.x - shipX) * 0.35;
      } else {
        if (api.input.held.has(ACTIONS.LEFT)) shipX -= SHIP_SPEED * dt;
        if (api.input.held.has(ACTIONS.RIGHT)) shipX += SHIP_SPEED * dt;
      }
      shipX = Math.max(SHIP_MIN_X, Math.min(SHIP_MAX_X, shipX));

      cooldown -= dt;
      if (cooldown <= 0) {
        fire(bullets, shipX, SHIP_Y - SHIP_H / 2);
        cooldown = FIRE_COOLDOWN;
      }

      for (const b of bullets) {
        if (!b.alive) continue;
        b.y += BULLET_VY * dt;
        if (b.y < -8) b.alive = false;
      }

      let liveEnemyBullets = 0;
      for (const b of enemyBullets) {
        if (!b.alive) continue;
        b.y += ENEMY_BULLET_VY * dt;
        if (b.y > H + 8) b.alive = false;
        else liveEnemyBullets += 1;
      }

      const descend = 12 + wave * 4;
      for (const e of enemies) {
        // Deriva senoidal por enemigo: mucho más simple que una formación en
        // lockstep estilo Space Invaders, y se lee mejor en movimiento.
        e.x = e.baseX + Math.sin(time * 1.2 + e.phase) * 22;
        e.y += descend * dt;
        e.fireIn -= dt;
        if (e.fireIn <= 0) {
          e.fireIn = api.rand(1.6, 4);
          if (liveEnemyBullets < MAX_ENEMY_BULLETS_LIVE && e.y > 0) {
            if (fire(enemyBullets, e.x, e.y + ENEMY_H / 2)) liveEnemyBullets += 1;
          }
        }
      }

      // O(balas x enemigos) ~ 480 comprobaciones por frame en el peor caso.
      // A esta escala un quadtree solo añadiría código.
      for (const b of bullets) {
        if (!b.alive) continue;
        for (let i = 0; i < enemies.length; i += 1) {
          const e = enemies[i];
          if (Math.abs(b.x - e.x) > ENEMY_W / 2 || Math.abs(b.y - e.y) > ENEMY_H / 2) continue;
          b.alive = false;
          enemies.splice(i, 1);
          api.addScore(25);
          break;
        }
      }

      for (const b of enemyBullets) {
        if (!b.alive) continue;
        if (Math.abs(b.x - shipX) < SHIP_W / 2 && Math.abs(b.y - SHIP_Y) < SHIP_H / 2) {
          b.alive = false;
          loseLife();
          if (dead) return;
        }
      }

      for (let i = enemies.length - 1; i >= 0; i -= 1) {
        if (enemies[i].y <= ENEMY_DEADLINE) continue;
        enemies.splice(i, 1);
        loseLife();
        if (dead) return;
      }

      if (!api.reducedMotion) {
        for (const s of stars) {
          s.y += s.v * dt;
          if (s.y > H) {
            s.y = -2;
            s.x = api.rand(0, W);
          }
        }
      }

      if (!enemies.length) {
        api.addScore(100);
        spawnWave();
      }
    }

    function draw(ctx) {
      if (!api.reducedMotion) {
        ctx.fillStyle = COLORS.grid;
        for (const s of stars) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.fillStyle = COLORS.danger;
      for (const e of enemies) {
        if (e.y < -ENEMY_H) continue;
        ctx.fillRect(e.x - ENEMY_W / 2, e.y - ENEMY_H / 2, ENEMY_W, ENEMY_H);
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(e.x - 6, e.y - 2, 4, 4);
        ctx.fillRect(e.x + 2, e.y - 2, 4, 4);
        ctx.fillStyle = COLORS.danger;
      }

      ctx.fillStyle = COLORS.mint;
      for (const b of bullets) if (b.alive) ctx.fillRect(b.x - 1.5, b.y - 6, 3, 10);

      ctx.fillStyle = COLORS.white;
      for (const b of enemyBullets) if (b.alive) ctx.fillRect(b.x - 1.5, b.y - 5, 3, 9);

      // Parpadeo durante la invulnerabilidad: el jugador ve que el impacto
      // se registró sin quedarse sin nave en pantalla.
      const blinking = invuln > 0 && Math.floor(invuln * 12) % 2 === 0;
      if (!blinking) {
        ctx.fillStyle = COLORS.mint;
        ctx.beginPath();
        ctx.moveTo(shipX, SHIP_Y - SHIP_H / 2);
        ctx.lineTo(shipX + SHIP_W / 2, SHIP_Y + SHIP_H / 2);
        ctx.lineTo(shipX - SHIP_W / 2, SHIP_Y + SHIP_H / 2);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = COLORS.mint;
      for (let i = 0; i < lives; i += 1) {
        ctx.beginPath();
        ctx.moveTo(12 + i * 16, 10);
        ctx.lineTo(18 + i * 16, 22);
        ctx.lineTo(6 + i * 16, 22);
        ctx.closePath();
        ctx.fill();
      }
    }

    return { reset, update, draw };
  },
};
