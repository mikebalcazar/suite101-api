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
import type { Env } from '../entorno';
import type { ApiOrgDB } from '../org-db';
import { VERSION_CONTRATO, TABLAS } from '../../schema/tipos';

const rutas = new Hono<{ Bindings: Env; Variables: Vars }>();

/** Las colecciones que este importador sabe leer. Cualquier otra llave del
 *  JSON se dice en la respuesta en vez de ignorarse en silencio. */
const COLECCIONES = ['negocios', 'cuentas', 'clientes', 'proveedores', 'proyectos', 'movimientos', 'opex', 'usuarios'];

interface Cuerpo {
  org?: string;
  modo?: 'seco' | 'escribir';
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

  const cosecha = cosechar(docs);
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
  const CACHES_DINERO = ['proyectos.precio_venta', 'proyectos.cobrado', 'proyectos.pagado_prov'];

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

/* La página. Va aparte, en `index.ts`, registrada antes que el router de
 * /admin para que se pueda abrir sin sesión: quien la abre todavía no ha
 * entrado, y un 401 en JSON no le sirve de nada a un humano con un navegador. */
export const paginaImportar = (c: Ctx): Response =>
  new Response(pagina, { headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' } });

export default rutas;
