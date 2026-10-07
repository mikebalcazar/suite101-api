/* cost101 entra a la suite (0.81.0).
 *
 * Mike, 7-oct-2026: «una base de datos de los costos base, la cual puedo
 * editar (agregar, quitar, actualizar) (…) los generadores se alimentan de la
 * base de datos de costos base, y de ahí se generan los productos (…) los
 * cuales van a alimentar los precios de los productos para quote. Quote debe
 * poder leer los precios base y el catálogo de productos».
 *
 * Los números esperados NO salen de la cuenta de la API: salen de la cuenta
 * original del prototipo de cost101, corrida aparte sobre la misma semilla
 * (`pruebas/datos/cost101-esperado.json`). Si la API y la pantalla dieran
 * números distintos para la misma partida, esta prueba es la que truena.
 */
import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import semilla from './datos/cost101-semilla.json';
import esperado from './datos/cost101-esperado.json';

const ORG = 'costos';
const galletas: Record<string, string> = {};

async function pedir(quien: string, ruta: string, o: RequestInit & { app?: string; json?: unknown } = {}) {
  const cabeceras: Record<string, string> = {};
  if (o.app !== '') cabeceras['X-App'] = o.app ?? 'cost101';
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
const o = (quien: string, ruta: string, op: Parameters<typeof pedir>[2] = {}) => pedir(quien, `/orgs/${ORG}${ruta}`, op);

async function entrar(quien: string, correo: string) {
  galletas[quien] = '';
  const c = await pedir(quien, '/auth/codigo', { method: 'POST', json: { correo }, app: '' });
  expect(c.estado, JSON.stringify(c)).toBe(200);
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, JSON.stringify(e)).toBe(200);
}

type Fila = Record<string, any>;
let costos: Fila[] = [], cuadrillas: Fila[] = [], productos: Fila[] = [];
const costo = (clave: string) => costos.find((x) => x.clave === clave)!;
const cuad = (clave: string) => cuadrillas.find((x) => x.clave === clave)!;
const prod = (codigo: string) => productos.find((x) => x.codigo === codigo)!;
async function releer() {
  const r = await o('mike', '/costos');
  expect(r.estado, JSON.stringify(r)).toBe(200);
  costos = r.data.costos_base; cuadrillas = r.data.cuadrillas; productos = r.data.productos;
  return r.data;
}
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

beforeAll(async () => {
  await entrar('mike', 'mike@forespot.com');
  // La empresa nace SIN cost101: es una app con licencia.
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Costos de prueba', apps: { dash: true, cotizador: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
  for (const [apodo, correo, rol] of [['tin', 'tin-costos@ejemplo.mx', 'staff'], ['ana', 'ana-costos@ejemplo.mx', 'admin']] as const) {
    const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: { correo, rol, nombre: apodo }, app: '' });
    expect(m.estado, JSON.stringify(m)).toBe(201);
    await entrar(apodo, correo);
  }
});

describe('cost101 es una app con licencia por empresa', () => {
  it('una empresa nueva no nace con ella', async () => {
    const r = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: 'costos-nueva', nombre: 'Recién nacida' }, app: '' });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.apps?.cost ?? false).toBe(false);
  });
  it('apagada, la puerta dice app_inactiva; prendida, abre', async () => {
    const antes = await o('mike', '/costos');
    expect(antes.estado).toBe(403);
    expect(antes.error).toBe('app_inactiva');
    const p = await pedir('mike', `/admin/orgs/${ORG}`, { method: 'PATCH', json: { apps: { cost: true } }, app: '' });
    expect(p.estado, JSON.stringify(p)).toBe(200);
    // Prenderla no apaga las otras: el PATCH mezcla.
    expect(p.data.apps).toMatchObject({ cost: true, dash: true, cotizador: true });
    const d = await releer();
    expect(d.costos_base).toEqual([]);
    expect(d.puede_aprobar).toBe(true);
  });
});

describe('la carga en bloque (la semilla de cost101)', () => {
  it('sólo la hace quien dirige', async () => {
    const r = await o('tin', '/costos/importar', { method: 'POST', json: semilla });
    expect(r.estado).toBe(403);
  });
  it('el dinero va en centavos enteros', async () => {
    const r = await o('mike', '/costos/importar', { method: 'POST', json: { costos: [{ ref: 'x', nombre: 'Clavo', tipo: 'material', precio: 0.35 }] } });
    expect(r.estado).toBe(400);
    expect(r.error).toBe('dinero_no_entero');
  });
  it('una receta que apunta a algo que no viene no deja nada a medias', async () => {
    const r = await o('mike', '/costos/importar', { method: 'POST', json: {
      costos: [{ ref: 'a', clave: 'TMP-1', nombre: 'Temporal', tipo: 'material', precio: 100 }],
      productos: [{ ref: 'p', codigo: 'TMP-P', nombre: 'Rota', apu: { comps: [{ tipo: 'insumo', ref: 'no-existe', cant: 1 }] } }],
    } });
    expect(r.estado, JSON.stringify(r)).toBe(400);
    expect((await releer()).costos_base).toEqual([]);
  });
  it('entra completa: 60 costos, 6 cuadrillas, 16 productos', async () => {
    const r = await o('mike', '/costos/importar', { method: 'POST', json: semilla });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.nuevos).toEqual({ costos: 60, cuadrillas: 6, productos: 16 });
    await releer();
    expect([costos.length, cuadrillas.length, productos.length]).toEqual([60, 6, 16]);
  });
  it('correrla otra vez no duplica nada', async () => {
    const r = await o('mike', '/costos/importar', { method: 'POST', json: semilla });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.nuevos).toEqual({ costos: 0, cuadrillas: 0, productos: 0 });
    expect(r.data.ya_estaban).toEqual({ costos: 60, cuadrillas: 6, productos: 16 });
    await releer();
    expect([costos.length, cuadrillas.length, productos.length]).toEqual([60, 6, 16]);
  });
});

describe('la cuenta de la API es la misma que la de la pantalla', () => {
  it('los 16 productos dan, al centavo, lo que da el prototipo', async () => {
    await releer();
    const esp = esperado as Record<string, Record<string, number>>;
    for (const codigo of Object.keys(esp)) {
      const p = prod(codigo);
      expect(p, codigo).toBeTruthy();
      for (const k of ['mat', 'mo', 'eq', 'herr', 'sub', 'cd', 'ind', 'util', 'pu']) expect(p.desglose[k], `${codigo}.${k}`).toBe(esp[codigo][k]);
      // Lo que lee quote101: el precio unitario SIN IVA (decisión de Mike, 7-oct).
      expect(p.precio, `${codigo}.precio`).toBe(esp[codigo].precio);
      expect(p.desglose.pu - p.desglose.iva, `${codigo} pu - iva`).toBe(p.precio);
    }
    // El ejemplo con el que Mike decidió: muro de tablaroca, $761.63 con IVA.
    expect(prod('PAR-302').desglose.pu).toBe(76163);
    expect(prod('PAR-302').precio).toBe(65657);
  });
  it('cada producto nace con su renglón de alta, y el estado que traía', async () => {
    expect(prod('PAR-101').estado).toBe('aprobado');
    expect(prod('PAR-101').historial).toEqual([{ f: hoy, pu: prod('PAR-101').desglose.pu, m: 'Alta en catálogo' }]);
    expect(prod('PAR-302').estado).toBe('borrador');
    expect(prod('PAR-302').historial[0].m).toBe('Alta (borrador)');
    expect(productos.filter((p) => p.estado === 'aprobado').length).toBe(12);
  });
  it('el historial de precios de un costo base viene con la carga', async () => {
    expect(costo('MAT-001').historial.map((h: Fila) => h.precio)).toEqual([22800, 23900, 24500]);
  });
});

describe('cambia un costo base y los productos se recalculan solos', () => {
  it('sube el panel de yeso: se mueven los que lo usan, con el motivo, y nada más', async () => {
    const antes = Object.fromEntries(productos.map((p) => [p.codigo, p.desglose.pu]));
    const yeso = costo('MAT-001');
    const usan = productos.filter((p) => p.apu.comps.some((c: Fila) => c.ref === yeso.id)).map((p) => p.codigo).sort();
    expect(usan).toEqual(['PAR-302', 'PAR-402']);

    const r = await o('mike', `/costos_base/${yeso.id}`, { method: 'PATCH', json: { precio: 26000 } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.precio).toBe(26000);
    // El costo deja renglón en su historial, con la fecha de México.
    expect(r.data.historial.at(-1)).toEqual({ f: hoy, precio: 26000 });
    expect(r.data.historial.length).toBe(4);

    await releer();
    for (const p of productos) {
      if (usan.includes(p.codigo)) {
        expect(p.desglose.pu, p.codigo).toBeGreaterThan(antes[p.codigo]);
        expect(p.historial.at(-1), p.codigo).toEqual({ f: hoy, pu: p.desglose.pu, m: 'Precio base: Panel de yeso 1/2" 1.22×2.44 m' });
      } else {
        expect(p.desglose.pu, p.codigo).toBe(antes[p.codigo]);
        expect(p.historial.length, p.codigo).toBe(1);
      }
    }
    // A mano: 0.672 pza × 1.08 × ($260 − $245) = $10.8864 de material más;
    // × 1.12 × 1.10 = $13.41 en el precio unitario.
    expect(prod('PAR-302').desglose.pu - antes['PAR-302']).toBe(1341);
  });
  it('el segundo cambio del mismo día pisa al primero, en el costo y en el producto', async () => {
    const yeso = costo('MAT-001');
    const r = await o('mike', `/costos_base/${yeso.id}`, { method: 'PATCH', json: { precio: 24500 } });
    expect(r.data.historial.length).toBe(4);
    expect(r.data.historial.at(-1)).toEqual({ f: hoy, precio: 24500 });
    await releer();
    expect(prod('PAR-302').desglose.pu).toBe(76163);
    expect(prod('PAR-302').historial.length).toBe(2);
    expect(prod('PAR-302').historial.at(-1).pu).toBe(76163);
  });
  it('un oficio que sube mueve a los productos que lo traen dentro de una cuadrilla', async () => {
    const antes = Object.fromEntries(productos.map((p) => [p.codigo, p.desglose.pu]));
    const ayudante = costo('MO-002'); // está en cuatro cuadrillas
    const r = await o('mike', `/costos_base/${ayudante.id}`, { method: 'PATCH', json: { precio: 7000 } });
    expect(r.estado).toBe(200);
    await releer();
    // Muro de block: cuadrilla de albañilería (1 of. + 1 ay.) a 10 m²/jornada.
    expect(prod('PAR-301').desglose.pu).toBeGreaterThan(antes['PAR-301']);
    expect(prod('PAR-301').historial.at(-1).m).toBe('Precio base: Ayudante general');
    // Centro de carga: cuadrilla de electricidad, que no lleva ayudante general.
    expect(prod('PAR-504').desglose.pu).toBe(antes['PAR-504']);
    await o('mike', `/costos_base/${ayudante.id}`, { method: 'PATCH', json: { precio: 6500 } });
  });
  it('cambiar los miembros de una cuadrilla recalcula, con su motivo', async () => {
    await releer();
    const q = cuad('CUA-04');
    const antes = prod('PAR-504').desglose.pu;
    const r = await o('mike', `/cuadrillas/${q.id}`, { method: 'PATCH', json: { miembros: [{ ref: costo('MO-005').id, cant: 2 }, { ref: costo('MO-006').id, cant: 1 }] } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    await releer();
    // Jornada: (2×110 + 70) × 8 = 2320 en vez de 1440; a 2 pzas/jornada son
    // $440 más de mano de obra, + 3% de herramienta, × 1.12 × 1.10.
    expect(prod('PAR-504').desglose.pu - antes).toBe(Math.round(440 * 1.03 * 1.12 * 1.10 * 100));
    expect(prod('PAR-504').historial.at(-1).m).toBe('Cuadrilla: Electricidad (1 of. + 1 ay.)');
  });
  it('editar una subpartida mueve a quien la lleva dentro', async () => {
    const pintura = prod('PAR-201');
    const muro = prod('PAR-302');
    expect(muro.apu.comps.some((c: Fila) => c.tipo === 'partida' && c.ref === pintura.id)).toBe(true);
    const apu = { ...pintura.apu, comps: pintura.apu.comps.map((c: Fila) => (c.ref === costo('MAT-009').id ? { ...c, cant: 0.3 } : c)) };
    const r = await o('mike', `/productos/${pintura.id}`, { method: 'PATCH', json: { apu } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.historial.at(-1).m).toBe('Edición de partida');
    await releer();
    expect(prod('PAR-302').desglose.pu).toBeGreaterThan(muro.desglose.pu);
    expect(prod('PAR-302').historial.at(-1).m).toBe('Subpartida: Pintura vinílica 2 manos sobre muro');
    // La subpartida entra por su COSTO DIRECTO: 2 m² × lo que subió el CD.
    const subio = prod('PAR-201').desglose.cd - pintura.desglose.cd;
    expect(prod('PAR-302').desglose.sub - muro.desglose.sub).toBe(subio * 2);
  });
});

describe('agregar, quitar y actualizar costos base', () => {
  it('la clave que no viene la pone la API, con el prefijo del tipo', async () => {
    const m = await o('mike', '/costos_base', { method: 'POST', json: { nombre: 'Yeso en polvo', tipo: 'material', unidad: 'kg', precio: 650, categoria: 'Obra civil' } });
    expect(m.estado, JSON.stringify(m)).toBe(201);
    expect(m.data.clave).toBe('MAT-044');
    expect(m.data.historial).toEqual([{ f: hoy, precio: 650 }]);
    const mo = await o('mike', '/costos_base', { method: 'POST', json: { nombre: 'Oficial herrero', tipo: 'mo', unidad: 'pza', precio: 12000 } });
    expect(mo.data.clave).toBe('MO-011');
    expect(mo.data.unidad, 'la mano de obra es por hora').toBe('h');
    const q = await o('mike', '/cuadrillas', { method: 'POST', json: { nombre: 'Herrería', miembros: [{ ref: mo.data.id, cant: 1 }] } });
    expect(q.estado, JSON.stringify(q)).toBe(201);
    expect(q.data.clave).toBe('CUA-07');
    expect(q.data.horas).toBe(8);
  });
  it('una clave repetida es 409, no dos renglones con la misma', async () => {
    const r = await o('mike', '/costos_base', { method: 'POST', json: { clave: 'MAT-001', nombre: 'Otro', tipo: 'material', precio: 100 } });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('clave_repetida');
  });
  it('el precio en pesos con decimales se rechaza', async () => {
    await releer();
    const r = await o('mike', `/costos_base/${costo('MAT-044').id}`, { method: 'PATCH', json: { precio: 6.5 } });
    expect(r.estado).toBe(400);
    expect(r.error).toBe('dinero_no_entero');
  });
  it('una cuadrilla se arma con oficios, no con materiales', async () => {
    const r = await o('mike', '/cuadrillas', { method: 'POST', json: { nombre: 'Rara', miembros: [{ ref: costo('MAT-001').id, cant: 1 }] } });
    expect(r.estado).toBe(400);
  });
  it('lo que una receta usa no se borra, y la API dice quién lo usa', async () => {
    const r = await o('mike', `/costos_base/${costo('MAT-001').id}`, { method: 'DELETE' });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('en_uso');
    expect(r.detalle.usado_en.map((u: Fila) => u.clave).sort()).toEqual(['PAR-302', 'PAR-402']);
    // Un oficio lo usan cuadrillas y productos.
    const of = await o('mike', `/costos_base/${costo('MO-002').id}`, { method: 'DELETE' });
    expect(of.estado).toBe(409);
    expect(of.detalle.usado_en.filter((u: Fila) => u.que === 'cuadrilla').length).toBe(4);
    // Y una cuadrilla, sus productos.
    const q = await o('mike', `/cuadrillas/${cuad('CUA-02').id}`, { method: 'DELETE' });
    expect(q.estado).toBe(409);
    // Una partida que va dentro de otra, tampoco.
    const p = await o('mike', `/productos/${prod('PAR-201').id}`, { method: 'DELETE' });
    expect(p.estado).toBe(409);
  });
  it('lo que nadie usa sí se borra', async () => {
    const r = await o('mike', `/costos_base/${costo('MAT-044').id}`, { method: 'DELETE' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    await releer();
    expect(costos.length).toBe(61); // 60 + el oficial herrero
  });
  it('a un costo que ya se usa no se le cambia el tipo', async () => {
    const r = await o('mike', `/costos_base/${costo('MAT-001').id}`, { method: 'PATCH', json: { tipo: 'mo' } });
    expect(r.estado).toBe(400);
  });
});

describe('el generador: armar un producto', () => {
  let nuevo = '';
  it('quien no dirige guarda borradores, aunque mande «aprobado»', async () => {
    const apu = { herr: 3, ind: 12, util: 10, comps: [{ tipo: 'insumo', ref: costo('MAT-011').id, cant: 12.5, desp: 3 }, { tipo: 'cuadrilla', ref: cuad('CUA-01').id, cant: 10 }] };
    const r = await o('tin', '/productos', { method: 'POST', json: { nombre: 'Muro de prueba', unidad: 'm²', categoria: 'Muros', estado: 'aprobado', apu } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.estado).toBe('borrador');
    expect(r.data.codigo).toMatch(/^PAR-\d{3}$/);
    // 12.5 × 1.03 × $18 = 231.75 ; (95+65)×8/10 = 128 ; herr 3.84
    // CD 363.59 ; ind 43.6308 ; util 40.72208 ; PU 447.94288
    expect(r.data.desglose).toMatchObject({ mat: 23175, mo: 12800, herr: 384, cd: 36359, pu: 44794 });
    expect(r.data.precio).toBe(Math.round(44794.288 / 1.16));
    expect(r.data.historial).toEqual([{ f: hoy, pu: 44794, m: 'Alta (borrador)' }]);
    nuevo = r.data.id;
  });
  it('el precio no se manda: lo pone la cuenta', async () => {
    const r = await o('tin', `/productos/${nuevo}`, { method: 'PATCH', json: { precio: 1 } });
    expect(r.estado).toBe(403);
    expect(r.error).toBe('campo_no_permitido');
  });
  it('quien dirige lo aprueba, y queda escrito', async () => {
    const r = await o('ana', `/productos/${nuevo}`, { method: 'PATCH', json: { estado: 'aprobado' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.estado).toBe('aprobado');
    expect(r.data.historial.at(-1)).toEqual({ f: hoy, pu: 44794, m: 'Aprobada' });
  });
  it('si lo edita quien no dirige, regresa a borrador', async () => {
    const r = await o('tin', `/productos/${nuevo}`, { method: 'PATCH', json: { nombre: 'Muro de prueba, corregido' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.estado).toBe('borrador');
  });
  it('una receta no puede llevarse a sí misma, ni por dentro de otra', async () => {
    await releer();
    const pintura = prod('PAR-201'), muro = prod('PAR-302');
    const directo = await o('mike', `/productos/${pintura.id}`, { method: 'PATCH', json: { apu: { ...pintura.apu, comps: [...pintura.apu.comps, { tipo: 'partida', ref: pintura.id, cant: 1 }] } } });
    expect(directo.estado).toBe(400);
    const porDentro = await o('mike', `/productos/${pintura.id}`, { method: 'PATCH', json: { apu: { ...pintura.apu, comps: [...pintura.apu.comps, { tipo: 'partida', ref: muro.id, cant: 1 }] } } });
    expect(porDentro.estado, JSON.stringify(porDentro)).toBe(400);
  });
  it('una receta que apunta a un costo que no existe no entra', async () => {
    const r = await o('mike', '/productos', { method: 'POST', json: { nombre: 'Rota', apu: { comps: [{ tipo: 'insumo', ref: 'no-existe', cant: 1 }] } } });
    expect(r.estado).toBe(400);
  });
  it('un borrador lo borra quien lo hizo; uno aprobado, quien dirige', async () => {
    await o('ana', `/productos/${nuevo}`, { method: 'PATCH', json: { estado: 'aprobado' } });
    expect((await o('tin', `/productos/${nuevo}`, { method: 'DELETE' })).estado).toBe(403);
    expect((await o('ana', `/productos/${nuevo}`, { method: 'DELETE' })).estado).toBe(200);
  });
});

describe('quote101 lee; no escribe', () => {
  it('lee los precios base y el catálogo de productos', async () => {
    const base = await o('mike', '/costos_base?limite=5000', { app: 'cotizador101' });
    expect(base.estado, JSON.stringify(base)).toBe(200);
    expect(base.data.total).toBe(61);
    const cat = await o('mike', '/productos?limite=5000', { app: 'cotizador101' });
    expect(cat.estado).toBe(200);
    const muro = cat.data.filas.find((p: Fila) => p.codigo === 'PAR-301');
    expect(muro).toMatchObject({ unidad: 'm²', estado: 'aprobado' });
    expect(muro.precio).toBeGreaterThan(0);
    // Los aprobados se pueden pedir solos: es lo que quote101 ofrece.
    const aprobados = await o('mike', '/productos?estado=aprobado&limite=5000', { app: 'cotizador101' });
    expect(aprobados.data.filas.every((p: Fila) => p.estado === 'aprobado')).toBe(true);
    expect(aprobados.data.filas.length).toBe(12);
    expect((await o('mike', '/costos', { app: 'cotizador101' })).estado).toBe(200);
  });
  it('no escribe costos, ni cuadrillas, ni carga en bloque', async () => {
    const a = await o('mike', '/costos_base', { method: 'POST', app: 'cotizador101', json: { nombre: 'X', tipo: 'material', precio: 1 } });
    expect(a.estado).toBe(403);
    const b = await o('mike', `/costos_base/${costo('MAT-002').id}`, { method: 'PATCH', app: 'cotizador101', json: { precio: 1 } });
    expect(b.estado).toBe(403);
    const c = await o('mike', '/costos/importar', { method: 'POST', app: 'cotizador101', json: semilla });
    expect(c.estado).toBe(403);
  });
});

describe('lo que NO se abre', () => {
  it('dash101 no lee los costos base, ni le pone precio a mano a un producto con receta', async () => {
    expect((await o('mike', '/costos_base', { app: 'dash101' })).estado).toBe(403);
    expect((await o('mike', '/costos', { app: 'dash101' })).estado).toBe(403);
    const r = await o('mike', `/productos/${prod('PAR-101').id}`, { method: 'PATCH', app: 'dash101', json: { precio: 100 } });
    expect(r.estado).toBe(403);
    await releer();
    expect(prod('PAR-101').precio).toBe((esperado as any)['PAR-101'].precio);
  });
  it('cost101 no toca un producto de siempre (el que dash101 escribió a mano)', async () => {
    const viejo = await o('mike', '/productos', { method: 'POST', app: 'dash101', json: { codigo: 'PTA-A', nombre: 'Puerta modelo A', tipo: 'puerta', precio: 950000 } });
    expect(viejo.estado, JSON.stringify(viejo)).toBe(201);
    expect(viejo.data.apu).toBeNull();
    expect(viejo.data.precio).toBe(950000);
    expect((await o('mike', `/productos/${viejo.data.id}`, { method: 'PATCH', json: { nombre: 'Otra' } })).estado).toBe(403);
    expect((await o('mike', `/productos/${viejo.data.id}`, { method: 'DELETE' })).estado).toBe(403);
    // Y sigue siendo de dash101, con su precio a mano.
    const p = await o('mike', `/productos/${viejo.data.id}`, { method: 'PATCH', app: 'dash101', json: { precio: 990000 } });
    expect(p.estado).toBe(200);
    expect(p.data.precio).toBe(990000);
    // No aparece en lo que pinta cost101.
    expect((await releer()).productos.some((x: Fila) => x.codigo === 'PTA-A')).toBe(false);
  });
  it('la lista de apps por persona se aplica: sin `cost`, no entra', async () => {
    const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: { correo: 'solo-dash@ejemplo.mx', rol: 'staff', nombre: 'Solo dash', apps: ['dash'] }, app: '' });
    expect(m.estado, JSON.stringify(m)).toBe(201);
    await entrar('solo', 'solo-dash@ejemplo.mx');
    const r = await o('solo', '/costos');
    expect(r.estado).toBe(403);
    expect(r.error).toBe('app_no_permitida');
  });
  it('sin sesión, nada', async () => {
    const r = await SELF.fetch(`https://api.local/orgs/${ORG}/costos`, { headers: { 'X-App': 'cost101' } });
    expect(r.status).toBe(401);
  });
});
