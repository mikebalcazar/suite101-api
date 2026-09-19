/* POST /admin/mudar-quell — la mudanza de quell101 a la base de la empresa.
 *
 * Trae lo que vivía en la D1 `bitacora-obra` y en el bucket
 * `bitacora-obra-files` al OrgDB de una empresa (tablas `quell_*`, migración
 * 0006) y al bucket de la suite bajo `orgs/{org}/quell/`. Misma llave, misma
 * fecha, mismo id: nada se inventa. Correrla dos veces no duplica (escribe por
 * llave) y no vuelve a copiar un archivo que ya está.
 *
 * Cerrada a cal y canto, como el importador: sólo superadmin, la empresa
 * tiene que existir, y `modo: 'seco'` es lo que sale por omisión —cuenta y
 * deshace—; para escribir hay que pedirlo con todas sus letras. Las ligas a la
 * D1 y al bucket viejos (`QUELL_D1`, `QUELL_R2`) sólo se leen.
 *
 * Cuando la mudanza quede atrás, esto y las dos ligas se quitan. */

import { Hono } from 'hono';
import { org, usuarioPorCorreo } from '../maestro';
import { soySuper } from './admin';
import { err, ok, type Ctx, type Vars } from '../http';
import type { Env } from '../entorno';
import type { ApiOrgDB } from '../org-db';
import { normalizaCorreo } from '../lib';

const rutas = new Hono<{ Bindings: Env; Variables: Vars }>();

type Fila = Record<string, unknown>;

/** Qué columnas se traen de cada tabla vieja, en el orden en que se insertan.
 *  Lo que no está aquí (los PIN, las sesiones, `role_viejo`) se queda atrás. */
const COLUMNAS: Record<string, string[]> = {
  users: ['id', 'email', 'name', 'role', 'company', 'active', 'created_at'],
  projects: ['id', 'name', 'client', 'status', 'created_by', 'created_at'],
  project_members: ['project_id', 'user_id', 'rol'],
  plans: ['id', 'project_id', 'name', 'file_name', 'image_key', 'source_key', 'width', 'height', 'sort', 'created_at'],
  elements: ['id', 'plan_id', 'project_id', 'code', 'type', 'name', 'resp', 'x', 'y', 'fase', 'entregado_en', 'entregado_por', 'created_by', 'created_at'],
  log_entries: ['id', 'element_id', 'user_id', 'kind', 'text', 'created_at'],
  punch_items: ['id', 'element_id', 'title', 'description', 'status', 'resp', 'due_date', 'assignee_id', 'created_by', 'created_at', 'done_at', 'done_by'],
  photos: ['id', 'owner_type', 'owner_id', 'r2_key', 'file_name', 'width', 'height', 'size', 'user_id', 'created_at'],
  operaciones: ['id', 'cuando'],
  etapas: ['clave', 'nombre', 'orden', 'abre_punchlist', 'activa'],
  element_etapas: ['element_id', 'etapa', 'hecha_en', 'hecha_por'],
  dudas: ['id', 'project_id', 'element_id', 'user_id', 'texto', 'estado', 'para', 'created_at', 'resuelta_en', 'resuelta_por'],
  duda_respuestas: ['id', 'duda_id', 'user_id', 'texto', 'created_at'],
  element_contratistas: ['element_id', 'user_id', 'asignado_por', 'asignado_at'],
};

interface Cuerpo { org?: string; modo?: 'seco' | 'escribir'; archivos?: boolean }

rutas.post('/mudar-quell', async (c: Ctx) => {
  if (!(await soySuper(c))) return err(c, 'sin_permiso', 403, { puerta: 'mudar-quell es solo del superadmin' });
  const cuerpo = await c.req.json<Cuerpo>().catch(() => ({}) as Cuerpo);
  const org_id = String(cuerpo.org || '').trim();
  if (!org_id) return err(c, 'datos_invalidos', 400, { falta: 'org' });
  const empresa = await org(c.env, org_id);
  if (!empresa) return err(c, 'org_desconocida', 404, { org: org_id });
  const fuente = c.env.QUELL_D1;
  if (!fuente) return err(c, 'sin_fuente', 503, { falta: 'QUELL_D1', motivo: 'la D1 vieja de quell101 no está ligada a esta API' });
  const seco = cuerpo.modo !== 'escribir';
  const conArchivos = cuerpo.archivos !== false;
  const prefijo = `orgs/${org_id}/quell/`;

  // 1 · leer la D1 vieja, tabla por tabla, sólo las columnas que se traen.
  const filas: Record<string, Fila[]> = {};
  for (const [tabla, cols] of Object.entries(COLUMNAS)) {
    const r = await fuente.prepare(`SELECT ${cols.join(', ')} FROM ${tabla}`).all<Fila>();
    filas[`quell_${tabla}`] = r.results ?? [];
  }

  // 2 · casar cada persona con su cuenta de la suite, por correo. No se crea
  //     nadie: quien no tenga cuenta entra cuando la tenga (dos altas).
  for (const u of filas.quell_users) {
    const cuenta = await usuarioPorCorreo(c.env, normalizaCorreo(u.email));
    u.usuario_id = cuenta?.id ?? null;
  }
  // 3 · un ítem sin obra la hereda del plano (la 0010 los llenó; por si acaso).
  const obraDelPlano = new Map(filas.quell_plans.map((p) => [String(p.id), p.project_id]));
  for (const e of filas.quell_elements) if (!e.project_id) e.project_id = obraDelPlano.get(String(e.plan_id)) ?? null;
  const sinObra = filas.quell_elements.filter((e) => !e.project_id).length;

  // 4 · los archivos: llaves nuevas bajo la empresa, y los bytes copiados.
  const llaves: Array<{ vieja: string; nueva: string }> = [];
  const traduce = (f: Fila, col: string) => {
    const v = f[col];
    if (!v || typeof v !== 'string') return;
    const vieja = v;
    const nueva = v.startsWith(prefijo) ? v : prefijo + v;
    f[col] = nueva;
    if (vieja !== nueva) llaves.push({ vieja, nueva });
  };
  for (const p of filas.quell_plans) { traduce(p, 'image_key'); traduce(p, 'source_key'); }
  for (const f of filas.quell_photos) traduce(f, 'r2_key');

  const archivos = { total: llaves.length, copiados: 0, ya_estaban: 0, fallos: [] as Array<{ llave: string; motivo: string }>, bytes: 0 };
  if (!seco && conArchivos) {
    const bucket = c.env.QUELL_R2;
    if (!bucket) return err(c, 'sin_fuente', 503, { falta: 'QUELL_R2' });
    for (const { vieja, nueva } of llaves) {
      try {
        if (await c.env.ARCHIVOS.head(nueva)) { archivos.ya_estaban++; continue; }
        const obj = await bucket.get(vieja);
        if (!obj) { archivos.fallos.push({ llave: vieja, motivo: 'no está en el bucket viejo' }); continue; }
        const cuerpoArchivo = await obj.arrayBuffer();
        await c.env.ARCHIVOS.put(nueva, cuerpoArchivo, { httpMetadata: obj.httpMetadata });
        archivos.copiados++;
        archivos.bytes += cuerpoArchivo.byteLength;
      } catch (e) {
        archivos.fallos.push({ llave: vieja, motivo: (e as Error).message });
      }
    }
  }

  // 5 · las filas, al OrgDB de la empresa (en seco se deshace adentro).
  const stub = c.env.ORG.get(c.env.ORG.idFromName(org_id)) as unknown as ApiOrgDB;
  const r = await stub.importarQuell({ filas, seco });

  const leidas: Record<string, number> = {};
  for (const [t, f] of Object.entries(filas)) leidas[t] = f.length;
  return ok(c, {
    org: org_id, modo: seco ? 'seco' : 'escribir',
    leidas, escritas: r.escritas, antes: r.antes, despues: r.despues,
    personas_con_cuenta: filas.quell_users.filter((u) => u.usuario_id).length,
    personas_sin_cuenta: filas.quell_users.filter((u) => !u.usuario_id).map((u) => u.email),
    items_sin_obra: sinObra,
    archivos: seco ? { total: llaves.length, nota: 'en seco no se copia nada' } : archivos,
  });
});


/* ─────────────── POST /admin/mudar-roster ───────────────
 *
 * Lo mismo para roster101: trae lo que vivía en la D1 `t101-trabajadores` y en
 * el bucket `t101-documentos` (el portal de Taller 101) al OrgDB de una empresa
 * (tablas `roster_*`, migración 0007) y al bucket de la suite bajo
 * `orgs/{org}/roster/`. Las llaves de los documentos NO cambian en la base
 * (`trabajadores/{id}/…`): el motor las lee ya con el prefijo puesto. Los
 * códigos de acceso (valen diez minutos) y las tablas de la contraseña vieja
 * del panel se quedan atrás. Las cuentas del panel se traen tal cual y se dice
 * cuáles no tienen todavía cuenta en la suite: ésas no van a poder entrar
 * hasta que se den de alta en workshop101, igual que hoy. */

const COLUMNAS_ROSTER: Record<string, string[]> = {
  trabajadores: ['id', 'folio', 'email', 'nombre', 'apellido_paterno', 'apellido_materno', 'celular', 'nss', 'curp', 'rfc',
    'banco', 'clabe', 'beneficiario', 'emerg_nombre', 'emerg_parentesco', 'emerg_telefono', 'emerg_email', 'puesto',
    'estado', 'creado_en', 'actualizado_en', 'confirmado_en'],
  documentos: ['id', 'trabajador_id', 'tipo', 'etiqueta', 'nombre_archivo', 'llave', 'mime', 'tamano', 'subido_en'],
  consentimientos: ['trabajador_id', 'version', 'aceptado_en'],
  papelera: ['trabajador_id', 'borrado_en', 'borra_el'],
  bitacora: ['id', 'cuando', 'quien', 'accion', 'detalle'],
  administradores: ['id', 'email', 'nombre', 'nivel', 'activo', 'creado_en', 'creado_por', 'ultimo_acceso'],
};

rutas.post('/mudar-roster', async (c: Ctx) => {
  if (!(await soySuper(c))) return err(c, 'sin_permiso', 403, { puerta: 'mudar-roster es solo del superadmin' });
  const cuerpo = await c.req.json<Cuerpo>().catch(() => ({}) as Cuerpo);
  const org_id = String(cuerpo.org || '').trim();
  if (!org_id) return err(c, 'datos_invalidos', 400, { falta: 'org' });
  const empresa = await org(c.env, org_id);
  if (!empresa) return err(c, 'org_desconocida', 404, { org: org_id });
  const fuente = c.env.ROSTER_D1;
  if (!fuente) return err(c, 'sin_fuente', 503, { falta: 'ROSTER_D1', motivo: 'la D1 vieja de roster101 no está ligada a esta API' });
  const seco = cuerpo.modo !== 'escribir';
  const conArchivos = cuerpo.archivos !== false;
  const prefijo = `orgs/${org_id}/roster/`;

  // 1 · leer la D1 vieja, tabla por tabla, sólo las columnas que se traen.
  const filas: Record<string, Fila[]> = {};
  for (const [tabla, cols] of Object.entries(COLUMNAS_ROSTER)) {
    const r = await fuente.prepare(`SELECT ${cols.join(', ')} FROM ${tabla}`).all<Fila>();
    filas[`roster_${tabla}`] = r.results ?? [];
  }

  // 2 · un documento cuyo trabajador ya no existe no se trae: en la base nueva
  //     la llave foránea lo rechazaría y tiraría toda la mudanza.
  const vivos = new Set(filas.roster_trabajadores.map((t) => String(t.id)));
  const huerfanos = filas.roster_documentos.filter((d) => !vivos.has(String(d.trabajador_id))).length;
  filas.roster_documentos = filas.roster_documentos.filter((d) => vivos.has(String(d.trabajador_id)));

  // 3 · las cuentas del panel: cuáles tienen ya cuenta en la suite.
  const sinCuenta: string[] = [];
  for (const a of filas.roster_administradores) {
    const cuenta = await usuarioPorCorreo(c.env, normalizaCorreo(a.email));
    if (!cuenta) sinCuenta.push(String(a.email));
  }

  // 4 · los correos, ANTES de copiar un solo byte. El portal ya apunta a la
  //     base de la empresa, así que alguien pudo entrar y abrir un expediente
  //     en blanco con un correo que la base vieja también trae; el correo es
  //     único. Un expediente en blanco se retira al escribir; uno con datos
  //     detiene la mudanza entera, y entonces no se copia nada.
  const stub = c.env.ORG.get(c.env.ORG.idFromName(org_id)) as unknown as ApiOrgDB;
  const revision = await stub.revisarRoster(filas.roster_trabajadores);
  const leidas: Record<string, number> = {};
  for (const [t, f] of Object.entries(filas)) leidas[t] = f.length;
  const comun = {
    org: org_id, modo: seco ? 'seco' : 'escribir',
    leidas,
    documentos_sin_trabajador: huerfanos,
    cuentas_del_panel: filas.roster_administradores.length,
    cuentas_sin_suite: sinCuenta,
  };
  if (revision.conflictos.length) {
    const conteos = await stub.conteosRoster();
    return err(c, 'expedientes_encimados', 409, {
      ...comun,
      antes: conteos, despues: conteos, escritas: {},
      expedientes_en_blanco_retirados: [],
      conflictos: revision.conflictos,
      archivos: { total: filas.roster_documentos.length, nota: 'no se copió nada' },
      mensaje: 'Esos correos ya tienen un expediente CON DATOS en la base de la empresa, distinto del que trae la base vieja. No se escribió nada.',
    });
  }

  // 5 · los archivos: misma llave, bajo la empresa. Los bytes se copian.
  const archivos = { total: filas.roster_documentos.length, copiados: 0, ya_estaban: 0, fallos: [] as Array<{ llave: string; motivo: string }>, bytes: 0 };
  if (!seco && conArchivos) {
    const bucket = c.env.ROSTER_R2;
    if (!bucket) return err(c, 'sin_fuente', 503, { falta: 'ROSTER_R2' });
    for (const d of filas.roster_documentos) {
      const llave = String(d.llave);
      try {
        if (await c.env.ARCHIVOS.head(prefijo + llave)) { archivos.ya_estaban++; continue; }
        const obj = await bucket.get(llave);
        if (!obj) { archivos.fallos.push({ llave, motivo: 'no está en el bucket viejo' }); continue; }
        const cuerpoArchivo = await obj.arrayBuffer();
        await c.env.ARCHIVOS.put(prefijo + llave, cuerpoArchivo, { httpMetadata: obj.httpMetadata });
        archivos.copiados++;
        archivos.bytes += cuerpoArchivo.byteLength;
      } catch (e) {
        archivos.fallos.push({ llave, motivo: (e as Error).message });
      }
    }
  }

  // 6 · las filas, al OrgDB de la empresa (en seco se deshace adentro). La
  //     revisión de correos se repite ahí dentro, con la transacción abierta:
  //     entre el paso 4 y este alguien pudo haber entrado.
  const r = await stub.importarRoster({ filas, seco });
  if (r.conflictos.length) {
    return err(c, 'expedientes_encimados', 409, {
      ...comun,
      antes: r.antes, despues: r.despues, escritas: {},
      expedientes_en_blanco_retirados: [],
      conflictos: r.conflictos,
      archivos: seco ? { total: archivos.total, nota: 'en seco no se copia nada' } : archivos,
      mensaje: 'Esos correos ya tienen un expediente CON DATOS en la base de la empresa, distinto del que trae la base vieja. No se escribió nada.',
    });
  }

  return ok(c, {
    ...comun,
    escritas: r.escritas, antes: r.antes, despues: r.despues,
    // Correos que ya habían abierto un expediente en blanco aquí y se
    // retiraron para que entrara el de verdad.
    expedientes_en_blanco_retirados: r.cascarones,
    archivos: seco ? { total: archivos.total, nota: 'en seco no se copia nada' } : archivos,
  });
});

export default rutas;
