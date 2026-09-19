/* roster101 dentro de la suite (contrato 0.17.0).
 *
 * Lo que medían las pruebas del Worker de roster101 (0110 las reglas de
 * cuentas, 0112 la puerta del panel) más lo que ahí no se podía medir sin
 * base: el trabajador entrando con su correo y su código, subiendo un
 * documento, chocando con un dato repetido, y la administración capturando,
 * sacando fichas, exportando y usando la papelera. Todo contra el motor
 * corriendo DENTRO del Durable Object, con la puerta de la suite de verdad
 * delante.
 *
 * Al final, la mudanza: una D1 sembrada como la de producción (schema.sql +
 * su migración) se trae en seco y luego de verdad, con sus archivos. */

import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../src/entorno';

const CORREO = 'mike@forespot.com';
const ORG = 'expedientes';
const GENTE = {
  duena: { correo: 'duena@ejemplo.mx', nombre: 'Dueña de la empresa', rol: 'admin', apps: [] as string[] },
  fer: { correo: 'fer@ejemplo.mx', nombre: 'Fer', rol: 'staff', apps: ['roster'] },
  mira: { correo: 'mira@ejemplo.mx', nombre: 'Quien Mira', rol: 'staff', apps: ['roster'] },
  sindash: { correo: 'solo-dash@ejemplo.mx', nombre: 'Sólo dash', rol: 'staff', apps: ['dash'] },
};
const EMPRESA = { empresa: 'Taller de pruebas', razon_social: 'Taller de Pruebas y Diseño SA de CV', domicilio: 'Calle 1', correo_privacidad: 'privacidad@ejemplo.mx', correo_avisos: 'avisos@ejemplo.mx', aviso_version: '2026-09-03', version: '0.13.0' };
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

/* Datos mexicanos válidos, con su dígito verificador calculado como lo
 * calcula validar.js: la prueba no se aprende un CURP de memoria. */
function curpValida(base17: string): string {
  const dic = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += dic.indexOf(base17[i]) * (18 - i);
  return base17 + String((10 - (suma % 10)) % 10);
}
function clabeValida(base17: string): string {
  const pesos = [3, 7, 1];
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += ((Number(base17[i]) * pesos[i % 3]) % 10);
  return base17 + String((10 - (suma % 10)) % 10);
}
const expediente = (n: number) => ({
  nombre: `Juan ${n}`, apellido_paterno: 'Gómez', apellido_materno: 'Ruiz', celular: `55123456${String(n).padStart(2, '0')}`,
  nss: `1234567890${n % 10}`, curp: curpValida(`GORJ90010${n % 10}HDFMZN0`), rfc: `GORJ90010${n % 10}AB${n % 10}`,
  banco: 'BBVA', clabe: clabeValida(`0121800012345678${n % 10}`), beneficiario: 'María Gómez',
  emerg_nombre: 'María Gómez', emerg_parentesco: 'Madre', emerg_telefono: `55987654${String(n).padStart(2, '0')}`, emerg_email: '', puesto: 'Carpintero',
});

const galletas: Record<string, string> = {};

async function pedir(quien: string, ruta: string, opciones: RequestInit & { app?: string; json?: unknown; roster?: boolean } = {}) {
  const cabeceras: Record<string, string> = {};
  if (opciones.app !== '') cabeceras['X-App'] = opciones.app ?? 'roster101';
  // Como la manda el Worker de la empresa: el JSON codificado, en ASCII.
  if (opciones.roster !== false) cabeceras['X-Roster'] = encodeURIComponent(JSON.stringify(EMPRESA));
  if (galletas[quien]) cabeceras.Cookie = galletas[quien];
  let body = opciones.body;
  if (opciones.json !== undefined) { body = JSON.stringify(opciones.json); cabeceras['Content-Type'] = 'application/json'; }
  const r = await SELF.fetch(`https://api.local${ruta}`, { ...opciones, body, headers: { ...cabeceras, ...(opciones.headers as object) } });
  const puesta = r.headers.get('Set-Cookie');
  if (puesta) galletas[quien] = puesta.split(';')[0];
  const tipo = r.headers.get('content-type') || '';
  if (!/json/.test(tipo)) return { estado: r.status, tipo, bytes: new Uint8Array(await r.arrayBuffer()) } as { estado: number; [k: string]: any };
  const texto = await r.text();
  let cuerpo: any = {};
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = { texto }; }
  // `estado` es el código HTTP; el `estado` del expediente (borrador |
  // completo) que traen algunas respuestas queda en `expediente_estado`.
  return { ...cuerpo, expediente_estado: cuerpo.estado, estado: r.status } as { estado: number; [k: string]: any };
}
/** Las rutas de roster: `/roster/expedientes/api/…`; la respuesta viene sin envolver. */
const r = (quien: string, ruta: string, opciones: Parameters<typeof pedir>[2] = {}) => pedir(quien, `/roster/${ORG}${ruta}`, opciones);

async function entrar(quien: string, correo: string) {
  galletas[quien] = '';
  const c = await pedir(quien, '/auth/codigo', { method: 'POST', json: { correo }, app: '' });
  expect(c.estado, `código para ${correo}: ${JSON.stringify(c)}`).toBe(200);
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, `entrar ${correo}: ${JSON.stringify(e)}`).toBe(200);
}
/** El trabajador entra por SU puerta: correo y código, sin cuenta en la suite. */
async function entrarTrabajador(quien: string, email: string, org = ORG) {
  galletas[quien] = '';
  const c = await pedir(quien, `/roster/${org}/api/codigo`, { method: 'POST', json: { email } });
  expect(c.estado, JSON.stringify(c)).toBe(200);
  expect(c.codigo_prueba).toMatch(/^\d{6}$/);
  const e = await pedir(quien, `/roster/${org}/api/entrar`, { method: 'POST', json: { email, codigo: c.codigo_prueba } });
  expect(e.estado, JSON.stringify(e)).toBe(200);
  expect(galletas[quien]).toMatch(/^t101_sesion=/);
  return e;
}

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Expedientes de prueba' }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
  for (const [apodo, g] of Object.entries(GENTE)) {
    const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: { correo: g.correo, rol: g.rol, nombre: g.nombre, apps: g.apps }, app: '' });
    expect(m.estado, JSON.stringify(m)).toBe(201);
    await entrar(apodo, g.correo);
  }
}, 60000);

describe('la puerta /roster/:o', () => {
  it('exige X-App roster101, una empresa que exista y roster101 prendido', async () => {
    expect((await r('mike', '/api/salud', { app: '' })).estado).toBe(400);
    expect((await r('mike', '/api/salud', { app: 'dash101' })).estado).toBe(400);
    expect((await pedir('mike', '/roster/no-existe/api/salud')).estado).toBe(404);
    const apagar = await pedir('mike', `/admin/orgs/${ORG}`, { method: 'PATCH', json: { apps: { roster: false } }, app: '' });
    expect(apagar.estado, JSON.stringify(apagar)).toBe(200);
    const cerrada = await r('mike', '/api/salud');
    expect(cerrada.estado).toBe(403);
    expect(cerrada.error).toBe('app_inactiva');
    expect((await pedir('mike', `/admin/orgs/${ORG}`, { method: 'PATCH', json: { apps: { roster: true } }, app: '' })).estado).toBe(200);
    const salud = await r('nadie', '/api/salud');
    expect(salud.estado).toBe(200);
    expect(salud.servicio).toBe('roster101');
    expect(salud.datos).toBe('suite');
  });
  it('los datos de la empresa los manda su Worker; sin ellos, el nombre de la empresa en la suite', async () => {
    const con = await r('nadie', '/api/config');
    expect(con.empresa).toBe('Taller de pruebas');
    expect(con.razon_social).toBe('Taller de Pruebas y Diseño SA de CV');
    expect(con.aviso_version).toBe('2026-09-03');
    expect(con.version).toBe('0.13.0');
    const sin = await r('nadie', '/api/config', { roster: false });
    expect(sin.empresa).toBe('Expedientes de prueba');
  });
});

describe('quién entra al panel (lo que medía 0112, contra la suite de verdad)', () => {
  it('el dueño de la suite entra como dueño aunque el panel esté recién puesto', async () => {
    const yo = await r('mike', '/api/admin/yo');
    expect(yo.estado, JSON.stringify(yo)).toBe(200);
    expect(yo.nivel).toBe('dueno');
    expect(yo.de_la_suite).toBe(true);
    expect(yo.permisos.cuentas).toBe(true);
    expect((await r('mike', '/api/admin/estado')).cuentas).toBe(false);
  });
  it('la administración de la empresa también (es lo que arranca el panel sin la central)', async () => {
    const yo = await r('duena', '/api/admin/yo');
    expect(yo.estado, JSON.stringify(yo)).toBe(200);
    expect(yo.nivel).toBe('dueno');
    expect(yo.de_la_suite).toBe(true);
  });
  it('quien NO entra: sin sesión, sin roster101 en sus apps, o sin cuenta en el panel', async () => {
    expect((await r('nadie', '/api/admin/yo')).estado).toBe(401);
    expect((await r('nadie', '/api/admin/yo', { headers: { Cookie: 's101=inventada.firmaQueNoEs; t101_admin=tampoco' } })).estado).toBe(401);
    expect((await r('sindash', '/api/admin/yo')).estado).toBe(401);
    expect((await r('fer', '/api/admin/yo')).estado).toBe(401);
    for (const ruta of ['/api/admin/trabajadores', '/api/admin/tabla.csv', '/api/admin/exportar']) expect((await r('nadie', ruta)).estado).toBe(401);
  });
  it('con cuenta en el panel entra con su nivel (la lista de apps lleva la llave corta, que es la única que la suite acepta)', async () => {
    const fer = await r('mike', '/api/admin/cuentas', { method: 'POST', json: { email: GENTE.fer.correo.toUpperCase(), nombre: 'Fer', nivel: 'admin' } });
    expect(fer.estado, JSON.stringify(fer)).toBe(200);
    const mira = await r('mike', '/api/admin/cuentas', { method: 'POST', json: { email: GENTE.mira.correo, nombre: 'Quien Mira', nivel: 'consulta' } });
    expect(mira.estado).toBe(200);
    expect((await r('mike', '/api/admin/cuentas', { method: 'POST', json: { email: GENTE.fer.correo, nombre: 'Otra vez', nivel: 'admin' } })).estado).toBe(409);
    const yoFer = await r('fer', '/api/admin/yo');
    expect(yoFer.nivel).toBe('admin');
    expect(yoFer.de_la_suite).toBe(false);
    const yoMira = await r('mira', '/api/admin/yo');
    expect(yoMira.nivel).toBe('consulta');
    expect(yoMira.permisos.expedientes).toBe(true);
    expect(yoMira.permisos.exportar).toBe(false);
    expect((await r('mike', '/api/admin/estado')).cuentas).toBe(true);
  });
  it('cada nivel hace lo suyo: consulta no exporta ni maneja cuentas; admin exporta pero no maneja cuentas', async () => {
    expect((await r('mira', '/api/admin/tabla.csv')).estado).toBe(403);
    expect((await r('mira', '/api/admin/exportar')).estado).toBe(403);
    expect((await r('mira', '/api/admin/cuentas')).estado).toBe(403);
    expect((await r('fer', '/api/admin/cuentas')).estado).toBe(403);
    const csv = await r('fer', '/api/admin/tabla.csv');
    expect(csv.estado).toBe(200);
    expect(csv.tipo).toMatch(/text\/csv/);
  });
  it('apagar una cuenta surte efecto en ese momento; el último dueño con renglón no se apaga', async () => {
    const cuentas = (await r('mike', '/api/admin/cuentas')).cuentas;
    const idMira = cuentas.find((c: any) => c.email === GENTE.mira.correo).id;
    expect((await r('mike', `/api/admin/cuentas/${idMira}`, { method: 'PUT', json: { activo: false } })).estado).toBe(200);
    expect((await r('mira', '/api/admin/yo')).estado).toBe(401);
    expect((await r('mike', `/api/admin/cuentas/${idMira}`, { method: 'PUT', json: { activo: true } })).estado).toBe(200);
    expect((await r('mira', '/api/admin/yo')).estado).toBe(200);
    // Mike se da de alta a sí mismo como dueño con renglón: ya no se puede borrar.
    const mike = await r('mike', '/api/admin/cuentas', { method: 'POST', json: { email: CORREO, nombre: 'Mike', nivel: 'dueno' } });
    expect(mike.estado).toBe(200);
    expect((await r('mike', `/api/admin/cuentas/${mike.cuenta.id}`, { method: 'DELETE' })).estado).toBe(409);
    expect((await r('mike', '/api/admin/yo')).de_la_suite).toBe(false);
  });
});

describe('el trabajador, por su propia puerta', () => {
  let juan: any, docId = '';
  it('pide su código, entra, y su sesión es una cookie propia; sin aviso aceptado no guarda nada', async () => {
    expect((await r('juan', '/api/codigo', { method: 'POST', json: { email: 'no-es-correo' } })).estado).toBe(400);
    expect((await r('juan', '/api/entrar', { method: 'POST', json: { email: 'juan@ejemplo.mx', codigo: '000000' } })).estado).toBe(401);
    // Dos códigos seguidos, no: hay que esperar 45 segundos.
    expect((await r('juan', '/api/codigo', { method: 'POST', json: { email: 'repetido@ejemplo.mx' } })).estado).toBe(200);
    expect((await r('juan', '/api/codigo', { method: 'POST', json: { email: 'repetido@ejemplo.mx' } })).estado).toBe(429);
    const e = await entrarTrabajador('juan', 'Juan@Ejemplo.mx');
    expect(e.nuevo).toBe(true);
    const yo = await r('juan', '/api/yo');
    expect(yo.estado).toBe(200);
    expect(yo.trabajador.email).toBe('juan@ejemplo.mx');
    expect(yo.trabajador.folio).toBe(1);
    expect(yo.aviso).toBeNull();
    const sinAviso = await r('juan', '/api/yo', { method: 'PUT', json: expediente(1) });
    expect(sinAviso.estado).toBe(403);
    expect(sinAviso.falta_aviso).toBe(true);
    const aviso = await r('juan', '/api/aviso', { method: 'POST' });
    expect(aviso.version).toBe('2026-09-03');
  });
  it('guarda su expediente (queda en borrador porque faltan documentos) y sube un documento', async () => {
    const mal = await r('juan', '/api/yo', { method: 'PUT', json: { ...expediente(1), clabe: '012180001234567890' } });
    expect(mal.estado).toBe(422);
    expect(mal.errores.clabe).toMatch(/CLABE/);
    juan = await r('juan', '/api/yo', { method: 'PUT', json: expediente(1) });
    expect(juan.estado, JSON.stringify(juan)).toBe(200);
    expect(juan.expediente_estado).toBe('borrador');
    expect(juan.trabajador.curp).toBe(expediente(1).curp);
    expect(juan.faltantes.length).toBe(9);
    expect(juan.correo_enviado).toBe(true);
    const fd = new FormData();
    fd.append('tipo', 'foto');
    fd.append('archivo', new Blob([PNG], { type: 'image/png' }), 'foto.png');
    const doc = await r('juan', '/api/docs', { method: 'POST', body: fd });
    expect(doc.estado, JSON.stringify(doc)).toBe(200);
    expect(doc.documentos.length).toBe(1);
    expect(doc.faltantes.length).toBe(8);
    docId = doc.documentos[0].id;
    const fd2 = new FormData();
    fd2.append('tipo', 'inventado');
    fd2.append('archivo', new Blob([PNG], { type: 'image/png' }), 'x.png');
    expect((await r('juan', '/api/docs', { method: 'POST', body: fd2 })).estado).toBe(400);
  });
  it('su documento lo ve él y el panel; otro trabajador no', async () => {
    const mio = await r('juan', `/api/docs/${docId}/archivo`);
    expect(mio.estado).toBe(200);
    expect(mio.tipo).toBe('image/png');
    expect(mio.bytes.byteLength).toBe(PNG.byteLength);
    expect((await r('mike', `/api/docs/${docId}/archivo`)).estado).toBe(200);
    expect((await r('nadie', `/api/docs/${docId}/archivo`)).estado).toBe(401);
    await entrarTrabajador('pedro', 'pedro@ejemplo.mx');
    expect((await r('pedro', `/api/docs/${docId}/archivo`)).estado).toBe(403);
  });
  it('un dato repetido no se guarda: Pedro no puede quedarse con la CURP de Juan', async () => {
    await r('pedro', '/api/aviso', { method: 'POST' });
    const choque = await r('pedro', '/api/yo', { method: 'PUT', json: { ...expediente(2), curp: expediente(1).curp } });
    expect(choque.estado).toBe(409);
    expect(choque.duplicados).toEqual(['curp']);
    // A medias sí guarda lo demás y deja el dato repetido vacío.
    const parcial = await r('pedro', '/api/yo', { method: 'PUT', json: { ...expediente(2), curp: expediente(1).curp, __parcial: true } });
    expect(parcial.estado).toBe(200);
    expect(parcial.trabajador.curp).toBe('');
    expect(parcial.trabajador.nombre).toBe('Juan 2');
    expect((await r('pedro', '/api/yo', { method: 'PUT', json: expediente(2) })).estado).toBe(200);
  });
  it('sale, y la cookie ya no abre', async () => {
    await r('pedro', '/api/salir', { method: 'POST' });
    expect(galletas.pedro).toBe('t101_sesion=');
    expect((await r('pedro', '/api/yo')).estado).toBe(401);
  });
});

describe('el panel de la empresa', () => {
  let idJuan = '';
  it('ve la lista con lo que falta a cada quien y abre un expediente', async () => {
    const lista = await r('fer', '/api/admin/trabajadores');
    expect(lista.estado).toBe(200);
    expect(lista.trabajadores.length).toBe(2);
    const juan = lista.trabajadores.find((t: any) => t.email === 'juan@ejemplo.mx');
    idJuan = juan.id;
    expect(juan.documentos.length).toBe(1);
    expect(juan.faltantes.length).toBe(8);
    expect(juan.faltan_campos).toEqual([]);
    const uno = await r('mira', `/api/admin/trabajadores/${idJuan}`);
    expect(uno.estado).toBe(200);
    expect(uno.aviso.version).toBe('2026-09-03');
    expect(uno.campos.length).toBeGreaterThan(10);
  });
  it('captura por alguien (consulta no), con los mismos frenos, y queda en la bitácora a nombre del trabajador', async () => {
    expect((await r('mira', `/api/admin/trabajadores/${idJuan}`, { method: 'PUT', json: expediente(1) })).estado).toBe(403);
    const cap = await r('fer', `/api/admin/trabajadores/${idJuan}`, { method: 'PUT', json: { ...expediente(1), puesto: 'Maestro carpintero' } });
    expect(cap.estado, JSON.stringify(cap)).toBe(200);
    expect(cap.trabajador.puesto).toBe('Maestro carpintero');
    expect(cap.sin_aviso).toBe(false);
    const bit = await r('fer', '/api/admin/bitacora?acciones=expediente_capturado&dias=1');
    expect(bit.renglones[0].quien).toBe('juan@ejemplo.mx');
    expect(bit.tipos.some((t: any) => t.accion === 'codigo_enviado')).toBe(true);
    const csv = await r('fer', '/api/admin/bitacora.csv?acciones=todo&dias=1');
    expect(csv.estado).toBe(200);
    expect(new TextDecoder().decode(csv.bytes)).toMatch(/juan@ejemplo.mx/);
  });
  it('fichas en PDF (con foto) y en ZIP con documentos; la exportación completa; la bitácora dice quién', async () => {
    const pdf = await r('mira', '/api/admin/fichas', { method: 'POST', json: { ids: [idJuan] } });
    expect(pdf.estado).toBe(200);
    expect(pdf.tipo).toBe('application/pdf');
    expect(new TextDecoder().decode(pdf.bytes.slice(0, 5))).toBe('%PDF-');
    const zip = await r('fer', '/api/admin/fichas', { method: 'POST', json: { ids: [idJuan], documentos: true, campos: ['foto', 'nombre'] } });
    expect(zip.estado).toBe(200);
    expect(zip.tipo).toBe('application/zip');
    expect((await r('fer', '/api/admin/fichas', { method: 'POST', json: { ids: [] } })).estado).toBe(400);
    const todo = await r('fer', '/api/admin/exportar');
    expect(todo.estado).toBe(200);
    expect(todo.tipo).toBe('application/zip');
    expect(todo.bytes.byteLength).toBeGreaterThan(200);
    const bit = await r('fer', '/api/admin/bitacora?acciones=todo&dias=1');
    // La exportación es del panel (capa roster101): no se enseña en el panel de la empresa, pero está en la base.
    const conteo = await pedir('mike', `/admin/orgs/${ORG}/roster`, { app: '' });
    expect(conteo.data.filas.roster_bitacora).toBeGreaterThan(bit.total);
    expect(conteo.data.filas.roster_trabajadores).toBe(2);
    expect(conteo.data.filas.roster_documentos).toBe(1);
    expect(conteo.data.filas.roster_administradores).toBe(3);
    expect((await r('nadie', '/api/admin/duplicados')).estado).toBe(401);
    expect((await r('fer', '/api/admin/duplicados')).duplicados).toEqual([]);
  });
  it('la papelera: dar de baja aparta, se puede devolver, y borrar ya se lleva los documentos', async () => {
    expect((await r('mira', `/api/admin/trabajadores/${idJuan}`, { method: 'DELETE' })).estado).toBe(403);
    const baja = await r('fer', `/api/admin/trabajadores/${idJuan}`, { method: 'DELETE' });
    expect(baja.estado).toBe(200);
    expect(baja.dias).toBe(30);
    expect((await r('fer', `/api/admin/trabajadores/${idJuan}`, { method: 'DELETE' })).estado).toBe(409);
    expect((await r('fer', '/api/admin/trabajadores')).trabajadores.length).toBe(1);
    const pap = await r('fer', '/api/admin/papelera');
    expect(pap.papelera.length).toBe(1);
    expect(pap.papelera[0].documentos).toBe(1);
    expect(pap.papelera[0].dias_restantes).toBe(30);
    // Juan sigue pudiendo entrar y su expediente sigue ahí, sólo apartado.
    expect((await r('juan', '/api/yo')).estado).toBe(200);
    // Mientras tanto Pedro se queda con su NSS: ya no se puede devolver así nomás.
    await entrarTrabajador('pedro', 'pedro@ejemplo.mx');
    expect((await r('pedro', '/api/yo', { method: 'PUT', json: { ...expediente(2), nss: expediente(1).nss } })).estado).toBe(200);
    const noVuelve = await r('fer', `/api/admin/papelera/${idJuan}/restaurar`, { method: 'POST' });
    expect(noVuelve.estado).toBe(409);
    expect(noVuelve.duplicados).toEqual(['nss']);
    expect((await r('pedro', '/api/yo', { method: 'PUT', json: expediente(2) })).estado).toBe(200);
    expect((await r('fer', `/api/admin/papelera/${idJuan}/restaurar`, { method: 'POST' })).estado).toBe(200);
    expect((await r('fer', '/api/admin/trabajadores')).trabajadores.length).toBe(2);
    // Y borrar ya: se va con todo y documentos, del bucket también.
    const e = env as unknown as Env;
    const doc = (await r('fer', `/api/admin/trabajadores/${idJuan}`)).documentos[0];
    const lista = await e.ARCHIVOS.list({ prefix: `orgs/${ORG}/roster/trabajadores/${idJuan}/` });
    expect(lista.objects.length).toBe(1);
    await r('fer', `/api/admin/trabajadores/${idJuan}`, { method: 'DELETE' });
    expect((await r('fer', `/api/admin/papelera/${idJuan}`, { method: 'DELETE' })).estado).toBe(200);
    expect((await r('fer', `/api/admin/trabajadores/${idJuan}`)).estado).toBe(404);
    expect((await r('mike', `/api/docs/${doc.id}/archivo`)).estado).toBe(404);
    expect((await e.ARCHIVOS.list({ prefix: `orgs/${ORG}/roster/trabajadores/${idJuan}/` })).objects.length).toBe(0);
    expect((await r('juan', '/api/yo')).estado).toBe(404);
  });
});
