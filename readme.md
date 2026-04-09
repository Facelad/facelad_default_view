# Facelad Team

## Vista generada por defecto para hosting y dominios de Facelad

Página de bienvenida que se muestra automáticamente al crear una nueva cuenta de hosting y/o dominio en Facelad.

---

## Stack

- [Astro](https://astro.build/) — framework de generación estática
- CSS vanilla con diseño responsive (sin frameworks externos)

## Estructura del proyecto

```
facelad_default_view/
├── public/
│   ├── image/
│   │   ├── facelad.png
│   │   └── favicon.ico
│   └── CNAME
├── src/
│   ├── layouts/
│   │   └── Layout.astro
│   └── pages/
│       └── index.astro
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## Comandos

| Comando         | Descripción                          |
| --------------- | ------------------------------------ |
| `npm install`   | Instala las dependencias             |
| `npm run dev`   | Inicia el servidor local             |
| `npm run build` | Genera el sitio estático en `dist/`  |
| `npm run preview` | Previsualiza el build localmente   |

## Responsive

El diseño se adapta a todos los tamaños de pantalla:

- Tipografía fluida con `clamp()` para título y párrafo
- Footer apilado verticalmente en pantallas menores a 480px
- Logo reducido en móvil
- `min-height` en lugar de altura fija para evitar desbordamiento de contenido
