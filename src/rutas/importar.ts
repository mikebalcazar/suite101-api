/* POST /admin/importar — la puerta de servicio de la migración (fase 2).
 *
 * ESTO NO ES UNA RUTA NORMAL, y el nombre lo dice a propósito.
 *
 * Entra por debajo de `permisos.ts` porque tiene que hacer justo lo que
 * `permisos.ts` existe para impedir: conservar los ids de Firestore, escribir
 * `creado_at`, `creado_por` y la `etapa` que un ítem ya traía. Por el CRUD
 * genérico eso no cabe, y la alternativa —importar por las rutas normales y
 * luego recorrer las etapas una por una— habría dejado un historial de
 * `avances` inventado, con fechas y responsables de movimientos que nunca
 * ocurrieron así. Mike eligió esta (encargo §2): mejor una puerta que se ve
 * que es puerta.
 *
 * Por eso está cerrada a cal y canto:
 *   · solo superadmin (`CORREO_SUPERADMIN`), comprobado contra `superadmins`;
 *   · la empresa tiene que existir ya;
 *   · `modo: 'seco'` es lo que sale por omisión — para escribir hay que
 *     pedirlo con todas sus letras.
 *
 * Si alguien la encuentra abierta dentro de un año: es esto, y se puede
 * quitar en cuanto Firebase se apague (fase 9 del documento).
 *
 * El navegador NO traduce nada: manda el documento de Firestore tal como lo
 * leyó y aquí se mapea. Si el mapeo viviera en la página, el único código que
 * decide qué es dinero y qué es fecha estaría fuera de las pruebas.
 */

import { Hono } from 'hono';
import { cosechar, type Crudo } from '../importar/mapeo';
import pagina from '../importar/pagina.html';
import { importarUsuario, org, ponerAcceso, ponerMiembro } from '../maestro';
import { soySuper } from './admin';
import { err, ok, type Ctx, type Vars } from '../http';
import { ulid } from '../lib';
import type { Env } from '../entorno';
import type { ApiOrgDB } from '../org-db';
import { VERSION_CONTRATO, TABLAS } from '../../schema/tipos';

const rutas = new Hono<{ Bindings: Env; Variables: Vars }>();

/** Las colecciones que este importador sabe leer. Cualquier otra llave del
 *  JSON se dice en la respuesta en vez de ignorarse en silencio. */
const COLECCIONES = [
  'negocios', 'cuentas', 'clientes', 'proveedores', 'proyectos', 'movimientos', 'opex', 'usuarios',
  // quote101 no tiene colecciones: tiene UN documento (`app/datos`) con el
  // árbol adentro. Va como una lista de un solo elemento. Ver `mapeo.ts`.
  'cotizador',
];

interface Cuerpo {
  org?: string;
  modo?: 'seco' | 'escribir';
  /** El negocio al que se cuelgan los clientes y las cotizaciones de
   *  `cotizador`. quote101 no sabe que los negocios existen, así que se pide
   *  aquí en vez de adivinarlo. */
  negocio?: string;
  docs?: Record<string, Crudo[]>;
}

rutas.post('/importar', async (c) => {
  if (!(await soySuper(c))) return err(c, 'sin_permiso', 403, { puerta: 'importar es solo del superadmin' });

  const cuerpo = await c.req.json<Cuerpo>().catch(() => ({}) as Cuerpo);
  const org_id = String(cuerpo.org || '').trim();
  if (!org_id) return err(c, 'datos_invalidos', 400, { falta: 'org' });
  const empresa = await org(c.env, org_id);
  if (!empresa) return err(c, 'org_desconocida', 404, { org: org_id });

  // Escribir hay que pedirlo. Por omisión se ensaya.
  const seco = cuerpo.modo !== 'escribir';
  const docs = cuerpo.docs ?? {};
  if (!docs || typeof docs !== 'object' || Array.isArray(docs)) {
    return err(c, 'datos_invalidos', 400, { docs: 'un objeto {coleccion: [documentos]}' });
  }
  const desconocidas = Object.keys(docs).filter((k) => !COLECCIONES.includes(k));

  const negocio_id = String(cuerpo.negocio || '').trim();
  // Que el negocio exista se revisa aquí y no en el mapeo: el mapeo no toca la
  // base a propósito. Un negocio inventado dejaría clientes colgando de nada.
  if (docs.cotizador?.length && negocio_id) {
    const suyo = await (c.env.ORG.get(c.env.ORG.idFromName(org_id)) as unknown as ApiOrgDB).obtener('negocios', negocio_id);
    if (!suyo) return err(c, 'negocio_desconocido', 404, { negocio: negocio_id, en: org_id });
  }

  const cosecha = cosechar(docs, undefined, { negocio_id });
  const stub = c.env.ORG.get(c.env.ORG.idFromName(org_id)) as unknown as ApiOrgDB;

  const antes = await stub.conteos();
  const r = await stub.importar({ filas: cosecha.filas as Record<string, Crudo[]>, seco });

  /* ─────────────── usuarios (D1 master) ─────────────── */

  // Una misma persona puede venir dos veces: como miembro en `usuarios` y como
  // cliente con portal en `clientes`. Es una sola fila en D1.
  const porId = new Map<string, { id: string; correo: string; nombre: string | null; miembro?: { rol: 'owner' | 'admin' | 'socio' | 'staff'; negocios: string[] }; acceso?: { tipo: 'cliente' | 'personal'; ref_id: string } }>();
  for (const u of cosecha.usuarios) {
    const previo = porId.get(u.id);
    porId.set(u.id, {
      id: u.id,
      correo: previo?.correo ?? u.correo,
      nombre: previo?.nombre ?? u.nombre,
      miembro: u.miembro ?? previo?.miembro,
      acceso: u.acceso ?? previo?.acceso,
    });
  }

  const usuarios = {
    leidos: porId.size,
    creados: 0,
    ya_estaban: 0,
    correo_de_otro: [] as Array<{ uid_firebase: string; usuario_id: string; correo: string }>,
    miembros: 0,
    accesos: 0,
    pin: 'no se migra: se vuelve a fijar por «olvidé mi PIN»',
    detalle: [] as Array<{ correo: string; usuario_id: string; suerte: string; rol?: string; acceso?: string }>,
  };

  for (const u of porId.values()) {
    if (seco) {
      // Ensayo: se mira, no se toca.
      const porCorreo = await c.env.MASTER.prepare(`SELECT id FROM usuarios WHERE correo = ?`).bind(u.correo).first<{ id: string }>();
      const suerte = !porCorreo ? 'se_crearia' : porCorreo.id === u.id ? 'ya_estaba' : 'correo_de_otro';
      if (suerte === 'se_crearia') usuarios.creados++;
      else if (suerte === 'ya_estaba') usuarios.ya_estaban++;
      else usuarios.correo_de_otro.push({ uid_firebase: u.id, usuario_id: porCorreo!.id, correo: u.correo });
      if (u.miembro) usuarios.miembros++;
      if (u.acceso) usuarios.accesos++;
      usuarios.detalle.push({ correo: u.correo, usuario_id: porCorreo?.id ?? u.id, suerte, rol: u.miembro?.rol, acceso: u.acceso?.tipo });
      continue;
    }

    const { usuario_id, suerte } = await importarUsuario(c.env, u);
    if (suerte === 'creado') usuarios.creados++;
    else if (suerte === 'ya_estaba') usuarios.ya_estaban++;
    else usuarios.correo_de_otro.push({ uid_firebase: u.id, usuario_id, correo: u.correo });

    if (u.miembro) {
      await ponerMiembro(c.env, org_id, usuario_id, u.miembro.rol, [], u.miembro.negocios);
      usuarios.miembros++;
    }
    if (u.acceso) {
      await ponerAcceso(c.env, { usuario_id, org_id, tipo: u.acceso.tipo, ref_id: u.acceso.ref_id });
      usuarios.accesos++;
      // Si el correo ya era de otro id, el cliente quedó apuntando a un uid que
      // en D1 no existe: se corrige aquí o el portal no abriría.
      if (usuario_id !== u.id) await stub.actualizar('clientes', u.acceso.ref_id, { usuario_id });
    }
    usuarios.detalle.push({ correo: u.correo, usuario_id, suerte, rol: u.miembro?.rol, acceso: u.acceso?.tipo });
  }

  /* ─────────────── el cuadre ───────────────
   * Esto es lo que de verdad pide el encargo (§6): no que corra sin error,
   * sino poder poner las dos columnas una al lado de la otra. */

  const rechazosPor = (tabla: string) => cosecha.rechazos.filter((x) => x.coleccion === tabla).length;
  const fallosPor = (tabla: string) => r.fallos.filter((x) => x.tabla === tabla).length;

  const tablas = TABLAS.map((t) => {
    const mapeadas = cosecha.filas[t]?.length ?? 0;
    const rechazadas = rechazosPor(t);
    const fallidas = fallosPor(t);
    const nuevas = r.nuevas[t] ?? 0;
    const actualizadas = r.actualizadas[t] ?? 0;
    return {
      tabla: t,
      firestore: mapeadas + rechazadas,
      mapeadas,
      rechazadas,
      fallidas,
      nuevas,
      actualizadas,
      antes: r.antes[t] ?? 0,
      en_orgdb: r.despues[t] ?? 0,
      cuadra:
        rechazadas === 0 && fallidas === 0 &&
        nuevas + actualizadas === mapeadas &&
        (r.despues[t] ?? 0) === (r.antes[t] ?? 0) + nuevas,
    };
  }).filter((f) => f.firestore > 0 || f.en_orgdb > 0);

  // Los cachés del proyecto no se importan: los recalcula la API desde los
  // ítems y los movimientos. Compararlos contra Firestore sería comparar
  // contra la opinión de otra base, así que van en su propia lista y no
  // entran en el veredicto. Que cuadren o no se ve en otro lado: `cobrado`
  // sale de los mismos movimientos que ya se contaron arriba.
  const CACHES_DINERO = ['proyectos.precio_venta', 'proyectos.cobrado', 'proyectos.pagado_prov', 'proyectos.compromiso', 'partidas.monto_pagado'];

  const llavesDinero = [...new Set([...Object.keys(cosecha.sumas), ...Object.keys(r.sumas)])]
    .filter((k) => (cosecha.sumas[k] ?? 0) !== 0 || (r.sumas[k] ?? 0) !== 0)
    .sort();

  const recalculado = llavesDinero
    .filter((k) => CACHES_DINERO.includes(k))
    .map((k) => ({ campo: k, en_orgdb: r.sumas[k] ?? 0 }));

  const dinero = llavesDinero.filter((k) => !CACHES_DINERO.includes(k)).map((k) => {
    const mapeado = cosecha.sumas[k] ?? 0;
    const deEstasFilas = r.sumas_importadas[k] ?? 0;
    const pesos = cosecha.sumas_origen[k] ?? 0;
    return {
      campo: k,
      // Lo que Firestore tenía, en pesos, sumado con flotantes: es la cifra
      // que un humano puede ver en conta-master y comparar a ojo.
      firestore_pesos: Number(pesos.toFixed(4)),
      // La misma cifra ya en centavos enteros.
      centavos: mapeado,
      // Lo que quedó guardado en esas mismas filas, releído de la base.
      en_orgdb: deEstasFilas,
      // Y el total de la tabla, que puede traer filas de antes.
      total_en_orgdb: r.sumas[k] ?? 0,
      // Lo que importa: que lo escrito sea exactamente lo convertido.
      cuadra: deEstasFilas === mapeado,
      // Y que convertir no haya movido el monto más allá del redondeo al
      // centavo que se declaró.
      diferencia_centavos: mapeado - Math.round(pesos * 100),
    };
  });

  const cuadraTodo =
    tablas.every((t) => t.cuadra) &&
    dinero.every((d) => d.cuadra) &&
    cosecha.rechazos.length === 0 &&
    r.fallos.length === 0 &&
    r.enlaces.item_que_no_existe.length === 0;

  return ok(c, {
    org: org_id,
    modo: seco ? 'seco (no se escribió nada)' : 'escribir',
    contrato: VERSION_CONTRATO,
    veredicto: cuadraTodo ? 'cuadra' : 'NO cuadra: mirar rechazos, fallos y las filas con cuadra=false',
    leidos: cosecha.leidos,
    colecciones_desconocidas: desconocidas,
    cuadre: { tablas, dinero, recalculado },
    enlaces: r.enlaces,
    /* Lo que hay que mirar ANTES de apagar Firebase, y que no es una fila ni
     * un peso: cuántas cotizaciones traían folio y cuántas se llevaron uno
     * nuevo, y —sobre todo— cuánto detalle sigue viviendo en Firebase Storage.
     * Las versiones históricas y las imágenes que son una URL de Storage NO
     * viajan en este documento: la cotización se importa y ese detalle se queda
     * allá. Apagar Firebase se lo lleva. Eso se muda en su propio paso, y hasta
     * que este número sea cero, Firebase no se apaga. */
    avisos: { ...cosecha.avisos, folios_asignados: r.folios_asignados },
    usuarios,
    proyectos_recalculados: r.proyectos_recalculados,
    rechazos: cosecha.rechazos,
    fallos: r.fallos,
    redondeos: cosecha.redondeos,
    // Campos del documento de Firestore que ninguna columna recibió. Casi
    // todos son cachés o nombres denormalizados y está bien que se queden
    // fuera, pero se dicen: perder un campo sin ruido es como perder plata.
    campos_ignorados: cosecha.ignorados,
    muestra_ids: r.muestra,
  });
});

/* ═══════════════ POST /admin/mudar-archivos ═══════════════
 *
 * Lo que la mudanza del documento NO puede traer.
 *
 * Las cotizaciones de quote101 apuntan a archivos que viven en Firebase
 * Storage y no viajan en el documento: las fotos de los muebles
 * (`muebles[].imagenes[]`) y el detalle de las versiones archivadas
 * (`historicoURL`, un JSON). Al importar la cotización, esas URLs entran tal
 * cual en `cotizaciones.datos` — y siguen apuntando a Firebase. **Apagar
 * Firebase las mata.** Mientras queden, no hay corte.
 *
 * Esto las baja y las guarda en R2, por el mismo camino que cualquier archivo
 * de la suite (`archivos` + `ARCHIVOS.put`), y reescribe la URL dentro de
 * `datos`.
 *
 * POR QUÉ LO HACE EL WORKER Y NO EL NAVEGADOR
 * El documento lo lee el navegador porque la sesión de Firebase vive ahí. Para
 * esto no hace falta ninguna sesión: esas URLs son públicas —que lo sean es
 * justo el hueco que se está cerrando—. Hacerlo aquí lo vuelve reanudable: si
 * se corta a la mitad, lo ya mudado se queda mudado y la siguiente corrida
 * sigue donde iba. Con el navegador, cerrar la pestaña a media subida dejaría
 * el trabajo tirado.
 *
 * DOS CANDADOS, Y NINGUNO ES DECORATIVO
 *
 *   1. Sólo se baja de `firebasestorage.googleapis.com`. Las URLs vienen de
 *      datos importados, o sea de fuera: sin esta lista, alguien que lograra
 *      meter una URL en `datos` tendría al Worker pidiendo lo que él quiera
 *      desde dentro de la red de Cloudflare. Es una lista blanca de un solo
 *      nombre y así se queda.
 *   2. `limite` por corrida. Un Worker tiene un techo de subpeticiones y de
 *      tiempo; doscientas fotos en una sola llamada se caen a la mitad. Se
 *      mudan por tandas y la respuesta dice cuántas faltan: se vuelve a llamar
 *      hasta que `pendientes` sea 0. Repetir no hace daño — una URL ya mudada
 *      no vuelve a coincidir con el patrón.
 *
 * La URL nueva queda como `/s101/orgs/:o/archivos/:id`, que es la ruta por la
 * que quote101 le habla a la suite desde su propio origen. Así un `<img src>`
 * y el `fetch` del histórico siguen funcionando sin tocar la app. Vive dentro
 * de `cotizaciones.datos`, que es el cajón de quote101; ninguna otra app lo
 * lee. Y a diferencia de la de Firebase, esta dirección **pide sesión**.
 */

/** De dónde se acepta bajar. Un solo nombre, a propósito. */
const STORAGE = 'firebasestorage.googleapis.com';

const esDeStorage = (u: string): boolean => {
  if (!u.startsWith('https://')) return false;
  try {
    return new URL(u).hostname === STORAGE;
  } catch {
    return false;
  }
};

/** El nombre con el que se guarda. De la URL de Storage se saca el nombre del
 *  objeto (`muebles/17..-ab12.jpg` → `17..-ab12.jpg`); si no se puede, uno
 *  genérico. Sirve para reconocerlo en `archivos`, no para nada más. */
function nombreDe(u: string): string {
  try {
    const ruta = decodeURIComponent(new URL(u).pathname.split('/o/')[1] ?? '');
    const hoja = ruta.split('/').pop();
    return hoja && hoja.length <= 120 ? hoja : 'archivo';
  } catch {
    return 'archivo';
  }
}

/** Recorre `datos` de una cotización y junta las URLs de Storage que haya, con
 *  el camino para volver a escribirlas. Se hace con un recorrido general y no
 *  yendo campo por campo a propósito: si mañana la app guarda una imagen en
 *  otro rincón del árbol, ésta la encuentra igual. Lo que decide qué se muda es
 *  «ser una URL de Storage», no en qué llave está. */
function urlsDeStorage(valor: unknown, camino: Array<string | number> = [], salida: Array<{ camino: Array<string | number>; url: string }> = []) {
  if (typeof valor === 'string') {
    if (esDeStorage(valor)) salida.push({ camino: [...camino], url: valor });
    return salida;
  }
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => urlsDeStorage(v, [...camino, i], salida));
    return salida;
  }
  if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) urlsDeStorage(v, [...camino, k], salida);
  }
  return salida;
}

/** Escribe `nuevo` en el camino que `urlsDeStorage` apuntó. */
function ponerEn(raiz: unknown, camino: Array<string | number>, nuevo: string): void {
  let nodo: any = raiz;
  for (const paso of camino.slice(0, -1)) nodo = nodo?.[paso];
  const ultimo = camino[camino.length - 1];
  if (nodo && ultimo !== undefined) nodo[ultimo] = nuevo;
}

interface CuerpoMudar {
  org?: string;
  modo?: 'seco' | 'escribir';
  limite?: number;
}

rutas.post('/mudar-archivos', async (c) => {
  if (!(await soySuper(c))) return err(c, 'sin_permiso', 403, { puerta: 'mudar-archivos es solo del superadmin' });

  const cuerpo = await c.req.json<CuerpoMudar>().catch(() => ({}) as CuerpoMudar);
  const org_id = String(cuerpo.org || '').trim();
  if (!org_id) return err(c, 'datos_invalidos', 400, { falta: 'org' });
  const empresa = await org(c.env, org_id);
  if (!empresa) return err(c, 'org_desconocida', 404, { org: org_id });

  const seco = cuerpo.modo !== 'escribir';
  const limite = Math.min(Math.max(Number(cuerpo.limite) || 20, 1), 100);
  const stub = c.env.ORG.get(c.env.ORG.idFromName(org_id)) as unknown as ApiOrgDB;

  const { filas } = await stub.listar('cotizaciones', {}, undefined, 1000);

  // Primero se cuenta TODO lo que falta, y después se muda una tanda. Así la
  // respuesta puede decir cuántas quedan sin que el que llama lleve la cuenta.
  const porCotizacion = filas.map((f) => ({
    id: String(f.id),
    datos: (f.datos ?? {}) as Record<string, unknown>,
    urls: urlsDeStorage(f.datos),
  })).filter((x) => x.urls.length > 0);

  const total = porCotizacion.reduce((s, x) => s + x.urls.length, 0);

  const movidos: Array<{ cotizacion: string; nombre: string; bytes: number }> = [];
  const fallos: Array<{ cotizacion: string; url: string; motivo: string }> = [];
  let bytes = 0;

  if (!seco) {
    let presupuesto = limite;
    for (const cot of porCotizacion) {
      if (presupuesto <= 0) break;
      let cambio = false;
      for (const { camino, url } of cot.urls) {
        if (presupuesto <= 0) break;
        presupuesto--;
        try {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`Storage contestó ${r.status}`);
          const cuerpoArchivo = await r.arrayBuffer();
          const nombre = nombreDe(url);
          const id = ulid();
          const r2_key = `orgs/${org_id}/cotizaciones/${cot.id}/${id}-${nombre}`;
          const mime = r.headers.get('content-type') || 'application/octet-stream';
          await c.env.ARCHIVOS.put(r2_key, cuerpoArchivo, { httpMetadata: { contentType: mime } });
          await stub.registrarArchivo({
            id, r2_key, nombre, mime, bytes: cuerpoArchivo.byteLength,
            de_tabla: 'cotizaciones', de_id: cot.id, subido_por: 'mudanza',
          });
          ponerEn(cot.datos, camino, `/s101/orgs/${org_id}/archivos/${id}`);
          movidos.push({ cotizacion: cot.id, nombre, bytes: cuerpoArchivo.byteLength });
          bytes += cuerpoArchivo.byteLength;
          cambio = true;
        } catch (e) {
          fallos.push({ cotizacion: cot.id, url, motivo: (e as Error).message });
        }
      }
      // Se guarda por cotización y no al final: si la corrida se corta, lo ya
      // bajado queda apuntado. Un archivo en R2 que nadie referencia es basura
      // silenciosa, y peor: la siguiente corrida lo volvería a bajar.
      if (cambio) await stub.actualizar('cotizaciones', cot.id, { datos: cot.datos });
    }
  }

  // Se vuelve a contar leyendo de la base, no restando: lo que vale es lo que
  // quedó escrito, no lo que esta corrida creyó hacer.
  const despues = await stub.listar('cotizaciones', {}, undefined, 1000);
  const pendientes = despues.filas.reduce((s, f) => s + urlsDeStorage(f.datos).length, 0);

  return ok(c, {
    org: org_id,
    modo: seco ? 'seco (no se bajó ni se escribió nada)' : 'escribir',
    contrato: VERSION_CONTRATO,
    cotizaciones_con_archivos_en_firebase: porCotizacion.length,
    archivos_en_firebase: total,
    movidos: movidos.length,
    bytes,
    pendientes,
    /* Lo único que de verdad hay que leer de esta respuesta. Mientras no sea
     * `false`, apagar Firebase se lleva fotos y versiones viejas. */
    firebase_se_puede_apagar: pendientes === 0 && fallos.length === 0,
    limite,
    fallos,
    detalle: movidos,
  });
});

/* La página. Va aparte, en `index.ts`, registrada antes que el router de
 * /admin para que se pueda abrir sin sesión: quien la abre todavía no ha
 * entrado, y un 401 en JSON no le sirve de nada a un humano con un navegador. */
export const paginaImportar = (c: Ctx): Response =>
  new Response(pagina, { headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' } });

export default rutas;
