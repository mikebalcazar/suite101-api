/* De los documentos crudos de Firestore a las filas del OrgDB.
 *
 * Aquí no hay red ni base de datos: entran los documentos tal como los leyó el
 * navegador y salen filas. Eso lo hace medible sin desplegar nada, que es todo
 * el punto de tenerlo en un archivo aparte.
 *
 * Por qué el navegador no traduce nada y manda el documento crudo: si el
 * mapeo viviera en la página, el único código que decide qué es dinero y qué
 * fecha estaría fuera de las pruebas. La página solo tiene la sesión de
 * Firebase; la cabeza está aquí.
 *
 * Tres cosas que este archivo hace y conviene tener presentes:
 *
 *   1. El dinero de Firestore viene en PESOS con decimales. Aquí se vuelve
 *      centavos enteros con `aCentavosExacto`, y cada redondeo se apunta.
 *   2. Los cachés NO se importan (`precio_venta`, `cobrado`, `pagado`,
 *      `productos[].pagado`, `partidas[].monto_pagado`, `saldo_actual`). Los
 *      recalcula la API desde los movimientos. Importar un caché es importar
 *      una opinión.
 *   3. No se inventa historial. `avances` sale vacío: en Firestore nunca
 *      existió, y una fecha de etapa falsa es peor que ninguna (encargo §2).
 */

import { aCentavosExacto, type Tabla } from '../../schema/tipos';

export type Crudo = Record<string, unknown>;
export type Fila = Record<string, unknown>;

export interface Rechazo {
  coleccion: string;
  id: string;
  campo?: string;
  motivo: string;
}

export interface Redondeo {
  coleccion: string;
  id: string;
  campo: string;
  /** El valor crudo que se redondeó, tal como venía: por PIEZA cuando el
   *  renglón trae cantidad. Multiplicarlo aquí haría que la nota mintiera —
   *  «40.02 pesos se volvieron 4004 centavos» parece un error de dos centavos,
   *  cuando lo que pasó es que cada una de las cuatro piezas se redondeó de
   *  10.005 a 1001—. */
  origen: string;
  /** Por cuántas piezas se multiplicó. 1 cuando el renglón no tiene cantidad. */
  veces: number;
  /** El total del renglón ya en centavos: `redondeo(origen) × veces`. */
  centavos: number;
}

export interface UsuarioImportado {
  /** El uid de Firebase. Se conserva: es lo que liga `clientes.usuario_id`. */
  id: string;
  correo: string;
  nombre: string | null;
  /** Miembro de la org (socios y oficina). */
  miembro?: { rol: 'owner' | 'admin' | 'socio' | 'staff'; negocios: string[] };
  /** Acceso de cliente al portal (peek101). */
  acceso?: { tipo: 'cliente' | 'personal'; ref_id: string };
  de: 'usuarios' | 'clientes';
}

export interface Cosecha {
  filas: Partial<Record<Tabla, Fila[]>>;
  usuarios: UsuarioImportado[];
  rechazos: Rechazo[];
  redondeos: Redondeo[];
  /** Cuántos documentos traía cada colección del JSON. */
  leidos: Record<string, number>;
  /** Campos del documento crudo que ninguna columna recibe. Se dicen para que
   *  nadie descubra dentro de un año que algo se perdió sin ruido. */
  ignorados: Record<string, string[]>;
  /** Suma en centavos por `tabla.campo`, de las filas que sí entraron. */
  sumas: Record<string, number>;
  /** La misma suma en los pesos crudos de Firestore, con flotantes. Es contra
   *  esto que se mira si la conversión perdió o ganó centavos. */
  sumas_origen: Record<string, number>;
  /** Lo que hay que saber ANTES de apagar Firebase. Ver `cotizador` abajo. */
  avisos: Avisos;
}

/** Cuentas de la mudanza de quote101 que no son filas ni dinero, y que deciden
 *  si se puede apagar Firebase o no. Se cuentan aquí porque el ensayo tiene que
 *  poder decirlas sin escribir nada. */
export interface Avisos {
  /** Cotizaciones que traían folio de antes. Se conserva tal cual: puede andar
   *  impreso en el PDF que el cliente ya tiene. */
  folios_traidos: number;
  /** Cotizaciones sin folio. A ésas se les pone uno al importar, en orden de
   *  fecha, y el contador queda después del último. */
  sin_folio: number;
  /** Versiones históricas cuyo detalle NO viaja en el documento: vive en un
   *  archivo de Firebase Storage (`historicoURL`). La cotización se importa,
   *  pero ese detalle se queda allá. **Apagar Firebase lo mata.** */
  versiones_en_storage: number;
  /** Imágenes de muebles que son una URL de Firebase Storage. Igual: apagar
   *  Firebase las mata. Se mudan a R2 en su propio paso. */
  imagenes_en_storage: number;
  /** Imágenes que todavía son base64 dentro del documento. Ésas sí viajan. */
  imagenes_en_el_documento: number;
  /** Versiones por cotización, para ver de un golpe si alguna trae historia
   *  larga: [cotizaciones con 1 versión, con 2, con 3 o más]. */
  versiones_por_cotizacion: Record<string, number>;
}

/* ─────────────── fechas ───────────────
 * De Firestore puede llegar un Timestamp serializado ({seconds,nanoseconds} o
 * {_seconds,_nanoseconds}), una cadena ISO, un 'YYYY-MM-DD' o un número de
 * milisegundos. Todo sale como texto ISO 8601 UTC, que es lo que dice §3. */

export function aISO(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();

  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const seg = (o.seconds ?? o._seconds) as number | undefined;
    const nan = (o.nanoseconds ?? o._nanoseconds ?? 0) as number;
    if (typeof seg === 'number' && Number.isFinite(seg)) {
      return new Date(seg * 1000 + Math.floor(nan / 1e6)).toISOString();
    }
    return null;
  }

  if (typeof v === 'number') {
    // Segundos o milisegundos: por debajo del año 2286 en milisegundos no hay
    // fechas de taller, así que el corte por magnitud es seguro.
    const ms = v > 1e11 ? v : v * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const texto = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return `${texto}T00:00:00.000Z`;
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Igual, pero recortado al día: `fecha`, `fecha_entrega`, `vigencia`… Un
 *  movimiento pasa el 9 de septiembre, no a las 06:00 UTC del 9. */
export function aDia(v: unknown): string | null {
  const iso = aISO(v);
  return iso ? iso.slice(0, 10) : null;
}

const texto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const correo = (v: unknown): string | null => {
  const s = texto(v);
  return s ? s.toLowerCase() : null;
};

/* ─────────────── el recolector ───────────────
 * Lleva la cuenta mientras traduce: rechazos, redondeos, sumas y campos que
 * nadie recibió. Sin esto el import podría salir «bien» y haber perdido cosas.
 */

/** Una conversión de dinero hecha pero todavía no contada: si la fila acaba
 *  rechazada por otra cosa, su plata no debe aparecer en ninguna suma. */
interface Pendiente {
  coleccion: string;
  llave: string;
  id: string;
  campo: string;
  /** Crudo POR PIEZA, sin multiplicar. */
  crudo: unknown;
  veces: number;
  /** Ya multiplicado por `veces`. */
  centavos: number;
  redondeo: boolean;
}

class Cesta {
  filas: Partial<Record<Tabla, Fila[]>> = {};
  usuarios: UsuarioImportado[] = [];
  rechazos: Rechazo[] = [];
  redondeos: Redondeo[] = [];
  leidos: Record<string, number> = {};
  ignorados: Record<string, Set<string>> = {};
  sumas: Record<string, number> = {};
  /** La misma suma, pero en los pesos crudos de Firestore y con aritmética de
   *  flotantes: es contra esto que se compara para ver si la conversión perdió
   *  o ganó centavos. */
  sumasOrigen: Record<string, number> = {};
  avisos: Avisos = {
    folios_traidos: 0, sin_folio: 0, versiones_en_storage: 0,
    imagenes_en_storage: 0, imagenes_en_el_documento: 0, versiones_por_cotizacion: {},
  };

  pon(tabla: Tabla, fila: Fila, plata: Pendiente[] = []): void {
    (this.filas[tabla] ??= []).push(fila);
    this.cobra(plata);
  }

  /** Se cuenta la plata solo cuando la fila entra de verdad. */
  cobra(plata: Pendiente[]): void {
    for (const p of plata) {
      this.sumas[p.llave] = (this.sumas[p.llave] ?? 0) + p.centavos;
      // La suma en pesos se multiplica igual que la de centavos: es contra
      // ella que se compara lo escrito, y comparar un precio por pieza contra
      // un total de renglón daría «no cuadra» sin que nada estuviera mal.
      this.sumasOrigen[p.llave] = (this.sumasOrigen[p.llave] ?? 0) + Number(p.crudo || 0) * p.veces;
      if (p.redondeo) {
        this.redondeos.push({
          coleccion: p.coleccion, id: p.id, campo: p.campo,
          origen: String(p.crudo), veces: p.veces, centavos: p.centavos,
        });
      }
    }
  }

  rechaza(coleccion: string, id: string, motivo: string, campo?: string): void {
    this.rechazos.push({ coleccion, id, motivo, campo });
  }

  /** Pesos del crudo → centavos. Queda pendiente de contar hasta que la fila
   *  se guarde con `pon`.
   *
   *  `veces` es para los renglones con cantidad: un mueble trae precio por
   *  pieza y `qty`. Se convierte a centavos y se multiplica DESPUÉS, en
   *  enteros, nunca `precio * qty` en flotantes —`1.005 * 3` da
   *  3.0149999999999997 y ahí se va un centavo—. Y lo que se apunta en las
   *  sumas es ya el multiplicado: si se apuntara el precio por pieza, el
   *  cuadre compararía una cifra contra otra que nunca se escribió. */
  dinero(
    plata: Pendiente[], coleccion: string, tabla: Tabla | null, campo: string,
    id: string, valor: unknown, veces = 1,
  ): number | null {
    const r = aCentavosExacto(valor);
    if (!r.ok) {
      this.rechaza(coleccion, id, r.motivo ?? 'dinero ilegible', campo);
      return null;
    }
    const crudo = typeof valor === 'string' ? Number(valor.replace(/[\s\u00a0$,]/g, '')) || 0 : Number(valor ?? 0);
    plata.push({
      coleccion, llave: `${tabla ?? coleccion}.${campo}`, id, campo,
      crudo, veces,
      centavos: r.centavos * veces, redondeo: r.redondeo,
    });
    return r.centavos * veces;
  }

  /** Los campos del documento que ninguna columna recogió. */
  sobrantes(coleccion: string, doc: Crudo, usados: string[]): void {
    const set = (this.ignorados[coleccion] ??= new Set());
    for (const k of Object.keys(doc)) if (!usados.includes(k)) set.add(k);
  }

  /** Un campo que `sobrantes` ya apuntó como ignorado pero que al final sí se usó. */
  usado(coleccion: string, campo: string): void {
    this.ignorados[coleccion]?.delete(campo);
  }

  cierra(): Cosecha {
    const ignorados: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(this.ignorados)) ignorados[k] = [...v].sort();
    return {
      filas: this.filas,
      usuarios: this.usuarios,
      rechazos: this.rechazos,
      redondeos: this.redondeos,
      leidos: this.leidos,
      ignorados,
      sumas: this.sumas,
      sumas_origen: this.sumasOrigen,
      avisos: this.avisos,
    };
  }
}

/* ─────────────── contraparte ───────────────
 * conta-master usa además 'cuenta', 'opex' y 'ajuste', que en el esquema de la
 * suite no existen. Se traducen a 'otro' y se dice cuántas: el tipo original
 * no se pierde, queda en la descripción del reporte. */

const CONTRAPARTES = ['cliente', 'proveedor', 'personal', 'otro'] as const;

function contraparte(v: unknown): 'cliente' | 'proveedor' | 'personal' | 'otro' {
  const s = String(v ?? '').toLowerCase();
  return (CONTRAPARTES as readonly string[]).includes(s) ? (s as 'cliente') : 'otro';
}

const ESTADOS_PROYECTO = ['planeando', 'activo', 'pausado', 'finiquito', 'cerrado'];

/** El rol más alto manda: en conta-master la membresía es por negocio y aquí
 *  es por empresa, así que quien es owner de un negocio es owner de la org. */
const PESO_ROL: Record<string, number> = { owner: 4, admin: 3, socio: 2, viewer: 1, staff: 1 };
const ROL_SUITE: Record<string, 'owner' | 'admin' | 'socio' | 'staff'> = {
  owner: 'owner', admin: 'admin', socio: 'socio', viewer: 'staff', staff: 'staff',
};

/* ─────────────── el formato de la API REST de Firestore ───────────────
 * Un documento REST no es JSON plano: cada campo viene envuelto en su tipo
 * (`{stringValue}`, `{doubleValue}`, `{mapValue:{fields}}`…). Desenvolverlo
 * aquí y no en el navegador es lo que permite que la página no interprete
 * nada: lee, manda tal cual, y todo lo que decide qué es dinero y qué fecha
 * vive en un archivo con pruebas.
 *
 * Ojo con `integerValue`: en JSON viaja como CADENA, no como número. */

function valorREST(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v ?? null;
  const o = v as Record<string, unknown>;
  if ('nullValue' in o) return null;
  if ('stringValue' in o) return o.stringValue;
  if ('booleanValue' in o) return o.booleanValue;
  if ('integerValue' in o) return Number(o.integerValue);
  if ('doubleValue' in o) return Number(o.doubleValue);
  if ('timestampValue' in o) return o.timestampValue;
  if ('referenceValue' in o) return String(o.referenceValue).split('/').pop() ?? null;
  if ('bytesValue' in o) return null;
  if ('geoPointValue' in o) return o.geoPointValue;
  if ('arrayValue' in o) {
    const a = (o.arrayValue as { values?: unknown[] })?.values ?? [];
    return a.map(valorREST);
  }
  if ('mapValue' in o) {
    const f = (o.mapValue as { fields?: Record<string, unknown> })?.fields ?? {};
    const salida: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(f)) salida[k] = valorREST(x);
    return salida;
  }
  return v;
}

/** ¿Es un documento tal como lo devuelve `firestore.googleapis.com`? */
function esREST(d: unknown): boolean {
  return !!d && typeof d === 'object' && 'name' in (d as object) && 'fields' in (d as object);
}

/** Documento REST → objeto plano con `id`. El id es el último tramo de `name`. */
export function desdeREST(d: Crudo): Crudo {
  const campos = (d.fields ?? {}) as Record<string, unknown>;
  const salida: Crudo = {};
  for (const [k, v] of Object.entries(campos)) salida[k] = valorREST(v);
  salida.id = salida.id ?? String(d.name ?? '').split('/').pop() ?? '';
  if (!salida.creado_at && d.createTime) salida.creado_at = d.createTime;
  return salida;
}

/** Acepta las dos formas: documentos ya planos o crudos de la API REST. */
export function aplanar(lista: unknown): Crudo[] {
  if (!Array.isArray(lista)) return [];
  return lista.map((d) => (esREST(d) ? desdeREST(d as Crudo) : (d as Crudo)));
}

/* ─────────────── el mapeo, colección por colección ─────────────── */

/** Lo que el mapeo no puede saber leyendo el documento. Hoy sólo el negocio:
 *  la suite guarda clientes y cotizaciones por negocio, y quote101 no sabe que
 *  los negocios existen. Se pide en la petición en vez de adivinarlo. */
export interface Opciones {
  negocio_id?: string;
}

export function cosechar(
  entrada: Record<string, unknown>,
  hoy = new Date().toISOString(),
  opciones: Opciones = {},
): Cosecha {
  const docs: Record<string, Crudo[]> = {};
  for (const [k, v] of Object.entries(entrada)) docs[k] = aplanar(v);
  return mapear(docs, hoy, opciones);
}

function mapear(docs: Record<string, Crudo[]>, hoy: string, opciones: Opciones): Cosecha {
  const c = new Cesta();
  const lista = (nombre: string): Crudo[] => {
    const l = Array.isArray(docs[nombre]) ? docs[nombre] : [];
    c.leidos[nombre] = l.length;
    return l;
  };
  const id = (d: Crudo): string => String(d.id ?? d._id ?? '').trim();

  /* negocios */
  for (const d of lista('negocios')) {
    if (!id(d)) { c.rechaza('negocios', '(sin id)', 'el documento no trae id'); continue; }
    if (!texto(d.nombre)) { c.rechaza('negocios', id(d), 'sin nombre', 'nombre'); continue; }
    c.pon('negocios', {
      id: id(d), nombre: texto(d.nombre), rfc: texto(d.rfc),
      moneda: texto(d.moneda) ?? 'MXN', creado_at: aISO(d.creado_at) ?? hoy,
    });
    c.sobrantes('negocios', d, ['id', 'nombre', 'rfc', 'moneda', 'creado_at']);
  }

  /* cuentas */
  for (const d of lista('cuentas')) {
    if (!id(d)) { c.rechaza('cuentas', '(sin id)', 'el documento no trae id'); continue; }
    if (!texto(d.nombre) || !texto(d.negocio_id)) {
      c.rechaza('cuentas', id(d), 'falta nombre o negocio_id'); continue;
    }
    const plata: Pendiente[] = [];
    const saldo = c.dinero(plata, 'cuentas', 'cuentas', 'saldo_inicial', id(d), d.saldo_inicial);
    if (saldo === null) continue;
    c.pon('cuentas', {
      id: id(d), negocio_id: texto(d.negocio_id), nombre: texto(d.nombre),
      tipo: texto(d.tipo) ?? 'otro', banco: texto(d.banco), moneda: texto(d.moneda) ?? 'MXN',
      saldo_inicial: saldo, creado_at: aISO(d.creado_at) ?? hoy,
    }, plata);
    // `saldo_actual` es caché de conta-master: lo recalcula quien tenga los
    // movimientos, no se copia. `numero` no tiene columna en la suite.
    c.sobrantes('cuentas', d, ['id', 'negocio_id', 'nombre', 'tipo', 'banco', 'moneda', 'saldo_inicial', 'creado_at']);
  }

  /* clientes — y de paso, quién tiene portal */
  for (const d of lista('clientes')) {
    if (!id(d)) { c.rechaza('clientes', '(sin id)', 'el documento no trae id'); continue; }
    if (!texto(d.nombre)) { c.rechaza('clientes', id(d), 'sin nombre', 'nombre'); continue; }
    const uid = texto(d.uid ?? d.cliente_uid ?? d.usuario_id);
    const mail = correo(d.email ?? d.correo);
    c.pon('clientes', {
      id: id(d), negocio_id: texto(d.negocio_id) ?? '', nombre: texto(d.nombre),
      correo: mail, telefono: texto(d.telefono), rfc: texto(d.rfc), notas: texto(d.notas),
      usuario_id: uid, portal_activo: !!uid,
      creado_en_app: 'conta-master', creado_at: aISO(d.creado_at) ?? hoy,
    });
    if (uid && mail) {
      c.usuarios.push({
        id: uid, correo: mail, nombre: texto(d.nombre), de: 'clientes',
        acceso: { tipo: 'cliente', ref_id: id(d) },
      });
    } else if (uid && !mail) {
      c.rechaza('clientes', id(d), 'tiene portal pero no trae correo: no se le puede crear acceso', 'email');
    }
    c.sobrantes('clientes', d, ['id', 'negocio_id', 'nombre', 'email', 'correo', 'telefono', 'rfc', 'notas', 'uid', 'cliente_uid', 'usuario_id', 'creado_at']);
  }

  /* proveedores */
  for (const d of lista('proveedores')) {
    if (!id(d)) { c.rechaza('proveedores', '(sin id)', 'el documento no trae id'); continue; }
    if (!texto(d.nombre)) { c.rechaza('proveedores', id(d), 'sin nombre', 'nombre'); continue; }
    c.pon('proveedores', {
      id: id(d), nombre: texto(d.nombre), rfc: texto(d.rfc), categoria: texto(d.categoria),
      correo: correo(d.email ?? d.correo), telefono: texto(d.telefono),
      terminos_pago: texto(d.terminos_pago_default ?? d.terminos_pago), notas: texto(d.notas),
      creado_en_app: 'conta-master', creado_at: aISO(d.creado_at) ?? hoy,
    });
    c.sobrantes('proveedores', d, ['id', 'nombre', 'rfc', 'categoria', 'email', 'correo', 'telefono', 'terminos_pago_default', 'terminos_pago', 'notas', 'creado_at']);
  }

  /* proyectos — y sus productos, que aquí se llaman ítems */
  for (const d of lista('proyectos')) {
    if (!id(d)) { c.rechaza('proyectos', '(sin id)', 'el documento no trae id'); continue; }
    if (!texto(d.nombre) || !texto(d.cliente_id)) {
      c.rechaza('proyectos', id(d), 'falta nombre o cliente_id'); continue;
    }
    const estado = String(d.estado ?? 'planeando');
    if (!ESTADOS_PROYECTO.includes(estado)) {
      c.rechaza('proyectos', id(d), `estado desconocido: ${estado}`, 'estado');
      continue;
    }

    c.pon('proyectos', {
      id: id(d), negocio_id: texto(d.negocio_id) ?? '', cliente_id: texto(d.cliente_id),
      nombre: texto(d.nombre), descripcion: texto(d.descripcion), estado,
      fecha_inicio: aDia(d.fecha_inicio), fecha_fin_estimada: aDia(d.fecha_fin_estimada),
      fecha_cierre: aDia(d.fecha_cierre),
      creado_at: aISO(d.creado_at) ?? hoy, actualizado_at: aISO(d.actualizado_at),
    });

    /* partidas[] → filas en `partidas`, colgadas del proyecto. El id se arma
     * del proyecto y la posición (PRO1-p1), igual que lo hace la migración
     * 0002: así reimportar actualiza en vez de duplicar. `monto_pagado` y
     * `estado` no se copian: son cachés, salen de los egresos. */
    (Array.isArray(d.partidas) ? d.partidas : []).forEach((cruda, i) => {
      const p = cruda as Crudo;
      const pid = `${id(d)}-p${i + 1}`;
      const plata: Pendiente[] = [];
      const acordado = c.dinero(plata, 'partidas', 'partidas', 'monto_acordado', pid, p.monto_acordado);
      if (acordado === null) return;
      c.pon('partidas', {
        id: pid, proyecto_id: id(d), item_id: texto(p.item_id ?? p.producto_id),
        proveedor_id: texto(p.proveedor_id), proveedor_nombre: texto(p.proveedor_nombre),
        concepto: texto(p.concepto), monto_acordado: acordado,
        creado_at: aISO(d.creado_at) ?? hoy,
      }, plata);
    });
    c.sobrantes('proyectos', d, [
      'id', 'negocio_id', 'cliente_id', 'nombre', 'descripcion', 'estado', 'fecha_inicio',
      'fecha_fin_estimada', 'fecha_cierre', 'partidas', 'productos', 'creado_at', 'actualizado_at',
    ]);
    // Los cachés de conta-master (`precio_venta`, `cobrado`, `pagado`…) y los
    // nombres denormalizados NO están en esa lista a propósito: salen en
    // `campos_ignorados` para que se vea que no se copiaron. La API los
    // recalcula desde los ítems y los movimientos.

    /* productos[] → filas en items. El id del producto es el id del ítem: es
     * lo que hace que `movimientos.producto_id` siga apuntando a algo. */
    for (const p of (Array.isArray(d.productos) ? d.productos : []) as Crudo[]) {
      const pid = String(p.id ?? '').trim();
      if (!pid) { c.rechaza('items', `${id(d)}/(producto sin id)`, 'el producto no trae id'); continue; }
      if (!texto(p.nombre)) { c.rechaza('items', pid, 'sin nombre', 'nombre'); continue; }
      const platita: Pendiente[] = [];
      const monto = c.dinero(platita, 'items', 'items', 'monto', pid, p.monto);
      if (monto === null) continue;

      const etapa = Number(p.etapa ?? 0);
      if (!Number.isInteger(etapa) || etapa < 0 || etapa > 7) {
        c.rechaza('items', pid, `etapa fuera de 0..7: ${String(p.etapa)}`, 'etapa');
        continue;
      }

      c.pon('items', {
        id: pid,
        negocio_id: texto(d.negocio_id) ?? '',
        proyecto_id: id(d),
        cliente_id: texto(d.cliente_id),
        nombre: texto(p.nombre),
        descripcion: texto(p.descripcion),
        tipo: texto(p.tipo) ?? 'mueble',
        monto,
        moneda: texto(p.moneda) ?? texto(d.moneda) ?? 'MXN',
        // Está dentro de un proyecto: se vendió. El eje comercial y el de
        // fabricación son independientes (§4), así que la etapa va aparte.
        estado: 'vendido',
        etapa,
        fecha_entrega: aDia(p.fecha_entrega),
        origen: { app: 'conta-master', proyecto_id: id(d), quell_id: texto(p.quell_id) ?? undefined },
        creado_at: aISO(d.creado_at) ?? hoy,
        creado_por: 'importacion',
      }, platita);
      // `pagado` del producto es caché: sale de los movimientos con item_id.
    }

    /* La regla del producto único (decisión de Mike, 11-sep): un proyecto con
     * precio y SIN productos se guarda como un ítem vendido con el nombre del
     * proyecto y ese monto. Sin ella el precio de venta quedaba en cero,
     * porque es un caché que sale de los ítems y no había ninguno. Es la
     * misma regla con la que dash101 captura contra la API. El id es
     * determinista (`<proyecto>-i1`) para que reimportar actualice. */
    const productos = Array.isArray(d.productos) ? d.productos : [];
    if (productos.length === 0 && d.precio_venta !== undefined && d.precio_venta !== null && d.precio_venta !== '' && Number(d.precio_venta) !== 0) {
      const iid = `${id(d)}-i1`;
      const platita: Pendiente[] = [];
      const monto = c.dinero(platita, 'proyectos', 'items', 'monto', iid, d.precio_venta);
      if (monto !== null) {
        c.pon('items', {
          id: iid, negocio_id: texto(d.negocio_id) ?? '', proyecto_id: id(d), cliente_id: texto(d.cliente_id),
          nombre: texto(d.nombre), descripcion: null, tipo: 'otro', monto, moneda: texto(d.moneda) ?? 'MXN',
          estado: 'vendido', etapa: 0, fecha_entrega: aDia(d.fecha_fin_estimada),
          origen: { app: 'conta-master', proyecto_id: id(d), regla: 'producto_unico' },
          creado_at: aISO(d.creado_at) ?? hoy, creado_por: 'importacion',
        }, platita);
        c.usado('proyectos', 'precio_venta');
      }
    }
  }

  /* movimientos */
  for (const d of lista('movimientos')) {
    if (!id(d)) { c.rechaza('movimientos', '(sin id)', 'el documento no trae id'); continue; }
    const tipo = String(d.tipo ?? '');
    if (tipo !== 'ingreso' && tipo !== 'egreso') {
      c.rechaza('movimientos', id(d), `tipo desconocido: ${tipo || '(vacío)'}`, 'tipo');
      continue;
    }
    const fecha = aDia(d.fecha);
    if (!fecha) { c.rechaza('movimientos', id(d), 'sin fecha', 'fecha'); continue; }
    if (!texto(d.cuenta_id)) { c.rechaza('movimientos', id(d), 'sin cuenta_id', 'cuenta_id'); continue; }
    const plata: Pendiente[] = [];
    const monto = c.dinero(plata, 'movimientos', 'movimientos', 'monto', id(d), d.monto);
    if (monto === null) continue;

    c.pon('movimientos', {
      id: id(d), negocio_id: texto(d.negocio_id) ?? '', tipo, monto, fecha,
      cuenta_id: texto(d.cuenta_id), proyecto_id: texto(d.proyecto_id),
      // `producto_id` era el nombre viejo. Aquí se dice ítem.
      item_id: texto(d.producto_id ?? d.item_id),
      contraparte_tipo: contraparte(d.contraparte_tipo),
      contraparte_id: texto(d.contraparte_id), contraparte_nombre: texto(d.contraparte_nombre),
      transfer_id: texto(d.transfer_id), descripcion: texto(d.descripcion), categoria: texto(d.categoria),
      creado_por: texto(d.creado_por) ?? 'importacion', creado_at: aISO(d.creado_at) ?? hoy,
    }, plata);
    c.sobrantes('movimientos', d, [
      'id', 'negocio_id', 'tipo', 'monto', 'fecha', 'cuenta_id', 'proyecto_id', 'producto_id', 'item_id',
      'contraparte_tipo', 'contraparte_id', 'contraparte_nombre', 'transfer_id', 'descripcion',
      'categoria', 'creado_por', 'creado_at',
      'cuenta_nombre', 'proyecto_nombre', 'producto_nombre', 'cliente_uid',
      'cuenta_destino_id', 'cuenta_destino_nombre',
    ]);
  }

  /* opex */
  for (const d of lista('opex')) {
    if (!id(d)) { c.rechaza('opex', '(sin id)', 'el documento no trae id'); continue; }
    if (!texto(d.nombre) || !texto(d.frecuencia)) {
      c.rechaza('opex', id(d), 'falta nombre o frecuencia'); continue;
    }
    const inicio = aDia(d.fecha_inicio);
    if (!inicio) { c.rechaza('opex', id(d), 'sin fecha_inicio', 'fecha_inicio'); continue; }
    const plata: Pendiente[] = [];
    const monto = c.dinero(plata, 'opex', 'opex', 'monto', id(d), d.monto);
    if (monto === null) continue;

    c.pon('opex', {
      id: id(d), negocio_id: texto(d.negocio_id) ?? '', nombre: texto(d.nombre),
      tipo: texto(d.tipo) ?? 'egreso', monto, moneda: texto(d.moneda) ?? 'MXN',
      frecuencia: texto(d.frecuencia),
      dia_semana: d.dia_semana === null || d.dia_semana === undefined ? null : Number(d.dia_semana),
      dia_del_mes: d.dia_del_mes === null || d.dia_del_mes === undefined ? null : Number(d.dia_del_mes),
      fecha_inicio: inicio, fecha_fin: aDia(d.fecha_fin), cuenta_id: texto(d.cuenta_id),
      categoria: texto(d.categoria), activo: d.activo === undefined ? true : !!d.activo,
      creado_at: aISO(d.creado_at) ?? hoy,
    }, plata);
    c.sobrantes('opex', d, [
      'id', 'negocio_id', 'nombre', 'tipo', 'monto', 'moneda', 'frecuencia', 'dia_semana',
      'dia_del_mes', 'fecha_inicio', 'fecha_fin', 'cuenta_id', 'categoria', 'activo', 'creado_at',
      'cuenta_nombre', 'descripcion', 'creado_por',
    ]);
  }

  /* usuarios de Firebase Auth → usuarios + miembros del D1 master.
   * Los PIN no se migran: están hasheados con otro esquema y no se pueden
   * traducir. Se vuelven a fijar por «olvidé mi PIN» (encargo §4). */
  for (const d of lista('usuarios')) {
    const uid = id(d);
    const mail = correo(d.email ?? d.correo);
    if (!uid) { c.rechaza('usuarios', '(sin id)', 'el documento no trae uid'); continue; }
    if (!mail) { c.rechaza('usuarios', uid, 'sin correo', 'email'); continue; }

    const memberships = (d.memberships ?? {}) as Record<string, { rol?: string }>;
    const negocios = Object.keys(memberships);
    let rol: 'owner' | 'admin' | 'socio' | 'staff' | null = null;
    let peso = 0;
    for (const n of negocios) {
      const r = String(memberships[n]?.rol ?? 'viewer');
      if ((PESO_ROL[r] ?? 0) > peso) { peso = PESO_ROL[r] ?? 0; rol = ROL_SUITE[r] ?? 'staff'; }
    }

    c.usuarios.push({
      id: uid, correo: mail, nombre: texto(d.nombre), de: 'usuarios',
      ...(rol ? { miembro: { rol, negocios } } : {}),
    });
    c.sobrantes('usuarios', d, ['id', 'email', 'correo', 'nombre', 'memberships', 'negocios_acceso', 'creado_at']);
  }

  /* ─────────────── cotizador — el árbol de quote101 ───────────────
   *
   * quote101 no tiene colecciones: tiene UN documento (`app/datos`) con un
   * árbol adentro —`clientes → proyectos → cotizaciones → versiones →
   * muebles`— más `config`, `prices` y `reciboCounter`. Por eso esta colección
   * trae un solo documento y no una lista de muchos.
   *
   * A dónde va cada cosa:
   *   cliente     → `clientes`
   *   proyecto    → `proyectos` (estado `planeando`: la app no guarda estado y
   *                 aquí no se inventa uno; que un proyecto esté activo lo dice
   *                 dash101, no una suposición del importador)
   *   cotización  → `cotizaciones`, con las versiones enteras en `datos`
   *   config      → `ajustes` clave `config`
   *   prices      → `ajustes` clave `precios`
   *
   * Los ids del árbol se CONSERVAN. Son los que la app ya trae en memoria, y
   * conservarlos es lo que hace que la mudanza se pueda repetir sin duplicar:
   * la segunda corrida actualiza las mismas filas en vez de crear otras.
   *
   * EL DINERO. Un mueble trae `total` (por pieza, en pesos con decimales) y
   * `qty`. El total de la cotización se arma convirtiendo PRIMERO a centavos y
   * multiplicando DESPUÉS por la cantidad, no al revés: `1.005 * 3` en
   * flotantes da 3.0149999999999997, y redondear eso pierde un centavo que
   * nadie vuelve a encontrar. Convertir primero deja la multiplicación en
   * enteros, donde no hay nada que perder.
   *
   * EL FOLIO. Si la versión traía uno, se conserva tal cual —puede andar
   * impreso en el PDF que el cliente ya tiene—. Si no traía, NO se inventa
   * aquí: se deja vacío y el OrgDB le pone el siguiente al importar, con el
   * mismo contador atómico del contrato 0.9.0. Así el contador queda solo
   * después del último y no hay que acomodarlo a mano.
   */
  for (const d of lista('cotizador')) {
    const negocio_id = texto(opciones.negocio_id);
    if (!negocio_id) {
      c.rechaza('cotizador', '(documento)', 'falta `negocio` en la petición: la suite guarda clientes y cotizaciones por negocio, y quote101 no sabe de negocios');
      continue;
    }

    const clientes = Array.isArray(d.clientes) ? (d.clientes as Crudo[]) : [];
    for (const cl of clientes) {
      const cid = id(cl);
      if (!cid) { c.rechaza('cotizador', '(cliente sin id)', 'el cliente no trae id'); continue; }
      if (!texto(cl.nombre)) { c.rechaza('cotizador', cid, 'cliente sin nombre', 'nombre'); continue; }

      c.pon('clientes', {
        id: cid, negocio_id, nombre: texto(cl.nombre),
        creado_en_app: 'cotizador101', creado_at: aISO(cl.creado_at) ?? hoy,
      });

      const proyectos = Array.isArray(cl.proyectos) ? (cl.proyectos as Crudo[]) : [];
      for (const pr of proyectos) {
        const pid = id(pr);
        if (!pid) { c.rechaza('cotizador', `${cid}/(proyecto sin id)`, 'el proyecto no trae id'); continue; }
        if (!texto(pr.nombre)) { c.rechaza('cotizador', pid, 'proyecto sin nombre', 'nombre'); continue; }

        c.pon('proyectos', {
          id: pid, negocio_id, cliente_id: cid, nombre: texto(pr.nombre),
          estado: 'planeando', creado_at: aISO(pr.creado_at) ?? hoy,
        });

        const cotizaciones = Array.isArray(pr.cotizaciones) ? (pr.cotizaciones as Crudo[]) : [];
        for (const cot of cotizaciones) {
          const qid = id(cot);
          if (!qid) { c.rechaza('cotizador', `${pid}/(cotización sin id)`, 'la cotización no trae id'); continue; }

          const versiones = Array.isArray(cot.versiones) ? (cot.versiones as Crudo[]) : [];
          const cuantas = versiones.length >= 3 ? '3 o más' : String(versiones.length);
          c.avisos.versiones_por_cotizacion[cuantas] = (c.avisos.versiones_por_cotizacion[cuantas] ?? 0) + 1;

          // La versión 0 es la vigente. Es la única cuyo total se guarda en la
          // columna: las anteriores quedan en `datos`, como historia.
          const vigente = (versiones[0] ?? {}) as Crudo;
          const plata: Pendiente[] = [];
          let total = 0;
          let malo = false;
          const muebles = Array.isArray(vigente.muebles) ? (vigente.muebles as Crudo[]) : [];
          for (const [i, m] of muebles.entries()) {
            // La cantidad se revisa ANTES de convertir: el renglón entero se
            // cuenta multiplicado, así que un `qty` ilegible haría que la suma
            // del cuadre no se pareciera a lo escrito.
            const qty = Number((m as Crudo).qty ?? 1);
            if (!Number.isInteger(qty) || qty < 0) {
              c.rechaza('cotizador', `${qid}#${i}`, `cantidad que no es un entero positivo: ${String((m as Crudo).qty)}`, 'qty');
              malo = true;
              break;
            }
            const renglon = c.dinero(plata, 'cotizador', 'cotizaciones', 'total', `${qid}#${i}`, (m as Crudo).total, qty);
            if (renglon === null) { malo = true; break; }
            total += renglon;
            for (const img of (Array.isArray((m as Crudo).imagenes) ? ((m as Crudo).imagenes as unknown[]) : [])) {
              const t = String(img ?? '');
              if (t.startsWith('https://')) c.avisos.imagenes_en_storage++;
              else if (t.startsWith('data:image')) c.avisos.imagenes_en_el_documento++;
            }
          }
          if (malo) continue;

          // Las versiones históricas cuyo detalle se fue a Storage: se cuentan,
          // porque apagar Firebase se las lleva y eso hay que decirlo ANTES.
          for (const v of versiones) {
            if (texto((v as Crudo).historicoURL)) c.avisos.versiones_en_storage++;
          }

          const folio = texto(vigente.folio ?? cot.folio);
          if (folio) c.avisos.folios_traidos++; else c.avisos.sin_folio++;

          c.pon('cotizaciones', {
            id: qid, negocio_id, cliente_id: cid,
            // Si no traía folio, la columna NI SE MENCIONA. No es lo mismo
            // que mandarla vacía: el importador actualiza las filas que ya
            // están, y una columna vacía le borraría a la cotización el folio
            // que la corrida anterior ya le había puesto —y la siguiente le
            // daría otro, gastando números y cambiándole el folio a una
            // cotización que ya salió impresa—. Lo que no se manda, no se
            // toca.
            ...(folio ? { folio } : {}),
            estado: 'borrador', total, moneda: texto(vigente.moneda) ?? 'MXN',
            datos: { nombre: texto(cot.nombre), proyecto_id: pid, versiones },
            creado_at: aISO(vigente.fecha ?? cot.creado_at) ?? hoy,
          }, plata);
        }
      }
    }

    /* config y prices → ajustes. `app` se escribe aquí porque el importador es
     * la única puerta que puede: entra por debajo de `permisos.ts`. Las claves
     * son las que la app va a pedir cuando deje Firebase. */
    for (const [campo, clave] of [['config', 'config'], ['prices', 'precios']] as const) {
      const valor = d[campo];
      if (valor === null || valor === undefined) continue;
      c.pon('ajustes', {
        id: `cotizador101:${clave}`, app: 'cotizador101', clave,
        valor, creado_at: hoy, actualizado_at: hoy,
      });
    }

    /* `reciboCounter` NO se importa. Es el consecutivo de los recibos, y tiene
     * el mismo problema de concurrencia que tenía el folio: dos personas
     * guardando a la vez se llevan el mismo número. Traerlo a `ajustes` sería
     * mudar el defecto de casa. Le toca su propia vuelta, con el contador del
     * OrgDB, que ya existe y es atómico. */
    c.sobrantes('cotizador', d, ['clientes', 'config', 'prices']);
  }

  return c.cierra();
}
