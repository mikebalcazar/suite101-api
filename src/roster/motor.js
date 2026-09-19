/* roster101 — el motor de los expedientes, dentro de la suite.
 *
 * ESTE ARCHIVO ES EL QUE CORRÍA EN EL WORKER DE roster101
 * (t101-portal-trabajadores, src/index.js) hasta el 19-sep-2026, con cuatro
 * cambios y nada más:
 *
 *   1. Las tablas llevan el prefijo `roster_` y viven en el SQLite de la
 *      empresa (el Durable Object OrgDB), no en una D1 por empresa. `env.DB`
 *      es un adaptador con la misma cara que D1 (prepare · bind · first · all
 *      · run) sobre el SqlStorage del objeto: las consultas son las mismas.
 *   2. Quién viene al panel ya lo resolvió la puerta de la suite
 *      (`/roster/:o/*` en src/rutas/roster.ts): llega en `env.SESION`. Aquí
 *      ya no se le pregunta a `/yo`; sólo se casa el correo con su renglón de
 *      `roster_administradores`, que dice de qué nivel es.
 *   3. Los documentos van al bucket de la suite bajo `orgs/{org}/roster/…`;
 *      `env.DOCS` es el bucket con ese prefijo puesto, así que las llaves que
 *      guarda la base siguen siendo `trabajadores/{id}/…`, las de siempre.
 *   4. Los datos de la empresa (nombre, razón social, domicilio, correos,
 *      versión del aviso) los manda el Worker de la empresa en cada
 *      petición; siguen viviendo en su wrangler.toml, como decidió Mike el
 *      19-sep (un Worker por empresa, como hoy).
 *
 * La puerta del trabajador NO cambia: su correo y un código de seis dígitos,
 * sin cuenta en la suite (Mike, 16-sep). La cookie la firma el secreto de la
 * suite en vez del de cada Worker. Todo lo demás —los frenos de datos
 * repetidos, la papelera de 30 días, las fichas, la exportación, los niveles
 * del panel y sus candados— es el mismo código, con sus mismos comentarios.
 *
 * Es JavaScript a propósito: se movió tal cual, y `motor.d.ts` le pone la
 * firma que TypeScript necesita del lado del Durable Object.
 */

import { Hono } from 'hono';
import {
  ahora, uuid, firmar, verificar, sha256, igualSeguro,
  cookie, leerCookie, normalizaEmail, limpiaNombre, csvCampo, empresaDe,
} from './lib.js';
import {
  revisaExpediente, emailValido,
  DOCS_OBLIGATORIOS, DOCS_OPCIONALES, NOMBRES_DOC,
  CAMPOS_EXPEDIENTE, faltantesCampos,
} from './validar.js';
import { enviarCorreo, correoCodigo, correoConfirmacion, correoAvisoAdmin } from './correo.js';
import { armaZip, exportarCsv, armaZipFichas } from './exportar.js';
import { armaFichas, nombreArchivoFichas, CAMPOS_FICHA, CAMPOS_POR_DEFECTO } from './ficha.js';
import {
  NIVELES, NOMBRE_NIVEL, DICE_NIVEL,
  puede, permisosDe, nivelValido, candado,
} from './cuentas.js';

const app = new Hono();

/* La puerta a la suite (`/s101/*`) ya no vive aquí: la sigue dando el Worker
 * de cada empresa, que es el que tiene el enlace de servicio. Aquí ya se
 * llega con la sesión resuelta. */

const HORAS = 3600;
const VIDA_SESION = 12 * HORAS;
const MAX_ARCHIVO = 10 * 1024 * 1024; // 10 MB
const MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
]);
const TIPOS = new Set([...DOCS_OBLIGATORIOS, ...DOCS_OPCIONALES]);

const err = (c, msg, code = 400, extra = {}) => c.json({ error: msg, ...extra }, code);

// El secreto con el que se firma la cookie del trabajador: el de la suite,
// que el Durable Object ya trae resuelto (maestro.ts, `secretoDe`).
function secreto(env) {
  const s = env.SECRETO;
  if (!s) throw new Error('El motor de roster101 llegó sin secreto para firmar la sesión del trabajador');
  return s;
}

async function registra(env, quien, accion, detalle = '') {
  try {
    await env.DB.prepare('INSERT INTO roster_bitacora (cuando, quien, accion, detalle) VALUES (?,?,?,?)')
      .bind(ahora(), quien, accion, detalle).run();
  } catch (e) { console.error('bitacora', e); }
}

// ───────────────────────── papelera ─────────────────────────
// Dar de baja no borra: aparta. Un expediente apartado desaparece del panel,
// del CSV, del ZIP y de las fichas, y deja de estorbar para registrar de nuevo
// esa CURP o ese NSS. A los 30 días se borra de verdad, con sus documentos.
// Hasta entonces se puede devolver.

const DIAS_PAPELERA = 30;
const SOLO_VIVOS = 'id NOT IN (SELECT trabajador_id FROM roster_papelera)';

// Borra de verdad a un trabajador: primero los archivos, luego los renglones.
// Si un archivo ya no está en R2 no importa: lo que se busca es que no quede.
async function borraDeVerdad(env, id) {
  const { results } = await env.DB.prepare('SELECT llave FROM roster_documentos WHERE trabajador_id = ?').bind(id).all();
  for (const d of results || []) await env.DOCS.delete(d.llave).catch(() => {});
  await env.DB.prepare('DELETE FROM roster_documentos WHERE trabajador_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM roster_consentimientos WHERE trabajador_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM roster_papelera WHERE trabajador_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM roster_trabajadores WHERE id = ?').bind(id).run();
}

// Vacía lo que ya cumplió sus 30 días. Se llama sola todas las madrugadas y
// también cada vez que la administración abre el panel, por si el reloj de
// Cloudflare no corrió: así el plazo se cumple aunque falle una de las dos.
async function vaciaVencidos(env) {
  const t = Math.floor(Date.now() / 1000);
  const { results } = await env.DB.prepare(
    'SELECT trabajador_id FROM roster_papelera WHERE borra_el <= ?'
  ).bind(t).all();
  const ids = (results || []).map((r) => r.trabajador_id);
  for (const id of ids) {
    await borraDeVerdad(env, id);
    await registra(env, 'sistema', 'borrado_definitivo', `${id} (cumplió ${DIAS_PAPELERA} días en la papelera)`);
  }
  return ids.length;
}

async function estaEnPapelera(env, id) {
  return await env.DB.prepare('SELECT * FROM roster_papelera WHERE trabajador_id = ?').bind(id).first();
}

// ───────────────── datos que no se pueden repetir ─────────────────
// Cada uno de estos identifica a una sola persona: si aparece en dos expedientes,
// o hubo un error de dedo o alguien se está registrando dos veces. El portal no
// deja guardarlo y la administración los ve juntos en su panel.

const UNICOS = [
  ['curp',    'la CURP',    'Esta CURP ya está registrada en otro expediente.'],
  ['nss',     'el NSS',     'Este NSS ya está registrado en otro expediente.'],
  ['rfc',     'el RFC',     'Este RFC ya está registrado en otro expediente.'],
  ['celular', 'el celular', 'Este celular ya está registrado en otro expediente.'],
  ['email',   'el correo',  'Este correo ya está registrado en otro expediente.'],
];

// Devuelve los campos del expediente que chocan con OTRO trabajador.
// A propósito no se dice con quién: eso son datos de un tercero y el trabajador
// no tiene por qué verlos. Quien los ve es la administración, en su panel.
async function choquesDe(env, id, datos) {
  const choques = [];
  for (const [campo, nombre, mensaje] of UNICOS) {
    const valor = String(datos[campo] || '').trim();
    if (!valor) continue;
    const otro = await env.DB.prepare(
      `SELECT id FROM roster_trabajadores WHERE ${campo} = ? AND id != ? AND ${SOLO_VIVOS} LIMIT 1`
    ).bind(valor, id).first();
    if (otro) choques.push({ campo, nombre, mensaje });
  }
  return choques;
}

// El correo, tapado: se ve en qué buzón buscar sin regalarle la dirección
// completa a quien no la tenía. mike@forespot.com → mi••@fo••••••.com
function tapaCorreo(correo) {
  const [antes, dominio] = String(correo || '').split('@');
  if (!dominio) return '';
  const corta = (t, deja) => t.length <= deja ? t : t.slice(0, deja) + '•'.repeat(Math.min(8, t.length - deja));
  const partes = dominio.split('.');
  const fin = partes.pop();
  return `${corta(antes, 2)}@${corta(partes.join('.'), 2)}.${fin}`;
}

function enumera(cosas) {
  if (cosas.length === 1) return cosas[0];
  return cosas.slice(0, -1).join(', ') + ' y ' + cosas[cosas.length - 1];
}

// ─────────────────────────── sesión ───────────────────────────

async function sesionTrabajador(c) {
  const tok = leerCookie(c.req, 't101_sesion');
  const datos = await verificar(tok, secreto(c.env));
  if (!datos || datos.rol !== 'trabajador') return null;
  return datos;
}

/* ─────────── el panel entra por la suite ───────────
 * Desde el 0.12 el panel no tiene contraseña propia: la sesión la da la suite
 * 101 —correo y código, PIN o cuenta de Google— y aquí sólo se pregunta quién
 * es. La tabla `administradores` se queda, pero ya no guarda con qué entrar:
 * guarda de qué nivel es cada quien, que es lo que sí es asunto de este panel.
 *
 * La puerta del trabajador NO cambia: sigue siendo su correo y un código, y
 * quien llega nuevo se sigue dando de alta solo. Son dos puertas distintas a
 * propósito (Mike, 16-sep). */

/** Quién viene, según la puerta de la suite (src/rutas/roster.ts). Trae el
 *  correo, el nombre, si es el dueño de la suite y qué es en ESTA empresa
 *  (clase y rol). Si la puerta no lo dejó pasar —sin sesión, sin roster101
 *  en su lista de apps, de otra empresa— aquí llega null. */
const laSuiteDiceQuien = (c) => (c.env.SESION && c.env.SESION.correo) ? c.env.SESION : null;

/** ¿La suite le abre roster101 a esta persona? Eso ya lo decidió la puerta:
 *  la empresa activa y vigente, la app prendida, la persona miembro y con
 *  roster101 entre sus apps (lista vacía = todas). Lo que llega aquí, pasó. */
const laSuiteLeAbre = (yo) => !!yo;

// Quién es en este panel. Se consulta la base en cada llamada a propósito:
// quitarle el acceso a alguien tiene que surtir efecto en ese momento, no
// cuando le venza su sesión de la suite. Lo que manda es lo que dice la base
// hoy —nivel, activo—, no lo que traía la sesión cuando se abrió.
async function sesionAdminViva(c) {
  const yo = laSuiteDiceQuien(c);
  if (!laSuiteLeAbre(yo)) return null;
  const email = normalizaEmail(yo.correo || '');
  if (!email) return null;

  const cuenta = await c.env.DB.prepare(
    'SELECT id, email, nombre, nivel, activo FROM roster_administradores WHERE email = ?'
  ).bind(email).first();

  if (cuenta) {
    if (!cuenta.activo) return null;
    return { id: cuenta.id, email: cuenta.email, nombre: cuenta.nombre || yo.nombre || '', nivel: cuenta.nivel };
  }

  // El dueño de la suite entra siempre, y entra como dueño. Es lo que arranca
  // un panel recién puesto —antes lo hacía una clave compartida— y es la
  // salida si un día el último dueño se queda fuera por un descuido.
  //
  // Y desde que roster101 vive en la suite (19-sep), también el dueño y la
  // administración de la EMPRESA: la empresa se da de alta en master101 y
  // prende roster101 ahí mismo; sin esto, nadie de la empresa podría abrir su
  // panel por primera vez ni dar de alta a su gente. Es la misma regla que en
  // quell101. Entran sin renglón en `roster_administradores` (de_la_suite),
  // hasta que alguien se dé de alta a sí mismo o a otro.
  const manda = yo.superadmin === true
    || (yo.quien && yo.quien.clase === 'miembro' && (yo.quien.rol === 'owner' || yo.quien.rol === 'admin'));
  if (manda) {
    return { id: `suite:${yo.quien?.usuario_id ?? 'super'}`, email, nombre: yo.nombre || (yo.superadmin ? 'Dueño de la suite' : 'Dueño de la empresa'), nivel: 'dueno', deLaSuite: true };
  }
  return null;
}

const exigeTrabajador = async (c, next) => {
  const s = await sesionTrabajador(c);
  if (!s) return err(c, 'Tu sesión venció. Vuelve a entrar con tu correo.', 401);
  c.set('trabajador', s);
  await next();
};

// Cuenta viva. `exigeAdmin` era lo mismo más el cambio obligado de contraseña,
// que ya no existe: se deja como alias para no tocar cuarenta rutas por un
// nombre.
const exigeSesion = async (c, next) => {
  const s = await sesionAdminViva(c);
  if (!s) return err(c, 'Entra con tu cuenta de la suite 101.', 401);
  c.set('admin', s);
  await next();
};
const exigeAdmin = exigeSesion;

// Lo que cada nivel puede hacer se decide en cuentas.js; aquí solo se aplica.
const exigePermiso = (que) => async (c, next) => {
  const s = c.get('admin');
  if (!s || !puede(s.nivel, que)) return err(c, 'Tu cuenta no tiene permiso para esto.', 403, { permiso: que });
  await next();
};

// ─────────────────── acceso por código de correo ───────────────────

app.post('/api/codigo', async (c) => {
  const { email: crudo } = await c.req.json().catch(() => ({}));
  const email = normalizaEmail(crudo);
  if (!emailValido(email)) return err(c, 'Escribe un correo válido.');

  // Sin llave de correo no hay forma de entregar el código: mejor decirlo de frente
  // que dejar al trabajador esperando un correo que nunca va a llegar.
  if (c.env.CORREO_SALE && !c.env.RESEND_API_KEY) {
    await registra(c.env, email, 'codigo_no_enviado', 'el portal no tenía configurada la llave de correo');
    return err(c, `El portal todavía no está habilitado para recibir registros. Avísale a administración de ${empresaDe(c.env)}.`, 503);
  }

  const previo = await c.env.DB.prepare('SELECT enviado_en FROM roster_codigos WHERE email = ?').bind(email).first();
  const t = Date.now();
  if (previo && t - previo.enviado_en < 45_000) {
    await registra(c.env, email, 'codigo_repetido', 'pidió otro código antes de los 45 segundos');
    return err(c, 'Ya enviamos un código hace un momento. Revisa tu correo o espera 45 segundos.', 429);
  }

  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  const hash = await sha256(codigo + '|' + email + '|' + secreto(c.env));
  await c.env.DB.prepare(
    `INSERT INTO roster_codigos (email, hash, expira, intentos, enviado_en) VALUES (?,?,?,0,?)
     ON CONFLICT(email) DO UPDATE SET hash=excluded.hash, expira=excluded.expira, intentos=0, enviado_en=excluded.enviado_en`
  ).bind(email, hash, t + 10 * 60_000, t).run();

  const msg = correoCodigo(empresaDe(c.env), codigo);
  try {
    await enviarCorreo(c.env, { para: email, ...msg });
  } catch (e) {
    await registra(c.env, email, 'codigo_no_enviado', 'el correo no salió: revisa que la dirección exista');
    return err(c, 'No pudimos enviar el correo. Verifica la dirección o avísale a administración.', 502);
  }
  await registra(c.env, email, 'codigo_enviado');
  // Fuera de producción (pruebas, staging) el correo no sale y el código se
  // devuelve en la respuesta, igual que hace /auth/codigo de la suite; que en
  // producción NUNCA pase es una de las cosas que mide el humo.
  const enPruebas = !c.env.CORREO_SALE;
  return c.json({ ok: true, mensaje: 'Te enviamos un código de 6 dígitos.', ...(enPruebas ? { codigo_prueba: codigo } : {}) });
});

app.post('/api/entrar', async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const email = normalizaEmail(cuerpo.email);
  const codigo = String(cuerpo.codigo || '').replace(/\D/g, '');
  if (!emailValido(email) || codigo.length !== 6) return err(c, 'Correo o código incompleto.');

  const fila = await c.env.DB.prepare('SELECT * FROM roster_codigos WHERE email = ?').bind(email).first();
  if (!fila) return err(c, 'Pide un código nuevo.', 401);
  if (fila.expira < Date.now()) return err(c, 'El código venció. Pide uno nuevo.', 401);
  if (fila.intentos >= 5) return err(c, 'Demasiados intentos. Pide un código nuevo.', 429);

  const hash = await sha256(codigo + '|' + email + '|' + secreto(c.env));
  if (!igualSeguro(hash, fila.hash)) {
    await c.env.DB.prepare('UPDATE roster_codigos SET intentos = intentos + 1 WHERE email = ?').bind(email).run();
    await registra(c.env, email, 'codigo_malo', `intento ${fila.intentos + 1} de 5`);
    return err(c, 'Código incorrecto.', 401);
  }
  await c.env.DB.prepare('DELETE FROM roster_codigos WHERE email = ?').bind(email).run();

  let t = await c.env.DB.prepare('SELECT * FROM roster_trabajadores WHERE email = ?').bind(email).first();
  if (!t) {
    const id = uuid();
    const n = ahora();
    await c.env.DB.prepare(
      'INSERT INTO roster_trabajadores (id, email, creado_en, actualizado_en) VALUES (?,?,?,?)'
    ).bind(id, email, n, n).run();
    await c.env.DB.prepare('UPDATE roster_trabajadores SET folio = (SELECT COUNT(*) FROM roster_trabajadores) WHERE id = ?').bind(id).run();
    t = await c.env.DB.prepare('SELECT * FROM roster_trabajadores WHERE id = ?').bind(id).first();
    await registra(c.env, email, 'alta');
  }

  const token = await firmar(
    { rol: 'trabajador', id: t.id, email, exp: Math.floor(Date.now() / 1000) + VIDA_SESION },
    secreto(c.env)
  );
  c.header('Set-Cookie', cookie('t101_sesion', token, VIDA_SESION));
  await registra(c.env, email, 'ingreso');
  return c.json({ ok: true, nuevo: !t.nombre });
});

app.post('/api/salir', (c) => {
  c.header('Set-Cookie', cookie('t101_sesion', '', 0));
  return c.json({ ok: true });
});

// ─────────────────────────── expediente ───────────────────────────

async function documentosDe(env, id) {
  const { results } = await env.DB.prepare(
    'SELECT id, tipo, etiqueta, nombre_archivo, mime, tamano, subido_en FROM roster_documentos WHERE trabajador_id = ? ORDER BY subido_en'
  ).bind(id).all();
  return results || [];
}

function faltantesDe(docs) {
  const hay = new Set(docs.map((d) => d.tipo));
  return DOCS_OBLIGATORIOS.filter((t) => !hay.has(t)).map((t) => NOMBRES_DOC[t]);
}

async function consentimientoDe(env, id) {
  return await env.DB.prepare('SELECT version, aceptado_en FROM roster_consentimientos WHERE trabajador_id = ?').bind(id).first();
}

// El aviso de privacidad no es un adorno: sin él aceptado, el portal no guarda
// ni un dato ni un documento. Así el consentimiento es real y queda la constancia.
const exigeAviso = async (c, next) => {
  const s = c.get('trabajador');
  const consent = await consentimientoDe(c.env, s.id);
  if (!consent) return err(c, 'Antes de capturar tus datos tienes que aceptar el aviso de privacidad.', 403, { falta_aviso: true });
  await next();
};

app.post('/api/aviso', exigeTrabajador, async (c) => {
  const s = c.get('trabajador');
  const version = c.env.AVISO_VERSION || '1';
  await c.env.DB.prepare(
    `INSERT INTO roster_consentimientos (trabajador_id, version, aceptado_en) VALUES (?,?,?)
     ON CONFLICT(trabajador_id) DO UPDATE SET version=excluded.version, aceptado_en=excluded.aceptado_en`
  ).bind(s.id, version, ahora()).run();
  await registra(c.env, s.email, 'aviso_aceptado', version);
  return c.json({ ok: true, version, aceptado_en: ahora() });
});

app.get('/api/yo', exigeTrabajador, async (c) => {
  const s = c.get('trabajador');
  const t = await c.env.DB.prepare('SELECT * FROM roster_trabajadores WHERE id = ?').bind(s.id).first();
  if (!t) return err(c, 'No encontramos tu expediente.', 404);
  const docs = await documentosDe(c.env, s.id);
  const consent = await consentimientoDe(c.env, s.id);
  return c.json({ trabajador: t, documentos: docs, faltantes: faltantesDe(docs), aviso: consent || null });
});

app.put('/api/yo', exigeTrabajador, exigeAviso, async (c) => {
  const s = c.get('trabajador');
  const cuerpo = await c.req.json().catch(() => ({}));
  const { errores, limpio, ok } = revisaExpediente(cuerpo);
  const parcial = cuerpo.__parcial === true;

  if (!ok && !parcial) return err(c, 'Revisa los datos marcados.', 422, { errores });

  const choques = await choquesDe(c.env, s.id, limpio);
  const avisoChoque = choques.length
    ? `Ya hay otro expediente con ${enumera(choques.map((ch) => ch.nombre))}. Revisa que no sea un error de dedo; si el dato es correcto, avísale a administración de ${empresaDe(c.env)}.`
    : '';
  const erroresChoque = {};
  for (const ch of choques) erroresChoque[ch.campo] = ch.mensaje;

  if (choques.length && !parcial) {
    return err(c, avisoChoque, 409, { errores: erroresChoque, duplicados: choques.map((ch) => ch.campo) });
  }

  // Guardando a medias: el dato repetido no se guarda, pero todo lo demás sí. Si
  // le trabáramos el guardado completo, un solo campo con problema le tiraría el
  // avance de toda la sesión y se rinde antes de terminar el expediente.
  for (const ch of choques) limpio[ch.campo] = '';

  const docs = await documentosDe(c.env, s.id);
  const faltantes = faltantesDe(docs);
  // Con un dato repetido el expediente no puede darse por bueno, aunque lo demás esté.
  const estado = ok && !choques.length && faltantes.length === 0 ? 'completo' : 'borrador';

  await c.env.DB.prepare(
    `UPDATE roster_trabajadores SET nombre=?, apellido_paterno=?, apellido_materno=?, celular=?, nss=?, curp=?, rfc=?,
     banco=?, clabe=?, beneficiario=?, emerg_nombre=?, emerg_parentesco=?, emerg_telefono=?, emerg_email=?, puesto=?,
     estado=?, actualizado_en=?, confirmado_en=COALESCE(confirmado_en, ?) WHERE id=?`
  ).bind(
    limpio.nombre, limpio.apellido_paterno, limpio.apellido_materno, limpio.celular, limpio.nss,
    limpio.curp, limpio.rfc, limpio.banco, limpio.clabe, limpio.beneficiario,
    limpio.emerg_nombre, limpio.emerg_parentesco, limpio.emerg_telefono, limpio.emerg_email, limpio.puesto,
    estado, ahora(), ok && !choques.length ? ahora() : null, s.id
  ).run();

  const t = await c.env.DB.prepare('SELECT * FROM roster_trabajadores WHERE id = ?').bind(s.id).first();

  if (ok && !parcial) {
    c.executionCtx.waitUntil((async () => {
      try {
        await enviarCorreo(c.env, { para: t.email, ...correoConfirmacion(empresaDe(c.env), t, faltantes) });
        if (c.env.CORREO_AVISOS) {
          await enviarCorreo(c.env, { para: c.env.CORREO_AVISOS, ...correoAvisoAdmin(empresaDe(c.env), t, faltantes) });
        }
      } catch (e) { console.error('correo confirmación', e); }
    })());
    await registra(c.env, t.email, 'expediente_guardado', estado);
  }

  return c.json({
    ok: true, trabajador: t, faltantes, estado, correo_enviado: ok && !parcial,
    ...(choques.length ? { errores: erroresChoque, duplicados: choques.map((ch) => ch.campo), aviso: avisoChoque } : {}),
  });
});

// ─────────────────────────── documentos ───────────────────────────

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };

app.post('/api/docs', exigeTrabajador, exigeAviso, async (c) => {
  const s = c.get('trabajador');
  const form = await c.req.formData().catch(() => null);
  if (!form) return err(c, 'No recibimos el archivo.');
  const tipo = String(form.get('tipo') || '');
  const etiqueta = String(form.get('etiqueta') || '').slice(0, 80);
  const archivo = form.get('archivo');

  if (!TIPOS.has(tipo)) return err(c, 'Tipo de documento no reconocido.');
  if (!archivo || typeof archivo === 'string') return err(c, 'Falta el archivo.');
  if (archivo.size > MAX_ARCHIVO) return err(c, 'El archivo pesa más de 10 MB. Toma la foto en menor calidad o comprime el PDF.');
  if (!MIMES.has(archivo.type)) return err(c, 'Solo aceptamos JPG, PNG, WEBP, HEIC o PDF.');

  const ext = EXT[archivo.type] || 'bin';
  const llave = `trabajadores/${s.id}/${tipo}-${Date.now()}.${ext}`;
  // Entero en memoria y no como flujo: R2 quiere saber el tamaño de lo que
  // recibe, y aquí el archivo ya pasó por la puerta de la suite. Cabe: el
  // tope son 10 MB.
  await c.env.DOCS.put(llave, await archivo.arrayBuffer(), { httpMetadata: { contentType: archivo.type } });

  // Un solo archivo por tipo, salvo "otro" y "dc3"
  if (tipo !== 'otro' && tipo !== 'dc3') {
    const viejos = await c.env.DB.prepare('SELECT id, llave FROM roster_documentos WHERE trabajador_id = ? AND tipo = ?').bind(s.id, tipo).all();
    for (const v of viejos.results || []) {
      await c.env.DOCS.delete(v.llave).catch(() => {});
      await c.env.DB.prepare('DELETE FROM roster_documentos WHERE id = ?').bind(v.id).run();
    }
  }

  const id = uuid();
  await c.env.DB.prepare(
    'INSERT INTO roster_documentos (id, trabajador_id, tipo, etiqueta, nombre_archivo, llave, mime, tamano, subido_en) VALUES (?,?,?,?,?,?,?,?,?)'
  ).bind(id, s.id, tipo, etiqueta, archivo.name || `${tipo}.${ext}`, llave, archivo.type, archivo.size, ahora()).run();

  await c.env.DB.prepare('UPDATE roster_trabajadores SET actualizado_en = ? WHERE id = ?').bind(ahora(), s.id).run();
  const docs = await documentosDe(c.env, s.id);
  await registra(c.env, s.email, 'documento_subido', tipo);
  return c.json({ ok: true, documentos: docs, faltantes: faltantesDe(docs) });
});

app.delete('/api/docs/:id', exigeTrabajador, async (c) => {
  const s = c.get('trabajador');
  const d = await c.env.DB.prepare('SELECT * FROM roster_documentos WHERE id = ? AND trabajador_id = ?').bind(c.req.param('id'), s.id).first();
  if (!d) return err(c, 'Documento no encontrado.', 404);
  await c.env.DOCS.delete(d.llave).catch(() => {});
  await c.env.DB.prepare('DELETE FROM roster_documentos WHERE id = ?').bind(d.id).run();
  const docs = await documentosDe(c.env, s.id);
  return c.json({ ok: true, documentos: docs, faltantes: faltantesDe(docs) });
});

app.get('/api/docs/:id/archivo', async (c) => {
  const st = await sesionTrabajador(c);
  // Quien no es el dueño del documento tiene que ser del panel, y eso lo dice
  // la suite. Se pregunta sólo si no hay sesión de trabajador, para no gastar
  // una llamada a la API en cada foto que abre alguien de obra.
  const sa = st ? null : await sesionAdminViva(c);
  if (!st && !sa) return err(c, 'No autorizado.', 401);
  const d = await c.env.DB.prepare('SELECT * FROM roster_documentos WHERE id = ?').bind(c.req.param('id')).first();
  if (!d) return err(c, 'Documento no encontrado.', 404);
  if (!sa && d.trabajador_id !== st.id) return err(c, 'No autorizado.', 403);
  const obj = await c.env.DOCS.get(d.llave);
  if (!obj) return err(c, 'El archivo ya no está en el almacenamiento.', 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': d.mime,
      'Content-Disposition': `inline; filename="${limpiaNombre(d.nombre_archivo)}"`,
      'Cache-Control': 'private, max-age=60',
    },
  });
});

// ─────────────────────────── administración ───────────────────────────

/* ─────────────────── las cuentas ─────────────────── */

async function hayCuentas(env) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM roster_administradores').first();
  return (r?.n || 0) > 0;
}

async function cuentaPorEmail(env, email) {
  return await env.DB.prepare('SELECT * FROM roster_administradores WHERE email = ?').bind(email).first();
}

async function cuentaPorId(env, id) {
  return await env.DB.prepare('SELECT * FROM roster_administradores WHERE id = ?').bind(id).first();
}

async function todasLasCuentas(env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM roster_administradores ORDER BY creado_en'
  ).all();
  return results || [];
}

function publica(cuenta) {
  return {
    id: cuenta.id,
    email: cuenta.email,
    nombre: cuenta.nombre,
    nivel: cuenta.nivel,
    activo: !!cuenta.activo,
    creado_en: cuenta.creado_en,
    creado_por: cuenta.creado_por,
    ultimo_acceso: cuenta.ultimo_acceso,
  };
}

// ¿Ya hay cuentas? Lo lee la pantalla de acceso: si no hay ninguna, dice que
// el panel está por estrenar y que lo abre el dueño de la suite.
app.get('/api/admin/estado', async (c) => {
  return c.json({ cuentas: await hayCuentas(c.env) });
});

// Quién soy y qué puedo hacer. Lo lee el panel al abrir.
app.get('/api/admin/yo', exigeSesion, async (c) => {
  const s = c.get('admin');
  return c.json({
    id: s.id, email: s.email, nombre: s.nombre, nivel: s.nivel,
    permisos: permisosDe(s.nivel), de_la_suite: !!s.deLaSuite,
  });
});

// Salir se hace en la suite (`/s101/auth/salir`), que es donde vive la sesión.
// Esta ruta se queda para barrer la cookie del panel de antes del 0.12: quien
// la traiga pegada en el navegador no la necesita para nada.
app.post('/api/admin/salir', (c) => {
  c.header('Set-Cookie', cookie('t101_admin', '', 0));
  return c.json({ ok: true });
});

/* ─────────── manejar las cuentas (solo dueño) ─────────── */

const exigeCuentas = exigePermiso('cuentas');

app.get('/api/admin/cuentas', exigeAdmin, exigeCuentas, async (c) => {
  const cuentas = await todasLasCuentas(c.env);
  return c.json({ cuentas: cuentas.map(publica), niveles: NIVELES.map((n) => ({ nivel: n, nombre: NOMBRE_NIVEL[n], dice: DICE_NIVEL[n] })) });
});

// Dar de alta a alguien en este panel. Ya no se le pone contraseña: entra con
// su cuenta de la suite. Lo que se decide aquí es de qué nivel es.
//
// Son dos altas y las dos hacen falta. Si la persona todavía no está en la
// suite, esta la deja apuntada pero no la deja entrar: hay que darla de alta
// también en workshop101, con roster101 entre sus apps. Se dice aquí mismo
// para que nadie se quede esperando a que «ya quedó».
app.post('/api/admin/cuentas', exigeAdmin, exigeCuentas, async (c) => {
  const yo = c.get('admin');
  const cuerpo = await c.req.json().catch(() => ({}));
  const email = normalizaEmail(cuerpo.email);
  const nombre = String(cuerpo.nombre || '').trim().slice(0, 120);
  const nivel = String(cuerpo.nivel || '');

  const errores = {};
  if (!emailValido(email)) errores.email = 'Escribe un correo válido.';
  if (!nombre) errores.nombre = 'Escribe su nombre.';
  if (!nivelValido(nivel)) errores.nivel = 'Escoge un nivel.';
  if (Object.keys(errores).length) return err(c, 'Revisa lo marcado.', 422, { errores });
  if (await cuentaPorEmail(c.env, email)) return err(c, 'Ese correo ya tiene cuenta en este panel.', 409, { errores: { email: 'Ya tiene cuenta.' } });

  const id = uuid();
  // Las columnas de la contraseña se quedaron atrás en la mudanza a la
  // suite (migración 0007): aquí ya no hay con qué entrar, sólo de qué nivel.
  await c.env.DB.prepare(
    `INSERT INTO roster_administradores (id, email, nombre, nivel, activo, creado_en, creado_por)
     VALUES (?,?,?,?,1,?,?)`
  ).bind(id, email, nombre, nivel, ahora(), yo.email).run();
  await registra(c.env, yo.email, 'cuenta_creada', `${email} · ${NOMBRE_NIVEL[nivel].toLowerCase()}`);
  return c.json({ ok: true, cuenta: publica(await cuentaPorId(c.env, id)) });
});

// Cambiar nombre, nivel o si está activa. Los candados viven en cuentas.js.
app.put('/api/admin/cuentas/:id', exigeAdmin, exigeCuentas, async (c) => {
  const yo = c.get('admin');
  const cuerpo = await c.req.json().catch(() => ({}));
  const cuentas = await todasLasCuentas(c.env);
  const objetivo = cuentas.find((x) => x.id === c.req.param('id'));
  if (!objetivo) return err(c, 'Esa cuenta no existe.', 404);

  const cambio = {};
  if (typeof cuerpo.nombre === 'string') cambio.nombre = cuerpo.nombre.trim().slice(0, 120);
  if (cuerpo.nivel !== undefined) {
    if (!nivelValido(cuerpo.nivel)) return err(c, 'Ese nivel no existe.', 422, { errores: { nivel: 'Escoge un nivel.' } });
    cambio.nivel = cuerpo.nivel;
  }
  if (cuerpo.activo !== undefined) cambio.activo = !!cuerpo.activo;

  const motivo = candado(cuentas, yo, objetivo, cambio);
  if (motivo) return err(c, motivo, 409);

  if (cambio.nombre !== undefined) {
    await c.env.DB.prepare('UPDATE roster_administradores SET nombre = ? WHERE id = ?').bind(cambio.nombre, objetivo.id).run();
  }
  if (cambio.nivel !== undefined && cambio.nivel !== objetivo.nivel) {
    await c.env.DB.prepare('UPDATE roster_administradores SET nivel = ? WHERE id = ?').bind(cambio.nivel, objetivo.id).run();
    await registra(c.env, yo.email, 'cuenta_nivel', `${objetivo.email} · de ${NOMBRE_NIVEL[objetivo.nivel].toLowerCase()} a ${NOMBRE_NIVEL[cambio.nivel].toLowerCase()}`);
  }
  if (cambio.activo !== undefined && cambio.activo !== !!objetivo.activo) {
    await c.env.DB.prepare('UPDATE roster_administradores SET activo = ? WHERE id = ?').bind(cambio.activo ? 1 : 0, objetivo.id).run();
    await registra(c.env, yo.email, cambio.activo ? 'cuenta_activada' : 'cuenta_desactivada', objetivo.email);
  }
  return c.json({ ok: true, cuenta: publica(await cuentaPorId(c.env, objetivo.id)) });
});

// Borrar una cuenta. Su rastro en la bitácora se queda: ahí está por correo.
app.delete('/api/admin/cuentas/:id', exigeAdmin, exigeCuentas, async (c) => {
  const yo = c.get('admin');
  const cuentas = await todasLasCuentas(c.env);
  const objetivo = cuentas.find((x) => x.id === c.req.param('id'));
  const motivo = candado(cuentas, yo, objetivo, { borrar: true });
  if (motivo) return err(c, motivo, objetivo ? 409 : 404);

  await c.env.DB.prepare('DELETE FROM roster_administradores WHERE id = ?').bind(objetivo.id).run();
  await registra(c.env, yo.email, 'cuenta_borrada', `${objetivo.email} · ${NOMBRE_NIVEL[objetivo.nivel].toLowerCase()}`);
  return c.json({ ok: true });
});

// Choques entre expedientes que ya están guardados. Sirve para lo que entró
// antes de este freno, y para lo que se haya cargado a mano.
// Ficha de trabajador en PDF, de uno o de varios. Pensada para mandarse desde el
// celular: el panel la comparte con el botón de compartir del teléfono.
//
// Los datos bancarios NO van por default. Van solo si quien exporta lo pide, para
// que una ficha que se manda por WhatsApp no lleve la CLABE de nadie sin querer.
const TOPE_FICHAS = 50;
// Con los documentos, cada expediente son varios archivos sacados de R2 y metidos
// en memoria para armar el ZIP. De golpe salen tandas más chicas.
const TOPE_FICHAS_CON_DOCS = 15;

// Las cabeceras HTTP solo aguantan ASCII: los acentos del nombre de la empresa
// se quitan ahí, no en el archivo que ve la gente.
const soloAscii = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '').trim();

const IDS_CAMPOS = new Set(CAMPOS_FICHA.map((x) => x.id));

app.post('/api/admin/fichas', exigeAdmin, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const pedidos = Array.isArray(cuerpo.ids) ? cuerpo.ids.filter((x) => typeof x === 'string' && x) : [];

  // Qué campos van en la hoja. Si no mandan lista, la ficha sale completa menos
  // los datos bancarios, como salía antes. `banco: true` se sigue entendiendo.
  const campos = Array.isArray(cuerpo.campos)
    ? cuerpo.campos.filter((x) => IDS_CAMPOS.has(x))
    : [...CAMPOS_POR_DEFECTO];
  if (cuerpo.banco === true && !campos.includes('banco')) campos.push('banco');
  const conBanco = campos.includes('banco');

  // Con documentos la descarga es un ZIP: adentro, el PDF con todas las fichas y
  // un ZIP por trabajador con lo que subió. Sin documentos, el PDF pelón.
  const conDocs = cuerpo.documentos === true;
  const tope = conDocs ? TOPE_FICHAS_CON_DOCS : TOPE_FICHAS;

  if (!pedidos.length) return err(c, 'Selecciona al menos un trabajador.', 400);
  if (pedidos.length > tope) {
    return err(c, conDocs
      ? `Con los documentos son muchos de golpe. Haz tandas de ${tope} o menos, o apaga "Documentos escaneados".`
      : `Son muchas de golpe. Haz tandas de ${tope} o menos.`, 400);
  }

  const marcas = pedidos.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM roster_trabajadores WHERE id IN (${marcas}) AND ${SOLO_VIVOS}
     ORDER BY apellido_paterno, apellido_materno, nombre`
  ).bind(...pedidos).all();
  const gente = results || [];
  if (!gente.length) return err(c, 'No encontré esos expedientes.', 404);

  for (const t of gente) {
    t.__foto = null;

    // Si la ficha va sin fotografía, ni se busca: es un archivo menos que sacar
    // de R2 y una foto menos rodando en un PDF que no la necesita.
    const foto = !campos.includes('foto') ? null : await c.env.DB.prepare(
      "SELECT llave, mime FROM roster_documentos WHERE trabajador_id = ? AND tipo = 'foto' ORDER BY subido_en DESC LIMIT 1"
    ).bind(t.id).first();
    if (foto) {
      // Solo el JPEG se puede pegar tal cual dentro del PDF. Si subió PNG o PDF,
      // la ficha sale con el recuadro vacío y avisa, en vez de mentir.
      if (foto.mime === 'image/jpeg') {
        const obj = await c.env.DOCS.get(foto.llave);
        if (obj) t.__foto = { bytes: new Uint8Array(await obj.arrayBuffer()) };
        else t.__foto = { bytes: null };
      } else {
        t.__foto = { bytes: null };
      }
    }
  }

  const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const pdf = armaFichas(gente, {
    empresa: empresaDe(c.env),
    campos, fecha,
  });

  const hoy = new Date().toISOString().slice(0, 10);
  const nombrePdf = nombreArchivoFichas(gente, hoy, 'pdf', empresaDe(c.env));

  // Sin documentos se baja el PDF y ya. Con documentos, el PDF se mete en un ZIP
  // junto con un ZIP por trabajador: es la única forma de bajar varios archivos
  // de una sola vez desde el navegador.
  const cuerpoArchivo = conDocs
    ? await armaZipFichas(
        c.env, gente,
        (t) => c.env.DB.prepare(
          'SELECT tipo, etiqueta, nombre_archivo, llave, mime FROM roster_documentos WHERE trabajador_id = ? ORDER BY subido_en'
        ).bind(t.id).all().then((r) => r.results || []),
        pdf, nombrePdf,
      )
    : pdf;

  const nombre = conDocs ? nombreArchivoFichas(gente, hoy, 'zip', empresaDe(c.env)) : nombrePdf;
  const simple = soloAscii(nombre);
  await registra(c.env, c.get('admin').email, conDocs ? 'fichas_zip' : 'fichas_pdf',
    `${gente.length} ficha(s) con: ${campos.join(', ') || 'solo el nombre'}${conDocs ? ' + documentos' : ''}`);

  return new Response(cuerpoArchivo, {
    headers: {
      'Content-Type': conDocs ? 'application/zip' : 'application/pdf',
      'Content-Disposition': `attachment; filename="${simple}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'Cache-Control': 'no-store',
    },
  });
});

app.get('/api/admin/duplicados', exigeAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, folio, nombre, apellido_paterno, apellido_materno, email, celular, nss, curp, rfc, estado
     FROM roster_trabajadores WHERE ${SOLO_VIVOS}`
  ).all();
  const gente = results || [];
  const grupos = [];
  for (const [campo, nombre] of UNICOS) {
    const por = new Map();
    for (const t of gente) {
      const v = String(t[campo] || '').trim();
      if (!v) continue;
      if (!por.has(v)) por.set(v, []);
      por.get(v).push(t);
    }
    for (const [valor, quienes] of por) {
      if (quienes.length > 1) grupos.push({ campo, nombre, valor, trabajadores: quienes });
    }
  }
  return c.json({ duplicados: grupos });
});

app.get('/api/admin/trabajadores', exigeAdmin, async (c) => {
  await vaciaVencidos(c.env);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM roster_trabajadores WHERE ${SOLO_VIVOS} ORDER BY apellido_paterno, apellido_materno, nombre`
  ).all();
  const docs = await c.env.DB.prepare('SELECT id, trabajador_id, tipo, etiqueta, nombre_archivo, mime, tamano FROM roster_documentos').all();
  const porTrab = {};
  for (const d of docs.results || []) (porTrab[d.trabajador_id] ||= []).push(d);
  const lista = (results || []).map((t) => {
    const ds = porTrab[t.id] || [];
    return { ...t, documentos: ds, faltantes: faltantesDe(ds), faltan_campos: faltantesCampos(t) };
  });
  return c.json({ trabajadores: lista, nombres_doc: NOMBRES_DOC });
});

// El expediente de una persona, como ella lo ve. Sirve para abrirlo desde el
// panel y saber exactamente en qué va: qué escribió, qué le falta de escribir y
// qué papeles entregó. Los documentos vienen para verse, no para tocarse: no hay
// ruta de administración que suba ni borre un documento ajeno, y no la va a
// haber. Eso lo hace la persona desde su portal, y así el expediente sigue
// siendo suyo.
app.get('/api/admin/trabajadores/:id', exigeAdmin, async (c) => {
  const t = await c.env.DB.prepare('SELECT * FROM roster_trabajadores WHERE id = ?').bind(c.req.param('id')).first();
  if (!t) return err(c, 'Ese trabajador ya no está.', 404);
  const docs = await documentosDe(c.env, t.id);
  return c.json({
    trabajador: t,
    documentos: docs,
    faltantes: faltantesDe(docs),
    faltan_campos: faltantesCampos(t),
    aviso: await consentimientoDe(c.env, t.id),
    campos: CAMPOS_EXPEDIENTE,
    nombres_doc: NOMBRES_DOC,
    obligatorios: DOCS_OBLIGATORIOS,
  });
});

// Capturar por alguien. Pasa por la misma revisión que si lo escribiera él, con
// los mismos frenos de datos repetidos, y queda apuntado en la bitácora con el
// nombre de a quién se le tocó el expediente: si administración escribe algo, se
// tiene que poder ver quién lo escribió.
//
// Lo que NO hace: dar por aceptado el aviso de privacidad. Ese consentimiento es
// de la persona y nadie lo puede dar por ella, así que si no lo ha aceptado, su
// expediente se queda en borrador aunque esté todo lleno.
app.put('/api/admin/trabajadores/:id', exigeAdmin, exigePermiso('capturar'), async (c) => {
  const id = c.req.param('id');
  const t = await c.env.DB.prepare('SELECT * FROM roster_trabajadores WHERE id = ?').bind(id).first();
  if (!t) return err(c, 'Ese trabajador ya no está.', 404);

  const cuerpo = await c.req.json().catch(() => ({}));
  const parcial = cuerpo.__parcial === true;
  const { errores, limpio, ok } = revisaExpediente(cuerpo);
  if (!ok && !parcial) return err(c, 'Revisa los datos marcados.', 422, { errores });

  // Un dato repetido frena aunque se esté capturando a medias. Cuando alguien
  // escribe por otra persona, una CURP que ya existe casi siempre quiere decir
  // que se abrió el expediente equivocado: mejor detenerse que encimar dos.
  const choques = await choquesDe(c.env, id, limpio);
  if (choques.length) {
    const erroresChoque = {};
    for (const ch of choques) erroresChoque[ch.campo] = ch.mensaje;
    return err(c, 'Esos datos ya están en otro expediente.', 409, { errores: erroresChoque });
  }

  const docs = await documentosDe(c.env, id);
  const faltantes = faltantesDe(docs);
  const consent = await consentimientoDe(c.env, id);
  const estado = ok && !choques.length && !faltantes.length && consent ? 'completo' : 'borrador';

  await c.env.DB.prepare(
    `UPDATE roster_trabajadores SET nombre=?, apellido_paterno=?, apellido_materno=?, celular=?, nss=?, curp=?, rfc=?,
     banco=?, clabe=?, beneficiario=?, emerg_nombre=?, emerg_parentesco=?, emerg_telefono=?, emerg_email=?, puesto=?,
     estado=?, actualizado_en=? WHERE id=?`
  ).bind(
    limpio.nombre, limpio.apellido_paterno, limpio.apellido_materno, limpio.celular, limpio.nss,
    limpio.curp, limpio.rfc, limpio.banco, limpio.clabe, limpio.beneficiario,
    limpio.emerg_nombre, limpio.emerg_parentesco, limpio.emerg_telefono, limpio.emerg_email, limpio.puesto,
    estado, ahora(), id
  ).run();

  // Se apunta a nombre del trabajador, no de quien lo escribió: así el renglón
  // sale junto a lo demás de su expediente, que es donde se busca.
  await registra(c.env, t.email, 'expediente_capturado', 'lo capturó administración');

  const nuevo = await c.env.DB.prepare('SELECT * FROM roster_trabajadores WHERE id = ?').bind(id).first();
  return c.json({
    ok: true,
    trabajador: nuevo,
    estado,
    faltantes,
    faltan_campos: faltantesCampos(nuevo),
    errores: parcial ? errores : {},
    sin_aviso: !consent,
  });
});

// Dar de baja: se manda a la papelera, no se borra.
app.delete('/api/admin/trabajadores/:id', exigeAdmin, exigePermiso('baja'), async (c) => {
  const id = c.req.param('id');
  const t = await c.env.DB.prepare('SELECT id, email FROM roster_trabajadores WHERE id = ?').bind(id).first();
  if (!t) return err(c, 'Ese trabajador ya no está.', 404);
  if (await estaEnPapelera(c.env, id)) return err(c, 'Ese trabajador ya está en la papelera.', 409);

  const ahoraSeg = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    'INSERT INTO roster_papelera (trabajador_id, borrado_en, borra_el) VALUES (?,?,?)'
  ).bind(id, ahora(), ahoraSeg + DIAS_PAPELERA * 86400).run();
  await registra(c.env, c.get('admin').email, 'baja_trabajador', `${t.email} → papelera (${DIAS_PAPELERA} días)`);
  return c.json({ ok: true, dias: DIAS_PAPELERA });
});

// Lo que está en la papelera, con los días que le quedan.
app.get('/api/admin/papelera', exigeAdmin, async (c) => {
  await vaciaVencidos(c.env);
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.folio, t.nombre, t.apellido_paterno, t.apellido_materno, t.email, t.curp, t.nss,
            p.borrado_en, p.borra_el,
            (SELECT COUNT(*) FROM roster_documentos d WHERE d.trabajador_id = t.id) AS documentos
     FROM roster_papelera p JOIN roster_trabajadores t ON t.id = p.trabajador_id
     ORDER BY p.borra_el`
  ).all();
  const t = Math.floor(Date.now() / 1000);
  const lista = (results || []).map((r) => ({
    ...r,
    dias_restantes: Math.max(0, Math.ceil((r.borra_el - t) / 86400)),
  }));
  return c.json({ papelera: lista, dias: DIAS_PAPELERA });
});

// Devolver a alguien de la papelera. Puede que mientras estuvo apartado alguien
// más se haya registrado con su mismo dato; en ese caso no se devuelve solo,
// porque quedarían dos expedientes con la misma CURP.
app.post('/api/admin/papelera/:id/restaurar', exigeAdmin, exigePermiso('baja'), async (c) => {
  const id = c.req.param('id');
  if (!await estaEnPapelera(c.env, id)) return err(c, 'Ese trabajador no está en la papelera.', 404);
  const t = await c.env.DB.prepare('SELECT * FROM roster_trabajadores WHERE id = ?').bind(id).first();
  if (!t) return err(c, 'Ese expediente ya no existe.', 404);

  const choques = await choquesDe(c.env, id, t);
  if (choques.length) {
    return err(
      c,
      `No lo puedo devolver: mientras estuvo en la papelera, otro expediente se quedó con ${enumera(choques.map((ch) => ch.nombre))}. Resuelve ese choque primero.`,
      409,
      { duplicados: choques.map((ch) => ch.campo) }
    );
  }

  await c.env.DB.prepare('DELETE FROM roster_papelera WHERE trabajador_id = ?').bind(id).run();
  await registra(c.env, c.get('admin').email, 'restaurar_trabajador', t.email);
  return c.json({ ok: true });
});

// Borrar ya, sin esperar los 30 días. Esto sí no se deshace.
app.delete('/api/admin/papelera/:id', exigeAdmin, exigePermiso('baja'), async (c) => {
  const id = c.req.param('id');
  if (!await estaEnPapelera(c.env, id)) return err(c, 'Ese trabajador no está en la papelera.', 404);
  const t = await c.env.DB.prepare('SELECT email FROM roster_trabajadores WHERE id = ?').bind(id).first();
  await borraDeVerdad(c.env, id);
  await registra(c.env, c.get('admin').email, 'borrado_definitivo', `${t ? t.email : id} (a mano)`);
  return c.json({ ok: true });
});

app.get('/api/admin/exportar', exigeAdmin, exigePermiso('exportar'), async (c) => {
  const zip = await armaZip(c.env);
  const fecha = new Date().toISOString().slice(0, 10);
  await registra(c.env, c.get('admin').email, 'exportacion');
  return new Response(zip, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${soloAscii(`Expedientes ${empresaDe(c.env)} ${fecha}`)}.zip"`,
    },
  });
});

// ─────────────────────────── bitácora ───────────────────────────
// Todo lo que pasa en el portal ya se venía apuntando desde el primer día; lo
// que faltaba era poder leerlo. Se enseña todo junto, en un solo hilo, y son
// las casillas las que deciden qué se ve: quien busca "¿a quién le mandamos su
// código?" no quiere el mismo renglón que quien busca "¿ya subió sus papeles?".

// El catálogo manda. `dice` es lo que se lee en el renglón; `corto`, lo que se
// lee en la casilla; `grupo`, en qué montón va. La marca `sola` es la que viene
// prendida de entrada: pedir acceso es lo que se consulta casi siempre.
// `capa` dice en qué pantalla de roster101 se enseña cada movimiento:
//   'empresa'   → el panel de la empresa. Lo que hace su gente con su expediente.
//   'roster101' → el panel maestro, el nuestro. Quién administró y qué se llevó.
// Se apuntan las dos, siempre; lo que cambia es dónde se leen. El panel de la
// empresa no tiene por qué llenarse de renglones de "entró a administración"
// cuando lo que se viene a ver es a quién le mandamos su código.
const ACCIONES_BITACORA = [
  { accion: 'codigo_enviado', capa: 'empresa', grupo: 'Accesos', corto: 'Pidió su código', dice: 'Pidió entrar — se le mandó su código', tono: 'bien', sola: true },
  { accion: 'ingreso', capa: 'empresa', grupo: 'Accesos', corto: 'Usó su acceso', dice: 'Usó su acceso — entró al portal', tono: 'bien' },
  { accion: 'alta', capa: 'empresa', grupo: 'Accesos', corto: 'Entró por primera vez', dice: 'Entró por primera vez', tono: 'bien' },
  { accion: 'codigo_malo', capa: 'empresa', grupo: 'Accesos', corto: 'Escribió mal el código', dice: 'Escribió mal el código', tono: 'mal' },
  { accion: 'codigo_no_enviado', capa: 'empresa', grupo: 'Accesos', corto: 'El código no salió', dice: 'Pidió entrar — el código NO salió', tono: 'mal' },
  { accion: 'codigo_repetido', capa: 'empresa', grupo: 'Accesos', corto: 'Pidió otro muy seguido', dice: 'Pidió otro código muy seguido', tono: '' },

  { accion: 'expediente_guardado', capa: 'empresa', grupo: 'Expedientes', corto: 'Guardó sus datos', dice: 'Guardó su expediente', tono: '' },
  { accion: 'documento_subido', capa: 'empresa', grupo: 'Expedientes', corto: 'Subió un documento', dice: 'Subió un documento', tono: '' },
  { accion: 'aviso_aceptado', capa: 'empresa', grupo: 'Expedientes', corto: 'Aceptó el aviso', dice: 'Aceptó el aviso de privacidad', tono: '' },
  // Este sí es del expediente, no del panel: es alguien escribiendo en la hoja
  // de otra persona, y eso se tiene que poder ver donde vive el expediente.
  { accion: 'expediente_capturado', capa: 'empresa', grupo: 'Expedientes', corto: 'Capturaron por él', dice: 'Capturaron datos en su expediente', tono: '' },

  { accion: 'clave_cambiada', capa: 'roster101', grupo: 'Panel', corto: 'Cambió la clave', dice: 'Cambió la clave del panel', tono: '' },
  { accion: 'clave_restaurada', capa: 'roster101', grupo: 'Panel', corto: 'Restauró la clave', dice: 'Restauró la clave con el código del correo', tono: 'mal' },
  { accion: 'clave_recuperacion_pedida', capa: 'roster101', grupo: 'Panel', corto: 'Pidió recuperar la clave', dice: 'Pidió el código para recuperar la clave', tono: 'mal' },
  { accion: 'ingreso_admin', capa: 'roster101', grupo: 'Panel', corto: 'Entró al panel', dice: 'Entró al panel de la empresa', tono: '' },
  { accion: 'admin_clave_mala', capa: 'roster101', grupo: 'Panel', corto: 'Falló la clave', dice: 'Falló la clave del panel', tono: 'mal' },
  { accion: 'admin_bloqueado', capa: 'roster101', grupo: 'Panel', corto: 'Se bloqueó por fallar', dice: 'Se bloqueó por fallar la clave', tono: 'mal' },
  { accion: 'fichas_pdf', capa: 'roster101', grupo: 'Panel', corto: 'Descargó fichas', dice: 'Descargó fichas en PDF', tono: '' },
  { accion: 'fichas_zip', capa: 'roster101', grupo: 'Panel', corto: 'Descargó fichas y documentos', dice: 'Descargó fichas con documentos', tono: '' },
  { accion: 'exportacion', capa: 'roster101', grupo: 'Panel', corto: 'Exportó todo', dice: 'Exportó todos los expedientes', tono: '' },
  { accion: 'baja_trabajador', capa: 'roster101', grupo: 'Panel', corto: 'Dio de baja', dice: 'Dio de baja a un trabajador', tono: 'mal' },
  { accion: 'restaurar_trabajador', capa: 'roster101', grupo: 'Panel', corto: 'Restauró de la papelera', dice: 'Restauró a un trabajador de la papelera', tono: '' },
  { accion: 'borrado_definitivo', capa: 'roster101', grupo: 'Panel', corto: 'Borró para siempre', dice: 'Borró un expediente para siempre', tono: 'mal' },
  // Las cuentas del panel (0.11): quién dio de alta a quién, quién apagó a quién.
  { accion: 'cuenta_creada', capa: 'roster101', grupo: 'Cuentas', corto: 'Creó una cuenta', dice: 'Creó una cuenta del panel', tono: '' },
  { accion: 'cuenta_nivel', capa: 'roster101', grupo: 'Cuentas', corto: 'Cambió un nivel', dice: 'Cambió el nivel de una cuenta', tono: '' },
  { accion: 'cuenta_desactivada', capa: 'roster101', grupo: 'Cuentas', corto: 'Desactivó una cuenta', dice: 'Desactivó una cuenta del panel', tono: 'mal' },
  { accion: 'cuenta_activada', capa: 'roster101', grupo: 'Cuentas', corto: 'Reactivó una cuenta', dice: 'Reactivó una cuenta del panel', tono: '' },
  { accion: 'cuenta_borrada', capa: 'roster101', grupo: 'Cuentas', corto: 'Borró una cuenta', dice: 'Borró una cuenta del panel', tono: 'mal' },
  { accion: 'clave_reiniciada', capa: 'roster101', grupo: 'Cuentas', corto: 'Repuso una contraseña', dice: 'Le repuso la contraseña a otra cuenta', tono: 'mal' },
];

// Lo que se puede ver desde el panel de la empresa.
const ACCIONES_EMPRESA = ACCIONES_BITACORA.filter((a) => a.capa === 'empresa');


const POR_ACCION = Object.fromEntries(ACCIONES_BITACORA.map((a) => [a.accion, a]));

// El detalle se apuntó en corto, para el que lo escribió. Aquí se dice completo,
// para el que lo lee: "nss" es "Constancia NSS" y "borrador" es que quedó a medias.
function detalleLegible(accion, detalle) {
  const d = String(detalle || '');
  if (!d) return '';
  if (accion === 'documento_subido') return NOMBRES_DOC[d] || d;
  if (accion === 'expediente_guardado') return d === 'completo' ? 'quedó completo' : 'quedó en borrador';
  if (accion === 'aviso_aceptado') return `versión ${d}`;
  return d;
}
const ACCIONES_POR_DEFECTO = ACCIONES_EMPRESA.filter((a) => a.sola).map((a) => a.accion);

// Arma la consulta con los filtros que vengan. Devuelve el SQL de condiciones y
// sus valores, para que la lista y el CSV pregunten exactamente lo mismo.
function filtrosBitacora(c) {
  const q = String(c.req.query('q') || '').trim().toLowerCase().slice(0, 80);
  const dias = Math.min(730, Math.max(1, Number(c.req.query('dias')) || 30));

  // Solo se aceptan acciones del catálogo: lo que venga inventado se ignora, y
  // si no queda ninguna en pie se usa la de entrada en vez de enseñarlo todo.
  // Solo se aceptan acciones de esta capa: "todo" quiere decir todo lo que se
  // puede ver aquí, no todo lo que hay en la tabla. Lo que venga de fuera del
  // catálogo se ignora, y si no queda ninguna en pie se usa la de entrada.
  const visibles = new Set(ACCIONES_EMPRESA.map((a) => a.accion));
  const pedidas = String(c.req.query('acciones') ?? '').split(',').map((a) => a.trim()).filter(Boolean);
  let acciones = pedidas.includes('todo') ? [...visibles] : pedidas.filter((a) => visibles.has(a));
  if (!acciones.length) acciones = ACCIONES_POR_DEFECTO;

  const donde = [`accion IN (${acciones.map(() => '?').join(',')})`];
  const valores = [...acciones];

  const desde = new Date(Date.now() - dias * 86400_000).toISOString();
  donde.push('cuando >= ?');
  valores.push(desde);

  if (q) {
    donde.push('(lower(quien) LIKE ? OR lower(detalle) LIKE ?)');
    valores.push(`%${q}%`, `%${q}%`);
  }

  return { sql: 'WHERE ' + donde.join(' AND '), valores, acciones, q, dias };
}

app.get('/api/admin/bitacora', exigeAdmin, async (c) => {
  const f = filtrosBitacora(c);
  const porPagina = 150;
  const pagina = Math.max(0, Number(c.req.query('pagina')) || 0);

  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM roster_bitacora ${f.sql}`)
    .bind(...f.valores).first();
  const { results } = await c.env.DB.prepare(
    `SELECT cuando, quien, accion, detalle FROM roster_bitacora ${f.sql} ORDER BY cuando DESC LIMIT ? OFFSET ?`
  ).bind(...f.valores, porPagina, pagina * porPagina).all();

  return c.json({
    renglones: (results || []).map((r) => ({
      ...r,
      detalle: detalleLegible(r.accion, r.detalle),
      dice: POR_ACCION[r.accion]?.dice || r.accion,
      tono: POR_ACCION[r.accion]?.tono || '',
    })),
    total: total?.n || 0,
    pagina,
    por_pagina: porPagina,
    dias: f.dias,
    // El catálogo viaja con la respuesta para que las casillas se pinten con lo
    // que el servidor de verdad sabe filtrar, y no con una copia que se despinte.
    tipos: ACCIONES_EMPRESA.map(({ accion, grupo, corto, sola }) => ({ accion, grupo, corto, sola: !!sola })),
  });
});

app.get('/api/admin/bitacora.csv', exigeAdmin, async (c) => {
  const f = filtrosBitacora(c);
  const { results } = await c.env.DB.prepare(
    `SELECT cuando, quien, accion, detalle FROM roster_bitacora ${f.sql} ORDER BY cuando DESC LIMIT 20000`
  ).bind(...f.valores).all();

  const filas = [['Fecha', 'Hora', 'Quién', 'Qué pasó', 'Detalle'].join(',')];
  for (const r of results || []) {
    const d = new Date(r.cuando);
    // La hora se escribe en la del centro de México, que es la que ve quien lee.
    const fecha = d.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' });
    const hora = d.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    filas.push([fecha, hora, r.quien, POR_ACCION[r.accion]?.dice || r.accion, detalleLegible(r.accion, r.detalle)].map(csvCampo).join(','));
  }

  return new Response('\ufeff' + filas.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${soloAscii(`Bitacora ${empresaDe(c.env)}`)}.csv"`,
    },
  });
});

app.get('/api/admin/tabla.csv', exigeAdmin, exigePermiso('exportar'), async (c) => {
  const csv = await exportarCsv(c.env);
  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${soloAscii(`Trabajadores ${empresaDe(c.env)}`)}.csv"`,
    },
  });
});

app.get('/api/salud', (c) => c.json({ ok: true, servicio: 'roster101', datos: 'suite', hora: ahora() }));

// Datos del responsable: los lee el navegador para armar el aviso de privacidad.
app.get('/api/config', (c) => c.json({
  empresa: c.env.EMPRESA || 'la empresa',
  razon_social: c.env.RAZON_SOCIAL || c.env.EMPRESA || 'la empresa',
  domicilio: c.env.DOMICILIO || '',
  correo_privacidad: c.env.CORREO_PRIVACIDAD || c.env.CORREO_AVISOS || '',
  aviso_version: c.env.AVISO_VERSION || '1',
  version: c.env.PORTAL_VERSION || '',
}));

// ─────────────────────────── lo demás ───────────────────────────
// El sitio (public/) lo sirve el Worker de la empresa; aquí sólo hay /api/*.
app.all('*', (c) => err(c, 'Esa ruta no existe en el motor de roster101.', 404));

/* El barrido diario de la papelera vivía en el reloj de cada Worker (cron
 * 4:00 UTC). Dentro de la suite no hay reloj por empresa: la papelera se
 * vacía cada vez que la administración abre el panel (`vaciaVencidos`, en la
 * lista y en la papelera), que era la segunda vía de siempre. Lo que ya
 * cumplió sus 30 días se borra en cuanto alguien entra. */

/** La entrada desde el Durable Object: la petición tal cual, el entorno
 *  armado por OrgDB (motor.d.ts) y un `ctx` con `waitUntil` para el correo
 *  de confirmación que sale después de contestar. */
export function atender(req, env, ctx) {
  return app.fetch(req, env, ctx);
}
