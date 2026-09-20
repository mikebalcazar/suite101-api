/* /orgs/:o/nomina/* — la raya: lo que se le paga a la gente, y su recibo.
 *
 * ENCARGO (Mike, 20-sep-2026)
 *
 *   «pon en la fila un administrador de nóminas. Tenemos que analizar esto
 *   bien para ver cómo integrarlo.»
 *
 * Y al analizarlo escogió dos cosas con todas sus letras:
 *
 *   · el alcance: **pagos de raya y recibos**, NO nómina calculada. Nada de
 *     IMSS, nada de ISR, nada de CFDI de nómina. Es una decisión, no una
 *     omisión: una retención mal calculada se descubre en una auditoría,
 *     meses después y con multa, y quien lleva eso hoy lo lleva con su
 *     contador;
 *   · dónde vive: **dentro de dash101, con permiso aparte**. La raya es
 *     dinero que sale de las mismas cuentas, así que mudarla a otra app
 *     partiría el saldo en dos lugares. Pero lo que gana cada quien no lo ve
 *     cualquiera con dash101 abierto.
 *
 * ESE «PERMISO APARTE» ES `personal.es_nominas`, y es el molde que ya existe
 * para `es_contador` (0008): una etiqueta que sólo el dueño reparte, que NO
 * está en ESCRITORES —o cualquiera se marcaría solo— y que se pregunta a la
 * base en cada llamada, para que quitarla surta efecto al momento.
 *
 * No se reusa `es_contador` a propósito. Pagarle a un proveedor y saber
 * cuánto gana cada quien son dos cosas distintas, y la segunda es la que
 * nadie quiere que ande suelta en una oficina chica.
 *
 * Se monta sobre el mismo enrutador de `/orgs`, después de sus puertas y
 * ANTES del CRUD genérico: si fuera después, `/:o/:tabla` se tragaría
 * `/:o/nomina` como si `nomina` fuera una tabla.
 */

import type { Hono } from 'hono';
import { err, ok, type Ctx, type Vars } from '../http';
import type { Env } from '../entorno';
import type { ApiOrgDB } from '../org-db';
import { miembrosDe } from '../maestro';

type App = Hono<{ Bindings: Env; Variables: Vars }>;

const stub = (c: Ctx): ApiOrgDB => c.env.ORG.get(c.env.ORG.idFromName(c.get('org_id'))) as unknown as ApiOrgDB;
const esFalla = (r: unknown): r is { error: string; detalle?: unknown } =>
  !!r && typeof r === 'object' && 'error' in (r as Record<string, unknown>);

/** El código HTTP que le toca a cada error del motor. Un 404 y un 409 dicen
 *  cosas distintas a quien llama: uno es «no existe», el otro «existe y no se
 *  puede ahorita». Mandar todo como 400 obliga a leer el texto. */
const codigo = (e: string) => (e === 'no_encontrado' ? 404 : e === 'datos_invalidos' ? 400 : 409);

export function montarNomina(rutas: App): void {
  /** Sólo el dueño reparte la etiqueta. */
  const esDueno = (c: Ctx) => {
    const q = c.get('quien');
    return q.clase === 'miembro' && q.rol === 'owner';
  };

  /** Ver o mover la raya. El dueño entra siempre —si no, una empresa que
   *  acaba de abrir no tendría a nadie que pudiera empezar—; los demás,
   *  con la etiqueta. Se pregunta a la base cada vez. */
  const puedeNomina = async (c: Ctx) => {
    const q = c.get('quien');
    if (q.clase !== 'miembro') return false;
    if (q.rol === 'owner') return true;
    return await stub(c).esDeNominas(q.usuario_id);
  };

  /* ─────────────── quién puede ─────────────── */

  /** Quién ve la raya hoy. La abre el dueño para repartir la etiqueta.
   *
   *  Junta las dos listas —los MIEMBROS de la empresa y la gente de
   *  `personal`— por la misma razón que la de contadores: en una empresa que
   *  sólo usa dash101, `personal` está vacía y la pantalla saldría sin nadie
   *  a quien marcar, ni siquiera el dueño. */
  rutas.get('/:o/nomina/encargados', async (c) => {
    if (!esDueno(c)) return err(c, 'sin_permiso', 403, { motivo: 'solo_el_dueno' });
    const { filas: personal } = await stub(c).listar('personal', { activo: '1' });
    const porUsuario = new Map(personal.filter((p) => p.usuario_id).map((p) => [String(p.usuario_id), p]));
    const gente = await miembrosDe(c.env, c.get('org_id'));

    const salida = gente.map((m) => {
      const p = porUsuario.get(m.usuario_id);
      porUsuario.delete(m.usuario_id);
      return {
        usuario_id: m.usuario_id, correo: m.correo, nombre: m.nombre ?? m.correo, rol: m.rol,
        personal_id: p ? String(p.id) : null, es_nominas: !!p?.es_nominas,
      };
    });
    for (const p of porUsuario.values()) {
      salida.push({
        usuario_id: String(p.usuario_id), correo: (p.correo as string) ?? '', nombre: String(p.nombre),
        rol: 'personal' as never, personal_id: String(p.id), es_nominas: !!p.es_nominas,
      });
    }
    return ok(c, { gente: salida });
  });

  /** Marcar o desmarcar a alguien. Acepta `usuario_id` o `personal_id`; con
   *  `usuario_id` se crea la fila de `personal` si no la había, que es lo que
   *  hace posible marcar al dueño en una empresa donde nadie llena esa tabla. */
  rutas.post('/:o/nomina/encargados', async (c) => {
    if (!esDueno(c)) return err(c, 'sin_permiso', 403, { motivo: 'solo_el_dueno' });
    const b = await c.req.json<{ personal_id?: unknown; usuario_id?: unknown; valor?: unknown }>().catch(() => ({}) as never);
    const valor = b.valor === true || b.valor === 1;

    let personal_id = typeof b.personal_id === 'string' ? b.personal_id : '';
    if (!personal_id) {
      if (typeof b.usuario_id !== 'string' || !b.usuario_id) {
        return err(c, 'datos_invalidos', 400, { falta: 'personal_id o usuario_id' });
      }
      const m = (await miembrosDe(c.env, c.get('org_id'))).find((x) => x.usuario_id === b.usuario_id);
      if (!m) return err(c, 'no_encontrado', 404, { que: 'miembro', usuario_id: b.usuario_id });
      const { filas } = await stub(c).listar('personal', { usuario_id: b.usuario_id });
      personal_id = filas[0]
        ? String(filas[0].id)
        : String((await stub(c).crear('personal', {
            nombre: m.nombre ?? m.correo, correo: m.correo, usuario_id: m.usuario_id, activo: 1,
          }, { app: 'dash101', usuario_id: c.get('quien').usuario_id })).id);
    }
    const r = await stub(c).marcarNominas({
      personal_id, valor,
      quien_usuario_id: c.get('quien').usuario_id,
      quien_nombre: c.get('sesion').correo,
    });
    if (!r) return err(c, 'no_encontrado', 404, { que: 'persona', id: personal_id });
    return ok(c, { persona: r });
  });

  /* ─────────────── la gente a la que se le paga ─────────────── */

  /** GET /orgs/:o/nomina/gente — a quién se le puede poner en una raya.
   *
   *  Sale de `personal`, que es la misma tabla que llena roster101 con los
   *  expedientes: no se inventa otra lista de gente. Si hubiera dos, un día
   *  no cuadrarían y nadie sabría cuál manda. */
  rutas.get('/:o/nomina/gente', async (c) => {
    if (!(await puedeNomina(c))) return err(c, 'sin_permiso', 403, { motivo: 'la raya la ve quien la lleva' });
    const { filas } = await stub(c).listar('personal', { activo: '1' });
    return ok(c, { gente: filas.map((p) => ({ id: p.id, nombre: p.nombre, puesto: p.puesto ?? '' })) });
  });

  /** GET /orgs/:o/nomina/trabajadores — los EXPEDIENTES de roster101.
   *
   *  Mike, 20-sep: «en la sección de raya de dash debo poder escoger a quién
   *  se le paga de la lista de los trabajadores en roster101, no en la de
   *  dash».
   *
   *  Son dos listas distintas y las dos hacen falta: el expediente es quién
   *  es la persona —lo llena roster101 y lo llena ella misma desde su
   *  celular—, y `personal` es a quién le toca algo en la suite. La raya
   *  pagaba contra la corta, y en una empresa que lleva expedientes la corta
   *  está vacía: parecía que no había a quién pagarle.
   *
   *  Cada renglón dice si esa persona ya tiene su lugar en `personal`
   *  (`personal_id`), para que la pantalla no ofrezca dos veces al mismo. */
  rutas.get('/:o/nomina/trabajadores', async (c) => {
    if (!(await puedeNomina(c))) return err(c, 'sin_permiso', 403, { motivo: 'la raya la ve quien la lleva' });
    return ok(c, { trabajadores: await stub(c).trabajadoresDeRoster() });
  });

  /** POST /orgs/:o/nomina/gente/de-roster {roster_id} — escoger a alguien
   *  del expediente para poder pagarle.
   *
   *  Le abre su renglón en `personal` LIGADO al expediente, o devuelve el
   *  que ya tenía. Ligado y no copiado: sin la liga, escoger dos veces al
   *  mismo abriría dos renglones y la raya le pagaría doble sin que nada se
   *  viera raro. */
  rutas.post('/:o/nomina/gente/de-roster', async (c) => {
    if (!(await puedeNomina(c))) return err(c, 'sin_permiso', 403, { motivo: 'la raya la lleva quien tiene el permiso' });
    const b = await c.req.json<{ roster_id?: string }>().catch(() => ({}) as { roster_id?: string });
    if (!b.roster_id) return err(c, 'datos_invalidos', 400, { falta: 'roster_id' });
    const r = await stub(c).personaDeRoster(b.roster_id, { usuario_id: c.get('quien').usuario_id });
    if ('error' in r) return err(c, r.error, 404, r.detalle);
    return ok(c, { persona: { id: r.persona.id, nombre: r.persona.nombre, puesto: r.persona.puesto ?? '' }, nueva: r.nueva }, r.nueva ? 201 : 200);
  });

  /** POST /orgs/:o/nomina/gente {nombre, puesto?} — dar de alta a alguien
   *  para poder pagarle.
   *
   *  Existe porque `personal` la llena roster101, y una empresa que sólo usa
   *  dash101 tendría la lista vacía: la raya no se podría usar y no habría
   *  dónde arreglarlo. dash101 sigue SIN poder escribir `personal` por el
   *  CRUD —no está en ESCRITORES—; esta puerta pide el permiso de nóminas,
   *  que es más cerrado, y sólo deja poner el nombre y el puesto.
   *
   *  Si la empresa usa roster101, ahí está el expediente completo y esto
   *  casi no se usa; pero el que le paga a su gente sin llevar expedientes
   *  no se queda sin poder pagarles. */
  rutas.post('/:o/nomina/gente', async (c) => {
    if (!(await puedeNomina(c))) return err(c, 'sin_permiso', 403, { motivo: 'la raya la lleva quien tiene el permiso' });
    type Alta = { nombre?: string; puesto?: string };
    const b = await c.req.json<Alta>().catch(() => ({}) as Alta);
    const nombre = (b.nombre ?? '').trim();
    if (!nombre) return err(c, 'datos_invalidos', 400, { falta: 'nombre' });
    const fila = await stub(c).crear(
      'personal',
      { nombre, puesto: (b.puesto ?? '').trim(), activo: 1 },
      { app: 'dash101', usuario_id: c.get('quien').usuario_id },
    );
    return ok(c, { persona: { id: fila.id, nombre: fila.nombre, puesto: fila.puesto ?? '' } }, 201);
  });

  /* ─────────────── los cortes ─────────────── */

  /** GET /orgs/:o/nomina/rayas?negocio_id= — los cortes de un negocio. */
  rutas.get('/:o/nomina/rayas', async (c) => {
    if (!(await puedeNomina(c))) return err(c, 'sin_permiso', 403, { motivo: 'la raya la ve quien la lleva' });
    const negocio_id = c.req.query('negocio_id');
    if (!negocio_id) return err(c, 'datos_invalidos', 400, { falta: 'negocio_id' });
    return ok(c, { rayas: await stub(c).rayas(negocio_id) });
  });

  /** POST /orgs/:o/nomina/rayas — abrir un corte, en borrador. */
  rutas.post('/:o/nomina/rayas', async (c) => {
    if (!(await puedeNomina(c))) return err(c, 'sin_permiso', 403, { motivo: 'la raya la lleva quien tiene el permiso' });
    type Cuerpo = {
      negocio_id?: string; periodo_inicio?: string; periodo_fin?: string; nota?: string;
      pagos?: Array<{ personal_id: string; concepto?: string; sueldo?: number; extras?: number; descuentos?: number; nota?: string }>;
    };
    const b = await c.req.json<Cuerpo>().catch(() => ({}) as Cuerpo);
    if (!b.negocio_id || !b.periodo_inicio || !b.periodo_fin) {
      return err(c, 'datos_invalidos', 400, { falta: 'negocio_id, periodo_inicio y periodo_fin' });
    }
    const r = await stub(c).crearRaya(
      { negocio_id: b.negocio_id, periodo_inicio: b.periodo_inicio, periodo_fin: b.periodo_fin, nota: b.nota, pagos: b.pagos },
      { usuario_id: c.get('quien').usuario_id },
    );
    if (esFalla(r)) return err(c, r.error, codigo(r.error), r.detalle);
    return ok(c, { raya: r.raya, pagos: r.pagos }, 201);
  });

  /** GET /orgs/:o/nomina/rayas/:id — el corte con sus renglones. */
  rutas.get('/:o/nomina/rayas/:id', async (c) => {
    if (!(await puedeNomina(c))) return err(c, 'sin_permiso', 403, { motivo: 'la raya la ve quien la lleva' });
    const r = await stub(c).raya(c.req.param('id'));
    if (!r) return err(c, 'no_encontrado', 404, { que: 'raya', id: c.req.param('id') });
    return ok(c, { raya: r.raya, pagos: r.pagos });
  });

  /** PATCH /orgs/:o/nomina/rayas/:id — corregir el borrador. */
  rutas.patch('/:o/nomina/rayas/:id', async (c) => {
    if (!(await puedeNomina(c))) return err(c, 'sin_permiso', 403, { motivo: 'la raya la lleva quien tiene el permiso' });
    type Cuerpo = {
      periodo_inicio?: string; periodo_fin?: string; nota?: string;
      pagos?: Array<{ personal_id: string; concepto?: string; sueldo?: number; extras?: number; descuentos?: number; nota?: string }>;
    };
    const b = await c.req.json<Cuerpo>().catch(() => ({}) as Cuerpo);
    const r = await stub(c).editarRaya(c.req.param('id'), b);
    if (esFalla(r)) return err(c, r.error, codigo(r.error), r.detalle);
    return ok(c, { raya: r.raya, pagos: r.pagos });
  });

  /** POST /orgs/:o/nomina/rayas/:id/pagar {cuenta_id, fecha?} — un egreso
   *  POR PERSONA, de una sola vez. */
  rutas.post('/:o/nomina/rayas/:id/pagar', async (c) => {
    if (!(await puedeNomina(c))) return err(c, 'sin_permiso', 403, { motivo: 'pagar la raya lo hace quien tiene el permiso' });
    type Pago = { cuenta_id?: string; fecha?: string };
    const b = await c.req.json<Pago>().catch(() => ({}) as Pago);
    if (!b.cuenta_id) return err(c, 'datos_invalidos', 400, { falta: 'cuenta_id' });
    const r = await stub(c).pagarRaya(c.req.param('id'), {
      cuenta_id: b.cuenta_id, fecha: b.fecha, quien_usuario_id: c.get('quien').usuario_id,
    });
    if (esFalla(r)) return err(c, r.error, codigo(r.error), r.detalle);
    return ok(c, { raya: r.raya, pagos: r.pagos });
  });

  /** POST /orgs/:o/nomina/rayas/:id/cancelar — sólo si todavía no se paga. */
  rutas.post('/:o/nomina/rayas/:id/cancelar', async (c) => {
    if (!(await puedeNomina(c))) return err(c, 'sin_permiso', 403, { motivo: 'la raya la lleva quien tiene el permiso' });
    const r = await stub(c).cancelarRaya(c.req.param('id'));
    if (esFalla(r)) return err(c, r.error, codigo(r.error), r.detalle);
    return ok(c, { raya: r.raya, pagos: r.pagos });
  });

  /** POST /orgs/:o/nomina/pagos/:id/recibido {recibido} — firmó, o se
   *  desmarca porque se palomeó por error. */
  rutas.post('/:o/nomina/pagos/:id/recibido', async (c) => {
    if (!(await puedeNomina(c))) return err(c, 'sin_permiso', 403, { motivo: 'la raya la lleva quien tiene el permiso' });
    const b = await c.req.json<{ recibido?: unknown }>().catch(() => ({}) as { recibido?: unknown });
    const r = await stub(c).recibido(c.req.param('id'), b.recibido !== false);
    if (esFalla(r)) return err(c, r.error, codigo(r.error), r.detalle);
    return ok(c, { pago: r.pago });
  });
}
