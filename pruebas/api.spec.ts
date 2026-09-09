/* Las pruebas de la fase 1.
 *
 * Están escritas contra la lista de «cuándo está terminada la fase» del
 * encargo, punto por punto, y no contra lo que el código hace. La que más
 * importa es la 5: hay que probar que `permisos.ts` dice que NO, no solo que
 * dice que sí.
 *
 * Corren dentro de workerd con el Durable Object y el D1 de verdad.
 */

import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../src/entorno';

const entorno = env as unknown as Env;

const CORREO = 'mike@forespot.com';
const ORG = 'pruebas';

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

describe('1 · el Worker responde', () => {
  it('/salud contesta 200 y alcanza el D1', async () => {
    const r = await pedir('/salud');
    expect(r.estado).toBe(200);
    expect(r.ok).toBe(true);
    expect(r.data.servicio).toBe('suite101-api');
    expect(r.data.d1).toMatch(/^si/);
  });
});

describe('1 · la portada dice qué es esto', () => {
  it('/ contesta 200 y se nombra', async () => {
    const r = await pedir('/');
    expect(r.estado).toBe(200);
    expect(r.data.servicio).toBe('suite101-api');
  });

  it('una ruta que no existe contesta 404, no 500', async () => {
    const r = await pedir('/inventada');
    expect(r.estado).toBe(404);
    expect(r.error).toBe('no_encontrado');
  });
});

describe('3 · un usuario entra con código por correo', () => {
  it('sin sesión, /yo contesta 401', async () => {
    const r = await pedir('/yo');
    expect(r.estado).toBe(401);
    expect(r.error).toBe('sin_sesion');
  });

  it('pide código, entra, y la sesión sigue viva en la petición siguiente', async () => {
    const c = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: CORREO }) });
    expect(c.ok).toBe(true);
    expect(c.data.codigo_prueba).toMatch(/^\d{6}$/);

    const e = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO, codigo: c.data.codigo_prueba }) });
    expect(e.estado).toBe(200);
    expect(e.data.usuario.correo).toBe(CORREO);

    // La cookie no lleva nada dentro: la sesión vive en D1. Que la siguiente
    // petición funcione es lo que prueba que sobrevive a recargar.
    const yo = await pedir('/yo');
    expect(yo.estado).toBe(200);
    expect(yo.data.superadmin).toBe(true);
  });

  it('un código equivocado no entra', async () => {
    const antes = galleta;
    galleta = '';
    await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: CORREO }) });
    const r = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO, codigo: '000000' }) });
    expect(r.estado).toBe(401);
    expect(r.error).toBe('codigo_invalido');
    galleta = antes;
  });
});

describe('2 · se crea una org y su Durable Object nace solo', () => {
  it('POST /admin/orgs deja la base migrada, sin redeploy', async () => {
    const r = await pedir('/admin/orgs', {
      method: 'POST',
      body: JSON.stringify({ id: ORG, nombre: 'Empresa de pruebas' }),
    });
    expect(r.estado).toBe(201);
    // La versión la contesta el propio DO: si vale 1, nació y se migró.
    expect(r.data.org_db_version).toBe(1);
  });

  it('las trece tablas están dentro del DO', async () => {
    // El stub tipado obliga a TypeScript a recorrer la clase entera; aqui no
    // hace falta, solo se le pide el listado de tablas.
    const stub = entorno.ORG.get(entorno.ORG.idFromName(ORG)) as unknown as DurableObjectStub;
    // runInDurableObject viene con genericos que arrastran toda la clase; se
    // llama por un alias plano para que TypeScript no se meta ahi (TS2589).
    const dentro = runInDurableObject as unknown as (s: unknown, f: (o: any) => string[]) => Promise<string[]>;
    const nombres = await dentro(stub, (obj: any): string[] =>
      obj.sql.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%'`)
        .toArray().map((f: any) => f.name).sort(),
    );
    expect(nombres).toEqual([
      'archivos', 'avances', 'clientes', 'cotizaciones', 'cuentas', 'estaciones',
      'items', 'movimientos', 'negocios', 'opex', 'personal', 'proveedores', 'proyectos',
    ]);
  });

  it('sin X-App no se entra', async () => {
    const r = await pedir(`/orgs/${ORG}`);
    expect(r.estado).toBe(400);
    expect(r.error).toBe('sin_app');
  });

  it('una app apagada para la org recibe 403, y al reactivarla vuelve a entrar', async () => {
    const TODAS = { dash: true, quell: true, cotizador: true, peek: true, roster: true, nest: true };
    await pedir(`/admin/orgs/${ORG}`, { method: 'PATCH', body: JSON.stringify({ apps: { ...TODAS, roster: false } }) });
    const apagada = await pedir(`/orgs/${ORG}`, { app: 'roster101' });
    expect(apagada.estado).toBe(403);
    expect(apagada.error).toBe('app_inactiva');

    // Los datos no se van cuando la empresa apaga una app: al reactivarla los
    // vuelve a ver. Es la promesa del documento, y se comprueba aqui.
    await pedir(`/admin/orgs/${ORG}`, { method: 'PATCH', body: JSON.stringify({ apps: TODAS }) });
    const prendida = await pedir(`/orgs/${ORG}`, { app: 'roster101' });
    expect(prendida.estado).toBe(200);
  });
});

describe('4 · el ítem, su etapa y el aviso por WebSocket', () => {
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const n = await pedir(`/orgs/${ORG}/negocios`, { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'Taller' }) });
    ids.negocio = n.data.id;
    const cl = await pedir(`/orgs/${ORG}/clientes`, { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'Áurea Pérez', negocio_id: ids.negocio, correo: 'aurea@ejemplo.mx' }) });
    ids.cliente = cl.data.id;
  });

  it('nombre_norm sale sin acentos y en minúsculas', async () => {
    const r = await pedir(`/orgs/${ORG}/clientes/${ids.cliente}`, { app: 'dash101' });
    expect(r.data.nombre_norm).toBe('aurea perez');
  });

  it('cotizador101 exporta ítems cotizados y luego se venden', async () => {
    const ex = await pedir(`/orgs/${ORG}/items/exportar`, {
      app: 'cotizador101',
      method: 'POST',
      body: JSON.stringify({
        cotizacion_id: 'COT-1',
        negocio_id: ids.negocio,
        cliente_id: ids.cliente,
        lineas: [{ nombre: 'Cocina', monto: 15000000 }, { nombre: 'Clóset', monto: 5000000 }],
      }),
    });
    expect(ex.estado).toBe(201);
    expect(ex.data.total).toBe(2);
    expect(ex.data.filas[0].estado).toBe('cotizado');
    expect(ex.data.filas[0].proyecto_id).toBe(null);
    // $150,000.00 se guardó como 15000000 y sigue siendo un entero
    expect(ex.data.filas[0].monto).toBe(15000000);
    expect(Number.isInteger(ex.data.filas[0].monto)).toBe(true);
    ids.item = ex.data.filas[0].id;
    ids.item2 = ex.data.filas[1].id;

    const v = await pedir(`/orgs/${ORG}/items/vender`, {
      app: 'cotizador101',
      method: 'POST',
      body: JSON.stringify({ item_ids: [ids.item, ids.item2], nombre_proyecto: 'Casa Pérez' }),
    });
    expect(v.estado).toBe(200);
    ids.proyecto = v.data.proyecto.id;
    // el caché lo calcula la API: 150,000 + 50,000
    expect(v.data.proyecto.precio_venta).toBe(20000000);
  });

  it('se mueve la etapa y el WebSocket lo avisa a otra pantalla', async () => {
    const ws = await SELF.fetch(`https://api.local/orgs/${ORG}/ws`, {
      headers: { Upgrade: 'websocket', Cookie: galleta, 'X-App': 'quell101' },
    });
    expect(ws.status).toBe(101);
    const socket = ws.webSocket!;
    socket.accept();

    const recibidos: any[] = [];
    socket.addEventListener('message', (e: MessageEvent) => recibidos.push(JSON.parse(String(e.data))));

    const r = await pedir(`/orgs/${ORG}/items/${ids.item}/etapa`, {
      app: 'quell101',
      method: 'POST',
      body: JSON.stringify({ etapa: 4, nota: 'embalado' }),
    });
    expect(r.estado).toBe(200);
    expect(r.data.item.etapa).toBe(4);
    // la clave nace en la etapa 4, no antes
    expect(r.data.item.clave).toBe('M01');
    expect(r.data.avance.nota).toBe('embalado');

    await new Promise((s) => setTimeout(s, 120));
    const etapas = recibidos.filter((m) => m.t === 'item.etapa');
    expect(etapas.length).toBe(1);
    expect(etapas[0]).toMatchObject({ id: ids.item, etapa: 4, clave: 'M01' });
    socket.close();
  });

  it('el avance queda en el historial y no se puede borrar', async () => {
    const lista = await pedir(`/orgs/${ORG}/avances?item_id=${ids.item}`, { app: 'quell101' });
    expect(lista.data.total).toBe(1);
    const borrar = await pedir(`/orgs/${ORG}/avances/${lista.data.filas[0].id}`, { app: 'quell101', method: 'DELETE' });
    expect(borrar.estado).toBe(403);
  });

  it('un ítem no se borra: se cancela', async () => {
    const r = await pedir(`/orgs/${ORG}/items/${ids.item2}`, { app: 'dash101', method: 'DELETE' });
    expect(r.estado).toBe(403);
    expect(r.error).toBe('items_nunca_se_borran');
  });

  it('el avance del proyecto lo recalcula la API', async () => {
    const p = await pedir(`/orgs/${ORG}/proyectos/${ids.proyecto}`, { app: 'dash101' });
    // un ítem en 4 y otro en 0, sobre 7
    expect(p.data.avance).toBeCloseTo((4 + 0) / 2 / 7, 6);
    expect(p.data.precio_venta).toBe(20000000);
  });

  it('un ingreso mueve el cobrado del proyecto', async () => {
    const cu = await pedir(`/orgs/${ORG}/cuentas`, { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'Banco', tipo: 'banco', negocio_id: ids.negocio, saldo_inicial: 0 }) });
    const m = await pedir(`/orgs/${ORG}/movimientos`, {
      app: 'dash101',
      method: 'POST',
      body: JSON.stringify({
        negocio_id: ids.negocio, tipo: 'ingreso', monto: 5000000, fecha: '2026-09-09',
        cuenta_id: cu.data.id, proyecto_id: ids.proyecto, contraparte_tipo: 'cliente', contraparte_id: ids.cliente,
      }),
    });
    expect(m.estado).toBe(201);
    const p = await pedir(`/orgs/${ORG}/proyectos/${ids.proyecto}`, { app: 'dash101' });
    expect(p.data.cobrado).toBe(5000000);
  });

  it('el dinero con decimales se rechaza antes de guardarse', async () => {
    const r = await pedir(`/orgs/${ORG}/items`, {
      app: 'dash101',
      method: 'POST',
      body: JSON.stringify({ nombre: 'Mesa', negocio_id: ids.negocio, cliente_id: ids.cliente, monto: 1500.5 }),
    });
    expect(r.estado).toBe(400);
    expect(r.error).toBe('dinero_no_entero');
  });
});

describe('5 · permisos.ts dice que NO', () => {
  let item = '';
  let persona = '';

  beforeAll(async () => {
    const l = await pedir(`/orgs/${ORG}/items`, { app: 'dash101' });
    item = l.data.filas[0].id;
    const p = await pedir(`/orgs/${ORG}/personal`, { app: 'roster101', method: 'POST', body: JSON.stringify({ nombre: 'Gregorio Ruiz', puesto: 'Instalador' }) });
    persona = p.data?.id ?? '';
  });

  it('nest101 solo escribe refs: si manda nombre, 403 con la lista', async () => {
    const r = await pedir(`/orgs/${ORG}/items/${item}`, { app: 'nest101', method: 'PATCH', body: JSON.stringify({ nombre: 'Otro nombre' }) });
    expect(r.estado).toBe(403);
    expect(r.error).toBe('campo_no_permitido');
    expect(r.detalle.campos).toEqual(['nombre']);
    expect(r.detalle.permitidos).toEqual(['refs']);
  });

  it('y sí escribe refs', async () => {
    const r = await pedir(`/orgs/${ORG}/items/${item}`, { app: 'nest101', method: 'PATCH', body: JSON.stringify({ refs: { nest: 'orgs/pruebas/items/x.t101x' } }) });
    expect(r.estado).toBe(200);
    expect(r.data.refs.nest).toBe('orgs/pruebas/items/x.t101x');
  });

  it('cotizador101 no escribe en personal: 403 sin_permiso, y dice quién sí', async () => {
    const r = await pedir(`/orgs/${ORG}/personal/${persona}`, { app: 'cotizador101', method: 'PATCH', body: JSON.stringify({ puesto: 'Otro' }) });
    expect(r.estado).toBe(403);
    expect(r.error).toBe('sin_permiso');
    expect(r.detalle.apps_que_escriben).toEqual(['roster101', 'quell101']);
  });

  it('roster101 escribe el puesto y quell101 las etapas permitidas: la misma fila, dos dueños', async () => {
    const a = await pedir(`/orgs/${ORG}/personal/${persona}`, { app: 'roster101', method: 'PATCH', body: JSON.stringify({ puesto: 'Instalador titular' }) });
    expect(a.estado).toBe(200);
    const b = await pedir(`/orgs/${ORG}/personal/${persona}`, { app: 'quell101', method: 'PATCH', body: JSON.stringify({ etapas_permitidas: [5, 6] }) });
    expect(b.estado).toBe(200);
    expect(b.data.puesto).toBe('Instalador titular');
    expect(b.data.etapas_permitidas).toEqual([5, 6]);
  });

  it('roster101 no puede tocar las etapas permitidas, aunque escriba en la misma tabla', async () => {
    const r = await pedir(`/orgs/${ORG}/personal/${persona}`, { app: 'roster101', method: 'PATCH', body: JSON.stringify({ etapas_permitidas: [1, 2, 3, 4, 5, 6, 7] }) });
    expect(r.estado).toBe(403);
    expect(r.error).toBe('campo_no_permitido');
  });

  it('la etapa no se escribe por PATCH ni desde quell101: solo por /etapa', async () => {
    const r = await pedir(`/orgs/${ORG}/items/${item}`, { app: 'quell101', method: 'PATCH', body: JSON.stringify({ etapa: 7 }) });
    expect(r.estado).toBe(403);
    expect(r.error).toBe('campo_solo_por_etapa');
  });

  it('los cachés del proyecto no los escribe nadie', async () => {
    const l = await pedir(`/orgs/${ORG}/proyectos`, { app: 'dash101' });
    const r = await pedir(`/orgs/${ORG}/proyectos/${l.data.filas[0].id}`, { app: 'dash101', method: 'PATCH', body: JSON.stringify({ cobrado: 999 }) });
    expect(r.estado).toBe(403);
    expect(r.error).toBe('campo_no_permitido');
  });

  it('una app que no existe no pasa de la puerta', async () => {
    const r = await pedir(`/orgs/${ORG}/items`, { app: 'inventada101' });
    expect(r.estado).toBe(400);
    expect(r.error).toBe('app_desconocida');
  });
});

describe('6 · el cliente solo ve lo suyo, y ya sumado', () => {
  it('se le da acceso, entra con PIN y /peek cuadra con la tabla', async () => {
    const l = await pedir(`/orgs/${ORG}/clientes`, { app: 'dash101' });
    const cliente = l.data.filas[0];

    const acc = await pedir(`/orgs/${ORG}/clientes/${cliente.id}/acceso`, {
      app: 'dash101', method: 'POST', body: JSON.stringify({ correo: 'aurea@ejemplo.mx', pin: '481902' }),
    });
    expect(acc.estado).toBe(201);

    const galletaMike = galleta;
    galleta = '';
    const entrar = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: 'aurea@ejemplo.mx', pin: '481902' }) });
    expect(entrar.estado).toBe(200);

    const peek = await pedir(`/orgs/${ORG}/peek`, { app: 'peek101' });
    expect(peek.estado).toBe(200);
    // El total y la suma de la tabla salen de la misma respuesta: no se pueden
    // contradecir. Fue un defecto real el 7-sep.
    const suma = peek.data.proyectos.reduce((s: number, p: any) => s + p.precio_venta, 0);
    expect(peek.data.totales.vendido).toBe(suma);
    expect(peek.data.totales.saldo).toBe(peek.data.totales.vendido - peek.data.totales.cobrado);

    // El cliente no ve costos ni movimientos de egreso por ningún lado.
    for (const p of peek.data.proyectos) expect(p.partidas).toBeUndefined();
    const mov = await pedir(`/orgs/${ORG}/movimientos`, { app: 'peek101' });
    expect(mov.estado).toBe(403);

    const pin = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: 'aurea@ejemplo.mx', pin: '111111' }) });
    expect(pin.estado).toBe(401);

    galleta = galletaMike;
  });

  it('un PIN de seis iguales no se puede fijar', async () => {
    const l = await pedir(`/orgs/${ORG}/clientes`, { app: 'dash101' });
    const r = await pedir(`/orgs/${ORG}/clientes/${l.data.filas[0].id}/acceso`, {
      app: 'dash101', method: 'POST', body: JSON.stringify({ correo: 'otro@ejemplo.mx', pin: '111111' }),
    });
    expect(r.estado).toBe(400);
  });
});

describe('7 · personal: ve su trabajo, no el dinero', () => {
  it('el instalador no puede marcar «anticipo pagado»', async () => {
    const p = await pedir(`/orgs/${ORG}/personal`, { app: 'roster101' });
    const persona = p.data.filas[0];
    await pedir(`/orgs/${ORG}/personal/${persona.id}/acceso`, {
      app: 'roster101', method: 'POST', body: JSON.stringify({ correo: 'gregorio@ejemplo.mx', pin: '730514' }),
    });
    const items = await pedir(`/orgs/${ORG}/items`, { app: 'quell101' });
    const item = items.data.filas[0].id;

    const galletaMike = galleta;
    galleta = '';
    await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: 'gregorio@ejemplo.mx', pin: '730514' }) });

    // etapas_permitidas quedó en [5,6]
    const malo = await pedir(`/orgs/${ORG}/items/${item}/etapa`, { app: 'quell101', method: 'POST', body: JSON.stringify({ etapa: 2 }) });
    expect(malo.estado).toBe(403);
    expect(malo.error).toBe('etapa_no_permitida');

    const bueno = await pedir(`/orgs/${ORG}/items/${item}/etapa`, { app: 'quell101', method: 'POST', body: JSON.stringify({ etapa: 5 }) });
    expect(bueno.estado).toBe(200);

    // y no ve el dinero
    const cuentas = await pedir(`/orgs/${ORG}/cuentas`, { app: 'quell101' });
    expect(cuentas.estado).toBe(403);
    const lista = await pedir(`/orgs/${ORG}/items`, { app: 'quell101' });
    expect(lista.data.filas[0].monto).toBeUndefined();

    galleta = galletaMike;
  });
});
