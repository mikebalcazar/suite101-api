/* /orgs/:o/inversion/* — investor101: rondas de inversión y préstamos a la
 * empresa (contrato 0.82.0).
 *
 * Se monta sobre el enrutador de `/orgs`, después de sus puertas: cuando un
 * handler de aquí corre, `quien`, `app` y `org_id` ya están resueltos.
 *
 * DOS PAPELES, y nada más:
 *
 *   · `admin` — quien dirige la empresa (owner o admin; el dueño de la suite
 *     entra como owner). Abre rondas, aprueba ofertas, marca depósitos, paga.
 *     Desde investor101 o desde dash101, que es donde se registran los pagos
 *     (decisión de Mike con botones).
 *   · `inversionista` — quien presta. Ve SÓLO lo suyo: sus préstamos, su
 *     tabla, sus comprobantes, y las rondas abiertas con su avance total.
 *     Sólo desde investor101.
 *
 * Un socio o alguien de oficina (ni owner ni admin) NO administra: es dinero
 * que la empresa debe, y eso lo lleva quien la dirige. Si además presta —se
 * dio de alta en el directorio con su correo— entra como inversionista.
 *
 * Por qué no va por el CRUD genérico: el CRUD entrega la tabla entera a quien
 * puede leerla, y aquí cada quien ve un renglón distinto.
 */

import type { Hono } from 'hono';
import { err, ok, type Ctx, type Vars } from '../http';
import type { Env } from '../entorno';
import type { ApiOrgDB } from '../org-db';
import { accesoInversion, crearUsuario, miembrosDe, org, ponerAccesoInversion, quitarAccesoInversion } from '../maestro';
import { empresaDe } from '../empresa';
import { hoyMx } from '../costos';
import { enviarCorreo } from '../auth/correo';
import { revisarCondiciones, tablaDePagos, totalesDe } from '../inversion';
import {
  correoDepositoRecibido, correoOfertaRecibida, correoOfertaResuelta, correoPagoHecho, correoRondaAbierta, correoTablaCambiada,
  mensajeWhatsApp, type DatosRonda, type Mensaje,
} from '../inversion-correo';
import { ulid } from '../lib';
import type { CondicionesPrestamo } from '../../schema/tipos';

type App = Hono<{ Bindings: Env; Variables: Vars }>;
type Fila = Record<string, any>;
type Papel = { tipo: 'admin' } | { tipo: 'inversionista'; id: string };

const stub = (c: Ctx): ApiOrgDB => c.env.ORG.get(c.env.ORG.idFromName(c.get('org_id'))) as unknown as ApiOrgDB;
const motor = <T = any>(c: Ctx, op: string, ...args: unknown[]): Promise<T> => stub(c).inversion(op, args) as Promise<T>;
const esFalla = (r: unknown): r is { error: string; detalle?: unknown } =>
  !!r && typeof r === 'object' && typeof (r as Fila).error === 'string';

/** Qué código HTTP le toca a cada falla del motor. Lo que no está aquí es 400. */
const ESTADO: Record<string, number> = {
  no_encontrado: 404, inversionista_desconocido: 404, cuenta_desconocida: 404, pago_desconocido: 404,
  correo_repetido: 409, en_uso: 409, ronda_cerrada: 409, ronda_no_es_borrador: 409, ronda_no_esta_abierta: 409,
  ronda_no_esta_cerrada: 409, ronda_vencida: 409, oferta_ya_resuelta: 409, prestamo_ya_arranco: 409,
  prestamo_cerrado: 409, prestamo_no_activo: 409, pago_ya_hecho: 409, pago_no_esta_hecho: 409,
};
const falla = (c: Ctx, r: { error: string; detalle?: unknown }) => err(c, r.error, ESTADO[r.error] ?? 400, r.detalle);

const APPS_QUE_ADMINISTRAN: ReadonlySet<string> = new Set(['investor101', 'dash101']);
const CLASES_DE_ARCHIVO = ['comprobante_deposito', 'contrato_firmado', 'comprobante_pago', 'otro'] as const;
const TIPOS_DE_ARCHIVO = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/;
const TOPE_DE_ARCHIVO = 10 * 1024 * 1024;

async function papelDe(c: Ctx): Promise<Papel | null> {
  const q = c.get('quien');
  const app = c.get('app');
  if (q.clase === 'miembro' && (q.rol === 'owner' || q.rol === 'admin')) return APPS_QUE_ADMINISTRAN.has(app) ? { tipo: 'admin' } : null;
  if (app !== 'investor101') return null;
  if (q.clase === 'inversionista') return { tipo: 'inversionista', id: q.ref_id! };
  if (q.clase === 'miembro') {
    const a = await accesoInversion(c.env, c.get('org_id'), q.usuario_id);
    if (a) return { tipo: 'inversionista', id: a.ref_id };
  }
  return null;
}

const actor = (c: Ctx) => ({ usuario_id: c.get('quien').usuario_id, nombre: c.get('sesion').correo });
const cuerpo = (c: Ctx) => c.req.json<Fila>().catch(() => ({}) as Fila);
const urlApp = (c: Ctx, ruta = ''): string => {
  const base = (c.env.URL_INVESTOR || '').replace(/\/+$/, '');
  return base ? `${base}/${ruta ? `#/${ruta}` : ''}` : '';
};
const nombreEmpresa = async (c: Ctx): Promise<string> => String((await empresaDe(c)).nombre ?? c.get('org_id'));

/** El correo es un aviso: si no sale, lo que se hizo sigue hecho. La
 *  respuesta dice si salió y por qué no, que es lo que miden las pruebas
 *  (fuera de producción no sale nunca, a propósito: CORREO.md). */
async function avisar(c: Ctx, para: unknown, msg: Mensaje): Promise<{ enviado: boolean; motivo?: string; para?: string }> {
  const a = String(para ?? '').trim();
  if (!a) return { enviado: false, motivo: 'sin_correo' };
  try {
    return { ...(await enviarCorreo(c.env, { para: a, ...msg, conBaja: true })), para: a };
  } catch (e) {
    console.error('correo investor101', e);
    return { enviado: false, motivo: 'correo_no_salio', para: a };
  }
}

/** Liga la fila del directorio con una cuenta de la suite: sin esto, el
 *  correo que se capturó no abre nada. Son dos bases distintas —el D1 y el
 *  objeto de la empresa—, y por eso lo hace la ruta y no el motor. */
async function darAcceso(c: Ctx, inv: Fila): Promise<void> {
  const org_id = c.get('org_id');
  await quitarAccesoInversion(c.env, org_id, String(inv.id));
  if (!inv.correo || !inv.activo) {
    if (inv.usuario_id) await motor(c, 'ligarUsuario', inv.id, null);
    return;
  }
  const u = await crearUsuario(c.env, String(inv.correo), String(inv.nombre));
  await ponerAccesoInversion(c.env, { usuario_id: u.id, org_id, ref_id: String(inv.id) });
  if (inv.usuario_id !== u.id) await motor(c, 'ligarUsuario', inv.id, u.id);
}

function datosDeRonda(empresa: string, ronda: Fila, persona: string, url: string): DatosRonda {
  return {
    empresa, nombre_persona: persona, ronda: String(ronda.nombre), descripcion: (ronda.descripcion as string) ?? null,
    monto_meta: Number(ronda.monto_meta), monto_minimo: ronda.monto_minimo ?? null,
    tipo_tasa: ronda.tipo_tasa, tasa_pb: Number(ronda.tasa_pb), esquema: ronda.esquema,
    frecuencia: ronda.frecuencia ?? null, num_pagos: ronda.num_pagos ?? null,
    fecha_inicio: String(ronda.fecha_inicio), fecha_vencimiento: ronda.fecha_vencimiento ?? null, fecha_limite: ronda.fecha_limite ?? null,
    ejemplo_total: ronda.ejemplo?.totales?.total ?? null, url,
  };
}

/** wa.me pide el número con lada de país y sin signos. Diez dígitos es un
 *  número de México sin lada: se le pone el 52. */
function ligaWhatsApp(telefono: unknown, mensaje: string): string | null {
  let n = String(telefono ?? '').replace(/\D/g, '');
  if (n.length < 10) return null;
  if (n.length === 10) n = `52${n}`;
  return `https://wa.me/${n}?text=${encodeURIComponent(mensaje)}`;
}

export function montarInversion(rutas: App): void {
  /** Envuelve un handler: resuelve el papel o contesta 403. */
  const con = (quienes: 'admin' | 'ambos', h: (c: Ctx, papel: Papel) => Promise<Response>) => async (c: Ctx) => {
    /* LA LICENCIA ES DE investor101, venga de la app que venga. La puerta de
     * /orgs revisa la app que dice `X-App`, y dash101 también entra aquí: sin
     * esto, una empresa con dash101 y SIN investor101 contratada llevaría
     * préstamos completos desde dash101. Lo encontró la prueba de dash101 el
     * 8-oct, el mismo día en que nació. */
    const empresa = await org(c.env, c.get('org_id'));
    if (empresa?.apps?.investor !== true) return err(c, 'app_inactiva', 403, { app: 'investor101', motivo: 'la empresa no tiene investor101' });
    const p = await papelDe(c);
    if (!p) return err(c, 'sin_permiso', 403, { motivo: 'investor101 lo abre quien dirige la empresa o quien le presta' });
    if (quienes === 'admin' && p.tipo !== 'admin') return err(c, 'sin_permiso', 403, { motivo: 'solo_quien_dirige' });
    return h(c, p);
  };

  /* ─────────────── la portada ─────────────── */

  /** Lo primero que pide la pantalla: quién soy aquí y qué veo. */
  rutas.get('/:o/inversion', con('ambos', async (c, p) => {
    const empresa = { id: c.get('org_id'), nombre: await nombreEmpresa(c) };
    const hoy = hoyMx();
    if (p.tipo === 'admin') {
      return ok(c, { papel: 'admin', empresa, hoy, resumen: await motor(c, 'resumenAdmin', hoy), ajustes: await motor(c, 'ajustes') });
    }
    const estado = await motor<Fila | null>(c, 'estadoDeCuenta', p.id, hoy);
    if (!estado) return err(c, 'no_encontrado', 404, { motivo: 'tu cuenta de inversionista ya no existe en esta empresa' });
    return ok(c, { papel: 'inversionista', empresa, hoy, ...estado });
  }));

  /** La tabla que darían unas condiciones, sin guardar nada. Para que la
   *  pantalla enseñe la cuenta mientras se teclea, y sea LA MISMA cuenta. */
  rutas.post('/:o/inversion/simular', con('ambos', async (c) => {
    const b = await cuerpo(c);
    const errores = revisarCondiciones(b);
    if (Object.keys(errores).length) return err(c, 'datos_invalidos', 400, { errores });
    const tabla = tablaDePagos(b as CondicionesPrestamo);
    return ok(c, { tabla, totales: totalesDe(tabla) });
  }));

  rutas.get('/:o/inversion/ajustes', con('admin', async (c) => ok(c, await motor(c, 'ajustes'))));
  rutas.put('/:o/inversion/ajustes', con('admin', async (c) => ok(c, await motor(c, 'guardarAjustes', await cuerpo(c)))));

  /* ─────────────── el directorio ─────────────── */

  rutas.get('/:o/inversion/inversionistas', con('admin', async (c) => ok(c, { filas: await motor(c, 'inversionistas') })));

  rutas.post('/:o/inversion/inversionistas', con('admin', async (c) => {
    const r = await motor(c, 'crearInversionista', await cuerpo(c), actor(c));
    if (esFalla(r)) return falla(c, r);
    await darAcceso(c, r);
    return ok(c, await motor(c, 'inversionista', r.id), 201);
  }));

  rutas.get('/:o/inversion/inversionistas/:id', con('admin', async (c) => {
    const id = c.req.param('id')!;
    const estado = await motor<Fila | null>(c, 'estadoDeCuenta', id, hoyMx());
    if (!estado) return err(c, 'no_encontrado', 404);
    const ficha = await motor<Fila>(c, 'inversionista', id);
    return ok(c, { ...estado, inversionista: ficha });
  }));

  rutas.patch('/:o/inversion/inversionistas/:id', con('admin', async (c) => {
    const r = await motor(c, 'actualizarInversionista', c.req.param('id')!, await cuerpo(c));
    if (esFalla(r)) return falla(c, r);
    await darAcceso(c, r);
    return ok(c, await motor(c, 'inversionista', r.id));
  }));

  rutas.delete('/:o/inversion/inversionistas/:id', con('admin', async (c) => {
    const id = c.req.param('id')!;
    const r = await motor(c, 'borrarInversionista', id);
    if (esFalla(r)) return falla(c, r);
    await quitarAccesoInversion(c.env, c.get('org_id'), id);
    return ok(c, { borrado: true, id });
  }));

  /* ─────────────── rondas ─────────────── */

  rutas.get('/:o/inversion/rondas', con('ambos', async (c, p) =>
    ok(c, { filas: p.tipo === 'admin' ? await motor(c, 'rondas') : await motor(c, 'rondasPara', p.id) })));

  /** Nace en borrador. La crea investor101, o dash101 desde un hueco de su
   *  flujo proyectado: «generar una ronda para cubrir ese flujo». */
  rutas.post('/:o/inversion/rondas', con('admin', async (c) => {
    const b = await cuerpo(c);
    if (b.origen && typeof b.origen === 'object') b.origen = { ...b.origen, app: c.get('app') };
    const r = await motor(c, 'crearRonda', b, actor(c), hoyMx());
    if (esFalla(r)) return falla(c, r);
    return ok(c, { ...r, url: urlApp(c, `ronda/${r.id}`) }, 201);
  }));

  rutas.get('/:o/inversion/rondas/:id', con('ambos', async (c, p) => {
    const id = c.req.param('id')!;
    const r = p.tipo === 'admin' ? await motor(c, 'verRonda', id) : await motor(c, 'rondaPara', id, p.id);
    if (!r) return err(c, 'no_encontrado', 404);
    return ok(c, r);
  }));

  rutas.patch('/:o/inversion/rondas/:id', con('admin', async (c) => {
    const r = await motor(c, 'actualizarRonda', c.req.param('id')!, await cuerpo(c));
    return esFalla(r) ? falla(c, r) : ok(c, r);
  }));

  rutas.delete('/:o/inversion/rondas/:id', con('admin', async (c) => {
    const r = await motor(c, 'borrarRonda', c.req.param('id')!);
    return esFalla(r) ? falla(c, r) : ok(c, r);
  }));

  rutas.post('/:o/inversion/rondas/:id/abrir', con('admin', async (c) => {
    const r = await motor(c, 'abrirRonda', c.req.param('id')!, actor(c));
    return esFalla(r) ? falla(c, r) : ok(c, r);
  }));
  rutas.post('/:o/inversion/rondas/:id/cerrar', con('admin', async (c) => {
    const r = await motor(c, 'terminarRonda', c.req.param('id')!, 'cerrada', actor(c));
    return esFalla(r) ? falla(c, r) : ok(c, r);
  }));
  rutas.post('/:o/inversion/rondas/:id/cancelar', con('admin', async (c) => {
    const r = await motor(c, 'terminarRonda', c.req.param('id')!, 'cancelada', actor(c));
    return esFalla(r) ? falla(c, r) : ok(c, r);
  }));
  rutas.post('/:o/inversion/rondas/:id/reabrir', con('admin', async (c) => {
    const r = await motor(c, 'reabrirRonda', c.req.param('id')!, actor(c));
    return esFalla(r) ? falla(c, r) : ok(c, r);
  }));

  /** A quién se le avisaría y con qué palabras, SIN mandar nada: es lo que
   *  la pantalla enseña antes del botón, y de donde salen las ligas de
   *  WhatsApp (decisión de Mike con botones: «correo + WhatsApp manual»). */
  const listaDeAviso = async (c: Ctx, ronda: Fila): Promise<Array<Fila & { datos: DatosRonda }>> => {
    const empresa = await nombreEmpresa(c);
    const url = urlApp(c, `ronda/${ronda.id}`);
    const gente = (await motor<Fila[]>(c, 'inversionistas')).filter((i) => i.activo);
    const yaOfrecio = new Set((ronda.ofertas as Fila[] ?? []).map((o) => String(o.inversionista_id)));
    return gente.map((i) => {
      const datos = datosDeRonda(empresa, ronda, String(i.nombre).split(/\s+/)[0], url);
      const mensaje = mensajeWhatsApp(datos);
      return {
        id: i.id, nombre: i.nombre, correo: i.correo, telefono: i.telefono, recibe_avisos: i.recibe_avisos,
        es_prospecto: i.es_prospecto, ya_ofrecio: yaOfrecio.has(String(i.id)),
        whatsapp: ligaWhatsApp(i.telefono, mensaje), mensaje, datos,
      };
    });
  };
  const sinDatos = ({ datos: _d, ...f }: Fila) => f;

  rutas.get('/:o/inversion/rondas/:id/aviso', con('admin', async (c) => {
    const ronda = await motor<Fila | null>(c, 'verRonda', c.req.param('id')!);
    if (!ronda) return err(c, 'no_encontrado', 404);
    return ok(c, { filas: (await listaDeAviso(c, ronda)).map(sinDatos) });
  }));

  /** Mandar el correo de la ronda. `a` es la lista de ids; sin ella, todos
   *  los que reciben avisos. Sólo de una ronda abierta: avisar de un
   *  borrador es invitar a algo que no existe. */
  rutas.post('/:o/inversion/rondas/:id/avisar', con('admin', async (c) => {
    const ronda = await motor<Fila | null>(c, 'verRonda', c.req.param('id')!);
    if (!ronda) return err(c, 'no_encontrado', 404);
    if (ronda.estado !== 'abierta') return err(c, 'ronda_no_esta_abierta', 409, { estado: ronda.estado });
    const b = await cuerpo(c);
    const escogidos = Array.isArray(b.a) ? new Set(b.a.map(String)) : null;
    const lista = (await listaDeAviso(c, ronda)).filter((f) => (escogidos ? escogidos.has(String(f.id)) : f.recibe_avisos));
    const filas: Fila[] = [];
    for (const f of lista) filas.push({ ...sinDatos(f), correo_enviado: await avisar(c, f.correo, correoRondaAbierta(f.datos)) });
    return ok(c, { filas, enviados: filas.filter((f) => f.correo_enviado.enviado).length });
  }));

  /* ─────────────── ofertas ─────────────── */

  /** «Le entro con tanto». Quien presta ofrece por sí mismo; quien dirige
   *  puede capturar la oferta de alguien que se lo dijo por teléfono. */
  rutas.post('/:o/inversion/rondas/:id/ofertas', con('ambos', async (c, p) => {
    const b = await cuerpo(c);
    const inversionista_id = p.tipo === 'admin' ? String(b.inversionista_id ?? '') : p.id;
    if (!inversionista_id) return err(c, 'datos_invalidos', 400, { errores: { inversionista_id: 'Escoge de quién es la oferta.' } });
    const r = await motor(c, 'ofrecer', { ronda_id: c.req.param('id')!, inversionista_id, monto: b.monto, nota: b.nota }, actor(c), hoyMx());
    if (esFalla(r)) return falla(c, r);
    // A quien dirige le llega el aviso sólo cuando ofrece el inversionista:
    // lo que capturó él mismo ya lo sabe.
    let correos: unknown[] = [];
    if (p.tipo === 'inversionista') {
      const inv = await motor<Fila>(c, 'inversionista', inversionista_id);
      const ronda = await motor<Fila>(c, 'verRonda', c.req.param('id')!);
      const msg = correoOfertaRecibida({ empresa: await nombreEmpresa(c), quien: String(inv?.nombre ?? ''), ronda: String(ronda?.nombre ?? ''), monto: Number(r.monto), url: urlApp(c, `ronda/${r.ronda_id}`) });
      const dirigen = (await miembrosDe(c.env, c.get('org_id'))).filter((m) => m.rol === 'owner' || m.rol === 'admin');
      correos = await Promise.all(dirigen.map((m) => avisar(c, m.correo, msg)));
    }
    return ok(c, { ...r, correos }, 201);
  }));

  /** La oferta es del inversionista mientras está pendiente: él la retira.
   *  Quien dirige no la retira: la rechaza, con motivo. */
  rutas.post('/:o/inversion/ofertas/:id/retirar', con('ambos', async (c, p) => {
    const o = await motor<Fila | null>(c, 'oferta', c.req.param('id')!);
    if (!o || (p.tipo === 'inversionista' && o.inversionista_id !== p.id)) return err(c, 'no_encontrado', 404);
    const r = await motor(c, 'retirarOferta', o.id, actor(c));
    return esFalla(r) ? falla(c, r) : ok(c, r);
  }));

  rutas.post('/:o/inversion/ofertas/:id/aprobar', con('admin', async (c) => {
    const b = await cuerpo(c);
    const r = await motor(c, 'aprobarOferta', c.req.param('id')!, { monto_aprobado: b.monto_aprobado, condiciones: b.condiciones }, actor(c), hoyMx());
    if (esFalla(r)) return falla(c, r);
    const inv = r.prestamo.inversionista as Fila;
    const correo = await avisar(c, inv.correo, correoOfertaResuelta({
      empresa: await nombreEmpresa(c), nombre_persona: String(inv.nombre).split(/\s+/)[0], ronda: String(r.prestamo.ronda?.nombre ?? ''),
      aprobada: true, ofrecido: Number(r.oferta.monto), aprobado: Number(r.oferta.monto_aprobado), motivo: null,
      instrucciones: r.prestamo.instrucciones ?? null, folio: String(r.prestamo.folio), url: urlApp(c, `prestamo/${r.prestamo.id}`),
    }));
    return ok(c, { ...r, correo });
  }));

  rutas.post('/:o/inversion/ofertas/:id/rechazar', con('admin', async (c) => {
    const b = await cuerpo(c);
    const r = await motor(c, 'rechazarOferta', c.req.param('id')!, b.motivo, actor(c));
    if (esFalla(r)) return falla(c, r);
    const inv = await motor<Fila>(c, 'inversionista', r.inversionista_id);
    const ronda = await motor<Fila>(c, 'verRonda', r.ronda_id);
    const correo = await avisar(c, inv?.correo, correoOfertaResuelta({
      empresa: await nombreEmpresa(c), nombre_persona: String(inv?.nombre ?? '').split(/\s+/)[0], ronda: String(ronda?.nombre ?? ''),
      aprobada: false, ofrecido: Number(r.monto), aprobado: null, motivo: r.motivo ?? null, instrucciones: null, folio: null, url: '',
    }));
    return ok(c, { oferta: r, correo });
  }));

  /* ─────────────── préstamos ─────────────── */

  rutas.get('/:o/inversion/prestamos', con('ambos', async (c, p) => {
    const q = c.req.query();
    const filtro: Fila = { estado: q.estado || undefined, ronda_id: q.ronda_id || undefined };
    filtro.inversionista_id = p.tipo === 'admin' ? (q.inversionista_id || undefined) : p.id;
    const filas = await motor<Fila[]>(c, 'prestamos', filtro, hoyMx());
    return ok(c, { filas: p.tipo === 'admin' ? filas : filas.map(({ notas: _n, creado_por: _c, recibido_por: _r, cuenta_id: _k, movimiento_id: _m, ...f }) => f) });
  }));

  /** Un préstamo directo, sin ronda. */
  rutas.post('/:o/inversion/prestamos', con('admin', async (c) => {
    const r = await motor(c, 'crearPrestamo', await cuerpo(c), actor(c));
    return esFalla(r) ? falla(c, r) : ok(c, r, 201);
  }));

  /** El préstamo es de quien lo dirige o de quien lo prestó. A cualquier
   *  otro se le contesta 404, no 403: que exista es parte de lo que no ve. */
  const prestamoDe = async (c: Ctx, p: Papel, id: string): Promise<Fila | null> => {
    const base = await motor<Fila | null>(c, 'prestamo', id);
    if (!base || (p.tipo === 'inversionista' && base.inversionista_id !== p.id)) return null;
    return base;
  };

  rutas.get('/:o/inversion/prestamos/:id', con('ambos', async (c, p) => {
    const id = c.req.param('id')!;
    if (!(await prestamoDe(c, p, id))) return err(c, 'no_encontrado', 404);
    const empresa = await empresaDe(c);
    const r = await motor<Fila>(c, 'verPrestamo', id, { para: p.tipo === 'inversionista' ? 'inversionista' : undefined, hoy: hoyMx() });
    // Lo que el pagaré necesita decir de quien debe.
    return ok(c, { ...r, empresa: { nombre: empresa.nombre ?? null, rfc: empresa.rfc ?? null, direccion: empresa.direccion ?? null }, ajustes: await motor(c, 'ajustes') });
  }));

  rutas.patch('/:o/inversion/prestamos/:id', con('admin', async (c) => {
    const r = await motor(c, 'actualizarPrestamo', c.req.param('id')!, await cuerpo(c), actor(c));
    return esFalla(r) ? falla(c, r) : ok(c, r);
  }));

  rutas.post('/:o/inversion/prestamos/:id/recibido', con('admin', async (c) => {
    const b = await cuerpo(c);
    const r = await motor(c, 'marcarRecibido', c.req.param('id')!, { cuenta_id: b.cuenta_id, fecha: b.fecha, nota: b.nota }, actor(c), hoyMx());
    if (esFalla(r)) return falla(c, r);
    const pr = r.prestamo as Fila;
    const correo = await avisar(c, pr.inversionista.correo, correoDepositoRecibido({
      empresa: await nombreEmpresa(c), nombre_persona: String(pr.inversionista.nombre).split(/\s+/)[0], folio: String(pr.folio),
      monto: Number(pr.monto), fecha: String(pr.fecha_inicio), proximo_fecha: pr.resumen.proximo?.fecha ?? null,
      proximo_total: pr.resumen.proximo?.total ?? null, url: urlApp(c, `prestamo/${pr.id}`),
    }));
    return ok(c, { ...r, correo });
  }));

  rutas.post('/:o/inversion/prestamos/:id/cancelar', con('admin', async (c) => {
    const b = await cuerpo(c);
    const r = await motor(c, 'cancelarPrestamo', c.req.param('id')!, b.motivo, actor(c));
    return esFalla(r) ? falla(c, r) : ok(c, r);
  }));

  rutas.put('/:o/inversion/prestamos/:id/tabla', con('admin', async (c) => {
    const b = await cuerpo(c);
    const r = await motor(c, 'editarTabla', c.req.param('id')!, { pagos: b.pagos, motivo: b.motivo }, actor(c));
    if (esFalla(r)) return falla(c, r);
    const correo = await avisar(c, r.inversionista.correo, correoTablaCambiada({
      empresa: await nombreEmpresa(c), nombre_persona: String(r.inversionista.nombre).split(/\s+/)[0], folio: String(r.folio),
      motivo: String(b.motivo ?? '').trim(), url: urlApp(c, `prestamo/${r.id}`),
    }));
    return ok(c, { ...r, correo });
  }));

  /* ─────────────── pagos ─────────────── */

  /** Lo pendiente de pagar, por fecha: el buzón de dash101. */
  rutas.get('/:o/inversion/pagos', con('admin', async (c) => ok(c, { filas: await motor(c, 'pagosPendientes', hoyMx()) })));

  /** Lo que dash101 pone en su flujo proyectado. */
  rutas.get('/:o/inversion/flujo', con('admin', async (c) => ok(c, await motor(c, 'flujo', hoyMx()))));

  rutas.post('/:o/inversion/pagos/:id/pagar', con('admin', async (c) => {
    const b = await cuerpo(c);
    const r = await motor(c, 'pagar', c.req.param('id')!, { cuenta_id: b.cuenta_id, fecha: b.fecha, nota: b.nota }, actor(c), hoyMx());
    if (esFalla(r)) return falla(c, r);
    const pr = r.prestamo as Fila;
    const correo = await avisar(c, pr.inversionista.correo, correoPagoHecho({
      empresa: await nombreEmpresa(c), nombre_persona: String(pr.inversionista.nombre).split(/\s+/)[0], folio: String(pr.folio),
      numero: Number(r.pago.numero), de: Number(pr.resumen.pagos_total), capital: Number(r.pago.capital), interes: Number(r.pago.interes),
      fecha: String(r.pago.pagado_fecha), liquidado: r.liquidado, saldo: Number(pr.resumen.capital_pendiente), url: urlApp(c, `prestamo/${pr.id}`),
    }));
    return ok(c, { ...r, correo });
  }));

  rutas.post('/:o/inversion/pagos/:id/deshacer', con('admin', async (c) => {
    const b = await cuerpo(c);
    const r = await motor(c, 'deshacerPago', c.req.param('id')!, b.motivo, actor(c));
    return esFalla(r) ? falla(c, r) : ok(c, r);
  }));

  /* ─────────────── archivos ───────────────
   * El comprobante del depósito lo sube quien presta; el contrato firmado,
   * cualquiera de los dos; el comprobante de un pago, quien paga. Se sirven
   * por aquí —no por /archivos— porque el permiso es por préstamo. */

  rutas.post('/:o/inversion/archivos', con('ambos', async (c, p) => {
    const forma = await c.req.formData().catch(() => null);
    const archivo = forma?.get('archivo');
    const prestamo_id = String(forma?.get('prestamo_id') ?? '');
    const pago_id = String(forma?.get('pago_id') ?? '') || null;
    const clase = String(forma?.get('clase') ?? '');
    if (!(archivo instanceof File) || !prestamo_id) return err(c, 'datos_invalidos', 400, { falta: 'archivo, prestamo_id, clase' });
    if (!(CLASES_DE_ARCHIVO as readonly string[]).includes(clase)) return err(c, 'datos_invalidos', 400, { clase: `una de: ${CLASES_DE_ARCHIVO.join(', ')}` });
    if (p.tipo === 'inversionista' && clase !== 'comprobante_deposito' && clase !== 'contrato_firmado') {
      return err(c, 'sin_permiso', 403, { motivo: 'quien presta sube su comprobante de depósito y el contrato firmado' });
    }
    if (clase === 'comprobante_pago' && !pago_id) return err(c, 'datos_invalidos', 400, { falta: 'pago_id' });
    if (!TIPOS_DE_ARCHIVO.test(archivo.type)) return err(c, 'archivo_no_aceptado', 400, { tipo: archivo.type, acepta: 'PDF, JPG, PNG, WEBP o HEIC' });
    if (archivo.size > TOPE_DE_ARCHIVO) return err(c, 'archivo_muy_grande', 400, { bytes: archivo.size, tope: TOPE_DE_ARCHIVO });
    if (!(await prestamoDe(c, p, prestamo_id))) return err(c, 'no_encontrado', 404);

    const id = ulid();
    const nombre = archivo.name.replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, '_').slice(-120) || 'archivo';
    const r2_key = `orgs/${c.get('org_id')}/inversion/${prestamo_id}/${id}-${nombre}`;
    await c.env.ARCHIVOS.put(r2_key, await archivo.arrayBuffer(), { httpMetadata: { contentType: archivo.type } });
    const r = await motor(c, 'registrarArchivo', { id, prestamo_id, pago_id, clase, r2_key, nombre, mime: archivo.type, bytes: archivo.size }, actor(c));
    if (esFalla(r)) {
      await c.env.ARCHIVOS.delete(r2_key).catch(() => {});
      return falla(c, r);
    }
    const { r2_key: _k, ...fila } = r as Fila;
    return ok(c, fila, 201);
  }));

  rutas.get('/:o/inversion/archivos/:id', con('ambos', async (c, p) => {
    const f = await motor<Fila | null>(c, 'archivo', c.req.param('id')!);
    if (!f || (p.tipo === 'inversionista' && f.inversionista_id !== p.id)) return err(c, 'no_encontrado', 404);
    const obj = await c.env.ARCHIVOS.get(String(f.r2_key));
    if (!obj) return err(c, 'no_encontrado', 404, { r2: 'la llave no existe en el bucket' });
    return new Response(obj.body, {
      headers: {
        'Content-Type': String(f.mime || 'application/octet-stream'),
        // El nombre con acentos va en `filename*`; el de siempre, en ASCII: una
        // cabecera con «ó» en crudo truena en el navegador.
        'Content-Disposition': `inline; filename="${String(f.nombre).normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(String(f.nombre))}`,
        'Cache-Control': 'private, max-age=600',
      },
    });
  }));

  /** Quitar un papel que se subió por error. Quien dirige, cualquiera; quien
   *  presta, sólo lo que subió él. Primero el objeto y luego la fila, como
   *  en /archivos. */
  rutas.delete('/:o/inversion/archivos/:id', con('ambos', async (c, p) => {
    const f = await motor<Fila | null>(c, 'archivo', c.req.param('id')!);
    if (!f || (p.tipo === 'inversionista' && f.inversionista_id !== p.id)) return err(c, 'no_encontrado', 404);
    if (p.tipo === 'inversionista' && f.subido_por !== c.get('quien').usuario_id) return err(c, 'sin_permiso', 403, { motivo: 'sólo quitas lo que subiste tú' });
    await c.env.ARCHIVOS.delete(String(f.r2_key));
    await motor(c, 'borrarArchivo', f.id);
    return ok(c, { borrado: true, id: f.id });
  }));
}
