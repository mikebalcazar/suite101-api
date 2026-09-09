/* suite101-api — la única puerta a los datos de la suite 101.
 *
 * Ninguna app toca una base directo. Ni Firestore, ni D1, ni SQLite. Todas
 * pasan por aquí, y aquí viven los permisos, las validaciones y la regla de un
 * solo escritor por campo — en código, no en reglas de base de datos que fallan
 * sin avisar.
 *
 * Forma de Hono, como roster101: ese repositorio es el molde.
 */

import { Hono } from 'hono';
import auth, { conSesion, yo } from './rutas/auth';
import orgs from './rutas/orgs';
import admin from './rutas/admin';
import { err, ok, type Vars } from './http';
import type { Env } from './entorno';
import { VERSION_CONTRATO } from '../schema/tipos';

export { OrgDB } from './org-db';

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

/* ─────────────── CORS ───────────────
 * Las apps viven en orígenes distintos del de la API (dash101 en Netlify, las
 * demás en Cloudflare), así que la cookie va con SameSite=None y el origen se
 * revisa contra una lista. Con credenciales no se puede contestar `*`: hay que
 * devolver el origen exacto o el navegador tira la respuesta. */

app.use('*', async (c, next) => {
  const origen = c.req.header('Origin');
  const permitidos = String(c.env.ORIGENES || '').split(',').map((s) => s.trim()).filter(Boolean);
  const vale = origen && (permitidos.includes(origen) || permitidos.includes('*'));

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: vale
        ? {
            'Access-Control-Allow-Origin': origen!,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,X-App',
            'Access-Control-Max-Age': '86400',
            Vary: 'Origin',
          }
        : { Vary: 'Origin' },
    });
  }

  await next();
  if (vale) {
    c.res.headers.set('Access-Control-Allow-Origin', origen!);
    c.res.headers.set('Access-Control-Allow-Credentials', 'true');
    c.res.headers.set('Vary', 'Origin');
  }
});

app.use('*', conSesion);

/* ─────────────── salud ───────────────
 * Lo primero que mide el verificador desde el corredor de GitHub. Dice la
 * versión del contrato para que una app pueda darse cuenta de que está
 * hablando con una API más nueva que su copia de schema/tipos.ts. */

app.get('/salud', async (c) => {
  let d1 = 'no';
  try {
    const r = await c.env.MASTER.prepare(`SELECT COUNT(*) AS n FROM orgs`).first<{ n: number }>();
    d1 = `si (${r?.n ?? 0} orgs)`;
  } catch (e) {
    d1 = `error: ${(e as Error).message}`;
  }
  return ok(c, {
    servicio: 'suite101-api',
    version: c.env.API_VERSION ?? '0.0.0',
    contrato: VERSION_CONTRATO,
    entorno: c.env.ENTORNO,
    d1,
    at: new Date().toISOString(),
  });
});

// La portada de una API tiene que decir qué es y por dónde se empieza. Además
// es lo primero que mide el verificador, y una raíz que no contesta 200 deja el
// despliegue en rojo con el servicio perfecto.
app.get('/', (c) =>
  ok(c, {
    servicio: 'suite101-api',
    que_es: 'La unica puerta a los datos de la suite 101. Ninguna app toca una base directo.',
    contrato: VERSION_CONTRATO,
    empieza_en: ['/salud', '/auth/codigo', '/yo', '/orgs/:org'],
    manda: 'la cookie de sesion y la cabecera X-App',
  }),
);

app.get('/yo', yo);
app.route('/auth', auth);
app.route('/orgs', orgs);
app.route('/admin', admin);

app.notFound((c) => err(c as never, 'no_encontrado', 404, { ruta: c.req.path }));

app.onError((e, c) => {
  console.error('falla', e);
  return err(c as never, 'falla_interna', 500, { detalle: e.message });
});

export default app;
