# Facelad Team

## Vista generada por defecto para hosting y dominios de Facelad

Página de bienvenida que se muestra automáticamente al crear una nueva cuenta de hosting y/o dominio en Facelad.

---

## Stack

- [Astro](https://astro.build/) — framework de generación estática
- CSS vanilla con diseño responsive (sin frameworks externos)
- Canvas 2D para el arcade (sin librerías, sin backend)

## Estructura del proyecto

```
facelad_default_view/
├── .github/
│   └── workflows/
│       └── deploy.yml          Build de Astro y publicación en Pages
├── public/
│   ├── image/
│   │   ├── facelad.png
│   │   └── favicon.ico
│   └── CNAME
├── src/
│   ├── components/
│   │   └── GameArcade.astro    Markup y estilos del arcade
│   ├── layouts/
│   │   └── Layout.astro        Reset global, tokens de marca y .btn
│   ├── pages/
│   │   └── index.astro         Portada: hero + contacto + arcade
│   └── scripts/
│       └── arcade/
│           ├── engine.js       Loop, canvas/DPR, input, estados, puntajes
│           ├── snake.js
│           ├── runner.js
│           └── shooter.js
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## Comandos

| Comando           | Descripción                         |
| ----------------- | ----------------------------------- |
| `npm install`     | Instala las dependencias            |
| `npm run dev`     | Inicia el servidor local            |
| `npm run build`   | Genera el sitio estático en `dist/` |
| `npm run preview` | Previsualiza el build localmente    |

## Despliegue

El sitio se publica en `default.facelad.com` mediante GitHub Actions: cada push a
`main` compila el proyecto y sube `dist/` a GitHub Pages.

> **Importante:** en Settings → Pages, el origen debe ser **"GitHub Actions"**.
> Si se cambia a "Deploy from a branch", Pages sirve el repositorio en crudo a
> través de Jekyll, que ignora los directorios con guion bajo. Eso deja
> `dist/_astro/` en 404 y el arcade deja de funcionar en silencio, porque el
> JavaScript solo existe después del build.

El dominio propio se sirve desde la raíz, así que `astro.config.mjs` fija `site`
pero **no** debe fijar `base`: hacerlo rompería las rutas de los assets.

## Responsive

El diseño se adapta a todos los tamaños de pantalla:

- Tipografía fluida con `clamp()` para título y párrafo
- Footer apilado verticalmente en pantallas menores a 480px
- Logo reducido en móvil
- `min-height` en lugar de altura fija para evitar desbordamiento de contenido
- El canvas del arcade usa `aspect-ratio` para reservar su caja antes de que
  corra el JavaScript, de modo que no provoca desplazamiento de layout

## El arcade

Tres mini-juegos bajo la portada: **Snake**, **Corredor** y **Nave**. Comparten
un motor (`engine.js`) que resuelve el loop, el escalado del canvas, el input y
la persistencia; cada juego solo aporta `reset`, `update`, `draw` y `onAction`.

Puntos a tener en cuenta si se toca:

- Los juegos dibujan en un espacio **lógico de 480x320** y nunca leen
  `canvas.width`. El escalado a píxeles de dispositivo lo absorbe un único
  `setTransform` en `resize()`, con el DPR capado a 2.
- El **timestep es fijo** (1/60). Con delta variable, el salto del corredor
  alcanzaría distinta altura según los Hz de la pantalla.
- Las teclas se escuchan en el **canvas enfocado**, no en `window`, para que el
  `preventDefault` de flechas y espacio no secuestre el scroll de la página.
- Los récords se guardan en `localStorage` bajo `facelad.arcade.hi.<juego>`,
  siempre dentro de `try/catch`: Safari en navegación privada lanza al leer.
- No hay auto-arranque. En reposo se pinta un único frame y el consumo de CPU
  es cero hasta que el usuario pulsa *Jugar*.

Los tres módulos se importan de forma estática (~5.3 kB gzip en total). Si algún
día se añaden más juegos, conviene pasar a `import()` dinámico por pestaña.
