import { applyD1Migrations, env } from 'cloudflare:test';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import type { Env } from '../src/entorno';

// El D1 «master» arranca vacio en cada corrida. Se le aplican las migraciones
// de migrations/d1 tal cual, las mismas que corren en produccion.
const e = env as unknown as Env & { MIGRACIONES_D1: D1Migration[] };
await applyD1Migrations(e.MASTER, e.MIGRACIONES_D1);
