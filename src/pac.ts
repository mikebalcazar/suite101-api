/* bill101 fase C — Facturama, el PAC que timbra. Contrato 0.88.0.
 *
 * Mike, 8-oct-2026, con botones: timbrar con Facturama por API; v1 emite
 * factura de Ingreso y la cancela; todo de contado (PUE).
 *
 * Dos mitades, separadas a propósito:
 *   · ARMAR: de un borrador en centavos (lo que la pantalla manda) a lo que
 *     Facturama espera (pesos con decimales, nombres en inglés), con las
 *     cuentas hechas en entero y la revisión de lo que el SAT exige. Sin
 *     red: se mide sola (pruebas/timbrar.spec.ts).
 *   · HABLAR: cuatro llamadas a su API (timbrar, bajar XML o PDF, cancelar,
 *     perfil). El `fetch` entra por parámetro para probarlas contra un
 *     Facturama de mentira.
 *
 * De dónde sale el contrato: la documentación pública de Facturama
 * (facturama.mx/docs, api.facturama.mx/docs/api) y su SDK oficial de PHP,
 * leídos el 9-oct-2026. Sandbox: apisandbox.facturama.mx (timbres sin
 * valor). Producción: api.facturama.mx. Misma cuenta de usuario y
 * contraseña del portal, en HTTP Basic.
 */

import { Buffer } from 'node:buffer';

export const FACTURAMA_SANDBOX = 'https://apisandbox.facturama.mx';
export const FACTURAMA_PRODUCCION = 'https://api.facturama.mx';

export type FallaPac = { error: string; detalle?: Record<string, unknown> };
export const esFallaPac = (r: unknown): r is FallaPac => !!r && typeof r === 'object' && typeof (r as { error?: unknown }).error === 'string';

/* ─────────────── el borrador ─────────────── */

export interface RenglonBorrador {
  /** Clave del catálogo de productos y servicios del SAT (8 dígitos). */
  clave_prod_serv: string;
  /** Clave de unidad del SAT (H87 pieza, E48 servicio, MTK m², …). */
  clave_unidad: string;
  unidad?: string | null;
  descripcion: string;
  cantidad: number;
  /** Centavos. */
  precio_unitario: number;
  /** Centavos, por el renglón completo. */
  descuento?: number;
  /** 16 = IVA al 16 %; 0 = tasa cero; null = no objeto de impuesto. */
  iva: 16 | 0 | null;
}

export interface Borrador {
  receptor: {
    rfc: string;
    /** Como está en la constancia, sin «S.A. de C.V.». */
    razon_social: string;
    regimen_fiscal: string;
    cp_fiscal: string;
    uso_cfdi: string;
  };
  forma_pago: string;
  renglones: RenglonBorrador[];
  condiciones?: string | null;
  observaciones?: string | null;
  orden?: string | null;
}

/** Las cuentas del borrador, en centavos. Una por renglón y el total. */
export interface Cuenta {
  renglones: { importe: number; descuento: number; base: number; iva: number; total: number }[];
  subtotal: number;
  descuento: number;
  iva: number;
  total: number;
}

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
export const USOS = new Set(['G01', 'G02', 'G03', 'I01', 'I02', 'I03', 'I04', 'I05', 'I06', 'I07', 'I08', 'D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10', 'S01', 'CP01', 'CN01']);
export const REGIMENES = new Set(['601', '603', '605', '606', '607', '608', '610', '611', '612', '614', '615', '616', '620', '621', '622', '623', '624', '625', '626']);
export const FORMAS_PAGO = new Set(['01', '02', '03', '04', '05', '06', '08', '12', '13', '14', '15', '17', '23', '24', '25', '26', '27', '28', '29', '30', '31', '99']);
const TOPE_RENGLONES = 100;

const redondea = (x: number): number => Math.round(x);

/** Cuenta en entero lo que luego va en pesos. El IVA se calcula por renglón
 *  sobre su base (importe menos descuento), como lo hace el SAT. */
export function cuentas(renglones: RenglonBorrador[]): Cuenta {
  const filas = renglones.map((r) => {
    const importe = redondea(r.cantidad * r.precio_unitario);
    const descuento = Math.max(0, Math.trunc(r.descuento ?? 0));
    const base = importe - descuento;
    const iva = r.iva === 16 ? redondea(base * 0.16) : 0;
    return { importe, descuento, base, iva, total: base + iva };
  });
  const suma = (k: 'importe' | 'descuento' | 'iva' | 'total') => filas.reduce((s, f) => s + f[k], 0);
  return { renglones: filas, subtotal: suma('importe'), descuento: suma('descuento'), iva: suma('iva'), total: suma('total') };
}

/** Lo que el SAT y Facturama van a rechazar, dicho antes de llamar. Devuelve
 *  el borrador limpio (mayúsculas, sin espacios de más) o la primera falla. */
export function revisarBorrador(b: unknown): Borrador | FallaPac {
  const mal = (campo: string, motivo: string): FallaPac => ({ error: 'borrador_invalido', detalle: { campo, motivo } });
  if (!b || typeof b !== 'object') return mal('', 'no es un borrador');
  const d = b as Record<string, any>;
  const r = d.receptor;
  if (!r || typeof r !== 'object') return mal('receptor', 'falta a quién se le factura');
  const rfc = String(r.rfc ?? '').toUpperCase().replace(/[\s.-]/g, '');
  if (!RFC.test(rfc)) return mal('receptor.rfc', 'el RFC no tiene forma de RFC (12 letras y números para una empresa, 13 para una persona)');
  const razon = String(r.razon_social ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (razon.length < 3) return mal('receptor.razon_social', 'falta el nombre o razón social, como está en la constancia');
  if (/\b(S\.?A\.?|S\.? ?DE ?R\.?L\.?|S\.?C\.?|S\.?A\.?P\.?I\.?)\b.*\b(DE ?C\.?V\.?|C\.?V\.?)\b/.test(razon) || /\bS\.?A\.? ?DE ?C\.?V\.?$/.test(razon)) {
    return mal('receptor.razon_social', 'desde la versión 4.0 el nombre va SIN el régimen de capital («S.A. de C.V.»)');
  }
  const regimen = String(r.regimen_fiscal ?? '').trim();
  if (!REGIMENES.has(regimen)) return mal('receptor.regimen_fiscal', 'el régimen fiscal es la clave de tres dígitos del SAT (601, 612, 626…)');
  const cp = String(r.cp_fiscal ?? '').trim();
  if (!/^\d{5}$/.test(cp)) return mal('receptor.cp_fiscal', 'el código postal fiscal son cinco dígitos, el de la constancia');
  const uso = String(r.uso_cfdi ?? '').trim().toUpperCase();
  if (!USOS.has(uso)) return mal('receptor.uso_cfdi', 'el uso del CFDI es una clave del SAT (G03 gastos en general, I01…)');
  if (rfc.length === 12 && /^6(05|06|08|10|11|12|14|15|16|21|25)$/.test(regimen)) return mal('receptor.regimen_fiscal', 'ese régimen es de persona física y el RFC es de una empresa');
  if (rfc.length === 13 && /^(601|603|620|622|623|624)$/.test(regimen)) return mal('receptor.regimen_fiscal', 'ese régimen es de empresa y el RFC es de una persona');
  const forma = String(d.forma_pago ?? '').trim();
  if (!FORMAS_PAGO.has(forma)) return mal('forma_pago', 'la forma de pago es una clave del SAT (01 efectivo, 03 transferencia, 04 tarjeta de crédito…)');
  if (forma === '99') return mal('forma_pago', 'una factura de contado (PUE) no puede llevar forma «99 por definir»');
  const lista = Array.isArray(d.renglones) ? d.renglones : [];
  if (!lista.length) return mal('renglones', 'una factura lleva al menos un renglón');
  if (lista.length > TOPE_RENGLONES) return mal('renglones', `no más de ${TOPE_RENGLONES} renglones`);
  const renglones: RenglonBorrador[] = [];
  for (let i = 0; i < lista.length; i++) {
    const x = lista[i] ?? {};
    const donde = `renglones[${i}]`;
    const clave = String(x.clave_prod_serv ?? '').trim();
    if (!/^\d{8}$/.test(clave)) return mal(`${donde}.clave_prod_serv`, 'la clave de producto o servicio del SAT son ocho dígitos (por ejemplo 56101700, muebles)');
    const unidad = String(x.clave_unidad ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,3}$/.test(unidad)) return mal(`${donde}.clave_unidad`, 'la clave de unidad del SAT son dos o tres letras (H87 pieza, E48 servicio, MTK metro cuadrado)');
    const descripcion = String(x.descripcion ?? '').trim().replace(/\s+/g, ' ');
    if (descripcion.length < 1 || descripcion.length > 1000) return mal(`${donde}.descripcion`, 'falta la descripción (hasta 1,000 letras)');
    // Hasta seis decimales, que es lo que el SAT admite; más se redondea aquí y no allá.
    const cantidad = Math.round(Number(x.cantidad) * 1e6) / 1e6;
    if (!(cantidad > 0) || cantidad > 1_000_000) return mal(`${donde}.cantidad`, 'la cantidad es un número mayor que cero (hasta seis decimales)');
    const precio = Number(x.precio_unitario);
    if (!Number.isInteger(precio) || precio < 0 || precio > 1_000_000_000_00) return mal(`${donde}.precio_unitario`, 'el precio va en centavos enteros');
    const descuento = x.descuento === undefined || x.descuento === null ? 0 : Number(x.descuento);
    if (!Number.isInteger(descuento) || descuento < 0) return mal(`${donde}.descuento`, 'el descuento va en centavos enteros, sin signo');
    if (redondea(cantidad * precio) > 1e15) return mal(`${donde}.precio_unitario`, 'ese importe no cabe en una factura');
    if (descuento > redondea(cantidad * precio)) return mal(`${donde}.descuento`, 'el descuento no puede ser mayor que el importe del renglón');
    const iva = x.iva === null || x.iva === 'no_objeto' ? null : Number(x.iva);
    if (iva !== null && iva !== 16 && iva !== 0) return mal(`${donde}.iva`, 'el IVA es 16, 0 (tasa cero) o nulo (no objeto)');
    renglones.push({ clave_prod_serv: clave, clave_unidad: unidad, unidad: x.unidad ? String(x.unidad).trim().slice(0, 20) : null, descripcion, cantidad, precio_unitario: precio, descuento, iva: iva as 16 | 0 | null });
  }
  const c = cuentas(renglones);
  if (c.total <= 0) return mal('renglones', 'el total de la factura tiene que ser mayor que cero');
  const texto = (v: unknown, tope: number) => (v === undefined || v === null ? null : String(v).trim().slice(0, tope) || null);
  return {
    receptor: { rfc, razon_social: razon, regimen_fiscal: regimen, cp_fiscal: cp, uso_cfdi: uso },
    forma_pago: forma, renglones,
    condiciones: texto(d.condiciones, 100), observaciones: texto(d.observaciones, 1000), orden: texto(d.orden, 50),
  };
}

const pesos = (centavos: number): number => Math.round(centavos) / 100;

/** Lo que se le manda a Facturama (POST /3/cfdis). `fecha` es la hora del
 *  centro de México sin zona, como la pide el SAT. */
export function cuerpoFacturama(b: Borrador, a: { serie: string; folio: number; fecha: string; lugar_expedicion: string }): Record<string, unknown> {
  const c = cuentas(b.renglones);
  return {
    Serie: a.serie,
    Folio: String(a.folio),
    Date: a.fecha,
    Currency: 'MXN',
    CfdiType: 'I',
    PaymentForm: b.forma_pago,
    PaymentMethod: 'PUE',
    ExpeditionPlace: a.lugar_expedicion,
    Exportation: '01',
    ...(b.condiciones ? { PaymentConditions: b.condiciones } : {}),
    ...(b.observaciones ? { Observations: b.observaciones } : {}),
    ...(b.orden ? { OrderNumber: b.orden } : {}),
    Receiver: { Rfc: b.receptor.rfc, Name: b.receptor.razon_social, CfdiUse: b.receptor.uso_cfdi, FiscalRegime: b.receptor.regimen_fiscal, TaxZipCode: b.receptor.cp_fiscal },
    Items: b.renglones.map((r, i) => {
      const k = c.renglones[i];
      const item: Record<string, unknown> = {
        ProductCode: r.clave_prod_serv,
        UnitCode: r.clave_unidad,
        Unit: r.unidad || r.clave_unidad,
        Description: r.descripcion,
        Quantity: r.cantidad,
        UnitPrice: pesos(r.precio_unitario),
        Subtotal: pesos(k.importe),
        ...(k.descuento ? { Discount: pesos(k.descuento) } : {}),
        TaxObject: r.iva === null ? '01' : '02',
        Total: pesos(k.total),
      };
      if (r.iva !== null) item.Taxes = [{ Name: 'IVA', Rate: r.iva / 100, Base: pesos(k.base), Total: pesos(k.iva), IsRetention: false, IsFederalTax: true }];
      return item;
    }),
  };
}

/* ─────────────── hablar con Facturama ─────────────── */

export interface Cuenta_ { usuario: string; clave: string; sandbox: boolean }
export interface Ventanilla { traer: typeof fetch; base?: string; topeMs?: number }

export interface Timbrada {
  pac_id: string;
  uuid: string;
  serie: string | null;
  folio: string | null;
  fecha: string;
  fecha_timbrado: string | null;
  total: number;
  rfc_emisor: string;
  rfc_receptor: string;
}

export interface Perfil {
  rfc: string | null;
  nombre: string | null;
  regimen: string | null;
  cp: string | null;
  /** Que Facturama tiene el sello (CSD) cargado: sin él no timbra. */
  csd: boolean;
}

export interface Cancelada {
  estado: 'cancelada' | 'pendiente' | 'vigente';
  mensaje: string | null;
  acuse_b64: string | null;
}

export interface Archivo { tipo: string; bytes: Uint8Array }

const baseDe = (c: Cuenta_, v: Ventanilla): string => v.base ?? (c.sandbox ? FACTURAMA_SANDBOX : FACTURAMA_PRODUCCION);

/** Lo que Facturama contesta cuando dice que no: `Message` y, en un 400, un
 *  `ModelState` con el campo y el porqué. Se junta en una lista de frases. */
function frases(cuerpo: unknown): string[] {
  const out: string[] = [];
  if (cuerpo && typeof cuerpo === 'object') {
    const o = cuerpo as Record<string, unknown>;
    if (typeof o.Message === 'string' && o.Message) out.push(o.Message);
    const ms = o.ModelState;
    if (ms && typeof ms === 'object') {
      for (const [campo, v] of Object.entries(ms as Record<string, unknown>)) {
        const lista = Array.isArray(v) ? v : [v];
        for (const m of lista) if (typeof m === 'string' && m) out.push(`${campo.replace(/^cfdiToCreate\./, '')}: ${m}`);
      }
    }
    if (typeof o.ExceptionMessage === 'string' && !out.length) out.push(o.ExceptionMessage);
  } else if (typeof cuerpo === 'string' && cuerpo.trim()) out.push(cuerpo.trim().slice(0, 300));
  return out.slice(0, 12).map((s) => s.slice(0, 400));
}

async function llamar(c: Cuenta_, v: Ventanilla, paso: string, metodo: string, ruta: string, cuerpo?: unknown): Promise<{ estado: number; json: unknown } | FallaPac> {
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${c.usuario}:${c.clave}`).toString('base64')}`,
    Accept: 'application/json',
  };
  if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
  let r: Response;
  let texto: string;
  try {
    r = await v.traer(baseDe(c, v) + ruta, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: AbortSignal.timeout(v.topeMs ?? 30_000) });
    texto = await r.text();
  } catch (e) {
    return { error: 'pac_no_responde', detalle: { paso, motivo: e instanceof Error ? e.name : 'error' } };
  }
  let json: unknown = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { json = texto; }
  if (r.status === 401 || r.status === 403) return { error: 'pac_credenciales', detalle: { paso, http: r.status, motivo: 'Facturama no acepta el usuario y la contraseña' } };
  if (r.status >= 500) return { error: 'pac_no_responde', detalle: { paso, http: r.status, motivos: frases(json) } };
  if (!r.ok) return { error: 'pac_rechaza', detalle: { paso, http: r.status, motivos: frases(json) } };
  return { estado: r.status, json };
}

const texto = (o: Record<string, unknown>, k: string): string | null => (typeof o[k] === 'string' && (o[k] as string) ? (o[k] as string) : null);

export async function timbrar(c: Cuenta_, v: Ventanilla, cuerpo: Record<string, unknown>): Promise<Timbrada | FallaPac> {
  const r = await llamar(c, v, 'timbrar', 'POST', '/3/cfdis', cuerpo);
  if (esFallaPac(r)) return r;
  const o = (r.json ?? {}) as Record<string, unknown>;
  const sello = ((o.Complement as Record<string, unknown> | undefined)?.TaxStamp ?? {}) as Record<string, unknown>;
  const uuid = String(sello.Uuid ?? '').toUpperCase();
  const pac_id = texto(o, 'Id');
  if (!pac_id || !/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(uuid)) {
    return { error: 'pac_respuesta_rara', detalle: { paso: 'timbrar', motivo: 'Facturama contestó sin folio fiscal', vino: Object.keys(o).slice(0, 20) } };
  }
  return {
    pac_id, uuid,
    serie: texto(o, 'Serie'), folio: texto(o, 'Folio'),
    fecha: texto(o, 'Date') ?? '', fecha_timbrado: texto(sello, 'Date'),
    total: Math.round(Number(o.Total ?? 0) * 100),
    rfc_emisor: String(((o.Issuer as Record<string, unknown>) ?? {}).Rfc ?? '').toUpperCase(),
    rfc_receptor: String(((o.Receiver as Record<string, unknown>) ?? {}).Rfc ?? '').toUpperCase(),
  };
}

/** El archivo de una factura emitida: `xml` o `pdf`. Facturama lo da en base64. */
export async function bajar(c: Cuenta_, v: Ventanilla, pac_id: string, formato: 'xml' | 'pdf'): Promise<Archivo | FallaPac> {
  const r = await llamar(c, v, `bajar_${formato}`, 'GET', `/cfdi/${formato}/issued/${encodeURIComponent(pac_id)}`);
  if (esFallaPac(r)) return r;
  const o = (r.json ?? {}) as Record<string, unknown>;
  const contenido = texto(o, 'Content');
  if (!contenido) return { error: 'pac_respuesta_rara', detalle: { paso: `bajar_${formato}`, motivo: 'Facturama contestó sin archivo' } };
  const bytes = new Uint8Array(Buffer.from(contenido, (texto(o, 'ContentEncoding') ?? 'base64') as BufferEncoding));
  return { tipo: formato === 'xml' ? 'application/xml' : 'application/pdf', bytes };
}

export const MOTIVOS_CANCELACION: Record<string, string> = {
  '01': 'Comprobante emitido con errores con relación (se sustituye por otro)',
  '02': 'Comprobante emitido con errores sin relación',
  '03': 'No se llevó a cabo la operación',
  '04': 'Operación nominativa relacionada en una factura global',
};

export async function cancelar(c: Cuenta_, v: Ventanilla, pac_id: string, motivo: string, uuid_sustituto?: string | null): Promise<Cancelada | FallaPac> {
  const q = new URLSearchParams({ type: 'issued', motive: motivo });
  if (motivo === '01' && uuid_sustituto) q.set('uuidReplacement', uuid_sustituto);
  const r = await llamar(c, v, 'cancelar', 'DELETE', `/cfdi/${encodeURIComponent(pac_id)}?${q}`);
  if (esFallaPac(r)) return r;
  const o = (r.json ?? {}) as Record<string, unknown>;
  const s = String(o.Status ?? '').toLowerCase();
  if (!['canceled', 'cancelled', 'pending', 'active'].includes(s)) return { error: 'pac_respuesta_rara', detalle: { paso: 'cancelar', motivo: 'Facturama contestó un estado que no se conoce', estado: s.slice(0, 40) } };
  const estado: Cancelada['estado'] = s === 'canceled' || s === 'cancelled' ? 'cancelada' : s === 'pending' ? 'pendiente' : 'vigente';
  return { estado, mensaje: texto(o, 'AcuseStatusDetails') ?? texto(o, 'Message'), acuse_b64: texto(o, 'AcuseXmlBase64') };
}

/** Facturama exige que la serie exista en la sucursal de la cuenta («El
 *  atributo 'Serie' debe existir en la sucursal»: lo dijo el 9-oct en la
 *  primera prueba real de Mike). Aquí se asegura: se busca la sucursal (la
 *  predeterminada, o la primera) y, si la serie no está, se da de alta con
 *  el folio que sigue. Devuelve si tuvo que crearla. */
export async function asegurarSerie(c: Cuenta_, v: Ventanilla, serie: string, folio: number): Promise<{ creada: boolean; sucursal: string; cp: string | null } | FallaPac> {
  const s = await llamar(c, v, 'sucursales', 'GET', '/BranchOffice');
  if (esFallaPac(s)) return s;
  const lista = Array.isArray(s.json) ? (s.json as Record<string, unknown>[]) : [];
  const sucursal = lista.find((x) => x.IsDefault === true) ?? lista[0];
  const id = sucursal ? texto(sucursal, 'Id') : null;
  if (!id) return { error: 'pac_sin_sucursal', detalle: { paso: 'sucursales', motivo: 'la cuenta de Facturama no tiene ninguna sucursal (lugar de expedición); se crea en su portal' } };
  // El lugar de expedición de la factura TIENE que ser el CP de esa sucursal (lo dijo Facturama el 9-oct).
  const cp = texto((sucursal!.Address ?? {}) as Record<string, unknown>, 'ZipCode');
  const l = await llamar(c, v, 'series', 'GET', `/serie/${encodeURIComponent(id)}`);
  if (esFallaPac(l)) return l;
  const series = Array.isArray(l.json) ? (l.json as Record<string, unknown>[]) : [];
  if (series.some((x) => String(x.Name ?? '').toUpperCase() === serie.toUpperCase())) return { creada: false, sucursal: id, cp };
  const r = await llamar(c, v, 'crear_serie', 'POST', `/serie/${encodeURIComponent(id)}`, { IdBranchOffice: id, Name: serie, Description: `Serie ${serie} (bill101)`, Folio: folio });
  if (esFallaPac(r)) return r;
  return { creada: true, sucursal: id, cp };
}

/** Buscar en Facturama una factura emitida por su serie y folio: para saber
 *  si una emisión que se quedó sin respuesta de verdad se timbró. */
export async function buscarPorFolio(c: Cuenta_, v: Ventanilla, serie: string, folio: number): Promise<{ pac_id: string; uuid: string | null } | null | FallaPac> {
  const q = new URLSearchParams({ type: 'issued', keyword: String(folio), status: 'all', page: '0' });
  const r = await llamar(c, v, 'buscar', 'GET', `/cfdi?${q}`);
  if (esFallaPac(r)) return r;
  const lista = Array.isArray(r.json) ? (r.json as Record<string, unknown>[]) : [];
  const f = lista.find((x) => String(x.Folio ?? '') === String(folio) && String(x.Serie ?? '') === serie && String(x.Status ?? 'active').toLowerCase() !== 'deleted');
  if (!f) return null;
  const pac_id = texto(f, 'Id');
  if (!pac_id) return null;
  return { pac_id, uuid: texto(f, 'Uuid')?.toUpperCase() ?? null };
}

/** El perfil fiscal de la cuenta en Facturama: de quién es y si ya tiene el
 *  sello. Es lo primero que se mira al guardar la cuenta. */
export async function perfil(c: Cuenta_, v: Ventanilla): Promise<Perfil | FallaPac> {
  const r = await llamar(c, v, 'perfil', 'GET', '/TaxEntity');
  if (esFallaPac(r)) return r;
  const o = (r.json ?? {}) as Record<string, unknown>;
  const csd = (o.Csd ?? {}) as Record<string, unknown>;
  const dir = (o.TaxAddress ?? {}) as Record<string, unknown>;
  const nombre = o.TaxName;
  return {
    rfc: texto(o, 'Rfc')?.toUpperCase() ?? null,
    nombre: typeof nombre === 'string' ? nombre : (nombre && typeof nombre === 'object' ? texto(nombre as Record<string, unknown>, 'Name') ?? texto(nombre as Record<string, unknown>, 'TaxName') : null),
    regimen: texto(o, 'FiscalRegime')?.slice(0, 3) ?? null,
    cp: texto(dir, 'ZipCode'),
    csd: !!(texto(csd, 'Certificate') || texto(csd, 'CertificateNumber') || csd.Loaded === true),
  };
}
