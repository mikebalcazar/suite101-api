/* OrgDB — una empresa, un Durable Object, un SQLite suyo.
 *
 * Nace solo la primera vez que alguien le habla (`ORG.idFromName(orgId)`), sin
 * redeploy. Al despertar mira su versión y, si está atrás, se migra.
 *
 * Un solo hilo por empresa: dos escrituras al mismo tiempo se encolan y nadie
 * pisa a nadie. Por eso los cachés del proyecto (precio_venta, cobrado, avance)
 * se pueden recalcular aquí adentro sin transacciones ni condiciones de carrera
 * — que es justo lo que en conta-master había que resolver a mano.
 *
 * Aquí no hay permisos: los permisos se resuelven en el Worker, antes de llegar
 * (§7). Este objeto guarda y calcula.
 */

import { DurableObject } from 'cloudflare:workers';
import inicial from '../migrations/org/0001_inicial.sql';
import partidasATabla from '../migrations/org/0002_partidas.sql';
import conciliaciones from '../migrations/org/0003_conciliaciones.sql';
import folios from '../migrations/org/0004_folios.sql';
import ajustes from '../migrations/org/0005_ajustes.sql';
import quell from '../migrations/org/0006_quell.sql';
import roster from '../migrations/org/0007_roster.sql';
import ordenes from '../migrations/org/0008_ordenes.sql';
import fiscal from '../migrations/org/0009_fiscal.sql';
import obras from '../migrations/org/0010_obras.sql';
import cantidad from '../migrations/org/0011_cantidad.sql';
import facturaEsperada from '../migrations/org/0012_factura_esperada.sql';
import bitacoraPrecio from '../migrations/org/0013_bitacora_precio.sql';
import raya from '../migrations/org/0014_raya.sql';
import partidaOrden from '../migrations/org/0015_partida_orden.sql';
import alcance from '../migrations/org/0016_alcance_item.sql';
import productos from '../migrations/org/0017_productos.sql';
import ivaDelProyecto from '../migrations/org/0018_iva_del_proyecto.sql';
import docsDelItem from '../migrations/org/0019_docs_del_item.sql';
import reembolsos from '../migrations/org/0020_reembolsos.sql';
import rosterEquipos from '../migrations/org/0021_roster_equipos.sql';
import proveedoresDatos from '../migrations/org/0022_proveedores_datos.sql';
import proveedorCuentas from '../migrations/org/0023_proveedor_cuentas.sql';
import subitems from '../migrations/org/0024_subitems.sql';
import accionistas from '../migrations/org/0025_accionistas.sql';
import movimientoPartida from '../migrations/org/0026_movimiento_partida.sql';
import sinNegocios from '../migrations/org/0027_sin_negocios.sql';
import alcanceDosEstados from '../migrations/org/0028_alcance_dos_estados.sql';
import planoGirado from '../migrations/org/0029_plano_girado_y_sustituido.sql';
import requerimientosHuerfanos from '../migrations/org/0030_requerimientos_huerfanos.sql';
import cronograma from '../migrations/org/0031_cronograma.sql';
import fases from '../migrations/org/0032_fases.sql';
import candados from '../migrations/org/0033_candados.sql';
import planPagos from '../migrations/org/0034_plan_pagos.sql';
import fasesDefault from '../migrations/org/0035_fases_default.sql';
import poblarCostos from '../migrations/org/0036_poblar_costos.sql';
import tiemposDefault from '../migrations/org/0037_tiempos_default.sql';
import descripcionDePieza from '../migrations/org/0038_descripcion_de_pieza.sql';
import obrasALaSuite from '../migrations/org/0039_obras_a_la_suite.sql';
import empresaLogoYDatos from '../migrations/org/0040_empresa_logo_y_datos.sql';
import costos from '../migrations/org/0041_costos.sql';
import inversion from '../migrations/org/0042_inversion.sql';
import inversionRiesgos from '../migrations/org/0043_inversion_riesgos.sql';
import bill from '../migrations/org/0044_bill.sql';
import ordenesCanceladas from '../migrations/org/0045_ordenes_canceladas.sql';
import sat from '../migrations/org/0046_sat.sql';
import timbrar from '../migrations/org/0047_timbrar.sql';
import facturaV2 from '../migrations/org/0048_factura_v2.sql';
import disenoDelItem from '../migrations/org/0049_diseno_del_item.sql';
import cuentaDeReembolso from '../migrations/org/0050_cuenta_de_reembolso.sql';
import { MotorInversion } from './inversion-db';
import { MotorFiscal } from './fiscal-db';
import { MotorSat, type MemoriaSat } from './sat-db';
import { MotorPac } from './pac-db';
import { atender as atenderQuell, poblarCostosDefault, ponerTiemposDefault, type BaseQuell, type SesionQuell } from './quell/motor.js';
import { PREFIJOS, esRequerimiento, siguienteCodigo } from './quell/codigos.js';

/** El tipo del ítem (minúsculas, como lo guarda `items.tipo`) dicho como lo
 *  escribe quell en `quell_elements.type`, que es lo que decide el prefijo
 *  del código de la pieza. */
const TIPO_EN_QUELL: Record<string, string> = { mueble: 'Mueble', puerta: 'Puerta', acabado: 'Acabado', servicio: 'Servicio' };
import { atender as atenderRoster, type DatosEmpresaRoster, type SesionRoster } from './roster/motor.js';
import { invitarClienteEnSuite } from './clientes';
import { secretoDe } from './maestro';
import type { Quien } from './http';
import { DEFS, type Def, type Tipo } from './tablas';
import { calcular, hoyMx, limpiarApu, usaA, type Apu, type Desglose, type Fuentes } from './costos';
import { ahora, normalizar, ulid } from './lib';
import { alcanceDeItem, CATEGORIA_PRESTAMO_CAPITAL, CATEGORIA_PRESTAMO_RECIBIDO, type MovimientoAlcance } from '../schema/tipos';
import { TABLAS, type Aviso, type ConteoQuote, type Etapa, type EventoOrden, type Peek, type Pool, type ProveedorDePago, type CuentaDeReembolso, type ReembolsoA, type Tabla } from '../schema/tipos';
import type { Env } from './entorno';

/* Las migraciones del OrgDB, en orden. Para agregar una: se escribe el .sql,
 * se importa y se empuja aquí. El DO la aplica al despertar. Nunca se edita
 * una que ya salió: las bases que ya la corrieron no la volverían a correr. */
/** Las migraciones del OrgDB, en orden. Se exporta porque es el ÚNICO dueño de
 *  esta lista: el DO las aplica de aquí, `VERSION_ORG_DB` se cuenta de aquí y
 *  `esquema.spec.ts` compara contra esto mismo. Una prueba que se armara su
 *  propia lista compararía contra una base que no existe — y eso pasó: la
 *  prueba del esquema se quedó en la 0003 y nadie lo notó, porque la 0004 sólo
 *  agregaba una tabla que el contrato no expone. */
export const MIGRACIONES: string[] = [inicial, partidasATabla, conciliaciones, folios, ajustes, quell, roster, ordenes, fiscal, obras, cantidad, facturaEsperada, bitacoraPrecio, raya, partidaOrden, alcance, productos, ivaDelProyecto, docsDelItem, reembolsos, rosterEquipos, proveedoresDatos, proveedorCuentas, subitems, accionistas, movimientoPartida, sinNegocios, alcanceDosEstados, planoGirado, requerimientosHuerfanos, cronograma, fases, candados, planPagos, fasesDefault, poblarCostos, tiemposDefault, descripcionDePieza, obrasALaSuite, empresaLogoYDatos, costos, inversion, inversionRiesgos, bill, ordenesCanceladas, sat, timbrar, facturaV2, disenoDelItem, cuentaDeReembolso];

/** La 0027, la 0030, la 0039 y la 0040 no son SQL: corren en código, porque lo que hacen
 *  depende de lo que haya en la base. `migrar()` las reconoce por su lugar
 *  en la lista; el archivo .sql es sólo la nota que lo dice. */
const EN_CODIGO: Record<number, 'quitarNegocios' | 'migrarRequerimientosHuerfanos' | 'migrarObrasSueltas' | 'empresaLogoYDatos' | 'costosDeObra' | 'inversionRiesgos' | 'bill101' | 'timbrar' | 'facturaV2' | 'disenoDelItem' | 'cuentaDeReembolso'> = {
  [MIGRACIONES.indexOf(sinNegocios)]: 'quitarNegocios',
  [MIGRACIONES.indexOf(requerimientosHuerfanos)]: 'migrarRequerimientosHuerfanos',
  [MIGRACIONES.indexOf(obrasALaSuite)]: 'migrarObrasSueltas',
  [MIGRACIONES.indexOf(empresaLogoYDatos)]: 'empresaLogoYDatos',
  [MIGRACIONES.indexOf(costos)]: 'costosDeObra',
  [MIGRACIONES.indexOf(inversionRiesgos)]: 'inversionRiesgos',
  [MIGRACIONES.indexOf(bill)]: 'bill101',
  [MIGRACIONES.indexOf(timbrar)]: 'timbrar',
  [MIGRACIONES.indexOf(facturaV2)]: 'facturaV2',
  [MIGRACIONES.indexOf(disenoDelItem)]: 'disenoDelItem',
  [MIGRACIONES.indexOf(cuentaDeReembolso)]: 'cuentaDeReembolso',
};

/** La tabla `empresa` (0027): UN renglón, con id fijo, que es lo que antes
 *  era «el negocio». Se exporta para que `esquema.spec.ts` la lea de aquí y
 *  no de una copia a mano. */
export const SQL_EMPRESA = `CREATE TABLE IF NOT EXISTS empresa (
  id TEXT PRIMARY KEY CHECK (id = 'empresa'), nombre TEXT NOT NULL, rfc TEXT,
  moneda TEXT NOT NULL DEFAULT 'MXN', dia_conciliacion INTEGER NOT NULL DEFAULT 1, creado_at TEXT NOT NULL,
  correo TEXT, telefono TEXT, sitio_web TEXT, direccion TEXT, logo_llave TEXT, logo_at TEXT
)`;

/** Lo que la 0040 le agrega a una `empresa` que nació antes que ella. */
const COLUMNAS_0040 = ['correo', 'telefono', 'sitio_web', 'direccion', 'logo_llave', 'logo_at'];

/** Los índices que llevaban `negocio_id`, vueltos a crear sin él (0027). */
const INDICES_SIN_NEGOCIO = [
  `CREATE INDEX IF NOT EXISTS conciliaciones_corte ON conciliaciones(corte_at)`,
  `CREATE INDEX IF NOT EXISTS rayas_por_periodo ON rayas(periodo_fin)`,
  `CREATE INDEX IF NOT EXISTS productos_nombre ON productos(nombre)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS productos_codigo ON productos(codigo) WHERE codigo <> ''`,
  `CREATE INDEX IF NOT EXISTS ordenes_tipo ON ordenes(tipo, estado)`,
];

/** El `CREATE TABLE` de una tabla sin una de sus columnas, con otro nombre.
 *  Parte las definiciones por las comas de primer nivel —un CHECK trae las
 *  suyas adentro— y tira la pieza cuya primera palabra es la columna. Los
 *  comentarios se quitan antes: SQLite guarda el texto tal cual se escribió,
 *  comentarios incluidos, y una coma dentro de uno partiría mal. */
export function createSinColumna(sqlCreate: string, columna: string, nuevoNombre: string): string {
  const limpio = sqlCreate.replace(/--[^\n]*/g, '');
  const abre = limpio.indexOf('(');
  const cierra = limpio.lastIndexOf(')');
  const cuerpo = limpio.slice(abre + 1, cierra);
  const piezas: string[] = [];
  let nivel = 0;
  let pieza = '';
  for (const ch of cuerpo) {
    if (ch === '(') nivel++;
    if (ch === ')') nivel--;
    if (ch === ',' && nivel === 0) { piezas.push(pieza); pieza = ''; } else pieza += ch;
  }
  piezas.push(pieza);
  const quedan = piezas.map((x) => x.trim()).filter((x) => x && x.split(/\s+/)[0].replace(/"/g, '') !== columna);
  return `CREATE TABLE "${nuevoNombre}" (${quedan.join(', ')})`;
}

/** La versión a la que llega un OrgDB al día. Se exporta para que las pruebas
 *  no la escriban a mano: el 16-sep, subir la migración 0004 y olvidar el
 *  número dejó el humo en rojo con la migración ya publicada y funcionando.
 *  El repositorio define qué es «al día»; nadie más. */
export const VERSION_ORG_DB = MIGRACIONES.length;

const PREFIJO_CLAVE: Record<string, string> = { mueble: 'M', servicio: 'S', visita: 'V', otro: 'O' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fila = Record<string, any>;

/** Los dos tipos de orden (0.47.0): una compra que se le paga a un proveedor
 *  o un reembolso que se le regresa a quien puso el dinero. */
export const TIPOS_ORDEN = ['compra', 'reembolso'] as const;
export type TipoOrden = (typeof TIPOS_ORDEN)[number];

export interface Sujeto {
  usuario_id: string;
  /** 'miembro' ve todo; 'personal' no ve dinero salvo ve_dinero; 'cliente' solo /peek */
  clase: 'miembro' | 'personal' | 'cliente';
  ref_id?: string;
  ve_dinero?: boolean;
}

/* La cara del Durable Object vista desde el Worker.
 *
 * El stub tipado que da `DurableObjectNamespace<OrgDB>` obliga a TypeScript a
 * recorrer la clase entera en cada llamada, y con trece tablas eso se le acaba
 * saliendo de las manos (TS2589). Esta interfaz dice lo mismo en plano: mismos
 * metodos, mismas firmas, envueltos en Promise porque del otro lado hay una
 * llamada a distancia. Si se agrega un metodo publico, se agrega aqui. */
/** Una línea de la hoja de quote101 al aprobarse (0.46.0). `precio` es el
 *  de UNA pieza, en centavos, ya con el descuento de la hoja repartido. */
export interface LineaAprobada {
  nombre: string; descripcion?: string | null; codigo?: string | null; tipo?: string | null;
  cantidad: number; precio: number; producto_id?: string | null;
  /** 0.49.0: el renglón ES un ítem que ya existe —un requerimiento levantado
   *  en la obra—. Al aprobar se aprueba ése, con su tipo y su precio nuevos,
   *  en vez de crear otro. */
  item_id?: string | null;
  /** 0.78.0: las notas internas del renglón (Mike, 7-oct: «no se presentan
   *  al cliente (…) aparecen en quell cuando se autoriza el requerimiento. Se
   *  escriben en la bitácora del ahora ítem»). No van al ítem. */
  notas_internas?: string | null;
}
/** Quién escribe, para la bitácora del alcance (0.64.0): la app y el
 *  usuario siempre; el correo cuando la ruta lo tiene a la mano. */
export interface ContextoEscritura { app: string; usuario_id: string; correo?: string | null }

export interface AprobarCotizacion {
  cotizacion_id: string; proyecto_id: string; lineas: LineaAprobada[]; usuario_id: string; app: string; correo?: string | null;
  /** 0.49.0: la partida (pestaña) en la que caen las piezas. Sin ella, el
   *  nombre de la cotización. */
  partida?: string | null;
}
export type ResultadoAprobar =
  | { ok: true; cotizacion: Fila; proyecto: Fila; items: number; productos_nuevos: number }
  | { ok: false; error: string; detalle?: Record<string, any> };

/** Lo que devuelve borrar un cliente o un proyecto con todo lo suyo (0.51.0). */
/** Fusionar dos proyectos (0.52.0): el que se va le deja todo al que se queda. */
export interface ResultadoFusionProyectos {
  ok: true;
  seco: boolean;
  queda: Fila;
  se_va: { id: string; nombre: string; cliente_id: string | null };
  /** Cuántas filas cambiaron de proyecto, por tabla (sólo las que tenían algo). */
  movidos: Record<string, number>;
  /** La obra de quell del que se va, si el que se queda ya tenía la suya: se queda sin proyecto, no se toca. */
  obra_suelta: boolean;
}

export interface ResultadoBorrarConTodo {
  ok: true;
  modo: 'seco' | 'borrar';
  cliente: Fila | null;
  proyectos: number;
  items: number;
  cotizaciones: number;
  partidas: number;
  /** Órdenes de compra que apuntaban al proyecto y quedan como gasto general. */
  ordenes_sueltas: number;
  /** Piezas del plano que se quedan sin ítem (la pieza es de quell y no se toca). */
  piezas_sin_item: number;
  /** Obras de quell que se quedan sin proyecto (la obra no se toca). */
  obras_sueltas: number;
}

export interface ApiOrgDB {
  version(): Promise<number>;
  /** Puerta de servicio: borra TODO y vuelve a migrar. Solo DELETE /admin/orgs/:o fuera de producción. */
  vaciar(): Promise<number>;
  listar(tabla: Tabla, filtros?: Record<string, string>, sujeto?: Sujeto, limite?: number): Promise<{ total: number; filas: Fila[] }>;
  obtener(tabla: Tabla, id: string): Promise<Fila | null>;
  /** La empresa (0.63.0): el único renglón de `empresa`. Si no existe, se
   *  crea con el nombre y la moneda que se pasen (MXN si no se dice). */
  empresa(nombre: string, moneda?: 'MXN' | 'USD'): Promise<Fila>;
  /** Cambia nombre, rfc, moneda o dia_conciliacion de la empresa; lo que no
   *  venga se queda. Devuelve el renglón ya cambiado. */
  actualizarEmpresa(datos: Fila): Promise<Fila>;
  /** Las tablas de esta base con sus columnas, como las ve SQLite. Para
   *  master101 y para medir una migración (`GET /admin/orgs/:o/esquema`). */
  esquema(): Promise<Record<string, string[]>>;
  crear(tabla: Tabla, datos: Fila, contexto: ContextoEscritura): Promise<Fila>;
  /** Deja el contador de folios en un número. La usa la mudanza de la fase 4
   *  para dejarlo justo después de lo que acabó de importar. */
  fijarFolio(siguiente: number, serie?: string): Promise<number>;
  /** Aparta el siguiente número de una serie (lo consume). */
  apartarNumero(serie: string): Promise<number>;
  /** Mira el siguiente número sin apartarlo. */
  verNumero(serie: string): Promise<number>;
  actualizar(tabla: Tabla, id: string, datos: Fila, contexto?: Partial<ContextoEscritura>): Promise<Fila | null>;
  /** false si no existía; 'en_uso' si otras filas apuntan a esta (llave foránea). */
  borrar(tabla: Tabla, id: string): Promise<boolean | 'en_uso'>;
  recalcularProyecto(proyecto_id: string): Promise<Fila | null>;
  /** La conciliación semanal, entera o nada (B1). Sólo la llama POST /conciliaciones. */
  conciliar(args: {
    corte_at: string; usuario_id: string;
    saldos: Array<{ cuenta_id: string; saldo_real: number }>;
  }): Promise<{ ok: true; conciliacion: Fila; cuentas: Fila[]; diferencia_total: number } | { ok: false; error: string; detalle?: Record<string, any> }>;
  estadisticaConciliacion(): Promise<{
    cortes: Array<Record<string, any>>;
    por_cuenta: Array<Record<string, any>>;
    acumulado: { cortes: number; diferencia_total: number; faltante: number; sobrante: number };
  }>;
  moverEtapa(args: {
    item_id: string; etapa: number; nota?: string | null; foto?: string | null;
    usuario_id: string; persona_id?: string | null; etapas_permitidas?: number[] | null;
  }): Promise<{ ok: true; item: Fila; avance: Fila } | { ok: false; error: string; detalle?: Record<string, any> }>;
  exportarItems(args: {
    cotizacion_id: string; lineas: Array<Record<string, any>>; cliente_id: string; usuario_id: string;
  }): Promise<{ total: number; filas: Fila[] }>;
  venderItems(args: {
    item_ids: string[]; proyecto_id?: string | null; nombre_proyecto?: string; app: string; usuario_id: string;
    correo?: string | null;
  }): Promise<{ ok: true; proyecto: Fila; items: Fila[] } | { ok: false; error: string; detalle?: Record<string, any> }>;
  aprobarCotizacion(args: AprobarCotizacion): Promise<ResultadoAprobar>;
  /** 0.49.0: un requerimiento levantado en la obra nace como ítem cotizado del
   *  proyecto ligado y cae en el borrador de requerimientos de quote101. */
  levantarRequerimiento(d: { element_id: string; obra_id: string; code: string; name: string; usuario_id: string; padre_item_id?: string | null; descripcion?: string | null }): Promise<{ item_id: string | null; cotizacion_id: string | null }>;
  registrarArchivo(datos: {
    id: string; r2_key: string; nombre: string; mime: string | null; bytes: number;
    de_tabla: string; de_id: string; subido_por: string;
  }): Promise<Fila | null>;
  pool(): Promise<Pool>;
  peek(cliente_id: string): Promise<Peek | null>;
  /** El cliente ligado a un usuario de la suite (`clientes.usuario_id`), si lo hay (0.64.3). */
  clientePorUsuario(usuario_id: string): Promise<Fila | null>;
  /** El cliente con ese correo (normalizado), si lo hay (0.64.4). */
  clientePorCorreo(correo: string): Promise<Fila | null>;
  estadoDeCuenta(cliente_id: string): Promise<{
    cliente: Fila;
    proyectos: Fila[];
    otros_pagos: Fila[];
    totales: { vendido: number; cobrado: number; saldo: number; sin_proyecto: number };
  } | null>;
  /** El estado de cuenta de UN proyecto: la lista que suma, el desglose de
   *  IVA como lo lleve esa obra, los pagos del cliente y la fecha del
   *  servidor. Lo abren dash101 y peek101 con el mismo cálculo (§119). */
  estadoDelProyecto(proyecto_id: string): Promise<{
    generado_at: string;
    proyecto: Fila;
    cliente: Fila | null;
    /** ES LA EMPRESA (0.63.0): {id: 'empresa', nombre, rfc, moneda}. Sigue
     *  llamándose `negocio` para no romper peek101 ni dash101. */
    negocio: Fila | null;
    items: Fila[];
    movimientos: Fila[];
    totales: {
      subtotal: number; iva: number; total: number;
      tasa_iva: number; iva_incluido: boolean;
      cobrado: number; saldo: number; piezas: number;
    };
  } | null>;
  conectados(): Promise<number>;
  /** Puerta de servicio: solo la usa POST /admin/importar (fase 2). */
  importar(args: { filas: Record<string, Fila[]>; seco: boolean }): Promise<Importacion>;
  conteos(): Promise<{ filas: Record<string, number>; sumas: Record<string, number> }>;
  /** Cuántas filas hay en cada tabla de quell101. Para master101 y para medir la mudanza. */
  conteosQuell(): Promise<Record<string, number>>;
  /** Cuántas filas hay en cada tabla de roster101. Para master101 y para medir la mudanza. */
  conteosRoster(): Promise<Record<string, number>>;
  /** Lo de quote101 de la empresa, en cuatro cifras (0.63.0). */
  conteosQuote(): Promise<ConteoQuote>;
  /* Órdenes de compra (0008). Los permisos los resuelve el Worker; aquí sólo
   * viven las reglas que son verdad de la base —una orden pagada no se vuelve
   * a pagar— y lo que tiene que pasar todo o nada. */
  personalDeUsuario(usuario_id: string): Promise<Fila | null>;
  asegurarPersonal(args: { usuario_id: string; nombre: string; correo?: string | null }): Promise<Fila>;
  esContador(usuario_id: string): Promise<boolean>;
  esDeNominas(usuario_id: string): Promise<boolean>;
  marcarNominas(args: { personal_id: string; valor: boolean; quien_usuario_id: string; quien_nombre?: string | null }): Promise<Fila | null>;
  marcarContador(args: { personal_id: string; valor: boolean; quien_usuario_id: string; quien_nombre?: string | null }): Promise<Fila | null>;
  /** investor101 (0.82.0): una sola puerta al motor de src/inversion-db.ts. */
  inversion(op: string, args?: unknown[]): Promise<any>;
  /** bill101 (0.85.0): una sola puerta al motor de src/fiscal-db.ts. */
  fiscal(op: string, args?: unknown[]): Promise<any>;
  /** bill101 fase D: la FIEL y lo que se baja del SAT (src/sat-db.ts). */
  sat(op: string, args?: unknown[]): Promise<any>;
  /** bill101 fase C: la cuenta de Facturama y las emisiones (src/pac-db.ts). */
  pac(op: string, args?: unknown[]): Promise<any>;
  crearOrden(args: Record<string, unknown>): Promise<Fila | { error: string; detalle?: unknown }>;
  /** 0.92.0 · La cuenta a la que se le reembolsa a este usuario (0050), o null si nunca la dio. */
  cuentaDeReembolsoDe(usuario_id: string): Promise<CuentaDeReembolso | null>;
  /** 0.92.0 · Guardar (o cambiar) esa cuenta. La CLABE ya viene revisada por el Worker. */
  guardarCuentaDeReembolso(args: { usuario_id: string; clabe: string; banco?: string | null; beneficiario?: string | null }): Promise<CuentaDeReembolso>;
  misOrdenes(usuario_id: string): Promise<Fila[]>;
  buzon(hoy?: string, tipo?: TipoOrden | null): Promise<{ filas: Fila[]; total: number; vence_esta_semana: number; vencidas: number }>;
  /** 0.59.0 · El historial: las órdenes ya pagadas, la más reciente arriba (Mike, 1-oct: «un historial completo de las órdenes de compra ya pagadas»). */
  ordenesPagadas(tipo?: TipoOrden | null, limite?: number): Promise<{ filas: Fila[]; total: number }>;
  /** Quién hay en los expedientes de roster101, para dar de alta un
   *  accionista jalándolo de ahí (0.60.0). */
  accionistasDeRoster(): Promise<Array<{ id: string; nombre: string; rfc: string; correo: string; puesto: string }>>;
  pendientesDeOrdenes(): Promise<{ compras: { total: number; cuantas: number }; reembolsos: { total: number; cuantas: number } }>;
  verOrden(id: string): Promise<{ orden: Fila; eventos: Fila[]; archivos: Fila[]; proveedor: ProveedorDePago | null; reembolso_a: ReembolsoA | null } | null>;
  /** 0.56.1 · La orden que dejó ese egreso (o null): para que desde el movimiento se llegue a la orden con toda su historia y sus papeles. */
  ordenDeMovimiento(movimiento_id: string): Promise<{ orden: Fila; eventos: Fila[]; archivos: Fila[] } | null>;
  pagarOrden(args: Record<string, unknown>): Promise<{ ok: true; orden: Fila; movimiento: Fila; partida_id: string | null } | { error: string; detalle?: unknown }>;
  resolverOrden(args: { id: string; que: 'devuelta' | 'rechazada'; nota: string; quien_usuario_id: string; quien_nombre?: string | null }): Promise<Fila | { error: string; detalle?: unknown }>;
  corregirOrden(args: { id: string; quien_usuario_id: string; quien_nombre?: string | null; cambios: Record<string, unknown>; cuenta?: { clabe: string; banco?: string | null; beneficiario?: string | null } | null }): Promise<Fila | { error: string; detalle?: unknown }>;
  /** 0.86.0 · Quien la pidió la cancela, mientras está en el buzón o devuelta. */
  cancelarOrden(args: { id: string; nota?: string | null; quien_usuario_id: string; quien_nombre?: string | null }): Promise<Fila | { error: string; detalle?: unknown }>;

  /* Contabilidad fiscal (0009). Una sola lista de movimientos; la fiscal es
   * la misma filtrada por `facturado`. */
  crearCfdi(args: Record<string, unknown>): Promise<Fila | { error: string; detalle?: unknown }>;
  ligarCfdi(args: { cfdi_id: string; movimiento_id: string; monto_aplicado?: number }): Promise<{ ok: true; cfdi: Fila; movimiento: Fila; aplicado_total: number } | { error: string; detalle?: unknown }>;
  cancelarCfdi(id: string): Promise<Fila | { error: string }>;
  marcarFacturado(args: Record<string, unknown>): Promise<Fila | { error: string; detalle?: unknown }>;
  /* Siempre de la empresa entera (0.63.0): el RFC es uno. */
  ivaDelMes(desde: string, hasta: string): Promise<{ desde: string; hasta: string; trasladado: number; acreditable: number; retenciones: number; a_enterar: number; facturas: { emitidas: number; recibidas: number; canceladas: number } }>;
  facturadoVsReal(desde: string, hasta: string): Promise<{ desde: string; hasta: string; ingresos: { total: number; facturado: number; fuera: number }; egresos: { total: number; facturado: number; fuera: number } }>;
  pendientesDeFactura(tipo?: string | null): Promise<Fila[]>;
  listaCfdi(args: { desde?: string; hasta?: string; tipo?: string; estado?: string }): Promise<Fila[]>;

  /* El cliente es uno solo en las tres apps: avisar del parecido y juntar
   * los dos que ya se crearon. */
  clientesParecidos(nombre: string): Promise<Fila[]>;
  fusionarClientes(queda_id: string, se_va_id: string): Promise<{ ok: true; cliente: Fila; movidos: Record<string, number> } | { error: string; detalle?: unknown }>;
  /** 0.51.0: borrar un cliente o un proyecto CON TODO lo suyo, o decir por
   *  qué no (dinero o historia). `seco` sólo cuenta. */
  borrarClienteConTodo(cliente_id: string, modo: 'seco' | 'borrar'): Promise<ResultadoBorrarConTodo | { error: string; detalle?: unknown }>;
  borrarProyectoConTodo(proyecto_id: string, modo: 'seco' | 'borrar'): Promise<ResultadoBorrarConTodo | { error: string; detalle?: unknown }>;
  fusionarProyectos(queda_id: string, se_va_id: string, seco: boolean): Promise<ResultadoFusionProyectos | { error: string; detalle?: unknown }>;

  /* La obra de quell101 ligada al proyecto de dash101 (0010). */
  obras(args?: { sueltas?: boolean }): Promise<Fila[]>;
  obraDeProyecto(proyecto_id: string): Promise<Fila | null>;
  sinUbicar(obra_id: string): Promise<{ obra: Fila; items: Fila[] } | { error: string; detalle?: unknown }>;
  ligarObra(obra_id: string, proyecto_id: string, usuario_id?: string): Promise<{ ok: true; obra: Fila } | { error: string; detalle?: unknown }>;
  levantarRequerimientosHuerfanos(obra_id?: string | null, usuario_id?: string): Promise<number>;
  itemsDeLaObra(obra_id: string): Promise<{ obra: Fila; parejas: Fila[]; nuevos: Fila[]; sueltos: Fila[]; candidatos: Fila[] } | { error: string; detalle?: unknown }>;
  rayas(): Promise<Fila[]>;
  raya(id: string): Promise<{ raya: Fila; pagos: Fila[] } | null>;
  crearRaya(
    datos: { periodo_inicio: string; periodo_fin: string; nota?: string;
             pagos?: Array<{ personal_id: string; concepto?: string; sueldo?: number; extras?: number; descuentos?: number; nota?: string }> },
    contexto: { usuario_id: string },
  ): Promise<{ ok: true; raya: Fila; pagos: Fila[] } | { error: string; detalle?: unknown }>;
  editarRaya(
    id: string,
    datos: { periodo_inicio?: string; periodo_fin?: string; nota?: string;
             pagos?: Array<{ personal_id: string; concepto?: string; sueldo?: number; extras?: number; descuentos?: number; nota?: string }> },
  ): Promise<{ ok: true; raya: Fila; pagos: Fila[] } | { error: string; detalle?: unknown }>;
  pagarRaya(
    id: string,
    args: { cuenta_id: string; fecha?: string; quien_usuario_id: string },
  ): Promise<{ ok: true; raya: Fila; pagos: Fila[] } | { error: string; detalle?: unknown }>;
  cancelarRaya(id: string): Promise<{ ok: true; raya: Fila; pagos: Fila[] } | { error: string; detalle?: unknown }>;
  recibido(pago_id: string, recibido: boolean): Promise<{ ok: true; pago: Fila } | { error: string; detalle?: unknown }>;
  /* La raya contra los expedientes de roster101 (§107). */
  trabajadoresDeRoster(): Promise<Fila[]>;
  personaDeRoster(roster_id: string, contexto: { usuario_id: string }): Promise<{ ok: true; persona: Fila; nueva: boolean } | { error: string; detalle?: unknown }>;
  fusionarItemsDeLaObra(
    obra_id: string,
    plan: {
      ligar?: Array<{ element_id: string; item_id: string; clave?: 'quell' | 'dash'; nombre?: 'quell' | 'dash'; sumar?: boolean }>;
      crear?: Array<string | { element_id: string; monto?: number; descripcion?: string; nombre?: string }>;
    },
    contexto: { usuario_id: string },
  ): Promise<{ ok: true; ligados: number; creados: number; renombrados: number; sumados: number; obra: Fila } | { error: string; detalle?: unknown }>;
  desligarObra(obra_id: string): Promise<{ ok: true; obra: Fila } | { error: string; detalle?: unknown }>;

  /* Varios ítems del mismo producto (§98, rehecho en §111: agrupar ya no
   * fusiona renglones, los apunta a un producto del catálogo). */
  gruposDeItems(proyecto_id: string): Promise<{ proyecto: Fila; grupos: Fila[] } | { error: string; detalle?: unknown }>;
  agruparItems(
    proyecto_id: string,
    args: { items: string[]; nombre?: string; codigo?: string; precio?: number; producto_id?: string },
    contexto: { usuario_id: string },
  ): Promise<{ ok: true; producto: Fila; items: Fila[]; nuevo: boolean; venta_antes: number; venta_despues: number } | { error: string; detalle?: unknown }>;
  productosDelProyecto(
    proyecto_id: string,
  ): Promise<{ proyecto: Fila; productos: Fila[]; unicos: Fila[] } | { error: string; detalle?: unknown }>;
  asignarProducto(
    item_id: string,
    args: { producto_id?: string; desde_item?: string; solo?: boolean },
    contexto: { usuario_id: string },
  ): Promise<{ ok: true; item: Fila; producto: Fila | null; venta_antes: number; venta_despues: number } | { error: string; detalle?: unknown }>;
  separarItem(
    item_id: string,
    contexto: { usuario_id: string },
  ): Promise<{ ok: true; item: Fila; salio_de: string | null; reconstruidos: Fila[]; piezas_repartidas: number; venta_antes: number; venta_despues: number } | { error: string; detalle?: unknown }>;
  separarProducto(
    proyecto_id: string,
    producto_id: string,
    contexto: { usuario_id: string },
  ): Promise<{ ok: true; separados: number; reconstruidos: number; piezas_repartidas: number; venta_antes: number; venta_despues: number } | { error: string; detalle?: unknown }>;
  acomodarItems(
    proyecto_id: string,
    items: Array<{ id: string; partida?: string; orden?: number }>,
  ): Promise<{ ok: true; acomodados: number } | { error: string; detalle?: unknown }>;

  /* Agregar al alcance y sacar del alcance (§106, dos estados desde 0.64.0). */
  aprobarItem(id: string, contexto: Partial<ContextoEscritura>): Promise<{ ok: true; item: Fila; era: string } | { error: string; detalle?: unknown }>;
  cancelarItem(
    id: string,
    args: { motivo?: string },
    contexto: Partial<ContextoEscritura>,
  ): Promise<{ ok: true; item: Fila; alcance: 'fuera' } | { error: string; detalle?: unknown }>;
  /** La bitácora del alcance de un ítem (0.64.0), del más viejo al más nuevo. */
  bitacoraAlcance(item_id: string): Promise<{ ok: true; item: Fila; movimientos: MovimientoAlcance[] } | { error: string; detalle?: unknown }>;
  /** Borrar lo cancelado de un proyecto (§117). `modo: 'seco'` no escribe:
   *  contesta el mismo censo para poder enseñarlo antes. */
  borrarCancelados(
    proyecto_id: string,
    args: { modo: 'seco' | 'borrar'; ids?: string[]; soltar?: boolean },
    contexto: { usuario_id: string },
  ): Promise<{
    ok: true; modo: 'seco' | 'borrar'; total: number;
    borrados: number; cancelados: number; descartados: number;
    se_sueltan: { movimientos: number; compromisos: number; archivos: number };
    se_van: Array<{ id: string; clave: string | null; nombre: string; monto: number; piezas: number }>;
    se_quedan: Array<{ id: string; clave: string | null; nombre: string; monto: number; porque: string[] }>;
    piezas_sin_item: number; venta_antes: number; venta_despues: number;
  } | { error: string; detalle?: unknown }>;

  /** cost101 (0.81.0). ¿Esa clave ya es de otro renglón de la tabla? */
  claveOcupada(tabla: 'costos_base' | 'cuadrillas' | 'productos', clave: string, excepto?: string | null): Promise<boolean>;
  /** Quién usa este costo base, cuadrilla o producto dentro de otra receta. */
  usosEnCostos(tabla: 'costos_base' | 'cuadrillas' | 'productos', id: string): Promise<Array<{ que: 'cuadrilla' | 'producto'; id: string; clave: string; nombre: string }>>;
  /** Que cada `ref` de la receta exista y que no se muerda la cola. */
  revisarApu(apu: unknown, producto_id: string | null): Promise<{ ok: true; apu: Record<string, unknown> } | { ok: false; errores: Record<string, string> }>;
  /** Que cada miembro de la cuadrilla sea un oficio (`mo`) que existe. */
  revisarMiembros(miembros: Array<{ ref: string; cant: number }>): Promise<Record<string, string> | null>;
  /** La carga en bloque de cost101 (la semilla): idempotente por clave. */
  importarCostos(args: ImportarCostos): Promise<ResultadoImportarCostos>;

  fetch(req: Request): Promise<Response>;
}

/** Lo que manda `POST /orgs/:o/costos/importar`. `ref` es el nombre que cada
 *  renglón trae en el archivo; las recetas y las cuadrillas se apuntan entre
 *  sí con él, y aquí se cambia por el id de verdad. */
export interface ImportarCostos {
  costos?: Array<{ ref: string; clave?: string; nombre: string; tipo: string; unidad?: string; precio: number; categoria?: string; historial?: Array<{ f: string; precio: number }> }>;
  cuadrillas?: Array<{ ref: string; clave?: string; nombre: string; categoria?: string; horas?: number; miembros: Array<{ ref: string; cant: number }> }>;
  productos?: Array<{ ref: string; codigo?: string; nombre: string; descripcion?: string; tipo?: string; unidad?: string; categoria?: string; estado?: string; apu: unknown }>;
  usuario_id: string;
}
export type ResultadoImportarCostos =
  | { ok: true; nuevos: { costos: number; cuadrillas: number; productos: number }; ya_estaban: { costos: number; cuadrillas: number; productos: number } }
  | { ok: false; error: string; detalle?: unknown };

/* ─────────────── quell101 sobre el SqlStorage ───────────────
 * El motor de quell101 (src/quell/motor.js) habla D1: prepare · bind · first ·
 * all · run · batch. El SqlStorage del Durable Object habla `exec(sql, ...args)`
 * y devuelve un cursor. Esto es la traducción, y es lo único que cambió del
 * motor al mudarse: las consultas son las mismas. */
export function baseSobreSql(sql: SqlStorage): BaseQuell {
  const arma = (q: string, args: unknown[]) => ({
    async first() {
      const filas = sql.exec(q, ...(args as SqlStorageValue[])).toArray();
      return filas.length ? filas[0] : null;
    },
    async all() { return { results: sql.exec(q, ...(args as SqlStorageValue[])).toArray() }; },
    async run() {
      const cursor = sql.exec(q, ...(args as SqlStorageValue[]));
      cursor.toArray();
      return { success: true, meta: { changes: cursor.rowsWritten } };
    },
  });
  return {
    prepare(q: string) { const sin = arma(q, []); return { ...sin, bind: (...args: unknown[]) => arma(q, args) }; },
    async batch(stmts) { const out: unknown[] = []; for (const st of stmts) out.push(await st.run()); return out; },
  };
}

/** Una cabecera que viajó codificada (encodeURIComponent) del Worker al
 *  objeto, porque una cabecera sólo lleva ASCII. Tolera la forma vieja. */
function cabeceraJson<T>(valor: string | null, siNo: T): T {
  if (!valor) return siNo;
  let texto = valor;
  try { texto = decodeURIComponent(valor); } catch { /* venía sin codificar */ }
  try { return JSON.parse(texto) as T; } catch { return siNo; }
}

/** Las tablas de roster101 (0007) en el orden en que se pueden insertar. Los
 *  códigos de acceso se cuentan pero no se mudan: valen diez minutos. */
export const TABLAS_ROSTER = [
  'roster_trabajadores', 'roster_documentos', 'roster_consentimientos', 'roster_papelera', 'roster_bitacora',
  'roster_administradores', 'roster_codigos',
] as const;

/** El bucket de la suite con el prefijo de una app dentro de una empresa:
 *  el motor de roster101 guarda llaves relativas (`trabajadores/{id}/…`) y
 *  todas caen bajo `orgs/{org}/roster/`. */
function bucketConPrefijo(b: R2Bucket, prefijo: string) {
  return {
    get: (k: string) => b.get(prefijo + k),
    head: (k: string) => b.head(prefijo + k),
    put: (k: string, cuerpo: ArrayBuffer | Uint8Array | ReadableStream, o?: R2PutOptions) => b.put(prefijo + k, cuerpo as ArrayBuffer, o),
    delete: (k: string) => b.delete(prefijo + k),
  };
}

/** Las tablas de quell101 en el orden en que se pueden insertar (las llaves
 *  foráneas apuntan hacia arriba). La mudanza y el conteo las recorren así. */
export const TABLAS_QUELL = [
  'quell_users', 'quell_projects', 'quell_project_members', 'quell_plans', 'quell_elements', 'quell_log_entries',
  'quell_punch_items', 'quell_photos', 'quell_operaciones', 'quell_etapas', 'quell_element_etapas', 'quell_dudas',
  'quell_duda_respuestas', 'quell_element_contratistas',
] as const;

/** Lo que devuelve una corrida del importador. Todo son números medidos
 *  dentro del SQLite, no lo que el importador creyó escribir. */
export interface Importacion {
  antes: Record<string, number>;
  despues: Record<string, number>;
  nuevas: Record<string, number>;
  actualizadas: Record<string, number>;
  fallos: Array<{ tabla: string; id: string; motivo: string }>;
  /** Toda la plata que hay en la base, en centavos. Informativo. */
  sumas: Record<string, number>;
  /** La plata SOLO de las filas que trajo esta corrida, leída de la base
   *  después de escribir. Es contra esto que se compara lo convertido: el
   *  total de la tabla no sirve, porque a la segunda corrida ya está adentro
   *  y compararlo contra lo convertido lo contaría dos veces. */
  sumas_importadas: Record<string, number>;
  /** Tres ids por tabla, releídos de la base: sirven para enseñar que son los mismos. */
  muestra: Array<{ tabla: string; id: string }>;
  enlaces: { movimientos_con_item: number; item_que_no_existe: string[] };
  proyectos_recalculados: number;
  /** Cotizaciones que llegaron sin folio y se fueron con uno. La mudanza de
   *  quote101 trae muchas así: la app nunca les puso número. */
  folios_asignados: number;
}

export class OrgDB extends DurableObject<Env> {
  sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.migrar();
      await this.correrPendientes();
    });
  }

  /* ─────────────── lo que una migración deja pendiente (0036) ───────────────
   *
   * Una migración corre síncrona; hay arreglos que necesitan el motor de
   * quell101, que es asíncrono. La migración anota el pendiente en
   * `pendientes_arranque` y aquí se corre, una vez, al arrancar la empresa. Si
   * truena, se queda pendiente y se reintenta al siguiente arranque: un
   * arreglo fallido nunca debe dejar a la empresa sin abrir. */
  async correrPendientes(): Promise<void> {
    let pendientes: Fila[] = [];
    try {
      pendientes = this.sql.exec(`SELECT clave FROM pendientes_arranque WHERE hecho_at IS NULL ORDER BY creado_at, rowid`).toArray() as Fila[];
    } catch {
      return; // una base sin la 0036 todavía: nada pendiente
    }
    for (const p of pendientes) {
      try {
        let resultado: unknown = null;
        const entornoQuell = {
          DB: baseSobreSql(this.sql),
          RECALCULAR_PROYECTO: async (id: string) => { this.recalcularProyecto(id); },
        };
        if (p.clave === 'poblar_costos_default') resultado = await poblarCostosDefault(entornoQuell);
        else if (p.clave === 'tiempos_default') resultado = await ponerTiemposDefault(entornoQuell);
        this.sql.exec(`UPDATE pendientes_arranque SET hecho_at = ?, resultado = ? WHERE clave = ?`, new Date().toISOString(), JSON.stringify(resultado), String(p.clave));
      } catch (e) {
        console.error('pendiente', p.clave, e);
      }
    }
  }

  /* ─────────────── migraciones ───────────────
   * El documento decía `PRAGMA user_version`. Se usa una tabla en su lugar:
   * el SQLite del Durable Object no expone ese pragma para escritura, y una
   * tabla además deja fecha de cuándo corrió cada una. */
  /** `hasta` es sólo para las pruebas: arma una base como la tenía una
   *  empresa en esa versión —con las migraciones en código incluidas— para
   *  medir la siguiente sobre datos de verdad. El DO siempre llega al final. */
  private migrar(hasta = MIGRACIONES.length): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS _migraciones (version INTEGER PRIMARY KEY, aplicada_at TEXT NOT NULL)`);
    const fila = this.sql.exec(`SELECT MAX(version) AS v FROM _migraciones`).one() as { v: number | null };
    const desde = fila?.v ?? 0;
    for (let i = desde; i < Math.min(hasta, MIGRACIONES.length); i++) {
      if (EN_CODIGO[i]) this[EN_CODIGO[i]]();
      else this.sql.exec(MIGRACIONES[i]);
      this.sql.exec(`INSERT INTO _migraciones (version, aplicada_at) VALUES (?, ?)`, i + 1, new Date().toISOString());
    }
  }

  /* ─────────────── 0027: se va «negocio» (corre en código) ───────────────
   *
   * Mike, 1-oct-2026: «Ya no existe la opción de negocios. Sólo es una
   * empresa/negocio todo. Elimina todas las lógicas que involucran el
   * concepto de "negocio"».
   *
   * Lo que hace, en orden, y por qué así:
   *   1. Si hay más de un negocio, todo pasa al PRIMERO POR NOMBRE —la misma
   *      regla que usaban la API, dash101 y las pruebas desde la fase B— y
   *      los demás se borran (`fusionarEnUno`). Los renglones huérfanos, los
   *      que apuntaban a un negocio ya borrado (el defecto del 23-sep), se
   *      adoptan igual: ya no hay a qué pertenecer más que a la empresa.
   *   2. Nace `empresa`, un solo renglón, con nombre, RFC, moneda y día de
   *      conciliación del negocio que quedó. Si no había ninguno, queda
   *      vacía y la crea la primera ruta que la pida con el nombre de la org.
   *   3. A cada tabla con `negocio_id` se le quita. Las que lo llevaban con
   *      `REFERENCES negocios` (cuentas, conciliaciones, rayas, accionistas)
   *      no admiten DROP COLUMN —SQLite no tira una columna con llave
   *      foránea— y se reconstruyen (ver abajo). A las otras, DROP COLUMN,
   *      tirando antes los índices que la traían. Los índices que llevaban
   *      `negocio_id` se vuelven a crear sin él.
   *   4. DROP TABLE negocios.
   *
   * LA RECONSTRUCCIÓN Y LAS LLAVES FORÁNEAS. `cuentas` es padre de
   * `movimientos`, `conciliacion_cuentas` y `rayas`; `conciliaciones` de
   * `conciliacion_cuentas`; `rayas` de `raya_pagos`. Tirar un padre con
   * hijos colgados viola la llave. En el SQLite del Durable Object
   * `PRAGMA foreign_keys = OFF` cambia el valor pero NO evita la revisión:
   * workerd revisa las llaves al cerrar y, si quedaron violadas, resetea el
   * objeto entero (medido el 1-oct-2026 con una prueba de sondeo). Lo que sí
   * obedece es `PRAGMA defer_foreign_keys = ON` dentro de una transacción:
   * las violaciones se cuentan y se cobran al cerrar. Con ese contador en
   * mente el orden es: copiar las filas a `t__copia`, DROP TABLE t (el
   * contador sube por cada hijo que se queda sin padre), CREATE TABLE t sin
   * la columna, INSERT desde la copia (insertar un padre que los hijos ya
   * esperaban BAJA el contador por cada uno), y la cuenta queda en cero. Se
   * mide: `PRAGMA foreign_key_check` sale vacío después. Todo dentro de
   * `transactionSync`, así que una tabla se reconstruye entera o no se toca.
   *
   * Es idempotente: cada paso mira `sqlite_master` antes de hacer nada, así
   * que una corrida que se quedó a medias se termina en la siguiente. Y
   * corre igual sobre una base recién nacida (`vaciar()` aplica todo desde
   * cero): ahí no hay negocios, no hay filas, y sólo quita columnas. */
  private quitarNegocios(): void {
    const hayTabla = (n: string): boolean =>
      this.sql.exec(`SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?`, n).toArray().length > 0;

    if (hayTabla('negocios')) {
      const primero = this.sql.exec(`SELECT id FROM negocios ORDER BY nombre LIMIT 1`).toArray()[0] as Fila | undefined;
      if (primero) this.fusionarEnUno(String(primero.id));
      else this.juntarProductosRepetidos(null);
    }

    this.sql.exec(SQL_EMPRESA);
    if (hayTabla('negocios')) {
      this.sql.exec(
        `INSERT OR IGNORE INTO empresa (id, nombre, rfc, moneda, dia_conciliacion, creado_at)
         SELECT 'empresa', nombre, rfc, moneda, dia_conciliacion, creado_at FROM negocios ORDER BY nombre LIMIT 1`,
      );
    }

    const tablas = this.sql
      .exec(`SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name <> 'negocios' AND name NOT LIKE 'sqlite_%' AND sql LIKE '%negocio_id%' ORDER BY name`)
      .toArray() as Array<{ name: string; sql: string }>;
    for (const { name: t, sql } of tablas) {
      this.ctx.storage.transactionSync(() => {
        const indices = this.sql
          .exec(`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`, t)
          .toArray() as Array<{ name: string; sql: string }>;
        for (const i of indices) if (/negocio_id/.test(i.sql)) this.sql.exec(`DROP INDEX IF EXISTS "${i.name}"`);
        if (/REFERENCES\s+negocios/i.test(sql)) {
          const columnas = (this.sql.exec(`PRAGMA table_info("${t}")`).toArray() as Fila[])
            .map((c) => String(c.name)).filter((c) => c !== 'negocio_id');
          const lista = columnas.map((c) => `"${c}"`).join(', ');
          this.sql.exec(`PRAGMA defer_foreign_keys = ON`);
          this.sql.exec(`DROP TABLE IF EXISTS "${t}__copia"`);
          this.sql.exec(`CREATE TABLE "${t}__copia" AS SELECT ${lista} FROM "${t}"`);
          this.sql.exec(`DROP TABLE "${t}"`);
          this.sql.exec(createSinColumna(sql, 'negocio_id', t));
          this.sql.exec(`INSERT INTO "${t}" (${lista}) SELECT ${lista} FROM "${t}__copia"`);
          this.sql.exec(`DROP TABLE "${t}__copia"`);
          // Los índices que no traían la columna se fueron con el DROP: otra vez.
          for (const i of indices) if (!/negocio_id/.test(i.sql)) this.sql.exec(i.sql);
        } else {
          this.sql.exec(`ALTER TABLE "${t}" DROP COLUMN negocio_id`);
        }
      });
      /* El diferido se queda prendido hasta que cierre la transacción de
       * afuera (la del despertar del objeto): se apaga aquí para que lo que
       * siga —en esta misma llamada— vuelva a tronar en el momento. */
      this.sql.exec(`PRAGMA defer_foreign_keys = OFF`);
    }
    for (const sql of INDICES_SIN_NEGOCIO) this.sql.exec(sql);
    this.sql.exec(`DROP TABLE IF EXISTS negocios`);
  }

  /** Todo lo de los demás negocios pasa al que se queda y los demás se
   *  borran. Era `fusionarNegocios` (0.50.0, `POST /negocios/fusionar`);
   *  desde 0.63.0 sólo la llama la migración 0027. Las tablas se descubren
   *  del esquema, no de una lista a mano. */
  private fusionarEnUno(queda_id: string): void {
    const tablas = (this.sql
      .exec(`SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'negocios' AND name NOT LIKE 'sqlite_%' AND sql LIKE '%negocio_id%' ORDER BY name`)
      .toArray() as Fila[]).map((t) => String(t.name));
    this.ctx.storage.transactionSync(() => {
      this.juntarProductosRepetidos(queda_id);
      for (const t of tablas) this.sql.exec(`UPDATE "${t}" SET negocio_id = ? WHERE negocio_id <> ?`, queda_id, queda_id);
      this.sql.exec(`DELETE FROM negocios WHERE id <> ?`, queda_id);
    });
  }

  /** El código del producto era único POR NEGOCIO: dos negocios podían tener
   *  cada uno su «PT-STD». Al juntarlos queda uno —el del negocio que se
   *  queda si lo tiene, si no el más viejo—, sus piezas pasan a apuntarle y
   *  el repetido se borra. Sin esto el índice único de 0027 no se puede
   *  crear. Corre también sin negocio (`preferido` nulo): renglones
   *  huérfanos de dos negocios borrados pueden repetir código igual. */
  private juntarProductosRepetidos(preferido: string | null): void {
    if (!this.sql.exec(`SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'productos'`).toArray().length) return;
    const repetidos = this.sql
      .exec(`SELECT codigo FROM productos WHERE codigo <> '' GROUP BY codigo HAVING COUNT(*) > 1`)
      .toArray() as Fila[];
    // En una corrida que se quedó a medias la columna ya puede no estar.
    const conColumna = (this.sql.exec(`PRAGMA table_info("productos")`).toArray() as Fila[]).some((c) => c.name === 'negocio_id');
    for (const r of repetidos) {
      const filas = conColumna
        ? this.sql.exec(`SELECT id FROM productos WHERE codigo = ? ORDER BY (negocio_id = ?) DESC, creado_at, id`, String(r.codigo), preferido ?? '').toArray() as Fila[]
        : this.sql.exec(`SELECT id FROM productos WHERE codigo = ? ORDER BY creado_at, id`, String(r.codigo)).toArray() as Fila[];
      const queda = String(filas[0].id);
      for (const f of filas.slice(1)) {
        this.sql.exec(`UPDATE items SET producto_id = ? WHERE producto_id = ?`, queda, String(f.id));
        this.sql.exec(`DELETE FROM productos WHERE id = ?`, String(f.id));
      }
    }
  }

  /** Las tablas y sus columnas, como las ve SQLite. */
  esquema(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const t of this.sql.exec(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).toArray() as Fila[]) {
      out[String(t.name)] = (this.sql.exec(`PRAGMA table_info("${String(t.name)}")`).toArray() as Fila[]).map((c) => String(c.name));
    }
    return out;
  }

  /** Borra todo lo que hay en el SQLite de esta empresa y lo deja como recién
   *  nacido: tablas vacías y las migraciones aplicadas. Para resembrar la org
   *  demo de staging; la ruta que lo llama no existe en producción. */
  async vaciar(): Promise<number> {
    // La alarma del SAT no se va con `deleteAll`: se quita aparte, o la base
    // vacía seguiría despertándose a buscar una FIEL que ya no está.
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.migrar();
    return this.version();
  }

  version(): number {
    const f = this.sql.exec(`SELECT MAX(version) AS v FROM _migraciones`).one() as { v: number | null };
    return f?.v ?? 0;
  }

  /* ─────────────── conversión de filas ───────────────
   * SQLite no tiene booleanos ni JSON: guarda 0/1 y texto. Hacia afuera se
   * devuelve lo que la app espera, para que ninguna tenga que acordarse. */

  private afuera(tabla: Tabla, fila: Fila | null): Fila | null {
    if (!fila) return null;
    const cols = DEFS[tabla].cols;
    const out: Fila = {};
    for (const [k, v] of Object.entries(fila)) {
      const t = cols[k] as Tipo | undefined;
      if (t === 'json') {
        /* 0.81.0 · En `productos`, la receta que no existe es NULL y tiene
         * que salir null, no `{}`: «¿tiene receta?» se pregunta con `!p.apu`
         * en media docena de lugares, y un objeto vacío diría que sí. */
        if ((v === null || v === undefined) && (k === 'apu' || k === 'desglose')) { out[k] = null; continue; }
        try {
          out[k] = JSON.parse(String(v ?? (k === 'asignados' || k === 'etapas_permitidas' || k === 'historial' || k === 'miembros' ? '[]' : '{}')));
        } catch {
          out[k] = null;
        }
      } else if (t === 'bool') out[k] = !!v;
      else out[k] = v;
    }
    /* EL ALCANCE VIAJA CALCULADO, no como dos columnas para que cada
     * pantalla lo deduzca.
     *
     * Mike, 20-sep: «para que un ítem se considere cancelado tiene que haber
     * estado aprobado primero». La regla sale de `estado` y `aprobado_at`, y
     * si cada app la aplica por su cuenta hay tantas reglas como apps —y la
     * que se quede atrás va a ser la que nadie mire—. Así la dice el
     * servidor una vez y las tres la leen. No es columna: no se guarda, se
     * calcula al salir, y por eso no se puede escribir desde fuera. */
    if (tabla === 'items') out.alcance = alcanceDeItem(out as { estado?: string });
    return out;
  }

  private adentro(tipo: Tipo, v: unknown): unknown {
    if (v === undefined) return null;
    if (tipo === 'json') return JSON.stringify(v ?? null);
    if (tipo === 'bool') return v ? 1 : 0;
    if (tipo === 'dinero' || tipo === 'entero') return v === null ? null : Math.trunc(Number(v));
    if (tipo === 'real') return v === null ? null : Number(v);
    return v === null ? null : String(v);
  }

  /* ─────────────── CRUD genérico ─────────────── */

  listar(
    tabla: Tabla,
    filtros: Record<string, string> = {},
    sujeto?: Sujeto,
    limite = 500,
  ): { total: number; filas: Fila[] } {
    const def: Def = DEFS[tabla];
    const donde: string[] = [];
    const args: unknown[] = [];

    for (const f of def.filtros) {
      if (filtros[f] !== undefined && filtros[f] !== '') {
        donde.push(`${f} = ?`);
        args.push(def.cols[f] === 'bool' ? (filtros[f] === 'true' || filtros[f] === '1' ? 1 : 0) : filtros[f]);
      }
    }
    if (def.fecha) {
      if (filtros.desde) { donde.push(`${def.fecha} >= ?`); args.push(filtros.desde); }
      if (filtros.hasta) { donde.push(`${def.fecha} <= ?`); args.push(filtros.hasta); }
    }
    // Un cliente jamás llega hasta aquí: desde el 12-sep la ruta le contesta
    // 403 antes (puedeLeer). Esto se queda como segunda cerradura: si algún
    // día una ruta nueva se olvida de preguntar, lo peor que ve es lo suyo.
    if (sujeto?.clase === 'cliente') {
      if (tabla === 'items' || tabla === 'proyectos') { donde.push(`cliente_id = ?`); args.push(sujeto.ref_id ?? '—'); }
      else if (tabla === 'clientes') { donde.push(`id = ?`); args.push(sujeto.ref_id ?? '—'); }
    }

    const w = donde.length ? ` WHERE ${donde.join(' AND ')}` : '';
    const total = (this.sql.exec(`SELECT COUNT(*) AS n FROM ${tabla}${w}`, ...args).one() as { n: number }).n;
    const filas = this.sql
      .exec(`SELECT * FROM ${tabla}${w} ORDER BY ${def.orden} LIMIT ?`, ...args, limite)
      .toArray() as Fila[];
    return { total, filas: this.conSaldo(tabla, filas).map((f) => this.afuera(tabla, f)!) };
  }

  /** LA EMPRESA ES UNA. Mike, 1-oct-2026: «Ya no existe la opción de
   *  negocios en dash. Sólo es una empresa/negocio todo. Elimina todas las
   *  lógicas que involucran el concepto de "negocio"». Desde 0.63.0 es el
   *  único renglón de `empresa` (0027): nombre, RFC, moneda y día de
   *  conciliación. Si todavía no existe —una org recién nacida— se crea con
   *  el nombre que se pase, que es el de la org en el D1, y moneda MXN (o la
   *  que se diga: el compat de `POST /negocios` la trae). */
  empresa(nombre: string, moneda: 'MXN' | 'USD' = 'MXN'): Fila {
    const hay = this.sql.exec(`SELECT * FROM empresa WHERE id = 'empresa'`).toArray()[0] as Fila | undefined;
    if (hay) return hay;
    this.sql.exec(
      `INSERT INTO empresa (id, nombre, rfc, moneda, dia_conciliacion, creado_at) VALUES ('empresa', ?, NULL, ?, 1, ?)`,
      nombre.trim() || 'Mi empresa', moneda, ahora(),
    );
    return this.sql.exec(`SELECT * FROM empresa WHERE id = 'empresa'`).toArray()[0] as Fila;
  }

  /** Cambia lo que venga de nombre, rfc, moneda y dia_conciliacion; lo
   *  demás se queda. Lo que es válido lo decide la ruta (PATCH /empresa). */
  actualizarEmpresa(datos: Fila): Fila {
    const antes = this.empresa(String(datos.nombre ?? ''));
    // 0.80.0: también correo, teléfono, sitio web, dirección y el logotipo.
    const cols = ['nombre', 'rfc', 'moneda', 'dia_conciliacion', 'correo', 'telefono', 'sitio_web', 'direccion', 'logo_llave', 'logo_at'].filter((c) => datos[c] !== undefined);
    if (cols.length) {
      this.sql.exec(
        `UPDATE empresa SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = 'empresa'`,
        ...cols.map((c) => (datos[c] === null ? null : c === 'dia_conciliacion' ? Math.trunc(Number(datos[c])) : String(datos[c]))),
      );
    }
    return cols.length ? (this.sql.exec(`SELECT * FROM empresa WHERE id = 'empresa'`).toArray()[0] as Fila) : antes;
  }

  obtener(tabla: Tabla, id: string): Fila | null {
    const f = this.sql.exec(`SELECT * FROM ${tabla} WHERE id = ?`, id).toArray()[0] as Fila | undefined;
    return this.afuera(tabla, f ? this.conSaldo(tabla, [f])[0] : null);
  }

  /** EL SALDO DE CADA CUENTA LO SUMA LA BASE, no la pantalla (0.60.0).
   *
   *  Hasta el 1-oct-2026 `cuentas` salía con su `saldo_inicial` y dash101
   *  sumaba los movimientos que le llegaban de la lista. La lista tiene tope
   *  de 500 y salía de la más vieja a la más nueva: en cuanto un negocio
   *  pasó de 500 movimientos, los últimos egresos ya no entraban a la suma y
   *  el capital líquido se quedó quieto (Mike: «ya hay movimientos por más
   *  de 70,000 de egresos y el total sigue sin contarlos»).
   *
   *  Aquí es `saldo_inicial` más TODOS los ingresos de la cuenta menos TODOS
   *  sus egresos, en una sola consulta agrupada; no depende de cuántos
   *  movimientos haya ni de cuántos se enseñen. Es columna calculada, como
   *  `alcance` en los ítems: no se guarda y no se escribe desde fuera. */
  private conSaldo(tabla: Tabla, filas: Fila[]): Fila[] {
    if (tabla !== 'cuentas' || !filas.length) return filas;
    const deltas = new Map<string, number>();
    for (const r of this.sql
      .exec(`SELECT cuenta_id, SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END) AS delta
             FROM movimientos WHERE cuenta_id IS NOT NULL GROUP BY cuenta_id`)
      .toArray() as Array<{ cuenta_id: string; delta: number }>) {
      deltas.set(String(r.cuenta_id), Number(r.delta || 0));
    }
    return filas.map((f) => ({ ...f, saldo: Number(f.saldo_inicial || 0) + (deltas.get(String(f.id)) ?? 0) }));
  }

  /* ─────────────── el folio de la cotización ───────────────
   * Se asigna AQUÍ, dentro del Durable Object, y por eso es atómico sin
   * transacciones: un solo hilo por empresa, así que «leer, sumar uno,
   * guardar» no se puede entrelazar con otra ejecución. Es la respuesta de
   * verdad a «dos personas cotizando a la vez», y es más fuerte que una
   * transacción, porque no depende de que esté bien escrita.
   *
   * Formato: `COT-` y seis dígitos. Lo decidió Mike el 16-sep —consecutivo
   * corrido, sin año— porque quiere que el número diga cuántas cotizaciones
   * llevan en total.
   *
   * El candado del `while`: los 39 folios que traerá la mudanza son números
   * derivados de 008406 a 874280, y ninguno baja de 1000, así que la cuenta
   * nueva tiene 8,366 de margen. Aun así se comprueba, porque cuesta una
   * consulta con índice y cubre el día que se importe el histórico de otro
   * cliente. Hoy no se dispara nunca.
   */
  private siguienteFolio(serie = 'COT'): string {
    for (;;) {
      const folio = `${serie}-${String(this.apartarNumero(serie)).padStart(6, '0')}`;
      const ocupado = this.sql.exec(`SELECT 1 AS x FROM cotizaciones WHERE folio = ? LIMIT 1`, folio).toArray()[0];
      if (!ocupado) return folio;
    }
  }

  /** Aparta el siguiente número de una serie y lo devuelve. El contador queda
   *  ya avanzado: quien lo pidió se lo llevó, aunque después no lo use.
   *
   *  Es el mismo mecanismo del folio, y es lo que hace falta para CUALQUIER
   *  consecutivo: el de los recibos de quote101 vivía en Firestore con la
   *  cuenta hecha en el navegador —leer, sumar uno, guardar— y ahí dos
   *  personas guardando a la vez se llevan el mismo número. Aquí no puede
   *  pasar: un solo hilo por empresa.
   *
   *  Un número apartado NO se devuelve si el recibo no se acaba imprimiendo.
   *  Eso deja huecos en la numeración, y es lo correcto: un consecutivo que
   *  reusa números es un consecutivo que puede repetir. Un hueco se explica;
   *  dos recibos con el mismo número, no. */
  apartarNumero(serie: string): number {
    const fila = this.sql.exec(`SELECT siguiente FROM folios WHERE serie = ?`, serie).toArray()[0] as
      { siguiente: number } | undefined;
    const n = fila?.siguiente ?? 1;
    this.sql.exec(
      `INSERT INTO folios (serie, siguiente) VALUES (?,?) ON CONFLICT(serie) DO UPDATE SET siguiente = excluded.siguiente`,
      serie, n + 1,
    );
    return n;
  }

  /** Mira el siguiente número sin apartarlo. Para enseñarlo en una pantalla
   *  antes de que el usuario confirme: si se apartara al abrir la pantalla,
   *  cada vez que alguien se asomara y cerrara se iría un número. */
  verNumero(serie: string): number {
    const fila = this.sql.exec(`SELECT siguiente FROM folios WHERE serie = ?`, serie).toArray()[0] as
      { siguiente: number } | undefined;
    return fila?.siguiente ?? 1;
  }

  /** Deja el contador en un número dado. La usa la mudanza de la fase 4 para
   *  dejarlo justo después de lo que acabó de importar. */
  fijarFolio(siguiente: number, serie = 'COT'): number {
    const n = Math.max(1, Math.floor(siguiente));
    this.sql.exec(
      `INSERT INTO folios (serie, siguiente) VALUES (?,?) ON CONFLICT(serie) DO UPDATE SET siguiente = excluded.siguiente`,
      serie, n,
    );
    return n;
  }

  crear(tabla: Tabla, datos: Fila, contexto: ContextoEscritura): Fila {
    const def = DEFS[tabla];
    const fila: Fila = { ...datos };

    fila.id = (datos.id as string) || ulid();

    /* El folio no lo pone la app. Lo pone la suite, y una sola vez.
     *
     * La única excepción es `suite101`, que es con la que entra la mudanza de
     * la fase 4: ésa trae los folios viejos ya congelados y hay que
     * respetarlos, porque son los que andan impresos en los PDFs de los
     * clientes. Cualquier otra app que mande un folio se lo ignora: si se
     * dejara pasar, el navegador volvería a decidir el folio y estaríamos en
     * el problema del que venimos. */
    if (tabla === 'cotizaciones') {
      const traido = String(datos.folio ?? '').trim();
      fila.folio = contexto.app === 'suite101' && traido ? traido : this.siguienteFolio();
    }
    /* El ajuste es de la app que lo escribe, y su `id` se calcula: `app:clave`.
     *
     * Ni el `id` ni el `app` vienen de fuera, aunque los manden: si una app
     * pudiera elegir su id, podría escribir `cotizador101:precios` desde otra
     * app y pisarle la lista de precios. Con el id armado aquí, el candado no
     * depende de que ninguna ruta se acuerde de revisar. */
    if (tabla === 'ajustes') {
      fila.app = contexto.app;
      fila.clave = String(datos.clave ?? '').trim();
      fila.id = `${contexto.app}:${fila.clave}`;
      fila.actualizado_at = ahora();
    }
    /* Un ítem que nace VENDIDO nace aprobado. `aprobado_at` es lo único que
     * distingue después un cancelado —estuvo aprobado— de un descartado
     * —nunca lo estuvo—, que es la regla que puso Mike el 20-sep, y si no se
     * escribe en el momento ya no hay de dónde sacarla. */
    if (tabla === 'items') {
      // 0.64.0: 'cancelado' ya no se escribe; es fuera del alcance, o sea cotizado.
      if (String(fila.estado ?? '') === 'cancelado') fila.estado = 'cotizado';
      if (String(fila.estado ?? 'cotizado') === 'vendido' && !fila.aprobado_at) fila.aprobado_at = ahora();
    }
    /* 0.81.0 · cost101. La clave que no viene la pone la base; el historial
     * de un costo nace con su precio de alta; y un producto con receta nace
     * en borrador si nadie dijo otra cosa, con el precio en cero hasta que
     * `despuesDeCostos` haga la cuenta dos renglones abajo. */
    if (tabla === 'costos_base') {
      const tipo = String(fila.tipo ?? 'material');
      fila.clave = String(fila.clave ?? '').trim() || this.siguienteClave('costos_base', 'clave', tipo === 'mo' ? 'MO-' : tipo === 'equipo' ? 'EQ-' : 'MAT-', 3);
      /* 8-oct-2026 · la mano de obra va por hora o por unidad (destajo); el
       * equipo, por hora siempre. */
      if (tipo === 'equipo') fila.unidad = 'h';
      fila.unidad = String(fila.unidad ?? '').trim() || (tipo === 'mo' ? 'h' : 'pza');
      fila.precio = Math.max(0, Math.trunc(Number(fila.precio ?? 0)) || 0);
      fila.categoria = String(fila.categoria ?? '').trim();
      if (!Array.isArray(fila.historial)) fila.historial = [{ f: hoyMx(), precio: fila.precio }];
    }
    if (tabla === 'cuadrillas') {
      fila.clave = String(fila.clave ?? '').trim() || this.siguienteClave('cuadrillas', 'clave', 'CUA-', 2);
      fila.horas = Number(fila.horas) > 0 ? Number(fila.horas) : 8;
      fila.categoria = String(fila.categoria ?? '').trim();
      if (!Array.isArray(fila.miembros)) fila.miembros = [];
    }
    if (tabla === 'productos' && fila.apu) {
      fila.codigo = String(fila.codigo ?? '').trim() || this.siguienteClave('productos', 'codigo', 'PAR-', 3);
      fila.estado = fila.estado === 'aprobado' ? 'aprobado' : 'borrador';
      fila.tipo = String(fila.tipo ?? '').trim() || 'servicio';
      fila.moneda = String(fila.moneda ?? '').trim() || 'MXN';
      fila.precio = 0;
      fila.desglose = null;
      fila.historial = [];
    }
    if (def.cols.creado_at) fila.creado_at = ahora();
    if (def.cols.ts && !fila.ts) fila.ts = ahora();
    if (def.cols.creado_por) fila.creado_por = contexto.usuario_id;
    if (def.cols.creado_en_app) fila.creado_en_app = contexto.app;
    if (def.cols.nombre_norm) fila.nombre_norm = normalizar(datos.nombre_norm ?? datos.nombre);

    const cols = Object.keys(fila).filter((c) => c in def.cols);
    const valores = cols.map((c) => this.adentro(def.cols[c], fila[c]));
    /* Guardar un ajuste es un solo POST: su id se calcula, así que el segundo
     * POST con la misma clave no es un choque, es la misma gaveta otra vez. Sin
     * esto la app tendría que preguntar antes si existía, y dos pestañas
     * guardando a la vez se llevarían un 409 por turnarse mal. */
    const choque = tabla === 'ajustes'
      ? ' ON CONFLICT(id) DO UPDATE SET valor = excluded.valor, actualizado_at = excluded.actualizado_at'
      : '';
    this.sql.exec(
      `INSERT INTO ${tabla} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})${choque}`,
      ...valores,
    );

    this.despuesDeEscribir(tabla, fila.id as string);
    this.despuesDeCostos(tabla, fila.id as string, null);
    // Un ítem que nace vendido entra al alcance al nacer: queda en la bitácora.
    if (tabla === 'items' && String(fila.estado ?? 'cotizado') === 'vendido') {
      this.anotarAlcance(String(fila.id), (fila.proyecto_id as string | null) ?? null, 'entra', contexto, null);
    }
    return this.obtener(tabla, fila.id as string)!;
  }

  actualizar(tabla: Tabla, id: string, datos: Fila, contexto: Partial<ContextoEscritura> = {}): Fila | null {
    const def = DEFS[tabla];
    const cols = Object.keys(datos).filter((c) => c in def.cols && c !== 'id');
    if (!cols.length) return this.obtener(tabla, id);
    /* El precio de ANTES, para poder contarlo en la bitácora de la obra. Se
     * lee aquí y no después porque después ya no existe: un `UPDATE` no deja
     * copia. Sólo cuando de verdad viene un monto nuevo, para no pagar una
     * lectura en cada cambio de nombre. */
    const montoAntes =
      tabla === 'items' && datos.monto !== undefined
        ? (this.sql.exec(`SELECT monto FROM items WHERE id = ?`, id).toArray()[0] as Fila | undefined)?.monto
        : undefined;
    if (def.cols.nombre_norm && datos.nombre !== undefined && datos.nombre_norm === undefined) {
      cols.push('nombre_norm');
      datos.nombre_norm = normalizar(datos.nombre);
    }
    /* Las dos fechas del alcance, puestas AQUÍ y no en la ruta: por el CRUD
     * genérico también se cambia el estado —la pantalla del proyecto cancela
     * un renglón al quitarlo—, y una regla que sólo vive en una ruta es una
     * regla que la otra puerta no cumple.
     *
     * `aprobado_at` se pone la primera vez que el ítem queda vendido y ya no
     * se borra: que un ítem se cancele no borra que estuvo aprobado, y eso
     * es justo lo que hay que recordar. */
    let mueveAlcance: 'entra' | 'sale' | null = null;
    let proyectoDelItem: string | null = null;
    if (tabla === 'items' && datos.estado !== undefined) {
      const antes = this.sql.exec(`SELECT estado, aprobado_at, cancelado_at, proyecto_id FROM items WHERE id = ?`, id).toArray()[0] as Fila | undefined;
      proyectoDelItem = (antes?.proyecto_id as string | null) ?? null;
      /* 0.64.0 · dos estados. 'cancelado' ya no se escribe: lo que llega así
       * —la pantalla del proyecto al quitar un renglón, una app vieja— es
       * fuera del alcance, o sea 'cotizado', con `cancelado_at` para que se
       * sepa que lo SACARON y no que nadie lo ha decidido. */
      if (String(datos.estado) === 'cancelado') datos.estado = 'cotizado';
      const nuevo = String(datos.estado);
      const eraVendido = String(antes?.estado ?? 'cotizado') === 'vendido';
      if (nuevo === 'vendido') {
        if (!antes?.aprobado_at && datos.aprobado_at === undefined) { cols.push('aprobado_at'); datos.aprobado_at = ahora(); }
        if (!eraVendido) {
          mueveAlcance = 'entra';
          if (datos.cancelado_at === undefined) { cols.push('cancelado_at'); datos.cancelado_at = null; }
          if (datos.cancelado_motivo === undefined) { cols.push('cancelado_motivo'); datos.cancelado_motivo = null; }
        }
      } else if (eraVendido) {
        mueveAlcance = 'sale';
        if (datos.cancelado_at === undefined) { cols.push('cancelado_at'); datos.cancelado_at = ahora(); }
      }
    }
    /* 0.81.0 · cost101. El precio de un costo base que cambia deja renglón en
     * su historial —uno por día: el segundo cambio del mismo día pisa al
     * primero, que si no un precio tecleado mal y corregido contaría como dos
     * movimientos—. Y del producto se guarda cómo estaba, para que
     * `despuesDeCostos` sepa decir si se editó o se aprobó. */
    let productoAntes: Fila | null = null;
    if (tabla === 'costos_base' && datos.precio !== undefined) {
      const antes = this.obtener('costos_base', id);
      const nuevo = Math.max(0, Math.trunc(Number(datos.precio)) || 0);
      datos.precio = nuevo;
      if (antes && Number(antes.precio) !== nuevo) {
        const h = Array.isArray(antes.historial) ? [...(antes.historial as Array<{ f: string; precio: number }>)] : [];
        const f = hoyMx();
        if (h.length && h[h.length - 1].f === f) h[h.length - 1] = { f, precio: nuevo }; else h.push({ f, precio: nuevo });
        if (!cols.includes('historial')) cols.push('historial');
        datos.historial = h.slice(-60);
      }
    }
    if (tabla === 'productos') {
      productoAntes = this.obtener('productos', id);
      // Un producto con receta no lleva precio escrito a mano: lo pone la cuenta.
      const conReceta = datos.apu !== undefined ? !!datos.apu : !!productoAntes?.apu;
      if (conReceta && cols.includes('precio')) cols.splice(cols.indexOf('precio'), 1);
      if (!cols.length) return productoAntes;
    }
    if (def.cols.actualizado_at) {
      cols.push('actualizado_at');
      datos.actualizado_at = ahora();
    }
    const valores = cols.map((c) => this.adentro(def.cols[c], datos[c]));
    this.sql.exec(`UPDATE ${tabla} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...valores, id);

    this.despuesDeEscribir(tabla, id);
    this.despuesDeCostos(tabla, id, productoAntes);
    if (montoAntes !== undefined) this.huellaDePrecio(id, Number(montoAntes));
    if (mueveAlcance) this.anotarAlcance(id, proyectoDelItem, mueveAlcance, contexto, (datos.cancelado_motivo as string | null) ?? null);
    return this.obtener(tabla, id);
  }

  /* ─────────────── la bitácora del alcance (0.64.0) ───────────────
   *
   * Mike, 2-oct: «solo en la bitácora sí aparecerá como "se sacó del
   * alcance" y si se agrega de nuevo aparecerá después "se agregó al alcance"
   * con su fecha y quién la agregó».
   *
   * Se anota AQUÍ, en el único lugar por donde pasa cada cambio de estado
   * —el CRUD, aprobar, sacar, vender desde quote101, aprobar una
   * cotización—, y no en las rutas: una bitácora que sólo escriben dos rutas
   * se queda muda la primera vez que el estado cambia por una tercera. */
  private anotarAlcance(item_id: string, proyecto_id: string | null, accion: 'entra' | 'sale', contexto: Partial<ContextoEscritura>, motivo: string | null): void {
    this.sql.exec(
      `INSERT INTO alcance_movimientos (id, item_id, proyecto_id, accion, quien, app, motivo, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ulid(), item_id, proyecto_id, accion, contexto.correo ?? null, contexto.app ?? null, motivo ? String(motivo).trim() || null : null, ahora(),
    );
  }

  bitacoraAlcance(item_id: string): { ok: true; item: Fila; movimientos: MovimientoAlcance[] } | { error: string; detalle?: unknown } {
    const item = this.obtener('items', item_id);
    if (!item) return { error: 'no_encontrado', detalle: { que: 'item', id: item_id } };
    const movimientos = this.sql
      .exec(`SELECT id, item_id, proyecto_id, accion, quien, app, motivo, at FROM alcance_movimientos WHERE item_id = ? ORDER BY at, id`, item_id)
      .toArray() as unknown as MovimientoAlcance[];
    return { ok: true, item, movimientos };
  }

  borrar(tabla: Tabla, id: string): boolean | 'en_uso' {
    const antes = this.obtener(tabla, id);
    if (!antes) return false;
    /* 0.81.0 · Un costo base, una cuadrilla o un producto que otra receta
     * usa no se va: la receta se quedaría apuntando a nada y su precio
     * bajaría solo, sin que nadie lo decidiera. Las recetas son JSON, así
     * que esto no lo cuida una llave foránea: se cuida aquí. */
    if ((tabla === 'costos_base' || tabla === 'cuadrillas' || tabla === 'productos') && this.usosEnCostos(tabla, id).length) return 'en_uso';
    // Las llaves foráneas se aplican. Se contesta con un valor y no con una
    // excepción: cruzar el RPC con una excepción deja «uncaught» en el registro
    // del Worker aunque el Worker la atrape.
    try {
      this.sql.exec(`DELETE FROM ${tabla} WHERE id = ?`, id);
    } catch (e) {
      if (/FOREIGN KEY/i.test((e as Error).message ?? '')) return 'en_uso';
      throw e;
    }
    if ((tabla === 'movimientos' || tabla === 'partidas') && antes.proyecto_id) this.recalcularProyecto(String(antes.proyecto_id));
    return true;
  }

  /* ─────────────── cost101: costos base, cuadrillas y la receta (0.81.0) ───────────────
   *
   * Mike, 7-oct-2026: «los generadores se alimentan de la base de datos de
   * costos base, y de ahí se generan los productos (…) los cuales van a
   * alimentar los precios de los productos para quote».
   *
   * El precio de un producto con receta es un CACHÉ: sale de sus costos. Lo
   * recalcula la base cada vez que se toca cualquiera de las tres tablas, y
   * no la pantalla, porque quote101 lo lee aunque nadie tenga cost101
   * abierto. Los catálogos son chicos —cientos de renglones—, así que se
   * recalcula todo: buscar «quién usa a quién» para ahorrarse la cuenta
   * costaría más que hacerla. */

  /** La siguiente clave libre con ese prefijo: MAT-044 después de MAT-043. */
  private siguienteClave(tabla: 'costos_base' | 'cuadrillas' | 'productos', columna: 'clave' | 'codigo', prefijo: string, digitos: number): string {
    const filas = this.sql.exec(`SELECT ${columna} AS c FROM ${tabla} WHERE ${columna} LIKE ?`, `${prefijo}%`).toArray() as Fila[];
    let mayor = 0;
    for (const f of filas) {
      const n = Number(String(f.c).slice(prefijo.length));
      if (Number.isInteger(n) && n > mayor) mayor = n;
    }
    return `${prefijo}${String(mayor + 1).padStart(digitos, '0')}`;
  }

  claveOcupada(tabla: 'costos_base' | 'cuadrillas' | 'productos', clave: string, excepto: string | null = null): boolean {
    const c = String(clave ?? '').trim();
    if (!c) return false;
    const columna = tabla === 'productos' ? 'codigo' : 'clave';
    return this.sql.exec(`SELECT 1 AS x FROM ${tabla} WHERE ${columna} = ? AND id <> ? LIMIT 1`, c, excepto ?? '').toArray().length > 0;
  }

  /** Todo lo que la cuenta necesita, leído una vez. */
  private fuentesDeCostos(): { f: Fuentes; productos: Fila[]; cuadrillas: Fila[] } {
    const costos = this.sql.exec(`SELECT id, tipo, precio, nombre FROM costos_base`).toArray() as Fila[];
    const cuadrillas = (this.sql.exec(`SELECT * FROM cuadrillas`).toArray() as Fila[]).map((q) => this.afuera('cuadrillas', q)!);
    const productos = (this.sql.exec(`SELECT * FROM productos WHERE apu IS NOT NULL AND apu <> 'null'`).toArray() as Fila[]).map((p) => this.afuera('productos', p)!);
    const f: Fuentes = {
      costos: new Map(costos.map((c) => [String(c.id), { id: String(c.id), tipo: String(c.tipo), precio: Number(c.precio), nombre: String(c.nombre) }])),
      cuadrillas: new Map(cuadrillas.map((q) => [String(q.id), { id: String(q.id), horas: Number(q.horas), miembros: (q.miembros as Array<{ ref: string; cant: number }>) ?? [], nombre: String(q.nombre) }])),
      productos: new Map(productos.map((p) => [String(p.id), { id: String(p.id), apu: (p.apu as Apu | null) ?? null, nombre: String(p.nombre) }])),
    };
    return { f, productos, cuadrillas };
  }

  usosEnCostos(tabla: 'costos_base' | 'cuadrillas' | 'productos', id: string): Array<{ que: 'cuadrilla' | 'producto'; id: string; clave: string; nombre: string }> {
    const { productos, cuadrillas } = this.fuentesDeCostos();
    const usos: Array<{ que: 'cuadrilla' | 'producto'; id: string; clave: string; nombre: string }> = [];
    const tipoComp = tabla === 'costos_base' ? 'insumo' : tabla === 'cuadrillas' ? 'cuadrilla' : 'partida';
    if (tabla === 'costos_base') {
      for (const q of cuadrillas) {
        if (((q.miembros as Array<{ ref: string }>) ?? []).some((m) => m.ref === id)) usos.push({ que: 'cuadrilla', id: String(q.id), clave: String(q.clave ?? ''), nombre: String(q.nombre) });
      }
    }
    for (const p of productos) {
      if (String(p.id) === id) continue;
      if (((p.apu as Apu | null)?.comps ?? []).some((c) => c.tipo === tipoComp && c.ref === id)) usos.push({ que: 'producto', id: String(p.id), clave: String(p.codigo ?? ''), nombre: String(p.nombre) });
    }
    return usos;
  }

  revisarApu(apu: unknown, producto_id: string | null): { ok: true; apu: Record<string, unknown> } | { ok: false; errores: Record<string, string> } {
    const limpio = limpiarApu(apu);
    if (!limpio.ok) return limpio;
    const { f } = this.fuentesDeCostos();
    const errores: Record<string, string> = {};
    limpio.apu.comps.forEach((c, i) => {
      if (c.tipo === 'insumo' && !f.costos.has(c.ref)) errores[`comps.${i}.ref`] = 'Ese costo base ya no existe.';
      if (c.tipo === 'cuadrilla' && !f.cuadrillas.has(c.ref)) errores[`comps.${i}.ref`] = 'Esa cuadrilla ya no existe.';
      if (c.tipo === 'partida') {
        const otro = f.productos.get(c.ref);
        if (!otro) errores[`comps.${i}.ref`] = 'Ese producto no existe o no tiene receta.';
        else if (producto_id && (c.ref === producto_id || usaA(otro, producto_id, f))) {
          errores[`comps.${i}.ref`] = `«${otro.nombre}» ya usa a este producto: uno no puede ir dentro del otro.`;
        }
      }
    });
    return Object.keys(errores).length ? { ok: false, errores } : { ok: true, apu: limpio.apu as unknown as Record<string, unknown> };
  }

  revisarMiembros(miembros: Array<{ ref: string; cant: number }>): Record<string, string> | null {
    const errores: Record<string, string> = {};
    miembros.forEach((m, i) => {
      const o = this.sql.exec(`SELECT tipo, unidad FROM costos_base WHERE id = ?`, m.ref).toArray()[0] as Fila | undefined;
      if (!o) errores[`miembros.${i}.ref`] = 'Ese oficio ya no existe.';
      else if (o.tipo !== 'mo') errores[`miembros.${i}.ref`] = 'Una cuadrilla se arma con oficios (mano de obra).';
      // La jornada es precio × horas: un destajo (por unidad) no cabe.
      else if ((String(o.unidad ?? '') || 'h') !== 'h') errores[`miembros.${i}.ref`] = 'En una cuadrilla sólo entran oficios por hora.';
    });
    return Object.keys(errores).length ? errores : null;
  }

  /** Vuelve a hacer la cuenta de TODOS los productos con receta y guarda los
   *  que cambiaron. `motivo` es lo que queda escrito en su historial;
   *  `propio` es el producto que se acaba de crear o editar, que lleva su
   *  propio motivo y deja renglón aunque el número no se haya movido (al
   *  nacer y al aprobarse). Devuelve cuántos OTROS cambiaron. */
  private recalcularProductos(motivo: string, propio: { id: string; motivo: string | null } | null = null): number {
    const { f, productos } = this.fuentesDeCostos();
    const hoy = hoyMx();
    let movidos = 0;
    for (const p of productos) {
      const id = String(p.id);
      const d: Desglose = calcular(p.apu as Apu, f);
      const antes = (p.desglose as Desglose | null) ?? null;
      const esPropio = propio?.id === id;
      const cambioNumero = !antes || antes.pu !== d.pu || Number(p.precio) !== d.precio;
      const m = esPropio ? propio!.motivo : cambioNumero && antes ? motivo : null;
      const igual = antes && JSON.stringify(antes) === JSON.stringify(d) && Number(p.precio) === d.precio;
      if (igual && !m) continue;
      let h = Array.isArray(p.historial) ? [...(p.historial as Array<{ f: string; pu: number; m: string }>)] : [];
      if (m) {
        const ultimo = h[h.length - 1];
        if (ultimo && ultimo.f === hoy && ultimo.m === m) h[h.length - 1] = { f: hoy, pu: d.pu, m }; else h.push({ f: hoy, pu: d.pu, m });
        h = h.slice(-60);
      }
      this.sql.exec(
        `UPDATE productos SET precio = ?, desglose = ?, historial = ?, actualizado_at = ? WHERE id = ?`,
        d.precio, JSON.stringify(d), JSON.stringify(h), ahora(), id,
      );
      if (!esPropio && cambioNumero) movidos++;
    }
    if (movidos || propio) this.avisar({ t: 'costos.cambio', productos: movidos }, 'todos');
    return movidos;
  }

  /** Después de tocar un costo base, una cuadrilla o un producto con receta. */
  private despuesDeCostos(tabla: Tabla, id: string, antes: Fila | null): void {
    if (tabla === 'costos_base') {
      const c = this.obtener('costos_base', id);
      this.recalcularProductos(`Precio base: ${c?.nombre ?? ''}`);
    } else if (tabla === 'cuadrillas') {
      const q = this.obtener('cuadrillas', id);
      this.recalcularProductos(`Cuadrilla: ${q?.nombre ?? ''}`);
    } else if (tabla === 'productos') {
      const p = this.obtener('productos', id);
      if (!p?.apu) return;
      const viejo = (antes?.desglose as Desglose | null) ?? null;
      const d = calcular(p.apu as Apu, this.fuentesDeCostos().f);
      let motivo: string | null = null;
      if (!antes || !antes.apu) motivo = p.estado === 'aprobado' ? 'Alta en catálogo' : 'Alta (borrador)';
      else if (p.estado === 'aprobado' && antes.estado !== 'aprobado') motivo = 'Aprobada';
      else if (!viejo || viejo.pu !== d.pu) motivo = 'Edición de partida';
      this.recalcularProductos(`Subpartida: ${p.nombre}`, { id, motivo });
    }
  }

  importarCostos(args: ImportarCostos): ResultadoImportarCostos {
    const nuevos = { costos: 0, cuadrillas: 0, productos: 0 };
    const ya = { costos: 0, cuadrillas: 0, productos: 0 };
    const ids = { costos: new Map<string, string>(), cuadrillas: new Map<string, string>(), productos: new Map<string, string>() };
    const idPorClave = (tabla: string, columna: string, clave: string): string | null =>
      clave ? ((this.sql.exec(`SELECT id FROM ${tabla} WHERE ${columna} = ?`, clave).toArray()[0] as Fila | undefined)?.id as string | undefined) ?? null : null;
    let falla: { error: string; detalle?: unknown } | null = null;
    try {
      this.ctx.storage.transactionSync(() => {
        const t = ahora();
        for (const c of args.costos ?? []) {
          const clave = String(c.clave ?? '').trim();
          const hay = idPorClave('costos_base', 'clave', clave);
          if (hay) { ids.costos.set(c.ref, hay); ya.costos++; continue; }
          const tipo = ['material', 'mo', 'equipo'].includes(c.tipo) ? c.tipo : 'material';
          const precio = Math.max(0, Math.trunc(Number(c.precio)) || 0);
          const historial = Array.isArray(c.historial) && c.historial.length
            ? c.historial.map((h) => ({ f: String(h.f).slice(0, 10), precio: Math.max(0, Math.trunc(Number(h.precio)) || 0) }))
            : [{ f: hoyMx(), precio }];
          const id = ulid();
          this.sql.exec(
            `INSERT INTO costos_base (id, clave, nombre, nombre_norm, tipo, unidad, precio, categoria, historial, creado_at, creado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            id, clave || this.siguienteClave('costos_base', 'clave', tipo === 'mo' ? 'MO-' : tipo === 'equipo' ? 'EQ-' : 'MAT-', 3),
            String(c.nombre).trim(), normalizar(c.nombre), tipo, tipo === 'equipo' ? 'h' : (String(c.unidad ?? '').trim() || (tipo === 'mo' ? 'h' : 'pza')), precio,
            String(c.categoria ?? '').trim(), JSON.stringify(historial), t, args.usuario_id,
          );
          ids.costos.set(c.ref, id); nuevos.costos++;
        }
        for (const q of args.cuadrillas ?? []) {
          const clave = String(q.clave ?? '').trim();
          const hay = idPorClave('cuadrillas', 'clave', clave);
          if (hay) { ids.cuadrillas.set(q.ref, hay); ya.cuadrillas++; continue; }
          const miembros = (q.miembros ?? []).map((m) => {
            const real = ids.costos.get(m.ref);
            if (!real) throw Object.assign(new Error('ref'), { detalle: { que: 'cuadrilla', clave, miembro: m.ref, motivo: 'ese oficio no viene en el archivo' } });
            return { ref: real, cant: Number(m.cant) || 0 };
          });
          const id = ulid();
          this.sql.exec(
            `INSERT INTO cuadrillas (id, clave, nombre, categoria, horas, miembros, creado_at, creado_por) VALUES (?,?,?,?,?,?,?,?)`,
            id, clave || this.siguienteClave('cuadrillas', 'clave', 'CUA-', 2), String(q.nombre).trim(), String(q.categoria ?? '').trim(),
            Number(q.horas) > 0 ? Number(q.horas) : 8, JSON.stringify(miembros), t, args.usuario_id,
          );
          ids.cuadrillas.set(q.ref, id); nuevos.cuadrillas++;
        }
        // Los ids de los productos se apartan todos antes: una receta puede
        // apuntar a un producto que viene más abajo en el archivo.
        const porHacer: Array<{ p: NonNullable<ImportarCostos['productos']>[number]; id: string; codigo: string }> = [];
        for (const p of args.productos ?? []) {
          const codigo = String(p.codigo ?? '').trim();
          const hay = idPorClave('productos', 'codigo', codigo);
          if (hay) { ids.productos.set(p.ref, hay); ya.productos++; continue; }
          const id = ulid();
          ids.productos.set(p.ref, id);
          porHacer.push({ p, id, codigo });
        }
        for (const { p, id, codigo } of porHacer) {
          const limpio = limpiarApu(p.apu);
          if (!limpio.ok) throw Object.assign(new Error('apu'), { detalle: { que: 'producto', codigo, errores: limpio.errores } });
          for (const c of limpio.apu.comps) {
            const mapa = c.tipo === 'insumo' ? ids.costos : c.tipo === 'cuadrilla' ? ids.cuadrillas : ids.productos;
            const real = mapa.get(c.ref);
            if (!real) throw Object.assign(new Error('ref'), { detalle: { que: 'producto', codigo, componente: c.ref, motivo: 'no viene en el archivo' } });
            c.ref = real;
          }
          this.sql.exec(
            `INSERT INTO productos (id, codigo, nombre, descripcion, tipo, precio, moneda, creado_at, creado_por, unidad, categoria, estado, apu, historial)
             VALUES (?,?,?,?,?,0,'MXN',?,?,?,?,?,?,'[]')`,
            id, codigo || this.siguienteClave('productos', 'codigo', 'PAR-', 3), String(p.nombre).trim(), p.descripcion ?? null,
            String(p.tipo ?? '').trim() || 'servicio', t, args.usuario_id, String(p.unidad ?? 'pza'), String(p.categoria ?? '').trim(),
            p.estado === 'aprobado' ? 'aprobado' : 'borrador', JSON.stringify(limpio.apu),
          );
          nuevos.productos++;
        }
        // Una sola cuenta al final, ya con todo adentro; cada producto nuevo
        // deja su renglón de alta.
        const { f, productos } = this.fuentesDeCostos();
        const recien = new Set(porHacer.map((x) => x.id));
        const hoy = hoyMx();
        for (const pr of productos) {
          if (!recien.has(String(pr.id))) continue;
          const d = calcular(pr.apu as Apu, f);
          const m = pr.estado === 'aprobado' ? 'Alta en catálogo' : 'Alta (borrador)';
          this.sql.exec(`UPDATE productos SET precio = ?, desglose = ?, historial = ? WHERE id = ?`, d.precio, JSON.stringify(d), JSON.stringify([{ f: hoy, pu: d.pu, m }]), String(pr.id));
        }
      });
    } catch (e) {
      const x = e as Error & { detalle?: unknown };
      if (x.message === 'ref' || x.message === 'apu') falla = { error: 'datos_invalidos', detalle: x.detalle };
      else throw e;
    }
    if (falla) return { ok: false, ...falla };
    if (nuevos.costos || nuevos.cuadrillas) this.recalcularProductos('Carga de costos');
    return { ok: true, nuevos, ya_estaban: ya };
  }

  /** Lo que hay que recalcular y avisar después de tocar una tabla. */
  private despuesDeEscribir(tabla: Tabla, id: string): void {
    if (tabla === 'items') {
      const it = this.obtener('items', id);
      if (it?.proyecto_id) this.recalcularProyecto(String(it.proyecto_id));
      this.avisar({ t: 'item.cambio', id }, 'todos');
    }
    if (tabla === 'movimientos') {
      const m = this.obtener('movimientos', id);
      if (m?.proyecto_id) this.recalcularProyecto(String(m.proyecto_id));
      this.avisar({ t: 'movimiento.nuevo', id, proyecto_id: (m?.proyecto_id as string) ?? null }, 'dinero');
    }
    if (tabla === 'partidas') {
      const par = this.obtener('partidas', id);
      if (par?.proyecto_id) this.recalcularProyecto(String(par.proyecto_id));
    }
  }

  /* ─────────────── agregados del proyecto (§4) ───────────────
   * Los calcula la API, no las apps. Un caché que escribe cualquiera deja de
   * ser un caché: se contradice con la tabla y nadie sabe cuál manda. */

  /* ─────────────── la conciliación semanal (B1) ───────────────
   * Una sola operación: o queda la conciliación con sus renglones y sus
   * ajustes, o no queda nada. `transactionSync` da esa garantía dentro del
   * SQLite del Durable Object; el aviso por WebSocket se manda después, ya
   * con todo escrito, porque un aviso no se puede deshacer.
   *
   * El saldo registrado se calcula aquí y se guarda como foto: es lo que
   * dash101 creía tener al corte. Si mañana alguien captura un gasto con
   * fecha vieja, esta conciliación no cambia; eso sale en la siguiente. */
  conciliar(args: {
    corte_at: string; usuario_id: string;
    saldos: Array<{ cuenta_id: string; saldo_real: number }>;
  }): { ok: true; conciliacion: Fila; cuentas: Fila[]; diferencia_total: number } | { ok: false; error: string; detalle?: Record<string, any> } {
    const cuentas = this.sql
      .exec(`SELECT id, nombre, saldo_inicial FROM cuentas ORDER BY nombre`)
      .toArray() as Fila[];
    if (!cuentas.length) return { ok: false, error: 'datos_invalidos', detalle: { motivo: 'la empresa no tiene cuentas' } };

    // Mike decidió que se concilian TODAS las cuentas, iguales: bancos,
    // efectivo y tarjetas. Que falte una es un error, no un silencio.
    const dados = new Map(args.saldos.map((s) => [s.cuenta_id, s.saldo_real]));
    const faltan = cuentas.filter((c) => !dados.has(String(c.id))).map((c) => ({ id: c.id, nombre: c.nombre }));
    if (faltan.length) return { ok: false, error: 'faltan_cuentas', detalle: { faltan } };
    const sobran = args.saldos.filter((s) => !cuentas.some((c) => String(c.id) === s.cuenta_id)).map((s) => s.cuenta_id);
    if (sobran.length) return { ok: false, error: 'no_encontrado', detalle: { cuentas: sobran, motivo: 'no son cuentas de esta empresa' } };

    // Los movimientos llevan día, no hora: al corte entra todo lo registrado
    // hasta ese día inclusive.
    const dia = args.corte_at.slice(0, 10);
    const id = ulid();
    const at = ahora();
    const renglones: Fila[] = [];
    let diferencia_total = 0;

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO conciliaciones (id, corte_at, hecha_por, creado_at) VALUES (?,?,?,?)`,
        id, args.corte_at, args.usuario_id, at,
      );

      for (const c of cuentas) {
        const cuenta_id = String(c.id);
        const movidos = this.sql
          .exec(
            `SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) AS s
             FROM movimientos WHERE cuenta_id = ? AND fecha <= ?`,
            cuenta_id, dia,
          )
          .one() as { s: number };
        const saldo_registrado = Number(c.saldo_inicial || 0) + Number(movidos.s || 0);
        const saldo_real = Number(dados.get(cuenta_id) || 0);
        const diferencia = saldo_registrado - saldo_real;
        diferencia_total += diferencia;

        // El ajuste deja la cuenta igual a la realidad (decisión 1 de Mike).
        // Va SIN proyecto: por eso no mueve `cobrado` ni `pagado_prov`.
        let movimiento_id: string | null = null;
        if (diferencia !== 0) {
          const mov = this.crear(
            'movimientos',
            {
              tipo: diferencia > 0 ? 'egreso' : 'ingreso',
              monto: Math.abs(diferencia),
              fecha: dia,
              cuenta_id,
              proyecto_id: null,
              item_id: null,
              contraparte_tipo: 'otro',
              contraparte_nombre: 'Sin identificar',
              categoria: 'ajuste_conciliacion',
              descripcion: `Ajuste por conciliación del ${dia}`,
            },
            { app: 'dash101', usuario_id: args.usuario_id },
          );
          movimiento_id = String(mov.id);
        }

        const rid = ulid();
        this.sql.exec(
          `INSERT INTO conciliacion_cuentas
             (id, conciliacion_id, cuenta_id, saldo_registrado, saldo_real, diferencia, movimiento_id, creado_at)
           VALUES (?,?,?,?,?,?,?,?)`,
          rid, id, cuenta_id, saldo_registrado, saldo_real, diferencia, movimiento_id, at,
        );
        renglones.push(this.obtener('conciliacion_cuentas', rid)!);
      }
    });

    this.avisar({ t: 'conciliacion.nueva', id, diferencia_total }, 'dinero');
    return { ok: true, conciliacion: this.obtener('conciliaciones', id)!, cuentas: renglones, diferencia_total };
  }

  /** Lo que se escapó: por corte, por cuenta y el acumulado. */
  estadisticaConciliacion(): {
    cortes: Array<Record<string, unknown>>;
    por_cuenta: Array<Record<string, unknown>>;
    acumulado: { cortes: number; diferencia_total: number; faltante: number; sobrante: number };
  } {
    const cortes = this.sql
      .exec(
        `SELECT c.id, c.corte_at, c.hecha_por,
                COUNT(cc.id) AS cuentas,
                COALESCE(SUM(cc.diferencia), 0) AS diferencia_total,
                COALESCE(SUM(CASE WHEN cc.diferencia > 0 THEN cc.diferencia ELSE 0 END), 0) AS faltante,
                COALESCE(SUM(CASE WHEN cc.diferencia < 0 THEN -cc.diferencia ELSE 0 END), 0) AS sobrante
         FROM conciliaciones c
         LEFT JOIN conciliacion_cuentas cc ON cc.conciliacion_id = c.id
         GROUP BY c.id ORDER BY c.corte_at DESC`,
      )
      .toArray() as Array<Record<string, unknown>>;

    const por_cuenta = this.sql
      .exec(
        `SELECT cc.cuenta_id, cu.nombre, COUNT(*) AS cortes,
                COALESCE(SUM(cc.diferencia), 0) AS diferencia_total
         FROM conciliacion_cuentas cc
         JOIN conciliaciones c ON c.id = cc.conciliacion_id
         LEFT JOIN cuentas cu ON cu.id = cc.cuenta_id
         GROUP BY cc.cuenta_id ORDER BY diferencia_total DESC`,
      )
      .toArray() as Array<Record<string, unknown>>;

    const acumulado = {
      cortes: cortes.length,
      diferencia_total: cortes.reduce((t, c) => t + Number(c.diferencia_total || 0), 0),
      faltante: cortes.reduce((t, c) => t + Number(c.faltante || 0), 0),
      sobrante: cortes.reduce((t, c) => t + Number(c.sobrante || 0), 0),
    };
    return { cortes, por_cuenta, acumulado };
  }

  recalcularProyecto(proyecto_id: string): Fila | null {
    const p = this.sql.exec(`SELECT id, estado FROM proyectos WHERE id = ?`, proyecto_id).toArray()[0] as Fila | undefined;
    if (!p) return null;

    const venta = this.sql
      .exec(`SELECT COALESCE(SUM(monto),0) AS s, COUNT(*) AS n, COALESCE(AVG(etapa),0) AS e,
             COALESCE(SUM(CASE WHEN etapa = 7 THEN 1 ELSE 0 END),0) AS cerrados
             FROM items WHERE proyecto_id = ? AND estado = 'vendido'`, proyecto_id)
      .one() as { s: number; n: number; e: number; cerrados: number };
    const cobrado = (this.sql
      .exec(`SELECT COALESCE(SUM(monto),0) AS s FROM movimientos WHERE proyecto_id = ? AND tipo = 'ingreso'`, proyecto_id)
      .one() as { s: number }).s;
    const pagado = (this.sql
      .exec(`SELECT COALESCE(SUM(monto),0) AS s FROM movimientos WHERE proyecto_id = ? AND tipo = 'egreso'`, proyecto_id)
      .one() as { s: number }).s;
    const avance = venta.n ? venta.e / 7 : 0;

    // Las partidas: lo pagado son los egresos del proyecto QUE SON DE LA
    // PARTIDA (0026: el egreso de una orden pagada sabe su partida), más
    // —para lo capturado a mano desde siempre— los egresos a nombre de su
    // proveedor que no sean de otra partida. Hasta el 1-oct-2026 sólo
    // contaba lo segundo, y una orden con el proveedor escrito a mano dejaba
    // la partida en «pendiente» con $0 ya pagada (Mike, HOLCIM). Son cachés
    // de la partida: los escribe esto y nadie más. Y lo acordado con todos se
    // suma en `compromiso`, el del proyecto.
    for (const par of this.sql
      .exec(`SELECT id, proveedor_id, monto_acordado FROM partidas WHERE proyecto_id = ?`, proyecto_id)
      .toArray() as Fila[]) {
      const pagadoProv = (this.sql
        .exec(`SELECT COALESCE(SUM(monto),0) AS s FROM movimientos
               WHERE proyecto_id = ? AND tipo = 'egreso'
                 AND (partida_id = ?
                      OR (partida_id IS NULL AND ? IS NOT NULL AND contraparte_tipo = 'proveedor' AND contraparte_id = ?))`,
              proyecto_id, par.id, par.proveedor_id ?? null, par.proveedor_id ?? null)
        .one() as { s: number }).s;
      const acordado = Number(par.monto_acordado || 0);
      const estadoPar = pagadoProv >= acordado && acordado > 0 ? 'pagado' : pagadoProv > 0 ? 'parcial' : 'pendiente';
      this.sql.exec(`UPDATE partidas SET monto_pagado = ?, estado = ? WHERE id = ?`, pagadoProv, estadoPar, par.id);
    }
    const compromiso = (this.sql
      .exec(`SELECT COALESCE(SUM(monto_acordado),0) AS s FROM partidas WHERE proyecto_id = ?`, proyecto_id)
      .one() as { s: number }).s;

    // Cuando TODOS los ítems vendidos llegan a la etapa 7, el proyecto queda en
    // finiquito. No se toca si ya está cerrado: eso lo decide la oficina.
    let estado = String(p.estado);
    if (venta.n > 0 && venta.cerrados === venta.n && estado !== 'cerrado') estado = 'finiquito';

    this.sql.exec(
      `UPDATE proyectos SET precio_venta = ?, cobrado = ?, pagado_prov = ?, compromiso = ?, avance = ?, estado = ?, actualizado_at = ? WHERE id = ?`,
      venta.s, cobrado, pagado, compromiso, avance, estado, ahora(), proyecto_id,
    );
    this.avisar({ t: 'proyecto.cache', id: proyecto_id, precio_venta: venta.s, cobrado, avance }, 'dinero');
    return this.obtener('proyectos', proyecto_id);
  }

  /* ─────────────── etapa del ítem (§4) ───────────────
   * Único camino para mover la etapa. Deja renglón en `avances` (append-only),
   * refresca el caché del ítem, bautiza la clave en la 4 y avisa por WebSocket. */

  moverEtapa(args: {
    item_id: string;
    etapa: number;
    nota?: string | null;
    foto?: string | null;
    usuario_id: string;
    persona_id?: string | null;
    /** null = sin restricción (miembro de la org). [] = no puede mover ninguna. */
    etapas_permitidas?: number[] | null;
  }): { ok: true; item: Fila; avance: Fila } | { ok: false; error: string; detalle?: Record<string, any> } {
    const etapa = Math.trunc(Number(args.etapa));
    if (!Number.isInteger(etapa) || etapa < 0 || etapa > 7) {
      return { ok: false, error: 'datos_invalidos', detalle: { etapa: 'entero de 0 a 7' } };
    }
    const item = this.obtener('items', args.item_id);
    if (!item) return { ok: false, error: 'no_encontrado' };

    // El instalador no puede marcar «anticipo pagado». §4.
    if (args.etapas_permitidas && !args.etapas_permitidas.includes(etapa)) {
      return { ok: false, error: 'etapa_no_permitida', detalle: { etapa, permitidas: args.etapas_permitidas } };
    }

    const ts = ahora();
    const avance = this.crear(
      'avances',
      {
        item_id: args.item_id,
        etapa,
        persona_id: args.persona_id ?? null,
        usuario_id: args.usuario_id,
        nota: args.nota ?? null,
        foto: args.foto ?? null,
        ts,
      },
      { app: 'quell101', usuario_id: args.usuario_id },
    );

    let clave = (item.clave as string | null) ?? null;
    if (!clave && etapa >= 4) clave = this.claveNueva(String(item.tipo || 'otro'));

    this.sql.exec(
      `UPDATE items SET etapa = ?, etapa_at = ?, etapa_por = ?, clave = ?, actualizado_at = ? WHERE id = ?`,
      etapa, ts, args.usuario_id, clave, ts, args.item_id,
    );
    if (item.proyecto_id) this.recalcularProyecto(String(item.proyecto_id));

    const fresco = this.obtener('items', args.item_id)!;
    this.avisar({ t: 'item.etapa', id: args.item_id, etapa: etapa as Etapa, clave, at: ts }, 'todos');
    return { ok: true, item: fresco, avance };
  }

  /** 'M07'. Nace en la etapa 4, cuando el ítem se embala y se etiqueta. */
  private claveNueva(tipo: string): string {
    const p = PREFIJO_CLAVE[tipo] ?? 'O';
    const n = (this.sql.exec(`SELECT COUNT(*) AS n FROM items WHERE clave LIKE ?`, `${p}%`).one() as { n: number }).n;
    return `${p}${String(n + 1).padStart(2, '0')}`;
  }

  /* ─────────────── cotizador101 → ítems ─────────────── */

  exportarItems(args: {
    cotizacion_id: string;
    lineas: Array<Record<string, unknown>>;
    cliente_id: string;
    usuario_id: string;
  }): { total: number; filas: Fila[] } {
    const filas: Fila[] = [];
    args.lineas.forEach((l, i) => {
      filas.push(
        this.crear(
          'items',
          {
            cliente_id: l.cliente_id ?? args.cliente_id,
            proyecto_id: null,
            nombre: l.nombre,
            descripcion: l.descripcion ?? null,
            tipo: l.tipo ?? 'mueble',
            monto: l.monto ?? 0,
            /* La cantidad que trae la cotización (0011). quote101 ya cotiza
             * «× 20» desde siempre —`m.qty`— y su total ya viene
             * multiplicado; lo que faltaba era que ese 20 cruzara a la suite,
             * para que en dash101 se vea y para que en quell101 haya 20
             * piezas que ubicar en el plano. Sin él se exportaba un renglón
             * de 20 puertas que valía por una sola pieza. */
            cantidad: Number.isFinite(Number(l.cantidad)) && Number(l.cantidad) > 0 ? Math.trunc(Number(l.cantidad)) : 1,
            moneda: l.moneda ?? 'MXN',
            estado: 'cotizado',
            origen: { app: 'cotizador101', cotizacion_id: args.cotizacion_id, linea: i + 1 },
          },
          { app: 'cotizador101', usuario_id: args.usuario_id },
        ),
      );
    });
    return { total: filas.length, filas };
  }

  venderItems(args: {
    item_ids: string[];
    proyecto_id?: string | null;
    nombre_proyecto?: string;
    app: string;
    usuario_id: string;
    correo?: string | null;
  }): { ok: true; proyecto: Fila; items: Fila[] } | { ok: false; error: string; detalle?: Record<string, any> } {
    const items = args.item_ids.map((id) => this.obtener('items', id)).filter(Boolean) as Fila[];
    if (!items.length) return { ok: false, error: 'no_encontrado', detalle: { item_ids: args.item_ids } };

    let proyecto_id = args.proyecto_id ?? null;
    if (!proyecto_id) {
      const p = this.crear(
        'proyectos',
        {
          cliente_id: items[0].cliente_id,
          nombre: args.nombre_proyecto || `Proyecto ${String(items[0].nombre).slice(0, 40)}`,
          estado: 'activo',
          fecha_inicio: ahora().slice(0, 10),
        },
        { app: args.app, usuario_id: args.usuario_id },
      );
      proyecto_id = String(p.id);
    } else if (!this.obtener('proyectos', proyecto_id)) {
      return { ok: false, error: 'no_encontrado', detalle: { proyecto_id } };
    }

    for (const it of items) {
      this.sql.exec(
        `UPDATE items SET estado = 'vendido', proyecto_id = ?, aprobado_at = COALESCE(aprobado_at, ?), cancelado_at = NULL,
                cancelado_motivo = NULL, actualizado_at = ? WHERE id = ?`,
        proyecto_id, ahora(), ahora(), it.id,
      );
      if (String(it.estado ?? 'cotizado') !== 'vendido') this.anotarAlcance(String(it.id), proyecto_id, 'entra', { app: args.app, usuario_id: args.usuario_id, correo: args.correo }, null);
      this.avisar({ t: 'item.cambio', id: String(it.id) }, 'todos');
    }
    const proyecto = this.recalcularProyecto(proyecto_id)!;
    return { ok: true, proyecto, items: args.item_ids.map((id) => this.obtener('items', id)!).filter(Boolean) };
  }

  /* ─────────────── aprobar una cotización (0.46.0) ───────────────
   *
   * Mike, 23-sep-2026: cada renglón de la hoja de quote101 «es un ítem que se
   * va agregando con su producto, su descripción y su cantidad (que define
   * cuántos ítems se crean de ese producto)». Y se crean AL APROBAR: mientras
   * se cotiza, los renglones sólo viven en la cotización, para que las
   * corridas y versiones descartadas no llenen el proyecto de piezas que nadie
   * autorizó.
   *
   * Por eso aquí:
   *   · UNA fila de `items` por pieza, vendida y en el proyecto. «× 3» son
   *     tres ítems, cada uno con su etapa y su lugar en el plano.
   *   · Si son varias piezas del mismo renglón, las amarra un PRODUCTO
   *     (0.35.0): el que traía el renglón del catálogo, o uno nuevo con el
   *     nombre, la descripción y el precio del renglón. Una pieza sola es su
   *     propio producto único (`producto_id` NULL), como en el resto de la
   *     suite.
   *   · Todo o nada: si una línea no sirve, no se crea ninguna pieza.
   *   · Una cotización se aprueba UNA vez. La segunda contesta 409: dos
   *     clics seguidos no pueden meter las piezas dos veces. */
  aprobarCotizacion(args: AprobarCotizacion): ResultadoAprobar {
    const cot = this.obtener('cotizaciones', args.cotizacion_id);
    if (!cot) return { ok: false, error: 'no_encontrado', detalle: { cotizacion_id: args.cotizacion_id } };
    if (cot.estado === 'aceptada') {
      const datos = (cot.datos ?? {}) as Record<string, any>;
      return { ok: false, error: 'ya_aprobada', detalle: { aprobacion: datos.aprobacion ?? null } };
    }
    const proyecto = this.obtener('proyectos', args.proyecto_id);
    if (!proyecto) return { ok: false, error: 'no_encontrado', detalle: { proyecto_id: args.proyecto_id } };
    if (!Array.isArray(args.lineas) || !args.lineas.length) return { ok: false, error: 'datos_invalidos', detalle: { falta: 'lineas' } };

    const MAX_PIEZAS = 1000;
    let piezas = 0;
    for (const [i, l] of args.lineas.entries()) {
      const n = Number(l.cantidad);
      if (!String(l.nombre ?? '').trim()) return { ok: false, error: 'datos_invalidos', detalle: { linea: i + 1, falta: 'nombre' } };
      if (!Number.isInteger(n) || n < 1) return { ok: false, error: 'datos_invalidos', detalle: { linea: i + 1, cantidad: l.cantidad, regla: 'entero de 1 o más' } };
      if (!Number.isInteger(Number(l.precio)) || Number(l.precio) < 0) {
        return { ok: false, error: 'dinero_no_entero', detalle: { linea: i + 1, precio: l.precio, regla: 'centavos, INTEGER, de una pieza' } };
      }
      if (l.producto_id && !this.obtener('productos', String(l.producto_id))) {
        return { ok: false, error: 'no_encontrado', detalle: { linea: i + 1, producto_id: l.producto_id } };
      }
      piezas += n;
    }
    if (piezas > MAX_PIEZAS) return { ok: false, error: 'datos_invalidos', detalle: { piezas, maximo: MAX_PIEZAS } };

    /* 0.49.0 · un renglón puede SER un ítem que ya existe: el requerimiento
     * que se levantó en la obra y cayó en este borrador. Se revisa antes de
     * escribir, como todo lo demás: todo o nada. */
    for (const [i, l] of args.lineas.entries()) {
      if (!l.item_id) continue;
      const it = this.sql.exec(`SELECT id, proyecto_id FROM items WHERE id = ?`, String(l.item_id)).toArray()[0] as Fila | undefined;
      if (!it) return { ok: false, error: 'no_encontrado', detalle: { linea: i + 1, item_id: l.item_id } };
      if (String(it.proyecto_id ?? '') !== args.proyecto_id) {
        return { ok: false, error: 'datos_invalidos', detalle: { linea: i + 1, item_id: l.item_id, motivo: 'ese ítem no es de este proyecto' } };
      }
    }

    /* 0.49.0 · LA PARTIDA. Mike, 29-sep: «dividir por partidas (grupos de
     * cotizaciones) los ítems (…) pestañas, tipo los libros de Excel». Cada
     * cotización aprobada abre su pestaña: sus piezas nacen con la partida
     * que se pida o, si no, con el nombre de la cotización. */
    const datosCot = (cot.datos ?? {}) as Record<string, any>;
    const partida = String(args.partida ?? datosCot.nombre ?? cot.folio ?? '').trim().slice(0, 80);

    const contexto = { app: args.app, usuario_id: args.usuario_id, correo: args.correo };
    let creados = 0;
    let productosNuevos = 0;
    this.ctx.storage.transactionSync(() => {
      args.lineas.forEach((l, i) => {
        const n = Number(l.cantidad);
        const codigo = String(l.codigo ?? '').trim();
        if (l.item_id) {
          /* El requerimiento se aprueba a sí mismo: mismo renglón, con el
           * tipo que se le puso al cotizarlo, su precio, y la partida. Mike,
           * 29-sep: «al aprobarse los requerimientos cambia su código a
           * alguno de mueble, puerta etc.»: la pieza del plano cambia de tipo
           * y estrena código con el prefijo que le toca. */
          const id = String(l.item_id);
          const tipo = String(l.tipo || 'mueble').trim().toLowerCase();
          const estabaDentro = String(this.obtener('items', id)?.estado ?? 'cotizado') === 'vendido';
          const recodificada = this.recodificarPiezas(id, tipo, codigo);
          const clave = recodificada ?? (codigo || null);
          this.sql.exec(
            `UPDATE items SET nombre = ?, descripcion = ?, tipo = ?, clave = COALESCE(?, clave), monto = ?, cantidad = ?,
                    producto_id = COALESCE(?, producto_id), partida = ?, estado = 'vendido',
                    aprobado_at = COALESCE(aprobado_at, ?), cancelado_at = NULL, cancelado_motivo = NULL, actualizado_at = ?
              WHERE id = ?`,
            String(l.nombre).trim(), l.descripcion ?? null, tipo, clave, Number(l.precio) * n, n,
            l.producto_id ? String(l.producto_id) : null, partida, ahora(), ahora(), id,
          );
          this.quitarDelBorrador(id);
          if (!estabaDentro) this.anotarAlcance(id, args.proyecto_id, 'entra', contexto, null);
          this.notaInternaEnLaBitacora(id, l.notas_internas, String(datosCot.nombre || cot.folio || 'la cotización'));
          this.avisar({ t: 'item.cambio', id }, 'todos');
          creados++;
          return;
        }
        let producto_id: string | null = l.producto_id ? String(l.producto_id) : null;
        if (!producto_id && n > 1) {
          /* El código del producto es único en la empresa. Si ya lo usa
           * otro, el producto nuevo nace sin código en vez de tronar la
           * aprobación: el renglón sigue diciendo su código en cada pieza. */
          const ocupado = codigo
            ? this.sql.exec(`SELECT 1 FROM productos WHERE codigo = ?`, codigo).toArray().length > 0
            : false;
          const p = this.crear('productos', {
            codigo: ocupado ? '' : codigo, nombre: String(l.nombre).trim(),
            descripcion: l.descripcion ?? null, tipo: l.tipo || 'mueble', precio: Number(l.precio), moneda: 'MXN',
          }, contexto);
          producto_id = String(p.id);
          productosNuevos++;
        }
        for (let k = 0; k < n; k++) {
          this.crear('items', {
            cliente_id: proyecto.cliente_id, proyecto_id: args.proyecto_id,
            nombre: String(l.nombre).trim(), descripcion: l.descripcion ?? null, tipo: l.tipo || 'mueble',
            clave: codigo || null, monto: Number(l.precio), cantidad: 1, moneda: 'MXN', estado: 'vendido',
            producto_id, partida, origen: { app: 'cotizador101', cotizacion_id: args.cotizacion_id, linea: i + 1 },
          }, contexto);
          creados++;
        }
      });
      const datos = { ...((cot.datos ?? {}) as Record<string, any>) };
      datos.aprobacion = { at: ahora(), por: args.usuario_id, proyecto_id: args.proyecto_id, items: creados };
      this.sql.exec(
        `UPDATE cotizaciones SET estado = 'aceptada', datos = ?, actualizado_at = ? WHERE id = ?`,
        JSON.stringify(datos), ahora(), args.cotizacion_id,
      );
    });
    const p = this.recalcularProyecto(args.proyecto_id)!;
    return { ok: true, cotizacion: this.obtener('cotizaciones', args.cotizacion_id)!, proyecto: p, items: creados, productos_nuevos: productosNuevos };
  }

  /* ─────────────── los requerimientos y su borrador (0.49.0) ───────────────
   *
   * Mike, 29-sep: «los requerimientos generados me deberían generar un
   * borrador en quote dentro del proyecto para poder enviarla al cliente a
   * que me autorice». Y decidió que fuera solo: cada requerimiento que se
   * levanta en quell cae en el borrador abierto del proyecto.
   *
   * Hasta hoy un requerimiento era SÓLO una pieza del plano: no tenía
   * renglón en `items` hasta que alguien ligaba la obra y aceptaba la
   * propuesta. Ahora, si la obra ya está ligada a un proyecto, nace también
   * como ítem cotizado (no suma: `precio_venta` sólo cuenta vendidos) y
   * entra como renglón «a mano» en el borrador «Requerimientos» de quote101.
   * Ahí se le pone precio y tipo, se manda al cliente, y al aprobar la
   * cotización el MISMO ítem queda vendido, en su pestaña, con el código del
   * tipo que le tocó. Nada se duplica.
   *
   * Sin obra ligada no hay proyecto, y sin proyecto no hay dónde cotizar:
   * la pieza se levanta igual y se convierte en ítem al ligar, como antes.
   */

  /** Un requerimiento recién levantado en la obra: su ítem y su renglón en
   *  el borrador. Lo llama el motor de quell al dar de alta la pieza. */
  levantarRequerimiento(d: { element_id: string; obra_id: string; code: string; name: string; usuario_id: string; padre_item_id?: string | null; descripcion?: string | null }): { item_id: string | null; cotizacion_id: string | null } {
    const obra = this.sql.exec(`SELECT proyecto_id FROM quell_projects WHERE id = ?`, d.obra_id).toArray()[0] as Fila | undefined;
    if (!obra?.proyecto_id) return { item_id: null, cotizacion_id: null };
    const proyecto = this.obtener('proyectos', String(obra.proyecto_id));
    if (!proyecto) return { item_id: null, cotizacion_id: null };
    const contexto = { app: 'quell101', usuario_id: d.usuario_id };
    /* 0.77.0 · Mike, 6-oct: la descripción se escribe en quell al levantar
     * el requerimiento y es la que sale en quote101; si viene vacía, se
     * llena allá. */
    const descripcion = String(d.descripcion ?? '').trim();

    const item = this.crear('items', {
      proyecto_id: proyecto.id, cliente_id: proyecto.cliente_id,
      clave: d.code || '', nombre: String(d.name).trim() || 'Requerimiento', tipo: 'requerimiento',
      monto: 0, cantidad: 1, moneda: 'MXN', estado: 'cotizado',
      descripcion: descripcion || 'Requerimiento levantado en la obra. Falta cotizarlo.',
      origen: { de: 'quell', element_id: d.element_id, obra_id: d.obra_id, requerimiento: true },
      /* 0024 · Si nació como complemento de una pieza que ya es un ítem, el
       * ítem nuevo cuelga de ése (subítem). Se pone directo y no por el
       * CRUD: la liga la decide la obra, no la app. */
      ...(d.padre_item_id ? { padre_id: d.padre_item_id } : {}),
    } as unknown as Fila, contexto);
    this.sql.exec(`UPDATE quell_elements SET item_id = ? WHERE id = ?`, String(item.id), d.element_id);

    const cot = this.borradorDeRequerimientos(proyecto, contexto);
    const datos = { ...((cot.datos ?? {}) as Record<string, any>) };
    const versiones: Array<Record<string, any>> = Array.isArray(datos.versiones) && datos.versiones.length
      ? datos.versiones : [{ fecha: ahora(), muebles: [], totalFinal: 0 }];
    /* El renglón, en la forma que quote101 guarda los escritos a mano:
     * `manual: true`, precio en PESOS (así vive `datos`), y `item_id` para
     * que al aprobar se sepa que es éste y no uno nuevo. */
    const mueble = {
      id: String(item.id), manual: true, item_id: String(item.id), tipo: 'mueble',
      codigo: d.code || '', nombre: String(item.nombre), descripcion,
      qty: 1, precio: 0, total: 0, componentes: [], imagenes: [],
    };
    const primera = { ...versiones[0], muebles: [...(Array.isArray(versiones[0].muebles) ? versiones[0].muebles : []), mueble] };
    datos.versiones = [primera, ...versiones.slice(1)];
    this.sql.exec(`UPDATE cotizaciones SET datos = ?, actualizado_at = ? WHERE id = ?`, JSON.stringify(datos), ahora(), String(cot.id));
    return { item_id: String(item.id), cotizacion_id: String(cot.id) };
  }

  /** El borrador de requerimientos del proyecto: uno abierto por proyecto.
   *  Cuando se aprueba deja de ser borrador, y el siguiente requerimiento
   *  abre otro. */
  private borradorDeRequerimientos(proyecto: Fila, contexto: { app: string; usuario_id: string }): Fila {
    const abiertas = this.sql
      .exec(`SELECT id, datos FROM cotizaciones WHERE estado = 'borrador' ORDER BY creado_at`)
      .toArray() as Fila[];
    for (const c of abiertas) {
      let datos: Record<string, any> = {};
      try { datos = typeof c.datos === 'string' ? JSON.parse(c.datos) : ((c.datos ?? {}) as Record<string, any>); } catch { datos = {}; }
      if (datos.de_requerimientos === true && String(datos.proyecto_id ?? '') === String(proyecto.id)) return this.obtener('cotizaciones', String(c.id))!;
    }
    return this.crear('cotizaciones', {
      cliente_id: proyecto.cliente_id, total: 0, moneda: 'MXN', estado: 'borrador',
      datos: {
        nombre: 'Requerimientos', proyecto_id: proyecto.id, de_requerimientos: true,
        versiones: [{ fecha: ahora(), muebles: [], totalFinal: 0 }],
      },
    } as unknown as Fila, contexto);
  }

  /** Saca un ítem de los borradores de requerimientos donde ande: se
   *  descartó, o se aprobó por otro camino y ya no está pendiente del
   *  cliente. Lo aprobado en quote101 ya no es borrador y no se toca. */
  private quitarDelBorrador(item_id: string): number {
    if (!this.sql.exec(`SELECT 1 AS x FROM items WHERE id = ?`, item_id).toArray().length) return 0;
    const abiertas = this.sql
      .exec(`SELECT id, datos FROM cotizaciones WHERE estado = 'borrador'`)
      .toArray() as Fila[];
    let quitados = 0;
    for (const c of abiertas) {
      let datos: Record<string, any> = {};
      try { datos = typeof c.datos === 'string' ? JSON.parse(c.datos) : ((c.datos ?? {}) as Record<string, any>); } catch { continue; }
      if (datos.de_requerimientos !== true || !Array.isArray(datos.versiones)) continue;
      let toco = false;
      datos.versiones = datos.versiones.map((v: Record<string, any>) => {
        if (!Array.isArray(v.muebles)) return v;
        const quedan = v.muebles.filter((m: Record<string, any>) => String(m?.item_id ?? '') !== item_id);
        if (quedan.length !== v.muebles.length) toco = true;
        return { ...v, muebles: quedan };
      });
      if (!toco) continue;
      this.sql.exec(`UPDATE cotizaciones SET datos = ?, actualizado_at = ? WHERE id = ?`, JSON.stringify(datos), ahora(), String(c.id));
      quitados++;
    }
    return quitados;
  }

  /** Las piezas del plano de un ítem que se aprueba con un tipo: cambian de
   *  tipo y, si venían como requerimiento (o si el tipo cambió), estrenan
   *  código con el prefijo del tipo, propuesto por obra con la misma regla
   *  de siempre. Devuelve el código de la primera pieza (para `items.clave`)
   *  o null si el ítem no tiene pieza en ningún plano. */
  private recodificarPiezas(item_id: string, tipo: string, codigoPedido: string): string | null {
    const piezas = this.sql
      .exec(`SELECT id, project_id, code, type FROM quell_elements WHERE item_id = ? ORDER BY code`, item_id)
      .toArray() as Fila[];
    if (!piezas.length) return null;
    const tipoQuell = TIPO_EN_QUELL[tipo] ?? 'Otro';
    let primera: string | null = null;
    for (const pz of piezas) {
      const obra = String(pz.project_id);
      const mismoTipo = String(pz.type ?? '') === tipoQuell;
      let nuevo = String(pz.code ?? '');
      if (codigoPedido && piezas.length === 1) nuevo = codigoPedido;
      else if (!mismoTipo && PREFIJOS[tipoQuell]) {
        const delaObra = this.sql.exec(`SELECT code FROM quell_elements WHERE project_id = ?`, obra).toArray() as Array<{ code?: string }>;
        nuevo = siguienteCodigo(delaObra, tipoQuell) || nuevo;
      }
      try {
        this.sql.exec(`UPDATE quell_elements SET code = ?, type = ? WHERE id = ?`, nuevo, tipoQuell, String(pz.id));
      } catch {
        /* El código pedido ya lo tiene otra pieza de la obra: se propone
         * uno con la regla de siempre en vez de reventar la aprobación. */
        const delaObra = this.sql.exec(`SELECT code FROM quell_elements WHERE project_id = ?`, obra).toArray() as Array<{ code?: string }>;
        nuevo = siguienteCodigo(delaObra, tipoQuell) || String(pz.code ?? '');
        this.sql.exec(`UPDATE quell_elements SET code = ?, type = ? WHERE id = ?`, nuevo, tipoQuell, String(pz.id));
      }
      if (primera === null) primera = nuevo;
    }
    return primera;
  }

  /** Alta de un archivo ya subido a R2. Va aparte del CRUD genérico porque el
   *  Worker necesita la fila de vuelta con tipos concretos y porque nadie
   *  escribe `archivos` a mano: siempre es consecuencia de una subida. */
  registrarArchivo(datos: {
    id: string; r2_key: string; nombre: string; mime: string | null; bytes: number;
    de_tabla: string; de_id: string; subido_por: string;
  }): Fila | null {
    this.sql.exec(
      `INSERT INTO archivos (id, r2_key, nombre, mime, bytes, de_tabla, de_id, subido_por, creado_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      datos.id, datos.r2_key, datos.nombre, datos.mime, datos.bytes,
      datos.de_tabla, datos.de_id, datos.subido_por, ahora(),
    );
    return this.obtener('archivos', datos.id)!;
  }

  /* ─────────────── puerta de servicio: importación (fase 2) ───────────────
   *
   * ESTO NO ES UNA RUTA NORMAL. Entra por debajo de `permisos.ts` a propósito
   * y escribe columnas que ninguna app puede escribir: `etapa`, `creado_at`,
   * `creado_por`, los ids que vengan. Existe para una sola cosa —traer lo que
   * ya vivía en Firestore sin inventarle historial— y solo la alcanza el
   * superadmin por `POST /admin/importar`. Si alguien la encuentra abierta
   * dentro de un año: es la puerta de servicio de la migración, y la razón de
   * que exista está en `claude/CONTINUAR.md`.
   *
   * Escribe por id, así que correrla dos veces no duplica: la segunda vez
   * actualiza las mismas filas. `seco` hace el trabajo completo dentro de una
   * transacción y la deshace al final, para poder medir sin escribir.
   */

  importar(args: { filas: Record<string, Fila[]>; seco: boolean }): Importacion {
    const antes = this.contarFilas();
    const salida: Importacion = {
      antes,
      despues: antes,
      nuevas: {},
      actualizadas: {},
      fallos: [],
      sumas: {},
      sumas_importadas: {},
      muestra: [],
      enlaces: { movimientos_con_item: 0, item_que_no_existe: [] },
      proyectos_recalculados: 0,
      folios_asignados: 0,
    };

    const trabajo = (): void => {
      // El orden de TABLAS ya respeta las dependencias: clientes antes que
      // proyectos, proyectos antes que ítems, ítems antes que movimientos.
      for (const tabla of TABLAS) {
        const filas = args.filas[tabla];
        if (!filas?.length) continue;
        let nuevas = 0;
        let actualizadas = 0;
        for (const fila of filas) {
          try {
            if (this.grabarImportada(tabla, fila)) nuevas++;
            else actualizadas++;
          } catch (e) {
            salida.fallos.push({ tabla, id: String(fila.id ?? '(sin id)'), motivo: (e as Error).message });
          }
        }
        salida.nuevas[tabla] = nuevas;
        salida.actualizadas[tabla] = actualizadas;
      }

      /* El folio de las cotizaciones que llegaron sin uno.
       *
       * Se pone AQUÍ y no en el mapeo por dos razones. Una: el contador vive
       * en esta base, y una cuenta paralela en el importador se desalinearía
       * con la del contrato 0.9.0 en cuanto alguien cotizara. Dos:
       * `siguienteFolio` se salta los folios ya ocupados, así que los que la
       * mudanza trae congelados no chocan con los que se asignan, y al final
       * el contador queda solo después del último — sin acomodarlo a mano.
       *
       * En orden de `creado_at` para que los números salgan en el orden en que
       * las cotizaciones se hicieron, no en el que el árbol venía armado.
       *
       * Las que ya tenían folio no entran: si entraran, una segunda corrida le
       * cambiaría el folio a una cotización que ya salió impresa. */
      if (args.filas.cotizaciones?.length) {
        const sinFolio = this.sql
          .exec(`SELECT id FROM cotizaciones WHERE folio IS NULL OR folio = '' ORDER BY creado_at, id`)
          .toArray() as Fila[];
        for (const f of sinFolio) {
          this.sql.exec(`UPDATE cotizaciones SET folio = ? WHERE id = ?`, this.siguienteFolio(), f.id);
        }
        salida.folios_asignados = sinFolio.length;
      }

      // Los cachés del proyecto NO se importan: se recalculan aquí, una vez
      // por proyecto y no una vez por fila. Importar un caché sería importar
      // una opinión de otra base sobre lo que suman estos movimientos.
      const proyectos = this.sql.exec(`SELECT id FROM proyectos`).toArray() as Fila[];
      for (const p of proyectos) this.recalcularProyecto(String(p.id));
      salida.proyectos_recalculados = proyectos.length;

      // Que un movimiento apunte a un ítem que no existe se dice, no se calla:
      // es justo el enlace que la migración tiene que conservar.
      const conItem = this.sql
        .exec(`SELECT m.id, m.item_id FROM movimientos m WHERE m.item_id IS NOT NULL`)
        .toArray() as Fila[];
      salida.enlaces.movimientos_con_item = conItem.length;
      for (const m of conItem) {
        const hay = this.sql.exec(`SELECT 1 AS x FROM items WHERE id = ?`, m.item_id).toArray().length;
        if (!hay) salida.enlaces.item_que_no_existe.push(String(m.id));
      }

      salida.despues = this.contarFilas();
      salida.sumas = this.sumarDinero();
      salida.sumas_importadas = this.sumarDineroDe(args.filas);
      salida.muestra = this.muestraDeIds();
    };

    if (args.seco) {
      // Se hace el trabajo de verdad y se deshace: es la única manera de que
      // un ensayo mida lo mismo que la corrida buena, incluidos los CHECK del
      // esquema, que solo gritan cuando se escribe.
      const marcha = new Error('__ensayo__');
      try {
        this.ctx.storage.transactionSync(() => {
          trabajo();
          throw marcha;
        });
      } catch (e) {
        if (e !== marcha) throw e;
      }
      return salida;
    }

    this.ctx.storage.transactionSync(trabajo);
    return salida;
  }

  /** Una fila importada. Devuelve `true` si era nueva. */
  private grabarImportada(tabla: Tabla, datos: Fila): boolean {
    const def = DEFS[tabla];
    const id = String(datos.id ?? '').trim();
    if (!id) throw new Error('la fila no trae id');

    const fila: Fila = { ...datos, id };
    // `nombre_norm` lo pone la API, nunca el importador (CONTINUAR §5).
    if (def.cols.nombre_norm) fila.nombre_norm = normalizar(datos.nombre_norm ?? datos.nombre);
    if (def.cols.creado_at && !fila.creado_at) fila.creado_at = ahora();
    if (def.cols.creado_por && !fila.creado_por) fila.creado_por = 'importacion';
    if (def.cols.creado_en_app && !fila.creado_en_app) fila.creado_en_app = 'importacion';

    const cols = Object.keys(fila).filter((c) => c in def.cols);
    const valores = cols.map((c) => this.adentro(def.cols[c], fila[c]));
    const existe = this.sql.exec(`SELECT 1 AS x FROM ${tabla} WHERE id = ?`, id).toArray().length > 0;

    if (existe) {
      const set = cols.filter((c) => c !== 'id');
      if (set.length) {
        this.sql.exec(
          `UPDATE ${tabla} SET ${set.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
          ...set.map((c) => this.adentro(def.cols[c], fila[c])),
          id,
        );
      }
      return false;
    }

    this.sql.exec(
      `INSERT INTO ${tabla} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      ...valores,
    );
    return true;
  }

  private contarFilas(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of TABLAS) out[t] = (this.sql.exec(`SELECT COUNT(*) AS n FROM ${t}`).one() as { n: number }).n;
    return out;
  }

  /** Toda la plata que hay en la base, en centavos, columna por columna. Es la
   *  cifra que tiene que cuadrar contra Firestore. Desde 0002 las partidas son
   *  una tabla como las demás y un SUM las alcanza: ya no hay JSON que abrir. */
  private sumarDinero(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const tabla of TABLAS) {
      for (const [col, tipo] of Object.entries(DEFS[tabla].cols)) {
        if (tipo !== 'dinero') continue;
        out[`${tabla}.${col}`] = (this.sql
          .exec(`SELECT COALESCE(SUM(${col}),0) AS s FROM ${tabla}`)
          .one() as { s: number }).s;
      }
    }
    return out;
  }

  /** La plata de un puñado de filas concretas, leída de la base por su id.
   *  Se hace en tandas porque un `IN (?)` con demasiados marcadores no lo
   *  aguanta SQLite, y porque un día habrá más de dos proyectos. */
  private sumarDineroDe(filas: Record<string, Fila[]>): Record<string, number> {
    const out: Record<string, number> = {};
    const TANDA = 200;
    for (const tabla of TABLAS) {
      const ids = (filas[tabla] ?? []).map((f) => String(f.id ?? '')).filter(Boolean);
      if (!ids.length) continue;
      for (const [col, tipo] of Object.entries(DEFS[tabla].cols)) {
        if (tipo !== 'dinero') continue;
        let suma = 0;
        for (let i = 0; i < ids.length; i += TANDA) {
          const tanda = ids.slice(i, i + TANDA);
          suma += (this.sql
            .exec(`SELECT COALESCE(SUM(${col}),0) AS s FROM ${tabla} WHERE id IN (${tanda.map(() => '?').join(',')})`, ...tanda)
            .one() as { s: number }).s;
        }
        out[`${tabla}.${col}`] = suma;
      }
    }
    return out;
  }

  /** Tres ids por tabla, releídos de la base. Para poder enseñar el mismo id
   *  de los dos lados en vez de afirmarlo. */
  private muestraDeIds(): Array<{ tabla: string; id: string }> {
    const out: Array<{ tabla: string; id: string }> = [];
    for (const t of TABLAS) {
      for (const f of this.sql.exec(`SELECT id FROM ${t} LIMIT 3`).toArray() as Fila[]) {
        out.push({ tabla: t, id: String(f.id) });
      }
    }
    return out;
  }

  /** Cuántas filas y cuánto dinero hay ahora. Lo lee el reporte de cuadre sin
   *  tener que importar nada. */
  conteos(): { filas: Record<string, number>; sumas: Record<string, number> } {
    return { filas: this.contarFilas(), sumas: this.sumarDinero() };
  }

  conteosQuell(): Record<string, number> { return this.contarTablas(TABLAS_QUELL); }
  conteosRoster(): Record<string, number> { return this.contarTablas(TABLAS_ROSTER); }

  /**
   * Lo de quote101 de la empresa, en cuatro cifras. Sólo lee.
   *
   * Nació el 23-sep-2026 como una lista POR NEGOCIO con huérfanos: Mike,
   * «desapareció mi info de quote», y lo que había pasado era que un negocio
   * borrado dejaba clientes y cotizaciones apuntando a nada. Desde 0.63.0 no
   * hay negocios ni `negocio_id`, así que no hay de qué quedar huérfano: lo
   * que hay en estas tablas es de la empresa y se cuenta entero.
   */
  conteosQuote(): ConteoQuote {
    const n = (t: 'clientes' | 'proyectos' | 'cotizaciones'): number =>
      Number((this.sql.exec(`SELECT COUNT(*) AS n FROM ${t}`).one() as { n: number }).n);
    const ultima = this.sql.exec(`SELECT MAX(COALESCE(actualizado_at, creado_at)) AS u FROM cotizaciones`).one() as { u: string | null };
    return { clientes: n('clientes'), proyectos: n('proyectos'), cotizaciones: n('cotizaciones'), ultima_cotizacion: ultima?.u ?? null };
  }

  private contarTablas(tablas: readonly string[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of tablas) out[t] = (this.sql.exec(`SELECT COUNT(*) AS n FROM ${t}`).one() as { n: number }).n;
    return out;
  }


  /* ─────────────── órdenes de compra (0008) ───────────────
   * Encargo de dash101 del 19-sep. Lo que está aquí adentro y no en el Worker
   * es lo que tiene que pasar TODO O NADA: pagar una orden crea el egreso,
   * la liga, deja el evento y recalcula los cachés del proyecto. Un solo hilo
   * por empresa, así que aquí no hay carreras ni transacciones distribuidas.
   *
   * Los permisos NO están aquí: se resuelven en el Worker, antes de llegar
   * (§7). Lo que sí está es la regla de negocio —una orden pagada no se
   * vuelve a pagar—, porque eso no es un permiso: es la verdad de la base.
   */

  /** La fila de `personal` de un usuario de la suite, si la tiene. Un socio o
   *  la oficina pueden no estar en `personal` y aun así pedir compras. */
  personalDeUsuario(usuario_id: string): Fila | null {
    const f = this.sql.exec(`SELECT * FROM personal WHERE usuario_id = ? LIMIT 1`, usuario_id).toArray()[0];
    return (f as Fila) ?? null;
  }

  /* Las tablas de 0008 y 0009 NO están en DEFS: no salen por el CRUD
   * genérico, así que `obtener()` no las conoce (usa DEFS para saber qué
   * columna es booleana o JSON). Este lector hace lo mismo para ellas, y de
   * paso deja dicho qué columnas son 0/1 en SQLite y true/false hacia
   * afuera: una pantalla que recibe `1` y espera `true` pinta la casilla al
   * revés, y eso no truena, sólo miente. */
  /* Los dos tipos de orden (0.47.0). El CHECK no cabe en un ALTER de
   * SQLite, así que la lista vive aquí y `crearOrden` la aplica. */
  private static readonly BOOLS_INTERNAS: Record<string, readonly string[]> = {
    ordenes: ['con_factura', 'urgente'],
  };

  private filaInterna(tabla: string, f: Fila | undefined | null): Fila | null {
    if (!f) return null;
    const bools = OrgDB.BOOLS_INTERNAS[tabla] ?? [];
    const out: Fila = { ...f };
    for (const b of bools) if (out[b] !== undefined && out[b] !== null) out[b] = out[b] === 1 || out[b] === true;
    return out;
  }

  private leerInterna(tabla: string, id: string): Fila | null {
    return this.filaInterna(tabla, this.sql.exec(`SELECT * FROM ${tabla} WHERE id = ?`, id).toArray()[0] as Fila | undefined);
  }

  private leerInternas(tabla: string, filas: Fila[]): Fila[] {
    return filas.map((f) => this.filaInterna(tabla, f)!);
  }

  /** La fila de `personal` de un usuario, creándola si no la tiene.
   *
   *  Hace falta porque «contador» es una etiqueta de `personal` y hay gente
   *  de la empresa que NO está en `personal`: esa tabla la llenan roster101 y
   *  quell101, y una empresa que sólo usa dash101 no tiene ninguna fila. Sin
   *  esto, la decisión de Mike —«se le asigna a cualquier miembro, y el dueño
   *  y el administrador se marcan los dos»— no se podría cumplir en la mitad
   *  de las empresas.
   *
   *  Crea lo mínimo: nombre, correo y el enlace al usuario. No inventa
   *  puesto ni permisos de otras apps. */
  asegurarPersonal(args: { usuario_id: string; nombre: string; correo?: string | null }): Fila {
    const ya = this.sql.exec(`SELECT * FROM personal WHERE usuario_id = ? LIMIT 1`, args.usuario_id).toArray()[0];
    if (ya) return ya as Fila;
    const id = ulid();
    this.sql.exec(
      `INSERT INTO personal (id, nombre, nombre_norm, correo, activo, usuario_id, creado_en_app, creado_at)
       VALUES (?,?,?,?,1,?,'dash101',?)`,
      id, args.nombre, normalizar(args.nombre), args.correo ?? null, args.usuario_id, ahora(),
    );
    return this.obtener('personal', id)!;
  }

  /** ¿Este usuario puede pagar? Lo dice su etiqueta, no su rol. */
  esContador(usuario_id: string): boolean {
    const f = this.sql
      .exec(`SELECT es_contador FROM personal WHERE usuario_id = ? LIMIT 1`, usuario_id)
      .toArray()[0] as { es_contador: number } | undefined;
    return !!f && f.es_contador === 1;
  }

  /** ¿Puede ver y mover la raya?
   *
   *  Etiqueta aparte de `es_contador`, y no es purismo: pagarle a un
   *  proveedor y saber cuánto gana cada quien son dos cosas distintas, y la
   *  segunda es la que nadie quiere que ande suelta en la oficina. */
  esDeNominas(usuario_id: string): boolean {
    const f = this.sql
      .exec(`SELECT es_nominas FROM personal WHERE usuario_id = ? LIMIT 1`, usuario_id)
      .toArray()[0] as { es_nominas: number } | undefined;
    return !!f && f.es_nominas === 1;
  }

  /** Enciende o apaga la etiqueta de nóminas y lo deja apuntado, en la misma
   *  bitácora que la de contador: quién pudo ver los sueldos y desde cuándo
   *  es parte de la misma historia. */
  marcarNominas(args: { personal_id: string; valor: boolean; quien_usuario_id: string; quien_nombre?: string | null }): Fila | null {
    const persona = this.sql.exec(`SELECT id, nombre FROM personal WHERE id = ?`, args.personal_id).toArray()[0] as Fila | undefined;
    if (!persona) return null;
    this.sql.exec(`UPDATE personal SET es_nominas = ? WHERE id = ?`, args.valor ? 1 : 0, args.personal_id);
    this.apuntarOrden({
      orden_id: null,
      que: 'nominas',
      quien_usuario_id: args.quien_usuario_id,
      quien_nombre: args.quien_nombre ?? null,
      sobre_personal_id: args.personal_id,
      nota: args.valor ? `${persona.nombre} ya puede ver y pagar la raya` : `${persona.nombre} ya no puede ver la raya`,
    });
    return this.obtener('personal', args.personal_id);
  }

  /** Enciende o apaga la etiqueta de contador y lo deja apuntado. Quién puede
   *  llamarla lo decide el Worker (sólo el dueño). */
  marcarContador(args: { personal_id: string; valor: boolean; quien_usuario_id: string; quien_nombre?: string | null }): Fila | null {
    const persona = this.sql.exec(`SELECT id, nombre FROM personal WHERE id = ?`, args.personal_id).toArray()[0] as Fila | undefined;
    if (!persona) return null;
    this.sql.exec(`UPDATE personal SET es_contador = ? WHERE id = ?`, args.valor ? 1 : 0, args.personal_id);
    this.apuntarOrden({
      orden_id: null,
      que: 'contador',
      quien_usuario_id: args.quien_usuario_id,
      quien_nombre: args.quien_nombre ?? null,
      sobre_personal_id: args.personal_id,
      nota: args.valor ? `${persona.nombre} ya puede pagar órdenes` : `${persona.nombre} ya no puede pagar órdenes`,
    });
    return this.obtener('personal', args.personal_id);
  }

  private apuntarOrden(e: {
    orden_id: string | null; que: EventoOrden; quien_usuario_id: string;
    quien_nombre?: string | null; sobre_personal_id?: string | null; nota?: string | null;
  }): void {
    this.sql.exec(
      `INSERT INTO orden_eventos (id, orden_id, que, quien_usuario_id, quien_nombre, sobre_personal_id, nota, ts)
       VALUES (?,?,?,?,?,?,?,?)`,
      ulid(), e.orden_id, e.que, e.quien_usuario_id, e.quien_nombre ?? null,
      e.sobre_personal_id ?? null, e.nota ?? null, ahora(),
    );
  }

  /** El desglose: se captura el TOTAL y la suite lo separa.
   *
   *  Se parte del total hacia atrás —subtotal = total / (1 + tasa)— y el IVA
   *  es la resta, nunca otra multiplicación. Así `subtotal + iva` da el total
   *  exacto siempre, sin un peso perdido por redondeo. $1,160 al 16 % da
   *  1 000 00 y 160 00, que es justo lo que pidió la prueba del encargo.
   *
   *  Sin factura NO se inventa un desglose: subtotal es el total y el IVA es
   *  cero, para que la suma siga cuadrando y nada entre al IVA del mes. */
  private desglosar(monto: number, con_factura: boolean, tasa: number, dados?: { subtotal?: number; iva?: number }):
    { subtotal: number; iva: number; tasa_iva: number } | { error: string } {
    if (!con_factura) return { subtotal: monto, iva: 0, tasa_iva: 0 };
    if (dados && (dados.subtotal !== undefined || dados.iva !== undefined)) {
      const subtotal = Math.round(Number(dados.subtotal ?? 0));
      const iva = Math.round(Number(dados.iva ?? 0));
      if (subtotal < 0 || iva < 0) return { error: 'desglose_negativo' };
      if (subtotal + iva !== monto) return { error: 'desglose_no_cuadra' };
      return { subtotal, iva, tasa_iva: subtotal > 0 ? Math.round((iva * 10000) / subtotal) : 0 };
    }
    const t = Number.isFinite(tasa) && tasa >= 0 ? Math.round(tasa) : 1600;
    const subtotal = Math.round((monto * 10000) / (10000 + t));
    return { subtotal, iva: monto - subtotal, tasa_iva: t };
  }

  crearOrden(args: {
    solicitante_usuario_id: string; solicitante_id?: string | null;
    solicitante_correo?: string | null; solicitante_nombre?: string | null;
    proveedor_id?: string | null; proveedor_nombre?: string | null;
    proyecto_id?: string | null; partida_id?: string | null;
    concepto: string; monto: number; moneda?: string;
    con_factura?: boolean; subtotal?: number; iva?: number; tasa_iva?: number;
    fecha_maxima_pago?: string | null; urgente?: boolean;
    /** `compra` (lo de siempre) o `reembolso` (0.47.0): alguien ya puso el
     *  dinero y se le regresa. Mismo camino, otra serie de folio y otra
     *  categoría en el egreso. Sin él, es compra. */
    tipo?: TipoOrden;
    /** 0.92.0 · Sólo en un reembolso: la cuenta a la que se le paga a quien
     *  lo pide. Si viene, se guarda como SU cuenta (una por usuario) y se
     *  copia en la orden; si no viene, se usa la que ya tenía guardada; y si
     *  no tiene ninguna, el reembolso no se pide: `falta_cuenta_reembolso`.
     *  La CLABE llega ya revisada por el Worker. */
    cuenta?: { clabe: string; banco?: string | null; beneficiario?: string | null } | null;
  }): Fila | { error: string; detalle?: unknown } {
    const monto = Math.round(Number(args.monto));
    if (!Number.isFinite(monto) || monto <= 0) return { error: 'monto_invalido' };
    if (!String(args.concepto ?? '').trim()) return { error: 'falta_concepto' };
    const tipo: TipoOrden = args.tipo ?? 'compra';
    if (!TIPOS_ORDEN.includes(tipo)) return { error: 'tipo_invalido', detalle: { tipo: args.tipo, acepta: TIPOS_ORDEN } };
    const d = this.desglosar(monto, !!args.con_factura, Number(args.tasa_iva ?? 1600), { subtotal: args.subtotal, iva: args.iva });
    if ('error' in d) return { error: d.error, detalle: { monto, subtotal: args.subtotal, iva: args.iva } };

    /* Un reembolso sin cuenta a dónde pagarlo no entra al buzón: es la regla
     * de Mike (10-oct), y se cierra aquí, no en la pantalla. */
    let cuenta: CuentaDeReembolso | null = null;
    if (tipo === 'reembolso') {
      cuenta = args.cuenta?.clabe
        ? this.guardarCuentaDeReembolso({ usuario_id: args.solicitante_usuario_id, ...args.cuenta, beneficiario: args.cuenta.beneficiario || args.solicitante_nombre || null })
        : this.cuentaDeReembolsoDe(args.solicitante_usuario_id);
      if (!cuenta) return { error: 'falta_cuenta_reembolso', detalle: { mensaje: 'Para pedir un reembolso hace falta la cuenta a la que se te paga: la CLABE, el banco y a nombre de quién está.' } };
    }

    const id = ulid();
    const serie = tipo === 'reembolso' ? 'RE' : 'OC';
    const folio = `${serie}-${String(this.apartarNumero(serie)).padStart(6, '0')}`;
    const t = ahora();
    this.sql.exec(
      `INSERT INTO ordenes (id, folio, tipo, solicitante_usuario_id, solicitante_id, solicitante_correo,
        solicitante_nombre, proveedor_id, proveedor_nombre, proyecto_id, partida_id, concepto, monto, moneda,
        con_factura, subtotal, iva, tasa_iva, fecha_maxima_pago, urgente, estado, creado_at,
        reembolso_clabe, reembolso_banco, reembolso_beneficiario)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'en_buzon',?,?,?,?)`,
      id, folio, tipo, args.solicitante_usuario_id, args.solicitante_id ?? null,
      args.solicitante_correo ?? null, args.solicitante_nombre ?? null,
      args.proveedor_id ?? null, args.proveedor_nombre ?? null,
      args.proyecto_id ?? null, args.partida_id ?? null,
      String(args.concepto).trim(), monto, args.moneda ?? 'MXN',
      args.con_factura ? 1 : 0, d.subtotal, d.iva, d.tasa_iva,
      args.fecha_maxima_pago ?? null, args.urgente ? 1 : 0, t,
      cuenta?.clabe ?? null, cuenta?.banco ?? null, cuenta ? (cuenta.beneficiario ?? args.solicitante_nombre ?? null) : null,
    );
    this.apuntarOrden({
      orden_id: id, que: 'creada', quien_usuario_id: args.solicitante_usuario_id,
      quien_nombre: args.solicitante_nombre ?? null,
      nota: tipo === 'reembolso'
        ? `${args.concepto} · reembolso a ${args.solicitante_nombre ?? 'quien lo pidió'}`
        : `${args.concepto} · ${args.proveedor_nombre ?? 'sin proveedor'}`,
    });
    this.avisar({ t: 'orden.nueva', id, folio, monto, tipo } as unknown as Aviso, 'dinero');
    return this.leerInterna('ordenes', id)!;
  }

  /* ─────────────── 0.92.0 · la cuenta a la que se reembolsa ───────────────
   * Mike, 10-oct-2026: un reembolso se le paga SÓLO a quien lo pidió. Una
   * cuenta por usuario (0050), por `usuario_id` y no por `personal`, porque
   * quien pide puede no tener fila ahí. Se pide la primera vez y se reusa. */
  cuentaDeReembolsoDe(usuario_id: string): CuentaDeReembolso | null {
    const f = this.sql.exec(`SELECT * FROM reembolso_cuentas WHERE usuario_id = ?`, usuario_id).toArray()[0] as Fila | undefined;
    return f ? OrgDB.cuentaDeReembolso_(f) : null;
  }

  guardarCuentaDeReembolso(args: { usuario_id: string; clabe: string; banco?: string | null; beneficiario?: string | null }): CuentaDeReembolso {
    const limpio = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).trim());
    this.sql.exec(
      `INSERT INTO reembolso_cuentas (usuario_id, clabe, banco, beneficiario, actualizado_at) VALUES (?,?,?,?,?)
       ON CONFLICT(usuario_id) DO UPDATE SET clabe = excluded.clabe, banco = excluded.banco, beneficiario = excluded.beneficiario, actualizado_at = excluded.actualizado_at`,
      args.usuario_id, String(args.clabe), limpio(args.banco), limpio(args.beneficiario), ahora(),
    );
    return this.cuentaDeReembolsoDe(args.usuario_id)!;
  }

  private static cuentaDeReembolso_(f: Fila): CuentaDeReembolso {
    const texto = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v));
    return { clabe: String(f.clabe), banco: texto(f.banco), beneficiario: texto(f.beneficiario), actualizado_at: String(f.actualizado_at) };
  }

  /** Lo que ve quien pidió: SÓLO lo suyo. El filtro va aquí y no en la
   *  pantalla; una pantalla que filtra es una pantalla que se puede saltar. */
  misOrdenes(usuario_id: string): Fila[] {
    const filas = this.sql.exec(`SELECT * FROM ordenes WHERE solicitante_usuario_id = ? ORDER BY creado_at DESC`, usuario_id).toArray() as Fila[];
    return this.leerInternas('ordenes', filas);
  }

  /** El buzón del contador: lo que vence primero, arriba. Las que ya vencieron
   *  van antes que todo, que es como se lee una bandeja de pagos. */
  buzon(hoy?: string, tipo?: TipoOrden | null): { filas: Fila[]; total: number; vence_esta_semana: number; vencidas: number } {
    const dia = (hoy ?? ahora()).slice(0, 10);
    // El buzón y sus TOTALES son de toda la empresa. Los totales tienen que
    // salir de la misma consulta que la lista o el número de arriba
    // contradice a los renglones de abajo, que ya fue un defecto real el
    // 7-sep.
    //
    // Con `tipo` (0.47.0), sólo las compras o sólo los reembolsos: son las
    // dos pestañas del buzón, y cada una suma lo suyo. Sin él, todo junto.
    const condiciones = [`estado = 'en_buzon'`];
    const valores: SqlStorageValue[] = [];
    if (tipo) { condiciones.push('tipo = ?'); valores.push(tipo); }
    const filas = this.leerInternas('ordenes', this.sql.exec(
      `SELECT * FROM ordenes WHERE ${condiciones.join(' AND ')}
       ORDER BY (fecha_maxima_pago IS NULL), fecha_maxima_pago ASC, creado_at ASC`, ...valores,
    ).toArray() as Fila[]);
    const enOchoDias = new Date(Date.parse(`${dia}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
    let total = 0, semana = 0, vencidas = 0;
    for (const f of filas) {
      const m = Number(f.monto || 0);
      total += m;
      const v = f.fecha_maxima_pago ? String(f.fecha_maxima_pago) : null;
      if (v && v < dia) { vencidas++; semana += m; } else if (v && v <= enOchoDias) semana += m;
    }
    return { filas, total, vence_esta_semana: semana, vencidas };
  }

  /** El historial de lo pagado (0.59.0). Mike, 1-oct: «quiero ver en la
   *  pantalla de compras un historial completo de las órdenes de compra ya
   *  pagadas». La más reciente arriba, por la fecha en que se pagó. Con
   *  `tipo`, sólo compras o sólo reembolsos. `total` es la suma de lo que
   *  se lista. Lo lee quien paga,
   *  como el buzón: es la otra mitad de la misma bandeja. */
  /** Los expedientes de roster101, resumidos para escoger a uno como
   *  accionista (0.60.0). Mike, 1-oct: «en el menú de accionistas, se debe
   *  poder jalar al accionista de la base de datos de roster». El nombre va
   *  armado; quien todavía no llena su ficha sale con su correo, como en la
   *  nómina: un renglón vacío en una lista de gente no sirve para escoger. */
  accionistasDeRoster(): Array<{ id: string; nombre: string; rfc: string; correo: string; puesto: string }> {
    return (this.sql
      .exec(`SELECT id, nombre, apellido_paterno, apellido_materno, rfc, email, puesto
             FROM roster_trabajadores ORDER BY nombre, apellido_paterno, email`)
      .toArray() as Fila[]).map((t) => {
      const nombre = [t.nombre, t.apellido_paterno, t.apellido_materno].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ');
      return {
        id: String(t.id), nombre: nombre || String(t.email ?? ''), rfc: String(t.rfc ?? ''),
        correo: String(t.email ?? ''), puesto: String(t.puesto ?? ''),
      };
    });
  }

  ordenesPagadas(tipo?: TipoOrden | null, limite = 500): { filas: Fila[]; total: number } {
    const condiciones = [`estado = 'pagada'`];
    const valores: SqlStorageValue[] = [];
    if (tipo) { condiciones.push('tipo = ?'); valores.push(tipo); }
    const filas = this.leerInternas('ordenes', this.sql.exec(
      `SELECT * FROM ordenes WHERE ${condiciones.join(' AND ')}
       ORDER BY pagada_at DESC, creado_at DESC LIMIT ?`, ...valores, Math.max(1, Math.min(5000, limite)),
    ).toArray() as Fila[]);
    return { filas, total: filas.reduce((s, f) => s + Number(f.monto || 0), 0) };
  }

  /** Lo que hay en el buzón, en dos números: cuánto en compras y cuánto en
   *  reembolsos (0.47.0). Es para el inicio de dash101, que Mike pidió con
   *  «el total de reembolsos pendientes en la pantalla inicial junto con los
   *  otros totales», y que resta esa suma del capital de la empresa. Lo lee
   *  quien ve dinero, no sólo quien paga: es una cifra del tablero, no el
   *  buzón —los renglones no salen por aquí. */
  pendientesDeOrdenes(): { compras: { total: number; cuantas: number }; reembolsos: { total: number; cuantas: number } } {
    const filas = this.sql
      .exec(`SELECT tipo, COUNT(*) AS n, COALESCE(SUM(monto), 0) AS suma FROM ordenes WHERE estado = 'en_buzon' GROUP BY tipo`)
      .toArray() as Array<{ tipo: string; n: number; suma: number }>;
    const de = (t: TipoOrden) => {
      const f = filas.find((x) => x.tipo === t);
      return { total: Number(f?.suma ?? 0), cuantas: Number(f?.n ?? 0) };
    };
    return { compras: de('compra'), reembolsos: de('reembolso') };
  }

  /** Una orden con toda su historia y sus archivos. */
  /** Una orden con su historia y sus papeles.
   *
   *  Los papeles son DOS montones y los dos importan: la cotización, que
   *  cuelga de la orden, y el comprobante del pago, que cuelga del
   *  movimiento —ahí lo sube quien paga—. Quien pidió la compra necesita el
   *  segundo para reclamarle al proveedor, así que salen juntos, cada uno
   *  diciendo de dónde viene en `de`. Buscarlos por separado obligaría a la
   *  pantalla a saber que el comprobante vive colgado de otra tabla. */
  ordenDeMovimiento(movimiento_id: string): { orden: Fila; eventos: Fila[]; archivos: Fila[] } | null {
    const f = this.sql.exec(`SELECT id FROM ordenes WHERE movimiento_id = ? LIMIT 1`, movimiento_id).toArray()[0] as Fila | undefined;
    return f ? this.verOrden(String(f.id)) : null;
  }

  verOrden(id: string): { orden: Fila; eventos: Fila[]; archivos: Fila[]; proveedor: ProveedorDePago | null; reembolso_a: ReembolsoA | null } | null {
    const orden = this.leerInterna('ordenes', id);
    if (!orden) return null;
    /* 0.92.0 · En un reembolso, a quién y a qué cuenta se le paga: lo que
     * quedó COPIADO en la orden al pedirla. Un reembolso de antes de la 0050
     * no trae cuenta; sale con `clabe: null` y la pantalla lo dice. En una
     * compra es null: ahí se le paga al proveedor. */
    const texto = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v));
    const reembolso_a: ReembolsoA | null = orden.tipo === 'reembolso'
      ? {
          nombre: texto(orden.solicitante_nombre), correo: texto(orden.solicitante_correo),
          clabe: texto(orden.reembolso_clabe), banco: texto(orden.reembolso_banco), beneficiario: texto(orden.reembolso_beneficiario),
        }
      : null;
    /* 0.67.0 · Con la orden viene lo que hace falta para pagarle (Mike,
     * 5-oct: «ahí mismo en la orden (desde dash) aparezcan los datos
     * bancarios o de pago del proveedor»). Las cuentas son las filas de
     * `proveedor_cuentas` (0023: ahí vive la verdad); si un proveedor sólo
     * trae la cuenta en sus columnas, ésa sale como «Principal». Un nombre
     * escrito a mano (`proveedor_id` nulo) no tiene de dónde: `null`. */
    const proveedor = orden.proveedor_id ? this.proveedorDePago(String(orden.proveedor_id)) : null;
    const papeles = (tabla: string, de_id: string, de: 'orden' | 'pago') =>
      (this.sql.exec(`SELECT * FROM archivos WHERE de_tabla = ? AND de_id = ? ORDER BY creado_at`, tabla, de_id)
        .toArray() as Fila[]).map((f) => ({ ...f, de }));
    const archivos = papeles('ordenes', id, 'orden');
    if (orden.movimiento_id) archivos.push(...papeles('movimientos', String(orden.movimiento_id), 'pago'));
    return {
      orden,
      eventos: this.sql.exec(`SELECT * FROM orden_eventos WHERE orden_id = ? ORDER BY ts`, id).toArray() as Fila[],
      archivos,
      proveedor,
      reembolso_a,
    };
  }

  /** El proveedor como se le paga: su ficha y sus cuentas, sin notas ni dirección. */
  private proveedorDePago(id: string): ProveedorDePago | null {
    const p = this.sql.exec(`SELECT * FROM proveedores WHERE id = ?`, id).toArray()[0] as Fila | undefined;
    if (!p) return null;
    const texto = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v));
    const cuentas = (this.sql.exec(`SELECT * FROM proveedor_cuentas WHERE proveedor_id = ? ORDER BY creado_at, alias`, id).toArray() as Fila[])
      .map((c) => ({ id: String(c.id), alias: String(c.alias ?? ''), clabe: String(c.clabe ?? ''), banco: texto(c.banco), beneficiario: texto(c.beneficiario), notas: texto(c.notas) }));
    const clabe = texto(p.clabe);
    if (clabe && !cuentas.some((c) => c.clabe === clabe)) {
      cuentas.unshift({ id: `principal-${id}`, alias: 'Principal', clabe, banco: texto(p.banco), beneficiario: texto(p.beneficiario), notas: null });
    }
    return {
      id: String(p.id), nombre: String(p.nombre ?? ''), rfc: texto(p.rfc), correo: texto(p.correo), telefono: texto(p.telefono),
      terminos_pago: texto(p.terminos_pago), cuentas,
    };
  }

  /** Pagar: TODO O NADA.
   *
   *  Crea el egreso, lo liga, deja el evento, recalcula los cachés del
   *  proyecto y de la partida, y deja la orden en `pagada`. Si algo truena a
   *  la mitad no queda ni medio egreso.
   *
   *  Una orden que no está en el buzón NO se paga: es lo que impide el doble
   *  egreso cuando alguien pica dos veces o se le va el dedo en el celular. */
  pagarOrden(args: {
    id: string; cuenta_id: string; fecha?: string; quien_usuario_id: string; quien_nombre?: string | null;
    nota?: string | null; crear_partida?: boolean;
  }): { ok: true; orden: Fila; movimiento: Fila; partida_id: string | null } | { error: string; detalle?: unknown } {
    const orden = this.leerInterna('ordenes', args.id);
    if (!orden) return { error: 'no_encontrado' };
    if (orden.estado !== 'en_buzon') return { error: 'orden_no_esta_en_buzon', detalle: { estado: orden.estado } };
    const cuenta = this.sql.exec(`SELECT id FROM cuentas WHERE id = ?`, String(args.cuenta_id)).toArray()[0];
    if (!cuenta) return { error: 'cuenta_desconocida', detalle: { cuenta_id: args.cuenta_id } };

    const mov_id = ulid();
    const t = ahora();
    const fecha = (args.fecha ?? t).slice(0, 10);
    let partida_id = orden.partida_id ? String(orden.partida_id) : null;
    /* Un reembolso se le paga a quien puso el dinero, no a un proveedor: la
     * contraparte del egreso es esa persona, y la categoría dice
     * `reembolso` para que en movimientos se distinga de un gasto. Son
     * salidas de dinero las dos (Mike, 28-sep), y por eso el resto —cuenta,
     * proyecto, partida, fiscal— va igual. */
    const reembolso = orden.tipo === 'reembolso';
    const contraparte = reembolso
      ? { tipo: orden.solicitante_id ? 'personal' : 'otro', id: orden.solicitante_id ?? null, nombre: orden.solicitante_nombre ?? orden.solicitante_correo ?? null }
      : { tipo: orden.proveedor_id ? 'proveedor' : 'otro', id: orden.proveedor_id ?? null, nombre: orden.proveedor_nombre ?? null };

    this.ctx.storage.transactionSync(() => {
      /* Con proyecto y sin partida que le quede, se crea la partida por el
       * monto de la orden. El `compromiso` del proyecto sube ese monto una
       * sola vez, porque lo recalcula `recalcularProyecto` sumando partidas.
       * Con partida existente NO se toca `monto_acordado`: ya estaba
       * comprometido, y subirlo lo contaría dos veces. */
      if (orden.proyecto_id && !partida_id && args.crear_partida !== false) {
        partida_id = ulid();
        this.sql.exec(
          `INSERT INTO partidas (id, proyecto_id, proveedor_id, proveedor_nombre, concepto, monto_acordado, creado_at)
           VALUES (?,?,?,?,?,?,?)`,
          partida_id, orden.proyecto_id, contraparte.id, contraparte.nombre,
          orden.concepto, Number(orden.monto), t,
        );
        this.sql.exec(`UPDATE ordenes SET partida_id = ? WHERE id = ?`, partida_id, args.id);
      }

      this.sql.exec(
        `INSERT INTO movimientos (id, tipo, monto, fecha, cuenta_id, proyecto_id, partida_id,
          contraparte_tipo, contraparte_id, contraparte_nombre, descripcion, categoria, creado_por, creado_at,
          facturado, requiere_factura, subtotal, iva, tasa_iva)
         VALUES (?,'egreso',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        mov_id, Number(orden.monto), fecha, args.cuenta_id, orden.proyecto_id ?? null, partida_id,
        contraparte.tipo, contraparte.id, contraparte.nombre,
        `${orden.folio} · ${orden.concepto}`, reembolso ? 'reembolso' : 'orden_de_compra', args.quien_usuario_id, t,
        /* `facturado` arranca en 0 aunque la orden diga «con factura»: la
         * marca dice que YA LLEGÓ el CFDI, no que se espera. La factura casi
         * siempre llega después, y es justo lo que persigue la lista de
         * pendientes de factura.
         *
         * `requiere_factura` es la otra mitad, y es la que dice que se
         * espera. Antes del contrato 0.25.0 esa espera se leía de
         * `ordenes.con_factura` con un JOIN, así que aquí no había nada que
         * escribir; ahora vive en el movimiento —para que un INGRESO, que no
         * tiene orden de compra, también pueda estar pendiente—, y hay que
         * copiarla al pagar o el pago nuevo nace fuera de la lista. Es
         * exactamente lo que atrapó la prueba 20 al subir la migración. */
        0, Number(orden.con_factura ?? 0) ? 1 : 0,
        Number(orden.subtotal ?? 0), Number(orden.iva ?? 0), Number(orden.tasa_iva ?? 0),
      );
      this.sql.exec(
        `UPDATE ordenes SET estado = 'pagada', movimiento_id = ?, pagada_at = ?, pagada_por = ?, actualizado_at = ? WHERE id = ?`,
        mov_id, t, args.quien_usuario_id, t, args.id,
      );
      this.apuntarOrden({
        orden_id: args.id, que: 'pagada', quien_usuario_id: args.quien_usuario_id,
        quien_nombre: args.quien_nombre ?? null, nota: args.nota ?? null,
      });
    });

    if (orden.proyecto_id) this.recalcularProyecto(String(orden.proyecto_id));
    this.avisar({ t: 'orden.pagada', id: args.id, folio: orden.folio } as unknown as Aviso, 'dinero');
    return {
      ok: true,
      orden: this.leerInterna('ordenes', args.id)!,
      movimiento: this.obtener('movimientos', mov_id)!,
      partida_id,
    };
  }

  /** Devolver para corregir, o rechazar de plano. El motivo es obligatorio:
   *  una orden que vuelve sin decir por qué se vuelve a mandar igual. */
  resolverOrden(args: { id: string; que: 'devuelta' | 'rechazada'; nota: string; quien_usuario_id: string; quien_nombre?: string | null }):
    Fila | { error: string; detalle?: unknown } {
    const orden = this.leerInterna('ordenes', args.id);
    if (!orden) return { error: 'no_encontrado' };
    if (orden.estado !== 'en_buzon') return { error: 'orden_no_esta_en_buzon', detalle: { estado: orden.estado } };
    if (!String(args.nota ?? '').trim()) return { error: 'falta_motivo' };
    this.sql.exec(
      `UPDATE ordenes SET estado = ?, nota_contador = ?, actualizado_at = ? WHERE id = ?`,
      args.que, String(args.nota).trim(), ahora(), args.id,
    );
    this.apuntarOrden({
      orden_id: args.id, que: args.que, quien_usuario_id: args.quien_usuario_id,
      quien_nombre: args.quien_nombre ?? null, nota: String(args.nota).trim(),
    });
    return this.leerInterna('ordenes', args.id)!;
  }

  /** El solicitante corrige su orden devuelta y vuelve al buzón. MISMO folio y
   *  toda su historia: una orden corregida no es otra orden. */
  corregirOrden(args: {
    id: string; quien_usuario_id: string; quien_nombre?: string | null;
    cambios: Record<string, unknown>;
    /** 0.92.0 · En un reembolso, otra cuenta: se guarda como la suya y se
     *  copia en la orden. Sin ella, la que la orden ya traía se queda. */
    cuenta?: { clabe: string; banco?: string | null; beneficiario?: string | null } | null;
  }): Fila | { error: string; detalle?: unknown } {
    const orden = this.leerInterna('ordenes', args.id);
    if (!orden) return { error: 'no_encontrado' };
    if (orden.estado !== 'devuelta') return { error: 'orden_no_esta_devuelta', detalle: { estado: orden.estado } };

    const c = args.cambios ?? {};
    const monto = c.monto !== undefined ? Math.round(Number(c.monto)) : Number(orden.monto);
    if (!Number.isFinite(monto) || monto <= 0) return { error: 'monto_invalido' };
    const con_factura = c.con_factura !== undefined ? !!c.con_factura : orden.con_factura === 1;
    const d = this.desglosar(monto, con_factura, Number(c.tasa_iva ?? orden.tasa_iva ?? 1600),
      { subtotal: c.subtotal as number | undefined, iva: c.iva as number | undefined });
    if ('error' in d) return { error: d.error };

    const campos: Record<string, unknown> = {
      monto, con_factura: con_factura ? 1 : 0, subtotal: d.subtotal, iva: d.iva, tasa_iva: d.tasa_iva,
      estado: 'en_buzon', nota_contador: null, actualizado_at: ahora(),
    };
    for (const k of ['concepto', 'proveedor_id', 'proveedor_nombre', 'proyecto_id', 'partida_id', 'fecha_maxima_pago', 'urgente'] as const) {
      if (c[k] !== undefined) campos[k] = k === 'urgente' ? (c[k] ? 1 : 0) : (c[k] as string | null);
    }
    if (orden.tipo === 'reembolso') {
      const cuenta = args.cuenta?.clabe
        ? this.guardarCuentaDeReembolso({ usuario_id: String(orden.solicitante_usuario_id), ...args.cuenta, beneficiario: args.cuenta.beneficiario || (orden.solicitante_nombre as string | null) })
        : orden.reembolso_clabe ? null : this.cuentaDeReembolsoDe(String(orden.solicitante_usuario_id));
      if (cuenta) { campos.reembolso_clabe = cuenta.clabe; campos.reembolso_banco = cuenta.banco; campos.reembolso_beneficiario = cuenta.beneficiario; }
      else if (!orden.reembolso_clabe) return { error: 'falta_cuenta_reembolso', detalle: { mensaje: 'Para volver a mandar el reembolso hace falta la cuenta a la que se te paga.' } };
    }
    const llaves = Object.keys(campos);
    this.sql.exec(
      `UPDATE ordenes SET ${llaves.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
      ...(llaves.map((k) => campos[k]) as SqlStorageValue[]), args.id,
    );
    this.apuntarOrden({
      orden_id: args.id, que: 'corregida', quien_usuario_id: args.quien_usuario_id,
      quien_nombre: args.quien_nombre ?? null, nota: 'corregida y de vuelta al buzón',
    });
    return this.leerInterna('ordenes', args.id)!;
  }

  /** 0.86.0 · Quien la pidió la cancela: ya no se necesita. Mike, 9-oct-2026:
   *  «en supply, hay que poner un botón para cancelar una orden que ya no se
   *  necesita».
   *
   *  Sólo mientras nadie la ha pagado ni rechazado: en el buzón o devuelta.
   *  Una pagada NUNCA se cancela —el dinero ya salió, y eso se arregla con el
   *  movimiento, no borrando el papel—. La orden se queda con su folio y su
   *  historia; sale del buzón, de sus totales y de lo que se debe porque
   *  todos ellos leen `estado = 'en_buzon'`. `nota_contador` no se toca: si
   *  quien paga ya había dicho algo al devolverla, sigue dicho. Quién puede
   *  llamarla lo decide el Worker (sólo quien la pidió). */
  cancelarOrden(args: { id: string; nota?: string | null; quien_usuario_id: string; quien_nombre?: string | null }):
    Fila | { error: string; detalle?: unknown } {
    const orden = this.leerInterna('ordenes', args.id);
    if (!orden) return { error: 'no_encontrado' };
    if (orden.estado !== 'en_buzon' && orden.estado !== 'devuelta') {
      return { error: 'orden_no_se_puede_cancelar', detalle: { estado: orden.estado } };
    }
    const nota = String(args.nota ?? '').trim() || null;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`UPDATE ordenes SET estado = 'cancelada', actualizado_at = ? WHERE id = ?`, ahora(), args.id);
      this.apuntarOrden({
        orden_id: args.id, que: 'cancelada', quien_usuario_id: args.quien_usuario_id,
        quien_nombre: args.quien_nombre ?? null, nota,
      });
    });
    // El buzón de quien paga tiene que enterarse de que una se fue.
    this.avisar({ t: 'orden.cancelada', id: args.id, folio: orden.folio } as unknown as Aviso, 'dinero');
    return this.leerInterna('ordenes', args.id)!;
  }


  /* ─────────────── contabilidad fiscal (0009) ───────────────
   * No hay dos contabilidades. Hay una lista de movimientos y cada uno dice
   * si es fiscal. Lo de aquí es: capturar facturas, ligarlas a los pagos que
   * ya existen, y sacar los tres números que se miran cada mes.
   *
   * Una advertencia que va también en la pantalla: esto ORDENA la información
   * fiscal, no presenta declaraciones ni sustituye al contador. Los números
   * salen de lo que se capture.
   */

  crearCfdi(args: {
    uuid: string; rfc?: string | null; razon_social?: string | null;
    tipo: 'ingreso' | 'egreso'; subtotal?: number; iva?: number; retenciones?: number; total?: number;
    fecha: string; forma_pago?: string | null; creado_por: string;
  }): Fila | { error: string; detalle?: unknown } {
    const uuid = String(args.uuid ?? '').trim().toUpperCase();
    if (!uuid) return { error: 'falta_uuid' };
    if (args.tipo !== 'ingreso' && args.tipo !== 'egreso') return { error: 'tipo_invalido' };
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(args.fecha ?? ''))) return { error: 'fecha_invalida' };
    // Capturar dos veces la misma factura es el error más fácil de cometer y
    // el que más ensucia el IVA del mes. Se caza antes de escribir, para
    // poder decir cuál es la que ya estaba.
    const ya = this.sql.exec(`SELECT id, fecha FROM cfdi WHERE uuid = ?`, uuid).toArray()[0] as Fila | undefined;
    if (ya) return { error: 'uuid_repetido', detalle: { uuid, ya_capturada: ya.id, fecha: ya.fecha } };

    const n = (v: unknown) => Math.round(Number(v ?? 0)) || 0;
    const subtotal = n(args.subtotal), iva = n(args.iva), retenciones = n(args.retenciones);
    const total = args.total !== undefined ? n(args.total) : subtotal + iva - retenciones;
    const id = ulid();
    this.sql.exec(
      `INSERT INTO cfdi (id, uuid, rfc, razon_social, tipo, subtotal, iva, retenciones, total,
        fecha, forma_pago, estado, creado_por, creado_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'vigente',?,?)`,
      id, uuid, args.rfc ?? null, args.razon_social ?? null, args.tipo,
      subtotal, iva, retenciones, total, String(args.fecha).slice(0, 10), args.forma_pago ?? null,
      args.creado_por, ahora(),
    );
    return this.leerInterna('cfdi', id)!;
  }

  /** Liga una factura a un pago que YA EXISTE, y con eso el movimiento se
   *  vuelve fiscal. Éste es el camino que una segunda contabilidad no puede
   *  recorrer: la factura casi siempre llega después del pago. */
  ligarCfdi(args: { cfdi_id: string; movimiento_id: string; monto_aplicado?: number }):
    { ok: true; cfdi: Fila; movimiento: Fila; aplicado_total: number } | { error: string; detalle?: unknown } {
    const cfdi = this.leerInterna('cfdi', args.cfdi_id);
    if (!cfdi) return { error: 'cfdi_desconocido' };
    const mov = this.obtener('movimientos', args.movimiento_id);
    if (!mov) return { error: 'movimiento_desconocido' };
    const aplicado = args.monto_aplicado !== undefined
      ? Math.round(Number(args.monto_aplicado))
      : Math.min(Number(cfdi.total || 0), Number(mov.monto || 0));
    if (!Number.isFinite(aplicado) || aplicado <= 0) return { error: 'monto_invalido' };

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO cfdi_movimientos (cfdi_id, movimiento_id, monto_aplicado, creado_at) VALUES (?,?,?,?)
         ON CONFLICT(cfdi_id, movimiento_id) DO UPDATE SET monto_aplicado = excluded.monto_aplicado`,
        args.cfdi_id, args.movimiento_id, aplicado, ahora(),
      );
      /* El movimiento queda facturado. `uuid_cfdi` y `fecha_cfdi` se copian
       * SÓLO cuando es la única factura de ese pago: con dos o más, un solo
       * hueco no puede decir la verdad, y la verdad completa está en la
       * tabla de liga. */
      const cuantas = (this.sql
        .exec(`SELECT COUNT(*) AS n FROM cfdi_movimientos WHERE movimiento_id = ?`, args.movimiento_id)
        .one() as { n: number }).n;
      if (cuantas === 1) {
        this.sql.exec(
          `UPDATE movimientos SET facturado = 1, uuid_cfdi = ?, fecha_cfdi = ?, subtotal = ?, iva = ?, retenciones = ? WHERE id = ?`,
          cfdi.uuid, cfdi.fecha, Number(cfdi.subtotal || 0), Number(cfdi.iva || 0), Number(cfdi.retenciones || 0), args.movimiento_id,
        );
      } else {
        this.sql.exec(`UPDATE movimientos SET facturado = 1, uuid_cfdi = NULL WHERE id = ?`, args.movimiento_id);
      }
    });

    const aplicado_total = (this.sql
      .exec(`SELECT COALESCE(SUM(monto_aplicado),0) AS s FROM cfdi_movimientos WHERE cfdi_id = ?`, args.cfdi_id)
      .one() as { s: number }).s;
    return { ok: true, cfdi: this.leerInterna('cfdi', args.cfdi_id)!, movimiento: this.obtener('movimientos', args.movimiento_id)!, aplicado_total };
  }

  /** Cancelar una factura. NO se borra: sale del IVA del mes y se queda a la
   *  vista en su lista. Un renglón borrado es un hueco que nadie explica. */
  cancelarCfdi(id: string): Fila | { error: string } {
    const cfdi = this.leerInterna('cfdi', id);
    if (!cfdi) return { error: 'cfdi_desconocido' };
    const t = ahora();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`UPDATE cfdi SET estado = 'cancelada', cancelada_at = ?, actualizado_at = ? WHERE id = ?`, t, t, id);
      // Los pagos que sólo esa factura respaldaba vuelven a estar sin
      // facturar: el pago ocurrió, la factura ya no vale.
      for (const l of this.sql.exec(`SELECT movimiento_id FROM cfdi_movimientos WHERE cfdi_id = ?`, id).toArray() as Fila[]) {
        const vivas = (this.sql
          .exec(`SELECT COUNT(*) AS n FROM cfdi_movimientos lm JOIN cfdi c ON c.id = lm.cfdi_id
                 WHERE lm.movimiento_id = ? AND c.estado = 'vigente'`, l.movimiento_id)
          .one() as { n: number }).n;
        if (vivas === 0) {
          this.sql.exec(`UPDATE movimientos SET facturado = 0, uuid_cfdi = NULL, fecha_cfdi = NULL WHERE id = ?`, l.movimiento_id);
        }
      }
    });
    return this.leerInterna('cfdi', id)!;
  }

  /** Marcar un movimiento como facturado a mano, con su desglose, sin capturar
   *  el CFDI completo. Es la puerta rápida para lo que ya está conciliado. */
  marcarFacturado(args: {
    movimiento_id: string; facturado: boolean; subtotal?: number; iva?: number; tasa_iva?: number;
    retenciones?: number; uuid_cfdi?: string | null; fecha_cfdi?: string | null; forma_pago?: string | null;
  }): Fila | { error: string; detalle?: unknown } {
    const mov = this.obtener('movimientos', args.movimiento_id);
    if (!mov) return { error: 'movimiento_desconocido' };
    if (!args.facturado) {
      this.sql.exec(
        `UPDATE movimientos SET facturado = 0, uuid_cfdi = NULL, fecha_cfdi = NULL WHERE id = ?`,
        args.movimiento_id,
      );
      return this.obtener('movimientos', args.movimiento_id)!;
    }
    const monto = Number(mov.monto || 0);
    const d = this.desglosar(monto, true, Number(args.tasa_iva ?? 1600), { subtotal: args.subtotal, iva: args.iva });
    if ('error' in d) return { error: d.error, detalle: { monto } };
    this.sql.exec(
      `UPDATE movimientos SET facturado = 1, subtotal = ?, iva = ?, tasa_iva = ?, retenciones = ?,
        uuid_cfdi = ?, fecha_cfdi = ?, forma_pago = COALESCE(?, forma_pago) WHERE id = ?`,
      d.subtotal, d.iva, d.tasa_iva, Math.round(Number(args.retenciones ?? 0)) || 0,
      args.uuid_cfdi ?? null, args.fecha_cfdi ?? null, args.forma_pago ?? null, args.movimiento_id,
    );
    return this.obtener('movimientos', args.movimiento_id)!;
  }

  /** El IVA del mes: lo que pagaste a proveedores contra lo que cobraste a
   *  clientes, y la diferencia. Ese número decide cuánto enteras.
   *
   *  Sale de los CFDI vigentes, NO de los movimientos: el IVA se acredita con
   *  la factura, y una factura puede cubrir varios pagos. Una cancelada no
   *  cuenta, por eso el filtro de estado.
   *
   *  El acreditable resta las retenciones: lo que te retuvieron ya no lo
   *  acreditas tú. Es una simplificación —aquí no se separa retención de IVA
   *  de retención de ISR— y está dicha a propósito, porque el número vale lo
   *  que valga lo capturado. */
  ivaDelMes(desde: string, hasta: string): {
    desde: string; hasta: string;
    trasladado: number; acreditable: number; retenciones: number; a_enterar: number;
    facturas: { emitidas: number; recibidas: number; canceladas: number };
  } {
    const d = String(desde).slice(0, 10), h = String(hasta).slice(0, 10);
    // De la empresa entera: el RFC es uno (0.63.0).
    /* 0.85.0 · Desde que las facturas entran leídas de su XML (bill101) la
     * tabla también trae notas de crédito, que RESTAN, y complementos de
     * pago y recibos de nómina, que no llevan IVA ni son «una factura» para
     * este conteo. Lo capturado antes trae `tipo_comprobante` nulo y se
     * suma como siempre: para esos datos la respuesta es la misma.
     * Y la retención que le baja al acreditable es la de IVA cuando la
     * factura la trae desglosada (`iva_retenido`); lo tecleado sólo trae
     * `retenciones`, y se sigue tomando entera, como antes. OJO: esta ruta
     * suma por FECHA DE FACTURA; la que va por flujo —la buena para saber
     * qué se paga— es GET /fiscal/impuestos. */
    const suma = (tipo: string) => this.sql
      .exec(`SELECT COALESCE(SUM(CASE WHEN tipo_comprobante = 'E' THEN -iva ELSE iva END),0) AS iva,
                    COALESCE(SUM(CASE WHEN tipo_comprobante = 'E' THEN -COALESCE(iva_retenido, retenciones) ELSE COALESCE(iva_retenido, retenciones) END),0) AS ret, COUNT(*) AS n
             FROM cfdi WHERE estado = 'vigente' AND tipo = ? AND fecha >= ? AND fecha <= ?
               AND COALESCE(tipo_comprobante, 'I') IN ('I', 'E')`, tipo, d, h)
      .one() as { iva: number; ret: number; n: number };
    const ing = suma('ingreso'), egr = suma('egreso');
    const canceladas = (this.sql
      .exec(`SELECT COUNT(*) AS n FROM cfdi WHERE estado = 'cancelada' AND fecha >= ? AND fecha <= ?`, d, h)
      .one() as { n: number }).n;
    const acreditable = egr.iva - egr.ret;
    return {
      desde: d, hasta: h,
      trasladado: ing.iva, acreditable, retenciones: egr.ret,
      a_enterar: ing.iva - acreditable,
      facturas: { emitidas: ing.n, recibidas: egr.n, canceladas },
    };
  }

  /** Lo facturado contra lo real. La diferencia es lo que anda fuera. */
  facturadoVsReal(desde: string, hasta: string): {
    desde: string; hasta: string;
    ingresos: { total: number; facturado: number; fuera: number };
    egresos: { total: number; facturado: number; fuera: number };
  } {
    const d = String(desde).slice(0, 10), h = String(hasta).slice(0, 10);
    /* 0.83.0 · Lo que entra de un préstamo no es ingreso, y lo que se le
     * devuelve de capital no es gasto: no se cuentan aquí. El interés sí es
     * gasto (financiero) y se queda. En el saldo de las cuentas y en el
     * flujo los tres cuentan, porque el dinero sí se movió. */
    const lado = (tipo: string) => {
      const r = this.sql
        .exec(`SELECT COALESCE(SUM(monto),0) AS total,
                      COALESCE(SUM(CASE WHEN facturado = 1 THEN monto ELSE 0 END),0) AS fact
               FROM movimientos WHERE tipo = ? AND fecha >= ? AND fecha <= ?
                 AND COALESCE(categoria, '') NOT IN (?, ?)`, tipo, d, h, CATEGORIA_PRESTAMO_RECIBIDO, CATEGORIA_PRESTAMO_CAPITAL)
        .one() as { total: number; fact: number };
      return { total: r.total, facturado: r.fact, fuera: r.total - r.fact };
    };
    return { desde: d, hasta: h, ingresos: lado('ingreso'), egresos: lado('egreso') };
  }

  /** Pagos que se hicieron esperando factura y cuyo CFDI todavía no llega. Es
   *  la lista que hay que perseguir cada mes. */
  /** Lo que falta facturar, de los dos lados.
   *
   *  Hasta el 20-sep esto empezaba con un `JOIN ordenes`, porque la espera de
   *  la factura vivía en la orden de compra (`con_factura`). Consecuencia: un
   *  INGRESO no podía salir aquí jamás —no tiene orden de compra—, y a Mike
   *  le faltaba justo eso: la lista de lo que cobró y todavía no facturó.
   *
   *  Ahora la espera vive en el movimiento (`requiere_factura`, migración
   *  0012) y la orden es nada más un dato de adorno cuando existe: por eso el
   *  JOIN es LEFT. La 0012 le puso la espera a los pagos de órdenes que hoy
   *  están pendientes, así que la lista de egresos no cambia de contenido. */
  pendientesDeFactura(tipo?: string | null): Fila[] {
    const donde: string[] = ['m.requiere_factura = 1', 'm.facturado = 0'];
    const args: SqlStorageValue[] = [];
    if (tipo) { donde.push('m.tipo = ?'); args.push(tipo); }
    return this.sql.exec(
      `SELECT m.*, o.folio AS orden_folio, o.proveedor_nombre AS orden_proveedor
         FROM movimientos m
         LEFT JOIN ordenes o ON o.movimiento_id = m.id
        WHERE ${donde.join(' AND ')}
        ORDER BY m.fecha`,
      ...args,
    ).toArray() as Fila[];
  }

  /** Las facturas de un rango, para la pantalla y para el reporte. */
  listaCfdi(args: { desde?: string; hasta?: string; tipo?: string; estado?: string }): Fila[] {
    const donde: string[] = [];
    const vals: SqlStorageValue[] = [];
    if (args.desde) { donde.push('fecha >= ?'); vals.push(String(args.desde).slice(0, 10)); }
    if (args.hasta) { donde.push('fecha <= ?'); vals.push(String(args.hasta).slice(0, 10)); }
    if (args.tipo) { donde.push('tipo = ?'); vals.push(args.tipo); }
    if (args.estado) { donde.push('estado = ?'); vals.push(args.estado); }
    const filtro = donde.length ? ` WHERE ${donde.join(' AND ')}` : '';
    /* 0.85.1 · `aplicado`: cuánto de cada factura ya está ligado a dinero.
     * La lista de bill101 lo necesita para decir «por ligar» sin pedir el
     * detalle de cada una. Es un campo más; lo que ya venía no cambia. */
    return this.leerInternas('cfdi', this.sql.exec(
      `SELECT cfdi.*, (SELECT COALESCE(SUM(lm.monto_aplicado),0) FROM cfdi_movimientos lm WHERE lm.cfdi_id = cfdi.id) AS aplicado
         FROM cfdi${filtro} ORDER BY fecha DESC, creado_at DESC`, ...vals).toArray() as Fila[]);
  }

  /* ─────────────── el cliente es uno solo en las tres apps ───────────────
   * Mike, 20-sep: «cuando creas un nuevo cliente en quote101, es lo mismo que
   * cuando haces uno en quell101 o en dash. El cliente es el mismo en los 3 y
   * debe aparecer en la base de datos de las 3 apps. Si por cualquier cosa se
   * crean en 2 apps diferentes con un nombre diferente, debería haber manera
   * de ligarlo y fusionar los 2 clientes en uno mismo para mejor control. Y si
   * se quiere crear un cliente con el nombre ya existente, preguntar si no te
   * estás refiriendo a X cliente.»
   *
   * Vivir en la misma tabla ya vivían —`clientes` es de la empresa, no de una
   * app—. Lo que faltaba son estas dos: avisar del parecido ANTES de crear, y
   * juntar los dos que ya se crearon.
   */

  /** Los clientes que se parecen a un nombre. La regla se escribe UNA vez y
   *  aquí: mismo nombre normalizado, o uno contenido en el otro («Muebles
   *  Luna» y «Muebles Luna SA de CV»). Menos de tres letras no compara: con
   *  dos, media lista se parece a todo. */
  clientesParecidos(nombre: string): Fila[] {
    const n = normalizar(nombre);
    if (n.length < 3) return [];
    const filas = this.sql.exec(`SELECT * FROM clientes ORDER BY nombre_norm`).toArray() as Fila[];
    return filas.filter((c) => {
      const o = normalizar(c.nombre_norm || c.nombre);
      return o === n || (o.length >= 3 && (o.includes(n) || n.includes(o)));
    });
  }

  /** Juntar dos clientes en uno. `queda_id` es el que se queda con todo;
   *  `se_va_id` desaparece.
   *
   *  Todo o nada, y por eso vive aquí adentro: si se movieran los proyectos y
   *  fallara al mover los ítems, quedaría un cliente con la mitad de su
   *  historia colgando de un renglón borrado. Un solo hilo por empresa, así
   *  que no hay carreras.
   *
   *  Lo que el que se queda NO tenga —correo, teléfono, RFC, notas, el acceso
   *  al portal— se lo lleva del que se va. Fusionar no puede perder datos: el
   *  que se va casi siempre es el que se capturó en la otra app, y a veces es
   *  el único que trae el correo. */
  /* ─────────────── borrar un cliente o un proyecto con todo lo suyo (0.51.0) ───────────────
   *
   * Mike, 29-sep: «no puedo borrar clientes de quote101, me aparece este
   * error [Error al guardar]». Lo que pasaba: quote101 borra de abajo hacia
   * arriba —cotización, proyecto, cliente— y el proyecto no se iba porque
   * sus ítems le cuelgan (llave foránea); la pantalla lo tapaba con un aviso
   * de conexión. Un cliente con proyecto no se podía borrar desde ninguna
   * app.
   *
   * La regla, en dos líneas:
   *   · CON DINERO no se borra. Un movimiento que apunte a sus proyectos, a
   *     sus ítems o al cliente como contraparte lo detiene entero: se
   *     contesta `tiene_dinero` con la cuenta. Ese cliente se fusiona o su
   *     proyecto se cierra; borrarlo dejaría cobros sin dueño.
   *   · CON HISTORIA tampoco: un ítem con avances de obra, archivos o un
   *     compromiso con proveedor de otro proyecto se queda, y se dice cuál
   *     (`tiene_historia`, como en «borrar los cancelados», §117).
   *   · Sin nada de eso, se va TODO: partidas, ítems (aquí sí se borran: sin
   *     dinero ni historia son renglones capturados), proyectos, y con el
   *     cliente sus cotizaciones. Las piezas del plano y las obras de quell
   *     se quedan, sueltas, y se cuentan. Las órdenes sin pagar del proyecto
   *     quedan como gasto general.
   *   · `seco` contesta lo mismo sin escribir.
   */
  borrarClienteConTodo(cliente_id: string, modo: 'seco' | 'borrar'): ResultadoBorrarConTodo | { error: string; detalle?: unknown } {
    return this.borrarConTodo({ cliente_id }, modo);
  }

  borrarProyectoConTodo(proyecto_id: string, modo: 'seco' | 'borrar'): ResultadoBorrarConTodo | { error: string; detalle?: unknown } {
    return this.borrarConTodo({ proyecto_id }, modo);
  }

  private borrarConTodo(que: { cliente_id?: string; proyecto_id?: string }, modo: 'seco' | 'borrar'): ResultadoBorrarConTodo | { error: string; detalle?: unknown } {
    let cliente: Fila | null = null;
    let proyectos: Fila[];
    if (que.cliente_id) {
      cliente = this.obtener('clientes', que.cliente_id);
      if (!cliente) return { error: 'no_encontrado', detalle: { que: 'cliente', id: que.cliente_id } };
      proyectos = this.sql.exec(`SELECT id, nombre FROM proyectos WHERE cliente_id = ?`, que.cliente_id).toArray() as Fila[];
    } else {
      const p = this.obtener('proyectos', String(que.proyecto_id));
      if (!p) return { error: 'no_encontrado', detalle: { que: 'proyecto', id: que.proyecto_id } };
      proyectos = [p];
    }
    const pids = proyectos.map((p) => String(p.id));
    const lista = (ids: string[]) => (ids.length ? `(${ids.map(() => '?').join(',')})` : '(NULL)');

    const items = (que.cliente_id
      ? this.sql.exec(`SELECT id, clave, nombre FROM items WHERE cliente_id = ?`, que.cliente_id).toArray()
      : this.sql.exec(`SELECT id, clave, nombre FROM items WHERE proyecto_id IN ${lista(pids)}`, ...pids).toArray()) as Fila[];
    const iids = items.map((i) => String(i.id));
    const cuantos = (sql: string, ...args: SqlStorageValue[]) => Number((this.sql.exec(sql, ...args).one() as Fila).n);

    /* Dinero: lo detiene todo. */
    let movimientos = cuantos(`SELECT COUNT(*) AS n FROM movimientos WHERE proyecto_id IN ${lista(pids)} OR item_id IN ${lista(iids)}`, ...pids, ...iids);
    if (que.cliente_id) {
      movimientos += cuantos(
        `SELECT COUNT(*) AS n FROM movimientos WHERE contraparte_tipo = 'cliente' AND contraparte_id = ? AND (proyecto_id IS NULL OR proyecto_id NOT IN ${lista(pids)}) AND (item_id IS NULL OR item_id NOT IN ${lista(iids)})`,
        que.cliente_id, ...pids, ...iids,
      );
    }
    if (movimientos > 0) {
      return { error: 'tiene_dinero', detalle: { movimientos, motivo: 'con dinero registrado no se borra: el proyecto se cierra, o el cliente se fusiona con otro' } };
    }

    /* Historia por ítem, y archivos colgados del proyecto o del cliente. */
    const detenidos: Array<{ id: string; clave: string | null; nombre: string; porque: string[] }> = [];
    for (const it of items) {
      const id = String(it.id);
      const c = {
        cobros: 0,
        avances: cuantos(`SELECT COUNT(*) AS n FROM avances WHERE item_id = ?`, id),
        compromisos: cuantos(`SELECT COUNT(*) AS n FROM partidas WHERE item_id = ? AND proyecto_id NOT IN ${lista(pids)}`, id, ...pids),
        archivos: cuantos(`SELECT COUNT(*) AS n FROM archivos WHERE de_tabla = 'items' AND de_id = ?`, id),
      };
      const porque = this.loQueDetiene(c);
      if (porque.length) detenidos.push({ id, clave: (it.clave as string | null) ?? null, nombre: String(it.nombre ?? ''), porque });
    }
    const archivosDeArriba = cuantos(
      `SELECT COUNT(*) AS n FROM archivos WHERE (de_tabla = 'proyectos' AND de_id IN ${lista(pids)}) OR (de_tabla = 'clientes' AND de_id = ?)`,
      ...pids, que.cliente_id ?? '',
    );
    if (detenidos.length || archivosDeArriba) {
      return { error: 'tiene_historia', detalle: { items: detenidos, archivos: archivosDeArriba, motivo: 'traen avances de obra, archivos o compromisos con proveedor: eso no se borra solo' } };
    }

    const cuenta: ResultadoBorrarConTodo = {
      ok: true, modo, cliente,
      proyectos: pids.length, items: iids.length,
      cotizaciones: que.cliente_id ? cuantos(`SELECT COUNT(*) AS n FROM cotizaciones WHERE cliente_id = ?`, que.cliente_id) : 0,
      partidas: cuantos(`SELECT COUNT(*) AS n FROM partidas WHERE proyecto_id IN ${lista(pids)}`, ...pids),
      ordenes_sueltas: cuantos(`SELECT COUNT(*) AS n FROM ordenes WHERE proyecto_id IN ${lista(pids)}`, ...pids),
      piezas_sin_item: cuantos(`SELECT COUNT(*) AS n FROM quell_elements WHERE item_id IN ${lista(iids)}`, ...iids),
      obras_sueltas: cuantos(`SELECT COUNT(*) AS n FROM quell_projects WHERE proyecto_id IN ${lista(pids)}`, ...pids),
    };
    if (modo === 'seco') return cuenta;

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`UPDATE ordenes SET proyecto_id = NULL WHERE proyecto_id IN ${lista(pids)}`, ...pids);
      this.sql.exec(`DELETE FROM partidas WHERE proyecto_id IN ${lista(pids)}`, ...pids);
      this.sql.exec(`UPDATE quell_elements SET item_id = NULL WHERE item_id IN ${lista(iids)}`, ...iids);
      this.sql.exec(`DELETE FROM items WHERE id IN ${lista(iids)}`, ...iids);
      this.sql.exec(`UPDATE quell_projects SET proyecto_id = NULL WHERE proyecto_id IN ${lista(pids)}`, ...pids);
      this.sql.exec(`DELETE FROM proyectos WHERE id IN ${lista(pids)}`, ...pids);
      if (que.cliente_id) {
        this.sql.exec(`DELETE FROM cotizaciones WHERE cliente_id = ?`, que.cliente_id);
        this.sql.exec(`DELETE FROM clientes WHERE id = ?`, que.cliente_id);
      }
    });
    for (const id of iids) this.avisar({ t: 'item.cambio', id }, 'todos');
    return cuenta;
  }

  fusionarClientes(queda_id: string, se_va_id: string): { ok: true; cliente: Fila; movidos: Record<string, number> } | { error: string; detalle?: unknown } {
    if (queda_id === se_va_id) return { error: 'datos_invalidos', detalle: { motivo: 'son el mismo cliente' } };
    const queda = this.sql.exec(`SELECT * FROM clientes WHERE id = ?`, queda_id).toArray()[0] as Fila | undefined;
    if (!queda) return { error: 'no_encontrado', detalle: { que: 'el cliente que se queda', id: queda_id } };
    const seVa = this.sql.exec(`SELECT * FROM clientes WHERE id = ?`, se_va_id).toArray()[0] as Fila | undefined;
    if (!seVa) return { error: 'no_encontrado', detalle: { que: 'el cliente que se fusiona', id: se_va_id } };

    const cuantos = (sql: string, ...args: SqlStorageValue[]) =>
      Number((this.sql.exec(sql, ...args).toArray()[0] as Fila).n);

    const movidos = {
      proyectos: cuantos(`SELECT COUNT(*) AS n FROM proyectos WHERE cliente_id = ?`, se_va_id),
      items: cuantos(`SELECT COUNT(*) AS n FROM items WHERE cliente_id = ?`, se_va_id),
      cotizaciones: cuantos(`SELECT COUNT(*) AS n FROM cotizaciones WHERE cliente_id = ?`, se_va_id),
      movimientos: cuantos(
        `SELECT COUNT(*) AS n FROM movimientos WHERE contraparte_tipo = 'cliente' AND contraparte_id = ?`, se_va_id),
    };

    this.sql.exec(`UPDATE proyectos SET cliente_id = ? WHERE cliente_id = ?`, queda_id, se_va_id);
    this.sql.exec(`UPDATE items SET cliente_id = ? WHERE cliente_id = ?`, queda_id, se_va_id);
    this.sql.exec(`UPDATE cotizaciones SET cliente_id = ? WHERE cliente_id = ?`, queda_id, se_va_id);
    this.sql.exec(
      `UPDATE movimientos SET contraparte_id = ?, contraparte_nombre = ? WHERE contraparte_tipo = 'cliente' AND contraparte_id = ?`,
      queda_id, String(queda.nombre), se_va_id,
    );

    /* Lo que le falte al que se queda se lo lleva del que se va. `usuario_id`
     * también: si el acceso al portal estaba del otro lado, fusionar no puede
     * dejar al cliente sin poder entrar a ver su estado de cuenta. */
    const hereda: Record<string, unknown> = {};
    for (const campo of ['correo', 'telefono', 'rfc', 'notas', 'usuario_id']) {
      if (!queda[campo] && seVa[campo]) hereda[campo] = seVa[campo];
    }
    if (!queda.portal_activo && seVa.portal_activo) hereda.portal_activo = 1;
    if (Object.keys(hereda).length) {
      const sets = Object.keys(hereda).map((k) => `${k} = ?`).join(', ');
      this.sql.exec(`UPDATE clientes SET ${sets} WHERE id = ?`, ...(Object.values(hereda) as SqlStorageValue[]), queda_id);
    }

    this.sql.exec(`DELETE FROM clientes WHERE id = ?`, se_va_id);
    return { ok: true, cliente: this.obtener('clientes', queda_id) as Fila, movidos };
  }

  /* ─────────────── fusionar dos proyectos (0.52.0) ───────────────
   *
   * Mike, 29-sep: «No puedo fusionar el proyecto, solo el cliente. Y quiero
   * fusionar proyectos.» Le pasó con «Sanje CC37»: capturado dos veces, con
   * 11 movimientos en uno, y borrar no se puede con dinero (0.51.0).
   *
   * Misma forma que fusionar clientes: `queda` se queda con TODO lo del que
   * se va —ítems (con su partida), partidas, dinero, órdenes, cotizaciones,
   * archivos— y el que se va desaparece. Las tablas con `proyecto_id` se
   * descubren del esquema para que una tabla
   * nueva no se quede atrás sin que nadie lo note. Lo que no es una columna:
   *   · las cotizaciones de quote101 apuntan al proyecto dentro de `datos`
   *     (`datos.proyecto_id`): se cambia ahí;
   *   · los archivos cuelgan por (`de_tabla`, `de_id`);
   *   · la obra de quell es una por proyecto (índice único): si el que se
   *     queda ya tiene la suya, la del que se va queda suelta y se dice.
   * Los ítems que llegan toman el cliente del proyecto que se queda: un ítem
   * con el cliente de un proyecto que ya no existe es un renglón huérfano en
   * el estado de cuenta. Con `seco` sólo se cuenta.
   */
  fusionarProyectos(queda_id: string, se_va_id: string, seco: boolean): ResultadoFusionProyectos | { error: string; detalle?: unknown } {
    if (queda_id === se_va_id) return { error: 'datos_invalidos', detalle: { motivo: 'son el mismo proyecto' } };
    const queda = this.obtener('proyectos', queda_id);
    if (!queda) return { error: 'no_encontrado', detalle: { que: 'el proyecto que se queda', id: queda_id } };
    const seVa = this.obtener('proyectos', se_va_id);
    if (!seVa) return { error: 'no_encontrado', detalle: { que: 'el proyecto que se fusiona', id: se_va_id } };

    const cuantos = (sql: string, ...args: SqlStorageValue[]) => Number((this.sql.exec(sql, ...args).toArray()[0] as Fila).n);
    const tablas = (this.sql
      .exec(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('proyectos', 'quell_projects') AND name NOT LIKE 'sqlite_%' AND sql LIKE '%proyecto_id%' ORDER BY name`)
      .toArray() as Fila[]).map((t) => String(t.name));
    const movidos: Record<string, number> = {};
    for (const t of tablas) {
      const n = cuantos(`SELECT COUNT(*) AS n FROM "${t}" WHERE proyecto_id = ?`, se_va_id);
      if (n) movidos[t] = n;
    }
    const cotizaciones = cuantos(`SELECT COUNT(*) AS n FROM cotizaciones WHERE json_extract(datos, '$.proyecto_id') = ?`, se_va_id);
    if (cotizaciones) movidos.cotizaciones = cotizaciones;
    const archivos = cuantos(`SELECT COUNT(*) AS n FROM archivos WHERE de_tabla = 'proyectos' AND de_id = ?`, se_va_id);
    if (archivos) movidos.archivos = archivos;
    const obraQueda = cuantos(`SELECT COUNT(*) AS n FROM quell_projects WHERE proyecto_id = ?`, queda_id) > 0;
    const obraSeVa = cuantos(`SELECT COUNT(*) AS n FROM quell_projects WHERE proyecto_id = ?`, se_va_id) > 0;
    if (obraSeVa && !obraQueda) movidos.obras = 1;
    const obra_suelta = obraSeVa && obraQueda;
    const se_va = { id: se_va_id, nombre: String(seVa.nombre ?? ''), cliente_id: (seVa.cliente_id as string) ?? null };
    if (seco) return { ok: true, seco: true, queda, se_va, movidos, obra_suelta };

    const itemIds = (this.sql.exec(`SELECT id FROM items WHERE proyecto_id = ?`, se_va_id).toArray() as Fila[]).map((f) => String(f.id));
    this.ctx.storage.transactionSync(() => {
      for (const t of tablas) this.sql.exec(`UPDATE "${t}" SET proyecto_id = ? WHERE proyecto_id = ?`, queda_id, se_va_id);
      if (queda.cliente_id) this.sql.exec(`UPDATE items SET cliente_id = ? WHERE proyecto_id = ?`, String(queda.cliente_id), queda_id);
      this.sql.exec(`UPDATE cotizaciones SET datos = json_set(datos, '$.proyecto_id', ?) WHERE json_extract(datos, '$.proyecto_id') = ?`, queda_id, se_va_id);
      this.sql.exec(`UPDATE archivos SET de_id = ? WHERE de_tabla = 'proyectos' AND de_id = ?`, queda_id, se_va_id);
      if (obraSeVa) {
        if (obraQueda) this.sql.exec(`UPDATE quell_projects SET proyecto_id = NULL WHERE proyecto_id = ?`, se_va_id);
        else this.sql.exec(`UPDATE quell_projects SET proyecto_id = ? WHERE proyecto_id = ?`, queda_id, se_va_id);
      }
      this.sql.exec(`DELETE FROM proyectos WHERE id = ?`, se_va_id);
    });
    this.recalcularProyecto(queda_id);
    for (const id of itemIds) this.avisar({ t: 'item.cambio', id }, 'todos');
    return { ok: true, seco: false, queda: this.obtener('proyectos', queda_id)!, se_va, movidos, obra_suelta };
  }

  /* ─────────────── obras de quell101 y proyectos de dash101 (0010) ───────────────
   * Mike, 20-sep: la obra que se abre en quell101 y el proyecto que se abre
   * en dash101 son la misma casa. Aquí está la liga: listarlas, ponerla y
   * quitarla. Lo que se devuelve va con los nombres de la suite —`nombre`,
   * `cliente`, `estado`— y no con los de quell101 —`name`, `client`,
   * `status`—: una pantalla de dash101 no tiene por qué aprenderse las
   * columnas de otra app para enseñar una lista.
   */

  /** Las obras, con su proyecto si lo tienen. `sueltas` deja sólo las que no
   *  están ligadas, que es lo que dash101 ofrece al crear un proyecto. */
  obras(args: { sueltas?: boolean } = {}): Fila[] {
    const filtro = args.sueltas ? ' WHERE o.proyecto_id IS NULL' : '';
    return this.sql
      .exec(
        `SELECT o.id, o.name AS nombre, o.client AS cliente, o.status AS estado,
                o.created_at AS creado_at, o.proyecto_id,
                p.nombre AS proyecto_nombre,
                (SELECT COUNT(*) FROM quell_plans pl WHERE pl.project_id = o.id) AS planos,
                (SELECT COUNT(*) FROM quell_elements e WHERE e.project_id = o.id) AS ubicados
         FROM quell_projects o LEFT JOIN proyectos p ON p.id = o.proyecto_id${filtro}
         ORDER BY o.status, o.name`,
      )
      .toArray() as Fila[];
  }

  /** La obra ligada a un proyecto, si la hay. La pantalla del proyecto la
   *  enseña para poder abrir el plano desde ahí. */
  obraDeProyecto(proyecto_id: string): Fila | null {
    return (this.obras().find((o) => o.proyecto_id === proyecto_id) as Fila) ?? null;
  }

  /** Los ítems vendidos de la obra que todavía NO tienen pieza en un plano.
   *
   *  Mike, 20-sep: «cuando se genera un nuevo proyecto con su cantidad de
   *  ítems, en quell […] deben de aparecer en una lista de "ítems sin
   *  ubicar". Para ir seleccionando y ubicando cada ítem en su lugar.»
   *
   *  Con cantidad 20 y tres ya puestas en el plano, faltan 17: la cuenta la
   *  hace el servidor y no la pantalla, porque dos personas ubicando piezas a
   *  la vez tendrían dos cuentas distintas y las dos se creerían.
   *
   *  Sólo los VENDIDOS: lo que nada más está cotizado no se fabrica todavía,
   *  y llenaría el plano de piezas que quizá nunca se vendan. */
  sinUbicar(obra_id: string): { obra: Fila; items: Fila[] } | { error: string; detalle?: unknown } {
    const obra = this.sql.exec(`SELECT * FROM quell_projects WHERE id = ?`, obra_id).toArray()[0] as Fila | undefined;
    if (!obra) return { error: 'no_encontrado', detalle: { que: 'obra', id: obra_id } };
    if (!obra.proyecto_id) {
      return { error: 'sin_liga', detalle: { motivo: 'esta obra todavía no está ligada a un proyecto de dash101' } };
    }
    const items = this.sql
      .exec(
        `SELECT i.id, i.nombre, i.descripcion, i.clave, i.tipo, i.monto, i.cantidad, i.fecha_entrega,
                (SELECT COUNT(*) FROM quell_elements e WHERE e.item_id = i.id) AS ubicados
         FROM items i
         WHERE i.proyecto_id = ? AND i.estado = 'vendido'
         ORDER BY i.creado_at`,
        String(obra.proyecto_id),
      )
      .toArray() as Fila[];
    return {
      obra,
      items: items
        .map((i) => ({
          ...i,
          faltan: Math.max(0, Number(i.cantidad ?? 1) - Number(i.ubicados ?? 0)),
          // El precio por pieza, para que la pantalla no divida mal: `monto`
          // es el importe de la línea completa.
          monto_unitario: Number(i.cantidad ?? 1) > 0 ? Math.round(Number(i.monto) / Number(i.cantidad ?? 1)) : Number(i.monto),
        }))
        .filter((i) => i.faltan > 0),
    };
  }

  /** Poner la liga. Se niega si cualquiera de los dos lados ya está ligado a
   *  OTRO: una obra con dos proyectos, o un proyecto con dos obras, deja «el
   *  avance del proyecto» con dos respuestas ciertas al mismo tiempo. Ligar
   *  lo que ya estaba ligado igual no es un error: contesta lo mismo. */
  ligarObra(obra_id: string, proyecto_id: string, usuario_id = 'sistema'): { ok: true; obra: Fila } | { error: string; detalle?: unknown } {
    const obra = this.sql.exec(`SELECT * FROM quell_projects WHERE id = ?`, obra_id).toArray()[0] as Fila | undefined;
    if (!obra) return { error: 'no_encontrado', detalle: { que: 'obra', id: obra_id } };
    const proyecto = this.sql.exec(`SELECT id FROM proyectos WHERE id = ?`, proyecto_id).toArray()[0] as Fila | undefined;
    if (!proyecto) return { error: 'no_encontrado', detalle: { que: 'proyecto', id: proyecto_id } };

    if (obra.proyecto_id && obra.proyecto_id !== proyecto_id) {
      return { error: 'ya_ligada', detalle: { que: 'obra', obra_id, proyecto_id: obra.proyecto_id, motivo: 'esa obra ya está ligada a otro proyecto' } };
    }
    const otra = this.sql
      .exec(`SELECT id FROM quell_projects WHERE proyecto_id = ? AND id <> ?`, proyecto_id, obra_id)
      .toArray()[0] as Fila | undefined;
    if (otra) {
      return { error: 'ya_ligada', detalle: { que: 'proyecto', proyecto_id, obra_id: otra.id, motivo: 'ese proyecto ya está ligado a otra obra' } };
    }

    this.sql.exec(`UPDATE quell_projects SET proyecto_id = ? WHERE id = ?`, proyecto_id, obra_id);
    /* 0.64.2 · Los requerimientos que se levantaron ANTES de ligar no tenían
     * proyecto donde nacer como ítem; ahora sí. Mike, 2-oct: «tienen que
     * aparecer en la lista de quote de ítems pendientes». */
    this.levantarRequerimientosHuerfanos(obra_id, usuario_id);
    return { ok: true, obra: this.obras().find((o) => o.id === obra_id)! };
  }

  /** Los requerimientos del plano sin ítem, en obras ligadas: nace su ítem
   *  cotizado y su renglón en el borrador de quote101, como si se levantaran
   *  hoy (levantarRequerimiento). Con `obra_id` sólo esa obra; sin él, todas.
   *  Idempotente: una pieza con ítem no se toca. Devuelve cuántos levantó. */
  levantarRequerimientosHuerfanos(obra_id: string | null = null, usuario_id = 'sistema'): number {
    const piezas = this.sql
      .exec(
        /* La 0030 corre esto en código ANTES de que la 0038 agregue la
         * descripción: en una empresa nueva la columna todavía no existe. */
        `SELECT e.id, e.project_id, e.code, e.name, e.padre_id, ${this.tieneColumna('quell_elements', 'descripcion') ? 'e.descripcion' : 'NULL AS descripcion'}
           FROM quell_elements e JOIN quell_projects o ON o.id = e.project_id
          WHERE e.item_id IS NULL AND o.proyecto_id IS NOT NULL
            AND lower(trim(e.type)) = 'requerimiento'` + (obra_id ? ` AND e.project_id = ?` : '') + ` ORDER BY e.created_at, e.code`,
        ...(obra_id ? [obra_id] : []),
      )
      .toArray() as Fila[];
    let levantados = 0;
    for (const pz of piezas) {
      const padre = pz.padre_id
        ? (this.sql.exec(`SELECT item_id FROM quell_elements WHERE id = ?`, String(pz.padre_id)).toArray()[0] as Fila | undefined)
        : undefined;
      const r = this.levantarRequerimiento({
        element_id: String(pz.id), obra_id: String(pz.project_id), code: String(pz.code ?? ''), name: String(pz.name ?? ''),
        usuario_id, padre_item_id: padre?.item_id ? String(padre.item_id) : null,
        descripcion: pz.descripcion == null ? null : String(pz.descripcion),
      });
      if (r.item_id) levantados++;
    }
    return levantados;
  }

  private tieneColumna(tabla: string, columna: string): boolean {
    return (this.sql.exec(`SELECT name FROM pragma_table_info(?)`, tabla).toArray() as Fila[]).some((c) => c.name === columna);
  }

  /** 0040, en código: los datos de contacto y el logotipo de la empresa. */
  private empresaLogoYDatos(): void {
    this.sql.exec(SQL_EMPRESA);
    for (const col of COLUMNAS_0040) {
      if (!this.tieneColumna('empresa', col)) this.sql.exec(`ALTER TABLE empresa ADD COLUMN ${col} TEXT`);
    }
  }

  /** 0043, en código: las dos columnas de la aceptación de riesgos de una
   *  oferta (patron101, 0.84.0). El .sql es la migración; aquí se corre de
   *  modo que repetirla no truene, por lo mismo que la 0041: SQLite no tiene
   *  `ADD COLUMN IF NOT EXISTS` y hay pruebas que regresan la versión. */
  private inversionRiesgos(): void {
    for (const m of inversionRiesgos.matchAll(/^ALTER TABLE (\w+) ADD COLUMN (\w+) (\w+);$/gm)) {
      if (!this.tieneColumna(m[1], m[2])) this.sql.exec(`ALTER TABLE ${m[1]} ADD COLUMN ${m[2]} ${m[3]}`);
    }
  }

  /** 0047, en código: lo de timbrar (bill101 fase C). Misma forma que la 0044. */
  private timbrar(): void {
    this.sql.exec(timbrar.replace(/^ALTER TABLE .*$/gm, ''));
    for (const m of timbrar.matchAll(/^ALTER TABLE (\w+) ADD COLUMN (\w+) (\w+);$/gm)) {
      const [, tabla, columna, tipo] = m;
      if (!this.tieneColumna(tabla, columna)) this.sql.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
    }
  }

  /** 0049, en código: la marca del archivo del diseño definido (quell101,
   *  0.90.0). Misma razón que la 0041: SQLite no tiene `ADD COLUMN IF NOT
   *  EXISTS` y hay pruebas que regresan la versión. El índice sí es
   *  idempotente por sí solo. */
  private disenoDelItem(): void {
    if (!this.tieneColumna('quell_element_docs', 'diseno')) {
      this.sql.exec(`ALTER TABLE quell_element_docs ADD COLUMN diseno INTEGER NOT NULL DEFAULT 0`);
    }
    this.sql.exec(disenoDelItem.replace(/^ALTER TABLE .*$/gm, ''));
  }

  /** 0050, en código: la cuenta a la que se reembolsa (0.92.0). Misma forma
   *  que la 0047: la tabla es `IF NOT EXISTS`, las columnas se agregan sólo si
   *  faltan. */
  private cuentaDeReembolso(): void {
    this.sql.exec(cuentaDeReembolso.replace(/^ALTER TABLE .*$/gm, ''));
    for (const m of cuentaDeReembolso.matchAll(/^ALTER TABLE (\w+) ADD COLUMN (\w+) (\w+);$/gm)) {
      const [, tabla, columna, tipo] = m;
      if (!this.tieneColumna(tabla, columna)) this.sql.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
    }
  }

  /** 0048, en código: la factura nueva, segunda vuelta. Misma forma que la 0047. */
  private facturaV2(): void {
    this.sql.exec(facturaV2.replace(/^ALTER TABLE .*$/gm, ''));
    for (const m of facturaV2.matchAll(/^ALTER TABLE (\w+) ADD COLUMN (\w+) (\w+);$/gm)) {
      const [, tabla, columna, tipo] = m;
      if (!this.tieneColumna(tabla, columna)) this.sql.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
    }
  }

  /** 0044, en código: lo que bill101 le agrega a `cfdi` y sus cuatro tablas.
   *  El .sql ES la migración; aquí se corre de manera que repetirla no
   *  truene, por lo mismo que la 0041. Lo que ya estaba capturado no se
   *  toca: sus columnas nuevas quedan nulas, y nulo se lee como «a mano»,
   *  «factura normal» y «trato normal» (src/fiscal-db.ts). */
  private bill101(): void {
    this.sql.exec(bill.replace(/^ALTER TABLE .*$/gm, ''));
    for (const m of bill.matchAll(/^ALTER TABLE (\w+) ADD COLUMN (\w+) (\w+);$/gm)) {
      const [, tabla, columna, tipo] = m;
      if (!this.tieneColumna(tabla, columna)) this.sql.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
    }
  }

  /** 0041, en código: las tablas de cost101 y las columnas que gana
   *  `productos`. El .sql ES la migración —de ahí se leen las sentencias, y de
   *  ahí lee el esquema la prueba—; aquí sólo se corre de manera que repetirla
   *  no truene: SQLite no tiene `ADD COLUMN IF NOT EXISTS`, y una base a la
   *  que se le regresa la versión (las pruebas de la 0036, 0037 y 0039 lo
   *  hacen) volvería a pasar por aquí con las columnas ya puestas. */
  private costosDeObra(): void {
    const sinAlter = costos.replace(/^ALTER TABLE .*$/gm, '');
    this.sql.exec(sinAlter);
    for (const m of costos.matchAll(/^ALTER TABLE (\w+) ADD COLUMN (\w+) (\w+);$/gm)) {
      const [, tabla, columna, tipo] = m;
      if (!this.tieneColumna(tabla, columna)) this.sql.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
    }
  }

  /** 0030, en código: repara las obras ya ligadas de la empresa. */
  private migrarRequerimientosHuerfanos(): void {
    this.levantarRequerimientosHuerfanos(null, 'migracion-0030');
  }

  /* ─────────────── la obra de quell101 nace también en la suite (0.77.0) ───────────────
   *
   * Mike, 6-oct: «Cree un nuevo proyecto en Quell, con un cliente nuevo. Pero
   * no me aparece ni el cliente ni el proyecto ni en quote ni en dash.»
   *
   * «+ Proyecto» en quell guardaba sólo la obra con el cliente como texto.
   * Ahora la obra nace con su cliente —el que se escogió, el que ya existe
   * con ese mismo nombre, o uno nuevo— y su proyecto, ligados: lo mismo que
   * haría quien activa la obra en dash101, sin tener que ir a hacerlo.
   *
   * Sin cliente no hay proyecto (la suite no tiene proyectos sin cliente), y
   * la obra se queda como antes, suelta. Una obra ya ligada no se toca. */
  altaDeObraEnLaSuite(d: { obra_id: string; cliente_id?: string | null; cliente_nombre?: string | null; usuario_id: string }):
    { proyecto_id: string; cliente_id: string; cliente_nombre: string; cliente_nuevo: boolean } | null {
    const obra = this.sql.exec(`SELECT id, name, client, status, proyecto_id FROM quell_projects WHERE id = ?`, d.obra_id).toArray()[0] as Fila | undefined;
    if (!obra || obra.proyecto_id) return null;
    const contexto = { app: 'quell101', usuario_id: d.usuario_id };
    let cliente = d.cliente_id ? this.obtener('clientes', String(d.cliente_id)) : null;
    let nuevo = false;
    if (!cliente) {
      const nombre = String(d.cliente_nombre ?? '').trim();
      if (!nombre) return null;
      // El mismo nombre (sin acentos ni mayúsculas) es el mismo cliente: no se duplica.
      cliente = (this.sql.exec(`SELECT * FROM clientes WHERE nombre_norm = ? ORDER BY creado_at LIMIT 1`, normalizar(nombre)).toArray()[0] as Fila | undefined) ?? null;
      if (!cliente) { cliente = this.crear('clientes', { nombre } as Fila, contexto); nuevo = true; }
    }
    const proyecto = this.crear('proyectos', {
      nombre: String(obra.name ?? '').trim() || 'Obra de quell101', cliente_id: cliente.id,
      estado: obra.status === 'cerrado' ? 'cerrado' : 'activo',
    } as Fila, contexto);
    const r = this.ligarObra(String(obra.id), String(proyecto.id), d.usuario_id);
    if ('error' in r) throw new Error(`no se pudo ligar la obra ${obra.id}: ${r.error}`);
    // El texto del cliente en la tarjeta de quell dice el nombre como quedó en la suite.
    this.sql.exec(`UPDATE quell_projects SET client = ? WHERE id = ?`, String(cliente.nombre), String(obra.id));
    return { proyecto_id: String(proyecto.id), cliente_id: String(cliente.id), cliente_nombre: String(cliente.nombre), cliente_nuevo: nuevo };
  }

  /** 0039, en código: las obras que ya existían sin proyecto (decisión de
   *  Mike, 6-oct: «darlos de alta todos»). Las que no traen cliente escrito
   *  se quedan sueltas. */
  private migrarObrasSueltas(): void {
    const sueltas = this.sql
      .exec(`SELECT id, client FROM quell_projects WHERE proyecto_id IS NULL AND trim(coalesce(client, '')) <> '' ORDER BY created_at, id`)
      .toArray() as Fila[];
    for (const o of sueltas) {
      // Una obra que no se pueda dar de alta se queda suelta como estaba; la
      // empresa tiene que abrir igual, y en dash101 se activa a mano.
      try { this.altaDeObraEnLaSuite({ obra_id: String(o.id), cliente_nombre: String(o.client), usuario_id: 'migracion-0039' }); }
      catch (e) { console.error('0039', o.id, e); }
    }
  }

  /* ─────────────── los ítems, uno solo de los dos lados (§91) ───────────────
   *
   * Mike, 20-sep: los ítems de una obra en quell101 y los ítems vendidos de
   * su proyecto en dash101 son la misma lista de piezas contada dos veces.
   * Ligar la obra con el proyecto (migración 0010) dijo que son la misma
   * casa; esto dice que son las mismas piezas.
   *
   * Se hace en DOS pasos a propósito —primero se propone, luego se aplica—,
   * que es el mismo modo de las mudanzas de este repositorio. Emparejar
   * piezas por parecido acierta casi siempre y se equivoca a veces, y una
   * equivocación aquí le cuelga el dinero de una pieza a otra. Quien decide
   * mira la propuesta antes de que se escriba nada.
   */

  /** La propuesta: qué se emparejaría con qué, sin tocar nada.
   *
   *  Tres montones, y los tres importan:
   *
   *   · `parejas`  — una pieza del plano y un ítem vendido que se parecen
   *                  tanto que casi seguro son lo mismo. Se emparejan por
   *                  CÓDIGO primero (el código es único dentro de la obra,
   *                  así que si coincide no hay duda) y por nombre después.
   *   · `nuevos`   — piezas del plano sin nada que se les parezca. Se les
   *                  crearía un ítem.
   *   · `sueltos`  — ítems vendidos sin pieza en el plano. NO se tocan: son
   *                  los «ítems sin ubicar», y ubicarlos es poner un punto en
   *                  un plano, que lo hace una persona mirando el dibujo.
   *
   *  Un ítem ya emparejado no vuelve a salir: la propuesta es idempotente y
   *  aplicarla dos veces no duplica nada. */
  itemsDeLaObra(obra_id: string): { obra: Fila; parejas: Fila[]; nuevos: Fila[]; sueltos: Fila[]; candidatos: Fila[] } | { error: string; detalle?: unknown } {
    const obra = this.sql.exec(`SELECT * FROM quell_projects WHERE id = ?`, obra_id).toArray()[0] as Fila | undefined;
    if (!obra) return { error: 'no_encontrado', detalle: { que: 'obra', id: obra_id } };
    if (!obra.proyecto_id) {
      return { error: 'sin_liga', detalle: { motivo: 'esta obra todavía no está ligada a un proyecto de dash101' } };
    }
    const proyecto_id = String(obra.proyecto_id);

    const piezas = this.sql
      .exec(`SELECT id, code, name, type FROM quell_elements WHERE project_id = ? AND item_id IS NULL ORDER BY code, name`, obra_id)
      .toArray() as Fila[];
    const libres = this.sql
      .exec(
        `SELECT i.id, i.clave, i.nombre, i.tipo, i.monto, i.cantidad, i.estado
         FROM items i
         WHERE i.proyecto_id = ? AND i.estado <> 'cancelado'
           AND (SELECT COUNT(*) FROM quell_elements e WHERE e.item_id = i.id) < i.cantidad
         ORDER BY i.creado_at`,
        proyecto_id,
      )
      .toArray() as Fila[];

    /* Cuántas piezas de cada ítem quedan por emparejar. Un ítem de cantidad
     * 20 con 3 puestas admite 17 más: emparejar de uno en uno sin llevar la
     * cuenta le colgaría 20 piezas a un ítem de una. */
    const cupo = new Map<string, number>();
    for (const i of libres) {
      const ya = Number(
        (this.sql.exec(`SELECT COUNT(*) AS n FROM quell_elements WHERE item_id = ?`, String(i.id)).toArray()[0] as Fila).n,
      );
      cupo.set(String(i.id), Math.max(0, Number(i.cantidad ?? 1) - ya));
    }

    const porClave = new Map<string, Fila[]>();
    const porNombre = new Map<string, Fila[]>();
    for (const i of libres) {
      if (i.clave) (porClave.get(String(i.clave)) ?? porClave.set(String(i.clave), []).get(String(i.clave))!).push(i);
      const n = normalizar(String(i.nombre ?? ''));
      if (n) (porNombre.get(n) ?? porNombre.set(n, []).get(n)!).push(i);
    }
    const conCupo = (lista: Fila[] | undefined) => lista?.find((i) => (cupo.get(String(i.id)) ?? 0) > 0);

    const parejas: Fila[] = [];
    const nuevos: Fila[] = [];
    for (const pz of piezas) {
      const porCodigo = pz.code ? conCupo(porClave.get(String(pz.code))) : undefined;
      const item = porCodigo ?? conCupo(porNombre.get(normalizar(String(pz.name ?? ''))));
      if (item) {
        cupo.set(String(item.id), (cupo.get(String(item.id)) ?? 1) - 1);
        parejas.push({
          element_id: pz.id, codigo: pz.code, pieza: pz.name, tipo: pz.type,
          item_id: item.id, item_clave: item.clave, item_nombre: item.nombre,
          monto: item.monto, cantidad: item.cantidad, estado: item.estado,
          // Por qué se emparejaron, para que quien decide no tenga que adivinar.
          por: porCodigo ? 'codigo' : 'nombre',
        });
      } else {
        nuevos.push({ element_id: pz.id, codigo: pz.code, pieza: pz.name, tipo: pz.type });
      }
    }
    const emparejados = new Set(parejas.map((p) => String(p.item_id)));
    const sueltos = libres.filter((i) => !emparejados.has(String(i.id)));

    /* Y TODOS los ítems que todavía admiten una pieza, con cuántas les
     * caben. Sin esta lista, la pantalla sólo podía aceptar o rechazar lo
     * que el parecido propuso; con ella, quien decide escoge a mano cuál es
     * cuál. Mike lo pidió con esas palabras el 20-sep: «que pueda escoger de
     * la lista qué ítem corresponde al de quell».
     *
     * Es la misma lista de `libres`, pero dicha completa: `parejas` y
     * `sueltos` la parten en dos según lo que el parecido adivinó, y para un
     * desplegable hace falta entera. */
    const candidatos = libres.map((i) => {
      const ya = Number(
        (this.sql.exec(`SELECT COUNT(*) AS n FROM quell_elements WHERE item_id = ?`, String(i.id)).toArray()[0] as Fila).n,
      );
      return { ...i, ubicados: ya, cupo: Math.max(0, Number(i.cantidad ?? 1) - ya) };
    });

    return { obra, parejas, nuevos, sueltos, candidatos };
  }

  /** Aplicar la propuesta. Lo que no venga en el cuerpo NO se toca.
   *
   *  `ligar` cuelga una pieza del plano de un ítem que ya existe. `crear` le
   *  hace un ítem nuevo a una pieza que no tenía.
   *
   *  SIN PRECIO, el ítem nuevo nace **cotizado y en cero**, y las dos cosas
   *  son a propósito. Una pieza del plano no trae precio: nadie se lo ha
   *  puesto. Nacer «vendido» en cero metería una venta de cero pesos en el
   *  precio del proyecto —`precio_venta` suma los vendidos— y dejaría la
   *  proyección diciendo una cifra que nadie tecleó.
   *
   *  CON PRECIO nace vendido, y eso también es a propósito. Mike, 20-sep:
   *  «debería poder de ahí mismo agregar un ítem nuevo con precio y
   *  descripción para que ya se sume». Quien teclea un precio en esa
   *  pantalla está diciendo cuánto vale, no proponiéndolo; obligarlo a ir al
   *  proyecto a marcarlo vendido es un segundo paso que sólo sirve para
   *  olvidarse.
   *
   *  Y `sumar` es la tercera puerta: «o agregarlo al conteo de un concepto
   *  ya existente, una puerta más a las 14 ya existentes del mismo modelo».
   *  Sube en uno la cantidad del ítem y le agrega el precio de UNA pieza.
   *  Eso mueve dinero, así que no pasa nunca solo: sin `sumar`, una pieza de
   *  más sigue siendo 409 `sin_cupo`. */
  fusionarItemsDeLaObra(
    obra_id: string,
    plan: {
      ligar?: Array<{ element_id: string; item_id: string; clave?: 'quell' | 'dash'; nombre?: 'quell' | 'dash'; sumar?: boolean }>;
      crear?: Array<string | { element_id: string; monto?: number; descripcion?: string; nombre?: string }>;
    },
    contexto: { usuario_id: string },
  ): { ok: true; ligados: number; creados: number; renombrados: number; sumados: number; obra: Fila } | { error: string; detalle?: unknown } {
    const obra = this.sql.exec(`SELECT * FROM quell_projects WHERE id = ?`, obra_id).toArray()[0] as Fila | undefined;
    if (!obra) return { error: 'no_encontrado', detalle: { que: 'obra', id: obra_id } };
    if (!obra.proyecto_id) return { error: 'sin_liga', detalle: { motivo: 'esta obra todavía no está ligada a un proyecto de dash101' } };
    const proyecto_id = String(obra.proyecto_id);
    const proyecto = this.obtener('proyectos', proyecto_id);
    if (!proyecto) return { error: 'no_encontrado', detalle: { que: 'proyecto', id: proyecto_id } };

    const pieza = (eid: string) =>
      this.sql.exec(`SELECT * FROM quell_elements WHERE id = ? AND project_id = ?`, eid, obra_id).toArray()[0] as Fila | undefined;

    /* DOS PASADAS: primero se revisa TODO, y sólo si todo cuadra se escribe.
     *
     * No es purismo. La primera versión escribía la liga y después revisaba
     * el código; cuando el código chocaba, contestaba 409 y la pieza se
     * quedaba ligada de todos modos. Lo atrapó su propia prueba: el rechazo
     * tiene que dejar las cosas como estaban.
     *
     * Y la cuenta del cupo se lleva DENTRO de la pasada, no sólo contra la
     * base: en un mismo envío se puede escoger dos veces el mismo ítem de
     * cantidad 1, y contra la base las dos pasarían. */
    const ligar = (plan.ligar ?? []).filter((par) => {
      const pz = pieza(par.element_id);
      return pz && !pz.item_id; // lo que ya estaba ligado se salta: aplicar dos veces no duplica
    });

    const usado = new Map<string, number>();   // item_id → piezas que ya le cuelgan
    const crecer = new Map<string, number>();  // item_id → en cuántas piezas crece el concepto
    const nombres = new Map<string, { que: 'item' | 'pieza'; valor: string }>();

    for (const par of ligar) {
      const pz = pieza(par.element_id)!;
      const it = this.sql
        .exec(`SELECT id, nombre, clave, cantidad FROM items WHERE id = ? AND proyecto_id = ?`, par.item_id, proyecto_id)
        .toArray()[0] as Fila | undefined;
      if (!it) return { error: 'no_encontrado', detalle: { que: 'item', id: par.item_id, motivo: 'ese ítem no es del proyecto de esta obra' } };

      /* EL CUPO SE REVISA AQUÍ, no sólo al proponer.
       *
       * Mientras la propuesta la sugería el parecido, el cupo venía
       * respetado de fábrica. Desde que empareja una persona a mano, este
       * servidor es el único que lleva la cuenta: se puede escoger tres
       * veces el mismo ítem de cantidad 1 sin querer, y entonces «cuánto
       * falta por fabricar» tendría tres respuestas ciertas. */
      const yaEnBase = Number(
        (this.sql.exec(`SELECT COUNT(*) AS n FROM quell_elements WHERE item_id = ?`, par.item_id).toArray()[0] as Fila).n,
      );
      const ya = yaEnBase + (usado.get(String(par.item_id)) ?? 0);
      const cabe = Number(it.cantidad ?? 1) + (crecer.get(String(par.item_id)) ?? 0);
      if (ya >= cabe) {
        /* O crece el concepto, o se rechaza. Crecer mueve dinero —una
         * puerta más vale una puerta más—, así que sólo pasa si alguien lo
         * pidió con todas sus letras. */
        if (!par.sumar) {
          return {
            error: 'sin_cupo',
            detalle: { item_id: par.item_id, item: it.nombre, cantidad: Number(it.cantidad ?? 1), ubicados: ya,
                       motivo: 'ese ítem ya tiene en el plano todas las piezas que dice su cantidad',
                       se_puede: 'mandar `sumar: true` en esa pareja para que el concepto pase a una pieza más, con su precio' },
          };
        }
        crecer.set(String(par.item_id), (crecer.get(String(par.item_id)) ?? 0) + 1);
      }
      usado.set(String(par.item_id), (usado.get(String(par.item_id)) ?? 0) + 1);

      /* EL CÓDIGO ES LA IDENTIDAD, y queda igual en los dos lados.
       *
       * Mike, 20-sep: «lo que va a ser lo mismo es el código de ítem, ej.
       * CAR-01, PT-09, porque el nombre descriptivo viene en el detalle de
       * dash y en el detalle de quell». Tiene razón, y cambia qué se
       * unifica: el código es lo que nombra a la MISMA pieza en las dos
       * apps; el nombre es una descripción y cada lado puede tener la suya.
       *
       * Tres casos, y sólo uno necesita que alguien decida:
       *   · uno tiene código y el otro no  → se copia. Eso es llenar un
       *     hueco, no decidir;
       *   · los dos tienen el MISMO        → no hay nada que hacer;
       *   · los dos tienen y son distintos → gana el que se pidió en
       *     `clave`. Sin `clave` no se toca ninguno: inventarle un ganador a
       *     dos códigos que alguien tecleó a propósito es justo lo que no se
       *     hace solo. */
      /* LOS DOS CÓDIGOS SON DOS COSAS, Y NO SE MEZCLAN.
       *
       * Mike lo ordenó el 20-sep, y es la palabra final sobre esto: «una
       * cosa es el código de ítem (pieza física en obra) y otra diferente
       * el código de producto de catálogo. (…) Cada ítem es un código de
       * producto y puede haber varios ítems del mismo modelo».
       *
       *   · `quell_elements.code` es el CÓDIGO DE LA PIEZA: PT-01, PT-02.
       *     Nombra una puerta en un plano, y es único dentro de la obra.
       *   · `items.clave` es el CÓDIGO DE PRODUCTO: el del modelo en el
       *     catálogo. Veintinueve puertas iguales son veintinueve piezas y
       *     UN producto.
       *
       * Hasta el 0.28.0 esto los unificaba —copiaba uno al otro y hasta
       * preguntaba cuál ganaba—, porque yo entendía que eran el mismo dato
       * con dos nombres. No lo son, y unificarlos le ponía a un producto el
       * folio de una de sus piezas: al ligar la segunda, el producto
       * cambiaba de código, y el de la primera quedaba escrito en un plano
       * que ya nadie podía relacionar con nada.
       *
       * Así que aquí ya no se toca ninguno de los dos. `clave` en el cuerpo
       * se acepta y se ignora, para no tronarle a una pantalla vieja que
       * todavía la mande. */
      void par.clave;

      /* El nombre: LOS DOS LADOS LO TIENEN, y unificarlo es una decisión, no
       * un hueco que llenar.
       *
       * Mike lo precisó el 20-sep: «el código y el nombre son 2 campos
       * diferentes, pero sí los llevan los 2 apps». Los dos siempre traen
       * nombre —en la base ninguno admite vacío—, así que nunca hay nada que
       * copiar: o se deja cada uno con el suyo, o alguien escoge cuál gana.
       * Por eso, sin `nombre`, no se toca ninguno; y cuando se escoge, queda
       * en los dos lados, que fue lo que él decidió.
       *
       * La DESCRIPCIÓN no entra en esto: `items` la tiene y
       * `quell_elements` no. Vive sólo del lado de dash101 y ahí se queda. */
      if (par.nombre === 'quell' && pz.name && pz.name !== it.nombre) {
        nombres.set(`nombre:${par.item_id}`, { que: 'item', valor: String(pz.name) });
      } else if (par.nombre === 'dash' && it.nombre && it.nombre !== pz.name) {
        nombres.set(`pieza:${par.element_id}`, { que: 'pieza', valor: String(it.nombre) });
      }
    }

    // Todo cuadró: ahora sí se escribe.
    let ligados = 0;
    let renombrados = 0;
    for (const par of ligar) {
      this.sql.exec(`UPDATE quell_elements SET item_id = ? WHERE id = ?`, par.item_id, par.element_id);
      ligados++;
    }
    for (const [llave, v] of nombres) {
      const id = llave.split(':')[1];
      if (llave.startsWith('clave:')) this.actualizar('items', id, { clave: v.valor } as unknown as Fila);
      else if (llave.startsWith('nombre:')) { this.actualizar('items', id, { nombre: v.valor } as unknown as Fila); renombrados++; }
      else { this.sql.exec(`UPDATE quell_elements SET name = ? WHERE id = ?`, v.valor, id); renombrados++; }
    }

    /* Los conceptos que crecen: una pieza más, y el precio de una pieza más.
     *
     * El precio de la pieza sale de dividir el importe de la línea entre su
     * cantidad, que es exacto porque la multiplicación se hizo en centavos
     * enteros. Si la división no es entera se redondea, y el precio por
     * pieza queda con centavos de diferencia: es preferible a inventarle un
     * precio a la pieza nueva, y se corrige tecleando el importe del
     * concepto, que es donde vive la cifra que se cobra. */
    let sumados = 0;
    for (const [item_id, cuantas] of crecer) {
      const it = this.sql.exec(`SELECT monto, cantidad FROM items WHERE id = ?`, item_id).toArray()[0] as Fila;
      const cantidadAntes = Math.max(1, Math.trunc(Number(it.cantidad ?? 1)));
      const porPieza = Math.round(Number(it.monto ?? 0) / cantidadAntes);
      const antes = Number(it.monto ?? 0);
      this.sql.exec(
        `UPDATE items SET cantidad = ?, monto = ?, actualizado_at = ? WHERE id = ?`,
        cantidadAntes + cuantas, antes + porPieza * cuantas, ahora(), item_id,
      );
      /* El precio del concepto cambió, así que deja huella en la bitácora de
       * sus piezas, igual que cuando lo cambian a mano en dash101. */
      if (porPieza) this.huellaDePrecio(item_id, antes);
      sumados += cuantas;
    }

    let creados = 0;
    for (const nueva of plan.crear ?? []) {
      const pide = typeof nueva === 'string' ? { element_id: nueva } : nueva;
      const eid = pide.element_id;
      const pz = pieza(eid);
      if (!pz) return { error: 'no_encontrado', detalle: { que: 'pieza', id: eid, motivo: 'esa pieza no es de esta obra' } };
      if (pz.item_id) continue;
      /* Con precio nace vendido; sin precio, cotizado y en cero. Un importe
       * negativo no es un precio, y en centavos enteros: la pantalla
       * convierte, aquí no se adivina. */
      const monto = Number.isFinite(Number(pide.monto)) && Number(pide.monto) > 0 ? Math.trunc(Number(pide.monto)) : 0;
      if (pide.monto !== undefined && !Number.isInteger(Number(pide.monto))) {
        return { error: 'dinero_no_entero', detalle: { element_id: eid, monto: pide.monto, motivo: 'el dinero va en centavos enteros' } };
      }
      /* 0.64.2 · Un requerimiento del plano sin precio es un requerimiento:
       * nace con su tipo y cae en el borrador de quote101, no como una pieza
       * cotizada cualquiera que quote101 no sabría de dónde salió. */
      if (esRequerimiento(pz.type) && monto === 0) {
        const r = this.levantarRequerimiento({
          element_id: String(pz.id), obra_id, code: String(pz.code ?? ''), name: String(pide.nombre ?? '').trim() || String(pz.name ?? ''),
          usuario_id: contexto.usuario_id, padre_item_id: null,
        });
        if (r.item_id) creados++;
        continue;
      }
      const item = this.crear(
        'items',
        {
          proyecto_id, cliente_id: proyecto.cliente_id,
          clave: pz.code ?? '', nombre: String(pide.nombre ?? '').trim() || pz.name || 'Pieza del plano', tipo: pz.type ?? '',
          monto, cantidad: 1, estado: monto > 0 ? 'vendido' : 'cotizado',
          descripcion: String(pide.descripcion ?? '').trim() ||
            (monto > 0 ? 'Traído del plano de la obra.' : 'Traído del plano de la obra. Falta ponerle precio.'),
          origen: { de: 'quell', element_id: pz.id, obra_id },
        } as unknown as Fila,
        { app: 'quell101', usuario_id: contexto.usuario_id },
      );
      this.sql.exec(`UPDATE quell_elements SET item_id = ? WHERE id = ?`, String(item.id), eid);
      creados++;
    }

    if (sumados || creados) this.recalcularProyecto(proyecto_id);
    return { ok: true, ligados, creados, renombrados, sumados, obra: this.obras().find((o) => o.id === obra_id)! };
  }

  /** El precio de un ítem cambió: se cuenta en la bitácora de cada pieza del
   *  plano que lo cumple.
   *
   *  Va sin persona (`user_id` NULL, migración 0013) y con `kind='precio'`.
   *  No lo escribió alguien de la obra contando lo que hizo: lo escribió el
   *  sistema al ver que el dinero se movió en dash101. Atribuírselo a una
   *  persona de la obra sería una mentira que se lee como verdad tres meses
   *  después, cuando alguien pregunte quién autorizó el cambio.
   *
   *  Si el ítem no está en ningún plano, no hay nada que contar y no se
   *  escribe: una bitácora llena de entradas sin pieza deja de leerse. */
  private huellaDePrecio(item_id: string, antes: number): void {
    const item = this.obtener('items', item_id);
    if (!item) return;
    const ahora_ = Number(item.monto);
    if (!Number.isFinite(ahora_) || ahora_ === antes) return;
    const piezas = this.sql.exec(`SELECT id FROM quell_elements WHERE item_id = ?`, item_id).toArray() as Fila[];
    if (!piezas.length) return;
    const pesos = (c: number) => `$${(Math.round(c) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const texto = `El precio de «${item.nombre}» pasó de ${pesos(antes)} a ${pesos(ahora_)}. Se cambió en dash101.`;
    for (const pz of piezas) {
      this.sql.exec(
        `INSERT INTO quell_log_entries (id, element_id, user_id, kind, text) VALUES (?,?,NULL,'precio',?)`,
        crypto.randomUUID(),
        String(pz.id),
        texto,
      );
    }
  }

  /** 0.78.0 · La nota interna del renglón de quote101, en la bitácora de la
   *  pieza (o piezas) del ítem que se acaba de aprobar. Sin persona
   *  (`user_id` NULL, sale como «Suite 101», igual que la huella del precio)
   *  y como 'acuerdo': lo que el taller dejó dicho al cotizarlo. El cliente
   *  no ve la bitácora (motor: `log: []` para el cliente). Un ítem que no
   *  está en ningún plano no tiene bitácora: no se escribe. */
  private notaInternaEnLaBitacora(item_id: string, nota: unknown, cotizacion: string): void {
    const texto = String(nota ?? '').trim().slice(0, 4000);
    if (!texto) return;
    const piezas = this.sql.exec(`SELECT id FROM quell_elements WHERE item_id = ?`, item_id).toArray() as Fila[];
    for (const pz of piezas) {
      this.sql.exec(
        `INSERT INTO quell_log_entries (id, element_id, user_id, kind, text) VALUES (?,?,NULL,'acuerdo',?)`,
        crypto.randomUUID(), String(pz.id), `Nota interna de la cotización «${cotizacion}» (quote101), al autorizarse: ${texto}`,
      );
    }
  }

  /** Quitar la liga. No borra nada de ninguno de los dos lados: los deja
   *  sueltos, cada uno con lo suyo. */
  desligarObra(obra_id: string): { ok: true; obra: Fila } | { error: string; detalle?: unknown } {
    const obra = this.sql.exec(`SELECT id FROM quell_projects WHERE id = ?`, obra_id).toArray()[0] as Fila | undefined;
    if (!obra) return { error: 'no_encontrado', detalle: { que: 'obra', id: obra_id } };
    this.sql.exec(`UPDATE quell_projects SET proyecto_id = NULL WHERE id = ?`, obra_id);
    return { ok: true, obra: this.obras().find((o) => o.id === obra_id)! };
  }


  /* ─────────────── varios ítems iguales, un solo concepto (§98) ───────────────
   *
   * Mike, 20-sep-2026: «necesito poder agrupar varios ítems en un solo
   * concepto. Ejemplo: son varias puertas iguales en diferente ubicación
   * —quell las ubica en plano y cada una tiene su seguimiento— pero el
   * producto es el mismo, "una puerta de X*X de tal acabado", y no tiene caso
   * tener 21 ítems idénticos enlistados en dash».
   *
   * LO QUE SE JUNTA ES EL CONCEPTO, NO EL SEGUIMIENTO. Las 21 puertas siguen
   * siendo 21 piezas en quell101, cada una con su ubicación en el plano, su
   * bitácora y sus etapas. Lo que cambia es que las 21 cuelgan del MISMO
   * ítem, y `items.cantidad` dice cuántas son. La columna ya existía
   * (migración 0011) y ya se usa para el cupo al emparejar; lo que faltaba es
   * poder juntar los que ya se capturaron por separado. Por eso esto no lleva
   * migración: no hay columna nueva, hay una operación nueva.
   *
   * LA REGLA QUE NO SE ROMPE: el precio de venta del proyecto no se mueve.
   * `monto` es el importe de la línea —no el de una pieza—, así que el del
   * concepto es la SUMA de los que se juntaron. Si acomodar la lista moviera
   * el total, sería un cambio de precio disfrazado de acomodo.
   */

  /** Qué ítems del proyecto son el mismo producto capturado varias veces.
   *
   *  La propuesta es por nombre normalizado, tipo, estado, moneda y PRECIO
   *  POR PIEZA. El precio va en la llave a propósito: dos renglones que se
   *  llaman igual y cuestan distinto no son el mismo producto, o alguien se
   *  equivocó en uno de los dos, y juntarlos taparía el error dentro de un
   *  promedio.
   *
   *  Propone; no junta. Quien decide escoge, porque el parecido de un nombre
   *  no es la última palabra —la lección de emparejar los ítems, 20-sep—. */
  /** La FAMILIA de un nombre: lo que queda al quitarle el número de la
   *  pieza. «Puerta 01», «Puerta 02» y «Puerta 29» son todas «puerta».
   *
   *  Hace falta porque el nombre de una pieza traída del plano trae su
   *  número —así se dibuja en obra—, y agrupar por nombre idéntico no
   *  encontraba nunca las 29 puertas del mismo modelo. Mike lo reportó con
   *  la pantalla enfrente el 20-sep: «el código sí es diferente por ítem
   *  (PT-01, PT-02…) pero el concepto se puede agrupar porque todas son el
   *  mismo modelo de puerta».
   *
   *  Se quita UN número del final, con su separador si lo trae. No se
   *  quitan los números de en medio ni los que son medida: «Puerta 0.90»
   *  conserva su 0.90 —ahí el número ES el producto— y «Repisa 60» pierde
   *  el 60, que es el riesgo conocido de esto. Por eso propone y no junta:
   *  quien decide ve los nombres de adentro antes de aplicar. */
  private familiaDe(nombre: unknown): string {
    const n = normalizar(nombre);
    // Sólo enteros cortos al final: un «0.90» o un «120x60» no es un folio.
    return n.replace(/[\s\-#_.]*\b\d{1,3}\s*$/, '').trim() || n;
  }

  gruposDeItems(proyecto_id: string): { proyecto: Fila; grupos: Fila[] } | { error: string; detalle?: unknown } {
    const proyecto = this.obtener('proyectos', proyecto_id);
    if (!proyecto) return { error: 'no_encontrado', detalle: { que: 'proyecto', id: proyecto_id } };

    const items = this.sql
      .exec(`SELECT * FROM items WHERE proyecto_id = ? AND estado <> 'cancelado' AND producto_id IS NULL
              ORDER BY creado_at`, proyecto_id)
      .toArray() as Fila[];

    const ubicadosDe = (item_id: string) =>
      Number((this.sql.exec(`SELECT COUNT(*) AS n FROM quell_elements WHERE item_id = ?`, item_id).toArray()[0] as Fila).n);

    const por = new Map<string, Fila[]>();
    for (const it of items) {
      const cant = Math.max(1, Math.trunc(Number(it.cantidad ?? 1)));
      const pieza = Math.round(Number(it.monto ?? 0) / cant);
      const llave = [this.familiaDe(it.nombre), String(it.tipo ?? ''), String(it.estado), String(it.moneda ?? 'MXN'), pieza].join('|');
      const ya = por.get(llave);
      if (ya) ya.push(it);
      else por.set(llave, [it]);
    }

    const grupos = [...por.values()]
      .filter((g) => g.length > 1)
      .map((g) => {
        const cant = (it: Fila) => Math.max(1, Math.trunc(Number(it.cantidad ?? 1)));
        /* El nombre que se propone para el concepto es el de la FAMILIA con
         * la primera letra en grande —«Puerta»—, no el del primer renglón
         * («Puerta 01»), que le dejaría al concepto el número de una de sus
         * piezas. Es editable: quien decide le pone el nombre bueno. */
        /* Se le quita el número al nombre TAL COMO SE ESCRIBIÓ, no a la
         * versión normalizada: ésa va sin acentos —sirve para comparar, no
         * para leerse— y proponer «Puerta de recamara» sería devolver el
         * nombre peor escrito de los dos. */
        const crudo = String(g[0].nombre ?? '');
        const propuesto = crudo.replace(/[\s\-#_.]*\b\d{1,3}\s*$/, '').trim() || crudo;
        return {
          nombre: propuesto,
          /* Y los nombres que trae adentro, para que se vea qué se está
           * juntando antes de juntarlo. */
          nombres: [...new Set(g.map((it) => String(it.nombre)))],
          tipo: g[0].tipo,
          estado: g[0].estado,
          moneda: g[0].moneda ?? 'MXN',
          precio_pieza: Math.round(Number(g[0].monto ?? 0) / cant(g[0])),
          renglones: g.length,
          piezas: g.reduce((s, it) => s + cant(it), 0),
          monto: g.reduce((s, it) => s + Number(it.monto ?? 0), 0),
          items: g.map((it) => ({
            id: it.id, clave: it.clave, nombre: it.nombre, cantidad: cant(it), monto: Number(it.monto ?? 0),
            etapa: Number(it.etapa ?? 0), fecha_entrega: it.fecha_entrega, ubicados: ubicadosDe(String(it.id)),
          })),
        } as unknown as Fila;
      })
      .sort((a, b) => Number(b.piezas) - Number(a.piezas));

    return { proyecto, grupos };
  }

  /** El nombre que se le propone a un producto nacido de una pieza: «Puerta
   *  07» → «Puerta». Se le quita el número al nombre TAL COMO SE ESCRIBIÓ,
   *  no a la versión normalizada: ésa va sin acentos —sirve para comparar,
   *  no para leerse— y proponer «Puerta de recamara» sería devolver el
   *  nombre peor escrito de los dos. Es editable. */
  private nombreDeFamilia(crudo: unknown): string {
    const s = String(crudo ?? '');
    return s.replace(/[\s\-#_.]*\b\d{1,3}\s*$/, '').trim() || s;
  }

  /** Crear el producto y meterle las piezas. ANTES esto FUSIONABA —los
   *  renglones que se iban se borraban— y por eso se llama igual: es la
   *  misma intención de quien la usa, «estas son el mismo producto».
   *
   *  Ya no borra nada. Mike, 20-sep: «debe poder moverse de grupo de
   *  producto un ítem ya agrupado». Un renglón borrado no se puede mover de
   *  grupo, así que agrupar tenía que dejar de destruir. Se lo pregunté con
   *  botones y escogió que el grupo de producto reemplace a la fusión.
   *
   *  Lo que cambia para quien lo usa: en dash sigue viendo UN renglón por
   *  producto —que era el problema original, no tener 21 puertas idénticas
   *  enlistadas— pero ahora ese renglón se abre y enseña sus piezas, y cada
   *  pieza conserva su código de obra, su ubicación en el plano y su
   *  bitácora. Antes eso se perdía.
   *
   *  DOS PASADAS: se revisa todo y sólo si todo cuadra se escribe. Una
   *  mitad agrupada con la otra mitad no, y el precio del proyecto contando
   *  dos precios distintos para el mismo modelo, es peor que no agrupar.
   *
   *  El PRECIO del producto: el que manden, y si no, el de la pieza más
   *  cara del grupo. No el promedio: un promedio inventa un número que
   *  nadie cotizó. La pantalla lo propone y quien decide lo cambia. */
  agruparItems(
    proyecto_id: string,
    args: { items: string[]; nombre?: string; codigo?: string; precio?: number; producto_id?: string },
    contexto: { usuario_id: string },
  ): { ok: true; producto: Fila; items: Fila[]; nuevo: boolean; venta_antes: number; venta_despues: number } | { error: string; detalle?: unknown } {
    const proyecto = this.obtener('proyectos', proyecto_id);
    if (!proyecto) return { error: 'no_encontrado', detalle: { que: 'proyecto', id: proyecto_id } };

    const ids = [...new Set((args.items ?? []).filter(Boolean).map(String))];
    if (ids.length < 2) {
      return { error: 'datos_invalidos', detalle: { motivo: 'un producto de grupo necesita al menos dos piezas; para una sola, el ítem ya es su propio producto único' } };
    }

    const piezas: Fila[] = [];
    for (const id of ids) {
      const it = this.sql.exec(`SELECT * FROM items WHERE id = ? AND proyecto_id = ?`, id, proyecto_id).toArray()[0] as Fila | undefined;
      if (!it) return { error: 'no_encontrado', detalle: { que: 'item', id, motivo: 'ese ítem no es de este proyecto' } };
      /* La moneda tiene que coincidir: un producto con un precio en pesos y
       * piezas en dólares no tiene precio, tiene dos. El ESTADO ya no
       * importa —eso era de la fusión, donde juntar un cotizado con un
       * vendido vendía el cotizado—: aquí cada pieza conserva el suyo. */
      if (String(it.moneda ?? 'MXN') !== String(piezas[0]?.moneda ?? it.moneda ?? 'MXN')) {
        return { error: 'moneda_distinta', detalle: { id, moneda: it.moneda, esperado: piezas[0]?.moneda } };
      }
      piezas.push(it);
    }

    /* Mike, 20-sep, con la pantalla de juntar enfrente: «donde dice nombre
     * del modelo debería poderse hacer uno nuevo, o seleccionar agregar a
     * alguno ya existente. Recuerda que al asignarlo a un producto
     * existente, adopta en automático el precio del producto al que se
     * agrupa».
     *
     * Ese caso sale por aquí y se va derecho a `meterEnProducto`, que es
     * quien hereda el precio. No se escribe producto nuevo, y el nombre y
     * el precio que vengan en el cuerpo SE IGNORAN: el modelo ya existe y
     * sus datos son los suyos. Cambiarle el precio a un producto desde la
     * pantalla de juntar movería el importe de piezas de OTRAS obras sin
     * que nadie lo pidiera. */
    if (args.producto_id) {
      const producto = this.obtener('productos', args.producto_id);
      if (!producto) return { error: 'no_encontrado', detalle: { que: 'producto', id: args.producto_id } };
      if (String(producto.moneda ?? 'MXN') !== String(piezas[0].moneda ?? 'MXN')) {
        return { error: 'moneda_distinta', detalle: { moneda: piezas[0].moneda, esperado: producto.moneda } };
      }
      const antes = Number((this.obtener('proyectos', proyecto_id) as Fila).precio_venta ?? 0);
      for (const it of piezas) this.meterEnProducto(it, producto);
      this.recalcularProyecto(proyecto_id);
      this.avisar({ t: 'item.cambio', id: String(piezas[0].id) }, 'todos');
      return {
        ok: true,
        producto: this.obtener('productos', String(producto.id))!,
        items: piezas.map((it) => this.obtener('items', String(it.id))!),
        nuevo: false,
        venta_antes: antes,
        venta_despues: Number((this.obtener('proyectos', proyecto_id) as Fila).precio_venta ?? 0),
      };
    }

    const cant = (it: Fila) => Math.max(1, Math.trunc(Number(it.cantidad ?? 1)));
    const porPieza = (it: Fila) => Math.round(Number(it.monto ?? 0) / cant(it));
    const precio = args.precio === undefined || args.precio === null
      ? Math.max(...piezas.map(porPieza))
      : Math.round(Number(args.precio));
    if (!Number.isFinite(precio) || precio < 0) return { error: 'datos_invalidos', detalle: { campo: 'precio' } };

    /* El código del producto se hereda sólo si TODAS las piezas traían el
     * mismo: ahí no hay duda de cuál es el del modelo. Si traen códigos
     * distintos —PT-01, PT-02…— ésos son códigos de PIEZA y el producto
     * nace sin código, para que quien arme el catálogo le ponga el suyo. */
    const claves = [...new Set(piezas.map((it) => String(it.clave ?? '').trim()))];
    const codigo = String(args.codigo ?? (claves.length === 1 ? claves[0] : '')).trim();
    if (codigo && this.sql.exec(`SELECT id FROM productos WHERE codigo = ?`, codigo).toArray().length) {
      return { error: 'codigo_en_uso', detalle: { codigo, motivo: 'ya hay otro producto con ese código de catálogo en esta empresa' } };
    }

    /* ── ya cuadró todo: ahora se escribe ── */

    const venta_antes = Number((this.obtener('proyectos', proyecto_id) as Fila).precio_venta ?? 0);
    const id = ulid();
    const nombre = String(args.nombre ?? '').trim() || this.nombreDeFamilia(piezas[0].nombre);
    const descripcion = piezas.map((it) => String(it.descripcion ?? '').trim()).find(Boolean) ?? null;
    this.sql.exec(
      `INSERT INTO productos (id, codigo, nombre, descripcion, tipo, precio, moneda, creado_at, creado_por)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      id, codigo, nombre, descripcion,
      String(piezas[0].tipo ?? 'mueble'), precio, String(piezas[0].moneda ?? 'MXN'), ahora(), contexto.usuario_id,
    );

    for (const it of piezas) this.meterEnProducto(it, this.obtener('productos', id)!);

    this.recalcularProyecto(proyecto_id);
    this.avisar({ t: 'item.cambio', id: String(piezas[0].id) }, 'todos');
    return {
      ok: true,
      producto: this.obtener('productos', id)!,
      items: piezas.map((it) => this.obtener('items', String(it.id))!),
      nuevo: true,
      venta_antes,
      venta_despues: Number((this.obtener('proyectos', proyecto_id) as Fila).precio_venta ?? 0),
    };
  }

  /** Meter una pieza en un producto. Lo que hereda, y por qué sólo eso:
   *
   *   · `monto` = precio del producto × su cantidad. Mike lo pidió con todas
   *     sus letras: «el ítem adquiere en automático ese costo». Mueve el
   *     precio de venta del proyecto, y por eso quien llama enseña el
   *     cambio ANTES de aplicarlo.
   *   · `clave` = el código del producto, y SÓLO si el producto tiene uno.
   *     `items.clave` es el código de producto —decisión de Mike del
   *     20-sep—, así que tiene que decir el del suyo. Si el producto todavía
   *     no tiene código, la pieza se queda con el que traía: borrárselo
   *     sería perder un dato a cambio de nada.
   *
   *  El NOMBRE no se hereda. «Puerta 07» es cómo se llama esa pieza en el
   *  plano y en la bitácora de obra; pisarlo con «Puerta modelo A» deja 21
   *  renglones idénticos que ya no se distinguen entre sí. El nombre del
   *  producto se lee del producto. */
  private meterEnProducto(item: Fila, producto: Fila): void {
    const cantidad = Math.max(1, Math.trunc(Number(item.cantidad ?? 1)));
    const codigo = String(producto.codigo ?? '').trim();
    this.sql.exec(
      `UPDATE items SET producto_id = ?, monto = ?, clave = ?, actualizado_at = ? WHERE id = ?`,
      producto.id, Number(producto.precio ?? 0) * cantidad,
      codigo || (item.clave ?? null), ahora(), item.id,
    );
  }

  /* ──────────── el producto de cada ítem: escogerlo y cambiarlo (§111) ────────────
   *
   * Mike, 20-sep: «todos los ítems, aparte del tipo de ítem, deberían tener
   * un dropdown para seleccionar qué producto es, o nuevo si el ítem es su
   * mismo producto único. A lo mejor un ítem pasó de ser modelo A a modelo B
   * y sólo se cambia de grupo. El dropdown debe tener 1) los ítems que son
   * únicos en el proyecto 2) los productos que ya tienen varios ítems
   * agrupados en el proyecto».
   *
   * Las dos listas son la misma cosa vista en dos momentos: un ítem único ES
   * un producto que todavía no se ha escrito, y escogerlo desde otro ítem es
   * lo que lo escribe. Por eso `asignarProducto` acepta las dos y devuelve
   * siempre un producto.
   */

  /** Las opciones del dropdown, para un proyecto. No toca nada. */
  productosDelProyecto(proyecto_id: string): { proyecto: Fila; productos: Fila[]; unicos: Fila[] } | { error: string; detalle?: unknown } {
    const proyecto = this.obtener('proyectos', proyecto_id);
    if (!proyecto) return { error: 'no_encontrado', detalle: { que: 'proyecto', id: proyecto_id } };

    /* Los productos QUE SE USAN EN ESTE PROYECTO, no todo el catálogo de la
     * empresa: el dropdown es para decir «esta puerta es de las de esta
     * obra», y una lista con los cuatrocientos productos históricos no se
     * puede leer. El catálogo completo es de quote101, cuando exista. */
    const productos = this.sql.exec(
      `SELECT pr.*, COUNT(it.id) AS items, COALESCE(SUM(MAX(it.cantidad,1)),0) AS piezas
         FROM productos pr JOIN items it ON it.producto_id = pr.id
        WHERE it.proyecto_id = ?
        GROUP BY pr.id
        ORDER BY items DESC, pr.nombre`,
      proyecto_id,
    ).toArray() as Fila[];

    /* Y los ítems que todavía no son de ningún producto: cada uno es su
     * propio producto único, y escoger uno de ellos es decir «somos el
     * mismo modelo», que es lo que crea el producto. Los cancelados no
     * salen: no se agrupa con algo que ya se cayó. */
    const unicos = (this.sql.exec(
      `SELECT id, clave, nombre, descripcion, tipo, monto, cantidad, moneda, estado
         FROM items
        WHERE proyecto_id = ? AND producto_id IS NULL AND estado <> 'cancelado'
        ORDER BY partida, orden, creado_at`,
      proyecto_id,
    ).toArray() as Fila[]).map((it) => ({
      ...it,
      precio_pieza: Math.round(Number(it.monto ?? 0) / Math.max(1, Math.trunc(Number(it.cantidad ?? 1)))),
    })) as Fila[];

    return { proyecto, productos, unicos };
  }

  /** Cambiar de grupo. Tres formas de decirlo, y todas acaban igual:
   *
   *   · `{ producto_id }`  — entra a un producto que ya existe;
   *   · `{ desde_item }`   — «es el mismo modelo que aquél»: se escribe el
   *                          producto a partir de ese otro ítem y entran los
   *                          dos. Es el caso 1) del dropdown de Mike;
   *   · `{ solo: true }`   — se sale: vuelve a ser su propio producto único.
   *
   *  Devuelve el precio de venta del proyecto antes y después, porque
   *  heredar el costo lo mueve y quien lo movió tiene que verlo. */
  asignarProducto(
    item_id: string,
    args: { producto_id?: string; desde_item?: string; solo?: boolean },
    contexto: { usuario_id: string },
  ): { ok: true; item: Fila; producto: Fila | null; venta_antes: number; venta_despues: number } | { error: string; detalle?: unknown } {
    const item = this.obtener('items', item_id);
    if (!item) return { error: 'no_encontrado', detalle: { que: 'item', id: item_id } };
    const proyecto_id = item.proyecto_id ? String(item.proyecto_id) : '';
    const venta_antes = proyecto_id ? Number((this.obtener('proyectos', proyecto_id) as Fila | null)?.precio_venta ?? 0) : 0;

    const cierra = (producto: Fila | null) => {
      if (proyecto_id) this.recalcularProyecto(proyecto_id);
      this.avisar({ t: 'item.cambio', id: item_id }, 'todos');
      return {
        ok: true as const,
        item: this.obtener('items', item_id)!,
        producto,
        venta_antes,
        venta_despues: proyecto_id ? Number((this.obtener('proyectos', proyecto_id) as Fila | null)?.precio_venta ?? 0) : 0,
      };
    };

    /* Salirse. El precio NO se le quita: la pieza se queda con el que tiene,
     * que es el que se cotizó y el que ya está sumado. Salirse de un grupo
     * es dejar de seguir a un modelo, no volverse gratis. */
    if (args.solo) {
      this.sql.exec(`UPDATE items SET producto_id = NULL, actualizado_at = ? WHERE id = ?`, ahora(), item_id);
      return cierra(null);
    }

    if (args.producto_id) {
      const producto = this.obtener('productos', args.producto_id);
      if (!producto) return { error: 'no_encontrado', detalle: { que: 'producto', id: args.producto_id } };
      if (String(producto.moneda ?? 'MXN') !== String(item.moneda ?? 'MXN')) {
        return { error: 'moneda_distinta', detalle: { moneda: item.moneda, esperado: producto.moneda } };
      }
      this.meterEnProducto(item, producto);
      return cierra(this.obtener('productos', String(producto.id)));
    }

    if (args.desde_item) {
      if (String(args.desde_item) === item_id) {
        return { error: 'datos_invalidos', detalle: { motivo: 'un ítem no se agrupa consigo mismo; para eso ya es su propio producto único' } };
      }
      const otro = this.obtener('items', String(args.desde_item));
      if (!otro) return { error: 'no_encontrado', detalle: { que: 'item', id: args.desde_item } };
      if (String(otro.moneda ?? 'MXN') !== String(item.moneda ?? 'MXN')) {
        return { error: 'moneda_distinta', detalle: { moneda: item.moneda, esperado: otro.moneda } };
      }
      /* Si aquél YA es de un producto, esto es entrar a ese producto, no
       * escribir uno nuevo. Pasa cuando el dropdown se pidió hace rato y
       * mientras tanto alguien agrupó: sin esto se escribiría un producto
       * duplicado con el mismo modelo adentro. */
      if (otro.producto_id) {
        const producto = this.obtener('productos', String(otro.producto_id))!;
        this.meterEnProducto(item, producto);
        return cierra(producto);
      }
      const cantOtro = Math.max(1, Math.trunc(Number(otro.cantidad ?? 1)));
      const clave = String(otro.clave ?? '').trim();
      /* El código de aquél sólo pasa a ser el del producto si no lo tiene ya
       * otro producto de la empresa. Si choca, el producto nace sin código:
       * vale más un producto sin catalogar que un 409 en la cara de alguien
       * que sólo quería decir «éstas dos son iguales». */
      const chocado = clave
        ? this.sql.exec(`SELECT id FROM productos WHERE codigo = ?`, clave).toArray().length > 0
        : false;
      const id = ulid();
      this.sql.exec(
        `INSERT INTO productos (id, codigo, nombre, descripcion, tipo, precio, moneda, creado_at, creado_por)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        id, chocado ? '' : clave,
        this.nombreDeFamilia(otro.nombre), (otro.descripcion as string | null) ?? null,
        String(otro.tipo ?? 'mueble'), Math.round(Number(otro.monto ?? 0) / cantOtro),
        String(otro.moneda ?? 'MXN'), ahora(), contexto.usuario_id,
      );
      const producto = this.obtener('productos', id)!;
      this.meterEnProducto(otro, producto);
      this.meterEnProducto(item, producto);
      return cierra(producto);
    }

    return { error: 'datos_invalidos', detalle: { motivo: 'hay que decir a qué producto: `producto_id`, `desde_item` o `solo`' } };
  }

  /* ─────────────── separar: deshacer el grupo, y rescatar lo fusionado ───────────────
   *
   * Mike, 20-sep, con HOLCIM enfrente: «ya se hizo un desastre con todos los
   * cambios y ahora no puedo separar los ítems para agruparlos en otro
   * producto. O mejor sepárame todos los ítems de puertas otra vez».
   *
   * Son DOS problemas con el mismo remedio, y hay que atender los dos porque
   * desde afuera se ven igual:
   *
   *   1. El ítem está en un producto y sacarlo de uno en uno son 29 clics.
   *   2. El renglón viene de la FUSIÓN del contrato 0.30.0, que borraba los
   *      renglones que absorbía. Ahí no hay 29 ítems que sacar: hay uno solo
   *      con `cantidad = 29`, y la lista de productos no puede partirlo.
   *
   *  Lo segundo lo causé yo, y se puede deshacer sólo porque aquella versión
   *  —con todo lo mal planteada que estaba— dejó escrito en `refs.agrupados`
   *  qué se había tragado: el id, el código, el nombre, la cantidad y el
   *  importe de cada renglón. «El renglón se borra; lo que decía, no.» Esa
   *  línea es la que hoy permite devolverlos.
   *
   *  LO QUE SÍ VUELVE
   *
   *   · los renglones, con su id original —el ULID quedó libre al borrarse—,
   *     su código de obra, su nombre, su cantidad y su importe;
   *   · las piezas del plano, repartidas por CÓDIGO: el elemento cuyo `code`
   *     es PT-07 se va con el renglón cuya `clave` es PT-07. Es el único
   *     amarre que quedó, y es bueno, porque el código de la pieza es único
   *     dentro de la obra.
   *
   *  LO QUE NO VUELVE, Y HAY QUE DECIRLO
   *
   *   · a qué renglón pertenecía cada MOVIMIENTO, cada PARTIDA y cada AVANCE.
   *     La fusión los mudó al que se quedaba y no anotó de cuál venían. Se
   *     quedan donde están, en el renglón que sobrevivió. Nada se pierde;
   *     queda mal repartido, y eso se acomoda a mano si importa;
   *   · la ETAPA de cada uno. La fusión se quedó con la del MÁS ATRASADO, así
   *     que todos vuelven con ésa: decir que uno iba más adelantado sería
   *     inventarlo, y por ese lado el error es a favor del que mide.
   *
   *  EL DINERO NO SE MUEVE. Lo que se le resta al renglón que sobrevivió es
   *  exactamente lo que se les pone a los reconstruidos, y la suma sale
   *  igual. Si no cuadrara, no se escribe nada: más vale no separar que
   *  separar cambiando el precio de venta de una obra. */

  /** Separar UN ítem: sacarlo de su producto y, si es un renglón fusionado,
   *  devolver los renglones que se tragó. */
  separarItem(
    item_id: string,
    contexto: { usuario_id: string },
  ): {
    ok: true; item: Fila; salio_de: string | null; reconstruidos: Fila[];
    piezas_repartidas: number; venta_antes: number; venta_despues: number;
  } | { error: string; detalle?: unknown } {
    /* La fila CRUDA, no `obtener()`. Esa pasa por `afuera()`, que convierte
     * las columnas json —`refs`, `origen`, `asignados`— en objetos, y aquí
     * hacen falta como vinieron: `refs` para leer la anotación, y las otras
     * dos para volver a escribirlas tal cual en los renglones que nacen. Un
     * objeto no se puede pasar como valor a SQLite. */
    const item = this.sql.exec(`SELECT * FROM items WHERE id = ?`, item_id).toArray()[0] as Fila | undefined;
    if (!item) return { error: 'no_encontrado', detalle: { que: 'item', id: item_id } };
    const proyecto_id = item.proyecto_id ? String(item.proyecto_id) : '';
    const venta = () => (proyecto_id ? Number((this.obtener('proyectos', proyecto_id) as Fila | null)?.precio_venta ?? 0) : 0);
    const venta_antes = venta();

    /* Lo que la fusión dejó anotado. Si no trae nada, esto es sólo sacarlo
     * del producto, que es el caso normal. */
    let refs: Record<string, unknown> = {};
    try { const v = JSON.parse(String(item.refs ?? '{}')); if (v && typeof v === 'object' && !Array.isArray(v)) refs = v as Record<string, unknown>; } catch { refs = {}; }
    type Absorbido = { id?: string; clave?: string | null; nombre?: string; cantidad?: number; monto?: number };
    const anotados: Absorbido[] = Array.isArray(refs.agrupados) ? (refs.agrupados as Absorbido[]) : [];

    /* Sólo los que de verdad no existen. Separar dos veces no debe duplicar
     * renglones: la segunda vez no hay nada que devolver. */
    const porDevolver = anotados.filter((a) => {
      const id = String(a?.id ?? '').trim();
      return id && !this.obtener('items', id);
    });

    /* ── se revisa que cuadre ANTES de escribir ── */
    const cant = (n: unknown) => Math.max(1, Math.trunc(Number(n ?? 1)));
    const sumaCant = porDevolver.reduce((s, a) => s + cant(a.cantidad), 0);
    const sumaMonto = porDevolver.reduce((s, a) => s + Math.round(Number(a.monto ?? 0)), 0);
    const quedaCant = cant(item.cantidad) - sumaCant;
    const quedaMonto = Math.round(Number(item.monto ?? 0)) - sumaMonto;
    if (porDevolver.length && (quedaCant < 1 || quedaMonto < 0)) {
      return {
        error: 'no_cuadra',
        detalle: {
          motivo: 'devolver los renglones anotados dejaría al que sobrevivió en menos de una pieza o en importe negativo; alguien le cambió la cantidad o el precio después de juntarlos',
          cantidad_hoy: cant(item.cantidad), cantidad_anotada: sumaCant,
          monto_hoy: Number(item.monto ?? 0), monto_anotado: sumaMonto,
        },
      };
    }

    /* ── ya cuadró: ahora se escribe ── */

    const salio_de = item.producto_id ? String(item.producto_id) : null;
    const reconstruidos: Fila[] = [];
    let piezas_repartidas = 0;

    for (const a of porDevolver) {
      const id = String(a.id);
      const clave = String(a.clave ?? '').trim() || null;
      this.sql.exec(
        `INSERT INTO items (id, proyecto_id, cliente_id, clave, nombre, descripcion, tipo,
                            monto, cantidad, moneda, estado, etapa, etapa_at, etapa_por, fecha_entrega,
                            asignados, origen, refs, partida, orden, aprobado_at, cancelado_at,
                            cancelado_motivo, producto_id, creado_at, creado_por, actualizado_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?)`,
        id, item.proyecto_id, item.cliente_id, clave,
        String(a.nombre ?? item.nombre), item.descripcion ?? null, item.tipo,
        Math.round(Number(a.monto ?? 0)), cant(a.cantidad), item.moneda, item.estado,
        // La etapa del más atrasado, que es con la que se quedó la fusión.
        item.etapa, item.etapa_at ?? null, item.etapa_por ?? null, item.fecha_entrega ?? null,
        item.asignados, item.origen, '{}', item.partida, item.orden,
        item.aprobado_at ?? null, item.cancelado_at ?? null, item.cancelado_motivo ?? null,
        // creado_at: el de hoy sería mentira sobre cuándo se capturó.
        item.creado_at, contexto.usuario_id, ahora(),
      );
      reconstruidos.push(this.obtener('items', id)!);

      /* Su pieza del plano se va con él, buscándola por código. */
      if (clave) {
        const r = this.sql.exec(
          `UPDATE quell_elements SET item_id = ? WHERE item_id = ? AND code = ?`, id, item_id, clave,
        );
        piezas_repartidas += Number(r.rowsWritten ?? 0);
      }
    }

    delete refs.agrupados;
    this.sql.exec(
      `UPDATE items SET producto_id = NULL, cantidad = ?, monto = ?, refs = ?, actualizado_at = ? WHERE id = ?`,
      porDevolver.length ? quedaCant : cant(item.cantidad),
      porDevolver.length ? quedaMonto : Math.round(Number(item.monto ?? 0)),
      JSON.stringify(refs), ahora(), item_id,
    );

    if (proyecto_id) this.recalcularProyecto(proyecto_id);
    this.avisar({ t: 'item.cambio', id: item_id }, 'todos');
    return {
      ok: true, item: this.obtener('items', item_id)!, salio_de, reconstruidos,
      piezas_repartidas, venta_antes, venta_despues: venta(),
    };
  }

  /** Separar TODO un producto: sus piezas salen del grupo y cada renglón
   *  fusionado devuelve los suyos. Un solo envío, porque «sepárame todos los
   *  ítems de puertas» son 29 clics de otra manera. */
  separarProducto(
    proyecto_id: string,
    producto_id: string,
    contexto: { usuario_id: string },
  ): { ok: true; separados: number; reconstruidos: number; piezas_repartidas: number; venta_antes: number; venta_despues: number }
    | { error: string; detalle?: unknown } {
    const proyecto = this.obtener('proyectos', proyecto_id);
    if (!proyecto) return { error: 'no_encontrado', detalle: { que: 'proyecto', id: proyecto_id } };
    const producto = this.obtener('productos', producto_id);
    if (!producto) return { error: 'no_encontrado', detalle: { que: 'producto', id: producto_id } };

    const suyos = this.sql
      .exec(`SELECT id FROM items WHERE proyecto_id = ? AND producto_id = ?`, proyecto_id, producto_id)
      .toArray() as Fila[];
    if (!suyos.length) return { error: 'no_encontrado', detalle: { que: 'items', motivo: 'ese producto no tiene piezas en esta obra' } };

    const venta_antes = Number((this.obtener('proyectos', proyecto_id) as Fila).precio_venta ?? 0);
    let reconstruidos = 0;
    let piezas_repartidas = 0;
    for (const it of suyos) {
      const r = this.separarItem(String(it.id), contexto);
      /* Un `no_cuadra` en uno no debe frenar a los otros veintiocho: ése se
       * queda como está y se dice cuántos salieron. Lo que no se hace es
       * escribirlo a medias, y eso ya lo cuida `separarItem`. */
      if ('ok' in r) { reconstruidos += r.reconstruidos.length; piezas_repartidas += r.piezas_repartidas; }
    }
    return {
      ok: true, separados: suyos.length, reconstruidos, piezas_repartidas, venta_antes,
      venta_despues: Number((this.obtener('proyectos', proyecto_id) as Fila).precio_venta ?? 0),
    };
  }



  /* ─────────────── agregar al alcance y sacar del alcance (§106 → 0.64.0) ───────────────
   *
   * Mike, 20-sep: «se debe poder cancelar algún ítem ya sea desde quell o
   * desde dash, y se refleja en los 2». Se refleja solo: el ítem es UNO en la
   * base de la empresa, y la pieza del plano cuelga de él.
   *
   * Mike, 2-oct: ya no hay «cancelado»: un ítem está en alcance o fuera de
   * alcance, y lo que estuvo dentro y se sacó REGRESA a fuera, a la misma
   * lista que el requerimiento que nadie ha aprobado. Lo que distingue a uno
   * de otro ya no es un estado: es la bitácora (`alcance_movimientos`), y
   * `cancelado_at` sólo dice que a éste lo sacaron —para que el plano y el
   * borrador de quote101 dejen de enseñarlo como pendiente—.
   */

  /** Agregar al alcance: pasa a 'vendido' y desde ese momento suma en el
   *  proyecto. `aprobado_at` se pone la primera vez y no se reescribe. */
  aprobarItem(id: string, contexto: Partial<ContextoEscritura>): { ok: true; item: Fila; era: string } | { error: string; detalle?: unknown } {
    const item = this.obtener('items', id);
    if (!item) return { error: 'no_encontrado', detalle: { que: 'item', id } };
    const era = String(item.estado ?? 'cotizado');
    if (era === 'vendido') return { ok: true, item, era };

    this.sql.exec(
      `UPDATE items SET estado = 'vendido', aprobado_at = COALESCE(aprobado_at, ?), cancelado_at = NULL,
              cancelado_motivo = NULL, actualizado_at = ? WHERE id = ?`,
      ahora(), ahora(), id,
    );
    this.anotarAlcance(id, (item.proyecto_id as string | null) ?? null, 'entra', contexto, null);
    // Aprobado desde dash o quell: ya no está pendiente del cliente (0.49.0).
    this.quitarDelBorrador(id);
    if (item.proyecto_id) this.recalcularProyecto(String(item.proyecto_id));
    this.avisar({ t: 'item.cambio', id }, 'todos');
    return { ok: true, item: this.obtener('items', id)!, era };
  }

  /** Sacar del alcance. `motivo` es opcional pero se guarda: tres meses
   *  después, «por qué se cayó esto» no tiene otra respuesta.
   *
   *  Un requerimiento que nadie había aprobado también se puede sacar: deja
   *  de salir en el plano y en el borrador de quote101, y queda en la
   *  bitácora como salida. Lo que ya estaba sacado sólo cambia de motivo. */
  cancelarItem(
    id: string,
    args: { motivo?: string },
    contexto: Partial<ContextoEscritura>,
  ): { ok: true; item: Fila; alcance: 'fuera' } | { error: string; detalle?: unknown } {
    const item = this.obtener('items', id);
    if (!item) return { error: 'no_encontrado', detalle: { que: 'item', id } };
    const motivo = String(args.motivo ?? '').trim() || null;
    const eraVendido = String(item.estado ?? 'cotizado') === 'vendido';
    const yaSacado = !eraVendido && !!item.cancelado_at;

    if (!yaSacado) {
      this.sql.exec(
        `UPDATE items SET estado = 'cotizado', cancelado_at = ?, cancelado_motivo = ?, actualizado_at = ? WHERE id = ?`,
        ahora(), motivo, ahora(), id,
      );
      this.anotarAlcance(id, (item.proyecto_id as string | null) ?? null, 'sale', contexto, motivo);
    } else if (motivo) {
      this.sql.exec(`UPDATE items SET cancelado_motivo = ?, actualizado_at = ? WHERE id = ?`, motivo, ahora(), id);
    }
    // Un requerimiento que se saca deja el borrador que iba al cliente (0.49.0).
    this.quitarDelBorrador(id);
    if (eraVendido && item.proyecto_id) this.recalcularProyecto(String(item.proyecto_id));
    this.avisar({ t: 'item.cambio', id }, 'todos');
    return { ok: true, item: this.obtener('items', id)!, alcance: 'fuera' };
  }

  /* ─────────────── borrar lo cancelado de un proyecto (§117) ───────────────
   *
   * Mike, 21-sep: «ya todo lo cancelado lo puedes eliminar por completo».
   *
   * Un ítem cancelado no suma en el precio de venta —`recalcularProyecto`
   * sólo cuenta los vendidos—, así que borrarlo NO mueve el dinero del
   * proyecto. Eso está medido, y las dos rutas devuelven la venta antes y
   * después para que se vea.
   *
   * Lo que sí puede colgar de un ítem es historia que no es suya:
   *
   * | Qué cuelga           | Qué pasaría si se borrara el ítem            |
   * |----------------------|----------------------------------------------|
   * | `movimientos`        | un cobro o un gasto SIN dueño: dinero movido |
   * | `avances`            | lo que se trabajó en la obra, perdido        |
   * | `partidas`           | el compromiso con el proveedor, huérfano     |
   * | `archivos`           | el papel queda en R2 sin quién lo reclame    |
   * | `quell_elements`     | la pieza SOBREVIVE y se queda sin ítem       |
   *
   * Las cuatro primeras son llaves foráneas: SQLite no deja borrar y el
   * `DELETE` truena. No se fuerzan. Un ítem que trae dinero o historia se
   * QUEDA, y se dice cuál y por qué; borrarlo sería decidir por Mike que ese
   * cobro ya no tiene dueño.
   *
   * La quinta es distinta a propósito (`ON DELETE SET NULL`, migración
   * 0011): la pieza del plano es de quell101 y no se toca desde aquí. Se
   * queda sin ítem y se cuenta, para que nadie se entere después.
   *
   * Y por eso el modo SECO existe: enseña el censo exacto —cuántos se van,
   * cuántos se quedan y qué los detiene— antes de escribir. Borrar 96
   * renglones es de las pocas cosas de esta base que no se pueden deshacer.
   */

  /** El censo, ítem por ítem. Una sola pasada por tabla y no cinco consultas
   *  por renglón: con 96 cancelados eso son 480 consultas dentro del Durable
   *  Object, y este censo lo pide una pantalla mientras alguien espera. */
  private censarCancelados(proyecto_id: string, soloIds?: string[]): Array<{
    id: string; clave: string | null; nombre: string; monto: number;
    alcance: 'cancelado' | 'descartado';
    cobros: number; avances: number; compromisos: number; archivos: number; piezas: number;
  }> {
    const items = (this.sql
      /* 0.64.0: ya no hay `estado = 'cancelado'`. Se censa lo que se SACÓ del
       * alcance —`cancelado_at` con fecha— y está fuera; un requerimiento que
       * nadie ha decidido no entra aquí: no es basura, es una pregunta. */
      .exec(`SELECT id, clave, nombre, monto, aprobado_at FROM items WHERE proyecto_id = ? AND estado <> 'vendido' AND cancelado_at IS NOT NULL ORDER BY creado_at`, proyecto_id)
      .toArray() as Fila[])
      .filter((i) => !soloIds || soloIds.includes(String(i.id)));
    if (!items.length) return [];

    const ids = new Set(items.map((i) => String(i.id)));
    const cuenta = (sql: string, ...args: unknown[]) => {
      const m = new Map<string, number>();
      for (const f of this.sql.exec(sql, ...args).toArray() as Fila[]) {
        const k = String(f.item_id ?? f.de_id ?? '');
        if (ids.has(k)) m.set(k, Number(f.n ?? 0));
      }
      return m;
    };
    const cobros = cuenta(`SELECT item_id, COUNT(*) AS n FROM movimientos WHERE item_id IS NOT NULL GROUP BY item_id`);
    const avances = cuenta(`SELECT item_id, COUNT(*) AS n FROM avances GROUP BY item_id`);
    const compromisos = cuenta(`SELECT item_id, COUNT(*) AS n FROM partidas WHERE item_id IS NOT NULL GROUP BY item_id`);
    const archivos = cuenta(`SELECT de_id, COUNT(*) AS n FROM archivos WHERE de_tabla = 'items' GROUP BY de_id`);
    const piezas = cuenta(`SELECT item_id, COUNT(*) AS n FROM quell_elements WHERE item_id IS NOT NULL GROUP BY item_id`);

    return items.map((i) => {
      const id = String(i.id);
      return {
        id, clave: (i.clave as string | null) ?? null, nombre: String(i.nombre ?? ''),
        monto: Number(i.monto ?? 0),
        alcance: (i.aprobado_at ? 'cancelado' : 'descartado') as 'cancelado' | 'descartado',
        cobros: cobros.get(id) ?? 0, avances: avances.get(id) ?? 0,
        compromisos: compromisos.get(id) ?? 0, archivos: archivos.get(id) ?? 0,
        piezas: piezas.get(id) ?? 0,
      };
    });
  }

  /** Qué detiene a un ítem, en palabras. Vacío quiere decir que se puede
   *  borrar. Vive en un solo lugar para que el modo seco y el borrado no
   *  puedan opinar distinto: una vista previa que promete algo que el
   *  borrado no cumple es peor que no tener vista previa. */
  private loQueDetiene(c: { cobros: number; avances: number; compromisos: number; archivos: number }): string[] {
    const r: string[] = [];
    if (c.cobros) r.push(`${c.cobros} movimiento${c.cobros === 1 ? '' : 's'} de dinero`);
    if (c.avances) r.push(`${c.avances} avance${c.avances === 1 ? '' : 's'} de obra`);
    if (c.compromisos) r.push(`${c.compromisos} compromiso${c.compromisos === 1 ? '' : 's'} con proveedor`);
    if (c.archivos) r.push(`${c.archivos} archivo${c.archivos === 1 ? '' : 's'}`);
    return r;
  }

  /** `modo: 'seco'` no escribe nada y contesta el mismo censo que el
   *  borrado; `modo: 'borrar'` borra los que no traen nada, todos o
   *  ninguno. */
  borrarCancelados(
    proyecto_id: string,
    args: { modo: 'seco' | 'borrar'; ids?: string[]; soltar?: boolean },
    contexto: { usuario_id: string },
  ): {
    ok: true; modo: 'seco' | 'borrar'; total: number;
    borrados: number; cancelados: number; descartados: number;
    se_sueltan: { movimientos: number; compromisos: number; archivos: number };
    se_van: Array<{ id: string; clave: string | null; nombre: string; monto: number; piezas: number }>;
    se_quedan: Array<{ id: string; clave: string | null; nombre: string; monto: number; porque: string[] }>;
    piezas_sin_item: number; venta_antes: number; venta_despues: number;
  } | { error: string; detalle?: unknown } {
    const proyecto = this.obtener('proyectos', proyecto_id);
    if (!proyecto) return { error: 'no_encontrado', detalle: { que: 'proyecto', id: proyecto_id } };

    const censoCompleto = this.censarCancelados(proyecto_id, args.ids);
    /* SOLTAR (0.80.0, Mike 7-oct: «Elimínalo, yo no encuentro dónde»). Sólo
     * con `ids`: es el «Borrar» de UN renglón, con su nombre enfrente, nunca
     * el barrido de todo el proyecto. Lo que cuelga del ítem y vale por sí
     * mismo no se pierde: el movimiento de dinero y el compromiso con el
     * proveedor se quedan en el PROYECTO sin ítem, y el archivo pasa al
     * proyecto. Lo único que sigue deteniendo es el avance de obra, que sin
     * su ítem no quiere decir nada. */
    const soltar = !!args.soltar && !!args.ids?.length;
    const se_sueltan = { movimientos: 0, compromisos: 0, archivos: 0 };
    const censo = soltar
      ? censoCompleto.map((c) => {
          if (c.avances) return c;
          se_sueltan.movimientos += c.cobros; se_sueltan.compromisos += c.compromisos; se_sueltan.archivos += c.archivos;
          return { ...c, cobros: 0, compromisos: 0, archivos: 0 };
        })
      : censoCompleto;
    const se_van = censo.filter((c) => this.loQueDetiene(c).length === 0);
    const se_quedan = censo
      .filter((c) => this.loQueDetiene(c).length > 0)
      .map((c) => ({ id: c.id, clave: c.clave, nombre: c.nombre, monto: c.monto, porque: this.loQueDetiene(c) }));

    const venta_antes = Number(proyecto.precio_venta ?? 0);
    let borrados = 0;
    if (args.modo === 'borrar' && se_van.length) {
      /* Entero o nada. El censo ya garantiza que ninguno tiene llaves
       * apuntándole, así que un `FOREIGN KEY` aquí significaría que algo
       * cambió entre el censo y el borrado —alguien capturando un cobro al
       * mismo tiempo—, y entonces no se borra ni uno. */
      this.ctx.storage.transactionSync(() => {
        for (const c of se_van) {
          if (soltar) {
            this.sql.exec(`UPDATE movimientos SET item_id = NULL, proyecto_id = COALESCE(proyecto_id, ?) WHERE item_id = ?`, proyecto_id, c.id);
            this.sql.exec(`UPDATE partidas SET item_id = NULL, proyecto_id = COALESCE(proyecto_id, ?) WHERE item_id = ?`, proyecto_id, c.id);
            this.sql.exec(`UPDATE archivos SET de_tabla = 'proyectos', de_id = ? WHERE de_tabla = 'items' AND de_id = ?`, proyecto_id, c.id);
          }
          this.sql.exec(`DELETE FROM items WHERE id = ?`, c.id);
          borrados++;
        }
      });
      void contexto;
      this.recalcularProyecto(proyecto_id);
      this.avisar({ t: 'item.cambio', id: proyecto_id }, 'todos');
    }

    return {
      ok: true, modo: args.modo, total: censo.length,
      borrados,
      se_sueltan,
      cancelados: censo.filter((c) => c.alcance === 'cancelado').length,
      descartados: censo.filter((c) => c.alcance === 'descartado').length,
      se_van: se_van.map((c) => ({ id: c.id, clave: c.clave, nombre: c.nombre, monto: c.monto, piezas: c.piezas })),
      se_quedan,
      /* Las piezas que se quedan en el plano sin ítem. En seco es lo que
       * PASARÍA; después de borrar es lo que pasó. */
      piezas_sin_item: se_van.reduce((s, c) => s + c.piezas, 0),
      venta_antes,
      venta_despues: Number((this.obtener('proyectos', proyecto_id) as Fila).precio_venta ?? 0),
    };
  }

  /* ─────────────── la partida y el orden de los ítems (§102) ───────────────
   *
   * Mike, 20-sep: «quiero también poder ordenar los ítems y agrupar por
   * partidas. Incluso podría ser por pestañas (como folders) para cambiar
   * entre partidas».
   *
   * Un solo envío con la lista acomodada, no una llamada por renglón. Con 21
   * puertas, acomodar de una en una son 21 idas y vueltas donde la número 12
   * puede fallar y dejar la lista a medio acomodar, con dos ítems en el
   * lugar 5 y ninguno en el 12.
   *
   * `partida` es texto libre y renombrarla es mandar sus ítems con el nombre
   * nuevo: no hay catálogo que dar de alta antes de poder teclear «Cocina».
   */

  /** Acomodar. Lo que no venga en la lista no se mueve. Dos pasadas: se
   *  revisa que todos sean del proyecto y sólo entonces se escribe. */
  acomodarItems(
    proyecto_id: string,
    items: Array<{ id: string; partida?: string; orden?: number }>,
  ): { ok: true; acomodados: number } | { error: string; detalle?: unknown } {
    const proyecto = this.obtener('proyectos', proyecto_id);
    if (!proyecto) return { error: 'no_encontrado', detalle: { que: 'proyecto', id: proyecto_id } };
    if (!Array.isArray(items) || !items.length) return { error: 'datos_invalidos', detalle: { motivo: 'no viene ningún ítem que acomodar' } };

    for (const it of items) {
      const fila = this.sql.exec(`SELECT id FROM items WHERE id = ? AND proyecto_id = ?`, it.id, proyecto_id).toArray()[0];
      if (!fila) return { error: 'no_encontrado', detalle: { que: 'item', id: it.id, motivo: 'ese ítem no es de este proyecto' } };
    }

    for (const it of items) {
      const campos: string[] = [];
      const valores: SqlStorageValue[] = [];
      if (it.partida !== undefined) { campos.push('partida = ?'); valores.push(String(it.partida).trim().slice(0, 80)); }
      if (it.orden !== undefined) { campos.push('orden = ?'); valores.push(Math.trunc(Number(it.orden) || 0)); }
      if (!campos.length) continue;
      campos.push('actualizado_at = ?'); valores.push(ahora());
      this.sql.exec(`UPDATE items SET ${campos.join(', ')} WHERE id = ?`, ...valores, it.id);
    }
    return { ok: true, acomodados: items.length };
  }

  /* ─────────────── la raya: lo que se le paga a la gente (§96) ───────────────
   *
   * Mike escogió el alcance con todas sus letras: pagos de raya y recibos.
   * No hay cálculo de IMSS ni de ISR ni CFDI de nómina, y eso es una
   * decisión, no una omisión: una retención mal calculada se descubre en una
   * auditoría, meses después y con multa. Aquí se apunta lo que de verdad se
   * pagó, sale de una cuenta de verdad, y queda un recibo.
   */

  /** Los cortes de la empresa, con cuánta gente trae cada uno. */
  rayas(): Fila[] {
    return this.sql
      .exec(
        `SELECT r.*, (SELECT COUNT(*) FROM raya_pagos p WHERE p.raya_id = r.id) AS personas,
                c.nombre AS cuenta_nombre
         FROM rayas r LEFT JOIN cuentas c ON c.id = r.cuenta_id
         ORDER BY r.periodo_fin DESC, r.creado_at DESC`,
      )
      .toArray() as Fila[];
  }

  /** Un corte con sus renglones. */
  raya(id: string): { raya: Fila; pagos: Fila[] } | null {
    const raya = this.sql.exec(`SELECT * FROM rayas WHERE id = ?`, id).toArray()[0] as Fila | undefined;
    if (!raya) return null;
    const pagos = this.sql
      .exec(`SELECT * FROM raya_pagos WHERE raya_id = ? ORDER BY nombre`, id)
      .toArray() as Fila[];
    return { raya, pagos };
  }

  /** Lo que suma un renglón, y lo que suma el corte. LO CALCULA EL SERVIDOR.
   *
   *  Es la misma regla que `precio_venta` y por el mismo motivo: si el total
   *  viniera de la pantalla, dos personas capturando a la vez mandarían dos
   *  totales distintos y los dos se creerían. */
  private netoDe(p: { sueldo?: unknown; extras?: unknown; descuentos?: unknown }): number {
    const n = (v: unknown) => Math.round(Number(v ?? 0)) || 0;
    return n(p.sueldo) + n(p.extras) - n(p.descuentos);
  }

  private recalcularRaya(raya_id: string): void {
    const total = Number(
      (this.sql.exec(`SELECT COALESCE(SUM(neto),0) AS t FROM raya_pagos WHERE raya_id = ?`, raya_id).toArray()[0] as Fila).t,
    );
    this.sql.exec(`UPDATE rayas SET total = ?, actualizado_at = ? WHERE id = ?`, total, ahora(), raya_id);
  }

  /** Abrir un corte con su gente. Nace en BORRADOR: nada sale de la cuenta
   *  hasta que alguien diga «pagar». */
  crearRaya(
    datos: { periodo_inicio: string; periodo_fin: string; nota?: string;
             pagos?: Array<{ personal_id: string; concepto?: string; sueldo?: number; extras?: number; descuentos?: number; nota?: string }> },
    contexto: { usuario_id: string },
  ): { ok: true; raya: Fila; pagos: Fila[] } | { error: string; detalle?: unknown } {
    if (!datos.periodo_inicio || !datos.periodo_fin) return { error: 'datos_invalidos', detalle: { falta: 'periodo' } };
    if (datos.periodo_fin < datos.periodo_inicio) {
      return { error: 'datos_invalidos', detalle: { motivo: 'el periodo termina antes de empezar' } };
    }
    const id = ulid();
    const t = ahora();
    this.sql.exec(
      `INSERT INTO rayas (id, periodo_inicio, periodo_fin, estado, total, nota, creado_por, creado_at)
       VALUES (?,?,?,'borrador',0,?,?,?)`,
      id, datos.periodo_inicio, datos.periodo_fin, datos.nota ?? '', contexto.usuario_id, t,
    );
    const r = this.ponerPagos(id, datos.pagos ?? []);
    if ('error' in r) {
      this.sql.exec(`DELETE FROM rayas WHERE id = ?`, id);
      return r;
    }
    return { ok: true, ...this.raya(id)! };
  }

  /** Poner los renglones de un corte, REEMPLAZANDO los que tuviera.
   *
   *  Reemplazar y no ir sumando es lo que hace que guardar dos veces no
   *  duplique a nadie: el defecto que Mike vivió con los ítems del proyecto
   *  el 20-sep. */
  private ponerPagos(
    raya_id: string,
    pagos: Array<{ personal_id: string; concepto?: string; sueldo?: number; extras?: number; descuentos?: number; nota?: string }>,
  ): { ok: true } | { error: string; detalle?: unknown } {
    const vistos = new Set<string>();
    for (const p of pagos) {
      if (!p.personal_id) return { error: 'datos_invalidos', detalle: { falta: 'personal_id' } };
      if (vistos.has(p.personal_id)) {
        return { error: 'datos_invalidos', detalle: { que: 'persona repetida', personal_id: p.personal_id, motivo: 'una persona viene dos veces en el mismo corte' } };
      }
      vistos.add(p.personal_id);
      const quien = this.obtener('personal', p.personal_id);
      if (!quien) return { error: 'no_encontrado', detalle: { que: 'persona', id: p.personal_id } };
      const neto = this.netoDe(p);
      if (neto < 0) {
        return { error: 'datos_invalidos', detalle: { que: 'neto negativo', persona: quien.nombre, motivo: 'los descuentos se comen el sueldo: ese renglón le debería dinero a la empresa' } };
      }
    }
    this.sql.exec(`DELETE FROM raya_pagos WHERE raya_id = ?`, raya_id);
    for (const p of pagos) {
      const quien = this.obtener('personal', p.personal_id)!;
      this.sql.exec(
        `INSERT INTO raya_pagos (id, raya_id, personal_id, nombre, concepto, sueldo, extras, descuentos, neto, nota, creado_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        ulid(), raya_id, p.personal_id, String(quien.nombre), p.concepto ?? 'Sueldo',
        Math.round(Number(p.sueldo ?? 0)) || 0, Math.round(Number(p.extras ?? 0)) || 0,
        Math.round(Number(p.descuentos ?? 0)) || 0, this.netoDe(p), p.nota ?? '', ahora(),
      );
    }
    this.recalcularRaya(raya_id);
    return { ok: true };
  }

  /** Corregir un corte. SÓLO en borrador: una raya pagada ya movió dinero, y
   *  cambiarle las cifras dejaría el recibo diciendo una cosa y el banco
   *  otra. Para corregir un pago hecho se corrige SU MOVIMIENTO, que desde
   *  el 20-sep se puede desde la lista de movimientos. */
  editarRaya(
    id: string,
    datos: { periodo_inicio?: string; periodo_fin?: string; nota?: string;
             pagos?: Array<{ personal_id: string; concepto?: string; sueldo?: number; extras?: number; descuentos?: number; nota?: string }> },
  ): { ok: true; raya: Fila; pagos: Fila[] } | { error: string; detalle?: unknown } {
    const actual = this.sql.exec(`SELECT * FROM rayas WHERE id = ?`, id).toArray()[0] as Fila | undefined;
    if (!actual) return { error: 'no_encontrado', detalle: { que: 'raya', id } };
    if (actual.estado !== 'borrador') {
      return { error: 'ya_pagada', detalle: { estado: actual.estado, motivo: 'una raya que ya movió dinero no se reescribe; corrige el movimiento de esa persona' } };
    }
    const inicio = datos.periodo_inicio ?? String(actual.periodo_inicio);
    const fin = datos.periodo_fin ?? String(actual.periodo_fin);
    if (fin < inicio) return { error: 'datos_invalidos', detalle: { motivo: 'el periodo termina antes de empezar' } };
    this.sql.exec(
      `UPDATE rayas SET periodo_inicio = ?, periodo_fin = ?, nota = ?, actualizado_at = ? WHERE id = ?`,
      inicio, fin, datos.nota ?? String(actual.nota ?? ''), ahora(), id,
    );
    if (datos.pagos) {
      const r = this.ponerPagos(id, datos.pagos);
      if ('error' in r) return r;
    }
    return { ok: true, ...this.raya(id)! };
  }

  /** Pagar el corte: un egreso POR PERSONA, de una sola vez.
   *
   *  Uno por persona y no uno global: el estado de cuenta tiene que decir a
   *  quién se le pagó. Con un egreso por el total, conciliar contra el banco
   *  es adivinar, y corregirle el monto a uno obliga a tocar el pago de
   *  todos.
   *
   *  Va todo o no va nada. Un corte pagado a medias —tres personas con su
   *  movimiento y dos sin él— es el peor estado posible: el total no cuadra
   *  con la cuenta y no hay forma de saber a quién le falta sin revisar
   *  renglón por renglón. */
  pagarRaya(
    id: string,
    args: { cuenta_id: string; fecha?: string; quien_usuario_id: string },
  ): { ok: true; raya: Fila; pagos: Fila[] } | { error: string; detalle?: unknown } {
    const raya = this.sql.exec(`SELECT * FROM rayas WHERE id = ?`, id).toArray()[0] as Fila | undefined;
    if (!raya) return { error: 'no_encontrado', detalle: { que: 'raya', id } };
    if (raya.estado === 'pagada') return { error: 'ya_pagada', detalle: { motivo: 'este corte ya se pagó' } };
    if (raya.estado === 'cancelada') return { error: 'cancelada', detalle: { motivo: 'este corte está cancelado' } };

    const cuenta = this.obtener('cuentas', args.cuenta_id);
    if (!cuenta) return { error: 'no_encontrado', detalle: { que: 'cuenta', id: args.cuenta_id } };
    const pagos = this.sql.exec(`SELECT * FROM raya_pagos WHERE raya_id = ?`, id).toArray() as Fila[];
    if (!pagos.length) return { error: 'datos_invalidos', detalle: { motivo: 'este corte no tiene a nadie' } };

    const fecha = args.fecha || ahora().slice(0, 10);
    const t = ahora();
    for (const p of pagos) {
      const mov_id = ulid();
      this.sql.exec(
        `INSERT INTO movimientos (id, tipo, monto, fecha, cuenta_id,
           contraparte_tipo, contraparte_id, contraparte_nombre, descripcion, categoria, creado_por, creado_at,
           facturado, requiere_factura)
         VALUES (?,'egreso',?,?,?,'personal',?,?,?,'raya',?,?,0,0)`,
        mov_id, Number(p.neto), fecha, args.cuenta_id,
        p.personal_id, p.nombre,
        `Raya ${raya.periodo_inicio} a ${raya.periodo_fin} · ${p.concepto}`,
        args.quien_usuario_id, t,
      );
      /* `requiere_factura` en 0 a propósito: una raya no lleva factura de
       * proveedor. Si naciera en 1, cada semana le caerían renglones a la
       * lista de «falta la factura» que nunca van a llegar, y esa lista
       * dejaría de leerse. */
      this.sql.exec(`UPDATE raya_pagos SET movimiento_id = ? WHERE id = ?`, mov_id, String(p.id));
    }
    this.sql.exec(
      `UPDATE rayas SET estado = 'pagada', cuenta_id = ?, pagada_at = ?, pagada_por = ?, actualizado_at = ? WHERE id = ?`,
      args.cuenta_id, t, args.quien_usuario_id, t, id,
    );
    this.recalcularRaya(id);
    this.avisar({ t: 'raya.pagada', id }, 'dinero');
    return { ok: true, ...this.raya(id)! };
  }

  /** Cancelar un corte que todavía no se paga. Uno pagado NO se cancela: ese
   *  dinero ya salió, y borrarlo de aquí no lo regresa a la cuenta. Lo que se
   *  corrige es el movimiento. */
  cancelarRaya(id: string): { ok: true; raya: Fila; pagos: Fila[] } | { error: string; detalle?: unknown } {
    const raya = this.sql.exec(`SELECT estado FROM rayas WHERE id = ?`, id).toArray()[0] as Fila | undefined;
    if (!raya) return { error: 'no_encontrado', detalle: { que: 'raya', id } };
    if (raya.estado === 'pagada') {
      return { error: 'ya_pagada', detalle: { motivo: 'ese dinero ya salió de la cuenta; cancelar el corte no lo regresa. Corrige o borra los movimientos.' } };
    }
    this.sql.exec(`UPDATE rayas SET estado = 'cancelada', actualizado_at = ? WHERE id = ?`, ahora(), id);
    return { ok: true, ...this.raya(id)! };
  }

  /** Firmó de recibido. Es el recibo, y por eso se puede QUITAR: se marca por
   *  error más seguido de lo que uno cree, y un recibo firmado que nadie
   *  firmó es justo lo que no sirve de nada en una aclaración. */
  recibido(pago_id: string, recibido: boolean): { ok: true; pago: Fila } | { error: string; detalle?: unknown } {
    const pago = this.sql.exec(`SELECT * FROM raya_pagos WHERE id = ?`, pago_id).toArray()[0] as Fila | undefined;
    if (!pago) return { error: 'no_encontrado', detalle: { que: 'pago', id: pago_id } };
    this.sql.exec(`UPDATE raya_pagos SET recibido_at = ? WHERE id = ?`, recibido ? ahora() : null, pago_id);
    return { ok: true, pago: this.sql.exec(`SELECT * FROM raya_pagos WHERE id = ?`, pago_id).toArray()[0] as Fila };
  }


  /* ─────────────── la raya y los expedientes de roster101 (§107) ───────────────
   *
   * Mike, 20-sep: «en la sección de raya de dash debo poder escoger a quién
   * se le paga de la lista de los trabajadores en roster101, no en la de
   * dash. Y de agregar las personas a las que se les realiza el pago».
   *
   * Las dos listas existen y NO son la misma, aunque se parezcan:
   *
   *   · `roster_trabajadores` es el EXPEDIENTE: quién es, su CURP, su NSS,
   *     su cuenta, sus documentos. La llena roster101, la llena el propio
   *     trabajador desde su celular, y es la lista larga de la empresa.
   *   · `personal` es a quién le toca algo en la suite: quién ve dinero,
   *     quién lleva la raya, de quién cuelga un pago. Es la lista corta.
   *
   * La raya pagaba contra la corta, y en una empresa que lleva expedientes
   * la corta está vacía: se veía como si no hubiera a quién pagarle. Ahora
   * la pantalla escoge de la LARGA, y escoger a alguien le abre su renglón
   * en la corta, ligado por `expediente_ref`.
   *
   * Por qué no se paga directo contra el expediente: un pago cuelga de
   * `raya_pagos.personal_id`, y esa llave apunta a `personal`. Cambiarla
   * sería mover la nómina entera para ahorrarse una fila. Y la fila sirve:
   * es donde vive el permiso.
   */

  /** Los expedientes de roster101, con su renglón en `personal` si ya lo
   *  tienen. Es la lista que se ofrece al armar un corte. */
  trabajadoresDeRoster(): Fila[] {
    return this.sql
      .exec(
        `SELECT t.id, t.nombre, t.apellido_paterno, t.apellido_materno, t.puesto, t.estado, t.email,
                p.id AS personal_id
         FROM roster_trabajadores t
         LEFT JOIN personal p ON p.expediente_ref = t.id
         ORDER BY t.nombre, t.apellido_paterno`,
      )
      .toArray()
      .map((t) => {
        const f = t as Fila;
        /* Sin nombre todavía sale con su correo, y no vacío: la mayoría de
         * los expedientes están en borrador el día que hay que pagarles
         * —entraron con su correo y no han llenado la ficha—, y un renglón
         * en blanco en una lista de gente no se puede escoger. */
        const nombre = [f.nombre, f.apellido_paterno, f.apellido_materno]
          .map((x) => String(x ?? '').trim()).filter(Boolean).join(' ') || String(f.email ?? '');
        return {
          id: f.id, nombre, puesto: String(f.puesto ?? ''), correo: String(f.email ?? ''),
          expediente: String(f.estado ?? ''), personal_id: f.personal_id ?? null,
        };
      });
  }

  /** Escoger a alguien del expediente: si ya tiene renglón en `personal`, se
   *  devuelve; si no, se le abre uno ligado a su expediente.
   *
   *  Ligado y no copiado: el nombre se toma del expediente al abrirlo, pero
   *  `expediente_ref` es lo que dice que son la misma persona. Sin esa liga,
   *  escoger dos veces al mismo abriría dos renglones y la raya le pagaría
   *  doble sin que nada se viera raro. */
  personaDeRoster(roster_id: string, contexto: { usuario_id: string }): { ok: true; persona: Fila; nueva: boolean } | { error: string; detalle?: unknown } {
    const exp = this.sql
      .exec(`SELECT id, nombre, apellido_paterno, apellido_materno, puesto, email FROM roster_trabajadores WHERE id = ?`, roster_id)
      .toArray()[0] as Fila | undefined;
    if (!exp) return { error: 'no_encontrado', detalle: { que: 'trabajador', id: roster_id } };

    const ya = this.sql.exec(`SELECT * FROM personal WHERE expediente_ref = ?`, roster_id).toArray()[0] as Fila | undefined;
    if (ya) return { ok: true, persona: this.afuera('personal', ya)!, nueva: false };

    const nombre = [exp.nombre, exp.apellido_paterno, exp.apellido_materno]
      .map((x) => String(x ?? '').trim()).filter(Boolean).join(' ') || String(exp.email ?? 'Sin nombre');
    const fila = this.crear(
      'personal',
      { nombre, puesto: String(exp.puesto ?? ''), correo: String(exp.email ?? ''), expediente_ref: roster_id, activo: 1 } as unknown as Fila,
      { app: 'roster101', usuario_id: contexto.usuario_id },
    );
    return { ok: true, persona: fila, nueva: true };
  }

  /* ─────────────── pool para autocompletar (§7) ─────────────── */

  pool(): Pool {
    const q = <T>(s: string) => this.sql.exec(s).toArray() as T[];
    return {
      clientes: q(`SELECT id, nombre, nombre_norm, correo, telefono FROM clientes ORDER BY nombre_norm`),
      proveedores: q(`SELECT id, nombre, nombre_norm, correo, telefono FROM proveedores ORDER BY nombre_norm`),
      personal: q(`SELECT id, nombre, nombre_norm, correo, puesto FROM personal WHERE activo = 1 ORDER BY nombre_norm`),
    } as Pool;
  }

  /* ─────────────── el estado de cuenta de un cliente (§0.29.0) ───────────────
   *
   * Mike, 20-sep: «necesito poder ver por cliente su estado de cuenta
   * general. Saldo global, y por proyecto».
   *
   * NO ES `peek`. Aquél es lo que el cliente ve de sí mismo en su portal, y
   * sus pagos salen de un JOIN contra `proyectos`: un cobro que no cuelga de
   * ningún proyecto —un anticipo antes de abrirlo, un pago suelto— ahí no
   * aparece. Para mirar por encima está bien; para un estado de cuenta que
   * alguien va a mandar, ese hueco es justo la diferencia entre cuadrar y no.
   *
   * TODO SALE DE UNA SOLA LISTA DE PAGOS, y los totales se suman de ella. Es
   * la misma regla que `peek` aprendió a golpes el 7-sep: si el total y la
   * tabla salen de dos consultas, un día se contradicen y las dos se ven
   * ciertas. Aquí el saldo global es, por construcción, la suma de los
   * renglones que se están enseñando. */
  estadoDeCuenta(cliente_id: string): {
    cliente: Fila;
    proyectos: Fila[];
    otros_pagos: Fila[];
    totales: { vendido: number; cobrado: number; saldo: number; sin_proyecto: number };
  } | null {
    const cliente = this.sql
      .exec(`SELECT id, nombre, rfc, correo, telefono FROM clientes WHERE id = ?`, cliente_id)
      .toArray()[0] as Fila | undefined;
    if (!cliente) return null;

    const proyectos = this.sql
      .exec(
        `SELECT id, nombre, estado, fecha_inicio, fecha_cierre, precio_venta
         FROM proyectos WHERE cliente_id = ? ORDER BY COALESCE(fecha_inicio, creado_at)`,
        cliente_id,
      )
      .toArray() as Fila[];
    const suyos = new Set(proyectos.map((p) => String(p.id)));

    /* Todos los cobros de este cliente: los que cuelgan de uno de SUS
     * proyectos, y los que traen su nombre como contraparte aunque no
     * cuelguen de ninguno. La `OR` es lo que tapa el hueco de `peek`. */
    const pagos = this.sql
      .exec(
        `SELECT m.id, m.fecha, m.monto, m.proyecto_id, m.descripcion, m.facturado, m.uuid_cfdi,
                m.cuenta_id, c.nombre AS cuenta_nombre
         FROM movimientos m
         LEFT JOIN proyectos p ON p.id = m.proyecto_id
         LEFT JOIN cuentas c ON c.id = m.cuenta_id
         WHERE m.tipo = 'ingreso' AND (m.contraparte_id = ? OR p.cliente_id = ?)
         ORDER BY m.fecha, m.creado_at`,
        cliente_id, cliente_id,
      )
      .toArray() as Fila[];

    const porProyecto = new Map<string, Fila[]>();
    const otros_pagos: Fila[] = [];
    for (const g of pagos) {
      const pid = g.proyecto_id ? String(g.proyecto_id) : '';
      if (pid && suyos.has(pid)) (porProyecto.get(pid) ?? porProyecto.set(pid, []).get(pid)!).push(g);
      else otros_pagos.push(g);
    }

    const conSaldo = proyectos.map((p) => {
      const suyosPagos = porProyecto.get(String(p.id)) ?? [];
      const cobrado = suyosPagos.reduce((t, g) => t + Number(g.monto || 0), 0);
      return {
        ...p,
        cobrado,
        saldo: Number(p.precio_venta || 0) - cobrado,
        pagos: suyosPagos,
      };
    });

    const vendido = proyectos.reduce((t, p) => t + Number(p.precio_venta || 0), 0);
    const sin_proyecto = otros_pagos.reduce((t, g) => t + Number(g.monto || 0), 0);
    const cobrado = conSaldo.reduce((t, p) => t + Number(p.cobrado), 0) + sin_proyecto;

    return { cliente, proyectos: conSaldo, otros_pagos, totales: { vendido, cobrado, saldo: vendido - cobrado, sin_proyecto } };
  }

  /* ─────────────── el estado de cuenta de UN proyecto (§119) ───────────────
   *
   * Mike, 21-sep: «necesito poder exportar un estado de cuenta en pdf y un
   * excel con lo siguiente de cada proyecto: saldo general, lista de
   * productos en proyecto, subtotal, IVA y total de proyecto completo,
   * movimientos de proyecto (pagos), fecha del día que se genera el status.
   * Creo que esto es lo mismo que el cliente podría descargar desde peek101».
   *
   * Tiene razón en lo último, y por eso esto vive AQUÍ y no en dash101: el
   * mismo documento lo va a abrir la empresa y lo va a bajar el cliente. Dos
   * pantallas armando cada una sus totales es la manera segura de que un día
   * no cuadren, y el que se daría cuenta es el cliente.
   *
   * TRES REGLAS QUE NO SE VEN Y SOSTIENEN EL DOCUMENTO:
   *
   *   1. La LISTA y el SUBTOTAL son la misma cifra. Los renglones son los
   *      ítems VENDIDOS, que es exactamente lo que suma `precio_venta`; si
   *      metiéramos los cotizados o los cancelados, la suma de la tabla no
   *      daría el total de abajo y el cliente lo vería antes que nosotros.
   *   2. Sólo van INGRESOS. Lo que se le pagó a un proveedor no es asunto
   *      del cliente, y este documento lo abre él.
   *   3. El SALDO es contra el TOTAL CON IVA, porque es lo que va a pagar.
   *      OJO: el KPI de saldo que enseña dash101 en otras pantallas es
   *      contra `precio_venta` sin IVA. No es una contradicción, son dos
   *      preguntas distintas —cuánto vendí y cuánto me deben—, pero el
   *      documento lo dice con letras para que nadie compare dos números
   *      que no son el mismo.
   *
   * La fecha la pone el SERVIDOR (`generado_at`). La del navegador es la del
   * reloj de quien imprime, y un estado de cuenta con la fecha de la laptop
   * mal puesta es un documento con la fecha mal puesta.
   */
  estadoDelProyecto(proyecto_id: string): {
    generado_at: string;
    proyecto: Fila;
    cliente: Fila | null;
    negocio: Fila | null;
    items: Fila[];
    movimientos: Fila[];
    totales: {
      subtotal: number; iva: number; total: number;
      tasa_iva: number; iva_incluido: boolean;
      cobrado: number; saldo: number; piezas: number;
    };
  } | null {
    const completo = this.obtener('proyectos', proyecto_id);
    if (!completo) return null;

    /* EL PROYECTO VA RECORTADO, y esto no es cosmética.
     *
     * `proyectos` trae `pagado_prov` —lo que le pagaste a tus proveedores— y
     * `compromiso` —lo que les debes—. El contrato lo dice con todas sus
     * letras desde el 0.1.0: «el cliente NUNCA lo ve». Y ESTA RUTA LA ABRE
     * EL CLIENTE, así que devolver la fila entera le enseñaría tus costos en
     * el mismo documento donde le cobras.
     *
     * Se recorta aquí y no en la pantalla porque la pantalla es peek101 y
     * dash101, y basta con que una se distraiga. Va por lista blanca —lo que
     * SÍ sale— y no por lista negra: una columna nueva en `proyectos` no se
     * asoma sola. */
    const proyecto: Fila = {
      id: completo.id, nombre: completo.nombre, descripcion: completo.descripcion,
      estado: completo.estado, cliente_id: completo.cliente_id,
      fecha_inicio: completo.fecha_inicio, fecha_fin_estimada: completo.fecha_fin_estimada,
      fecha_cierre: completo.fecha_cierre, precio_venta: completo.precio_venta,
      tasa_iva: completo.tasa_iva, iva_incluido: completo.iva_incluido,
    };

    const cliente = proyecto.cliente_id
      ? (this.sql.exec(`SELECT id, nombre, rfc, correo, telefono FROM clientes WHERE id = ?`, proyecto.cliente_id).toArray()[0] as Fila | undefined) ?? null
      : null;
    /* `negocio` ES LA EMPRESA (0.63.0): el único renglón de `empresa`. El
     * campo conserva su nombre para que peek101 y dash101 sigan leyendo el
     * RFC y la moneda de quien cobra sin cambiar nada. */
    const negocio = (this.sql.exec(`SELECT id, nombre, rfc, moneda FROM empresa WHERE id = 'empresa'`).toArray()[0] as Fila | undefined) ?? null;

    /* Los VENDIDOS, que son los que suman. `pr.nombre` sale por LEFT JOIN
     * para que un ítem agrupado diga de qué modelo es sin que la pantalla
     * tenga que pedir el catálogo aparte. */
    const items = this.sql
      .exec(
        `SELECT i.id, i.clave, i.nombre, i.descripcion, i.tipo, i.cantidad, i.monto,
                i.etapa, i.fecha_entrega, i.partida, i.producto_id, pr.nombre AS producto_nombre
         FROM items i
         LEFT JOIN productos pr ON pr.id = i.producto_id
         WHERE i.proyecto_id = ? AND i.estado = 'vendido'
         ORDER BY COALESCE(i.partida, ''), COALESCE(i.orden, 0), i.creado_at`,
        proyecto_id,
      )
      .toArray()
      .map((f) => {
        const i = f as Fila;
        const cantidad = Math.max(1, Math.trunc(Number(i.cantidad ?? 1)));
        return { ...i, cantidad, precio_unitario: Math.round(Number(i.monto ?? 0) / cantidad), importe: Number(i.monto ?? 0) };
      });

    const movimientos = this.sql
      .exec(
        `SELECT m.id, m.fecha, m.monto, m.descripcion, m.facturado, m.requiere_factura, m.uuid_cfdi,
                c.nombre AS cuenta_nombre
         FROM movimientos m
         LEFT JOIN cuentas c ON c.id = m.cuenta_id
         WHERE m.proyecto_id = ? AND m.tipo = 'ingreso'
         ORDER BY m.fecha, m.creado_at`,
        proyecto_id,
      )
      .toArray() as Fila[];

    /* El precio de venta es el caché que ya mantiene `recalcularProyecto`, y
     * es por construcción la suma de los vendidos. No se vuelve a sumar aquí
     * a propósito: dos maneras de calcular la misma cifra es una de más. */
    const venta = Number(completo.precio_venta ?? 0);
    const tasa = Math.max(0, Math.trunc(Number(completo.tasa_iva ?? 1600)));
    const incluido = Number(completo.iva_incluido ?? 0) === 1;

    /* En puntos base y con enteros de punta a punta: un 0.16 en coma
     * flotante deja centavos de diferencia entre el PDF y el Excel. */
    const subtotal = incluido ? Math.round((venta * 10000) / (10000 + tasa)) : venta;
    const iva = incluido ? venta - subtotal : Math.round((venta * tasa) / 10000);
    const total = subtotal + iva;
    const cobrado = movimientos.reduce((t, m) => t + Number(m.monto ?? 0), 0);

    return {
      generado_at: ahora(),
      proyecto, cliente, negocio, items, movimientos,
      totales: {
        subtotal, iva, total, tasa_iva: tasa, iva_incluido: incluido,
        cobrado, saldo: total - cobrado,
        piezas: items.reduce((t, i) => t + Number(i.cantidad ?? 1), 0),
      },
    };
  }

  /* ─────────────── /peek — lo del cliente, ya sumado ───────────────
   * Los totales salen de la misma consulta que la lista, así el KPI y la tabla
   * no se pueden contradecir. Fue un defecto real del 7-sep.
   * Las partidas y los egresos no salen de aquí: el cliente no ve costos. */

  clientePorUsuario(usuario_id: string): Fila | null {
    return (this.sql.exec(`SELECT * FROM clientes WHERE usuario_id = ? LIMIT 1`, usuario_id).toArray()[0] as Fila | undefined) ?? null;
  }

  clientePorCorreo(correo: string): Fila | null {
    const c = String(correo || '').trim().toLowerCase();
    if (!c) return null;
    return (this.sql.exec(`SELECT * FROM clientes WHERE lower(trim(correo)) = ? LIMIT 1`, c).toArray()[0] as Fila | undefined) ?? null;
  }

  peek(cliente_id: string): Peek | null {
    const cliente = this.sql
      .exec(`SELECT id, nombre, correo FROM clientes WHERE id = ?`, cliente_id)
      .toArray()[0] as Fila | undefined;
    if (!cliente) return null;

    const proyectos = this.sql
      .exec(
        `SELECT id, cliente_id, nombre, descripcion, estado, fecha_inicio, fecha_fin_estimada,
                fecha_cierre, precio_venta, cobrado, avance, creado_at, actualizado_at
         FROM proyectos WHERE cliente_id = ? ORDER BY creado_at DESC`,
        cliente_id,
      )
      .toArray() as Fila[];

    /* 0.66.0 · Lo de quell101 viaja junto (Mike, 4-oct: «para el cliente es
     * muy tedioso irse metiendo a diferentes plataformas»): la obra ligada al
     * proyecto, la pieza del plano que cuelga de cada ítem con cuántos planos
     * tiene, y abajo los puntos que el taller le pidió definir. peek101 arma
     * las ligas a quell101 con estos ids; aquí no hay direcciones. */
    const conItems = proyectos.map((p) => {
      const obra = this.sql
        .exec(`SELECT id, name AS nombre, status AS estado FROM quell_projects WHERE proyecto_id = ? ORDER BY created_at LIMIT 1`, p.id)
        .toArray()[0] ?? null;
      const items = (this.sql
        .exec(
          `SELECT id, clave, nombre, monto, moneda, estado, etapa, etapa_at, fecha_entrega
           FROM items WHERE proyecto_id = ? AND estado != 'cancelado' ORDER BY creado_at`,
          p.id,
        )
        .toArray() as Fila[]).map((it) => ({
          ...it,
          piezas: this.sql
            .exec(
              `SELECT e.id, e.project_id AS obra_id, e.code AS codigo,
                      (SELECT COUNT(*) FROM quell_element_docs d WHERE d.element_id = e.id AND d.archivado_at IS NULL) AS docs
               FROM quell_elements e WHERE e.item_id = ? ORDER BY e.code`,
              String(it.id),
            )
            .toArray(),
        }));
      return { ...p, obra, items };
    });

    /* Los puntos por definir: las dudas abiertas que el TALLER le hizo al
     * cliente (no las que él preguntó), en las obras ligadas a sus proyectos
     * o donde quell lo tiene apuntado como cliente. Van primero las más
     * viejas: son las que más tiempo llevan deteniendo algo. */
    const pendientes = this.sql
      .exec(
        `SELECT d.id, d.texto, d.created_at, d.project_id AS obra_id, p.name AS obra,
                d.element_id, e.code AS codigo, e.name AS pieza, u.name AS quien
           FROM quell_dudas d
           JOIN quell_projects p ON p.id = d.project_id
           LEFT JOIN quell_elements e ON e.id = d.element_id
           LEFT JOIN quell_users u ON u.id = d.user_id
          WHERE d.para = 'cliente' AND d.estado = 'abierta' AND COALESCE(u.role, '') <> 'cli'
            AND (p.proyecto_id IN (SELECT id FROM proyectos WHERE cliente_id = ?)
                 OR p.id IN (SELECT pm.project_id FROM quell_project_members pm JOIN quell_users qu ON qu.id = pm.user_id
                             WHERE pm.rol = 'cli' AND lower(qu.email) = lower(?)))
          ORDER BY d.created_at`,
        cliente_id, String(cliente.correo ?? ''),
      )
      .toArray();

    const vendido = proyectos.reduce((s, p) => s + Number(p.precio_venta || 0), 0);
    const cobrado = proyectos.reduce((s, p) => s + Number(p.cobrado || 0), 0);
    const avance = proyectos.length ? proyectos.reduce((s, p) => s + Number(p.avance || 0), 0) / proyectos.length : 0;

    const pagos = this.sql
      .exec(
        `SELECT m.id, m.fecha, m.monto, m.proyecto_id, m.descripcion
         FROM movimientos m JOIN proyectos p ON p.id = m.proyecto_id
         WHERE p.cliente_id = ? AND m.tipo = 'ingreso' ORDER BY m.fecha DESC LIMIT 200`,
        cliente_id,
      )
      .toArray();

    return {
      cliente,
      proyectos: conItems,
      totales: { vendido, cobrado, saldo: vendido - cobrado, avance },
      pagos,
      pendientes,
    } as unknown as Peek;
  }

  /* ─────────────── WebSocket (§8) ───────────────
   * Hibernation API: mientras nadie habla, no cuesta. Cada conexión guarda a
   * qué tiene derecho, y el filtro es el mismo que el de REST: quien no puede
   * leer dinero por REST tampoco lo recibe por aquí. */

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    // quell101: la ruta del Worker (src/rutas/orgs.ts) ya resolvió empresa,
    // app y quién viene, y lo manda en cabeceras. Aquí corre el motor de la
    // bitácora sobre el SQLite de esta empresa.
    if (url.pathname === '/quell' || url.pathname.startsWith('/quell/')) {
      const sesion = cabeceraJson<SesionQuell | null>(req.headers.get('x-sesion'), null);
      if (!sesion) return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401, headers: { 'content-type': 'application/json' } });
      const org = req.headers.get('x-org') || '';
      const e = this.env;
      return atenderQuell(req, {
        DB: baseSobreSql(this.sql),
        FILES: e.ARCHIVOS,
        SESION: sesion,
        PREFIJO_R2: `orgs/${org}/quell/`,
        SITIO: req.headers.get('x-sitio') || 'https://quell101.taller101.com',
        APP_NAME: 'quell101',
        MAIL_FROM: e.CORREO_QUELL || 'quell101 <bitacora@envios.taller101.mx>',
        RESEND_API_KEY: e.RESEND_API_KEY,
        CORREO_SALE: e.ENTORNO === 'produccion' || e.CORREO_DE_VERDAD === '1',
        // La invitación del cliente en la suite, desde adentro: el motor la
        // pide después de revisar que quien invita sea el dueño de la obra.
        INVITAR_EN_SUITE: (correo: string, nombre: string, usarExistente = false) =>
          invitarClienteEnSuite(e, org, { ...sesion.quien, ve_dinero: true, ve_costos: true } as Quien, this as unknown as ApiOrgDB, 'quell101', correo, nombre, usarExistente),
        // 0.49.0: el requerimiento nace como ítem y cae en el borrador de quote101.
        LEVANTAR_REQUERIMIENTO: (d) => this.levantarRequerimiento({ ...d, usuario_id: sesion.quien.usuario_id }),
        // 0.77.0: la obra que nace en quell nace también con su cliente y su proyecto.
        ALTA_EN_LA_SUITE: async (d: { obra_id: string; cliente_id?: string | null; cliente_nombre?: string | null }) =>
          this.altaDeObraEnLaSuite({ ...d, usuario_id: sesion.quien.usuario_id }),
        // 0.73.0: las partidas que nacen de las fases del cronograma mueven el compromiso del proyecto.
        RECALCULAR_PROYECTO: async (id: string) => { this.recalcularProyecto(id); },
      }, url, url.pathname);
    }
    // roster101: igual que quell101, pero la sesión de la suite puede venir
    // vacía: el trabajador entra con su propia cookie, que el motor firma y
    // verifica con el secreto de la suite. Los datos de la empresa (nombre,
    // razón social…) vienen de su Worker en `x-roster`.
    if (url.pathname === '/roster' || url.pathname.startsWith('/roster/')) {
      const sesion = cabeceraJson<SesionRoster | null>(req.headers.get('x-sesion'), null);
      const org = req.headers.get('x-org') || '';
      const datos = cabeceraJson<DatosEmpresaRoster>(req.headers.get('x-roster'), {});
      let nombreOrg = 'la empresa';
      try { nombreOrg = decodeURIComponent(req.headers.get('x-empresa') || '') || nombreOrg; } catch { /* venía sin codificar */ }
      const e = this.env;
      const interna = new URL(url.toString());
      interna.pathname = url.pathname.replace(/^\/roster/, '') || '/';
      const peticion = new Request(interna.toString(), req);
      return atenderRoster(peticion, {
        DB: baseSobreSql(this.sql),
        DOCS: bucketConPrefijo(e.ARCHIVOS, `orgs/${org}/roster/`),
        SESION: sesion,
        SECRETO: await secretoDe(e),
        RESEND_API_KEY: e.RESEND_API_KEY,
        CORREO_SALE: e.ENTORNO === 'produccion' || e.CORREO_DE_VERDAD === '1',
        EMPRESA: datos.empresa || nombreOrg,
        RAZON_SOCIAL: datos.razon_social || datos.empresa || nombreOrg,
        DOMICILIO: datos.domicilio || '',
        CORREO_PRIVACIDAD: datos.correo_privacidad || datos.correo_avisos || '',
        CORREO_AVISOS: datos.correo_avisos || '',
        CORREO_REMITENTE: datos.correo_remitente || e.CORREO_ROSTER || 'roster101 <expedientes@envios.taller101.mx>',
        AVISO_VERSION: datos.aviso_version || '1',
        PORTAL_VERSION: datos.version || '',
      }, { waitUntil: (p: Promise<unknown>) => this.ctx.waitUntil(p) });
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('solo websocket', { status: 426 });
    const par = new WebSocketPair();
    const [cliente, servidor] = Object.values(par);
    this.ctx.acceptWebSocket(servidor);
    servidor.serializeAttachment({ ve: url.searchParams.get('ve') || 'todos' });
    servidor.send(JSON.stringify({ t: 'listo', at: ahora() }));
    return new Response(null, { status: 101, webSocket: cliente });
  }

  webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): void {
    if (typeof msg === 'string' && msg === 'ping') ws.send('pong');
  }

  webSocketClose(ws: WebSocket, code: number): void {
    try { ws.close(code === 1006 ? 1000 : code, 'adios'); } catch { /* ya estaba cerrada */ }
  }

  /* ─────────────── investor101 (0.82.0) ───────────────
   * El motor vive en src/inversion-db.ts; aquí sólo se le presta la base, la
   * transacción, el consecutivo y el aviso. Una sola entrada por RPC en vez
   * de cuarenta métodos: la lista de lo que se puede llamar está abajo, y lo
   * que no esté ahí no existe para nadie de afuera. */
  private static readonly OPS_INVERSION: ReadonlySet<string> = new Set([
    'inversionistas', 'inversionista', 'inversionistaPorUsuario', 'crearInversionista', 'actualizarInversionista', 'ligarUsuario', 'borrarInversionista',
    'ajustes', 'guardarAjustes',
    'rondas', 'verRonda', 'crearRonda', 'actualizarRonda', 'abrirRonda', 'terminarRonda', 'reabrirRonda', 'borrarRonda', 'rondaPara', 'rondasPara',
    'ofrecer', 'oferta', 'retirarOferta', 'rechazarOferta', 'aprobarOferta',
    'prestamos', 'prestamo', 'verPrestamo', 'crearPrestamo', 'actualizarPrestamo', 'marcarRecibido', 'cancelarPrestamo', 'editarTabla',
    'pago', 'pagar', 'deshacerPago', 'pagosPendientes', 'pagosHechos', 'flujo', 'resumenAdmin', 'estadoDeCuenta',
    'registrarArchivo', 'archivo', 'borrarArchivo',
  ]);

  inversion(op: string, args: unknown[] = []): unknown {
    if (!OrgDB.OPS_INVERSION.has(op)) return { error: 'operacion_desconocida', detalle: { op } };
    const motor = new MotorInversion({
      sql: this.sql,
      tx: <T>(fn: () => T): T => this.ctx.storage.transactionSync(fn),
      apartarNumero: (serie) => this.apartarNumero(serie),
      alMover: (id) => this.avisar({ t: 'movimiento.nuevo', id, proyecto_id: null }, 'dinero'),
    }) as unknown as Record<string, (...a: unknown[]) => unknown>;
    return motor[op](...args);
  }

  /* ─────────────── bill101 (0.85.0) ───────────────
   * El motor vive en src/fiscal-db.ts. Misma forma que el de arriba: una
   * entrada por RPC y la lista de lo que se puede llamar. Ligar y cancelar
   * se le prestan: son de la 0009 y siguen viviendo aquí. */
  private static readonly OPS_FISCAL: ReadonlySet<string> = new Set([
    'importar', 'ponerArchivo', 'ponerArchivos', 'detalle', 'sugerencias', 'desligar', 'tratar',
    'porVerificar', 'anotarSat', 'estadoDeCuenta', 'impuestos',
    'ejercicio', 'guardarEjercicio', 'pagos', 'registrarPago', 'borrarPago', 'config', 'guardarConfig',
  ]);

  fiscal(op: string, args: unknown[] = []): unknown {
    if (!OrgDB.OPS_FISCAL.has(op)) return { error: 'operacion_desconocida', detalle: { op } };
    const motor = new MotorFiscal({
      sql: this.sql,
      tx: <T>(fn: () => T): T => this.ctx.storage.transactionSync(fn),
      rfcEmpresa: () => String((this.sql.exec(`SELECT rfc FROM empresa WHERE id = 'empresa'`).toArray()[0] as Fila | undefined)?.rfc ?? ''),
      ligar: (a) => this.ligarCfdi(a),
      cancelar: (id) => this.cancelarCfdi(id),
    }) as unknown as Record<string, (...a: unknown[]) => unknown>;
    return motor[op](...args);
  }

  /* ─────────────── bill101 fase D: el SAT (0.87.0) ───────────────
   * El motor vive en src/sat-db.ts. Es el primero de esta base que trabaja
   * SOLO: el SAT tarda en contestar, así que cada solicitud es un renglón y
   * la base se despierta con su alarma a darle el siguiente paso. No hay
   * otra alarma en esta clase; si un día la hay, tienen que compartirla. */
  private static readonly OPS_SAT: ReadonlySet<string> = new Set(['estado', 'guardarFiel', 'quitarFiel', 'configurar', 'bajar']);
  private memoriaSat: MemoriaSat = {};

  private motorSat(): MotorSat {
    const fiscal = (op: string, args: unknown[]) => this.fiscal(op, args) as any;
    return new MotorSat({
      sql: this.sql,
      tx: <T>(fn: () => T): T => this.ctx.storage.transactionSync(fn),
      env: this.env,
      rfcEmpresa: () => String((this.sql.exec(`SELECT rfc FROM empresa WHERE id = 'empresa'`).toArray()[0] as Fila | undefined)?.rfc ?? ''),
      // En una empresa recién nacida el renglón todavía no existe: se crea
      // primero (con el nombre que la org tenga en el D1 no se cuenta aquí;
      // GET /empresa lo corrige al primer uso).
      ponerRfcEmpresa: (rfc) => { this.empresa(''); this.sql.exec(`UPDATE empresa SET rfc = ? WHERE id = 'empresa'`, rfc); },
      importar: (lista, actor) => fiscal('importar', [lista, actor, 'sat']),
      ponerArchivos: (lista) => { fiscal('ponerArchivos', [lista]); },
      anotarSat: (id, estado) => fiscal('anotarSat', [id, { estado }]),
      despertarEn: async (ms) => {
        if (ms === null) { await this.ctx.storage.deleteAlarm(); return; }
        /* En las pruebas la alarma la dispara la prueba (runDurableObjectAlarm);
         * si además se disparara sola a los 500 ms, competiría con ella y las
         * pruebas saldrían distintas según lo rápida que fuera la máquina (pasó
         * el 9-oct). Se deja puesta, pero lejos: la prueba congela Date en una
         * hora fija y la alarma se compara contra el reloj de verdad, así que
         * «a una hora» dejó de bastar en cuanto el reloj real rebasó esa hora
         * fija (volvió a pasar el mismo 9-oct por la tarde). A un año. */
        const espera = this.env.ENTORNO === 'prueba' ? Math.max(ms, 365 * 86400_000) : ms;
        await this.ctx.storage.setAlarm(Date.now() + espera);
      },
      memoria: this.memoriaSat,
      traer: (a, b) => fetch(a, b),
    });
  }

  sat(op: string, args: unknown[] = []): unknown {
    if (!OrgDB.OPS_SAT.has(op)) return { error: 'operacion_desconocida', detalle: { op } };
    return (this.motorSat() as unknown as Record<string, (...a: unknown[]) => unknown>)[op](...args);
  }

  /* ─────────────── bill101 fase C: timbrar (0.88.0) ─────────────── */
  private static readonly OPS_PAC: ReadonlySet<string> = new Set([
    'config', 'cuenta', 'guardarCuenta', 'quitarCuenta', 'ajustar', 'anotarPerfil', 'prellenar',
    'abrirEmision', 'timbrada', 'fallida', 'darPorFallida', 'emision', 'emisiones', 'paraCancelar', 'cancelacion',
    'conceptos', 'clientes', 'correosDe', 'ponerCorreos', 'pdfConfig', 'ponerPdfConfig',
  ]);

  pac(op: string, args: unknown[] = []): unknown {
    if (!OrgDB.OPS_PAC.has(op)) return { error: 'operacion_desconocida', detalle: { op } };
    const fiscal = (o: string, a: unknown[]) => this.fiscal(o, a) as any;
    const motor = new MotorPac({
      sql: this.sql,
      tx: <T>(fn: () => T): T => this.ctx.storage.transactionSync(fn),
      rfcEmpresa: () => String((this.sql.exec(`SELECT rfc FROM empresa WHERE id = 'empresa'`).toArray()[0] as Fila | undefined)?.rfc ?? ''),
      importar: (lista, actor, rfcComo) => fiscal('importar', [lista, actor, 'timbrado', rfcComo]),
      ponerArchivo: (id, a) => fiscal('ponerArchivo', [id, a]),
      cancelar: (id) => this.cancelarCfdi(id),
    }) as unknown as Record<string, (...a: unknown[]) => unknown>;
    return motor[op](...args);
  }

  /** La despertada. Si truena, se vuelve a intentar en un rato: una alarma
   *  que lanza se reintenta sola seis veces seguidas y luego se pierde, y
   *  aquí lo que se quiere es que la cola nunca se quede sin quien la mueva. */
  async alarm(): Promise<void> {
    try {
      await this.motorSat().tic();
    } catch (e) {
      console.error('sat', e);
      await this.ctx.storage.setAlarm(Date.now() + 15 * 60_000);
    }
  }

  private avisar(aviso: Aviso, alcance: 'todos' | 'dinero'): void {
    const texto = JSON.stringify(aviso);
    for (const ws of this.ctx.getWebSockets()) {
      let ve = 'todos';
      try { ve = (ws.deserializeAttachment() as { ve?: string })?.ve || 'todos'; } catch { /* sin adjunto */ }
      if (alcance === 'dinero' && ve !== 'todos') continue;
      try { ws.send(texto); } catch { /* se cayó; el runtime la limpia */ }
    }
  }

  /** Cuántos hay conectados. Lo usa la prueba de humo para poder afirmar que
   *  el aviso salió a otra pantalla y no al vacío. */
  conectados(): number {
    return this.ctx.getWebSockets().length;
  }
}
