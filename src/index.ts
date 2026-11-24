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
import licencias, { paginaLicencia } from './rutas/licencias';
import nube from './rutas/nube';
import importar, { paginaImportar } from './rutas/importar';
import roster from './rutas/roster';
import { puertaDeLaSuite } from './portal';
import { resolverHost } from './dominios';
import { err, ok, type Vars } from './http';
import type { Env } from './entorno';
import { VERSION_CONTRATO } from '../schema/tipos';
import { igualSeguro } from './lib';
import type { ApiOrgDB } from './org-db';

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
            'Access-Control-Allow-Headers': 'Content-Type,X-App,Authorization',
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

/* 2-oct · la empresa del dominio. La puerta de las empresas (puerta/) recibe
 * roster.acme.com, averigua de quién es y lo reenvía a la app con
 * `X-Dominio-Empresa: acme.com` y `X-Host-Original`. Aquí se vuelve a
 * resolver —no se confía en la cabecera para nada que abra puertas: sólo
 * ACOTA (la sesión ve esa empresa y nada más) y da el nombre para la
 * portada—. Quien mande la cabecera a mano a api.taller101.com no gana nada
 * que no tuviera. */
app.use('*', async (c, next) => {
  const dominio = c.req.header('X-Dominio-Empresa');
  const host = c.req.header('X-Host-Original');
  if (dominio && host) {
    const r = await resolverHost(c.env, host);
    if (r && r.dominio === dominio.trim().toLowerCase()) c.set('dominio', r);
  }
  await next();
});

/* La puerta de la suite (suite101.taller101.com) va antes de la sesión: es
 * una página pública con ligas, no necesita saber quién la abre. */
app.use('*', puertaDeLaSuite);

/** GET /dominios/resolver?host=roster.acme.com — para la puerta de las
 *  empresas: de quién es ese host y a qué app va. Público y sin nada que no
 *  esté ya en el propio nombre: la empresa y su nombre comercial. */
app.get('/dominios/resolver', async (c) => {
  const host = c.req.query('host') || '';
  const r = await resolverHost(c.env, host);
  if (!r) return err(c, 'dominio_desconocido', 404, { host });
  if (!r.activa) return err(c, 'org_inactiva', 403, { host });
  return ok(c, { org_id: r.org_id, nombre: r.nombre, dominio: r.dominio, app: r.app });
});

app.use('*', conSesion);

/* ─────────────── salud ───────────────
 * Lo primero que mide el verificador desde el corredor de GitHub. Dice la
 * versión del contrato para que una app pueda darse cuenta de que está
 * hablando con una API más nueva que su copia de schema/tipos.ts. */

app.get('/salud', async (c) => {
  let d1 = 'no';
  // 16-oct-2026 · Cuánto tarda una consulta al D1 desde donde corrió este
  // pedido, y en qué centro de datos: así se mide la colocación de la API.
  const t0 = Date.now();
  try {
    const r = await c.env.MASTER.prepare(`SELECT COUNT(*) AS n FROM orgs`).first<{ n: number }>();
    d1 = `si (${r?.n ?? 0} orgs)`;
  } catch (e) {
    d1 = `error: ${(e as Error).message}`;
  }
  const d1_ms = Date.now() - t0;
  const colo = (c.req.raw as Request & { cf?: { colo?: string } }).cf?.colo ?? null;
  return ok(c, {
    servicio: 'suite101-api',
    version: c.env.API_VERSION ?? '0.0.0',
    contrato: VERSION_CONTRATO,
    entorno: c.env.ENTORNO,
    d1,
    d1_ms,
    colo,
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
    empieza_en: ['/salud', '/auth/codigo', '/yo', '/orgs/:org', '/licencias/llave', '/licencias/entrar', '/nube/indice'],
    manda: 'la cookie de sesion (o Authorization: Bearer, para una app empacada) y la cabecera X-App',
  }),
);

/* 0.107.1 · Volver a repartir el IVA de los pagos ya ligados (Mike,
 * 18-nov-2026, con botones: «Corregirlas todas»). No tiene sesión ni la
 * necesita: la abre una llave de un solo uso que el workflow
 * `corregir-reparto.yml` inventa, pone en el Worker y borra al terminar.
 * Sin esa llave puesta, la ruta no existe. `?modo=corregir` escribe;
 * cualquier otra cosa es ensayo y no toca nada. */
app.post('/interno/:o/reparto-iva', async (c) => {
  const llave = c.env.LLAVE_CORRECCION;
  if (!llave || llave.length < 32 || !igualSeguro(c.req.header('X-Llave-Correccion') ?? '', llave)) {
    return err(c, 'no_encontrado', 404);
  }
  const org = c.req.param('o');
  const existe = await c.env.MASTER.prepare(`SELECT id FROM orgs WHERE id = ?`).bind(org).first();
  if (!existe) return err(c, 'org_desconocida', 404, { org });
  const stub = c.env.ORG.get(c.env.ORG.idFromName(org)) as unknown as ApiOrgDB;
  return ok(c, { org, ...(await stub.corregirReparto(c.req.query('modo') !== 'corregir')) });
});

/* 0.108.1 · Cargar los conceptos y los ingresos de un proyecto desde la hoja
 * de Mike (19-nov-2026: «cargar los ingresos y los conceptos del proyecto de
 * qualitas»). La misma llave de un solo uso; la pone `cargar-proyecto.yml`.
 * `?modo=cargar` escribe (con proyecto_id y cuenta_id exactos y sin
 * repetidos); cualquier otra cosa sólo busca y mide. */
app.post('/interno/:o/carga-proyecto', async (c) => {
  const llave = c.env.LLAVE_CORRECCION;
  if (!llave || llave.length < 32 || !igualSeguro(c.req.header('X-Llave-Correccion') ?? '', llave)) {
    return err(c, 'no_encontrado', 404);
  }
  const org = c.req.param('o');
  const existe = await c.env.MASTER.prepare(`SELECT id FROM orgs WHERE id = ?`).bind(org).first();
  if (!existe) return err(c, 'org_desconocida', 404, { org });
  const b = await c.req.json<Record<string, any>>().catch(() => null);
  if (!b || !Array.isArray(b.conceptos) || !Array.isArray(b.ingresos)) return err(c, 'datos_invalidos', 400, { falta: ['conceptos', 'ingresos'] });
  if (b.conceptos.length > 500 || b.ingresos.length > 500) return err(c, 'datos_invalidos', 400, { regla: 'a lo más 500 de cada uno' });
  const stub = c.env.ORG.get(c.env.ORG.idFromName(org)) as unknown as ApiOrgDB;
  /* 0.116.1 · Sólo LEER el estado de cuenta de un cliente, con la hoja de
   * cada proyecto: lo mismo que piden `/clientes/:id/estado-de-cuenta` y
   * `/proyectos/:id/estado`, para armar el PDF de dash fuera de una sesión
   * (Mike, 24-nov-2026: «necesito el PDF del estado de cuenta general de IMA,
   * pero deja afuera ahorita el proyecto Mondelez»). No escribe nada, ni con
   * `?modo=cargar`. */
  if (typeof b.estado_cliente === 'string' && b.estado_cliente.trim()) {
    const cliente = await stub.estadoDeCuenta(b.estado_cliente.trim());
    if (!cliente) return err(c, 'no_encontrado', 404, { que: 'cliente', id: b.estado_cliente });
    const fuera = new Set(Array.isArray(b.sin_proyectos) ? b.sin_proyectos.map((x: unknown) => String(x)) : []);
    const ids = (cliente.proyectos as Array<Record<string, unknown>>).map((p) => String(p.id)).filter((id) => !fuera.has(id));
    const proyectos = [];
    for (const id of ids) { const e = await stub.estadoDelProyecto(id); if (e) proyectos.push(e); }
    return ok(c, { org, estado_cliente: { cliente, proyectos } });
  }
  return ok(c, { org, ...(await stub.cargaDeProyecto({
    buscar: String(b.buscar ?? ''), proyecto_id: b.proyecto_id ?? null, cuenta_id: b.cuenta_id ?? null,
    conceptos: b.conceptos, ingresos: b.ingresos, ligar: b.ligar === true,
    crear_proyecto: b.crear_proyecto && typeof b.crear_proyecto === 'object' ? {
      nombre: String(b.crear_proyecto.nombre ?? ''), cliente_id: String(b.crear_proyecto.cliente_id ?? ''),
      estado: b.crear_proyecto.estado == null ? undefined : String(b.crear_proyecto.estado),
      descripcion: b.crear_proyecto.descripcion == null ? undefined : String(b.crear_proyecto.descripcion),
    } : null,
    borrar_proyectos: Array.isArray(b.borrar_proyectos) ? b.borrar_proyectos.map((x: unknown) => String(x)) : null,
    activar_proyectos: Array.isArray(b.activar_proyectos) ? b.activar_proyectos.map((x: unknown) => String(x)) : null,
    sin_ingresos_a_planeando: b.sin_ingresos_a_planeando && typeof b.sin_ingresos_a_planeando === 'object' ? { marcar: b.sin_ingresos_a_planeando.marcar === true } : null,
    partidas_por_pagar: b.partidas_por_pagar && typeof b.partidas_por_pagar === 'object' ? {
      borrar: b.partidas_por_pagar.borrar === true, apagar_cronograma: b.partidas_por_pagar.apagar_cronograma === true,
    } : null,
    crear_cliente: b.crear_cliente && typeof b.crear_cliente === 'object' ? {
      nombre: String(b.crear_cliente.nombre ?? ''), rfc: b.crear_cliente.rfc == null ? null : String(b.crear_cliente.rfc),
    } : null,
    buscar_cliente: typeof b.buscar_cliente === 'string' ? b.buscar_cliente : undefined, escribir: c.req.query('modo') === 'cargar',
    traer: Array.isArray(b.traer) ? b.traer.slice(0, 50) : undefined,
    sin_ligar: b.sin_ligar && typeof b.sin_ligar === 'object' ? { rfc: String(b.sin_ligar.rfc ?? '') } : null,
    ligar_existentes: Array.isArray(b.ligar_existentes) ? b.ligar_existentes.slice(0, 50) : undefined,
    conciliar: b.conciliar && typeof b.conciliar === 'object' ? { rfc: String(b.conciliar.rfc ?? '') } : null,
    corregir: Array.isArray(b.corregir) ? b.corregir.slice(0, 50) : undefined,
    borrar: Array.isArray(b.borrar) ? b.borrar.slice(0, 50) : undefined,
  })) });
});

app.get('/yo', yo);
app.route('/auth', auth);
app.route('/orgs', orgs);

/* roster101 (0.17.0): la puerta de los expedientes. Es aparte de /orgs porque
 * el trabajador entra sin cuenta en la suite —su correo y un código— y esa
 * puerta exige sesión para todo. Aquí la sesión de la suite es opcional: si
 * viene y le toca, el motor abre el panel de la empresa; si no, sólo abre lo
 * del trabajador con su propia cookie. */
app.route('/roster', roster);

/* La página del importador va ANTES del router de /admin, que exige sesión
 * para todo lo que cuelga de él. Quien abre esta página todavía no ha entrado
 * —viene a entrar— y un 401 en JSON no le sirve de nada a un humano con un
 * navegador. La página es solo la pantalla: el POST que escribe sí está detrás
 * de la sesión y del superadmin. */
app.get('/admin/importar', paginaImportar);

/* Las licencias de las apps que se venden (draw101 primero). `activar` y
 * `latido` los llama la app instalada, sin sesión ni X-App; lo demás es del
 * panel de Mike y pide superadmin. */
/* La pantalla de activación con cuenta (0.20.0) va ANTES del enrutador: el
 * enrutador pide superadmin de cierto punto en adelante, y esta pantalla la
 * abre quien compró la licencia, que no es superadmin de nada. */
app.get('/licencias/entrar', paginaLicencia);
app.route('/licencias', licencias);

/* /nube — los archivos de draw101 (0.22.0). Entra la app instalada con su
 * token de licencia, no con la cookie de la suite: es un programa, no una
 * pestaña. Todo lo que guarda va cifrado desde la máquina del dueño. */
app.route('/nube', nube);

app.route('/admin', admin);
app.route('/admin', importar);

app.notFound((c) => err(c as never, 'no_encontrado', 404, { ruta: c.req.path }));

app.onError((e, c) => {
  console.error('falla', e);
  return err(c as never, 'falla_interna', 500, { detalle: e.message });
});

export default app;
