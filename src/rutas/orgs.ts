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
import type { ApiOrgDB, LineaAprobada } from '../org-db';
import { APPEND_ONLY, POR_SU_RUTA, revisarEscritura } from '../permisos';
import { acceso, accesoDe, miembro, org, ponerAcceso, quitarAcceso, usuarioPorCorreo, usuarioPorId } from '../maestro';
import { invitarClienteEnSuite } from '../clientes';
import { crearUsuario } from '../maestro';
import { guardarPin, normalizaCorreo, pinAceptable, ulid } from '../lib';
import { TIPO_XLSX, xlsx, type Celda } from '../xlsx';
import { empresaDe } from '../empresa';
import { montarOrdenes } from './ordenes';
import { montarObras } from './obras';
import { montarNomina } from './nomina';
import { err, ok, type Ctx, type Quien, type Vars } from '../http';
import type { Env } from '../entorno';
import { APPS, LLAVE_APP, type App, type Tabla } from '../../schema/tipos';

const rutas = new Hono<{ Bindings: Env; Variables: Vars }>();

/** Tablas con dinero que el personal sin `ve_dinero` no abre. */
const TABLAS_DINERO: Tabla[] = ['movimientos', 'cuentas', 'opex', 'cotizaciones', 'partidas', 'conciliaciones', 'conciliacion_cuentas', 'accionistas'];

const stub = (c: Ctx): ApiOrgDB => c.env.ORG.get(c.env.ORG.idFromName(c.get('org_id'))) as unknown as ApiOrgDB;

/** Cuánto es lo más que una lista devuelve de una vez, cuando se pide con
 *  `?limite=`. Sin parámetro se quedan las 500 de siempre: ninguna pantalla
 *  que ya funciona cambia de comportamiento. */
const TOPE_MAXIMO = 5000;

/** Lee `?limite=`. Lo que no sea un entero positivo se ignora —vale más
 *  contestar el tope de siempre que un 400 por un parámetro de adorno—, y lo
 *  que se pase de TOPE_MAXIMO se recorta ahí. */
function topeDe(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return undefined;
  return Math.min(n, TOPE_MAXIMO);
}

/** `negocio_id` ya no existe (0.63.0). Una app que todavía lo mande al crear
 *  o al editar no se lleva un 403 campo_no_permitido: se le quita aquí,
 *  antes de revisar permisos, y lo demás sigue su camino. Es compatibilidad;
 *  se va cuando ninguna app lo mande. */
function sinNegocio(datos: Record<string, unknown>): Record<string, unknown> {
  if (!datos || typeof datos !== 'object' || !('negocio_id' in datos)) return datos;
  const { negocio_id: _fuera, ...resto } = datos;
  return resto;
}

/** Los paneles de control: no aparecen en `orgs.apps` ni en `miembros.apps`. */
const PANELES: ReadonlySet<App> = new Set<App>(['master101', 'workshop101', 'suite101']);

/* ─────────────── las cuatro puertas ─────────────── */

rutas.use('/:o/*', async (c, next) => {
  const s = c.get('sesion');
  if (!s) return err(c, 'sin_sesion', 401);

  const nombreApp = c.req.header('X-App');
  if (!nombreApp) return err(c, 'sin_app', 400, { manda: `X-App: ${APPS.join('|')}` });
  if (!(APPS as readonly string[]).includes(nombreApp)) return err(c, 'app_desconocida', 400, { recibido: nombreApp, apps: APPS });
  const app = nombreApp as App;

  const org_id = c.req.param('o')!;
  /* 2-oct · quien entra por dash101.acme.com sólo alcanza a acme: el dominio
   * acota, aunque la cuenta sea miembro de otra empresa también. */
  const dom = c.get('dominio');
  if (dom && dom.org_id !== org_id) return err(c, 'otra_empresa', 403, { dominio: dom.dominio, empresa_del_dominio: dom.org_id, pedida: org_id });
  const empresa = await org(c.env, org_id);
  if (!empresa) return err(c, 'org_desconocida', 404, { org: org_id });
  if (!empresa.activa) return err(c, 'org_inactiva', 403);

  // master101, workshop101 y suite101 son paneles de control: no se apagan
  // desde `apps` ni se reparten por persona.
  const esPanel = PANELES.has(app);

  // 0.14.0 · una empresa pagada hasta un día vence sola al terminar ese día.
  // Las apps se cierran; los paneles siguen abriendo para poder arreglarlo.
  if (!esPanel && !empresa.vigente) {
    return err(c, 'org_sin_pago', 402, { paga_hasta: empresa.paga_hasta, mensaje: 'La suscripción de la empresa venció. Avísale a quien la administra.' });
  }
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
      ve_dinero: true,
      ve_costos: m.rol === 'owner' || m.rol === 'admin' || m.rol === 'socio',
    };
  } else if (s.superadmin) {
    quien = { clase: 'miembro', usuario_id: s.usuario_id, rol: 'owner', ve_dinero: true, ve_costos: true };
  } else {
    const a = await acceso(c.env, s.usuario_id);
    if (a && a.org_id === org_id) {
      if (a.tipo === 'cliente') {
        quien = { clase: 'cliente', usuario_id: s.usuario_id, ref_id: a.ref_id, ve_dinero: false, ve_costos: false };
      } else {
        const persona = (await stubDe(c, org_id).obtener('personal', a.ref_id)) as Record<string, unknown> | null;
        quien = {
          clase: 'personal',
          usuario_id: s.usuario_id,
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
    /* 0.47.0 · supply101 es la excepción: sin la llave `supply` la puerta
     * NO se cierra, se entra sólo para reembolsos. Mike, 28-sep: «si el
     * usuario no está autorizado para compras, que solo le diga “tu usuario
     * no está autorizado para compras” y solo le permita ingresar un
     * reembolso». Lo aplica POST /orgs/:o/ordenes por tipo. */
    if (app !== 'supply101') return err(c, 'app_no_permitida', 403, { app, permitidas: m.apps });
    quien.sin_compras = true;
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
  let datos = await stub(c).peek(cliente_id);
  /* 0.64.3 · El acceso apunta a un cliente que ya no está (Mike, 4-oct: «No
   * podemos entrar en Peek como cliente y ya está invitado»). Pasaba al
   * fusionar dos clientes: el que se queda heredaba el `usuario_id`, pero el
   * `accesos.ref_id` de la base maestra se quedaba en el que se borró. Ahora
   * fusionar lo re-apunta; y si una cuenta ya venía chueca de antes, aquí se
   * busca el cliente por su usuario y se repara el acceso al pasar. */
  if (!datos && quien.clase === 'cliente') {
    /* 0.64.4 · Y si ningún cliente trae su usuario (Mike, 4-oct, segundo
     * intento: el cliente se borró o se volvió a capturar sin la liga), se
     * busca por el correo de la sesión, que es el mismo con el que se
     * invitó, y se le vuelve a colgar el usuario. */
    const correo = c.get('sesion')?.correo ?? '';
    const mio = (await stub(c).clientePorUsuario(quien.usuario_id)) ?? (correo ? await stub(c).clientePorCorreo(correo) : null);
    if (mio) {
      datos = await stub(c).peek(String(mio.id));
      if (datos) {
        await ponerAcceso(c.env, { usuario_id: quien.usuario_id, org_id: c.get('org_id'), tipo: 'cliente', ref_id: String(mio.id) });
        if (mio.usuario_id !== quien.usuario_id) await stub(c).actualizar('clientes', String(mio.id), { usuario_id: quien.usuario_id, portal_activo: true }, { app: c.get('app'), usuario_id: 'sistema' });
      }
    }
  }
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
  const permiso = revisarEscritura('items', app, ['nombre', 'monto', 'cantidad', 'estado', 'origen']);
  if (!permiso.ok) return err(c, permiso.error, 403, permiso.detalle);

  const cuerpo = await c.req.json<{ cotizacion_id?: string; lineas?: Array<Record<string, unknown>>; cliente_id?: string }>().catch(() => ({}) as never);
  if (!cuerpo.lineas?.length) return err(c, 'datos_invalidos', 400, { falta: 'lineas' });
  for (const l of cuerpo.lineas) {
    if (l.monto !== undefined && !Number.isInteger(Number(l.monto))) {
      return err(c, 'dinero_no_entero', 400, { monto: l.monto, regla: 'centavos, INTEGER' });
    }
  }
  const r = await stub(c).exportarItems({
    cotizacion_id: cuerpo.cotizacion_id ?? '',
    lineas: cuerpo.lineas,
    cliente_id: cuerpo.cliente_id ?? '',
    usuario_id: c.get('quien').usuario_id,
  });
  return ok(c, r, 201);
});

/** POST /orgs/:o/cotizaciones/:id/aprobar {proyecto_id, lineas[], partida?} (0.46.0, 0.49.0)
 *
 *  Mike, 23-sep: los ítems de una cotización se crean AL APROBARLA. Crea una
 *  pieza vendida por cada unidad de cada línea, en el proyecto, amarradas por
 *  su producto cuando son varias (ver `aprobarCotizacion`). La cotización
 *  queda `aceptada` y ya no se edita: lo aprobado es lo que se vendió.
 *
 *  0.49.0: las piezas nacen en la partida `partida` o, sin ella, en la del
 *  nombre de la cotización (cada cotización aprobada es una pestaña en
 *  dash101). Una línea con `item_id` no crea nada: aprueba ese ítem —el
 *  requerimiento que cayó en el borrador— con su tipo, su precio y su código
 *  nuevos. */
rutas.post('/:o/cotizaciones/:id/aprobar', async (c) => {
  const quien = c.get('quien');
  if (quien.clase !== 'miembro') return err(c, 'sin_permiso', 403, { motivo: 'aprobar una cotización lo hace quien es de la empresa' });
  const app = c.get('app');
  const permiso = revisarEscritura('items', app, ['nombre', 'monto', 'cantidad', 'estado', 'proyecto_id', 'origen', 'partida']);
  if (!permiso.ok) return err(c, permiso.error, 403, permiso.detalle);
  const cuerpo = await c.req.json<{ proyecto_id?: string; lineas?: LineaAprobada[]; partida?: string | null }>().catch(() => ({}) as never);
  if (!cuerpo.proyecto_id) return err(c, 'datos_invalidos', 400, { falta: 'proyecto_id' });
  if (!Array.isArray(cuerpo.lineas) || !cuerpo.lineas.length) return err(c, 'datos_invalidos', 400, { falta: 'lineas' });
  const r = await stub(c).aprobarCotizacion({
    cotizacion_id: c.req.param('id')!, proyecto_id: cuerpo.proyecto_id, lineas: cuerpo.lineas,
    usuario_id: quien.usuario_id, app, partida: cuerpo.partida ?? null, correo: c.get('sesion')?.correo ?? null,
  });
  if (!r.ok) {
    const estado = r.error === 'no_encontrado' ? 404 : r.error === 'ya_aprobada' ? 409 : 400;
    return err(c, r.error, estado, r.detalle);
  }
  return ok(c, { cotizacion: r.cotizacion, proyecto: r.proyecto, items: r.items, productos_nuevos: r.productos_nuevos }, 201);
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
    correo: c.get('sesion')?.correo ?? null,
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

/* ─────────────── invitar a un cliente desde una app (0.15.0) ───────────────
 * quell101 (y cualquier app con base propia) le abre la puerta de la suite a
 * un cliente del taller sin pasar por dash101: si no hay cliente con ese
 * correo en la base de la empresa se crea; si la persona no existe en la
 * suite se crea; y queda con acceso tipo `cliente`. SIN PIN: entra con el
 * código al correo y ahí pone su contraseña, como cualquiera. La app que
 * invita manda su propio correo de invitación (sabe a qué obra); aquí no se
 * manda nada.
 *
 * Un miembro de la empresa no se vuelve cliente (409 es_miembro), y una
 * persona que ya es cliente de OTRA empresa tampoco (409 en_uso): `accesos`
 * lleva una fila por usuario. */
rutas.post('/:o/clientes/invitar', async (c) => {
  const cuerpo = await c.req.json<{ correo?: string; nombre?: string; usar_existente?: boolean }>().catch(() => ({}) as never);
  const r = await invitarClienteEnSuite(c.env, c.get('org_id'), c.get('quien'), stub(c), c.get('app'), cuerpo.correo, cuerpo.nombre, cuerpo.usar_existente === true);
  return r.ok ? ok(c, r.data, 201) : err(c, r.error, r.estado, r.detalle);
});

/* ─────────────── el cliente es uno solo en las tres apps (0.23.0) ───────────────
 *
 * Mike, 20-sep: «cuando creas un nuevo cliente en quote101, es lo mismo que
 * cuando haces uno en quell101 o en dash. […] Si por cualquier cosa se crean
 * en 2 apps diferentes con un nombre diferente, debería haber manera de
 * ligarlo y fusionar los 2 clientes en uno mismo. Y si se quiere crear un
 * cliente con el nombre ya existente, preguntar si no te estás refiriendo a X
 * cliente.»
 *
 * Vivir en la misma tabla ya vivían: `clientes` es de la empresa, no de una
 * app. Lo que faltaba es avisar del parecido ANTES de crear y juntar los dos
 * que ya se crearon. Las dos rutas van antes del CRUD genérico o `/:o/:tabla`
 * se tragaría `clientes/parecidos` como si fuera una tabla llamada así. */

/** GET /orgs/:o/clientes/parecidos?nombre= — «¿no te refieres a…?»
 *
 *  La regla vive en el servidor, y por eso la contesta la API y no cada
 *  pantalla: tres apps con tres ideas de qué se parece a qué es tener tres
 *  reglas, y la que falle va a ser justo la que nadie probó. */
rutas.get('/:o/clientes/parecidos', async (c) => {
  const permiso = puedeLeer(c, 'clientes');
  if (permiso) return permiso;
  const nombre = c.req.query('nombre') || '';
  const filas = nombre ? await stub(c).clientesParecidos(nombre) : [];
  /* 0.65.0 · `?correo=` contesta además `por_correo`: el cliente que YA tiene
   * ese correo, si lo hay (Mike, 4-oct: «avisar que ya existe un cliente,
   * presentar su info y preguntar si es ese»). Las pantallas lo usan antes
   * de guardar; la regla dura vive en POST/PATCH (409 correo_en_uso). */
  const correo = normalizaCorreo(c.req.query('correo') || '');
  const por_correo = correo ? resumenCliente(await stub(c).clientePorCorreo(correo)) : null;
  return ok(c, { parecidos: filas, por_correo });
});

/** Lo que se le enseña a quien va a crear un cliente que ya existe: lo justo
 *  para reconocerlo. Nunca `usuario_id` ni notas. */
export function resumenCliente(f: Record<string, unknown> | null): { id: string; nombre: string; correo: string | null; telefono: string | null; rfc: string | null; portal_activo: boolean } | null {
  if (!f) return null;
  return { id: String(f.id), nombre: String(f.nombre ?? ''), correo: (f.correo as string) ?? null, telefono: (f.telefono as string) ?? null, rfc: (f.rfc as string) ?? null, portal_activo: !!f.portal_activo };
}

/** 0.65.0 · El correo es de UN cliente (Mike, 4-oct: «en caso de querer
 *  generar un nuevo cliente con el email de otro que ya existe, avisar que
 *  ya existe un cliente, presentar su info y preguntar si es ese cliente
 *  (…) o si quieres crear uno nuevo con otro email»). Al crear o al cambiar
 *  el correo, si otro cliente ya lo tiene se contesta 409 `correo_en_uso`
 *  con el resumen de ése, para que la pantalla lo enseñe y pregunte. */
async function correoDeOtroCliente(c: Ctx, datos: Record<string, unknown>, salvo: string | null): Promise<Response | null> {
  const correo = normalizaCorreo(datos.correo);
  if (!correo) return null;
  const otro = await stub(c).clientePorCorreo(correo);
  if (!otro || (salvo && String(otro.id) === salvo)) return null;
  return err(c, 'correo_en_uso', 409, { motivo: 'ese correo ya es de otro cliente', cliente: resumenCliente(otro) });
}

/** 0.66.0 · El cliente abre SU estado de cuenta general (Mike, 4-oct: «que
 *  cuando el cliente entre en Peek pueda ver estados de cuentas (general y de
 *  proyectos)»). Sólo el suyo: el id de la ruta tiene que ser el de su acceso.
 *  Para cualquier otro id sigue siendo de la empresa. */
const esSuPropioEstado = (c: Ctx) => {
  const quien = c.get('quien');
  return quien.clase === 'cliente' && String(quien.ref_id ?? '') === String(c.req.param('id'));
};

/** GET /orgs/:o/clientes/:id/estado-de-cuenta — qué se le vendió, qué pagó y
 *  qué debe. Global y por proyecto.
 *
 *  Mike, 20-sep: «necesito poder ver por cliente su estado de cuenta general.
 *  Saldo global, y por proyecto, y poder exportarlo en un PDF para enviar
 *  reportes».
 *
 *  No es `/peek`: aquél es lo que el cliente ve de sí mismo, y sus pagos
 *  salen de un JOIN contra proyectos —un anticipo suelto ahí no aparece—.
 *  Aquí todo sale de una sola lista de cobros y los totales se suman de ella,
 *  así el saldo global es por construcción la suma de lo que se enseña.
 *
 *  Lo abre quien es de la empresa. Un cliente no: él ve lo suyo por /peek,
 *  que recorta lo que enseña; esto trae la cuenta completa. */
rutas.get('/:o/clientes/:id/estado-de-cuenta', async (c) => {
  const propio = esSuPropioEstado(c);
  if (!propio) {
    const permiso = puedeLeer(c, 'clientes');
    if (permiso) return permiso;
    if (c.get('quien').clase !== 'miembro') {
      return err(c, 'sin_permiso', 403, { motivo: 'el estado de cuenta completo es de la empresa; un cliente abre el suyo por peek101' });
    }
  }
  const r = await stub(c).estadoDeCuenta(c.req.param('id'));
  if (!r) return err(c, 'no_encontrado', 404, { que: 'cliente', id: c.req.param('id') });
  return ok(c, r);
});

/** GET /orgs/:o/clientes/:id/estado.xlsx — el estado de cuenta completo del
 *  cliente, en Excel (0.60.0).
 *
 *  Mike, 1-oct: «debo poder exportar su estado de cuenta general y por
 *  proyecto». El de cada proyecto ya existe (`/proyectos/:id/estado.xlsx`);
 *  éste es el general: una hoja con el saldo de cada proyecto y otra con
 *  todos los cobros del cliente, los de sus proyectos y los que trajeron su
 *  nombre sin proyecto. Los números son los mismos de `estado-de-cuenta`,
 *  porque salen de la misma función; en PESOS y como NÚMERO, por lo mismo
 *  que el de proyecto. */
rutas.get('/:o/clientes/:id/estado.xlsx', async (c) => {
  const propio = esSuPropioEstado(c);
  if (!propio) {
    const permiso = puedeLeer(c, 'clientes');
    if (permiso) return permiso;
    if (c.get('quien').clase !== 'miembro') {
      return err(c, 'sin_permiso', 403, { motivo: 'el estado de cuenta completo es de la empresa; un cliente abre el suyo por peek101' });
    }
  }
  const r = await stub(c).estadoDeCuenta(c.req.param('id'));
  if (!r) return err(c, 'no_encontrado', 404, { que: 'cliente', id: c.req.param('id') });

  const pesos = (centavos: unknown) => Math.round(Number(centavos ?? 0)) / 100;
  const dia = new Date().toISOString().slice(0, 10);
  const nombres = new Map((r.proyectos as Array<Record<string, unknown>>).map((p) => [String(p.id), String(p.nombre ?? '')]));
  const encabezado: Celda[][] = [
    ['Estado de cuenta'],
    ['Cliente', String(r.cliente.nombre ?? '')],
    ['RFC', String(r.cliente.rfc ?? '')],
    ['Generado el', dia],
    [],
  ];
  const t = r.totales;
  const cobros = [
    ...(r.proyectos as Array<Record<string, unknown>>).flatMap((p) => (p.pagos as Array<Record<string, unknown>>)),
    ...(r.otros_pagos as Array<Record<string, unknown>>),
  ].sort((a, b) => String(a.fecha ?? '').localeCompare(String(b.fecha ?? '')));

  const libro = xlsx([
    {
      nombre: 'Por proyecto',
      filas: [
        ...encabezado,
        ['Proyecto', 'Estado', 'Desde', 'Precio de venta', 'Cobrado', 'Saldo'],
        ...(r.proyectos as Array<Record<string, unknown>>).map((p): Celda[] => [
          String(p.nombre ?? ''), String(p.estado ?? ''), String(p.fecha_inicio ?? ''),
          pesos(p.precio_venta), pesos(p.cobrado), pesos(p.saldo),
        ]),
        ...(t.sin_proyecto ? [['Cobros sin proyecto', '', '', 0, pesos(t.sin_proyecto), -pesos(t.sin_proyecto)] as Celda[]] : []),
        [],
        ['', '', '', 'Vendido', pesos(t.vendido)],
        ['', '', '', 'Cobrado', pesos(t.cobrado)],
        ['', '', '', 'Saldo', pesos(t.saldo)],
      ],
    },
    {
      nombre: 'Cobros',
      filas: [
        ...encabezado,
        ['Fecha', 'Proyecto', 'Concepto', 'Cuenta', 'Facturado', 'Monto'],
        ...cobros.map((m): Celda[] => [
          String(m.fecha ?? ''), nombres.get(String(m.proyecto_id ?? '')) ?? '', String(m.descripcion ?? ''),
          String(m.cuenta_nombre ?? ''), m.facturado ? 'sí' : 'no', pesos(m.monto),
        ]),
        [],
        ['', '', '', '', 'Cobrado', pesos(t.cobrado)],
        ['', '', '', '', 'Saldo', pesos(t.saldo)],
      ],
    },
  ]);

  const limpio = String(r.cliente.nombre ?? 'cliente')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'cliente';

  return new Response(libro as unknown as BodyInit, {
    headers: {
      'content-type': TIPO_XLSX,
      'content-disposition': `attachment; filename="estado-${limpio}-${dia}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
});

/** GET /orgs/:o/accionistas/de-roster — quién hay en roster101, para darlo
 *  de alta como accionista sin teclearlo otra vez (0.60.0).
 *
 *  Va ANTES de `/:o/:tabla/:id`, que si no se lo come como «el accionista
 *  con id de-roster». Lo lee quien lee accionistas: es la misma pantalla. */
rutas.get('/:o/accionistas/de-roster', async (c) => {
  const permiso = puedeLeer(c, 'accionistas');
  if (permiso) return permiso;
  return ok(c, { personas: await stub(c).accionistasDeRoster() });
});

/** POST /orgs/:o/clientes/:id/fusionar {se_va_id} — los dos son el mismo.
 *
 *  `:id` es el que se queda; `se_va_id` desaparece y le deja todo: proyectos,
 *  ítems, cotizaciones, movimientos, y los datos que al que se queda le
 *  falten. Es irreversible, así que la hace quien dirige la empresa. */
rutas.post('/:o/clientes/:id/fusionar', async (c) => {
  const quien = c.get('quien');
  if (quien.clase !== 'miembro' || (quien.rol !== 'owner' && quien.rol !== 'admin')) {
    return err(c, 'sin_permiso', 403, { motivo: 'fusionar dos clientes no se puede deshacer: lo hacen el dueño y la administración' });
  }
  const b = await c.req.json<{ se_va_id?: string }>().catch(() => ({}) as { se_va_id?: string });
  if (!b.se_va_id) return err(c, 'datos_invalidos', 400, { falta: 'se_va_id' });
  const r = await stub(c).fusionarClientes(c.req.param('id'), b.se_va_id);
  if ('error' in r) return err(c, r.error, r.error === 'no_encontrado' ? 404 : 400, r.detalle);
  /* 0.64.3 · Si el que se va tenía acceso al portal, el acceso (base maestra)
   * sigue al que se queda: fusionar no deja al cliente sin poder entrar a
   * peek101. El DO no puede tocar la maestra; se hace aquí. */
  const portal = await accesoDe(c.env, c.get('org_id'), 'cliente', b.se_va_id);
  if (portal) await ponerAcceso(c.env, { usuario_id: portal.usuario_id, org_id: c.get('org_id'), tipo: 'cliente', ref_id: c.req.param('id') });
  return ok(c, { cliente: r.cliente, movidos: r.movidos });
});

/** POST /orgs/:o/proyectos/:id/fusionar {se_va_id, seco?} — los dos son el mismo proyecto (0.52.0).
 *
 *  Mike, 29-sep: «No puedo fusionar el proyecto, solo el cliente. Y quiero
 *  fusionar proyectos.» `:id` es el que se queda; `se_va_id` desaparece y le
 *  deja ítems, partidas, dinero, órdenes, cotizaciones, archivos y su obra
 *  de quell si el que se queda no tenía. Con `seco` sólo cuenta. Como con
 *  los clientes, no se deshace: la hacen el dueño y la administración. */
rutas.post('/:o/proyectos/:id/fusionar', async (c) => {
  const quien = c.get('quien');
  if (quien.clase !== 'miembro' || (quien.rol !== 'owner' && quien.rol !== 'admin')) {
    return err(c, 'sin_permiso', 403, { motivo: 'fusionar dos proyectos no se puede deshacer: lo hacen el dueño y la administración' });
  }
  const b = await c.req.json<{ se_va_id?: string; seco?: boolean }>().catch(() => ({}) as { se_va_id?: string; seco?: boolean });
  if (!b.se_va_id) return err(c, 'datos_invalidos', 400, { falta: 'se_va_id' });
  const r = await stub(c).fusionarProyectos(c.req.param('id'), b.se_va_id, b.seco === true);
  if ('error' in r) return err(c, r.error, r.error === 'no_encontrado' ? 404 : 400, r.detalle);
  return ok(c, r);
});

/** POST /orgs/:o/clientes/:id/borrar {modo?} y POST /orgs/:o/proyectos/:id/borrar {modo?} (0.51.0)
 *
 *  Mike, 29-sep: «no puedo borrar clientes de quote101». Borrar CON TODO lo
 *  suyo, o decir por qué no: 409 `tiene_dinero` (hay movimientos) o 409
 *  `tiene_historia` (ítems con avances, archivos o compromisos). Con
 *  `modo: 'seco'` sólo cuenta. Lo abre cualquiera de la empresa, como el
 *  DELETE de siempre; lo que cambia es que éste sí se lleva lo que cuelga y
 *  explica cuando no puede. Al borrar un cliente se le quita el acceso al
 *  portal, si lo tenía. */
async function borrarConTodo(c: Ctx, que: 'cliente' | 'proyecto') {
  const quien = c.get('quien');
  if (quien.clase !== 'miembro') return err(c, 'sin_permiso', 403);
  const b = await c.req.json<{ modo?: string }>().catch(() => ({}) as { modo?: string });
  const modo = b.modo === 'seco' ? 'seco' : 'borrar';
  const id = c.req.param('id')!;
  const r = que === 'cliente' ? await stub(c).borrarClienteConTodo(id, modo) : await stub(c).borrarProyectoConTodo(id, modo);
  if ('error' in r) {
    const estado = r.error === 'no_encontrado' ? 404 : r.error === 'tiene_dinero' || r.error === 'tiene_historia' ? 409 : 400;
    return err(c, r.error, estado, r.detalle);
  }
  if (que === 'cliente' && modo === 'borrar') {
    await c.env.MASTER.prepare(`DELETE FROM accesos WHERE org_id = ? AND tipo = 'cliente' AND ref_id = ?`).bind(c.get('org_id'), id).run();
  }
  return ok(c, r);
}
rutas.post('/:o/clientes/:id/borrar', (c) => borrarConTodo(c, 'cliente'));
rutas.post('/:o/proyectos/:id/borrar', (c) => borrarConTodo(c, 'proyecto'));

/* ─────────────── agregar al alcance y sacar del alcance (§106 → 0.64.0) ───────────────
 *
 * Mike, 20-sep: «se debe poder cancelar algún ítem ya sea desde quell o
 * desde dash, y se refleja en los 2». Mike, 2-oct: ya no hay «cancelado»; un
 * ítem está en alcance o fuera, y la historia va en la bitácora.
 *
 * Las rutas las abren dash101 y quell101 por igual —es el mismo ítem en la
 * misma base—, y el permiso se revisa por campo, contra `estado`, que es lo
 * que de verdad se está cambiando.
 */

/** Quién mueve el alcance, para la bitácora: app, usuario y su correo. */
const quienMueve = (c: Ctx) => ({ app: c.get('app'), usuario_id: c.get('quien').usuario_id, correo: c.get('sesion')?.correo ?? null });

/** POST /orgs/:o/items/:id/aprobar — se agrega al alcance y desde ahí suma
 *  en el proyecto. */
rutas.post('/:o/items/:id/aprobar', async (c) => {
  const quien = c.get('quien');
  if (quien.clase !== 'miembro') return err(c, 'sin_permiso', 403, { motivo: 'agregar un ítem al alcance lo hace quien es de la empresa' });
  const veredicto = revisarEscritura('items', c.get('app'), ['estado']);
  if (!veredicto.ok) return err(c, veredicto.error, 403, veredicto.detalle);
  const r = await stub(c).aprobarItem(c.req.param('id'), quienMueve(c));
  if ('error' in r) return err(c, r.error, 404, r.detalle);
  return ok(c, { item: r.item, era: r.era, alcance: 'dentro' });
});

/** POST /orgs/:o/items/:id/sacar {motivo?} — se saca del alcance. Contesta
 *  `alcance: 'fuera'`, que es lo único que puede quedar. `/cancelar` es el
 *  mismo camino con el nombre de antes: se queda para quien ya lo llama. */
async function sacarDelAlcance(c: Ctx) {
  const quien = c.get('quien');
  if (quien.clase !== 'miembro') return err(c, 'sin_permiso', 403, { motivo: 'sacar un ítem del alcance lo hace quien es de la empresa' });
  const veredicto = revisarEscritura('items', c.get('app'), ['estado']);
  if (!veredicto.ok) return err(c, veredicto.error, 403, veredicto.detalle);
  const b = await c.req.json<{ motivo?: string }>().catch(() => ({}) as { motivo?: string });
  const r = await stub(c).cancelarItem(c.req.param('id')!, { motivo: b.motivo }, quienMueve(c));
  if ('error' in r) return err(c, r.error, 404, r.detalle);
  return ok(c, { item: r.item, alcance: r.alcance });
}
rutas.post('/:o/items/:id/sacar', sacarDelAlcance);
rutas.post('/:o/items/:id/cancelar', sacarDelAlcance);

/** GET /orgs/:o/items/:id/alcance — en qué está y su bitácora: cada entrada
 *  y salida con fecha, quién, desde qué app y por qué. */
rutas.get('/:o/items/:id/alcance', async (c) => {
  const permiso = puedeLeer(c, 'items');
  if (permiso) return permiso;
  const r = await stub(c).bitacoraAlcance(c.req.param('id'));
  if ('error' in r) return err(c, r.error, 404, r.detalle);
  return ok(c, { item_id: r.item.id, alcance: r.item.alcance, movimientos: r.movimientos });
});

/* ─────────────── varios ítems iguales, un solo concepto (§98) ───────────────
 *
 * Mike, 20-sep: «necesito poder agrupar varios ítems en un solo concepto.
 * Son varias puertas iguales en diferente ubicación —quell las ubica en plano
 * y cada una tiene su seguimiento— pero el producto es el mismo y no tiene
 * caso tener 21 ítems idénticos enlistados en dash».
 *
 * Dos rutas y el mismo reparto de siempre: una PROPONE y no toca nada, la
 * otra aplica lo que alguien escogió. Las piezas del plano no se tocan: las
 * 21 puertas siguen siendo 21 en quell101, con su ubicación y su bitácora;
 * lo que se junta es el renglón que se cobra.
 */

/** GET /orgs/:o/proyectos/:id/agrupables — qué renglones son el mismo
 *  producto capturado varias veces. Propone; no junta. */
rutas.get('/:o/proyectos/:id/agrupables', async (c) => {
  const permiso = puedeLeer(c, 'items');
  if (permiso) return permiso;
  const r = await stub(c).gruposDeItems(c.req.param('id'));
  if ('error' in r) return err(c, r.error, 404, r.detalle);
  return ok(c, { proyecto: r.proyecto, grupos: r.grupos });
});

/** POST /orgs/:o/proyectos/:id/agrupar {items[], nombre?, codigo?, precio?} —
 *  que sean el mismo producto del catálogo.
 *
 *  ANTES esto FUSIONABA: los renglones que se iban se borraban y no había
 *  vuelta atrás. Ya no. Mike, 20-sep: «debe poder moverse de grupo de
 *  producto un ítem ya agrupado», y un renglón borrado no se puede mover.
 *  Escogió con botones que el grupo de producto reemplace a la fusión.
 *
 *  Ahora escribe un producto y le apunta las piezas. Cada pieza sigue
 *  existiendo, con su código de obra, su lugar en el plano y su bitácora;
 *  lo que se comparte es el modelo y su precio. Se deshace sacando la pieza
 *  del grupo, que es lo que antes no se podía.
 *
 *  Como ya no destruye nada, deja de estar reservado a quien dirige la
 *  empresa: lo hace cualquier miembro, igual que capturar un ítem.
 *
 *  Con `producto_id` las piezas entran a un modelo QUE YA EXISTE en vez de
 *  escribir uno nuevo, y adoptan su precio. Mike, 20-sep: «donde dice
 *  nombre del modelo debería poderse hacer uno nuevo, o seleccionar agregar
 *  a alguno ya existente. Al asignarlo a un producto existente, adopta en
 *  automático el precio del producto al que se agrupa». En ese camino el
 *  `nombre` y el `precio` del cuerpo se ignoran: el modelo ya tiene los
 *  suyos, y cambiárselos desde aquí movería el importe de piezas de OTRAS
 *  obras sin que nadie lo pidiera.
 *
 *  El precio de venta del proyecto SÍ se puede mover, porque las piezas
 *  heredan el precio del producto. Por eso devuelve el antes y el después:
 *  la pantalla lo enseña y quien agrupó ve lo que hizo. */
rutas.post('/:o/proyectos/:id/agrupar', async (c) => {
  const quien = c.get('quien');
  if (quien.clase !== 'miembro') return err(c, 'sin_permiso', 403, { motivo: 'agrupar ítems lo hace quien es de la empresa' });
  type Cuerpo = { items?: string[]; nombre?: string; codigo?: string; precio?: number; producto_id?: string };
  const b = await c.req.json<Cuerpo>().catch(() => ({}) as Cuerpo);
  if (!Array.isArray(b.items)) return err(c, 'datos_invalidos', 400, { motivo: '`items` es la lista de ids que son el mismo producto' });
  const r = await stub(c).agruparItems(
    c.req.param('id'),
    { items: b.items, nombre: b.nombre, codigo: b.codigo, precio: b.precio, producto_id: b.producto_id },
    { usuario_id: quien.usuario_id },
  );
  if ('error' in r) {
    return err(c, r.error, r.error === 'no_encontrado' ? 404 : r.error === 'datos_invalidos' ? 400 : r.error === 'sin_permiso' ? 403 : 409, r.detalle);
  }
  return ok(c, { producto: r.producto, items: r.items, nuevo: r.nuevo, venta_antes: r.venta_antes, venta_despues: r.venta_despues });
});

/* ────────── el producto de cada ítem: escogerlo y cambiarlo (§111) ──────────
 *
 * Mike, 20-sep: «todos los ítems, aparte del tipo de ítem, deberían tener un
 * dropdown para seleccionar qué producto es, o nuevo si el ítem es su mismo
 * producto único. A lo mejor un ítem pasó de ser modelo A a modelo B y sólo
 * se cambia de grupo. El dropdown debe tener 1) los ítems que son únicos en
 * el proyecto 2) los productos que ya tienen varios ítems agrupados».
 */

/** GET /orgs/:o/proyectos/:id/productos — lo que va en ese dropdown: los
 *  productos que ya se usan en la obra y los ítems que todavía son su
 *  propio producto único. No toca nada. */
rutas.get('/:o/proyectos/:id/productos', async (c) => {
  const permiso = puedeLeer(c, 'items');
  if (permiso) return permiso;
  const r = await stub(c).productosDelProyecto(c.req.param('id'));
  if ('error' in r) return err(c, r.error, 404, r.detalle);
  return ok(c, { proyecto: r.proyecto, productos: r.productos, unicos: r.unicos });
});

/** POST /orgs/:o/items/:id/producto {producto_id|desde_item|solo} — cambiar
 *  de grupo.
 *
 *  Al entrar a un producto, el ítem HEREDA SU PRECIO: Mike lo pidió con
 *  todas sus letras, «el ítem adquiere en automático ese costo». Eso mueve
 *  el precio de venta del proyecto, así que la respuesta trae el antes y el
 *  después para que la pantalla lo diga y nadie se entere por el total del
 *  mes. Al salirse (`solo`) el precio NO se le quita: la pieza se queda con
 *  el que ya tenía. */
rutas.post('/:o/items/:id/producto', async (c) => {
  const quien = c.get('quien');
  if (quien.clase !== 'miembro') return err(c, 'sin_permiso', 403, { motivo: 'cambiar un ítem de producto lo hace quien es de la empresa' });
  type Cuerpo = { producto_id?: string; desde_item?: string; solo?: boolean };
  const b = await c.req.json<Cuerpo>().catch(() => ({}) as Cuerpo);
  const r = await stub(c).asignarProducto(
    c.req.param('id'),
    { producto_id: b.producto_id, desde_item: b.desde_item, solo: b.solo },
    { usuario_id: quien.usuario_id },
  );
  if ('error' in r) {
    return err(c, r.error, r.error === 'no_encontrado' ? 404 : r.error === 'datos_invalidos' ? 400 : r.error === 'sin_permiso' ? 403 : 409, r.detalle);
  }
  return ok(c, { item: r.item, producto: r.producto, venta_antes: r.venta_antes, venta_despues: r.venta_despues });
});

/* ────────── separar: deshacer el grupo, y rescatar lo fusionado ──────────
 *
 * Mike, 20-sep, con HOLCIM enfrente: «ya se hizo un desastre con todos los
 * cambios y ahora no puedo separar los ítems para agruparlos en otro
 * producto. O mejor sepárame todos los ítems de puertas otra vez».
 *
 * Dos cosas distintas se ven igual desde la pantalla: un ítem metido en un
 * producto —sacarlo de uno en uno son 29 clics— y un renglón que viene de la
 * FUSIÓN del contrato 0.30.0, que borraba los renglones que absorbía y por
 * eso no se puede partir. Estas dos rutas atienden las dos.
 *
 * El dinero no se mueve: lo que se le resta al que sobrevivió es lo que se
 * les pone a los reconstruidos. Si no cuadra, no se escribe nada.
 */

/** POST /orgs/:o/items/:id/separar — sacar UN ítem de su producto y, si es
 *  un renglón fusionado, devolver los renglones que se tragó. */
rutas.post('/:o/items/:id/separar', async (c) => {
  const quien = c.get('quien');
  if (quien.clase !== 'miembro') return err(c, 'sin_permiso', 403, { motivo: 'separar un ítem lo hace quien es de la empresa' });
  const r = await stub(c).separarItem(c.req.param('id'), { usuario_id: quien.usuario_id });
  if ('error' in r) return err(c, r.error, r.error === 'no_encontrado' ? 404 : 409, r.detalle);
  return ok(c, {
    item: r.item, salio_de: r.salio_de, reconstruidos: r.reconstruidos,
    piezas_repartidas: r.piezas_repartidas, venta_antes: r.venta_antes, venta_despues: r.venta_despues,
  });
});

/** POST /orgs/:o/proyectos/:id/separar {producto_id} — separar TODAS las
 *  piezas de un producto de una obra, de un golpe.
 *
 *  Va en un solo envío por lo mismo que acomodar: 29 llamadas donde la
 *  número 12 puede fallar dejan la lista a medio separar. */
rutas.post('/:o/proyectos/:id/separar', async (c) => {
  const quien = c.get('quien');
  if (quien.clase !== 'miembro') return err(c, 'sin_permiso', 403, { motivo: 'separar los ítems lo hace quien es de la empresa' });
  const b = await c.req.json<{ producto_id?: string }>().catch(() => ({}) as { producto_id?: string });
  if (!b.producto_id) return err(c, 'datos_invalidos', 400, { falta: 'producto_id' });
  const r = await stub(c).separarProducto(c.req.param('id'), b.producto_id, { usuario_id: quien.usuario_id });
  if ('error' in r) return err(c, r.error, r.error === 'no_encontrado' ? 404 : 409, r.detalle);
  return ok(c, {
    separados: r.separados, reconstruidos: r.reconstruidos, piezas_repartidas: r.piezas_repartidas,
    venta_antes: r.venta_antes, venta_despues: r.venta_despues,
  });
});

/** GET /orgs/:o/proyectos/:id/estado — el estado de cuenta de una obra.
 *
 *  Mike, 21-sep: «necesito poder exportar un estado de cuenta en pdf y un
 *  excel con lo siguiente de cada proyecto: saldo general, lista de
 *  productos en proyecto, subtotal, IVA y total de proyecto completo,
 *  movimientos de proyecto (pagos), fecha del día que se genera el status.
 *  Creo que esto es lo mismo que el cliente podría descargar desde peek101».
 *
 *  UNA SOLA RUTA para los dos, y ésta es la segunda excepción a «un cliente
 *  sólo abre /peek», con la misma razón que la primera: lo que ve está
 *  recortado EN EL SERVIDOR y probado. El cliente sólo abre el estado de SU
 *  proyecto —se compara contra la sesión, no contra lo que diga la
 *  dirección— y el documento no trae un solo egreso, así que lo que le pagas
 *  a tus proveedores no viaja.
 *
 *  Que sea una y no dos es el punto: el día que los totales de la empresa y
 *  los del cliente se calculen en dos lugares, el que va a notar que no
 *  cuadran es el cliente. */
rutas.get('/:o/proyectos/:id/estado', async (c) => {
  const quien = c.get('quien');
  if (quien.clase === 'personal') return err(c, 'sin_permiso', 403, { motivo: 'el estado de cuenta lleva dinero' });
  const r = await stub(c).estadoDelProyecto(c.req.param('id'));
  if (!r) return err(c, 'no_encontrado', 404, { que: 'proyecto', id: c.req.param('id') });
  if (quien.clase === 'cliente' && String(r.proyecto.cliente_id ?? '') !== String(quien.ref_id ?? '')) {
    return err(c, 'sin_permiso', 403, { motivo: 'ese proyecto no es suyo' });
  }
  return ok(c, r);
});

/** GET /orgs/:o/proyectos/:id/estado.xlsx — el mismo estado de cuenta, en
 *  Excel.
 *
 *  Lo arma la API y no cada pantalla por la misma razón que los totales: el
 *  archivo lo bajan dash101 y peek101, y dos armadores es la manera segura
 *  de que un día no digan lo mismo. Además peek101 no tiene empaquetador:
 *  una copia allá sería una copia de verdad.
 *
 *  DOS HOJAS, no una: los ítems y los pagos son dos tablas, y pegadas en un
 *  CSV con renglones en blanco en medio es donde Excel empieza a adivinar
 *  tipos y las fechas se vuelven números.
 *
 *  Los importes van en PESOS y como NÚMERO. Un «$1,234.00» es texto para
 *  Excel: la suma da cero y quien lo abra va a creer que no le deben nada.
 *  El formato lo pone quien lo abre; el dato lo ponemos nosotros. */
rutas.get('/:o/proyectos/:id/estado.xlsx', async (c) => {
  const quien = c.get('quien');
  if (quien.clase === 'personal') return err(c, 'sin_permiso', 403, { motivo: 'el estado de cuenta lleva dinero' });
  const r = await stub(c).estadoDelProyecto(c.req.param('id'));
  if (!r) return err(c, 'no_encontrado', 404, { que: 'proyecto', id: c.req.param('id') });
  if (quien.clase === 'cliente' && String(r.proyecto.cliente_id ?? '') !== String(quien.ref_id ?? '')) {
    return err(c, 'sin_permiso', 403, { motivo: 'ese proyecto no es suyo' });
  }

  const pesos = (centavos: unknown) => Math.round(Number(centavos ?? 0)) / 100;
  const dia = String(r.generado_at).slice(0, 10);
  const encabezado: Celda[][] = [
    ['Estado de cuenta'],
    ['Proyecto', String(r.proyecto.nombre ?? '')],
    ['Cliente', String(r.cliente?.nombre ?? '')],
    ['Generado el', dia],
    [],
  ];
  const t = r.totales;

  const libro = xlsx([
    {
      nombre: 'Ítems',
      filas: [
        ...encabezado,
        ['Código', 'Concepto', 'Modelo', 'Cantidad', 'Precio unitario', 'Importe'],
        ...r.items.map((i): Celda[] => [
          String(i.clave ?? ''), String(i.nombre ?? ''), String(i.producto_nombre ?? ''),
          Number(i.cantidad ?? 1), pesos(i.precio_unitario), pesos(i.importe),
        ]),
        [],
        ['', '', '', '', 'Subtotal', pesos(t.subtotal)],
        ['', '', '', '', `IVA ${t.tasa_iva / 100}%`, pesos(t.iva)],
        ['', '', '', '', 'Total', pesos(t.total)],
        ['', '', '', '', 'Pagado', pesos(t.cobrado)],
        ['', '', '', '', 'Saldo', pesos(t.saldo)],
      ],
    },
    {
      nombre: 'Pagos',
      filas: [
        ...encabezado,
        ['Fecha', 'Concepto', 'Cuenta', 'Monto'],
        ...r.movimientos.map((m): Celda[] => [
          String(m.fecha ?? ''), String(m.descripcion ?? ''), String(m.cuenta_nombre ?? ''), pesos(m.monto),
        ]),
        [],
        ['', '', 'Pagado', pesos(t.cobrado)],
        ['', '', 'Saldo', pesos(t.saldo)],
      ],
    },
  ]);

  /* El nombre del archivo sin acentos ni espacios: viaja por una cabecera y
   * ahí los acentos se vuelven signos raros en algunos navegadores. */
  const limpio = String(r.proyecto.nombre ?? 'proyecto')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'proyecto';

  return new Response(libro as unknown as BodyInit, {
    headers: {
      'content-type': TIPO_XLSX,
      'content-disposition': `attachment; filename="estado-${limpio}-${dia}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
});

/** POST /orgs/:o/proyectos/:id/borrar-cancelados {modo:'seco'|'borrar'} —
 *  limpiar de un proyecto los ítems que se cancelaron.
 *
 *  Mike, 21-sep: «ya todo lo cancelado lo puedes eliminar por completo».
 *
 *  Dos modos, y el seco es el que importa: contesta el censo EXACTO —cuáles
 *  se van, cuáles se quedan y qué los detiene— sin escribir una sola fila.
 *  Borrar 96 renglones no se deshace, así que la pantalla enseña primero lo
 *  que va a pasar y quien decide ve el número antes.
 *
 *  Lo que trae dinero (un cobro), historia de obra (un avance), un
 *  compromiso con proveedor o un papel NO se borra: se queda y se dice por
 *  qué. Eso no es un candado tímido, es la regla: borrar el ítem dejaría un
 *  cobro sin dueño, y decidir eso no le toca a una ruta.
 *
 *  Va por el dueño y la administración, como cancelar: es de las pocas
 *  operaciones de esta API que no tienen vuelta. */
rutas.post('/:o/proyectos/:id/borrar-cancelados', async (c) => {
  const quien = c.get('quien');
  if (quien.clase !== 'miembro') return err(c, 'sin_permiso', 403, { motivo: 'borrar ítems lo hace quien es de la empresa' });
  const b = await c.req.json<{ modo?: string }>().catch(() => ({}) as { modo?: string });
  const modo = b.modo === 'borrar' ? 'borrar' : 'seco';
  if (modo === 'borrar' && quien.rol !== 'owner' && quien.rol !== 'admin') {
    return err(c, 'sin_permiso', 403, { motivo: 'borrar de verdad lo hacen el dueño o la administración' });
  }
  const r = await stub(c).borrarCancelados(c.req.param('id'), { modo }, { usuario_id: quien.usuario_id });
  if ('error' in r) return err(c, r.error, r.error === 'no_encontrado' ? 404 : 409, r.detalle);
  return ok(c, r);
});

/** POST /orgs/:o/proyectos/:id/acomodar {items:[{id, partida?, orden?}]} — la
 *  partida de cada ítem y el lugar que ocupa dentro de ella (§102).
 *
 *  Mike, 20-sep: «quiero también poder ordenar los ítems y agrupar por
 *  partidas. Incluso podría ser por pestañas (como folders)».
 *
 *  Va en un solo envío: acomodar 21 renglones de uno en uno son 21 idas y
 *  vueltas, y la que falle deja la lista a medio acomodar. Lo que no venga
 *  en la lista no se mueve, así que renombrar una partida es mandar sus
 *  ítems con el nombre nuevo.
 *
 *  OJO con la palabra: esta `partida` es el capítulo de la cotización
 *  —Cocina, Recámaras—, no la tabla `partidas`, que son los compromisos con
 *  proveedores. La migración 0015 cuenta por qué conviven. */
rutas.post('/:o/proyectos/:id/acomodar', async (c) => {
  const quien = c.get('quien');
  if (quien.clase === 'cliente') return err(c, 'sin_permiso', 403, { motivo: 'un cliente solo abre /peek' });
  /* Se revisa contra los permisos de campo, no contra el rol: acomodar es
   * escribir `partida` y `orden` de un ítem, y quién puede escribir qué
   * campo de qué tabla se decide en UN solo lugar (src/permisos.ts). Una
   * ruta que se inventa su propia regla es la que se olvida de actualizar. */
  const veredicto = revisarEscritura('items', c.get('app'), ['partida', 'orden']);
  if (!veredicto.ok) return err(c, veredicto.error, 403, veredicto.detalle);
  type Cuerpo = { items?: Array<{ id: string; partida?: string; orden?: number }> };
  const b = await c.req.json<Cuerpo>().catch(() => ({}) as Cuerpo);
  if (!Array.isArray(b.items)) return err(c, 'datos_invalidos', 400, { motivo: '`items` es una lista de {id, partida?, orden?}' });
  const r = await stub(c).acomodarItems(c.req.param('id'), b.items);
  if ('error' in r) return err(c, r.error, r.error === 'no_encontrado' ? 404 : 400, r.detalle);
  return ok(c, { acomodados: r.acomodados });
});

/* ─────────────── quell101: la bitácora de obra, dentro de la empresa (0.16.0) ───────────────
 *
 * Desde el 19-sep quell101 no tiene base propia: sus tablas viven en el
 * OrgDB (migración 0006) y su motor —el mismo código que corría en su Worker—
 * corre dentro del Durable Object (src/quell/motor.js). Esta ruta es la
 * puerta: la sesión, la empresa, la app prendida y quién viene ya los resolvió
 * el middleware de arriba; aquí se le pasan al motor en cabeceras y se le
 * reenvía la petición tal cual (formularios con fotos incluidos).
 *
 * Un cliente (`quien.clase === 'cliente'`) sí pasa por aquí: es la cara de
 * cliente de quell101, y el recorte de lo que ve lo hace el motor, en el
 * servidor. Es la excepción a «un cliente sólo abre /peek», y es una sola:
 * lo que el motor le da a un cliente está probado renglón por renglón.
 *
 * Los archivos (planos y fotos) se sirven desde aquí, no desde el objeto:
 * bytes de R2 bajo `orgs/{org}/quell/`, sólo para quien ya pasó la puerta. */

const quellPuedeAbrir = (c: Ctx) => c.get('quien').clase === 'miembro' || c.get('quien').clase === 'cliente';

rutas.get('/:o/quell/files/*', async (c) => {
  if (!quellPuedeAbrir(c)) return err(c, 'sin_permiso', 403);
  const llave = decodeURIComponent(c.req.path.replace(/^\/orgs\/[^/]+\/quell\/files\//, ''));
  // Sólo lo de ESTA empresa: la llave lleva la empresa adentro y aquí se
  // comprueba contra la de la sesión, no contra lo que diga la dirección.
  if (!llave.startsWith(`orgs/${c.get('org_id')}/quell/`)) return err(c, 'sin_permiso', 403, { motivo: 'ese archivo no es de esta empresa' });
  const obj = await c.env.ARCHIVOS.get(llave);
  if (!obj) return err(c, 'no_encontrado', 404);
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag);
  h.set('cache-control', 'private, max-age=31536000, immutable');
  return new Response(obj.body, { headers: h });
});

rutas.all('/:o/quell/*', async (c) => {
  if (!quellPuedeAbrir(c)) return err(c, 'sin_permiso', 403);
  const s = c.get('sesion');
  const quien = c.get('quien');
  const org_id = c.get('org_id');
  const entrada = new URL(c.req.url);
  const resto = entrada.pathname.replace(/^\/orgs\/[^/]+\/quell/, '') || '/';
  const interna = new URL(`https://quell.local/quell${resto}${entrada.search}`);

  const cabeceras = new Headers();
  for (const nombre of ['content-type', 'content-length']) {
    const v = c.req.header(nombre);
    if (v) cabeceras.set(nombre, v);
  }
  cabeceras.set('x-org', org_id);
  cabeceras.set('x-sitio', c.req.header('X-Sitio') || '');
  const usuario = await usuarioPorId(c.env, s.usuario_id);
  // Codificada: una cabecera sólo lleva ASCII, y un nombre con ñ o acento la
  // rompe en el navegador y saca un aviso en workerd. El objeto la decodifica.
  cabeceras.set('x-sesion', encodeURIComponent(JSON.stringify({
    correo: s.correo, nombre: usuario?.nombre ?? null, superadmin: s.superadmin,
    // 0.66.0 · `ref_id`: el cliente de la suite, para que el motor le abra la
    // obra ligada a su proyecto sin invitación aparte.
    quien: { clase: quien.clase, rol: quien.rol, usuario_id: quien.usuario_id, ref_id: quien.ref_id ?? null },
  })));

  // El cuerpo se lee entero antes de pasarlo: si el motor contesta sin leer
  // (un 403 temprano), un flujo a medias deja «can't read from request
  // stream» en el registro. Un plano son unos MB; cabe.
  const cuerpo = c.req.method === 'GET' || c.req.method === 'HEAD' ? null : await c.req.raw.arrayBuffer();
  const peticion = new Request(interna.toString(), { method: c.req.method, headers: cabeceras, body: cuerpo });
  return stub(c).fetch(peticion);
});

/* ─────────────── consecutivos por serie ───────────────
 *
 * El folio de la cotización lo pone la suite desde el contrato 0.9.0. Esto es
 * lo mismo para cualquier otro consecutivo: los recibos de quote101, que hasta
 * hoy se numeraban en el navegador —leer el contador de Firestore, sumarle uno
 * y guardarlo—. Ahí, dos personas guardando a la vez se llevan el mismo
 * número, y en un recibo eso no es un detalle.
 *
 * `POST` aparta el siguiente y lo consume. `GET` lo mira sin consumirlo, que
 * es lo que necesita una pantalla para enseñar el número antes de que alguien
 * confirme: si se apartara al abrir, cada vez que alguien se asomara y cerrara
 * se iría un número.
 *
 * Un número apartado no se devuelve si el recibo no se acaba imprimiendo. Eso
 * deja huecos, y es lo correcto: un consecutivo que reusa números es uno que
 * puede repetir. Un hueco se explica; dos recibos con el mismo número, no.
 *
 * La serie se acota a propósito: letras, números y guiones, hasta 16. Es la
 * llave primaria de una tabla, y una serie libre dejaría que cualquier app se
 * inventara contadores sin que nadie los vea.
 */

const SERIE_OK = /^[A-Z0-9-]{1,16}$/;

const serieDe = (c: Ctx) => {
  const s = String(c.req.param('serie') ?? '').trim().toUpperCase();
  return SERIE_OK.test(s) ? s : null;
};

rutas.get('/:o/folios/:serie', async (c) => {
  if (c.get('quien').clase === 'cliente') return err(c, 'sin_permiso', 403, { motivo: 'un cliente solo abre /peek' });
  const serie = serieDe(c);
  if (!serie) return err(c, 'datos_invalidos', 400, { serie: 'letras, números y guiones, hasta 16' });
  return ok(c, { serie, siguiente: await stub(c).verNumero(serie) });
});

rutas.post('/:o/folios/:serie', async (c) => {
  const quien = c.get('quien');
  if (quien.clase === 'cliente') return err(c, 'sin_permiso', 403, { motivo: 'un cliente solo abre /peek' });
  const serie = serieDe(c);
  if (!serie) return err(c, 'datos_invalidos', 400, { serie: 'letras, números y guiones, hasta 16' });
  // `COT` no se aparta por aquí: ése lo pone la propia creación de la
  // cotización, y dejar que una app se lleve números de esa serie por su
  // cuenta abriría huecos en la numeración de las cotizaciones sin motivo.
  if (serie === 'COT') {
    return err(c, 'sin_permiso', 403, { motivo: 'el folio de la cotización lo pone POST /orgs/:o/cotizaciones' });
  }
  return ok(c, { serie, numero: await stub(c).apartarNumero(serie) }, 201);
});

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

/* 0.55.0 · Quitar un archivo: el objeto de R2 y la fila, en ese orden (si el
 * bucket falla, la fila sigue apuntando a algo que existe; al revés quedaría
 * un objeto huérfano que nadie encuentra). Nació para los documentos del
 * proveedor (una carátula que se subió por error), pero es de cualquier
 * archivo de la empresa. Un cliente no borra nada. */
rutas.delete('/:o/archivos/:id', async (c) => {
  if (c.get('quien').clase === 'cliente') return err(c, 'sin_permiso', 403, { motivo: 'un cliente solo abre /peek' });
  const fila = (await stub(c).obtener('archivos', c.req.param('id')!)) as Record<string, unknown> | null;
  if (!fila) return err(c, 'no_encontrado', 404);
  await c.env.ARCHIVOS.delete(String(fila.r2_key));
  await stub(c).borrar('archivos', c.req.param('id')!);
  return ok(c, { borrado: true, id: c.req.param('id') });
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
  const permiso = revisarEscritura('conciliaciones', c.get('app'), ['corte_at']);
  if (!permiso.ok) return err(c, permiso.error, 403, permiso.detalle);

  // `negocio_id` ya no existe (0.63.0): si una pantalla vieja lo manda, se ignora.
  const cuerpo = await c.req
    .json<{ corte_at?: string; saldos?: Array<{ cuenta_id?: string; saldo_real?: unknown }> }>()
    .catch(() => ({}) as never);
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
  return ok(c, await stub(c).estadisticaConciliacion());
});

/* ─────────────── CRUD genérico ─────────────── */

/* Órdenes de compra y contabilidad fiscal (0.21.0). Se montan AQUÍ, antes
 * del CRUD genérico: si fueran después, `/:o/:tabla` se tragaría
 * `/:o/ordenes` como si «ordenes» fuera el nombre de una tabla. */
/** LA EMPRESA (0.62.0; tabla `empresa` desde 0.63.0): nombre, RFC, moneda
 *  y día de conciliación.
 *
 *  Mike, 1-oct: «Sólo es una empresa/negocio todo». Esto es lo que las
 *  pantallas leen y editan. Es el único renglón de `empresa` (migración
 *  0027), con id 'empresa'; si la org es nueva y todavía no lo tiene, se
 *  crea con su nombre del D1. GET lo abre quien es de la empresa o su
 *  personal; PATCH, quien la dirige. */
function formaDeEmpresa(e: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(e.id ?? 'empresa'), nombre: String(e.nombre ?? ''), rfc: (e.rfc as string | null) ?? null,
    moneda: String(e.moneda ?? 'MXN'), dia_conciliacion: Number(e.dia_conciliacion ?? 1),
  };
}

/** Lo que una pantalla puede cambiar de la empresa, ya revisado: nombre con
 *  algo, RFC en mayúsculas o nulo, moneda MXN|USD, día 0-6. Lo usan
 *  `PATCH /empresa` y el compat `PATCH /negocios/:id`. */
function datosDeEmpresa(b: Record<string, unknown>): { ok: true; datos: Record<string, unknown> } | { ok: false; error: string; detalle: Record<string, unknown> } {
  const datos: Record<string, unknown> = {};
  if (b.nombre !== undefined) {
    const nombre = String(b.nombre).trim();
    if (!nombre) return { ok: false, error: 'datos_invalidos', detalle: { falta: 'nombre' } };
    datos.nombre = nombre;
  }
  if (b.rfc !== undefined) datos.rfc = b.rfc === null || String(b.rfc).trim() === '' ? null : String(b.rfc).trim().toUpperCase();
  if (b.moneda !== undefined) {
    if (b.moneda !== 'MXN' && b.moneda !== 'USD') return { ok: false, error: 'datos_invalidos', detalle: { campo: 'moneda', permitidas: ['MXN', 'USD'] } };
    datos.moneda = b.moneda;
  }
  if (b.dia_conciliacion !== undefined) {
    const dia = Number(b.dia_conciliacion);
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) return { ok: false, error: 'datos_invalidos', detalle: { campo: 'dia_conciliacion', regla: '0 domingo … 6 sábado' } };
    datos.dia_conciliacion = dia;
  }
  return { ok: true, datos };
}

const dirige = (c: Ctx): boolean => {
  const quien = c.get('quien');
  return quien.clase === 'miembro' && (quien.rol === 'owner' || quien.rol === 'admin');
};

rutas.get('/:o/empresa', async (c) => {
  if (c.get('quien').clase === 'cliente') return err(c, 'sin_permiso', 403, { motivo: 'un cliente solo abre /peek' });
  return ok(c, formaDeEmpresa(await empresaDe(c)));
});

rutas.patch('/:o/empresa', async (c) => {
  if (!dirige(c)) return err(c, 'sin_permiso', 403, { motivo: 'los datos de la empresa los cambia quien la dirige' });
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const r = datosDeEmpresa(b);
  if (!r.ok) return err(c, r.error, 400, r.detalle);
  await empresaDe(c); // que exista, con el nombre de la org, antes de tocarla
  if (Object.keys(r.datos).length) await stub(c).actualizarEmpresa(r.datos);
  return ok(c, formaDeEmpresa(await empresaDe(c)));
});

/* ─────────────── COMPATIBILIDAD: /negocios (0.63.0) ───────────────
 *
 * La tabla `negocios` ya no existe; la empresa es una. Estas cuatro rutas
 * contestan la empresa CON LA FORMA DE NEGOCIO —id, nombre, rfc, moneda,
 * dia_conciliacion, creado_at— para que una pantalla que todavía liste
 * `GET /negocios` y tome `filas[0]` siga encontrando el mismo registro que
 * antes. SE VAN CUANDO NINGUNA PRUEBA LO PIDA. Van antes del CRUD genérico,
 * que ya no conoce `negocios` y contestaría 404 tabla_desconocida. */
const formaDeNegocio = (e: Record<string, unknown>): Record<string, unknown> => ({
  ...formaDeEmpresa(e), creado_at: String(e.creado_at ?? ''),
});

rutas.get('/:o/negocios', async (c) => {
  if (c.get('quien').clase === 'cliente') return err(c, 'sin_permiso', 403, { motivo: 'un cliente solo abre /peek' });
  return ok(c, { total: 1, filas: [formaDeNegocio(await empresaDe(c))] });
});

rutas.post('/:o/negocios', async (c) => {
  /* Antes creaba un negocio; ahora contesta la empresa. El cuerpo se ignora,
   * salvo nombre y moneda si la empresa todavía no existía: así una app
   * vieja que «crea su negocio» al arrancar deja la empresa con ese nombre
   * y no con el id de la org. */
  if (c.get('quien').clase === 'cliente') return err(c, 'sin_permiso', 403);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const enD1 = await org(c.env, c.get('org_id'));
  const nombre = String(b.nombre ?? '').trim() || enD1?.nombre || c.get('org_id');
  const moneda = b.moneda === 'USD' ? 'USD' : 'MXN';
  // `empresa()` sólo usa nombre y moneda si todavía no hay renglón.
  return ok(c, formaDeNegocio(await stub(c).empresa(nombre, moneda)), 201);
});

rutas.get('/:o/negocios/:id', async (c) => {
  if (c.get('quien').clase === 'cliente') return err(c, 'sin_permiso', 403, { motivo: 'un cliente solo abre /peek' });
  const e = await empresaDe(c);
  if (c.req.param('id') !== String(e.id)) return err(c, 'no_encontrado', 404);
  return ok(c, formaDeNegocio(e));
});

rutas.patch('/:o/negocios/:id', async (c) => {
  if (!dirige(c)) return err(c, 'sin_permiso', 403, { motivo: 'los datos de la empresa los cambia quien la dirige' });
  const e = await empresaDe(c);
  if (c.req.param('id') !== String(e.id)) return err(c, 'no_encontrado', 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const r = datosDeEmpresa(b);
  if (!r.ok) return err(c, r.error, 400, r.detalle);
  if (Object.keys(r.datos).length) await stub(c).actualizarEmpresa(r.datos);
  return ok(c, formaDeNegocio(await empresaDe(c)));
});

montarOrdenes(rutas);
montarObras(rutas);
montarNomina(rutas);

rutas.get('/:o/:tabla', async (c) => {
  const tabla = c.req.param('tabla')!;
  const permiso = puedeLeer(c, tabla);
  if (permiso) return permiso;

  const filtros: Record<string, string> = {};
  for (const [k, v] of new URL(c.req.url).searchParams) filtros[k] = v;
  // Los ajustes de una app no los lista otra. El filtro se SOBRESCRIBE con la
  // cabecera X-App: aceptarlo del que pregunta sería ofrecer `?app=cotizador101`
  // como manera de abrir la lista de precios desde cualquier otra app.
  if (tabla === 'ajustes') filtros.app = c.get('app');
  const quien = c.get('quien');
  /* Hasta 0.62.0 aquí se rellenaba `negocio_id` con el del que pregunta
   * («un negocio a la vez»). Ya no hay negocios: un `?negocio_id=` que
   * llegue no está en los filtros de ninguna tabla y `listar` lo ignora. */

  /* El tope. Toda lista viene topada, y `total` dice cuántas hay de verdad:
   * quien lo ignore se lleva una respuesta 200 con menos renglones y ninguna
   * seña de que faltan. Eso ya costó un defecto —dash101 pedía los ítems de
   * un proyecto sin filtrar, los cancelados viejos llenaban las 500 y los
   * vivos recientes se caían de la vista: la pantalla decía «sin ítems»
   * mientras el precio de venta, que la API suma en la base, seguía en su
   * cifra correcta—.
   *
   * Desde 0.24.2 se puede pedir más con `?limite=`, hasta TOPE_MAXIMO. No se
   * quita el tope: una lista sin techo es una manera de tumbar el Durable
   * Object desde una pantalla. Lo que se quita es la obligación de adivinar
   * que faltaban filas. */
  const limite = topeDe(filtros.limite);
  delete filtros.limite;

  const r = await stub(c).listar(tabla as Tabla, filtros, {
    usuario_id: quien.usuario_id,
    clase: quien.clase,
    ref_id: quien.ref_id,
    ve_dinero: quien.ve_dinero,
  }, limite);
  return ok(c, { total: r.total, filas: r.filas.map((f) => podar(quien, tabla as Tabla, f)) });
});

rutas.get('/:o/:tabla/:id', async (c) => {
  const tabla = c.req.param('tabla')!;
  const permiso = puedeLeer(c, tabla);
  if (permiso) return permiso;
  const ajeno = ajusteAjeno(c, tabla, c.req.param('id')!);
  if (ajeno) return ajeno;
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
  // Los ajustes son configuración de la app: los toca quien es de la empresa,
  // no el personal de piso ni un cliente. La lectura lo pide igual (puedeLeer).
  if (tabla === 'ajustes' && quien.clase !== 'miembro') {
    return err(c, 'sin_permiso', 403, { motivo: 'los ajustes son configuracion de la app: solo miembros de la empresa' });
  }

  const datos = sinNegocio(await c.req.json<Record<string, unknown>>().catch(() => ({}) as never));
  const campos = Object.keys(datos);

  const veredicto = revisarEscritura(tabla, c.get('app'), campos);
  if (!veredicto.ok) return err(c, veredicto.error, 403, veredicto.detalle);

  const falta = DEFS[tabla].requeridos.filter((r) => datos[r] === undefined || datos[r] === null || datos[r] === '');
  if (falta.length) return err(c, 'datos_invalidos', 400, { falta });

  const malDinero = revisarDinero(tabla, datos);
  if (malDinero) return err(c, 'dinero_no_entero', 400, malDinero);

  const malProveedor = tabla === 'proveedores' ? revisarProveedor(datos) : tabla === 'proveedor_cuentas' ? revisarCuenta(datos) : tabla === 'accionistas' ? revisarAccionista(datos) : null;
  if (malProveedor) return err(c, 'datos_invalidos', 400, { errores: malProveedor });
  if (tabla === 'clientes') { const repetido = await correoDeOtroCliente(c, datos, null); if (repetido) return repetido; }

  const fila = await stub(c).crear(tabla, datos, { app: c.get('app'), usuario_id: quien.usuario_id, correo: c.get('sesion')?.correo ?? null });
  return ok(c, podar(quien, tabla, fila), 201);
});

/* 0.54.0 · Los datos con los que se le PAGA a un proveedor se revisan al
 * escribirlos, no cuando ya rebotó la transferencia. La CLABE lleva su dígito
 * verificador (pesos 3, 7, 1); el RFC son 12 (moral) o 13 (física); el correo
 * tiene arroba y punto. Vacío se acepta: son opcionales. Se normalizan (sin
 * espacios; RFC en mayúsculas) para que dos altas del mismo proveedor no
 * difieran por un espacio. */
export function clabeValida(c: string): boolean {
  if (!/^\d{18}$/.test(c)) return false;
  const pesos = [3, 7, 1];
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += (Number(c[i]) * pesos[i % 3]) % 10;
  return (10 - (suma % 10)) % 10 === Number(c[17]);
}
/* 0.55.0 · Una cuenta del proveedor (0023): la CLABE se normaliza y se revisa
 * igual que en `proveedores`; el alias no va vacío. */
export function revisarCuenta(datos: Record<string, unknown>): Record<string, string> | null {
  const errores: Record<string, string> = {};
  if (datos.clabe !== undefined && datos.clabe !== null) {
    const c = String(datos.clabe).replace(/[\s-]/g, '');
    datos.clabe = c;
    if (!clabeValida(c)) errores.clabe = 'La CLABE no cuadra: son 18 dígitos y el último los verifica.';
  }
  if (datos.alias !== undefined && datos.alias !== null) {
    const a = String(datos.alias).trim().slice(0, 60);
    datos.alias = a;
    if (!a) errores.alias = 'Ponle un alias a la cuenta para saber cuál es.';
  }
  return Object.keys(errores).length ? errores : null;
}

export function revisarProveedor(datos: Record<string, unknown>): Record<string, string> | null {
  const errores: Record<string, string> = {};
  const texto = (k: string) => (datos[k] === undefined || datos[k] === null ? undefined : String(datos[k]).trim());
  const clabe = texto('clabe');
  if (clabe !== undefined) {
    const limpia = clabe.replace(/[\s-]/g, '');
    if (limpia && !clabeValida(limpia)) errores.clabe = 'La CLABE son 18 dígitos y no cuadra su dígito verificador.';
    datos.clabe = limpia || null;
  }
  const rfc = texto('rfc');
  if (rfc !== undefined) {
    const limpio = rfc.toUpperCase().replace(/[\s-]/g, '');
    if (limpio && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(limpio)) errores.rfc = 'El RFC son 12 o 13 caracteres: letras, fecha y homoclave.';
    datos.rfc = limpio || null;
  }
  const correo = texto('correo');
  if (correo !== undefined) {
    const limpio = correo.toLowerCase();
    if (limpio && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) errores.correo = 'Escribe un correo válido.';
    datos.correo = limpio || null;
  }
  const maps = texto('maps_url');
  if (maps !== undefined) {
    if (maps && !/^https:\/\/(www\.google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps|www\.waze\.com)/i.test(maps)) errores.maps_url = 'Pega la liga que comparte Google Maps (empieza con https://maps.app.goo.gl o https://www.google.com/maps).';
    datos.maps_url = maps || null;
  }
  for (const k of ['banco', 'beneficiario', 'direccion', 'telefono', 'nombre']) {
    const v = texto(k);
    if (v !== undefined) datos[k] = v || (k === 'nombre' ? v : null);
  }
  return Object.keys(errores).length ? errores : null;
}

/** 0.57.0 · Un accionista: nombre con algo, participación entre 0 y 100 si
 *  viene, y RFC y correo con la misma vara que un proveedor. Normaliza igual
 *  (RFC en mayúsculas, correo en minúsculas, vacíos a NULL). */
export function revisarAccionista(datos: Record<string, unknown>): Record<string, string> | null {
  const errores = revisarProveedor(datos) ?? {};
  if (datos.nombre !== undefined && !String(datos.nombre).trim()) errores.nombre = 'Escribe el nombre del accionista.';
  if (datos.porcentaje !== undefined && datos.porcentaje !== null && datos.porcentaje !== '') {
    const n = Number(datos.porcentaje);
    if (!Number.isFinite(n) || n < 0 || n > 100) errores.porcentaje = 'La participación es un número entre 0 y 100.';
    else datos.porcentaje = n;
  } else if (datos.porcentaje === '') datos.porcentaje = null;
  return Object.keys(errores).length ? errores : null;
}

rutas.patch('/:o/:tabla/:id', async (c) => {
  const tabla = c.req.param('tabla')!;
  if (!esTabla(tabla)) return err(c, 'tabla_desconocida', 404, { tabla });
  const quien = c.get('quien');
  if (quien.clase === 'cliente') return err(c, 'sin_permiso', 403);
  if ((APPEND_ONLY as string[]).includes(tabla)) return err(c, 'sin_permiso', 403, { motivo: `${tabla} es append-only` });
  // Los ajustes son configuración de la app: los toca quien es de la empresa,
  // no el personal de piso ni un cliente. La lectura lo pide igual (puedeLeer).
  if (tabla === 'ajustes' && quien.clase !== 'miembro') {
    return err(c, 'sin_permiso', 403, { motivo: 'los ajustes son configuracion de la app: solo miembros de la empresa' });
  }
  const ajeno = ajusteAjeno(c, tabla, c.req.param('id')!);
  if (ajeno) return ajeno;

  const datos = sinNegocio(await c.req.json<Record<string, unknown>>().catch(() => ({}) as never));
  const veredicto = revisarEscritura(tabla, c.get('app'), Object.keys(datos));
  if (!veredicto.ok) return err(c, veredicto.error, 403, veredicto.detalle);

  const malDinero = revisarDinero(tabla, datos);
  if (malDinero) return err(c, 'dinero_no_entero', 400, malDinero);

  const malProveedor = tabla === 'proveedores' ? revisarProveedor(datos) : tabla === 'proveedor_cuentas' ? revisarCuenta(datos) : tabla === 'accionistas' ? revisarAccionista(datos) : null;
  if (malProveedor) return err(c, 'datos_invalidos', 400, { errores: malProveedor });
  if (tabla === 'clientes') { const repetido = await correoDeOtroCliente(c, datos, c.req.param('id')!); if (repetido) return repetido; }

  /* 0.46.0 · Una cotización aprobada es lo que se vendió: sus piezas ya están
   * en el proyecto. Si se pudiera seguir editando, el papel y la obra dirían
   * cosas distintas. Para cambiarla se hace otra corrida. Y `aceptada` sólo
   * la pone la aprobación, que es la que crea las piezas. */
  if (tabla === 'cotizaciones') {
    const actual = await stub(c).obtener('cotizaciones', c.req.param('id')!);
    if (actual?.estado === 'aceptada') {
      return err(c, 'ya_aprobada', 409, { motivo: 'una cotización aprobada ya no se edita; para cambiarla se hace otra corrida' });
    }
    if (datos.estado === 'aceptada') {
      return err(c, 'datos_invalidos', 400, { estado: 'aceptada solo la pone POST /orgs/:o/cotizaciones/:id/aprobar' });
    }
  }

  const fila = await stub(c).actualizar(tabla, c.req.param('id')!, datos, { app: c.get('app'), usuario_id: quien.usuario_id, correo: c.get('sesion')?.correo ?? null });
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
  if (tabla === 'items') return err(c, 'items_nunca_se_borran', 403, { en_su_lugar: 'POST /orgs/:o/items/:id/sacar' });
  if ((APPEND_ONLY as string[]).includes(tabla)) return err(c, 'sin_permiso', 403, { motivo: `${tabla} es append-only` });
  const ajeno = ajusteAjeno(c, tabla, c.req.param('id')!);
  if (ajeno) return ajeno;

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
  // Los ajustes son configuración de la app, y ahí vive la lista de precios de
  // quote101, que son costos. No es dato de piso: ni personal ni clientes.
  if (tabla === 'ajustes' && quien.clase !== 'miembro') {
    return err(c, 'sin_permiso', 403, { motivo: 'los ajustes son configuracion de la app: solo miembros de la empresa' });
  }
  return null;
}

/** Un ajuste sólo lo abre su propia app. El `id` es `app:clave` y lo armó la
 *  API al crearlo, así que el prefijo es prueba de quién es: no hay que
 *  consultar la fila para saberlo, y una fila que no existe no se distingue de
 *  una ajena —404 en los dos casos, que es lo que hay que contestar—. */
function ajusteAjeno(c: Ctx, tabla: string, id: string) {
  if (tabla !== 'ajustes') return null;
  if (id.startsWith(c.get('app') + ':')) return null;
  return err(c, 'no_encontrado', 404);
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
