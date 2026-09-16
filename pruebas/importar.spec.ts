/* Las pruebas de la fase 2.
 *
 * Escritas contra la lista de «cuándo está terminada la fase» del encargo §6,
 * punto por punto. La fase no termina cuando el import corre sin error: termina
 * cuando se puede enseñar con números que los conteos cuadran, que el dinero
 * cuadra al centavo, que los ids son los mismos, que un `producto_id` viejo
 * apunta al ítem correcto, que los usuarios entran de verdad y que correrlo dos
 * veces no duplica nada.
 *
 * La que más importa es la del dinero. Un centavo perdido aquí se corrige
 * migrando dinero ya guardado, que es la peor migración que hay.
 */

import { SELF } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { aCentavosExacto, aCentavos } from '../schema/tipos';
import { aplanar, aISO, cosechar } from '../src/importar/mapeo';

const CORREO = 'mike@forespot.com';
const ORG = 'importada';
let galleta = '';

async function pedir(ruta: string, opciones: RequestInit & { app?: string } = {}) {
  const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opciones.app) cabeceras['X-App'] = opciones.app;
  if (galleta) cabeceras.Cookie = galleta;
  const r = await SELF.fetch(`https://api.local${ruta}`, { ...opciones, headers: { ...cabeceras, ...(opciones.headers as object) } });
  const puesta = r.headers.get('Set-Cookie');
  if (puesta) galleta = puesta.split(';')[0];
  const cuerpo = (await r.json()) as { ok: boolean; data?: any; error?: string; detalle?: any };
  return { estado: r.status, ...cuerpo };
}

/* ─────────────── el dinero, con los casos feos ───────────────
 * Firestore guarda pesos con decimales; la API quiere centavos enteros. Aquí
 * están los casos que descuadran una migración y que nadie mira hasta que ya
 * hay dinero mal guardado. */

describe('§5 · pesos → centavos', () => {
  const c = (v: unknown) => aCentavosExacto(v).centavos;

  it('lo normal', () => {
    expect(c(1500.5)).toBe(150050);
    expect(c(150000)).toBe(15000000);
    expect(c(0)).toBe(0);
    expect(c(0.01)).toBe(1);
    expect(c('1,500.50')).toBe(150050);
    expect(c('$ 1500.50')).toBe(150050);
    expect(c('1500')).toBe(150000);
  });

  it('el medio centavo sube, y sube igual en los negativos', () => {
    expect(c(1.005)).toBe(101);
    expect(c(-1.005)).toBe(-101);
    expect(c(0.145)).toBe(15);
    expect(c(2.344)).toBe(234);
    expect(c(2.345)).toBe(235);
  });

  it('la fórmula vieja perdía ese centavo, y por eso se cambió', () => {
    // Se deja escrito el defecto: Math.round(1.005 * 100) da 100, no 101,
    // porque 1.005 * 100 es 100.49999999999999 en punto flotante.
    expect(Math.round(1.005 * 100)).toBe(100);
    expect(aCentavos(1.005)).toBe(101);
  });

  it('el ruido de los flotantes no inventa centavos', () => {
    expect(c(0.1 + 0.2)).toBe(30); // 0.30000000000000004
    expect(c(1e-7)).toBe(0);
    expect(c(8.7 * 3)).toBe(2610); // 26.099999999999998
  });

  it('lo vacío se cuenta como cero, pero se sabe que estaba vacío', () => {
    for (const v of [null, undefined, '']) {
      expect(aCentavosExacto(v)).toMatchObject({ ok: true, centavos: 0, vacio: true });
    }
  });

  it('lo que no es dinero se rechaza, no se convierte en cero', () => {
    for (const v of [NaN, Infinity, -Infinity, 'abc', '12,34,ab', true, {}]) {
      expect(aCentavosExacto(v).ok).toBe(false);
    }
  });

  it('avisa cuando tuvo que redondear', () => {
    expect(aCentavosExacto(1.005).redondeo).toBe(true);
    expect(aCentavosExacto(1500.5).redondeo).toBe(false);
    expect(aCentavosExacto('1500.567').centavos).toBe(150057);
  });

  it('no se desborda con cifras grandes', () => {
    expect(c(99999999.99)).toBe(9999999999);
    expect(aCentavosExacto('99999999999999999').ok).toBe(false);
  });
});

/* ─────────────── el formato de Firestore ─────────────── */

describe('lo que llega de Firestore', () => {
  it('un documento de la API REST se desenvuelve solo', () => {
    const plano = aplanar([
      {
        name: 'projects/contamaster-fs/databases/(default)/documents/clientes/CLI1',
        createTime: '2026-01-05T10:00:00.000Z',
        fields: {
          nombre: { stringValue: 'Áurea Pérez' },
          email: { stringValue: 'AUREA@ejemplo.mx' },
          // en REST un entero viaja como CADENA: si se toma tal cual, el
          // dinero se vuelve texto y la suma se rompe sin decir nada
          visitas: { integerValue: '3' },
          saldo: { doubleValue: 1500.5 },
          activo: { booleanValue: true },
          creado_at: { timestampValue: '2026-01-05T10:00:00Z' },
          etiquetas: { arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] } },
          extra: { mapValue: { fields: { x: { integerValue: '1' } } } },
          nada: { nullValue: null },
        },
      },
    ])[0];
    expect(plano.id).toBe('CLI1');
    expect(plano.nombre).toBe('Áurea Pérez');
    expect(plano.visitas).toBe(3);
    expect(plano.saldo).toBe(1500.5);
    expect(plano.activo).toBe(true);
    expect(plano.etiquetas).toEqual(['a', 'b']);
    expect(plano.extra).toEqual({ x: 1 });
    expect(plano.nada).toBe(null);
  });

  it('un Timestamp serializado también es una fecha', () => {
    expect(aISO({ seconds: 1767609600, nanoseconds: 0 })).toBe('2026-01-05T10:40:00.000Z');
    expect(aISO({ _seconds: 1767609600, _nanoseconds: 0 })).toBe('2026-01-05T10:40:00.000Z');
    expect(aISO('2026-03-04')).toBe('2026-03-04T00:00:00.000Z');
    expect(aISO(null)).toBe(null);
    expect(aISO('no es fecha')).toBe(null);
  });

  it('los cachés de conta-master no se copian, y se dice cuáles', () => {
    const cosecha = cosechar({
      proyectos: [{
        id: 'P1', nombre: 'Casa', cliente_id: 'C1', negocio_id: 'N1', estado: 'activo',
        precio_venta: 999, cobrado: 111, pagado: 22, disponible: 89, compromiso_total: 5,
        margen_proyectado: 1, cliente_nombre: 'Áurea', productos: [{ id: 'x1', nombre: 'Mesa', monto: 999 }], partidas: [],
      }],
    });
    const p = cosecha.filas.proyectos![0];
    expect(p.precio_venta).toBeUndefined();
    expect(p.cobrado).toBeUndefined();
    // con productos, el precio es caché y se ignora
    expect(cosecha.ignorados.proyectos).toContain('precio_venta');
    expect(cosecha.filas.items).toHaveLength(1);
  });

  it('la regla del producto único: un proyecto con precio y sin productos produce un ítem con su nombre', () => {
    const cosecha = cosechar({
      proyectos: [
        { id: 'P1', nombre: 'Casa', cliente_id: 'C1', negocio_id: 'N1', estado: 'activo', precio_venta: 175000.5, productos: [], creado_at: '2026-01-15T12:00:00Z' },
        { id: 'P2', nombre: 'Sin precio', cliente_id: 'C1', negocio_id: 'N1', estado: 'planeando' },
      ],
    });
    expect(cosecha.filas.items).toHaveLength(1);
    const i = cosecha.filas.items![0];
    expect(i).toMatchObject({ id: 'P1-i1', proyecto_id: 'P1', cliente_id: 'C1', nombre: 'Casa', monto: 17500050, estado: 'vendido', etapa: 0, tipo: 'otro' });
    expect((i.origen as { regla: string }).regla).toBe('producto_unico');
    // el precio SÍ se usó: no se reporta como ignorado
    expect(cosecha.ignorados.proyectos ?? []).not.toContain('precio_venta');
    // y la plata se cuenta en items.monto, que es contra lo que cuadra la API
    expect(cosecha.sumas['items.monto']).toBe(17500050);
    // sin precio ni productos, nada se inventa
    expect(cosecha.filas.proyectos).toHaveLength(2);
  });
});

/* ─────────────── los datos de prueba ───────────────
 * Con la forma real de conta-master (`claude/conta-master-contexto.md`) y con
 * la plata puesta a propósito en los casos que duelen. */

const DOCS = {
  negocios: [{ id: 'NEG1', nombre: 'Taller 101', rfc: 'XAXX010101000', moneda: 'MXN', creado_at: '2025-06-01T00:00:00Z', descripcion: 'principal', owner_uid: 'UID-MIKE' }],
  cuentas: [
    { id: 'CTA1', nombre: 'Banco', tipo: 'banco', banco: 'BBVA', moneda: 'MXN', saldo_inicial: 10000.5, saldo_actual: 55555, negocio_id: 'NEG1', numero: '1234' },
    { id: 'CTA2', nombre: 'Caja', tipo: 'caja', moneda: 'MXN', saldo_inicial: 0, negocio_id: 'NEG1' },
  ],
  clientes: [
    { id: 'CLI1', nombre: 'Áurea Pérez', email: 'Aurea@Ejemplo.MX', telefono: '55', negocio_id: 'NEG1', uid: 'UID-AUREA', creado_at: { seconds: 1751328000, nanoseconds: 0 } },
    { id: 'CLI2', nombre: 'Beto Sin Portal', email: 'beto@ejemplo.mx', negocio_id: 'NEG1' },
  ],
  proveedores: [{ id: 'PROV1', nombre: 'Maderas del Sur', email: 'ventas@maderas.mx', terminos_pago_default: '30 días', categoria: 'insumos' }],
  proyectos: [
    {
      id: 'PRO1', nombre: 'Casa Pérez', cliente_id: 'CLI1', negocio_id: 'NEG1', estado: 'activo',
      cliente_nombre: 'Áurea Pérez', precio_venta: 175000, cobrado: 60000, pagado: 1000,
      fecha_inicio: '2026-02-01', creado_at: '2026-01-15T12:00:00Z',
      partidas: [{ proveedor_id: 'PROV1', concepto: 'Madera', monto_acordado: 20000.005, monto_pagado: 1000, estado: 'parcial' }],
      productos: [
        { id: 'p1a2b3c4', nombre: 'Cocina', monto: 150000, fecha_entrega: '2026-04-01', pagado: 60000, quell_id: 'Q1' },
        { id: 'p9z8y7x6', nombre: 'Clóset', monto: 25000.5, etapa: 4, pagado: 0 },
      ],
    },
  ],
  movimientos: [
    { id: 'MOV1', tipo: 'ingreso', monto: 60000, fecha: '2026-03-01', cuenta_id: 'CTA1', negocio_id: 'NEG1', proyecto_id: 'PRO1', producto_id: 'p1a2b3c4', contraparte_tipo: 'cliente', contraparte_id: 'CLI1', descripcion: 'Anticipo' },
    { id: 'MOV2', tipo: 'egreso', monto: 1000, fecha: '2026-03-05', cuenta_id: 'CTA1', negocio_id: 'NEG1', proyecto_id: 'PRO1', contraparte_tipo: 'proveedor', contraparte_id: 'PROV1' },
    // 'cuenta' no existe como contraparte en la suite: se traduce a 'otro'
    { id: 'MOV3', tipo: 'egreso', monto: 250.25, fecha: '2026-03-06', cuenta_id: 'CTA2', negocio_id: 'NEG1', contraparte_tipo: 'cuenta', transfer_id: 'T1' },
  ],
  opex: [{ id: 'OPX1', nombre: 'Renta', tipo: 'egreso', monto: 18000, moneda: 'MXN', frecuencia: 'mensual', dia_del_mes: 5, fecha_inicio: '2025-01-01', activo: true, negocio_id: 'NEG1' }],
  usuarios: [
    { id: 'UID-MIKE', email: CORREO, nombre: 'Mike', memberships: { NEG1: { rol: 'owner' } } },
    { id: 'UID-SOCIA', email: 'socia@ejemplo.mx', nombre: 'Socia', memberships: { NEG1: { rol: 'socio' } } },
  ],
};

/** Lo que tiene que dar la suma, calculado a mano y no con el mismo código que
 *  se está probando: si los dos se equivocan igual, la prueba no prueba nada. */
const ESPERADO = {
  items_monto: 15000000 + 2500050,
  movimientos_monto: 6000000 + 100000 + 25025,
  cuentas_saldo: 1000050 + 0,
  opex_monto: 1800000,
  partidas_acordado: 2000001, // 20000.005 → sube el medio centavo
  partidas_pagado: 100000,
};

beforeAll(async () => {
  const c = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: CORREO }) });
  await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO, codigo: c.data.codigo_prueba }) });
  await pedir('/admin/orgs', { method: 'POST', body: JSON.stringify({ id: ORG, nombre: 'Empresa importada' }) });
});

const importar = (modo: 'seco' | 'escribir') =>
  pedir('/admin/importar', { method: 'POST', body: JSON.stringify({ org: ORG, modo, docs: DOCS }) });

/* ─────────────── la puerta ─────────────── */

describe('la puerta de servicio está cerrada', () => {
  it('sin sesión no se abre', async () => {
    const antes = galleta;
    galleta = '';
    const r = await pedir('/admin/importar', { method: 'POST', body: JSON.stringify({ org: ORG }) });
    expect(r.estado).toBe(401);
    expect(r.error).toBe('sin_sesion');
    galleta = antes;
  });

  it('una empresa que no existe no se importa', async () => {
    const r = await pedir('/admin/importar', { method: 'POST', body: JSON.stringify({ org: 'no-existe', docs: {} }) });
    expect(r.estado).toBe(404);
    expect(r.error).toBe('org_desconocida');
  });

  it('la página se puede abrir sin sesión: es solo la pantalla', async () => {
    const r = await SELF.fetch('https://api.local/admin/importar');
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('text/html');
    const html = await r.text();
    expect(html).toContain('Taller 101');
  });
});

/* ─────────────── el ensayo no escribe ─────────────── */

describe('§6.6 · el ensayo mide sin escribir', () => {
  it('en seco cuenta todo y deja la base como estaba', async () => {
    const r = await importar('seco');
    expect(r.estado).toBe(200);
    expect(r.data.modo).toMatch(/seco/);
    // Mide lo mismo que la corrida buena…
    const items = r.data.cuadre.tablas.find((t: any) => t.tabla === 'items');
    expect(items.nuevas).toBe(2);
    expect(items.en_orgdb).toBe(2);
    // …y no deja nada.
    const lista = await pedir(`/orgs/${ORG}/items`, { app: 'dash101' });
    expect(lista.data.total).toBe(0);
  });
});

/* ─────────────── la corrida buena ─────────────── */

describe('§6.1 y §6.2 · los conteos y el dinero cuadran', () => {
  let r: any;

  beforeAll(async () => { r = await importar('escribir'); });

  it('la API dice que cuadra', () => {
    expect(r.estado).toBe(200);
    expect(r.data.rechazos).toEqual([]);
    expect(r.data.fallos).toEqual([]);
    expect(r.data.veredicto).toBe('cuadra');
  });

  it('las filas de Firestore y las del OrgDB son las mismas, tabla por tabla', () => {
    const por = Object.fromEntries(r.data.cuadre.tablas.map((t: any) => [t.tabla, t]));
    expect(por.negocios).toMatchObject({ firestore: 1, en_orgdb: 1, cuadra: true });
    expect(por.cuentas).toMatchObject({ firestore: 2, en_orgdb: 2, cuadra: true });
    expect(por.clientes).toMatchObject({ firestore: 2, en_orgdb: 2, cuadra: true });
    expect(por.proveedores).toMatchObject({ firestore: 1, en_orgdb: 1, cuadra: true });
    expect(por.proyectos).toMatchObject({ firestore: 1, en_orgdb: 1, cuadra: true });
    // los dos productos del proyecto son dos ítems
    expect(por.items).toMatchObject({ firestore: 2, en_orgdb: 2, cuadra: true });
    expect(por.movimientos).toMatchObject({ firestore: 3, en_orgdb: 3, cuadra: true });
    expect(por.opex).toMatchObject({ firestore: 1, en_orgdb: 1, cuadra: true });
    // la partida del JSON del proyecto es un renglón de la tabla partidas
    expect(por.partidas).toMatchObject({ firestore: 1, en_orgdb: 1, cuadra: true });
  });

  it('no se inventó historial: `avances` quedó vacío', async () => {
    const av = await pedir(`/orgs/${ORG}/avances`, { app: 'dash101' });
    expect(av.data.total).toBe(0);
  });

  it('las sumas de dinero cuadran al centavo', () => {
    const por = Object.fromEntries(r.data.cuadre.dinero.map((d: any) => [d.campo, d]));
    expect(por['items.monto'].en_orgdb).toBe(ESPERADO.items_monto);
    expect(por['movimientos.monto'].en_orgdb).toBe(ESPERADO.movimientos_monto);
    expect(por['cuentas.saldo_inicial'].en_orgdb).toBe(ESPERADO.cuentas_saldo);
    expect(por['opex.monto'].en_orgdb).toBe(ESPERADO.opex_monto);
    // el dinero de las partidas también se convirtió; lo pagado y el
    // compromiso no se importan, se recalculan, y por eso están aparte
    expect(por['partidas.monto_acordado'].en_orgdb).toBe(ESPERADO.partidas_acordado);
    expect(por['partidas.monto_pagado']).toBeUndefined();
    for (const d of r.data.cuadre.dinero) expect(d.cuadra).toBe(true);
    const rec = Object.fromEntries(r.data.cuadre.recalculado.map((d: any) => [d.campo, d]));
    expect(rec['partidas.monto_pagado'].en_orgdb).toBe(ESPERADO.partidas_pagado);
    expect(rec['proyectos.compromiso'].en_orgdb).toBe(ESPERADO.partidas_acordado);
  });

  it('el único redondeo que hubo está declarado, no escondido', () => {
    expect(r.data.redondeos).toHaveLength(1);
    expect(r.data.redondeos[0]).toMatchObject({ coleccion: 'partidas', id: 'PRO1-p1', campo: 'monto_acordado', origen: '20000.005', centavos: 2000001 });
  });

  it('§6.3 · los ids son los mismos de los dos lados', async () => {
    for (const [tabla, id] of [['clientes', 'CLI1'], ['proyectos', 'PRO1'], ['items', 'p1a2b3c4'], ['movimientos', 'MOV1']]) {
      const f = await pedir(`/orgs/${ORG}/${tabla}/${id}`, { app: 'dash101' });
      expect(f.estado, `${tabla}/${id}`).toBe(200);
      expect(f.data.id).toBe(id);
    }
  });

  it('§6.4 · un producto_id viejo apunta al ítem correcto', async () => {
    const mov = await pedir(`/orgs/${ORG}/movimientos/MOV1`, { app: 'dash101' });
    expect(mov.data.item_id).toBe('p1a2b3c4');
    const item = await pedir(`/orgs/${ORG}/items/p1a2b3c4`, { app: 'dash101' });
    expect(item.data.nombre).toBe('Cocina');
    expect(r.data.enlaces).toMatchObject({ movimientos_con_item: 1, item_que_no_existe: [] });
  });

  it('lo que se conserva y lo que no: fechas, etapa, y los cachés recalculados', async () => {
    const item = await pedir(`/orgs/${ORG}/items/p9z8y7x6`, { app: 'dash101' });
    // la etapa que ya traía se conserva (ninguna app puede escribirla: por eso
    // esto es una puerta de servicio)
    expect(item.data.etapa).toBe(4);
    expect(item.data.estado).toBe('vendido');
    expect(item.data.creado_at).toBe('2026-01-15T12:00:00.000Z');

    const p = await pedir(`/orgs/${ORG}/proyectos/PRO1`, { app: 'dash101' });
    // los cachés NO son los de Firestore: los recalculó la API
    expect(p.data.precio_venta).toBe(ESPERADO.items_monto);
    expect(p.data.cobrado).toBe(6000000);
    expect(p.data.pagado_prov).toBe(100000);
    expect(p.data.compromiso).toBe(ESPERADO.partidas_acordado);
    expect(p.data.avance).toBeCloseTo((0 + 4) / 2 / 7, 9);
  });

  it('la partida quedó como fila propia: cuelga del proyecto, sin ítem, y lo pagado lo calculó la API', async () => {
    const par = await pedir(`/orgs/${ORG}/partidas/PRO1-p1`, { app: 'dash101' });
    expect(par.estado).toBe(200);
    expect(par.data).toMatchObject({ proyecto_id: 'PRO1', item_id: null, proveedor_id: 'PROV1', concepto: 'Madera', monto_acordado: ESPERADO.partidas_acordado });
    // Firestore decía monto_pagado 1000 y estado parcial; aquí sale de MOV2,
    // el egreso de 1000 a PROV1 dentro de PRO1. Coinciden porque conta-master
    // también los calculaba así, no porque se hayan copiado.
    expect(par.data.monto_pagado).toBe(ESPERADO.partidas_pagado);
    expect(par.data.estado).toBe('parcial');
    const lista = await pedir(`/orgs/${ORG}/partidas?proyecto_id=PRO1`, { app: 'dash101' });
    expect(lista.data.total).toBe(1);
  });

  it('el nombre_norm lo pone la API, con acentos y todo', async () => {
    const c = await pedir(`/orgs/${ORG}/clientes/CLI1`, { app: 'dash101' });
    expect(c.data.nombre_norm).toBe('aurea perez');
    expect(c.data.correo).toBe('aurea@ejemplo.mx');
    expect(c.data.portal_activo).toBe(true);
  });

  it('una contraparte que la suite no conoce se traduce a «otro», no se pierde el movimiento', async () => {
    const m = await pedir(`/orgs/${ORG}/movimientos/MOV3`, { app: 'dash101' });
    expect(m.data.contraparte_tipo).toBe('otro');
    expect(m.data.transfer_id).toBe('T1');
  });
});

/* ─────────────── correrlo dos veces ─────────────── */

describe('§6.6 · correr el import dos veces no duplica nada', () => {
  it('la segunda corrida actualiza, no inserta, y la base queda igual', async () => {
    const antes = await pedir(`/orgs/${ORG}/movimientos`, { app: 'dash101' });
    const r = await importar('escribir');

    for (const t of r.data.cuadre.tablas) {
      expect(t.nuevas, `${t.tabla} no debía insertar nada`).toBe(0);
      expect(t.actualizadas).toBe(t.mapeadas);
      expect(t.en_orgdb).toBe(t.antes);
    }
    const despues = await pedir(`/orgs/${ORG}/movimientos`, { app: 'dash101' });
    expect(despues.data.total).toBe(antes.data.total);
    expect(r.data.veredicto).toBe('cuadra');

    // y el dinero sigue siendo el mismo: no se sumó dos veces
    const por = Object.fromEntries(r.data.cuadre.dinero.map((d: any) => [d.campo, d]));
    expect(por['movimientos.monto'].en_orgdb).toBe(ESPERADO.movimientos_monto);
  });
});

/* ─────────────── §6.5 · la gente entra de verdad ─────────────── */

describe('§6.5 · los usuarios existen y entran con «olvidé mi PIN»', () => {
  it('se crearon el miembro y el acceso del cliente', async () => {
    const r = await pedir(`/admin/orgs/${ORG}/miembros`);
    const correos = r.data.filas.map((f: any) => f.correo);
    expect(correos).toContain('socia@ejemplo.mx');
    expect(correos).toContain(CORREO);
    const socia = r.data.filas.find((f: any) => f.correo === 'socia@ejemplo.mx');
    expect(socia.rol).toBe('socio');
    expect(socia.negocios).toEqual(['NEG1']);
  });

  it('la clienta fija su PIN por correo y entra con él', async () => {
    const mio = galleta;
    galleta = '';

    // «Olvidé mi PIN» = código al correo → entrar → fijar PIN.
    const cod = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: 'aurea@ejemplo.mx' }) });
    expect(cod.data.codigo_prueba).toMatch(/^\d{6}$/);
    const ent = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: 'aurea@ejemplo.mx', codigo: cod.data.codigo_prueba }) });
    expect(ent.estado).toBe(200);
    const puesto = await pedir('/auth/pin', { method: 'POST', body: JSON.stringify({ pin: '482913' }) });
    expect(puesto.data.puesto).toBe(true);

    // Y ahora entra solo con el PIN, como va a hacer todos los días.
    await pedir('/auth/salir', { method: 'POST' });
    galleta = '';
    const conPin = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: 'aurea@ejemplo.mx', pin: '482913' }) });
    expect(conPin.estado).toBe(200);

    // Y lo que ve es lo suyo, ya sumado, con el id de Firestore intacto.
    const yo = await pedir('/yo');
    expect(yo.data.acceso).toMatchObject({ org_id: ORG, tipo: 'cliente', ref_id: 'CLI1' });
    const peek = await pedir(`/orgs/${ORG}/peek`, { app: 'peek101' });
    expect(peek.estado).toBe(200);
    expect(peek.data.cliente.id).toBe('CLI1');
    expect(peek.data.totales.vendido).toBe(ESPERADO.items_monto);
    expect(peek.data.totales.cobrado).toBe(6000000);
    expect(peek.data.proyectos[0].items).toHaveLength(2);

    galleta = mio;
  });

  it('un usuario que no es superadmin no abre la puerta de servicio', async () => {
    const mio = galleta;
    galleta = '';
    const cod = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: 'socia@ejemplo.mx' }) });
    await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: 'socia@ejemplo.mx', codigo: cod.data.codigo_prueba }) });
    const r = await pedir('/admin/importar', { method: 'POST', body: JSON.stringify({ org: ORG, modo: 'escribir', docs: DOCS }) });
    expect(r.estado).toBe(403);
    expect(r.error).toBe('sin_permiso');
    galleta = mio;
  });
});

/* ─────────────── lo que sale mal se dice ─────────────── */

describe('lo que no se puede importar se rechaza y se cuenta', () => {
  it('una fila con dinero ilegible no entra, y el resto sí', async () => {
    const r = await pedir('/admin/importar', {
      method: 'POST',
      body: JSON.stringify({
        org: ORG, modo: 'seco',
        docs: {
          movimientos: [
            { id: 'MALO', tipo: 'ingreso', monto: 'como quinientos', fecha: '2026-03-01', cuenta_id: 'CTA1', negocio_id: 'NEG1' },
            { id: 'BUENO', tipo: 'ingreso', monto: 500, fecha: '2026-03-01', cuenta_id: 'CTA1', negocio_id: 'NEG1' },
          ],
        },
      }),
    });
    expect(r.data.veredicto).toMatch(/NO cuadra/);
    expect(r.data.rechazos).toHaveLength(1);
    expect(r.data.rechazos[0]).toMatchObject({ coleccion: 'movimientos', id: 'MALO', campo: 'monto' });
    // La plata de la fila rechazada no aparece en ninguna suma.
    const mov = r.data.cuadre.dinero.find((d: any) => d.campo === 'movimientos.monto');
    expect(mov.centavos).toBe(50000);
  });

  it('una colección que este importador no conoce se dice en vez de callarse', async () => {
    const r = await pedir('/admin/importar', {
      method: 'POST',
      body: JSON.stringify({ org: ORG, modo: 'seco', docs: { inventada: [{ id: 'X' }] } }),
    });
    expect(r.data.colecciones_desconocidas).toEqual(['inventada']);
  });
});

/* ─────────────── la mudanza de quote101 ───────────────
 * quote101 no tiene colecciones: tiene UN documento con un árbol adentro.
 * Estas pruebas son de dos clases y las dos hacen falta. Las primeras miran el
 * mapeo solo, sin base: es donde se decide qué es dinero y cuántos centavos
 * son. Las últimas van por la ruta y por el OrgDB, que es donde se pone el
 * folio y donde se ve si correrlo dos veces hace daño.
 */

/** El árbol, con la forma que de verdad tiene el documento de quote101. */
const ARBOL = {
  clientes: [
    {
      id: 'cli-1', nombre: 'Casa Aurea',
      proyectos: [
        {
          id: 'pro-1', nombre: 'Cocina',
          cotizaciones: [
            {
              id: 'cot-1', nombre: 'Cocina integral',
              versiones: [
                {
                  fecha: '2026-03-04T10:00:00.000Z', folio: 'COT-000007',
                  muebles: [
                    { id: 'm1', nombre: 'Alacena', total: 12500.5, qty: 2, imagenes: ['https://firebasestorage.googleapis.com/x.jpg'] },
                    { id: 'm2', nombre: 'Barra', total: 3000, qty: 1, imagenes: ['data:image/jpeg;base64,AAA'] },
                  ],
                },
                { fecha: '2026-02-01T10:00:00.000Z', archivada: true, historicoURL: 'https://firebasestorage.googleapis.com/v1.json', resumen: { muebles: 1, total: 9000 } },
              ],
            },
            {
              // Sin folio: la app nunca le puso número.
              id: 'cot-2', nombre: 'Cocina chica',
              versiones: [{ fecha: '2026-01-09T10:00:00.000Z', muebles: [{ id: 'm3', nombre: 'Mueble', total: 10.005, qty: 4, imagenes: [] }] }],
            },
          ],
        },
      ],
    },
  ],
  config: { empresa: 'Taller 101', iva: 16 },
  prices: { mano_obra: 350.5 },
  reciboCounter: 7,
};

describe('la mudanza de quote101: del árbol a las filas', () => {
  const cosecha = cosechar({ cotizador: [ARBOL] }, '2026-09-16T00:00:00.000Z', { negocio_id: 'neg-1' });

  it('el árbol se reparte en clientes, proyectos y cotizaciones', () => {
    expect(cosecha.filas.clientes?.map((f) => f.id)).toEqual(['cli-1']);
    expect(cosecha.filas.proyectos?.map((f) => f.id)).toEqual(['pro-1']);
    expect(cosecha.filas.cotizaciones?.map((f) => f.id)).toEqual(['cot-1', 'cot-2']);
    expect(cosecha.rechazos).toEqual([]);
  });

  it('los ids del árbol se conservan: es lo que hace que repetirla no duplique', () => {
    expect(cosecha.filas.proyectos?.[0].cliente_id).toBe('cli-1');
    expect(cosecha.filas.cotizaciones?.[0].cliente_id).toBe('cli-1');
    expect((cosecha.filas.cotizaciones?.[0].datos as any).proyecto_id).toBe('pro-1');
  });

  it('el proyecto entra como «planeando»: la app no guarda estado y no se inventa', () => {
    expect(cosecha.filas.proyectos?.[0].estado).toBe('planeando');
  });

  it('el total se convierte a centavos ANTES de multiplicar por la cantidad', () => {
    // 12500.50 × 2 = 2500100, y 3000 × 1 = 300000.
    expect(cosecha.filas.cotizaciones?.[0].total).toBe(2500100 + 300000);
    // El caso que justifica el orden: 10.005 por pieza son 1001 centavos
    // (redondeo declarado), y cuatro piezas son 4004. Multiplicando primero en
    // flotantes, 10.005 × 4 = 40.02 → 4002: dos centavos que no están en
    // ningún renglón y que nadie volvería a encontrar.
    expect(cosecha.filas.cotizaciones?.[1].total).toBe(4004);
    expect(Math.round(10.005 * 4 * 100)).toBe(4002);
  });

  it('cada redondeo al centavo queda apuntado, con el valor de origen', () => {
    const r = cosecha.redondeos.find((x) => x.id === 'cot-2#0');
    // El origen es el precio POR PIEZA, que es lo que de verdad se redondeó.
    // Si aquí dijera 40.02 la nota parecería un error de dos centavos, cuando
    // lo que pasó fue que cada una de las cuatro piezas subió medio centavo.
    expect(r?.origen).toBe('10.005');
    expect(r?.veces).toBe(4);
    expect(r?.centavos).toBe(4004);
  });

  it('la suma del cuadre es la que se escribió, no el precio por pieza', () => {
    // Si se apuntara el precio por pieza, el cuadre compararía una cifra
    // contra otra que nunca se guardó, y saldría «no cuadra» sin que nada
    // estuviera mal.
    const escrito = (cosecha.filas.cotizaciones ?? []).reduce((s, f) => s + Number(f.total), 0);
    expect(cosecha.sumas['cotizaciones.total']).toBe(escrito);
  });

  it('las versiones viajan enteras en `datos`, con su historia', () => {
    const datos = cosecha.filas.cotizaciones?.[0].datos as any;
    expect(datos.nombre).toBe('Cocina integral');
    expect(datos.versiones).toHaveLength(2);
    expect(datos.versiones[1].archivada).toBe(true);
  });

  it('el folio que traía se conserva; el que no traía NI SE MENCIONA', () => {
    expect(cosecha.filas.cotizaciones?.[0].folio).toBe('COT-000007');
    // No es `''`: mandarlo vacío le borraría el folio a una fila ya importada.
    expect('folio' in (cosecha.filas.cotizaciones?.[1] ?? {})).toBe(false);
    expect(cosecha.avisos.folios_traidos).toBe(1);
    expect(cosecha.avisos.sin_folio).toBe(1);
  });

  it('config y prices se van a `ajustes`, con el id que les toca', () => {
    expect(cosecha.filas.ajustes?.map((f) => f.id)).toEqual(['cotizador101:config', 'cotizador101:precios']);
    expect(cosecha.filas.ajustes?.[1].valor).toEqual({ mano_obra: 350.5 });
    expect(cosecha.filas.ajustes?.[0].app).toBe('cotizador101');
  });

  it('`reciboCounter` NO se importa, y se dice que se quedó fuera', () => {
    // Traerlo sería mudar de casa el mismo problema de concurrencia que el
    // folio ya dejó atrás. Le toca su propia vuelta.
    expect(cosecha.filas.ajustes?.some((f) => String(f.clave).includes('recibo'))).toBe(false);
    expect(cosecha.ignorados.cotizador).toContain('reciboCounter');
  });

  it('cuenta lo que se queda en Firebase Storage, que es lo que decide si se puede apagar', () => {
    expect(cosecha.avisos.versiones_en_storage).toBe(1);
    expect(cosecha.avisos.imagenes_en_storage).toBe(1);
    expect(cosecha.avisos.imagenes_en_el_documento).toBe(1);
  });

  it('sin negocio no se importa nada, y se dice por qué', () => {
    const sin = cosechar({ cotizador: [ARBOL] }, '2026-09-16T00:00:00.000Z', {});
    expect(sin.filas.clientes).toBeUndefined();
    expect(sin.rechazos[0].motivo).toMatch(/falta `negocio`/);
  });

  it('una cantidad que no es entero se rechaza: no se redondea a escondidas', () => {
    const raro = { ...ARBOL, clientes: [{ id: 'c', nombre: 'X', proyectos: [{ id: 'p', nombre: 'Y', cotizaciones: [{ id: 'q', versiones: [{ muebles: [{ total: 10, qty: 1.5 }] }] }] }] }] };
    const r = cosechar({ cotizador: [raro] }, undefined, { negocio_id: 'neg-1' });
    expect(r.filas.cotizaciones).toBeUndefined();
    expect(r.rechazos.some((x) => x.campo === 'qty')).toBe(true);
  });

  it('el árbol también se entiende en el formato crudo de la API REST', () => {
    // Es como llega de verdad: cada valor envuelto en su tipo, y los mapas y
    // las listas anidados. Si esto no se desenvolviera bien, el navegador
    // tendría que interpretar el documento antes de mandarlo — y entonces el
    // código que decide qué es dinero viviría fuera de estas pruebas.
    const rest = {
      name: 'projects/x/databases/(default)/documents/app/datos',
      fields: {
        clientes: {
          arrayValue: {
            values: [{
              mapValue: {
                fields: {
                  id: { stringValue: 'cli-9' }, nombre: { stringValue: 'Rita' },
                  proyectos: {
                    arrayValue: {
                      values: [{
                        mapValue: {
                          fields: {
                            id: { stringValue: 'pro-9' }, nombre: { stringValue: 'Closet' },
                            cotizaciones: {
                              arrayValue: {
                                values: [{
                                  mapValue: {
                                    fields: {
                                      id: { stringValue: 'cot-9' },
                                      versiones: {
                                        arrayValue: {
                                          values: [{
                                            mapValue: {
                                              fields: {
                                                muebles: {
                                                  arrayValue: {
                                                    values: [{ mapValue: { fields: { total: { doubleValue: 99.99 }, qty: { integerValue: '2' } } } }],
                                                  },
                                                },
                                              },
                                            },
                                          }],
                                        },
                                      },
                                    },
                                  },
                                }],
                              },
                            },
                          },
                        },
                      }],
                    },
                  },
                },
              },
            }],
          },
        },
      },
    };
    const r = cosechar({ cotizador: [rest] }, undefined, { negocio_id: 'neg-1' });
    expect(r.rechazos).toEqual([]);
    expect(r.filas.clientes?.[0].nombre).toBe('Rita');
    expect(r.filas.cotizaciones?.[0].total).toBe(9999 * 2);
  });
});

describe('la mudanza de quote101: el folio lo pone el OrgDB', () => {
  const ORG_C = 'cotizador-mudanza';
  let negocio = '';

  beforeAll(async () => {
    await pedir('/admin/orgs', { method: 'POST', body: JSON.stringify({ id: ORG_C, nombre: 'Mudanza' }) });
    const n = await pedir(`/orgs/${ORG_C}/negocios`, { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'Taller' }) });
    negocio = n.data.id;
  });

  const mudar = (modo: 'seco' | 'escribir') =>
    pedir('/admin/importar', {
      method: 'POST',
      body: JSON.stringify({ org: ORG_C, modo, negocio, docs: { cotizador: [ARBOL] } }),
    });

  it('el ensayo cuenta los avisos sin escribir nada', async () => {
    const r = await mudar('seco');
    expect(r.estado).toBe(200);
    expect(r.data.avisos.versiones_en_storage).toBe(1);
    expect(r.data.avisos.sin_folio).toBe(1);
    const lista = await pedir(`/orgs/${ORG_C}/cotizaciones`, { app: 'cotizador101' });
    expect(lista.data.total).toBe(0);
  });

  it('un negocio que no existe se rechaza antes de tocar nada', async () => {
    const r = await pedir('/admin/importar', {
      method: 'POST',
      body: JSON.stringify({ org: ORG_C, modo: 'seco', negocio: 'no-existe', docs: { cotizador: [ARBOL] } }),
    });
    expect(r.estado).toBe(404);
    expect(r.error).toBe('negocio_desconocido');
  });

  it('al escribir, la que traía folio lo conserva y la que no se lleva el siguiente', async () => {
    const r = await mudar('escribir');
    expect(r.estado).toBe(200);
    expect(r.data.avisos.folios_asignados).toBe(1);
    const lista = await pedir(`/orgs/${ORG_C}/cotizaciones`, { app: 'cotizador101' });
    const porId = Object.fromEntries(lista.data.filas.map((f: any) => [f.id, f.folio]));
    expect(porId['cot-1']).toBe('COT-000007');
    // El contador se salta los folios ocupados, así que el nuevo no choca con
    // el que la mudanza trajo congelado.
    expect(porId['cot-2']).toMatch(/^COT-\d{6}$/);
    expect(porId['cot-2']).not.toBe('COT-000007');
  });

  it('y la cotización nueva que se haga después sigue la cuenta, sin chocar', async () => {
    const nueva = await pedir(`/orgs/${ORG_C}/cotizaciones`, {
      app: 'cotizador101', method: 'POST', body: JSON.stringify({ negocio_id: negocio, total: 100 }),
    });
    expect(nueva.estado).toBe(201);
    expect(nueva.data.folio).toMatch(/^COT-\d{6}$/);
    const lista = await pedir(`/orgs/${ORG_C}/cotizaciones`, { app: 'cotizador101' });
    const folios = lista.data.filas.map((f: any) => f.folio);
    expect(new Set(folios).size).toBe(folios.length);
  });

  it('correrla dos veces NO le cambia el folio a ninguna', async () => {
    // Es la prueba que más importa de esta parte: un folio que cambia en la
    // segunda corrida es un folio distinto del que el cliente ya tiene impreso.
    const antes = await pedir(`/orgs/${ORG_C}/cotizaciones`, { app: 'cotizador101' });
    const mapa = Object.fromEntries(antes.data.filas.map((f: any) => [f.id, f.folio]));
    const r = await mudar('escribir');
    expect(r.data.avisos.folios_asignados).toBe(0);
    const despues = await pedir(`/orgs/${ORG_C}/cotizaciones`, { app: 'cotizador101' });
    expect(Object.fromEntries(despues.data.filas.map((f: any) => [f.id, f.folio]))).toEqual(mapa);
    expect(despues.data.total).toBe(antes.data.total);
  });

  it('los ajustes quedan donde la app los va a buscar', async () => {
    const r = await pedir(`/orgs/${ORG_C}/ajustes`, { app: 'cotizador101' });
    const porClave = Object.fromEntries(r.data.filas.map((f: any) => [f.clave, f.valor]));
    expect(porClave.config).toEqual({ empresa: 'Taller 101', iva: 16 });
    expect(porClave.precios).toEqual({ mano_obra: 350.5 });
  });

  it('y el dinero cuadra al centavo contra lo que se convirtió', async () => {
    const r = await mudar('seco');
    const total = r.data.cuadre.dinero.find((d: any) => d.campo === 'cotizaciones.total');
    expect(total.cuadra).toBe(true);
    expect(total.centavos).toBe(2500100 + 300000 + 4004);
  });
});

/* ─────────────── las fotos salen de Firebase ───────────────
 * Lo que la mudanza del documento no puede traer: las fotos de los muebles y
 * el detalle de las versiones archivadas viven en Firebase Storage y sólo se
 * referencian por URL. Se importan como URLs, y esas URLs mueren el día que
 * Firebase se apague.
 *
 * El `fetch` a Storage se suplanta: aquí no se prueba que Firebase conteste
 * —eso no depende de este código—, se prueba qué se guarda, qué se reescribe,
 * qué pasa cuando algo falla, y que repetirlo no vuelva a bajar lo que ya
 * está. Lo que NO se suplanta es R2 ni el registro en `archivos`: ésos son de
 * verdad, dentro de workerd.
 */

describe('las fotos salen de Firebase Storage', () => {
  const ORG_A = 'cotizador-archivos';
  const FOTO = 'https://firebasestorage.googleapis.com/v0/b/x/o/muebles%2F17-ab.jpg?alt=media&token=t';
  const HIST = 'https://firebasestorage.googleapis.com/v0/b/x/o/versiones%2F17-cd.json?alt=media&token=t';
  const AJENA = 'https://cdn.ejemplo.mx/foto.jpg';

  const original = globalThis.fetch;
  let pedidas: string[] = [];
  /** Contesta como Storage sólo a Storage; lo demás pasa de largo, o `SELF`
   *  dejaría de funcionar. */
  function suplantar(comoVa: 'bien' | 'mal' = 'bien') {
    pedidas = [];
    globalThis.fetch = (async (entrada: any, init?: any) => {
      const u = String(entrada instanceof Request ? entrada.url : entrada);
      if (u.includes('firebasestorage.googleapis.com')) {
        pedidas.push(u);
        if (comoVa === 'mal') return new Response('no', { status: 403 });
        return new Response(new Uint8Array([1, 2, 3, 4, 5]), { headers: { 'Content-Type': 'image/jpeg' } });
      }
      return original(entrada, init);
    }) as typeof fetch;
  }
  afterEach(() => { globalThis.fetch = original; });

  const arbolConFotos = {
    cotizador: [{
      clientes: [{
        id: 'af-cli', nombre: 'Casa Fotos',
        proyectos: [{
          id: 'af-pro', nombre: 'Cocina',
          cotizaciones: [{
            id: 'af-q1', nombre: 'Con fotos',
            versiones: [
              { fecha: '2026-03-04T10:00:00Z', muebles: [{ total: 1000, qty: 1, imagenes: [FOTO, AJENA] }] },
              { fecha: '2026-02-01T10:00:00Z', archivada: true, historicoURL: HIST },
            ],
          }],
        }],
      }],
    }],
  };

  let negocio = '';
  const mudar = (modo: 'seco' | 'escribir', limite?: number) =>
    pedir('/admin/mudar-archivos', { method: 'POST', body: JSON.stringify({ org: ORG_A, modo, limite }) });

  beforeAll(async () => {
    await pedir('/admin/orgs', { method: 'POST', body: JSON.stringify({ id: ORG_A, nombre: 'Archivos' }) });
    const n = await pedir(`/orgs/${ORG_A}/negocios`, { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'Taller' }) });
    negocio = n.data.id;
    await pedir('/admin/importar', {
      method: 'POST',
      body: JSON.stringify({ org: ORG_A, modo: 'escribir', negocio, docs: arbolConFotos }),
    });
  });

  it('el ensayo cuenta lo que falta y no baja nada', async () => {
    suplantar();
    const r = await mudar('seco');
    expect(r.estado).toBe(200);
    // Dos: la foto y el JSON de la versión archivada. La URL de otro dominio
    // NO se cuenta.
    expect(r.data.archivos_en_firebase).toBe(2);
    expect(r.data.cotizaciones_con_archivos_en_firebase).toBe(1);
    expect(r.data.movidos).toBe(0);
    expect(r.data.firebase_se_puede_apagar).toBe(false);
    expect(pedidas).toEqual([]);
  });

  it('sólo se baja de Firebase Storage, no de cualquier dirección que venga en los datos', async () => {
    // Las URLs vienen de datos importados, o sea de fuera. Sin la lista blanca,
    // quien lograra meter una URL en `datos` tendría al Worker pidiendo lo que
    // él quiera desde dentro de la red de Cloudflare.
    suplantar();
    await mudar('escribir', 100);
    expect(pedidas).toHaveLength(2);
    expect(pedidas.every((u) => u.includes('firebasestorage.googleapis.com'))).toBe(true);
    const cot = await pedir(`/orgs/${ORG_A}/cotizaciones/af-q1`, { app: 'cotizador101' });
    // La ajena sigue ahí, intacta: no era de Firebase y no es de esta mudanza.
    expect(JSON.stringify(cot.data.datos)).toContain(AJENA);
  });

  it('la URL de la foto queda apuntando a la suite, que sí pide sesión', async () => {
    const cot = await pedir(`/orgs/${ORG_A}/cotizaciones/af-q1`, { app: 'cotizador101' });
    const datos = cot.data.datos as any;
    const nueva = datos.versiones[0].muebles[0].imagenes[0];
    expect(nueva).toMatch(new RegExp(`^/s101/orgs/${ORG_A}/archivos/`));
    expect(datos.versiones[1].historicoURL).toMatch(new RegExp(`^/s101/orgs/${ORG_A}/archivos/`));
    expect(JSON.stringify(datos)).not.toContain('firebasestorage');
  });

  it('el archivo queda en R2 y se baja por la API, con su nombre y su tipo', async () => {
    const cot = await pedir(`/orgs/${ORG_A}/cotizaciones/af-q1`, { app: 'cotizador101' });
    const ruta = String((cot.data.datos as any).versiones[0].muebles[0].imagenes[0]).replace('/s101', '');
    const r = await SELF.fetch(`https://api.local${ruta}`, { headers: { Cookie: galleta, 'X-App': 'cotizador101' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    const lista = await pedir(`/orgs/${ORG_A}/archivos`, { app: 'cotizador101' });
    expect(lista.data.filas.map((f: any) => f.nombre).sort()).toEqual(['17-ab.jpg', '17-cd.json']);
    expect(lista.data.filas.every((f: any) => f.de_tabla === 'cotizaciones' && f.de_id === 'af-q1')).toBe(true);
  });

  it('ya no queda nada pendiente, y eso es lo que autoriza apagar Firebase', async () => {
    suplantar();
    const r = await mudar('seco');
    expect(r.data.pendientes).toBe(0);
    expect(r.data.firebase_se_puede_apagar).toBe(true);
  });

  it('repetirla no vuelve a bajar lo que ya está', async () => {
    suplantar();
    const r = await mudar('escribir', 100);
    expect(r.data.movidos).toBe(0);
    expect(pedidas).toEqual([]);
    const lista = await pedir(`/orgs/${ORG_A}/archivos`, { app: 'cotizador101' });
    expect(lista.data.total).toBe(2);
  });

  it('se muda por tandas: el límite manda y la respuesta dice cuántas faltan', async () => {
    // Un Worker tiene techo de subpeticiones y de tiempo. Doscientas fotos en
    // una llamada se caen a la mitad; por tandas, el que llama sabe cuándo
    // parar sin llevar la cuenta.
    const ORG_T = 'cotizador-tandas';
    await pedir('/admin/orgs', { method: 'POST', body: JSON.stringify({ id: ORG_T, nombre: 'Tandas' }) });
    const n = await pedir(`/orgs/${ORG_T}/negocios`, { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'T' }) });
    await pedir('/admin/importar', {
      method: 'POST',
      body: JSON.stringify({ org: ORG_T, modo: 'escribir', negocio: n.data.id, docs: arbolConFotos }),
    });
    suplantar();
    const una = await pedir('/admin/mudar-archivos', { method: 'POST', body: JSON.stringify({ org: ORG_T, modo: 'escribir', limite: 1 }) });
    expect(una.data.movidos).toBe(1);
    expect(una.data.pendientes).toBe(1);
    expect(una.data.firebase_se_puede_apagar).toBe(false);
    const dos = await pedir('/admin/mudar-archivos', { method: 'POST', body: JSON.stringify({ org: ORG_T, modo: 'escribir', limite: 1 }) });
    expect(dos.data.pendientes).toBe(0);
    expect(dos.data.firebase_se_puede_apagar).toBe(true);
  });

  it('si Storage se niega, se dice y la URL se queda: no se pierde la referencia', async () => {
    const ORG_F = 'cotizador-falla';
    await pedir('/admin/orgs', { method: 'POST', body: JSON.stringify({ id: ORG_F, nombre: 'Falla' }) });
    const n = await pedir(`/orgs/${ORG_F}/negocios`, { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'F' }) });
    await pedir('/admin/importar', {
      method: 'POST',
      body: JSON.stringify({ org: ORG_F, modo: 'escribir', negocio: n.data.id, docs: arbolConFotos }),
    });
    suplantar('mal');
    const r = await pedir('/admin/mudar-archivos', { method: 'POST', body: JSON.stringify({ org: ORG_F, modo: 'escribir', limite: 100 }) });
    expect(r.data.movidos).toBe(0);
    expect(r.data.fallos).toHaveLength(2);
    expect(r.data.fallos[0].motivo).toMatch(/403/);
    expect(r.data.firebase_se_puede_apagar).toBe(false);
    // La URL vieja sigue ahí: borrarla habría dejado la foto sin manera de
    // volver a encontrarla.
    const cot = await pedir(`/orgs/${ORG_F}/cotizaciones/af-q1`, { app: 'cotizador101' });
    expect(JSON.stringify(cot.data.datos)).toContain('firebasestorage');
  });

  it('la puerta es sólo del superadmin', async () => {
    const antes = galleta;
    galleta = '';
    const r = await pedir('/admin/mudar-archivos', { method: 'POST', body: JSON.stringify({ org: ORG_A }) });
    expect(r.estado).toBeGreaterThanOrEqual(401);
    galleta = antes;
  });
});
