/* Dueño por campo — §7 del documento de arquitectura.
 *
 * Una entidad, muchos lectores, UN escritor por campo. Gregorio existe una sola
 * vez en `personal`: su `puesto` lo escribe roster101, sus `etapas_permitidas`
 * las escribe quell101, y nadie más.
 *
 * Esto vive en código, no en reglas de base de datos, y la razón está medida:
 * en conta-master las reglas de Firestore con acceso dinámico a mapas fallaban
 * en silencio dentro de un try/catch y nadie lo veía. Aquí, si un permiso
 * falla, grita: 403 con la lista de campos permitidos.
 */

import { APPS, type App, type Tabla } from '../schema/tipos';

type Campos = readonly string[] | '*';

export const ESCRITORES: Partial<Record<Tabla, Partial<Record<App, Campos>>>> = {
  items: {
    cotizador101: ['nombre', 'descripcion', 'tipo', 'monto', 'moneda', 'estado', 'proyecto_id', 'cliente_id', 'negocio_id', 'origen'],
    dash101: ['nombre', 'descripcion', 'tipo', 'monto', 'moneda', 'estado', 'proyecto_id', 'cliente_id', 'negocio_id', 'fecha_entrega'],
    quell101: ['etapa', 'etapa_at', 'etapa_por', 'clave', 'asignados'], // etapa solo vía /etapa
    roster101: ['asignados'],
    nest101: ['refs'],
  },
  personal: {
    roster101: ['nombre', 'nombre_norm', 'correo', 'puesto', 'activo', 'expediente_ref'],
    quell101: ['etapas_permitidas', 've_dinero', 'estacion_default'],
  },
  clientes: {
    cotizador101: ['nombre', 'nombre_norm', 'correo', 'telefono', 'negocio_id'],
    dash101: ['nombre', 'nombre_norm', 'correo', 'telefono', 'rfc', 'notas', 'portal_activo', 'negocio_id'],
  },
  proyectos: {
    dash101: ['nombre', 'descripcion', 'estado', 'fecha_inicio', 'fecha_fin_estimada', 'fecha_cierre', 'cliente_id', 'negocio_id'],
    cotizador101: ['nombre', 'cliente_id', 'negocio_id'], // solo al crear desde /vender
  },
  // Las partidas son de dash101 y de nadie más. `monto_pagado` y `estado` no
  // están en su lista: son cachés (abajo).
  partidas: { dash101: ['proyecto_id', 'item_id', 'proveedor_id', 'proveedor_nombre', 'concepto', 'monto_acordado'] },
  movimientos: { dash101: '*' },
  cuentas: { dash101: '*' },
  negocios: { dash101: '*', suite101: '*' },
  opex: { dash101: '*' },
  cotizaciones: { cotizador101: '*' },
  /* Los ajustes los escribe cualquier app, pero SÓLO los suyos, y eso no lo
   * cuida esta lista: lo cuida el `id`, que la API arma con `X-App`
   * (migrations/org/0005_ajustes.sql). Aquí lo que se acota es qué campos
   * viajan: `clave` y `valor`, nada más. `app` no está, aunque sea una columna
   * de la tabla: si una app pudiera mandarlo, podría firmar un ajuste con el
   * nombre de otra. */
  ajustes: Object.fromEntries(APPS.map((a) => [a, ['clave', 'valor'] as const])),
  proveedores: { dash101: '*', cotizador101: ['nombre', 'nombre_norm', 'correo', 'telefono'] },
  estaciones: { quell101: '*' },
  // Las escribe la ruta POST /orgs/:o/conciliaciones, no el CRUD genérico:
  // aquí está para que quede dicho de quién son, y para el 403 con la lista.
  conciliaciones: { dash101: ['negocio_id', 'corte_at', 'hecha_por'] },
  conciliacion_cuentas: { dash101: ['conciliacion_id', 'cuenta_id', 'saldo_registrado', 'saldo_real', 'diferencia', 'movimiento_id'] },
};

/* Cachés: no los escribe NINGUNA app. Los recalcula la API después de cada
 * mutación. Si una app manda uno, se rechaza aunque su lista lo trajera. */
export const CACHES: Partial<Record<Tabla, readonly string[]>> = {
  proyectos: ['precio_venta', 'cobrado', 'pagado_prov', 'compromiso', 'avance'],
  partidas: ['monto_pagado', 'estado'],
  items: ['etapa', 'etapa_at', 'etapa_por'],
};

/* Campos que pone la API sola y que nadie manda de fuera. */
export const DE_LA_API: readonly string[] = ['id', 'creado_at', 'actualizado_at', 'creado_por', 'creado_en_app'];

/* Append-only: se escriben por su propia ruta, no por PATCH ni DELETE.
 * `avances` por /etapa; la conciliación por POST /conciliaciones. Una
 * conciliación pasada nunca se edita: si se recalculara, la estadística de
 * cuánto dinero se escapa mentiría. */
export const APPEND_ONLY: readonly Tabla[] = ['avances', 'conciliaciones', 'conciliacion_cuentas'];

/** Por qué ruta se escribe cada tabla append-only, para decirlo en el 403. */
export const POR_SU_RUTA: Partial<Record<Tabla, string>> = {
  avances: 'POST /items/:id/etapa',
  conciliaciones: 'POST /conciliaciones',
  conciliacion_cuentas: 'POST /conciliaciones',
};

export type Veredicto =
  | { ok: true }
  | { ok: false; error: 'sin_permiso' | 'campo_no_permitido' | 'campo_solo_por_etapa'; detalle: Record<string, unknown> };

export function camposDe(tabla: Tabla, app: App): Campos | undefined {
  return ESCRITORES[tabla]?.[app];
}

/**
 * ¿Puede esta app escribir estos campos en esta tabla?
 *
 * Se llama igual al crear que al modificar. Devuelve el veredicto completo —
 * con la lista de lo que sí puede— para que el 403 sirva de algo al que lo lea.
 */
export function revisarEscritura(tabla: Tabla, app: App, campos: string[]): Veredicto {
  const permitidos = camposDe(tabla, app);
  if (!permitidos) {
    return {
      ok: false,
      error: 'sin_permiso',
      detalle: { tabla, app, apps_que_escriben: Object.keys(ESCRITORES[tabla] ?? {}) },
    };
  }

  const caches = CACHES[tabla] ?? [];
  const pisaCache = campos.filter((c) => caches.includes(c));

  // `etapa` se mueve por POST /items/:id/etapa, que además deja el renglón en
  // `avances`. Por PATCH se rechaza aunque quell101 la traiga en su lista: un
  // caché que se escribe a mano deja de ser un caché.
  if (pisaCache.length) {
    return {
      ok: false,
      error: tabla === 'items' ? 'campo_solo_por_etapa' : 'campo_no_permitido',
      detalle: {
        tabla,
        app,
        campos: pisaCache,
        motivo: tabla === 'items'
          ? 'la etapa se mueve con POST /orgs/:o/items/:id/etapa'
          : 'los recalcula la API despues de cada mutacion',
      },
    };
  }

  if (permitidos === '*') return { ok: true };

  const fuera = campos.filter((c) => !permitidos.includes(c));
  if (fuera.length) {
    return { ok: false, error: 'campo_no_permitido', detalle: { tabla, app, campos: fuera, permitidos } };
  }
  return { ok: true };
}
