/* El plano de la obra se gira al subirlo y se sustituye por versiones · OrgDB 0029
 *
 * Mike, 2-oct-2026: «Cuando subo un plano en un proyecto de quell, quiero
 * poder rotarlo porque a veces el PDF viene vertical. Y también quiero poder
 * actualizar el plano. Subir y sustituir el que está para actualizar
 * versiones.»
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que el giro se GUARDE y viaje con el plano: la imagen ya va girada,
 *     pero el PDF original no, y la capa nítida de quell101 lo dibuja con
 *     este número. Sin él, al acercarse el plano se vería cruzado;
 *   · que sustituir sea el MISMO plano: mismo id, mismas piezas con sus
 *     coordenadas. Si sustituir creara otro, los pines se perderían;
 *   · que lo de antes no se borre: queda en `versiones` y el archivo sigue
 *     en el bucket, para poder bajar la hoja anterior;
 *   · que un giro inválido no truene ni se guarde: cae en 0.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'plano-girado';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const galletas: Record<string, string> = {};

async function pedir(quien: string, ruta: string, o: RequestInit & { app?: string; json?: unknown } = {}) {
  const cabeceras: Record<string, string> = {};
  if (o.app !== '') cabeceras['X-App'] = o.app ?? 'dash101';
  if (galletas[quien]) cabeceras.Cookie = galletas[quien];
  let body = o.body;
  if (o.json !== undefined) { body = JSON.stringify(o.json); cabeceras['Content-Type'] = 'application/json'; }
  const r = await SELF.fetch(`https://api.local${ruta}`, { ...o, body, headers: { ...cabeceras, ...(o.headers as object) } });
  const puesta = r.headers.get('Set-Cookie');
  if (puesta) galletas[quien] = puesta.split(';')[0];
  const texto = await r.text();
  let cuerpo: any = {};
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = { texto }; }
  return { estado: r.status, ...cuerpo } as { estado: number; [k: string]: any };
}
const q = (quien: string, ruta: string, op: Parameters<typeof pedir>[2] = {}) =>
  pedir(quien, `/orgs/${ORG}/quell${ruta}`, { app: 'quell101', ...op });

const forma = (campos: Record<string, string>, nombreImagen = 'plan.png') => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  fd.append('image', new File([PNG], nombreImagen, { type: 'image/png' }));
  return fd;
};

let obra = '', plano = '', pieza = '';

beforeAll(async () => {
  const c = await pedir('mike', '/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  await pedir('mike', '/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Plano girado', apps: { dash: true, quell: true } }, app: '' });
  await q('mike', '/me');
  obra = (await q('mike', '/projects', { method: 'POST', json: { name: 'Casa vertical', client: 'Familia' } })).id;
}, 60000);

const planoDe = async () => ((await q('mike', `/projects/${obra}`)).plans as any[]).find((p) => p.id === plano);

describe('el giro se guarda al subir', () => {
  it('un PDF que venía vertical se sube girado 90° y el plano lo dice', async () => {
    const r = await q('mike', `/projects/${obra}/plans`, {
      method: 'POST', body: forma({ name: 'Planta', file_name: 'planta.pdf', width: '800', height: '1000', rotation: '90' }),
    });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.rotation).toBe(90);
    plano = r.id;
    const p = await planoDe();
    expect(p.rotation).toBe(90);
    expect(p.versiones, 'todavía sin versiones anteriores').toEqual([]);
    expect(p.width).toBe(800);
    expect(p.height).toBe(1000);
  });

  it('un giro que no es de 90 en 90 no se guarda: cae en 0', async () => {
    const r = await q('mike', `/projects/${obra}/plans`, {
      method: 'POST', body: forma({ name: 'Chueco', file_name: 'x.png', width: '10', height: '10', rotation: '45' }),
    });
    expect(r.estado).toBe(200);
    expect(r.rotation).toBe(0);
  });

  it('sin giro, es 0: los planos de siempre siguen igual', async () => {
    const r = await q('mike', `/projects/${obra}/plans`, {
      method: 'POST', body: forma({ name: 'Normal', file_name: 'n.png', width: '10', height: '10' }),
    });
    expect(r.rotation).toBe(0);
  });
});

describe('sustituir el plano', () => {
  beforeAll(async () => {
    const r = await q('mike', `/plans/${plano}/elements`, {
      method: 'POST', json: { op_id: crypto.randomUUID(), name: 'Barra', type: 'Mueble', x: 0.25, y: 0.75 },
    });
    pieza = r.id;
  });

  it('es el mismo plano, con otra imagen, otro tamaño y otro giro; las piezas se quedan donde estaban', async () => {
    const antes = await planoDe();
    const r = await q('mike', `/plans/${plano}/sustituir`, {
      method: 'POST', body: forma({ file_name: 'planta-v2.pdf', width: '1200', height: '900', rotation: '0' }, 'plan2.png'),
    });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.id, 'mismo id').toBe(plano);
    expect(r.version).toBe(2);
    expect(r.image_key).not.toBe(antes.image_key);

    const p = await planoDe();
    expect(p.image_key).toBe(r.image_key);
    expect(p.file_name).toBe('planta-v2.pdf');
    expect(p.width).toBe(1200);
    expect(p.height).toBe(900);
    expect(p.rotation).toBe(0);
    expect(p.name, 'el nombre no cambia por sustituir').toBe('Planta');

    const el = (await q('mike', `/elements/${pieza}`)).element;
    expect(el.plan_id).toBe(plano);
    expect(Number(el.x)).toBeCloseTo(0.25);
    expect(Number(el.y)).toBeCloseTo(0.75);
  });

  it('lo de antes queda en versiones, con su archivo todavía en el bucket', async () => {
    const p = await planoDe();
    expect(p.versiones.length).toBe(1);
    const v = p.versiones[0];
    expect(v).toMatchObject({ file_name: 'planta.pdf', width: 800, height: 1000, rotation: 90 });
    expect(v.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(v.quien).toBeTruthy();
    const archivo = await SELF.fetch(`https://api.local/orgs/${ORG}/quell/files/${v.image_key}`, { headers: { Cookie: galletas.mike, 'X-App': 'quell101' } });
    expect(archivo.status, 'la imagen anterior se sigue sirviendo').toBe(200);
  });

  it('sustituir otra vez apila: dos versiones anteriores, en orden', async () => {
    const r = await q('mike', `/plans/${plano}/sustituir`, {
      method: 'POST', body: forma({ file_name: 'planta-v3.pdf', width: '1300', height: '950', rotation: '180' }, 'plan3.png'),
    });
    expect(r.version).toBe(3);
    const p = await planoDe();
    expect(p.versiones.map((v: any) => v.file_name)).toEqual(['planta.pdf', 'planta-v2.pdf']);
    expect(p.rotation).toBe(180);
  });

  it('sin imagen no se sustituye nada', async () => {
    const fd = new FormData(); fd.append('width', '1'); fd.append('height', '1');
    const r = await q('mike', `/plans/${plano}/sustituir`, { method: 'POST', body: fd });
    expect(r.estado).toBe(400);
    expect((await planoDe()).versiones.length, 'sigue con las mismas dos').toBe(2);
  });

  it('un plano que no existe es 404', async () => {
    const r = await q('mike', '/plans/no-existe/sustituir', { method: 'POST', body: forma({ width: '1', height: '1' }) });
    expect([403, 404]).toContain(r.estado);
  });
});
