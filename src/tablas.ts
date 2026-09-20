/* Qué columna es de qué tipo. El CRUD genérico de §6 (`/orgs/:o/:tabla`) sirve
 * a trece tablas con un solo camino, y para eso necesita saber tres cosas de
 * cada columna: si es dinero (entero en centavos, nunca flotante), si es JSON
 * (se guarda como texto y se devuelve ya parseado) o si es booleana (0/1 en
 * SQLite, true/false hacia afuera).
 *
 * Esta tabla y `migrations/org/*.sql` (aplicadas en orden) tienen que decir lo
 * mismo. La prueba `esquema.spec.ts` compara las dos y truena si se separan. */

import type { Tabla } from '../schema/tipos';

export type Tipo = 'texto' | 'entero' | 'dinero' | 'real' | 'bool' | 'json';

export interface Def {
  cols: Record<string, Tipo>;
  requeridos: string[];
  /** Filtros aceptados en el GET de lista, además de los de fecha. */
  filtros: string[];
  /** Columna por la que se ordena la lista. */
  orden: string;
  /** Columna de fecha para ?desde= / ?hasta= */
  fecha?: string;
}

const IDENT = { id: 'texto', creado_at: 'texto' } as const;

export const DEFS: Record<Tabla, Def> = {
  // Configuración de una app dentro de una empresa. `id` y `app` NO están en
  // la lista de campos que una app puede mandar (src/permisos.ts): los pone la
  // API con la cabecera X-App. Ver migrations/org/0005_ajustes.sql.
  ajustes: {
    cols: { ...IDENT, app: 'texto', clave: 'texto', valor: 'json', actualizado_at: 'texto' },
    requeridos: ['clave'],
    filtros: ['app', 'clave'],
    orden: 'clave',
  },
  negocios: {
    cols: { ...IDENT, nombre: 'texto', rfc: 'texto', moneda: 'texto', dia_conciliacion: 'entero' },
    requeridos: ['nombre'],
    filtros: [],
    orden: 'nombre',
  },
  cuentas: {
    cols: { ...IDENT, negocio_id: 'texto', nombre: 'texto', tipo: 'texto', banco: 'texto', moneda: 'texto', saldo_inicial: 'dinero' },
    requeridos: ['negocio_id', 'nombre', 'tipo'],
    filtros: ['negocio_id'],
    orden: 'nombre',
  },
  clientes: {
    cols: {
      ...IDENT, negocio_id: 'texto', nombre: 'texto', nombre_norm: 'texto', correo: 'texto', telefono: 'texto',
      rfc: 'texto', notas: 'texto', usuario_id: 'texto', portal_activo: 'bool', creado_en_app: 'texto',
    },
    requeridos: ['nombre'],
    filtros: ['negocio_id', 'usuario_id'],
    orden: 'nombre_norm',
  },
  proveedores: {
    cols: {
      ...IDENT, nombre: 'texto', nombre_norm: 'texto', rfc: 'texto', categoria: 'texto', correo: 'texto',
      telefono: 'texto', terminos_pago: 'texto', notas: 'texto', creado_en_app: 'texto',
    },
    requeridos: ['nombre'],
    filtros: ['categoria'],
    orden: 'nombre_norm',
  },
  personal: {
    cols: {
      ...IDENT, nombre: 'texto', nombre_norm: 'texto', correo: 'texto', puesto: 'texto', activo: 'bool',
      expediente_ref: 'texto', etapas_permitidas: 'json', ve_dinero: 'bool', estacion_default: 'texto',
      usuario_id: 'texto', creado_en_app: 'texto',
      /* 0008 · quién puede PAGAR una orden de compra. No se reusa `ve_dinero`:
       * ésa dice quién ve cifras. Se enciende sólo por POST
       * /orgs/:o/ordenes/contadores, que exige ser dueño; por eso NO está en
       * ESCRITORES.personal, o cualquiera con dash101 se marcaría solo. */
      es_contador: 'bool',
      /* 0014 · quién ve y mueve la RAYA. No se reusa `es_contador`: pagarle a
       * un proveedor y saber cuánto gana cada quien son dos cosas, y la
       * segunda es la que nadie quiere que ande suelta. Se enciende sólo por
       * POST /orgs/:o/nomina/encargados, que exige ser dueño; por eso NO está
       * en ESCRITORES.personal. */
      es_nominas: 'bool',
    },
    requeridos: ['nombre'],
    filtros: ['activo', 'usuario_id', 'es_contador', 'es_nominas'],
    orden: 'nombre_norm',
  },
  estaciones: {
    cols: { id: 'texto', nombre: 'texto', etapa_default: 'entero' },
    requeridos: ['nombre'],
    filtros: [],
    orden: 'nombre',
  },
  cotizaciones: {
    cols: {
      ...IDENT, negocio_id: 'texto', cliente_id: 'texto', folio: 'texto', estado: 'texto', total: 'dinero',
      moneda: 'texto', vigencia: 'texto', datos: 'json', actualizado_at: 'texto',
    },
    requeridos: ['negocio_id'],
    filtros: ['negocio_id', 'cliente_id', 'estado'],
    orden: 'creado_at',
    fecha: 'creado_at',
  },
  proyectos: {
    cols: {
      ...IDENT, negocio_id: 'texto', cliente_id: 'texto', nombre: 'texto', descripcion: 'texto', estado: 'texto',
      fecha_inicio: 'texto', fecha_fin_estimada: 'texto', fecha_cierre: 'texto',
      precio_venta: 'dinero', cobrado: 'dinero', pagado_prov: 'dinero', compromiso: 'dinero', avance: 'real',
      actualizado_at: 'texto',
    },
    requeridos: ['negocio_id', 'cliente_id', 'nombre'],
    filtros: ['negocio_id', 'cliente_id', 'estado'],
    orden: 'creado_at',
    fecha: 'fecha_inicio',
  },
  items: {
    cols: {
      ...IDENT, negocio_id: 'texto', proyecto_id: 'texto', cliente_id: 'texto', clave: 'texto', nombre: 'texto',
      descripcion: 'texto', tipo: 'texto', monto: 'dinero', cantidad: 'entero', moneda: 'texto', estado: 'texto', etapa: 'entero',
      etapa_at: 'texto', etapa_por: 'texto', fecha_entrega: 'texto', asignados: 'json', origen: 'json',
      refs: 'json', creado_por: 'texto', actualizado_at: 'texto',
      /* 0015 · el capítulo bajo el que va el ítem —Cocina, Recámaras— y su
       * lugar dentro de él. OJO: `partida` aquí NO es la tabla `partidas`,
       * que son los compromisos con proveedores; es la palabra de la
       * cotización. La migración 0015 explica por qué conviven. */
      partida: 'texto', orden: 'entero',
      /* 0016 · el alcance. `aprobado_at` es lo único que distingue después un
       * CANCELADO —estuvo aprobado y se canceló— de un descartado —nunca lo
       * estuvo—, que es la regla que puso Mike el 20-sep. Las tres las pone
       * la API (ver CACHES en src/permisos.ts): una app que pudiera escribir
       * `aprobado_at` podría hacer pasar por venta cancelada algo que nadie
       * aprobó nunca. */
      aprobado_at: 'texto', cancelado_at: 'texto', cancelado_motivo: 'texto',
    },
    requeridos: ['negocio_id', 'cliente_id', 'nombre'],
    filtros: ['negocio_id', 'proyecto_id', 'cliente_id', 'estado', 'etapa', 'partida'],
    orden: 'creado_at',
    fecha: 'fecha_entrega',
  },
  partidas: {
    cols: {
      ...IDENT, proyecto_id: 'texto', item_id: 'texto', proveedor_id: 'texto', proveedor_nombre: 'texto',
      concepto: 'texto', monto_acordado: 'dinero', monto_pagado: 'dinero', estado: 'texto', actualizado_at: 'texto',
    },
    requeridos: ['proyecto_id'],
    filtros: ['proyecto_id', 'item_id', 'proveedor_id', 'estado'],
    orden: 'creado_at',
    fecha: 'creado_at',
  },
  avances: {
    cols: { id: 'texto', item_id: 'texto', etapa: 'entero', persona_id: 'texto', usuario_id: 'texto', nota: 'texto', foto: 'texto', ts: 'texto' },
    requeridos: ['item_id', 'etapa'],
    filtros: ['item_id'],
    orden: 'ts',
    fecha: 'ts',
  },
  movimientos: {
    cols: {
      ...IDENT, negocio_id: 'texto', tipo: 'texto', monto: 'dinero', fecha: 'texto', cuenta_id: 'texto',
      proyecto_id: 'texto', item_id: 'texto', contraparte_tipo: 'texto', contraparte_id: 'texto',
      contraparte_nombre: 'texto', transfer_id: 'texto', descripcion: 'texto', categoria: 'texto', creado_por: 'texto',
      /* Fiscal (0009). No hay dos contabilidades: la fiscal es esta misma
       * lista filtrada por `facturado`. `tasa_iva` va en puntos base
       * (1600 = 16.00 %), como entero: una tasa no es dinero, pero en REAL
       * arrastra el mismo error de coma flotante. */
      facturado: 'bool', subtotal: 'dinero', iva: 'dinero', tasa_iva: 'entero', retenciones: 'dinero',
      uuid_cfdi: 'texto', fecha_cfdi: 'texto', forma_pago: 'texto',
      /* 0012 · que se ESPERA factura. No es lo mismo que `facturado`: una es
       * la decisión de quien captura, la otra es el hecho de que ya llegó.
       * Pendiente de facturar es la conjunción, y ninguna escribe a la otra.
       * Antes la espera salía de `ordenes.con_factura`, y por eso un ingreso
       * —que no tiene orden de compra— no podía estar pendiente nunca. */
      requiere_factura: 'bool',
    },
    requeridos: ['negocio_id', 'tipo', 'monto', 'fecha', 'cuenta_id'],
    filtros: ['negocio_id', 'proyecto_id', 'item_id', 'cuenta_id', 'tipo', 'facturado', 'requiere_factura'],
    orden: 'fecha',
    fecha: 'fecha',
  },
  opex: {
    cols: {
      ...IDENT, negocio_id: 'texto', nombre: 'texto', tipo: 'texto', monto: 'dinero', moneda: 'texto',
      frecuencia: 'texto', dia_semana: 'entero', dia_del_mes: 'entero', fecha_inicio: 'texto', fecha_fin: 'texto',
      cuenta_id: 'texto', categoria: 'texto', activo: 'bool',
    },
    requeridos: ['negocio_id', 'nombre', 'monto', 'frecuencia', 'fecha_inicio'],
    filtros: ['negocio_id', 'activo'],
    orden: 'nombre',
  },
  /* La conciliación semanal: una foto por corte. Se escribe con
   * POST /orgs/:o/conciliaciones, en una transacción; por el CRUD genérico
   * sólo se lee (append-only, como `avances`). */
  conciliaciones: {
    cols: { ...IDENT, negocio_id: 'texto', corte_at: 'texto', hecha_por: 'texto' },
    requeridos: ['negocio_id', 'corte_at'],
    filtros: ['negocio_id'],
    orden: 'corte_at',
    fecha: 'corte_at',
  },
  conciliacion_cuentas: {
    cols: {
      ...IDENT, conciliacion_id: 'texto', cuenta_id: 'texto', saldo_registrado: 'dinero',
      saldo_real: 'dinero', diferencia: 'dinero', movimiento_id: 'texto',
    },
    requeridos: ['conciliacion_id', 'cuenta_id'],
    filtros: ['conciliacion_id', 'cuenta_id'],
    orden: 'creado_at',
    fecha: 'creado_at',
  },

  archivos: {
    cols: { ...IDENT, r2_key: 'texto', nombre: 'texto', mime: 'texto', bytes: 'entero', de_tabla: 'texto', de_id: 'texto', subido_por: 'texto' },
    requeridos: ['r2_key', 'nombre', 'de_tabla', 'de_id'],
    filtros: ['de_tabla', 'de_id'],
    orden: 'creado_at',
    fecha: 'creado_at',
  },
};

export const esTabla = (t: string): t is Tabla => Object.prototype.hasOwnProperty.call(DEFS, t);

/** Las columnas que llevan dinero. Ninguna admite un flotante. */
export function columnasDinero(tabla: Tabla): string[] {
  return Object.entries(DEFS[tabla].cols).filter(([, t]) => t === 'dinero').map(([c]) => c);
}
