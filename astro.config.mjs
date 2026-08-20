import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // El sitio se sirve en un dominio propio (public/CNAME), por lo que la raíz
  // es "/" y NO debe fijarse `base`: hacerlo rompería las rutas de los assets.
  site: 'https://default.facelad.com',
});
