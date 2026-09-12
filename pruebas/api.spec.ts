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
    // La versión la contesta el propio DO: si vale 2, nació y corrió las dos
    // migraciones (0001 y la de partidas).
    expect(r.data.org_db_version).toBe(3);
  });

  it('las catorce tablas están dentro del DO', async () => {
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
      'archivos', 'avances', 'clientes', 'conciliacion_cuentas', 'conciliaciones', 'cotizaciones',
      'cuentas', 'estaciones', 'items', 'movimientos', 'negocios', 'opex', 'partidas', 'personal',
      'proveedores', 'proyectos',
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

  /* ─────────────── las partidas: tabla propia, cachés de la API ───────────────
   * Fase 2 de dash101. Cuelgan del proyecto; el ítem es opcional. Lo pagado a
   * cada proveedor y el estado los calcula la API desde los egresos, y el
   * compromiso del proyecto es la suma de lo acordado. */

  it('dash101 crea una partida colgada del proyecto y el proyecto gana compromiso', async () => {
    const prov = await pedir(`/orgs/${ORG}/proveedores`, { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'Maderas del Sur' }) });
    ids.proveedor = prov.data.id;
    const r = await pedir(`/orgs/${ORG}/partidas`, {
      app: 'dash101',
      method: 'POST',
      body: JSON.stringify({ proyecto_id: ids.proyecto, proveedor_id: ids.proveedor, proveedor_nombre: 'Maderas del Sur', concepto: 'Madera', monto_acordado: 2000000 }),
    });
    expect(r.estado).toBe(201);
    expect(r.data.proyecto_id).toBe(ids.proyecto);
    expect(r.data.item_id).toBe(null);
    expect(r.data.monto_pagado).toBe(0);
    expect(r.data.estado).toBe('pendiente');
    ids.partida = r.data.id;

    const p = await pedir(`/orgs/${ORG}/proyectos/${ids.proyecto}`, { app: 'dash101' });
    expect(p.data.compromiso).toBe(2000000);
    expect(p.data.partidas).toBeUndefined();
  });

  it('un egreso al proveedor mueve lo pagado de la partida y su estado', async () => {
    const cu = await pedir(`/orgs/${ORG}/cuentas`, { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'Caja', tipo: 'caja', negocio_id: ids.negocio, saldo_inicial: 0 }) });
    const egreso = (monto: number) => pedir(`/orgs/${ORG}/movimientos`, {
      app: 'dash101',
      method: 'POST',
      body: JSON.stringify({
        negocio_id: ids.negocio, tipo: 'egreso', monto, fecha: '2026-09-10',
        cuenta_id: cu.data.id, proyecto_id: ids.proyecto, contraparte_tipo: 'proveedor', contraparte_id: ids.proveedor,
      }),
    });
    expect((await egreso(500000)).estado).toBe(201);
    let par = await pedir(`/orgs/${ORG}/partidas/${ids.partida}`, { app: 'dash101' });
    expect(par.data.monto_pagado).toBe(500000);
    expect(par.data.estado).toBe('parcial');

    expect((await egreso(1500000)).estado).toBe(201);
    par = await pedir(`/orgs/${ORG}/partidas/${ids.partida}`, { app: 'dash101' });
    expect(par.data.monto_pagado).toBe(2000000);
    expect(par.data.estado).toBe('pagado');

    const p = await pedir(`/orgs/${ORG}/proyectos/${ids.proyecto}`, { app: 'dash101' });
    expect(p.data.pagado_prov).toBe(2000000);
  });

  it('los cachés de la partida no los escribe nadie, ni dash101', async () => {
    const r = await pedir(`/orgs/${ORG}/partidas/${ids.partida}`, { app: 'dash101', method: 'PATCH', body: JSON.stringify({ monto_pagado: 1 }) });
    expect(r.estado).toBe(403);
    expect(r.error).toBe('campo_no_permitido');
    expect(r.detalle.campos).toEqual(['monto_pagado']);
  });

  it('el proyecto ya no acepta partidas adentro: son otra tabla', async () => {
    const r = await pedir(`/orgs/${ORG}/proyectos/${ids.proyecto}`, { app: 'dash101', method: 'PATCH', body: JSON.stringify({ partidas: [] }) });
    expect(r.estado).toBe(403);
    expect(r.error).toBe('campo_no_permitido');
  });

  it('solo dash101 escribe partidas', async () => {
    const r = await pedir(`/orgs/${ORG}/partidas/${ids.partida}`, { app: 'quell101', method: 'PATCH', body: JSON.stringify({ concepto: 'otro' }) });
    expect(r.estado).toBe(403);
    expect(r.error).toBe('sin_permiso');
    expect(r.detalle.apps_que_escriben).toEqual(['dash101']);
  });

  it('borrar la partida devuelve el compromiso a cero', async () => {
    const r = await pedir(`/orgs/${ORG}/partidas/${ids.partida}`, { app: 'dash101', method: 'DELETE' });
    expect(r.estado).toBe(200);
    const p = await pedir(`/orgs/${ORG}/proyectos/${ids.proyecto}`, { app: 'dash101' });
    expect(p.data.compromiso).toBe(0);
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
    for (const p of peek.data.proyectos) {
      expect(p.partidas).toBeUndefined();
      expect(p.compromiso).toBeUndefined();
      expect(p.pagado_prov).toBeUndefined();
    }
    const mov = await pedir(`/orgs/${ORG}/movimientos`, { app: 'peek101' });
    expect(mov.estado).toBe(403);
    const par = await pedir(`/orgs/${ORG}/partidas`, { app: 'peek101' });
    expect(par.estado).toBe(403);

    // Y tampoco las tablas «inofensivas»: un cliente sólo abre /peek. Hasta el
    // 12-sep items, proyectos, clientes y archivos se le dejaban listar, y
    // archivos sin acotar. Se cierra todo, incluida la descarga por id, y se
    // comprueba que /peek sigue abierto: cerrar de más también sería un error.
    for (const tabla of ['items', 'proyectos', 'clientes', 'archivos', 'negocios']) {
      const r = await pedir(`/orgs/${ORG}/${tabla}`, { app: 'peek101' });
      expect(r.estado, `GET /${tabla} como cliente`).toBe(403);
      expect(r.detalle?.motivo).toBe('un cliente solo abre /peek');
    }
    const porId = await pedir(`/orgs/${ORG}/clientes/${cliente.id}`, { app: 'peek101' });
    expect(porId.estado, 'ni siquiera su propia ficha, suelta').toBe(403);
    const bytes = await SELF.fetch(`https://api.local/orgs/${ORG}/archivos/01INVENTADO`, { headers: { Cookie: galleta, 'X-App': 'peek101' } });
    expect(bytes.status, 'GET /archivos/:id como cliente').toBe(403);
    const sigue = await pedir(`/orgs/${ORG}/peek`, { app: 'peek101' });
    expect(sigue.estado).toBe(200);

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

  it('se le quita el acceso: entra con su PIN pero la puerta de la org ya no abre; se le vuelve a dar y abre', async () => {
    const l = await pedir(`/orgs/${ORG}/clientes`, { app: 'dash101' });
    const cliente = l.data.filas[0];

    const fuera = await pedir(`/orgs/${ORG}/clientes/${cliente.id}/acceso`, { app: 'dash101', method: 'DELETE' });
    expect(fuera.estado).toBe(200);
    expect(fuera.data.quitado).toBe(true);
    const apagado = await pedir(`/orgs/${ORG}/clientes/${cliente.id}`, { app: 'dash101' });
    expect(apagado.data.portal_activo).toBe(false);

    const galletaMike = galleta;
    galleta = '';
    // El usuario y su PIN siguen: la sesión se abre. Lo que se cierra es la org.
    const entrar = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: 'aurea@ejemplo.mx', pin: '481902' }) });
    expect(entrar.estado).toBe(200);
    const peek = await pedir(`/orgs/${ORG}/peek`, { app: 'peek101' });
    expect(peek.estado).toBe(403);
    galleta = galletaMike;

    // Reactivar es el mismo POST, con el PIN que se quiera (aquí otro).
    const otraVez = await pedir(`/orgs/${ORG}/clientes/${cliente.id}/acceso`, {
      app: 'dash101', method: 'POST', body: JSON.stringify({ correo: 'aurea@ejemplo.mx', pin: '275913' }),
    });
    expect(otraVez.estado).toBe(201);
    galleta = '';
    await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: 'aurea@ejemplo.mx', pin: '275913' }) });
    const deNuevo = await pedir(`/orgs/${ORG}/peek`, { app: 'peek101' });
    expect(deNuevo.estado).toBe(200);
    galleta = galletaMike;
  });

  it('un cliente solo puede quitarle el acceso un miembro, no el propio cliente', async () => {
    const l = await pedir(`/orgs/${ORG}/clientes`, { app: 'dash101' });
    const galletaMike = galleta;
    galleta = '';
    await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: 'aurea@ejemplo.mx', pin: '275913' }) });
    const r = await pedir(`/orgs/${ORG}/clientes/${l.data.filas[0].id}/acceso`, { app: 'peek101', method: 'DELETE' });
    expect(r.estado).toBe(403);
    galleta = galletaMike;
  });
});

describe('3b · Google detrás de un proxy: el boleto de entrada', () => {
  it('sin credenciales, /auth/google dice que no está configurado; con un volver_a ajeno, que no', async () => {
    const sin = await pedir('/auth/google');
    expect(sin.estado).toBe(501);
    expect(sin.error).toBe('google_no_configurado');
    const ajeno = await pedir('/auth/google?volver_a=' + encodeURIComponent('https://malo.ejemplo.mx/login'));
    expect(ajeno.estado).toBe(403);
    expect(ajeno.error).toBe('origen_no_permitido');
  });

  it('un boleto se canjea una sola vez por la cookie, y con ella /yo contesta', async () => {
    const galletaMike = galleta;
    // Un boleto como lo dejaría el callback de Google: la cookie de una sesión de Mike.
    const yo = await pedir('/yo');
    const id = 'boleto-de-prueba-' + Date.now();
    await entorno.MASTER.prepare(`INSERT INTO tickets (id, galleta, expira_at) VALUES (?,?,?)`)
      .bind(id, galletaMike.split('=')[1], new Date(Date.now() + 60_000).toISOString()).run();

    galleta = '';
    const canje = await pedir('/auth/canje', { method: 'POST', body: JSON.stringify({ entrada: id }) });
    expect(canje.estado).toBe(200);
    expect(galleta).toBe(galletaMike);
    const otraVez = await pedir('/yo');
    expect(otraVez.estado).toBe(200);
    expect(otraVez.data.usuario.correo).toBe(yo.data.usuario.correo);

    galleta = '';
    const repetido = await pedir('/auth/canje', { method: 'POST', body: JSON.stringify({ entrada: id }) });
    expect(repetido.estado).toBe(401);
    expect(repetido.error).toBe('entrada_invalida');
    galleta = galletaMike;
  });

  it('un boleto vencido no entra, y también se consume', async () => {
    const galletaMike = galleta;
    const id = 'boleto-viejo-' + Date.now();
    await entorno.MASTER.prepare(`INSERT INTO tickets (id, galleta, expira_at) VALUES (?,?,?)`)
      .bind(id, galletaMike.split('=')[1], new Date(Date.now() - 1000).toISOString()).run();
    galleta = '';
    const r = await pedir('/auth/canje', { method: 'POST', body: JSON.stringify({ entrada: id }) });
    expect(r.estado).toBe(401);
    const queda = await entorno.MASTER.prepare(`SELECT 1 AS x FROM tickets WHERE id = ?`).bind(id).first();
    expect(queda).toBe(null);
    galleta = galletaMike;
  });
});

describe('8 · borrar lo que tiene filas colgando es un 409, no un 500', () => {
  it('un cliente con proyecto contesta en_uso; una fila suelta sí se va', async () => {
    const l = await pedir(`/orgs/${ORG}/clientes`, { app: 'dash101' });
    const conProyecto = l.data.filas.find((c: any) => c.correo === 'aurea@ejemplo.mx');
    const r = await pedir(`/orgs/${ORG}/clientes/${conProyecto.id}`, { app: 'dash101', method: 'DELETE' });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('en_uso');
    expect(r.detalle.tabla).toBe('clientes');
    // Sigue ahí, intacto.
    const sigue = await pedir(`/orgs/${ORG}/clientes/${conProyecto.id}`, { app: 'dash101' });
    expect(sigue.estado).toBe(200);

    const n = await pedir(`/orgs/${ORG}/negocios`, { app: 'dash101' });
    const suelto = await pedir(`/orgs/${ORG}/clientes`, { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'Nadie Nunca', negocio_id: n.data.filas[0].id }) });
    const fue = await pedir(`/orgs/${ORG}/clientes/${suelto.data.id}`, { app: 'dash101', method: 'DELETE' });
    expect(fue.estado).toBe(200);
    expect(fue.data.borrado).toBe(true);
  });
});

describe('9 · reiniciar una empresa, que solo existe fuera de producción', () => {
  it('DELETE /admin/orgs/:o vacía el Durable Object, quita la org del D1, y al recrearla nace limpia', async () => {
    const alta = await pedir('/admin/orgs', { method: 'POST', body: JSON.stringify({ id: 'efimera', nombre: 'Efímera' }) });
    expect(alta.estado).toBe(201);
    await pedir('/orgs/efimera/negocios', { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'Taller que no dura' }) });
    const antes = await pedir('/orgs/efimera/negocios', { app: 'dash101' });
    expect(antes.data.total).toBe(1);

    const r = await pedir('/admin/orgs/efimera', { method: 'DELETE' });
    expect(r.estado).toBe(200);
    expect(r.data.reiniciada).toBe('efimera');
    expect(r.data.org_db_version).toBe(3);

    const ya = await pedir('/orgs/efimera/negocios', { app: 'dash101' });
    expect(ya.estado).toBe(404);
    expect(ya.error).toBe('org_desconocida');

    const otraVez = await pedir('/admin/orgs', { method: 'POST', body: JSON.stringify({ id: 'efimera', nombre: 'Efímera' }) });
    expect(otraVez.estado).toBe(201);
    expect(otraVez.data.org_db_version).toBe(3);
    const limpia = await pedir('/orgs/efimera/negocios', { app: 'dash101' });
    expect(limpia.data.total).toBe(0);
  });

  it('una org que no existe contesta 404', async () => {
    const r = await pedir('/admin/orgs/no-existe', { method: 'DELETE' });
    expect(r.estado).toBe(404);
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
    // ni los costos: las partidas son de owner, admin y socio
    const partidas = await pedir(`/orgs/${ORG}/partidas`, { app: 'quell101' });
    expect(partidas.estado).toBe(403);
    const proyectos = await pedir(`/orgs/${ORG}/proyectos`, { app: 'quell101' });
    expect(proyectos.estado).toBe(200);
    for (const p of proyectos.data.filas) {
      expect(p.compromiso).toBeUndefined();
      expect(p.pagado_prov).toBeUndefined();
    }

    galleta = galletaMike;
  });
});

describe('10 · la conciliación semanal: lo que se escapa del registro', () => {
  const N: Record<string, string> = {};
  let corte1 = '';

  it('el negocio nace en lunes y con sus cuentas', async () => {
    const n = await pedir(`/orgs/${ORG}/negocios`, { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'Taller que concilia' }) });
    expect(n.estado).toBe(201);
    // Decisión 3 de Mike: el día se configura, y por omisión es el lunes.
    expect(n.data.dia_conciliacion).toBe(1);
    N.negocio = n.data.id;
    await pedir(`/orgs/${ORG}/negocios/${N.negocio}`, { app: 'dash101', method: 'PATCH', body: JSON.stringify({ dia_conciliacion: 3 }) });
    const puesto = await pedir(`/orgs/${ORG}/negocios/${N.negocio}`, { app: 'dash101' });
    expect(puesto.data.dia_conciliacion).toBe(3);

    for (const [clave, nombre, tipo, saldo] of [
      ['banco', 'Banco', 'banco', 25000000],
      ['caja', 'Caja', 'caja', 500000],
      ['tarjeta', 'Tarjeta', 'credito', -3000000],
      ['otra', 'Otra', 'otro', 100000],
    ] as Array<[string, string, string, number]>) {
      const r = await pedir(`/orgs/${ORG}/cuentas`, {
        app: 'dash101', method: 'POST',
        body: JSON.stringify({ negocio_id: N.negocio, nombre, tipo, saldo_inicial: saldo }),
      });
      expect(r.estado).toBe(201);
      N[clave] = r.data.id;
    }

    // Banco: 25,000,000 + 12,000,000 − 2,500,000 = 34,500,000.
    // Caja: 500,000 − 850,000 = −350,000.
    for (const [tipo, monto, cuenta] of [
      ['ingreso', 12000000, 'banco'],
      ['egreso', 2500000, 'banco'],
      ['egreso', 850000, 'caja'],
    ] as Array<[string, number, string]>) {
      const r = await pedir(`/orgs/${ORG}/movimientos`, {
        app: 'dash101', method: 'POST',
        body: JSON.stringify({ negocio_id: N.negocio, tipo, monto, fecha: '2026-09-02', cuenta_id: N[cuenta] }),
      });
      expect(r.estado).toBe(201);
    }
  });

  it('el primer corte: la que cuadra no recibe ajuste, y las otras quedan iguales al real', async () => {
    corte1 = '2026-09-07T18:00:00.000Z';
    const r = await pedir(`/orgs/${ORG}/conciliaciones`, {
      app: 'dash101', method: 'POST',
      body: JSON.stringify({
        negocio_id: N.negocio, corte_at: corte1,
        saldos: [
          { cuenta_id: N.banco, saldo_real: 34420000 },   // le faltan $800
          { cuenta_id: N.caja, saldo_real: -350000 },     // cuadra
          { cuenta_id: N.tarjeta, saldo_real: -3050000 }, // se debe $500 más
          { cuenta_id: N.otra, saldo_real: 130000 },      // hay $300 de más
        ],
      }),
    });
    expect(r.estado).toBe(201);
    const por = Object.fromEntries((r.data.cuentas as any[]).map((c) => [c.cuenta_id, c]));

    expect(por[N.banco]).toMatchObject({ saldo_registrado: 34500000, saldo_real: 34420000, diferencia: 80000 });
    expect(por[N.banco].movimiento_id).toBeTruthy();
    // La que cuadra: diferencia 0 y SIN ajuste.
    expect(por[N.caja]).toMatchObject({ saldo_registrado: -350000, saldo_real: -350000, diferencia: 0, movimiento_id: null });
    expect(por[N.tarjeta]).toMatchObject({ saldo_registrado: -3000000, saldo_real: -3050000, diferencia: 50000 });
    expect(por[N.otra]).toMatchObject({ saldo_registrado: 100000, saldo_real: 130000, diferencia: -30000 });
    expect(r.data.diferencia_total).toBe(80000 + 0 + 50000 - 30000);

    // Falta dinero → egreso; sobra → ingreso. Todos sin proyecto.
    const movs = await pedir(`/orgs/${ORG}/movimientos?negocio_id=${N.negocio}`, { app: 'dash101' });
    const ajustes = (movs.data.filas as any[]).filter((m) => m.categoria === 'ajuste_conciliacion');
    expect(ajustes).toHaveLength(3);
    const deBanco = ajustes.find((m) => m.cuenta_id === N.banco);
    expect(deBanco).toMatchObject({ tipo: 'egreso', monto: 80000, proyecto_id: null, contraparte_nombre: 'Sin identificar' });
    expect(ajustes.find((m) => m.cuenta_id === N.otra)).toMatchObject({ tipo: 'ingreso', monto: 30000 });
    expect(ajustes.find((m) => m.cuenta_id === N.tarjeta)).toMatchObject({ tipo: 'egreso', monto: 50000 });

    // Y con el ajuste, cada cuenta queda exactamente en el saldo real.
    const saldo = (cuenta_id: string, inicial: number) =>
      inicial + (movs.data.filas as any[])
        .filter((m) => m.cuenta_id === cuenta_id)
        .reduce((t, m) => t + (m.tipo === 'ingreso' ? m.monto : -m.monto), 0);
    expect(saldo(N.banco, 25000000)).toBe(34420000);
    expect(saldo(N.caja, 500000)).toBe(-350000);
    expect(saldo(N.tarjeta, -3000000)).toBe(-3050000);
    expect(saldo(N.otra, 100000)).toBe(130000);
  });

  it('la segunda semana sólo mide lo nuevo, y el acumulado es la suma', async () => {
    // Nada cambió salvo que al banco se le fueron otros $200 sin registrar.
    const r = await pedir(`/orgs/${ORG}/conciliaciones`, {
      app: 'dash101', method: 'POST',
      body: JSON.stringify({
        negocio_id: N.negocio, corte_at: '2026-09-14T18:00:00.000Z',
        saldos: [
          { cuenta_id: N.banco, saldo_real: 34400000 },
          { cuenta_id: N.caja, saldo_real: -350000 },
          { cuenta_id: N.tarjeta, saldo_real: -3050000 },
          { cuenta_id: N.otra, saldo_real: 130000 },
        ],
      }),
    });
    expect(r.estado).toBe(201);
    expect(r.data.diferencia_total).toBe(20000);
    const por = Object.fromEntries((r.data.cuentas as any[]).map((c) => [c.cuenta_id, c]));
    expect(por[N.banco]).toMatchObject({ saldo_registrado: 34420000, diferencia: 20000 });
    // Las tres que ya cuadraban no vuelven a recibir ajuste.
    expect((r.data.cuentas as any[]).filter((c) => c.movimiento_id).length).toBe(1);

    const e = await pedir(`/orgs/${ORG}/conciliaciones/estadistica?negocio_id=${N.negocio}`, { app: 'dash101' });
    expect(e.estado).toBe(200);
    expect(e.data.acumulado).toMatchObject({ cortes: 2, diferencia_total: 120000, faltante: 150000, sobrante: 30000 });
    expect(e.data.cortes).toHaveLength(2);
    expect(e.data.cortes[0].diferencia_total).toBe(20000); // el más reciente primero
    const banco = (e.data.por_cuenta as any[]).find((c) => c.cuenta_id === N.banco);
    expect(banco).toMatchObject({ nombre: 'Banco', cortes: 2, diferencia_total: 100000 });
  });

  it('un gasto capturado después con fecha vieja no cambia la conciliación pasada', async () => {
    const antes = await pedir(`/orgs/${ORG}/conciliacion_cuentas?cuenta_id=${N.banco}`, { app: 'dash101' });
    const viejo = (antes.data.filas as any[]).find((f) => f.saldo_registrado === 34500000);
    expect(viejo).toBeTruthy();

    await pedir(`/orgs/${ORG}/movimientos`, {
      app: 'dash101', method: 'POST',
      body: JSON.stringify({ negocio_id: N.negocio, tipo: 'egreso', monto: 111111, fecha: '2026-09-03', cuenta_id: N.banco, descripcion: 'se capturó tarde' }),
    });

    const despues = await pedir(`/orgs/${ORG}/conciliacion_cuentas?cuenta_id=${N.banco}`, { app: 'dash101' });
    const mismo = (despues.data.filas as any[]).find((f) => f.id === viejo.id);
    expect(mismo.saldo_registrado).toBe(34500000);
    expect(mismo.diferencia).toBe(80000);
  });

  it('una conciliación no se edita ni se borra: es append-only', async () => {
    const l = await pedir(`/orgs/${ORG}/conciliaciones?negocio_id=${N.negocio}`, { app: 'dash101' });
    const id = l.data.filas[0].id;
    const patch = await pedir(`/orgs/${ORG}/conciliaciones/${id}`, { app: 'dash101', method: 'PATCH', body: JSON.stringify({ corte_at: '2020-01-01T00:00:00Z' }) });
    expect(patch.estado).toBe(403);
    const del = await pedir(`/orgs/${ORG}/conciliaciones/${id}`, { app: 'dash101', method: 'DELETE' });
    expect(del.estado).toBe(403);
  });

  it('sólo dash101 la escribe, y sólo owner o admin la corren', async () => {
    const otraApp = await pedir(`/orgs/${ORG}/conciliaciones`, {
      app: 'peek101', method: 'POST',
      body: JSON.stringify({ negocio_id: N.negocio, saldos: [{ cuenta_id: N.caja, saldo_real: 0 }] }),
    });
    expect(otraApp.estado).toBe(403);

    const alta = await pedir(`/admin/orgs/${ORG}/miembros`, { method: 'POST', body: JSON.stringify({ correo: 'socio-concilia@ejemplo.mx', rol: 'socio' }) });
    expect(alta.estado).toBe(201);

    const galletaMike = galleta;
    galleta = '';
    const cod = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: 'socio-concilia@ejemplo.mx' }) });
    await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: 'socio-concilia@ejemplo.mx', codigo: cod.data.codigo_prueba }) });
    const comoSocio = await pedir(`/orgs/${ORG}/conciliaciones`, {
      app: 'dash101', method: 'POST',
      body: JSON.stringify({ negocio_id: N.negocio, saldos: [{ cuenta_id: N.caja, saldo_real: 0 }] }),
    });
    expect(comoSocio.estado).toBe(403);
    expect(comoSocio.detalle.motivo).toMatch(/owner y admin/);
    // Pero sí la puede LEER: es dinero de su empresa.
    const lee = await pedir(`/orgs/${ORG}/conciliaciones?negocio_id=${N.negocio}`, { app: 'dash101' });
    expect(lee.estado).toBe(200);
    galleta = galletaMike;
  });

  it('se concilian todas las cuentas o ninguna, y el dinero va en centavos enteros', async () => {
    const faltan = await pedir(`/orgs/${ORG}/conciliaciones`, {
      app: 'dash101', method: 'POST',
      body: JSON.stringify({ negocio_id: N.negocio, saldos: [{ cuenta_id: N.caja, saldo_real: -350000 }] }),
    });
    expect(faltan.estado).toBe(400);
    expect(faltan.error).toBe('faltan_cuentas');
    expect(faltan.detalle.faltan.length).toBe(3);

    const flotante = await pedir(`/orgs/${ORG}/conciliaciones`, {
      app: 'dash101', method: 'POST',
      body: JSON.stringify({ negocio_id: N.negocio, saldos: [{ cuenta_id: N.caja, saldo_real: 1500.5 }] }),
    });
    expect(flotante.estado).toBe(400);
    expect(flotante.error).toBe('dinero_no_entero');

    // Y si algo truena, no queda media conciliación: siguen siendo dos.
    const l = await pedir(`/orgs/${ORG}/conciliaciones?negocio_id=${N.negocio}`, { app: 'dash101' });
    expect(l.data.total).toBe(2);
  });

  it('los proyectos no se mueven: el ajuste no cuelga de ninguno', async () => {
    const p = await pedir(`/orgs/${ORG}/proyectos`, { app: 'dash101' });
    const proyecto = p.data.filas[0];
    const cobradoAntes = proyecto.cobrado;
    const pagadoAntes = proyecto.pagado_prov;
    await pedir(`/orgs/${ORG}/conciliaciones`, {
      app: 'dash101', method: 'POST',
      body: JSON.stringify({
        negocio_id: N.negocio,
        saldos: [
          { cuenta_id: N.banco, saldo_real: 1 }, { cuenta_id: N.caja, saldo_real: 2 },
          { cuenta_id: N.tarjeta, saldo_real: 3 }, { cuenta_id: N.otra, saldo_real: 4 },
        ],
      }),
    });
    const despues = await pedir(`/orgs/${ORG}/proyectos/${proyecto.id}`, { app: 'dash101' });
    expect(despues.data.cobrado).toBe(cobradoAntes);
    expect(despues.data.pagado_prov).toBe(pagadoAntes);
  });
});
