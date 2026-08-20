/**
 * Motor compartido por los tres mini-juegos del arcade.
 *
 * Los juegos dibujan siempre en un espacio lógico de 480x320 y nunca leen
 * canvas.width: el escalado a píxeles de dispositivo lo absorbe un único
 * setTransform en resize().
 *
 * @typedef {Object} GameInstance
 * @property {() => void} reset
 * @property {(dt: number) => void} update
 * @property {(ctx: CanvasRenderingContext2D) => void} draw
 * @property {(action: string) => void} [onAction]
 *
 * @typedef {Object} GameModule
 * @property {string} id
 * @property {string} name
 * @property {string} hint       Pista para teclado y ratón.
 * @property {string} hintTouch  Pista para punteros gruesos.
 * @property {boolean} [pad]     Mostrar el d-pad en punteros gruesos.
 * @property {(api: Object) => GameInstance} create
 */

export const W = 480;
export const H = 320;
const STEP = 1 / 60;
// Techo por frame: sin él, volver a una pestaña que estaba en segundo plano
// acumula segundos de retraso y el while del loop entra en espiral.
const MAX_FRAME = 0.25;

const SWIPE_MIN = 24;
const TAP_MAX = 12;
const TAP_MS = 500;

export const ACTIONS = {
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
  PRIMARY: 'primary',
  PRIMARY_UP: 'primary-up',
  PAUSE: 'pause',
};

export const COLORS = {
  bg: '#181740',
  grid: 'rgba(255, 255, 255, 0.05)',
  mint: '#85f1a1',
  white: '#ffffff',
  dim: 'rgba(255, 255, 255, 0.55)',
  danger: '#ff6b6b',
};

const KEY_MAP = {
  ArrowUp: ACTIONS.UP,
  KeyW: ACTIONS.UP,
  ArrowDown: ACTIONS.DOWN,
  KeyS: ACTIONS.DOWN,
  ArrowLeft: ACTIONS.LEFT,
  KeyA: ACTIONS.LEFT,
  ArrowRight: ACTIONS.RIGHT,
  KeyD: ACTIONS.RIGHT,
  Space: ACTIONS.PRIMARY,
  Enter: ACTIONS.PRIMARY,
  KeyP: ACTIONS.PAUSE,
  Escape: ACTIONS.PAUSE,
};

/*
 * Safari en navegación privada y los navegadores con cookies bloqueadas lanzan
 * al LEER localStorage, no solo al escribir. Sin este guard una excepción aquí
 * tumbaría el arcade entero antes de dibujar el primer frame.
 */
const memory = new Map();

function storeGet(key) {
  try {
    const value = localStorage.getItem(key);
    if (value !== null) return value;
  } catch (err) {
    /* almacenamiento no disponible */
  }
  return memory.has(key) ? memory.get(key) : null;
}

function storeSet(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    /* almacenamiento no disponible */
  }
}

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

/**
 * @param {{ root: HTMLElement, games: GameModule[] }} options
 */
export function createArcade({ root, games }) {
  const canvas = root.querySelector('[data-canvas]');
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const tabsEl = root.querySelector('[data-tabs]');
  const scoreEl = root.querySelector('[data-score]');
  const hiEl = root.querySelector('[data-hi]');
  const hintEl = root.querySelector('[data-hint]');
  const padEl = root.querySelector('[data-pad]');
  const announceEl = root.querySelector('[data-announce]');
  const finalScoreEl = root.querySelector('[data-final-score]');
  const panelEl = root.querySelector('[data-panel]');

  const reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarseMq = window.matchMedia('(pointer: coarse)');

  const held = new Set();
  const pointer = { x: W / 2, y: H / 2, down: false };

  /** @type {'idle'|'playing'|'paused'|'gameover'} */
  let state = 'idle';
  /** @type {GameInstance|null} */
  let current = null;
  /** @type {GameModule|null} */
  let currentDef = null;
  let raf = 0;
  let acc = 0;
  let last = 0;
  let score = 0;
  let shownScore = -1;

  const api = {
    W,
    H,
    STEP,
    COLORS,
    input: { held, pointer },
    setScore,
    addScore,
    gameOver,
    rand,
    randInt,
    get reducedMotion() {
      return reducedMotionMq.matches;
    },
    get isCoarse() {
      return coarseMq.matches;
    },
  };

  /* ---------------------------------------------------------------- canvas */

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Tope de 2: a 3x un móvil triplica el coste de relleno sin ganancia visible.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.imageSmoothingEnabled = false;
    // Asignar width/height limpia el canvas: hay que repintar siempre.
    render();
  }

  function render() {
    if (!current) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);
    // save/restore acota al juego: si deja un alpha o un transform a medias,
    // no corrompe el frame siguiente.
    ctx.save();
    current.draw(ctx);
    ctx.restore();
  }

  let resizeQueued = false;
  const ro = new ResizeObserver(() => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      resize();
    });
  });
  ro.observe(canvas);

  /* ------------------------------------------------------------------ loop */

  function frame(now) {
    acc += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (acc >= STEP && state === 'playing') {
      current.update(STEP);
      acc -= STEP;
    }
    render();
    // El loop se autotermina en cuanto el estado deja de ser 'playing'
    // (por ejemplo si update() ha llamado a gameOver()).
    raf = state === 'playing' ? requestAnimationFrame(frame) : 0;
  }

  function startLoop() {
    if (raf) return;
    last = performance.now();
    acc = 0;
    raf = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  /* ----------------------------------------------------------------- estado */

  function setState(next) {
    state = next;
    root.dataset.state = next;
    if (next === 'playing') startLoop();
    else stopLoop();
  }

  function play() {
    if (!current) return;
    held.clear();
    current.reset();
    shownScore = -1;
    setScore(0);
    setState('playing');
    canvas.focus({ preventScroll: true });
  }

  function resume() {
    if (state !== 'paused') return;
    held.clear();
    setState('playing');
    canvas.focus({ preventScroll: true });
  }

  function pause() {
    if (state !== 'playing') return;
    setState('paused');
  }

  function togglePause() {
    if (state === 'playing') pause();
    else if (state === 'paused') resume();
  }

  // Nunca reanuda sola: volver de otra pestaña y encontrarse la partida ya en
  // marcha (y probablemente perdida) es peor que un clic de más.
  function autoPause() {
    if (state !== 'playing') return;
    setState('paused');
  }

  function gameOver() {
    if (state !== 'playing') return;
    const final = Math.floor(score);
    const best = readHi();
    if (final > best) storeSet(`facelad.arcade.hi.${currentDef.id}`, String(final));
    renderHi();
    if (finalScoreEl) finalScoreEl.textContent = String(final);
    setState('gameover');
    if (announceEl) {
      announceEl.textContent = `Fin del juego. Puntuación ${final}. Récord ${Math.max(final, best)}.`;
    }
  }

  /* --------------------------------------------------------------- puntajes */

  function readHi() {
    const raw = Number(storeGet(`facelad.arcade.hi.${currentDef.id}`));
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  }

  function renderHi() {
    if (hiEl) hiEl.textContent = String(readHi());
  }

  function setScore(value) {
    score = value;
    const shown = Math.floor(value);
    // Escribir textContent en cada frame es thrash de layout para nada.
    if (shown === shownScore) return;
    shownScore = shown;
    if (scoreEl) scoreEl.textContent = String(shown);
  }

  function addScore(delta) {
    setScore(score + delta);
  }

  /* ------------------------------------------------------------------ input */

  function sendAction(action) {
    if (action === ACTIONS.PAUSE) {
      togglePause();
      return;
    }
    if (state === 'playing') {
      if (current && current.onAction) current.onAction(action);
      return;
    }
    if (action !== ACTIONS.PRIMARY) return;
    if (state === 'paused') resume();
    else play();
  }

  /*
   * El teclado se enlaza al canvas (tabindex="0") y no a window: el navegador
   * solo enruta las teclas aquí cuando el canvas tiene el foco, así que el
   * preventDefault de flechas y espacio queda acotado por construcción y no
   * secuestra el scroll del resto de la página.
   */
  canvas.addEventListener('keydown', (event) => {
    const action = KEY_MAP[event.code];
    if (!action) return;
    event.preventDefault();
    held.add(action);
    if (!event.repeat) sendAction(action);
  });

  // El keyup va en window: si el foco cambia con una tecla pulsada, el canvas
  // nunca recibiría el evento y la dirección quedaría pegada.
  window.addEventListener('keyup', (event) => {
    const action = KEY_MAP[event.code];
    if (!action) return;
    held.delete(action);
    if (action === ACTIONS.PRIMARY && state === 'playing' && current && current.onAction) {
      current.onAction(ACTIONS.PRIMARY_UP);
    }
  });

  window.addEventListener('blur', () => held.clear());

  function toLogical(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    };
  }

  let downX = 0;
  let downY = 0;
  let downAt = 0;
  let swiped = false;

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    // preventScroll importa: sin él, enfocar el canvas da un tirón a la página.
    canvas.focus({ preventScroll: true });
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    const p = toLogical(event);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.down = true;
    downX = event.clientX;
    downY = event.clientY;
    downAt = performance.now();
    swiped = false;
    // Pulsar (no soltar) dispara PRIMARY para que el corredor pueda medir la
    // duración del toque y hacer salto corto o largo.
    if (state === 'playing' && current && current.onAction) current.onAction(ACTIONS.PRIMARY);
  });

  canvas.addEventListener('pointermove', (event) => {
    const p = toLogical(event);
    pointer.x = p.x;
    pointer.y = p.y;
    if (!pointer.down || swiped) return;
    const dx = event.clientX - downX;
    const dy = event.clientY - downY;
    if (Math.hypot(dx, dy) < SWIPE_MIN) return;
    swiped = true;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    let dir;
    if (horizontal) dir = dx > 0 ? ACTIONS.RIGHT : ACTIONS.LEFT;
    else dir = dy > 0 ? ACTIONS.DOWN : ACTIONS.UP;
    sendAction(dir);
  });

  function endPointer(event) {
    if (!pointer.down) return;
    pointer.down = false;
    if (canvas.releasePointerCapture && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (state === 'playing') {
      if (current && current.onAction) current.onAction(ACTIONS.PRIMARY_UP);
      return;
    }
    const heldFor = performance.now() - downAt;
    const dist = Math.hypot(event.clientX - downX, event.clientY - downY);
    if (!swiped && heldFor < TAP_MS && dist < TAP_MAX) sendAction(ACTIONS.PRIMARY);
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  if (padEl) {
    padEl.querySelectorAll('[data-dir]').forEach((button) => {
      const action = button.dataset.dir;
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
        held.add(action);
        sendAction(action);
      });
      // pointercancel y lostpointercapture importan: sin ellos, un dedo que se
      // desliza fuera del botón deja la dirección pulsada para siempre.
      const release = () => held.delete(action);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });
  }

  root.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'play' || action === 'restart') play();
      else if (action === 'resume') resume();
      else if (action === 'pause') togglePause();
    });
  });

  /* ------------------------------------------------------------ ciclo de vida */

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) autoPause();
  });
  window.addEventListener('blur', autoPause);

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.intersectionRatio < 0.35) autoPause();
      }
    },
    { threshold: [0, 0.35, 1] },
  );
  io.observe(root);

  /* -------------------------------------------------------------- pestañas */

  function renderHint() {
    if (!hintEl || !currentDef) return;
    hintEl.textContent = coarseMq.matches ? currentDef.hintTouch : currentDef.hint;
  }

  function syncPad() {
    if (!padEl) return;
    padEl.hidden = !(currentDef && currentDef.pad && coarseMq.matches);
  }

  if (typeof coarseMq.addEventListener === 'function') {
    coarseMq.addEventListener('change', () => {
      renderHint();
      syncPad();
    });
  }

  function select(id) {
    const def = games.find((game) => game.id === id) || games[0];
    if (!def) return;
    stopLoop();
    held.clear();
    pointer.down = false;
    currentDef = def;
    current = def.create(api);
    current.reset();
    shownScore = -1;
    setScore(0);
    renderHi();
    renderHint();
    syncPad();
    canvas.setAttribute('aria-label', `Área de juego: ${def.name}`);
    if (announceEl) announceEl.textContent = '';
    if (tabsEl) {
      tabsEl.querySelectorAll('[role="tab"]').forEach((tab) => {
        const active = tab.dataset.game === def.id;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        if (active && panelEl) panelEl.setAttribute('aria-labelledby', tab.id);
      });
    }
    setState('idle');
    // Un único frame estático de fondo: el tablero se ve tras el overlay y el
    // consumo de CPU es exactamente cero hasta que el usuario pulse Jugar.
    resize();
    render();
    storeSet('facelad.arcade.last', def.id);
  }

  if (tabsEl) {
    const tabs = [...tabsEl.querySelectorAll('[role="tab"]')];
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab.dataset.game));
      tab.addEventListener('keydown', (event) => {
        let next = null;
        if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
        else if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
        else if (event.key === 'Home') next = tabs[0];
        else if (event.key === 'End') next = tabs[tabs.length - 1];
        if (!next) return;
        event.preventDefault();
        next.focus();
        select(next.dataset.game);
      });
    });
  }

  const remembered = storeGet('facelad.arcade.last');
  select(games.some((game) => game.id === remembered) ? remembered : games[0].id);
}
