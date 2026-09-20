/* /orgs/:o/ordenes/* y /orgs/:o/fiscal/* — órdenes de compra y contabilidad
 * fiscal. Encargo del chat de dash101, 19-sep-2026.
 *
 * Se montan sobre el MISMO enrutador de `/orgs`, después de sus cuatro
 * puertas: cuando un handler de aquí corre, `quien`, `app` y `org_id` ya
 * están resueltos. Y se registran ANTES del CRUD genérico (`/:o/:tabla`), o
 * ése se tragaría `/:o/ordenes` como si fuera una tabla.
 *
 * POR QUÉ ESTAS TABLAS NO SALEN POR EL CRUD GENÉRICO
 *
 * Porque el CRUD entrega la tabla entera a quien puede leerla, y aquí un
 * miembro tiene que ver SÓLO SUS órdenes —decisión de Mike—. Ese filtro no se
 * puede expresar en el CRUD. Lo mismo con `personal.es_contador`: si estuviera
 * en ESCRITORES, cualquiera con dash101 se marcaría solo como pagador. Aquí
 * cada permiso se revisa renglón por renglón, en el servidor, que es lo que
 * manda el encargo porque esto mueve dinero de verdad.
 */

import type { Hono } from 'hono';
import { err, ok, type Ctx, type Vars } from '../http';
import type { Env } from '../entorno';
import type { ApiOrgDB } from '../org-db';
import { miembrosDe } from '../maestro';
import { enviarCorreo, correoOrdenPagada, correoOrdenResuelta } from '../auth/correo';

type App = Hono<{ Bindings: Env; Variables: Vars }>;

const stub = (c: Ctx): ApiOrgDB => c.env.ORG.get(c.env.ORG.idFromName(c.get('org_id'))) as unknown as ApiOrgDB;
const esFalla = (r: unknown): r is { error: string; detalle?: unknown } =>
  !!r && typeof r === 'object' && 'error' in (r as Record<string, unknown>);

/** El primer día del mes de una fecha, y el último. Para que la pantalla no
 *  tenga que calcular meses: los meses de 28, 30 y 31 días son justo donde se
 *  equivoca un cálculo hecho en el navegador. */
function mes(ym: string): { desde: string; hasta: string } {
  const [a, m] = ym.split('-').map(Number);
  const fin = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${ym}-01`, hasta: `${ym}-${String(fin).padStart(2, '0')}` };
}

export function montarOrdenes(rutas: App): void {
  /* ─────────────── quién es quién ─────────────── */

  /** Cualquiera de la empresa puede pedir una compra; un cliente del portal,
   *  no. Un cliente no es de la empresa: es de afuera. */
  const puedePedir = (c: Ctx) => c.get('quien').clase !== 'cliente';

  /** Pagar lo decide la etiqueta, no el rol. Se pregunta a la base cada vez:
   *  quitarle la etiqueta a alguien tiene que surtir efecto al momento. */
  const esContador = (c: Ctx) => stub(c).esContador(c.get('quien').usuario_id);

  /** Sólo el dueño reparte la etiqueta de contador. */
  const esDueno = (c: Ctx) => {
    const q = c.get('quien');
    return q.clase === 'miembro' && q.rol === 'owner';
  };

  /* ─────────────── órdenes ─────────────── */

  /** El buzón. Va antes de `/:id` o `buzon` se leería como un id. */
  rutas.get('/:o/ordenes/buzon', async (c) => {
    if (!(await esContador(c))) return err(c, 'sin_permiso', 403, { motivo: 'el buzón es de quien paga' });
    return ok(c, await stub(c).buzon(undefined, c.req.query('negocio_id') || null));
  });

  /** Quién puede pagar hoy. La ve el dueño para repartir la etiqueta.
   *
   *  Junta las dos listas a propósito: los MIEMBROS de la empresa (que viven
   *  en la base maestra) y la gente de `personal` (que llenan roster101 y
   *  quell101). Si sólo enseñara `personal`, en una empresa que nada más usa
   *  dash101 la pantalla saldría vacía y el dueño no podría marcarse ni a sí
   *  mismo. */
  rutas.get('/:o/ordenes/contadores', async (c) => {
    if (!esDueno(c)) return err(c, 'sin_permiso', 403, { motivo: 'solo_el_dueno' });
    const { filas: personal } = await stub(c).listar('personal', { activo: '1' });
    const porUsuario = new Map(personal.filter((p) => p.usuario_id).map((p) => [String(p.usuario_id), p]));
    const gente = await miembrosDe(c.env, c.get('org_id'));

    const salida = gente.map((m) => {
      const p = porUsuario.get(m.usuario_id);
      porUsuario.delete(m.usuario_id);
      return {
        usuario_id: m.usuario_id, correo: m.correo, nombre: m.nombre ?? m.correo, rol: m.rol,
        personal_id: p ? String(p.id) : null, es_contador: !!p?.es_contador,
      };
    });
    // Y la gente de `personal` que no es miembro de la suite (obra, taller):
    // también se le puede dar la etiqueta.
    for (const p of porUsuario.values()) {
      salida.push({
        usuario_id: String(p.usuario_id), correo: (p.correo as string) ?? '', nombre: String(p.nombre),
        rol: 'personal' as never, personal_id: String(p.id), es_contador: !!p.es_contador,
      });
    }
    // Y quien está leyendo, si no salió en ninguna de las dos listas: el
    // superadmin abre como dueño sin ser miembro, y la pantalla tiene que
    // dejarlo marcarse (si no, sale vacía y no hay quién pague).
    const yo = c.get('quien').usuario_id;
    if (!salida.some((f) => f.usuario_id === yo)) {
      const correo = c.get('sesion').correo;
      salida.unshift({ usuario_id: yo, correo, nombre: correo, rol: 'owner', personal_id: null, es_contador: false });
    }
    return ok(c, { filas: salida });
  });

  /** Marcar o desmarcar contador. Deja renglón en la bitácora de órdenes:
   *  quién pudo pagar y desde cuándo es parte de la misma historia.
   *
   *  Acepta `usuario_id` o `personal_id`. Con `usuario_id` se crea la fila de
   *  `personal` si no la había: es lo que hace posible marcar al dueño en una
   *  empresa que sólo usa dash101, donde nadie llena esa tabla. */
  rutas.post('/:o/ordenes/contadores', async (c) => {
    if (!esDueno(c)) return err(c, 'sin_permiso', 403, { motivo: 'solo_el_dueno' });
    const b = await c.req.json<{ personal_id?: unknown; usuario_id?: unknown; valor?: unknown }>().catch(() => ({}) as never);
    const valor = b.valor === true || b.valor === 1;

    let personal_id = typeof b.personal_id === 'string' ? b.personal_id : '';
    if (!personal_id) {
      if (typeof b.usuario_id !== 'string' || !b.usuario_id) {
        return err(c, 'datos_invalidos', 400, { falta: 'personal_id o usuario_id' });
      }
      const m = (await miembrosDe(c.env, c.get('org_id'))).find((x) => x.usuario_id === b.usuario_id);
      const ya = await stub(c).personalDeUsuario(b.usuario_id);
      // El superadmin entra a cualquier empresa como dueño, pero NO sale en
      // `miembrosDe`: es de Taller 101, no de la empresa. Marcarse a sí mismo
      // sí se vale —ya pasó la puerta de dueño de ESTA empresa—, y es lo que
      // hace falta para dejar armada una empresa recién dada de alta.
      const soyYo = b.usuario_id === c.get('quien').usuario_id;
      if (!m && !ya && !soyYo) return err(c, 'no_encontrado', 404, { motivo: 'no es de esta empresa', usuario_id: b.usuario_id });
      const correoYo = soyYo ? c.get('sesion').correo : null;
      const fila = ya ?? (await stub(c).asegurarPersonal({
        usuario_id: b.usuario_id, nombre: m?.nombre || m?.correo || correoYo || 'Sin nombre', correo: m?.correo ?? correoYo,
      }));
      personal_id = String(fila.id);
    }

    const fila = await stub(c).marcarContador({
      personal_id, valor,
      quien_usuario_id: c.get('quien').usuario_id,
      quien_nombre: c.get('sesion').correo,
    });
    if (!fila) return err(c, 'no_encontrado', 404, { personal_id });
    return ok(c, fila);
  });

  /** Mis órdenes. Un miembro ve SÓLO las suyas: el filtro es del servidor. */
  rutas.get('/:o/ordenes', async (c) => {
    if (!puedePedir(c)) return err(c, 'sin_permiso', 403);
    return ok(c, { filas: await stub(c).misOrdenes(c.get('quien').usuario_id, c.req.query('negocio_id') || null) });
  });

  /** Pedir una compra. Sin autorización previa: cae directa al buzón. */
  rutas.post('/:o/ordenes', async (c) => {
    if (!puedePedir(c)) return err(c, 'sin_permiso', 403);
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const q = c.get('quien');
    const s = c.get('sesion');
    const persona = (await stub(c).personalDeUsuario(q.usuario_id)) as Record<string, unknown> | null;
    const r = await stub(c).crearOrden({
      ...b,
      // Estos cuatro NO los manda la pantalla: los pone la API. Si los
      // mandara, cualquiera podría pedir una compra a nombre de otro.
      solicitante_usuario_id: q.usuario_id,
      solicitante_id: persona ? String(persona.id) : null,
      solicitante_correo: s.correo,
      solicitante_nombre: persona ? String(persona.nombre) : s.correo,
      // Y éstos tampoco: el estado, el folio y el desglose los decide la base.
      estado: undefined, folio: undefined, movimiento_id: undefined,
    });
    if (esFalla(r)) return err(c, r.error, 400, r.detalle);
    return ok(c, r, 201);
  });

  /** Una orden con su historia. La abre quien la pidió, o quien paga. */
  rutas.get('/:o/ordenes/:id', async (c) => {
    const r = await stub(c).verOrden(c.req.param('id')!);
    if (!r) return err(c, 'no_encontrado', 404);
    const q = c.get('quien');
    const suya = String(r.orden.solicitante_usuario_id) === q.usuario_id;
    if (!suya && !(await esContador(c))) return err(c, 'sin_permiso', 403);
    return ok(c, r);
  });

  /** Pagar. Una sola transacción del lado de la base; aquí sólo el permiso,
   *  y el correo, que va después de que el dinero ya quedó registrado. */
  rutas.post('/:o/ordenes/:id/pagar', async (c) => {
    if (!(await esContador(c))) return err(c, 'sin_permiso', 403, { motivo: 'solo_quien_paga' });
    const b = await c.req.json<{ cuenta_id?: unknown; fecha?: unknown; nota?: unknown }>().catch(() => ({}) as never);
    if (typeof b.cuenta_id !== 'string' || !b.cuenta_id) return err(c, 'datos_invalidos', 400, { falta: 'cuenta_id' });
    const r = await stub(c).pagarOrden({
      id: c.req.param('id')!,
      cuenta_id: b.cuenta_id,
      fecha: typeof b.fecha === 'string' ? b.fecha : undefined,
      nota: typeof b.nota === 'string' ? b.nota : null,
      quien_usuario_id: c.get('quien').usuario_id,
      quien_nombre: c.get('sesion').correo,
    });
    if (esFalla(r)) {
      // Pagar dos veces la misma orden no es un error del que pica: es que
      // alguien más ya la pagó. 409, no 400.
      const estado = r.error === 'no_encontrado' ? 404 : r.error === 'orden_no_esta_en_buzon' ? 409 : 400;
      return err(c, r.error, estado, r.detalle);
    }

    const cuenta = (await stub(c).obtener('cuentas', b.cuenta_id)) as Record<string, unknown> | null;
    const correo = await avisar(c, r.orden, 'pagada', {
      cuenta: cuenta ? String(cuenta.nombre) : '',
      movimiento_id: String(r.movimiento.id),
    });
    return ok(c, { ...r, correo });
  });

  /** Devolver para corregir, o rechazar de plano. Motivo obligatorio. */
  for (const [ruta, que] of [['devolver', 'devuelta'], ['rechazar', 'rechazada']] as const) {
    rutas.post(`/:o/ordenes/:id/${ruta}`, async (c) => {
      if (!(await esContador(c))) return err(c, 'sin_permiso', 403, { motivo: 'solo_quien_paga' });
      const b = await c.req.json<{ nota?: unknown }>().catch(() => ({}) as never);
      if (typeof b.nota !== 'string' || !b.nota.trim()) {
        return err(c, 'datos_invalidos', 400, { falta: 'nota', porque: 'una orden que vuelve sin decir por qué se vuelve a mandar igual' });
      }
      const r = await stub(c).resolverOrden({
        id: c.req.param('id')!, que, nota: b.nota,
        quien_usuario_id: c.get('quien').usuario_id, quien_nombre: c.get('sesion').correo,
      });
      if (esFalla(r)) {
        const estado = r.error === 'no_encontrado' ? 404 : r.error === 'orden_no_esta_en_buzon' ? 409 : 400;
        return err(c, r.error, estado, r.detalle);
      }
      const correo = await avisar(c, r, que, { nota: b.nota });
      return ok(c, { orden: r, correo });
    });
  }

  /** Corregir una devuelta y reenviarla. Sólo quien la pidió, y conserva el
   *  mismo folio: una orden corregida no es otra orden. */
  rutas.patch('/:o/ordenes/:id', async (c) => {
    const id = c.req.param('id')!;
    const actual = await stub(c).verOrden(id);
    if (!actual) return err(c, 'no_encontrado', 404);
    if (String(actual.orden.solicitante_usuario_id) !== c.get('quien').usuario_id) {
      return err(c, 'sin_permiso', 403, { motivo: 'solo_quien_la_pidio' });
    }
    const cambios = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const r = await stub(c).corregirOrden({
      id, cambios, quien_usuario_id: c.get('quien').usuario_id, quien_nombre: c.get('sesion').correo,
    });
    if (esFalla(r)) return err(c, r.error, r.error === 'orden_no_esta_devuelta' ? 409 : 400, r.detalle);
    return ok(c, r);
  });

  /* ─────────────── contabilidad fiscal ───────────────
   * Es dinero: no la abre un cliente del portal ni alguien de personal sin
   * `ve_dinero`, igual que las demás tablas de dinero. */

  const puedeFiscal = (c: Ctx) => c.get('quien').clase !== 'cliente' && c.get('quien').ve_dinero;
  const rango = (c: Ctx) => {
    const q = c.req.query();
    if (q.mes) return mes(q.mes);
    return { desde: q.desde || '0000-01-01', hasta: q.hasta || '9999-12-31' };
  };

  rutas.get('/:o/fiscal/iva', async (c) => {
    if (!puedeFiscal(c)) return err(c, 'sin_permiso', 403);
    const { desde, hasta } = rango(c);
    return ok(c, await stub(c).ivaDelMes(desde, hasta));
  });

  rutas.get('/:o/fiscal/cuadre', async (c) => {
    if (!puedeFiscal(c)) return err(c, 'sin_permiso', 403);
    const { desde, hasta } = rango(c);
    return ok(c, await stub(c).facturadoVsReal(desde, hasta));
  });

  rutas.get('/:o/fiscal/pendientes', async (c) => {
    if (!puedeFiscal(c)) return err(c, 'sin_permiso', 403);
    return ok(c, { filas: await stub(c).pendientesDeFactura() });
  });

  rutas.get('/:o/fiscal/cfdi', async (c) => {
    if (!puedeFiscal(c)) return err(c, 'sin_permiso', 403);
    const q = c.req.query();
    const { desde, hasta } = rango(c);
    return ok(c, { filas: await stub(c).listaCfdi({ desde, hasta, tipo: q.tipo, estado: q.estado }) });
  });

  rutas.post('/:o/fiscal/cfdi', async (c) => {
    if (!puedeFiscal(c)) return err(c, 'sin_permiso', 403);
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const r = await stub(c).crearCfdi({ ...b, creado_por: c.get('quien').usuario_id });
    if (esFalla(r)) return err(c, r.error, r.error === 'uuid_repetido' ? 409 : 400, r.detalle);
    return ok(c, r, 201);
  });

  rutas.post('/:o/fiscal/cfdi/:id/ligar', async (c) => {
    if (!puedeFiscal(c)) return err(c, 'sin_permiso', 403);
    const b = await c.req.json<{ movimiento_id?: unknown; monto_aplicado?: unknown }>().catch(() => ({}) as never);
    if (typeof b.movimiento_id !== 'string' || !b.movimiento_id) return err(c, 'datos_invalidos', 400, { falta: 'movimiento_id' });
    const r = await stub(c).ligarCfdi({
      cfdi_id: c.req.param('id')!,
      movimiento_id: b.movimiento_id,
      monto_aplicado: typeof b.monto_aplicado === 'number' ? b.monto_aplicado : undefined,
    });
    if (esFalla(r)) return err(c, r.error, r.error.endsWith('desconocido') ? 404 : 400, r.detalle);
    return ok(c, r);
  });

  rutas.post('/:o/fiscal/cfdi/:id/cancelar', async (c) => {
    if (!puedeFiscal(c)) return err(c, 'sin_permiso', 403);
    const r = await stub(c).cancelarCfdi(c.req.param('id')!);
    if (esFalla(r)) return err(c, r.error, 404);
    return ok(c, r);
  });

  rutas.post('/:o/fiscal/movimientos/:id/facturado', async (c) => {
    if (!puedeFiscal(c)) return err(c, 'sin_permiso', 403);
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const r = await stub(c).marcarFacturado({ ...b, movimiento_id: c.req.param('id')!, facturado: b.facturado !== false });
    if (esFalla(r)) return err(c, r.error, r.error === 'movimiento_desconocido' ? 404 : 400, r.detalle);
    return ok(c, r);
  });
}

/* ─────────────── el correo ───────────────
 * Al `solicitante_correo` de la orden —el que se copió al crearla—, con el
 * mismo molde de `correo.ts`. Fuera de producción NO sale, a propósito
 * (rebotes y reputación del dominio); la respuesta dice si se encoló y por
 * qué no, que es lo que miden las pruebas. */
async function avisar(
  c: Ctx,
  orden: Record<string, unknown>,
  que: 'pagada' | 'devuelta' | 'rechazada',
  extra: { cuenta?: string; movimiento_id?: string; nota?: string },
): Promise<{ enviado: boolean; motivo?: string; para?: string }> {
  const para = String(orden.solicitante_correo ?? '').trim();
  if (!para) return { enviado: false, motivo: 'la_orden_no_trae_correo' };
  const datos = {
    folio: String(orden.folio),
    proveedor: String(orden.proveedor_nombre ?? 'sin proveedor'),
    concepto: String(orden.concepto ?? ''),
    monto: Number(orden.monto ?? 0),
    moneda: String(orden.moneda ?? 'MXN'),
    fecha: String(orden.pagada_at ?? '').slice(0, 10),
    cuenta: extra.cuenta ?? '',
    nota: extra.nota ?? '',
    url: `${(c.env.URL_PUBLICA || '').replace(/\/+$/, '')}/orgs/${c.get('org_id')}/ordenes/${String(orden.id)}`,
  };
  const msg = que === 'pagada' ? correoOrdenPagada(datos) : correoOrdenResuelta(que, datos);
  const r = await enviarCorreo(c.env, { para, ...msg });
  return { ...r, para };
}
