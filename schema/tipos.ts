/* Suite 101 — tipos compartidos
 *
 * UN SOLO ARCHIVO. Las demás apps lo copian tal cual, sin editarlo: si aquí se
 * cambia algo, se vuelve a copiar. No importa nada, no depende de nada, no
 * trae código que corra. Solo tipos y constantes.
 *
 * Tres cosas que este archivo da por sentadas y que no se negocian:
 *
 *   1. El dinero es INTEGER en centavos. $150,000.00 es 15000000. Nunca un
 *      flotante: SQLite no tiene decimal y sumar flotantes pierde centavos.
 *      Se formatea con Fira Sans, cifras tabulares (identidad Taller 101).
 *   2. Se dice ítem, no producto. Lo que se cobra puede ser una cocina, una
 *      visita o un servicio.
 *   3. Las fechas son texto ISO 8601 en UTC, en toda la plataforma.
 *
 * Versión del contrato: 0.7.0 (contraseña de verdad junto al código, el PIN y
 * Google: POST /auth/clave la fija, /auth/entrar la acepta, y cambiarla pide
 * la actual salvo que la sesión venga de código o de Google). Antes:
 * 0.6.0 (workshop101 — el administrador de la empresa:
 * PATCH de rol y apps por miembro, candados de último dueño y de uno mismo,
 * la lista de apps por persona se aplica en la puerta, última entrada por
 * miembro, y la bitácora de la empresa la lee su dueño). Antes:
 * 0.5.0 (master101 — superadmins por ruta, la bitácora
 * del panel `bitacora_admin`, y conteos por empresa en GET /admin/orgs; nada
 * de lo de 0.4.0 cambia)
 */

export const VERSION_CONTRATO = '0.7.0';

/* ─────────────── envoltura de toda respuesta ─────────────── */

export type Respuesta<T> = { ok: true; data: T } | { ok: false; error: string; detalle?: unknown };
export type Lista<T> = { total: number; filas: T[] };

/** Errores que devuelve la API, en snake_case. La app puede prender por ellos. */
export type ErrorApi =
  | 'sin_sesion'
  | 'sin_permiso'
  | 'sin_app'
  | 'app_desconocida'
  | 'app_inactiva'
  | 'campo_no_permitido'
  | 'campo_solo_por_etapa'
  | 'etapa_no_permitida'
  | 'tabla_desconocida'
  | 'no_encontrado'
  | 'datos_invalidos'
  | 'dinero_no_entero'
  | 'org_desconocida'
  | 'org_inactiva'
  | 'correo_no_configurado'
  | 'google_no_configurado'
  | 'codigo_invalido'
  | 'pin_invalido'
  | 'demasiados_intentos'
  | 'items_nunca_se_borran'
  | 'ultimo_superadmin'
  | 'ultimo_owner'
  | 'clave_invalida'
  | 'clave_debil'
  | 'app_no_permitida';

/* ─────────────── apps ─────────────── */

export const APPS = [
  'dash101',
  'quell101',
  'peek101',
  'cotizador101',
  'roster101',
  'nest101',
  'master101',
  'workshop101',
  'suite101',
] as const;
export type App = (typeof APPS)[number];

/** La llave con la que cada app aparece en `orgs.apps`. */
export const LLAVE_APP: Record<App, string> = {
  dash101: 'dash',
  quell101: 'quell',
  peek101: 'peek',
  cotizador101: 'cotizador',
  roster101: 'roster',
  nest101: 'nest',
  master101: 'master',
  workshop101: 'workshop',
  suite101: 'suite',
};

/* ─────────────── D1 master: el directorio ─────────────── */

export type Rol = 'owner' | 'admin' | 'socio' | 'staff';
export type TipoAcceso = 'cliente' | 'personal';

export interface Org {
  id: string; // slug, y también el nombre del Durable Object
  nombre: string;
  plan: string;
  apps: Record<string, boolean>;
  moneda: string;
  activa: boolean;
  creado_at: string;
}

export interface Usuario {
  id: string;
  correo: string; // minúsculas
  nombre: string | null;
  creado_at: string;
}

export interface Yo {
  usuario: Usuario;
  superadmin: boolean;
  orgs: Array<{ id: string; nombre: string; rol: Rol; apps: string[]; negocios: string[] }>;
  acceso: { org_id: string; tipo: TipoAcceso; ref_id: string } | null;
}

/* ─────────────── el panel de la suite (master101), contrato 0.5.0 ─────────────── */

/** Lo que trae cada fila de GET /admin/orgs: la empresa y sus conteos. */
export interface OrgConConteos extends Org {
  /** cuántos miembros tiene (socios y oficina; no cuenta clientes ni personal) */
  personas: number;
  /** la sesión más reciente de cualquiera de sus miembros, ISO, o null si nadie ha entrado */
  ultima_entrada: string | null;
}

export interface Superadmin {
  usuario_id: string;
  correo: string;
  nombre: string | null;
}

/** Un renglón de `bitacora_admin`: quién cambió qué en el directorio. */
export interface RenglonBitacoraAdmin {
  id: number;
  cuando: string;
  quien: string; // correo del superadmin
  org_id: string | null; // null cuando cambió la lista de superadmins
  campo: string; // 'creada' | 'nombre' | 'plan' | 'moneda' | 'activa' | 'apps.dash' … | 'miembro' | 'superadmin'
  antes: string | null;
  despues: string | null;
}

/* ─────────────── OrgDB: el SQLite de cada empresa ─────────────── */

export type Moneda = 'MXN' | 'USD';

export interface Negocio {
  id: string;
  nombre: string;
  rfc: string | null;
  moneda: Moneda;
  /** Día en que toca conciliar: 0 domingo … 6 sábado. Por omisión el lunes. */
  dia_conciliacion: number;
  creado_at: string;
}

export interface Cuenta {
  id: string;
  negocio_id: string;
  nombre: string;
  tipo: 'banco' | 'caja' | 'credito' | 'otro';
  banco: string | null;
  moneda: Moneda;
  /** centavos */
  saldo_inicial: number;
  creado_at: string;
}

export interface Cliente {
  id: string;
  negocio_id: string;
  nombre: string;
  nombre_norm: string;
  correo: string | null;
  telefono: string | null;
  rfc: string | null;
  notas: string | null;
  usuario_id: string | null; // acceso a peek101
  portal_activo: boolean;
  creado_en_app: string;
  creado_at: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  nombre_norm: string;
  rfc: string | null;
  categoria: string | null;
  correo: string | null;
  telefono: string | null;
  terminos_pago: string | null;
  notas: string | null;
  creado_en_app: string;
  creado_at: string;
}

export interface Personal {
  id: string;
  nombre: string;
  nombre_norm: string;
  correo: string | null;
  puesto: string | null;
  activo: boolean;
  expediente_ref: string | null;
  etapas_permitidas: Etapa[];
  ve_dinero: boolean;
  estacion_default: string | null;
  usuario_id: string | null;
  creado_en_app: string;
  creado_at: string;
}

export interface Estacion {
  id: string;
  nombre: string;
  etapa_default: Etapa | null;
}

export interface Cotizacion {
  id: string;
  negocio_id: string;
  cliente_id: string | null;
  folio: string | null;
  estado: 'borrador' | 'enviada' | 'aceptada' | 'rechazada';
  /** centavos */
  total: number;
  moneda: Moneda;
  vigencia: string | null;
  datos: Record<string, unknown>;
  creado_at: string;
  actualizado_at: string | null;
}

export type EstadoProyecto = 'planeando' | 'activo' | 'pausado' | 'finiquito' | 'cerrado';

/** Lo acordado con un proveedor dentro de un proyecto. Cuelga del proyecto;
 *  el ítem es opcional (decisión de Mike, 11-sep). El cliente NUNCA la ve. */
export interface Partida {
  id: string;
  proyecto_id: string;
  item_id: string | null;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  concepto: string | null;
  /** centavos */
  monto_acordado: number;
  // cachés: los recalcula la API desde los egresos del proyecto con ese
  // proveedor como contraparte. Ninguna app los escribe.
  /** centavos */
  monto_pagado: number;
  estado: 'pendiente' | 'parcial' | 'pagado';
  creado_at: string;
  actualizado_at: string | null;
}

export interface Proyecto {
  id: string;
  negocio_id: string;
  cliente_id: string;
  nombre: string;
  descripcion: string | null;
  estado: EstadoProyecto;
  fecha_inicio: string | null;
  fecha_fin_estimada: string | null;
  fecha_cierre: string | null;
  // cachés: los recalcula la API tras cada mutación. Ninguna app los escribe.
  /** centavos */
  precio_venta: number;
  /** centavos */
  cobrado: number;
  /** centavos. El cliente NUNCA lo ve. */
  pagado_prov: number;
  /** centavos: Σ monto_acordado de sus partidas. El cliente NUNCA lo ve. */
  compromiso: number;
  /** 0..1 */
  avance: number;
  creado_at: string;
  actualizado_at: string | null;
}

/** Eje comercial. No se condiciona con la etapa. */
export type EstadoItem = 'cotizado' | 'vendido' | 'cancelado';
/** Eje de fabricación. 0 = todavía no arranca. */
export type Etapa = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const ETAPAS: Array<{ n: Etapa; nombre: string; termina: string; quien: string }> = [
  { n: 0, nombre: 'Sin arrancar', termina: '—', quien: '—' },
  { n: 1, nombre: 'Diseño autorizado', termina: 'el cliente firma el diseño', quien: 'oficina' },
  { n: 2, nombre: 'Anticipo pagado', termina: 'entra el anticipo', quien: 'administración' },
  { n: 3, nombre: 'Compra de materiales', termina: 'material recibido en taller', quien: 'compras / almacén' },
  { n: 4, nombre: 'Despiece y ensamble', termina: 'embalado y etiquetado — nace la clave', quien: 'taller' },
  { n: 5, nombre: 'Entrega', termina: 'descargado en sitio', quien: 'chofer' },
  { n: 6, nombre: 'Instalación', termina: 'colocado en su lugar', quien: 'instalador' },
  { n: 7, nombre: 'Cierre', termina: 'el cliente acepta', quien: 'residente / cliente' },
];

/** En la etapa 4 nace la clave del ítem ('M07'). */
export const ETAPA_CLAVE: Etapa = 4;

export interface Item {
  id: string;
  negocio_id: string;
  proyecto_id: string | null; // NULL mientras solo está cotizado
  cliente_id: string;
  clave: string | null;
  nombre: string;
  descripcion: string | null;
  tipo: 'mueble' | 'servicio' | 'visita' | 'otro';
  /** centavos */
  monto: number;
  moneda: Moneda;
  estado: EstadoItem;
  etapa: Etapa;
  etapa_at: string | null;
  etapa_por: string | null;
  fecha_entrega: string | null;
  asignados: string[];
  origen: { app?: string; cotizacion_id?: string; linea?: number };
  refs: { nest?: string; draw?: string; fotos?: string[] };
  creado_at: string;
  creado_por: string;
  actualizado_at: string | null;
}

/** Append-only: no hay PATCH ni DELETE. */
export interface Avance {
  id: string;
  item_id: string;
  etapa: Etapa;
  persona_id: string | null;
  usuario_id: string;
  nota: string | null;
  foto: string | null;
  ts: string;
}

export interface Movimiento {
  id: string;
  negocio_id: string;
  tipo: 'ingreso' | 'egreso';
  /** centavos */
  monto: number;
  fecha: string;
  cuenta_id: string;
  proyecto_id: string | null;
  item_id: string | null;
  contraparte_tipo: 'cliente' | 'proveedor' | 'personal' | 'otro';
  contraparte_id: string | null;
  contraparte_nombre: string | null;
  transfer_id: string | null;
  descripcion: string | null;
  categoria: string | null;
  creado_por: string;
  creado_at: string;
}

export interface Opex {
  id: string;
  negocio_id: string;
  nombre: string;
  tipo: string;
  /** centavos */
  monto: number;
  moneda: Moneda;
  frecuencia: 'semanal' | 'mensual' | 'anual';
  dia_semana: number | null;
  dia_del_mes: number | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  cuenta_id: string | null;
  categoria: string | null;
  activo: boolean;
  creado_at: string;
}

/** Una conciliación: la foto de un momento. Append-only, como `avances`. */
export interface Conciliacion {
  id: string;
  negocio_id: string;
  /** La hora exacta del corte; el saldo registrado se congela ahí. */
  corte_at: string;
  hecha_por: string;
  creado_at: string;
}

export interface ConciliacionCuenta {
  id: string;
  conciliacion_id: string;
  cuenta_id: string;
  /** centavos */
  saldo_registrado: number;
  /** centavos */
  saldo_real: number;
  /** registrado − real, en centavos. Positiva: salidas que nadie registró. */
  diferencia: number;
  /** El ajuste que dejó la cuenta igual al real; null si cuadró. */
  movimiento_id: string | null;
  creado_at: string;
}

export interface Archivo {
  id: string;
  r2_key: string;
  nombre: string;
  mime: string | null;
  bytes: number | null;
  de_tabla: string;
  de_id: string;
  subido_por: string;
  creado_at: string;
}

export const TABLAS = [
  'negocios',
  'cuentas',
  'clientes',
  'proveedores',
  'personal',
  'estaciones',
  'cotizaciones',
  'proyectos',
  'items',
  'partidas',
  'avances',
  'movimientos',
  'opex',
  'conciliaciones',
  'conciliacion_cuentas',
  'archivos',
] as const;
export type Tabla = (typeof TABLAS)[number];

/* ─────────────── lo que devuelven las rutas con nombre ─────────────── */

/** GET /orgs/:o/pool — para autocompletar. Solo identidad. */
export interface Pool {
  clientes: Array<Pick<Cliente, 'id' | 'nombre' | 'nombre_norm' | 'correo' | 'telefono'>>;
  proveedores: Array<Pick<Proveedor, 'id' | 'nombre' | 'nombre_norm' | 'correo' | 'telefono'>>;
  personal: Array<Pick<Personal, 'id' | 'nombre' | 'nombre_norm' | 'correo' | 'puesto'>>;
}

/** GET /orgs/:o/peek — todo lo del cliente en sesión, ya agregado por la API.
 *  Los números vienen calculados aquí para que el KPI y la tabla no se
 *  contradigan nunca (fue un defecto real el 7-sep). */
export interface Peek {
  cliente: Pick<Cliente, 'id' | 'nombre' | 'correo'>;
  proyectos: Array<
    Omit<Proyecto, 'pagado_prov' | 'compromiso'> & {
      items: Array<Pick<Item, 'id' | 'clave' | 'nombre' | 'monto' | 'moneda' | 'estado' | 'etapa' | 'etapa_at' | 'fecha_entrega'>>;
    }
  >;
  /** centavos */
  totales: { vendido: number; cobrado: number; saldo: number; avance: number };
  pagos: Array<Pick<Movimiento, 'id' | 'fecha' | 'monto' | 'proyecto_id' | 'descripcion'>>;
}

/* ─────────────── WebSocket (§8) ─────────────── */

export type Aviso =
  | { t: 'item.etapa'; id: string; etapa: Etapa; clave: string | null; at: string }
  | { t: 'item.cambio'; id: string }
  | { t: 'movimiento.nuevo'; id: string; proyecto_id: string | null }
  | { t: 'proyecto.cache'; id: string; precio_venta: number; cobrado: number; avance: number }
  | { t: 'conciliacion.nueva'; id: string; negocio_id: string; diferencia_total: number };

/* ─────────────── ayudas de formato (identidad Taller 101) ─────────────── */

export const AZUL_T101 = '#0080C1';

/** Centavos → texto. La UI lo pinta con Fira Sans y `font-variant-numeric: tabular-nums`. */
export function formatearDinero(centavos: number, moneda: Moneda = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda }).format(centavos / 100);
}

/* ─────────────── pesos → centavos ───────────────
 * Esta conversión se hace SIN multiplicar por 100. `1500.5 * 100` no da
 * 150050 por suerte, da 150049.99999999999 por accidente, y `Math.round` lo
 * tapa casi siempre — casi. Con `1.005 * 100` sale 100.49999999999999 y el
 * redondeo se va para abajo: un centavo perdido, en silencio, dentro de un
 * número que ya nadie va a volver a mirar.
 *
 * Así que el número se lee como texto, se parte en el punto y se cuentan los
 * dígitos. Los decimales que sobran redondean al centavo más cercano, y medio
 * centavo sube. Que hubo redondeo se devuelve dicho, porque en una migración
 * redondear dinero sin avisar es peor que no convertirlo. */

export interface Centavos {
  ok: boolean;
  /** Entero. Vale 0 cuando `ok` es falso: no se usa. */
  centavos: number;
  /** Había dígitos más allá del centavo y se tuvo que redondear. */
  redondeo: boolean;
  /** El campo venía vacío o nulo. Se cuenta como 0, pero se sabe que faltaba. */
  vacio: boolean;
  /** Por qué no se pudo convertir. */
  motivo?: string;
}

/** Un número en notación exponencial, escrito con todos sus dígitos.
 *  `String(1.5e-7)` es '1.5e-7' y ahí no hay dónde poner el punto decimal. */
function sinExponente(n: number): string {
  const s = String(n);
  if (!/e/i.test(s)) return s;
  const [mantisa, potencia] = s.split(/e/i);
  const exp = Number(potencia);
  const negativo = mantisa.startsWith('-');
  const [entero, decimales = ''] = mantisa.replace('-', '').split('.');
  const digitos = entero + decimales;
  const punto = entero.length + exp;
  let salida: string;
  if (punto <= 0) salida = '0.' + '0'.repeat(-punto) + digitos;
  else if (punto >= digitos.length) salida = digitos + '0'.repeat(punto - digitos.length);
  else salida = digitos.slice(0, punto) + '.' + digitos.slice(punto);
  return (negativo ? '-' : '') + salida;
}

/** Pesos (número o texto) → centavos enteros. `'1,500.50'` → `150050`. */
export function aCentavosExacto(valor: unknown): Centavos {
  const nada: Centavos = { ok: true, centavos: 0, redondeo: false, vacio: true };
  if (valor === null || valor === undefined || valor === '') return nada;
  if (typeof valor === 'boolean') {
    return { ok: false, centavos: 0, redondeo: false, vacio: false, motivo: 'un booleano no es dinero' };
  }

  let texto: string;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) {
      return { ok: false, centavos: 0, redondeo: false, vacio: false, motivo: `no es un número finito: ${valor}` };
    }
    texto = sinExponente(valor);
  } else {
    // Se le quitan símbolo de moneda, separadores de millar y espacios (los
    // duros también: los pega Excel al copiar).
    texto = String(valor).replace(/[\s\u00a0$,]/g, '');
    if (texto === '') return nada;
  }

  if (!/^[+-]?\d*(\.\d*)?$/.test(texto) || !/\d/.test(texto)) {
    return { ok: false, centavos: 0, redondeo: false, vacio: false, motivo: `no parece un número: ${String(valor)}` };
  }

  const negativo = texto.startsWith('-');
  const limpio = texto.replace(/^[+-]/, '');
  const [entero = '', decimales = ''] = limpio.split('.');
  if (entero.length > 13) {
    return { ok: false, centavos: 0, redondeo: false, vacio: false, motivo: 'demasiados dígitos para un entero exacto' };
  }

  const dosDecimales = (decimales + '00').slice(0, 2);
  const sobra = decimales.slice(2);
  let centavos = Number(entero || '0') * 100 + Number(dosDecimales);
  // Medio centavo sube, y en los negativos sube en valor absoluto: -1.005 es
  // -101, no -100. Redondear hacia cero de un lado y no del otro descuadraría
  // una transferencia consigo misma.
  if (sobra && sobra[0] >= '5') centavos += 1;

  return {
    ok: true,
    centavos: negativo ? -centavos : centavos,
    redondeo: /[1-9]/.test(sobra),
    vacio: false,
  };
}

/** Texto tecleado → centavos enteros. '1,500.50' → 150050. */
export function aCentavos(texto: string | number): number {
  return aCentavosExacto(texto).centavos;
}

/** minúsculas sin acentos — para `nombre_norm` y para el autocompletar. */
export function normalizar(txt: string): string {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
