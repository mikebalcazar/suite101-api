import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

// Las pruebas corren dentro de workerd, con el Durable Object y el D1 de
// verdad: no hay dobles. Lo unico que cambia respecto de produccion es
// ENTORNO, para que /auth/codigo devuelva el codigo y se pueda entrar sin
// buzon de correo. Que en produccion NO lo devuelva es, a su vez, otra de las
// cosas que se comprueban (prueba de humo, en el corredor).
const raiz = path.dirname(fileURLToPath(import.meta.url));
const migraciones = await readD1Migrations(path.join(raiz, 'migrations/d1'));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        // ORIGENES NO se toca: las pruebas de CORS tienen que medir la lista
        // de verdad, la de wrangler.toml. Con un comodin aqui, la prueba de
        // que un origen desconocido no recibe permiso saldria verde siempre y
        // no probaria nada.
        bindings: { MIGRACIONES_D1: migraciones, ENTORNO: 'prueba' },
      },
    }),
  ],
  test: {
    include: ['pruebas/**/*.spec.ts'],
    setupFiles: ['./pruebas/preparar.ts'],
    testTimeout: 20000,
  },
});
