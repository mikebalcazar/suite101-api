/* Todo lo que cuelga de /orgs/:o. Una petición pasa por cuatro puertas antes
 * de tocar el SQLite de la empresa:
 *
 *   1. ¿hay sesión?
 *   2. ¿quién es en ESTA empresa: miembro, personal o cliente?
 *   3. ¿la app que dice ser (X-App) está activa para la empresa?
 *   4. ¿esa app puede escribir esos campos? (permisos.ts, §7)
 *
 * La cuarta es la que más importa y la que hay que probar que dice que NO.
 */

import { Hono } from 'hono';
import { DEFS, columnasDinero, esTabla } from '../tablas';
import type { ApiOrgDB } from '../org-db';
import { APPEND_ONLY, POR_SU_RUTA, revisarEscritura } from '../permisos';
import { acceso, accesoDe, miembro, org, ponerAcceso, quitarAcceso, usuarioPorCorreo } from '../maestro';
import { crearUsuario } from '../maestro';
import { guardarPin, normalizaCorreo, pinAceptable, ulid } from '../lib';
import { err, ok, type Ctx, type Quien, type Vars } from '../http';
import type { Env } from '../entorno';
import { APPS, LLAVE_APP, type App, type Tabla } from '../../schema/tipos';

const rutas = new Hono<{ Bindings: Env; Variables: Vars }>();

/** Tablas con dinero que el personal sin `ve_dinero` no abre. */
const TABLAS_DINERO: Tabla[] = ['movimientos', 'cuentas', 'opex', 'cotizaciones', 'partidas', 'conciliaciones', 'conciliacion_cuentas'];

const stub = (c: Ctx): ApiOrgDB => c.env.ORG.get(c.env.ORG.idFromName(c.get('org_id'))) as unknown as ApiOrgDB;

/** Los paneles de control: no aparecen en `orgs.apps` ni en `miembros.apps`. */
const PANELES: ReadonlySet<App> = new Set<App>(['master101', 'workshop101', 'suite101']);

/* ─────────────── las cuatro puertas ─────────────── */

rutas.use('/:o/*', async (c, next) => {
  const s = c.get('sesion');
  if (!s) return err(c, 'sin_sesion', 401);

  const nombreApp = c.req.header('X-App');
  if (!nombreApp) return err(c, 'sin_app', 400, { manda: 'X-App: dash101|quell101|peek101|cotizador101|roster101|nest101|master101|workshop101|suite101' });
  if (!(APPS as readonly string[]).includes(nombreApp)) return err(c, 'app_desconocida', 400, { recibido: nombreApp, apps: APPS });
  const app = nombreApp as App;

  const org_id = c.req.param('o')!;
  const empresa = await org(c.env, org_id);
  if (!empresa) return err(c, 'org_desconocida', 404, { org: org_id });
  if (!empresa.activa) return err(c, 'org_inactiva', 403);

  // master101, workshop101 y suite101 son paneles de control: no se apagan
  // desde `apps` ni se reparten por persona.
  const esPanel = PANELES.has(app);
  if (!esPanel && empresa.apps[LLAVE_APP[app]] !== true) {
    return err(c, 'app_inactiva', 403, { app, activas: Object.entries(empresa.apps).filter(([, v]) => v).map(([k]) => k) });
  }

  let quien: Quien | null = null;
  const m = await miembro(c.env, org_id, s.usuario_id);
  if (m) {
    quien = {
      clase: 'miembro',
      usuario_id: s.usuario_id,
      rol: m.rol,
      negocios: m.negocios,
      ve_dinero: true,
      ve_costos: m.rol === 'owner' || m.rol === 'admin' || m.rol === 'socio',
    };
  } else if (s.superadmin) {
    quien = { clase: 'miembro', usuario_id: s.usuario_id, rol: 'owner', negocios: [], ve_dinero: true, ve_costos: true };
  } else {
    const a = await acceso(c.env, s.usuario_id);
    if (a && a.org_id === org_id) {
      if (a.tipo === 'cliente') {
        quien = { clase: 'cliente', usuario_id: s.usuario_id, negocios: [], ref_id: a.ref_id, ve_dinero: false, ve_costos: false };
      } else {
        const persona = (await stubDe(c, org_id).obtener('personal', a.ref_id)) as Record<string, unknown> | null;
        quien = {
          clase: 'personal',
          usuario_id: s.usuario_id,
          negocios: [],
          ref_id: a.ref_id,
          ve_dinero: !!persona?.ve_dinero,
          ve_costos: false,
        };
      }
    }
  }
  if (!quien) return err(c, 'sin_permiso', 403, { org: org_id });

  // Contrato 0.6.0: la lista de apps por persona (`miembros.apps`, vacía =
  // todas las de la empresa) se aplica aquí. Antes se guardaba y no se leía.
  if (m && !esPanel && m.apps.length > 0 && !m.apps.includes(LLAVE_APP[app])) {
    return err(c, 'app_no_permitida', 403, { app, permitidas: m.apps });
  }
  // workshop101 es el panel del administrador de la empresa: entra el dueño,
  // la administración y el superadmin; un socio o alguien de oficina, no.
  if (app === 'workshop101' && !(quien.clase === 'miembro' && (quien.rol === 'owner' || quien.rol === 'admin'))) {
    return err(c, 'sin_permiso', 403, { motivo: 'solo_administra', org: org_id });
  }

  c.set('app', app);
  c.set('org_id', org_id);
  c.set('quien', quien);
  await next();
});

const stubDe = (c: Ctx, org_id: string): ApiOrgDB => c.env.ORG.get(c.env.ORG.idFromName(org_id)) as unknown as ApiOrgDB;

/* ─────────────── la empresa y su pool ─────────────── */

rutas.get('/:o', async (c) => {
  const empresa = await org(c.env, c.get('org_id'));
  return ok(c, { id: empresa!.id, nombre: empresa!.nombre, apps: empresa!.apps, moneda: empresa!.moneda });
});

rutas.get('/:o/pool', async (c) => {
  if (c.get('quien').clase === 'cliente') return err(c, 'sin_permiso', 403);
  return ok(c, await stub(c).pool());
});

/* ─────────────── /peek — el cliente ve lo suyo ───────────────
 * Los totales vienen calculados en la misma respuesta que la lista, para que
 * el KPI y la tabla no se puedan contradecir. */

rutas.get('/:o/peek', async (c) => {
  const quien = c.get('quien');
  const cliente_id = quien.clase === 'cliente' ? quien.ref_id! : c.req.query('cliente_id');
  if (!cliente_id) return err(c, 'datos_invalidos', 400, { falta: 'cliente_id' });
  if (quien.clase === 'personal') return err(c, 'sin_permiso', 403);
  const datos = await stub(c).peek(cliente_id);
  if (!datos) return err(c, 'no_encontrado', 404);
  return ok(c, datos);
});

/* ─────────────── ítems: etapa, exportar, vender ─────────────── */

rutas.post('/:o/items/:id/etapa', async (c) => {
  const quien = c.get('quien');
  if (quien.clase === 'cliente') return err(c, 'sin_permiso', 403);

  const cuerpo = await c.req.json<{ etapa?: number; nota?: string; foto?: string }>().catch(() => ({}) as never);
  if (cuerpo.etapa === undefined) return err(c, 'datos_invalidos', 400, { falta: 'etapa' });

  // El instalador no puede marcar «anticipo pagado»: lo dice
  // personal.etapas_permitidas y lo valida la API, no la pantalla.
  let permitidas: number[] | null = null;
  let persona_id: string | null = null;
  if (quien.clase === 'personal') {
    persona_id = quien.ref_id!;
    const persona = (await stub(c).obtener('personal', persona_id)) as Record<string, unknown> | null;
    const lista = (persona?.etapas_permitidas as number[] | undefined) ?? [];
    permitidas = lista.map(Number);
  }

  const r = await stub(c).moverEtapa({
    item_id: c.req.param('id')!,
    etapa: Number(cuerpo.etapa),
    nota: cuerpo.nota ?? null,
    foto: cuerpo.foto ?? null,
    usuario_id: quien.usuario_id,
    persona_id,
    etapas_permitidas: permitidas,
  });
  if (!r.ok) return err(c, r.error, r.error === 'no_encontrado' ? 404 : r.error === 'etapa_no_permitida' ? 403 : 400, r.detalle);
  return ok(c, { item: r.item, avance: r.avance });
});

rutas.post('/:o/items/exportar', async (c) => {
  const app = c.get('app');
  const permiso = revisarEscritura('items', app, ['nombre', 'monto', 'estado', 'origen']);
  if (!permiso.ok) return err(c, permiso.error, 403, permiso.detalle);

  const cuerpo = await c.req.json<{ cotizacion_id?: string; lineas?: Array<Record<string, unknown>>; negocio_id?: string; cliente_id?: string }>().catch(() => ({}) as never);
  if (!cuerpo.lineas?.length) return err(c, 'datos_invalidos', 400, { falta: 'lineas' });
  for (const l of cuerpo.lineas) {
    if (l.monto !== undefined && !Number.isInteger(Number(l.monto))) {
      return err(c, 'dinero_no_entero', 400, { monto: l.monto, regla: 'centavos, INTEGER' });
    }
  }
  const r = await stub(c).exportarItems({
    cotizacion_id: cuerpo.cotizacion_id ?? '',
    lineas: cuerpo.lineas,
    negocio_id: cuerpo.negocio_id ?? '',
    cliente_id: cuerpo.cliente_id ?? '',
    usuario_id: c.get('quien').usuario_id,
  });
  return ok(c, r, 201);
});

rutas.post('/:o/items/vender', async (c) => {
  const app = c.get('app');
  const permiso = revisarEscritura('items', app, ['estado', 'proyecto_id']);
  if (!permiso.ok) return err(c, permiso.error, 403, permiso.detalle);

  const cuerpo = await c.req.json<{ item_ids?: string[]; proyecto_id?: string; nombre_proyecto?: string }>().catch(() => ({}) as never);
  if (!cuerpo.item_ids?.length) return err(c, 'datos_invalidos', 400, { falta: 'item_ids' });
  const r = await stub(c).venderItems({
    item_ids: cuerpo.item_ids,
    proyecto_id: cuerpo.proyecto_id ?? null,
    nombre_proyecto: cuerpo.nombre_proyecto,
    app,
    usuario_id: c.get('quien').usuario_id,
  });
  if (!r.ok) return err(c, r.error, 404, r.detalle);
  return ok(c, { proyecto: r.proyecto, items: r.items });
});

/* ─────────────── dar acceso a un cliente o a una persona ───────────────
 * dash101 activa el portal de un cliente; roster101 el de una persona. La API
 * crea el usuario y el acceso en D1 y marca `usuario_id` dentro del DO: son
 * dos bases distintas y por eso esto no lo puede hacer una app sola. */

for (const par of [
  { tabla: 'clientes' as Tabla, tipo: 'cliente' as const, app: 'dash101' as App },
  { tabla: 'personal' as Tabla, tipo: 'personal' as const, app: 'roster101' as App },
]) {
  rutas.post(`/:o/${par.tabla}/:id/acceso`, async (c) => {
    const quien = c.get('quien');
    if (quien.clase !== 'miembro') return err(c, 'sin_permiso', 403);
    const cuerpo = await c.req.json<{ correo?: string; pin?: string }>().catch(() => ({}) as never);
    const correo = normalizaCorreo(cuerpo.correo);
    const pin = String(cuerpo.pin || '').replace(/\D/g, '');
    if (!correo) return err(c, 'datos_invalidos', 400, { falta: 'correo' });
    if (!pinAceptable(pin)) return err(c, 'datos_invalidos', 400, { pin: 'seis dígitos, y no una escalera ni seis iguales' });

    const fila = (await stub(c).obtener(par.tabla, c.req.param('id')!)) as Record<string, unknown> | null;
    if (!fila) return err(c, 'no_encontrado', 404);

    const yaEs = await usuarioPorCorreo(c.env, correo);
    const usuario = yaEs ?? (await crearUsuario(c.env, correo, String(fila.nombre ?? '')));
    await c.env.MASTER.prepare(`UPDATE usuarios SET pin_hash = ? WHERE id = ?`).bind(await guardarPin(pin), usuario.id).run();
    await ponerAcceso(c.env, { usuario_id: usuario.id, org_id: c.get('org_id'), tipo: par.tipo, ref_id: String(fila.id) });
    await stub(c).actualizar(par.tabla, String(fila.id), par.tipo === 'cliente' ? { usuario_id: usuario.id, portal_activo: true } : { usuario_id: usuario.id });

    return ok(c, { usuario_id: usuario.id, correo, tipo: par.tipo, ref_id: fila.id }, 201);
  });

  /* Apagar el acceso. El usuario y su PIN se quedan en el D1: volver a hacer
   * POST …/acceso lo prende con el PIN que traiga. Sin esto, «desactivar» en
   * dash101 solo cambiaría una bandera y el cliente seguiría entrando. */
  rutas.delete(`/:o/${par.tabla}/:id/acceso`, async (c) => {
    const quien = c.get('quien');
    if (quien.clase !== 'miembro') return err(c, 'sin_permiso', 403);
    const fila = (await stub(c).obtener(par.tabla, c.req.param('id')!)) as Record<string, unknown> | null;
    if (!fila) return err(c, 'no_encontrado', 404);

    const a = await accesoDe(c.env, c.get('org_id'), par.tipo, String(fila.id));
    if (a) await quitarAcceso(c.env, a.usuario_id);
    if (par.tipo === 'cliente') await stub(c).actualizar('clientes', String(fila.id), { portal_activo: false });

    return ok(c, { quitado: !!a, usuario_id: a?.usuario_id ?? null, ref_id: fila.id });
  });
}

/* ─────────────── archivos (R2) ───────────────
 * El documento decía «redirige a URL firmada de R2». Con el binding de R2 no
 * hay manera de firmar una URL —eso pide credenciales de S3, que el Worker no
 * tiene—, así que el archivo se sirve por la API, que además es donde ya se
 * resolvieron los permisos. Queda anotado en CONTINUAR.md. */

rutas.post('/:o/archivos', async (c) => {
  const quien = c.get('quien');
  if (quien.clase === 'cliente') return err(c, 'sin_permiso', 403);
  const forma = await c.req.formData().catch(() => null);
  const archivo = forma?.get('archivo');
  const de_tabla = String(forma?.get('de_tabla') ?? '');
  const de_id = String(forma?.get('de_id') ?? '');
  if (!(archivo instanceof File) || !de_tabla || !de_id) {
    return err(c, 'datos_invalidos', 400, { falta: 'archivo, de_tabla, de_id' });
  }
  const id = ulid();
  const r2_key = `orgs/${c.get('org_id')}/${de_tabla}/${de_id}/${id}-${archivo.name}`;
  await c.env.ARCHIVOS.put(r2_key, await archivo.arrayBuffer(), { httpMetadata: { contentType: archivo.type } });
  const fila = await stub(c).registrarArchivo({
    id, r2_key, nombre: archivo.name, mime: archivo.type || null, bytes: archivo.size,
    de_tabla, de_id, subido_por: quien.usuario_id,
  });
  return ok(c, fila, 201);
});

rutas.get('/:o/archivos/:id', async (c) => {
  // Misma regla que puedeLeer(): un cliente sólo abre /peek. Esta ruta no
  // pasa por ahí porque devuelve bytes, no JSON, y se le había escapado: un
  // cliente con el id de cualquier archivo de la empresa se lo bajaba.
  if (c.get('quien').clase === 'cliente') return err(c, 'sin_permiso', 403, { motivo: 'un cliente solo abre /peek' });
  const fila = (await stub(c).obtener('archivos', c.req.param('id')!)) as Record<string, unknown> | null;
  if (!fila) return err(c, 'no_encontrado', 404);
  const obj = await c.env.ARCHIVOS.get(String(fila.r2_key));
  if (!obj) return err(c, 'no_encontrado', 404, { r2: 'la llave no existe en el bucket' });
  return new Response(obj.body, {
    headers: {
      'Content-Type': String(fila.mime || 'application/octet-stream'),
      'Content-Disposition': `inline; filename="${String(fila.nombre).replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=600',
    },
  });
});

/* ─────────────── WebSocket (§8) ─────────────── */

rutas.get('/:o/ws', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') return err(c, 'datos_invalidos', 426, { falta: 'Upgrade: websocket' });
  const quien = c.get('quien');
  // Quien no puede leer dinero por REST tampoco lo recibe por aquí: el filtro
  // es el mismo, no uno paralelo que se pueda separar.
  const ve = quien.ve_dinero ? 'todos' : 'limitado';
  const url = new URL(c.req.url);
  url.searchParams.set('ve', ve);
  return stub(c).fetch(new Request(url.toString(), c.req.raw));
});

/* ─────────────── la conciliación semanal (B1) ───────────────
 * Una vez por semana alguien captura el saldo real de cada cuenta. La API
 * calcula el registrado, guarda la diferencia y crea los ajustes: todo en una
 * transacción, para que no quede una conciliación sin sus ajustes ni al revés.
 *
 * Van antes del CRUD genérico a propósito: si no, `/conciliaciones/estadistica`
 * caería en `/:o/:tabla/:id` con id = «estadistica». */

rutas.post('/:o/conciliaciones', async (c) => {
  const quien = c.get('quien');
  // Decisión 4 de Mike: concilian el owner y el admin, nadie más. Y se
  // comprueba aquí, en el servidor, no en la pantalla.
  if (quien.clase !== 'miembro' || (quien.rol !== 'owner' && quien.rol !== 'admin')) {
    return err(c, 'sin_permiso', 403, { motivo: 'sólo owner y admin concilian' });
  }
  const permiso = revisarEscritura('conciliaciones', c.get('app'), ['negocio_id', 'corte_at']);
  if (!permiso.ok) return err(c, permiso.error, 403, permiso.detalle);

  const cuerpo = await c.req
    .json<{ negocio_id?: string; corte_at?: string; saldos?: Array<{ cuenta_id?: string; saldo_real?: unknown }> }>()
    .catch(() => ({}) as never);
  if (!cuerpo.negocio_id) return err(c, 'datos_invalidos', 400, { falta: 'negocio_id' });
  if (!Array.isArray(cuerpo.saldos) || !cuerpo.saldos.length) return err(c, 'datos_invalidos', 400, { falta: 'saldos' });

  const saldos: Array<{ cuenta_id: string; saldo_real: number }> = [];
  for (const s of cuerpo.saldos) {
    if (!s?.cuenta_id) return err(c, 'datos_invalidos', 400, { falta: 'cuenta_id en saldos' });
    if (typeof s.saldo_real !== 'number' || !Number.isInteger(s.saldo_real)) {
      return err(c, 'dinero_no_entero', 400, { campo: 'saldo_real', cuenta_id: s.cuenta_id, recibido: s.saldo_real, regla: 'centavos, INTEGER. $150,000.00 es 15000000' });
    }
    saldos.push({ cuenta_id: s.cuenta_id, saldo_real: s.saldo_real });
  }

  const r = await stub(c).conciliar({
    negocio_id: cuerpo.negocio_id,
    corte_at: cuerpo.corte_at || new Date().toISOString(),
    usuario_id: quien.usuario_id,
    saldos,
  });
  if (!r.ok) return err(c, r.error, r.error === 'no_encontrado' ? 404 : 400, r.detalle);
  return ok(c, { conciliacion: r.conciliacion, cuentas: r.cuentas, diferencia_total: r.diferencia_total }, 201);
});

rutas.get('/:o/conciliaciones/estadistica', async (c) => {
  const permiso = puedeLeer(c, 'conciliaciones');
  if (permiso) return permiso;
  const quien = c.get('quien');
  const negocio_id = c.req.query('negocio_id') || quien.negocios[0];
  if (!negocio_id) return err(c, 'datos_invalidos', 400, { falta: 'negocio_id' });
  return ok(c, await stub(c).estadisticaConciliacion(negocio_id));
});

/* ─────────────── CRUD genérico ─────────────── */

rutas.get('/:o/:tabla', async (c) => {
  const tabla = c.req.param('tabla')!;
  const permiso = puedeLeer(c, tabla);
  if (permiso) return permiso;

  const filtros: Record<string, string> = {};
  for (const [k, v] of new URL(c.req.url).searchParams) filtros[k] = v;
  const quien = c.get('quien');
  if (quien.negocios.length && !filtros.negocio_id && DEFS[tabla as Tabla].filtros.includes('negocio_id')) {
    filtros.negocio_id = quien.negocios[0];
  }

  const r = await stub(c).listar(tabla as Tabla, filtros, {
    usuario_id: quien.usuario_id,
    clase: quien.clase,
    ref_id: quien.ref_id,
    ve_dinero: quien.ve_dinero,
  });
  return ok(c, { total: r.total, filas: r.filas.map((f) => podar(quien, tabla as Tabla, f)) });
});

rutas.get('/:o/:tabla/:id', async (c) => {
  const tabla = c.req.param('tabla')!;
  const permiso = puedeLeer(c, tabla);
  if (permiso) return permiso;
  const fila = await stub(c).obtener(tabla as Tabla, c.req.param('id')!);
  if (!fila) return err(c, 'no_encontrado', 404);
  const quien = c.get('quien');
  if (quien.clase === 'cliente' && String(fila.cliente_id ?? fila.id) !== quien.ref_id) return err(c, 'sin_permiso', 403);
  return ok(c, podar(quien, tabla as Tabla, fila));
});

rutas.post('/:o/:tabla', async (c) => {
  const tabla = c.req.param('tabla')!;
  if (!esTabla(tabla)) return err(c, 'tabla_desconocida', 404, { tabla, tablas: Object.keys(DEFS) });
  const quien = c.get('quien');
  if (quien.clase === 'cliente') return err(c, 'sin_permiso', 403);
  if ((APPEND_ONLY as string[]).includes(tabla)) {
    return err(c, 'sin_permiso', 403, { motivo: `${tabla} se escribe con ${POR_SU_RUTA[tabla as Tabla]}` });
  }

  const datos = await c.req.json<Record<string, unknown>>().catch(() => ({}) as never);
  const campos = Object.keys(datos);

  const veredicto = revisarEscritura(tabla, c.get('app'), campos);
  if (!veredicto.ok) return err(c, veredicto.error, 403, veredicto.detalle);

  const falta = DEFS[tabla].requeridos.filter((r) => datos[r] === undefined || datos[r] === null || datos[r] === '');
  if (falta.length) return err(c, 'datos_invalidos', 400, { falta });

  const malDinero = revisarDinero(tabla, datos);
  if (malDinero) return err(c, 'dinero_no_entero', 400, malDinero);

  const fila = await stub(c).crear(tabla, datos, { app: c.get('app'), usuario_id: quien.usuario_id });
  return ok(c, podar(quien, tabla, fila), 201);
});

rutas.patch('/:o/:tabla/:id', async (c) => {
  const tabla = c.req.param('tabla')!;
  if (!esTabla(tabla)) return err(c, 'tabla_desconocida', 404, { tabla });
  const quien = c.get('quien');
  if (quien.clase === 'cliente') return err(c, 'sin_permiso', 403);
  if ((APPEND_ONLY as string[]).includes(tabla)) return err(c, 'sin_permiso', 403, { motivo: `${tabla} es append-only` });

  const datos = await c.req.json<Record<string, unknown>>().catch(() => ({}) as never);
  const veredicto = revisarEscritura(tabla, c.get('app'), Object.keys(datos));
  if (!veredicto.ok) return err(c, veredicto.error, 403, veredicto.detalle);

  const malDinero = revisarDinero(tabla, datos);
  if (malDinero) return err(c, 'dinero_no_entero', 400, malDinero);

  const fila = await stub(c).actualizar(tabla, c.req.param('id')!, datos);
  if (!fila) return err(c, 'no_encontrado', 404);
  return ok(c, podar(quien, tabla, fila));
});

rutas.delete('/:o/:tabla/:id', async (c) => {
  const tabla = c.req.param('tabla')!;
  if (!esTabla(tabla)) return err(c, 'tabla_desconocida', 404, { tabla });
  const quien = c.get('quien');
  if (quien.clase !== 'miembro') return err(c, 'sin_permiso', 403);
  // Un ítem no se borra: se cancela. Si se borrara, el historial y el saldo
  // dejarían de cuadrar y nadie sabría por qué.
  if (tabla === 'items') return err(c, 'items_nunca_se_borran', 403, { en_su_lugar: "PATCH {estado:'cancelado'}" });
  if ((APPEND_ONLY as string[]).includes(tabla)) return err(c, 'sin_permiso', 403, { motivo: `${tabla} es append-only` });

  const veredicto = revisarEscritura(tabla, c.get('app'), []);
  if (!veredicto.ok) return err(c, veredicto.error, 403, veredicto.detalle);

  // Las llaves foráneas del OrgDB se aplican: un proyecto con ítems o
  // movimientos no se va. Eso es un 409 que la app puede explicar, no un 500.
  const fue = await stub(c).borrar(tabla, c.req.param('id')!);
  if (fue === 'en_uso') return err(c, 'en_uso', 409, { tabla, motivo: 'otras filas apuntan a esta; primero se quitan o se cancelan ellas' });
  if (!fue) return err(c, 'no_encontrado', 404);
  return ok(c, { borrado: true });
});

/* ─────────────── ayudas ─────────────── */

function puedeLeer(c: Ctx, tabla: string) {
  if (!esTabla(tabla)) return err(c, 'tabla_desconocida', 404, { tabla, tablas: Object.keys(DEFS) });
  const quien = c.get('quien');
  // Un cliente sólo abre /peek. Hasta el 12-sep aquí había una lista blanca
  // (items, proyectos, clientes, archivos) que la fase 1 dejó por si el
  // portal las pedía sueltas; el portal pide /peek y nada más, y `archivos`
  // ni siquiera se acotaba al cliente. Lo que un cliente puede ver ya viene
  // sumado y filtrado en /peek: abrir tablas sueltas es dar más de lo que se
  // enseña, y eso es lo que se cierra.
  if (quien.clase === 'cliente') {
    return err(c, 'sin_permiso', 403, { motivo: 'un cliente solo abre /peek' });
  }
  if (quien.clase === 'personal' && !quien.ve_dinero && (TABLAS_DINERO as string[]).includes(tabla)) {
    return err(c, 'sin_permiso', 403, { motivo: 'esta persona no ve dinero' });
  }
  // Las partidas son costos: lo acordado con cada proveedor. Las ven owner,
  // admin y socio; staff, personal y cliente no, ni por lista ni por id.
  if (tabla === 'partidas' && !quien.ve_costos) {
    return err(c, 'sin_permiso', 403, { motivo: 'las partidas son costos: solo owner, admin y socio' });
  }
  return null;
}

/** Quita de la fila lo que quien pregunta no tiene por qué ver. */
function podar(quien: Quien, tabla: Tabla, fila: Record<string, unknown>): Record<string, unknown> {
  const f = { ...fila };
  if (tabla === 'proyectos' && !quien.ve_costos) {
    delete f.pagado_prov;
    delete f.compromiso;
  }
  if (!quien.ve_dinero) {
    if (tabla === 'items') delete f.monto;
    if (tabla === 'proyectos') {
      delete f.precio_venta;
      delete f.cobrado;
    }
  }
  return f;
}

/** Dinero en centavos, INTEGER. Un flotante aquí se convierte, tarde, en la
 *  peor migración que hay: la de dinero ya guardado. */
function revisarDinero(tabla: Tabla, datos: Record<string, unknown>): Record<string, unknown> | null {
  for (const col of columnasDinero(tabla)) {
    const v = datos[col];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      return { campo: col, recibido: v, regla: 'centavos, INTEGER. $150,000.00 es 15000000' };
    }
  }
  return null;
}

export default rutas;
