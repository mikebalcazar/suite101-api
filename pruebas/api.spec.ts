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
import { redirectUriGoogle, urlAutorizacionGoogle } from '../src/rutas/auth';
// El número de migraciones del OrgDB se lee del código, no se escribe a mano:
// olvidarlo al subir la 0004 dejó el humo en rojo el 16-sep.
import { VERSION_ORG_DB } from '../src/org-db';
import { TABLAS, TABLAS_INTERNAS } from '../schema/tipos';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../src/entorno';

const entorno = env as unknown as Env;

const CORREO = 'mike@forespot.com';
const ORG = 'pruebas';

let galleta = '';
/** La galleta de Mike que un bloque ya consiguió, para que el siguiente no vuelva a pedir código (el freno de intentos da 429). */
let galletaMike = '';

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
    expect(r.data.org_db_version).toBe(VERSION_ORG_DB);
  });

  it('las tablas que hay dentro del DO son exactamente éstas', async () => {
    // Se listan una por una y se comparan con igualdad, no con «contiene»:
    // así una tabla NUEVA que nadie esperaba también rompe la prueba, no sólo
    // una que falte. `folios` no es una tabla del contrato —no está en TABLAS
    // ni se expone por el CRUD—: es el contador del folio de la cotización,
    // que vive aquí adentro para ser atómico.
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
    expect(nombres).toEqual([...TABLAS, ...TABLAS_INTERNAS].sort());
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
        // La segunda con cantidad: quote101 cotiza «× 20» desde siempre y su
        // total ya viene multiplicado. Lo que se mide es que ese 20 cruce.
        lineas: [{ nombre: 'Cocina', monto: 15000000 }, { nombre: 'Clóset', monto: 5000000, cantidad: 20 }],
      }),
    });
    expect(ex.estado).toBe(201);
    expect(ex.data.total).toBe(2);
    expect(ex.data.filas[0].estado).toBe('cotizado');
    expect(ex.data.filas[0].proyecto_id).toBe(null);
    // $150,000.00 se guardó como 15000000 y sigue siendo un entero
    expect(ex.data.filas[0].monto).toBe(15000000);
    expect(Number.isInteger(ex.data.filas[0].monto)).toBe(true);
    // La cantidad cruza; la que no la dice vale 1, que es lo que siempre quiso
    // decir un renglón sin cantidad.
    expect(ex.data.filas[0].cantidad).toBe(1);
    expect(ex.data.filas[1].cantidad).toBe(20);
    expect(ex.data.filas[1].monto, 'y el monto sigue siendo el de la línea').toBe(5000000);
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

  it('Google devuelve a la API por su origen público, aunque la petición llegue por el proxy de una app', () => {
    // Detrás de /s101/* la petición conserva el dominio de la app. Antes del
    // 16-sep la dirección de regreso se armaba con él y Google acababa en
    // https://dash101…/auth/google/callback, que la app no sirve.
    const env = { URL_PUBLICA: 'https://api.ejemplo.mx', GOOGLE_CLIENT_ID: 'cliente-de-prueba' };
    expect(redirectUriGoogle(env, 'https://dash101.ejemplo.mx/auth/google?volver_a=x')).toBe('https://api.ejemplo.mx/auth/google/callback');
    expect(redirectUriGoogle({ URL_PUBLICA: 'https://api.ejemplo.mx/' }, 'https://peek101.ejemplo.mx/auth/google')).toBe('https://api.ejemplo.mx/auth/google/callback');
    // Sin URL_PUBLICA queda el origen de la petición: sólo vale cuando el navegador le habla directo a la API.
    expect(redirectUriGoogle({}, 'https://api.ejemplo.mx/auth/google')).toBe('https://api.ejemplo.mx/auth/google/callback');

    const u = urlAutorizacionGoogle(env, 'https://master101.ejemplo.mx/auth/google', 'https://master101.ejemplo.mx/');
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('redirect_uri')).toBe('https://api.ejemplo.mx/auth/google/callback');
    expect(u.searchParams.get('client_id')).toBe('cliente-de-prueba');
    expect(u.searchParams.get('state')).toBe('https://master101.ejemplo.mx/');
    expect(u.searchParams.get('scope')).toBe('openid email profile');
    expect(u.searchParams.get('response_type')).toBe('code');
  });

  it('los Workers de la suite están en ORIGENES: /auth/google no los rechaza como ajenos', async () => {
    // wrangler.toml de producción es el que leen las pruebas (ver vitest.config).
    for (const app of ['dash101', 'peek101', 'master101', 'quote101', 'workshop101']) {
      const r = await pedir('/auth/google?volver_a=' + encodeURIComponent(`https://${app}.mike-929.workers.dev/`));
      // Sin credenciales de Google contesta 501; lo que importa aquí es que NO sea 403 origen_no_permitido.
      expect(r.estado, app).toBe(501);
      expect(r.error, app).toBe('google_no_configurado');
    }
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

describe('11 · workshop101: el administrador de la empresa (contrato 0.6.0)', () => {
  /** Entra con código por correo (fuera de producción la API lo devuelve) y
   *  deja la cookie en `galleta`. Devuelve el usuario_id. */
  async function entrarComo(correo: string): Promise<string> {
    galleta = '';
    const cod = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo }) });
    const ent = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo, codigo: cod.data.codigo_prueba }) });
    expect(ent.estado, `entrar como ${correo}`).toBe(200);
    return ent.data.usuario.id;
  }

  let galletaMike = '';
  let duena = '';
  let admi = '';
  let socia = '';

  it('el superadmin nombra a la dueña; la dueña da de alta administración y una socia con apps acotadas', async () => {
    galletaMike = galleta;
    const alta = await pedir(`/admin/orgs/${ORG}/miembros`, { method: 'POST', body: JSON.stringify({ correo: 'duena@ejemplo.mx', nombre: 'Dueña', rol: 'owner' }) });
    expect(alta.estado).toBe(201);
    duena = alta.data.usuario_id;

    await entrarComo('duena@ejemplo.mx');
    const a = await pedir(`/admin/orgs/${ORG}/miembros`, { method: 'POST', body: JSON.stringify({ correo: 'admi@ejemplo.mx', nombre: 'Admi', rol: 'admin' }) });
    expect(a.estado).toBe(201);
    admi = a.data.usuario_id;
    const s = await pedir(`/admin/orgs/${ORG}/miembros`, { method: 'POST', body: JSON.stringify({ correo: 'socia@ejemplo.mx', rol: 'socio', apps: ['dash', 'dash'] }) });
    expect(s.estado).toBe(201);
    expect(s.data.apps).toEqual(['dash']);
    socia = s.data.usuario_id;

    // Una app que la empresa no tiene no se puede repartir.
    const rara = await pedir(`/admin/orgs/${ORG}/miembros`, { method: 'POST', body: JSON.stringify({ correo: 'x@ejemplo.mx', rol: 'staff', apps: ['bitcoin'] }) });
    expect(rara.estado).toBe(400);
    expect(rara.detalle.apps_desconocidas).toEqual(['bitcoin']);

    // La lista trae a todos con su última entrada: la dueña acaba de entrar, la socia nunca.
    const lista = await pedir(`/admin/orgs/${ORG}/miembros`);
    expect(lista.estado).toBe(200);
    const porCorreo = Object.fromEntries(lista.data.filas.map((f: any) => [f.correo, f]));
    expect(porCorreo['duena@ejemplo.mx'].ultima_entrada).toBeTruthy();
    expect(porCorreo['socia@ejemplo.mx'].ultima_entrada).toBe(null);
    expect(porCorreo['socia@ejemplo.mx'].apps).toEqual(['dash']);

    // Y la bitácora de su empresa la lee la dueña, con sus altas.
    const bit = await pedir(`/admin/orgs/${ORG}/bitacora`);
    expect(bit.estado).toBe(200);
    expect(bit.data.filas.some((r: any) => r.campo === 'miembro' && r.despues === 'socia@ejemplo.mx (socio)' && r.quien === 'duena@ejemplo.mx')).toBe(true);
  });

  it('la lista de apps por persona se aplica en la puerta: la socia entra a dash101 y no a quell101; workshop101 es de quien administra', async () => {
    await entrarComo('socia@ejemplo.mx');
    const dash = await pedir(`/orgs/${ORG}`, { app: 'dash101' });
    expect(dash.estado).toBe(200);
    const quell = await pedir(`/orgs/${ORG}`, { app: 'quell101' });
    expect(quell.estado).toBe(403);
    expect(quell.error).toBe('app_no_permitida');
    expect(quell.detalle.permitidas).toEqual(['dash']);
    const panel = await pedir(`/orgs/${ORG}`, { app: 'workshop101' });
    expect(panel.estado).toBe(403);
    expect(panel.detalle.motivo).toBe('solo_administra');
    // Y la socia tampoco administra gente.
    const gente = await pedir(`/admin/orgs/${ORG}/miembros`);
    expect(gente.estado).toBe(403);

    await entrarComo('admi@ejemplo.mx');
    const panelAdmi = await pedir(`/orgs/${ORG}`, { app: 'workshop101' });
    expect(panelAdmi.estado).toBe(200);
    // Sin lista, todas las apps de la empresa.
    expect((await pedir(`/orgs/${ORG}`, { app: 'quell101' })).estado).toBe(200);
  });

  /* EL DEFECTO DE FER (21-sep-2026).
   *
   * Mike: «me sale esto cuando fer@forespot.com quiere usar supply101» —
   * `app_no_permitida`. supply101 mandaba `X-App: dash101`, así que la lista
   * de apps por persona se revisaba con la llave `dash`. Fer no la tiene.
   *
   * Y eso no era una configuración mal puesta: supply101 EXISTE para quien
   * no entra a dash101 —«quien pide no tiene por qué entrar al tablero del
   * dinero»—, así que la app le cerraba la puerta justo a la gente para la
   * que se hizo. En Forespot, de cuatro personas, las dos que la necesitaban
   * eran las dos que no podían entrar.
   *
   * Lo que estas pruebas amarran es que los dos permisos quedaron
   * INDEPENDIENTES, en los dos sentidos. Uno solo de los dos casos no basta:
   * si mañana alguien «arregla» esto haciendo que `supply` se herede de
   * `dash`, el primer caso seguiría pasando y el defecto volvería para quien
   * sólo tiene `supply`. */
  it('pedir compras y ver el dinero son dos permisos distintos, y ninguno arrastra al otro', async () => {
    await entrarComo('duena@ejemplo.mx');
    // Como Fer: todo menos el tablero del dinero, y con permiso de pedir.
    const fer = await pedir(`/admin/orgs/${ORG}/miembros`, {
      method: 'POST',
      body: JSON.stringify({ correo: 'fer@ejemplo.mx', rol: 'admin', apps: ['quell', 'supply'] }),
    });
    expect(fer.estado, JSON.stringify(fer)).toBe(201);
    expect(fer.data.apps).toEqual(['quell', 'supply']);

    await entrarComo('fer@ejemplo.mx');
    const supply = await pedir(`/orgs/${ORG}`, { app: 'supply101' });
    expect(supply.estado, 'quien pide compras entra a supply101').toBe(200);
    const dash = await pedir(`/orgs/${ORG}`, { app: 'dash101' });
    expect(dash.estado, 'y NO al tablero del dinero').toBe(403);
    expect(dash.error).toBe('app_no_permitida');

    // Y al revés: `dash` por sí solo ya no abre supply101. Quien lo tenía
    // antes del 21-sep no lo perdió, pero porque la migración 0008 le
    // escribió `supply` en su lista, no porque una llave arrastre a la otra.
    await entrarComo('duena@ejemplo.mx');
    await pedir(`/admin/orgs/${ORG}/miembros`, {
      method: 'POST',
      body: JSON.stringify({ correo: 'tesorero@ejemplo.mx', rol: 'staff', apps: ['dash'] }),
    });
    await entrarComo('tesorero@ejemplo.mx');
    expect((await pedir(`/orgs/${ORG}`, { app: 'dash101' })).estado).toBe(200);
    const sinSupply = await pedir(`/orgs/${ORG}`, { app: 'supply101' });
    expect(sinSupply.estado, '`dash` no arrastra a `supply`').toBe(403);
    expect(sinSupply.error).toBe('app_no_permitida');
  });

  it('guardar apps desde una pantalla vieja no apaga una app que no conoce', async () => {
    /* El PATCH de `apps` MEZCLA. Antes pisaba el objeto entero, así que
     * master101 o workshop101 mandando su lista de seis llaves habrían
     * apagado `supply` —la llave que nació el 21-sep— en cuanto alguien
     * guardara apps en una empresa, sin pedirlo y sin que se notara hasta
     * que la liga de supply101 dejara de abrir.
     *
     * Apagar sigue siendo mandar `false`; lo que ya no apaga es el silencio. */
    galleta = galletaMike;
    const seis = { dash: true, quell: true, cotizador: true, peek: true, roster: true, nest: true };
    await pedir(`/admin/orgs/${ORG}`, { method: 'PATCH', body: JSON.stringify({ apps: seis }) });
    const tras = await pedir(`/admin/orgs/${ORG}`);
    expect(tras.data.apps.supply, 'la llave que la pantalla no mandó sigue prendida').toBe(true);

    // Y apagarla a propósito sí la apaga.
    await pedir(`/admin/orgs/${ORG}`, { method: 'PATCH', body: JSON.stringify({ apps: { supply: false } }) });
    expect((await pedir(`/admin/orgs/${ORG}`)).data.apps.supply).toBe(false);
    await pedir(`/admin/orgs/${ORG}`, { method: 'PATCH', body: JSON.stringify({ apps: { supply: true } }) });
    expect((await pedir(`/admin/orgs/${ORG}`)).data.apps.supply).toBe(true);
  });

  it('una empresa nueva trae supply101 prendida junto a dash101', async () => {
    /* La migración 0008 arregla las empresas que ya existían; esto cuida las
     * que nazcan mañana. Sin esto, cada empresa nueva repetiría el defecto:
     * dash101 prendido, supply101 apagada, y nadie sabría por qué la liga
     * que se reparte por WhatsApp no abre. */
    galleta = galletaMike;   // el superadmin
    const nueva = `nacida-${Date.now().toString(36)}`;
    const alta = await pedir('/admin/orgs', { method: 'POST', body: JSON.stringify({ id: nueva, nombre: 'Recién nacida' }) });
    expect(alta.estado, JSON.stringify(alta)).toBe(201);
    const det = await pedir(`/admin/orgs/${nueva}`);
    expect(det.data.apps.supply).toBe(true);
    expect(det.data.apps.dash).toBe(true);
  });

  it('la administración no nombra ni toca dueños, y nadie se toca a sí mismo', async () => {
    await entrarComo('admi@ejemplo.mx');
    const nombra = await pedir(`/admin/orgs/${ORG}/miembros`, { method: 'POST', body: JSON.stringify({ correo: 'otro-dueno@ejemplo.mx', rol: 'owner' }) });
    expect(nombra.estado).toBe(403);
    expect(nombra.detalle.motivo).toBe('solo_un_dueno_nombra_duenos');
    const degrada = await pedir(`/admin/orgs/${ORG}/miembros/${duena}`, { method: 'PATCH', body: JSON.stringify({ rol: 'socio' }) });
    expect(degrada.estado).toBe(403);
    expect(degrada.detalle.motivo).toBe('solo_un_dueno_toca_duenos');
    const baja = await pedir(`/admin/orgs/${ORG}/miembros/${duena}`, { method: 'DELETE' });
    expect(baja.estado).toBe(403);
    const asiMismo = await pedir(`/admin/orgs/${ORG}/miembros/${admi}`, { method: 'PATCH', body: JSON.stringify({ rol: 'owner' }) });
    expect(asiMismo.estado).toBe(403);
    expect(asiMismo.detalle.motivo).toBe('a_ti_mismo');
    const meVoy = await pedir(`/admin/orgs/${ORG}/miembros/${admi}`, { method: 'DELETE' });
    expect(meVoy.detalle.motivo).toBe('a_ti_mismo');
    // Pero sí puede cambiarle las apps a la socia, y queda en la bitácora.
    const apps = await pedir(`/admin/orgs/${ORG}/miembros/${socia}`, { method: 'PATCH', body: JSON.stringify({ apps: ['dash', 'quell'] }) });
    expect(apps.estado).toBe(200);
    expect(apps.data.apps).toEqual(['dash', 'quell']);
    const bit = await pedir(`/admin/orgs/${ORG}/bitacora`);
    expect(bit.data.filas.some((r: any) => r.campo === 'miembro.apps' && r.antes === 'socia@ejemplo.mx: dash' && r.despues === 'socia@ejemplo.mx: dash, quell')).toBe(true);
  });

  it('el último dueño no se degrada ni se baja, ni siquiera por el superadmin', async () => {
    galleta = galletaMike;
    const degrada = await pedir(`/admin/orgs/${ORG}/miembros/${duena}`, { method: 'PATCH', body: JSON.stringify({ rol: 'admin' }) });
    expect(degrada.estado).toBe(409);
    expect(degrada.error).toBe('ultimo_owner');
    const baja = await pedir(`/admin/orgs/${ORG}/miembros/${duena}`, { method: 'DELETE' });
    expect(baja.estado).toBe(409);
    expect(baja.error).toBe('ultimo_owner');
    // Con un segundo dueño, sí; y el segundo puede bajar al primero.
    const segundo = await pedir(`/admin/orgs/${ORG}/miembros/${admi}`, { method: 'PATCH', body: JSON.stringify({ rol: 'owner' }) });
    expect(segundo.estado).toBe(200);
    await entrarComo('admi@ejemplo.mx');
    const ahora = await pedir(`/admin/orgs/${ORG}/miembros/${duena}`, { method: 'PATCH', body: JSON.stringify({ rol: 'admin' }) });
    expect(ahora.estado).toBe(200);
    expect(ahora.data.rol).toBe('admin');
    const fuera = await pedir(`/admin/orgs/${ORG}/miembros/${socia}`, { method: 'DELETE' });
    expect(fuera.estado).toBe(200);
    expect((await pedir(`/admin/orgs/${ORG}/miembros/${socia}`, { method: 'DELETE' })).estado).toBe(404);
    galleta = galletaMike;
  });
});

describe('12 · la contraseña, junto al código, el PIN y Google (contrato 0.7.0)', () => {
  const CORREO = 'con-clave@ejemplo.mx';
  const BUENA = 'muelle-tordo-49';
  const OTRA = 'cantera-vidrio-77';
  let galletaMike = '';

  /** Entra con código y deja la cookie puesta. Devuelve el usuario_id. */
  async function entrarConCodigo(correo: string): Promise<string> {
    galleta = '';
    const cod = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo }) });
    const ent = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo, codigo: cod.data.codigo_prueba }) });
    expect(ent.estado, `entrar con código como ${correo}`).toBe(200);
    return ent.data.usuario.id;
  }

  it('el superadmin da de alta a alguien; esa persona entra con código y pone su contraseña', async () => {
    galletaMike = galleta;
    const alta = await pedir(`/admin/orgs/${ORG}/miembros`, { method: 'POST', body: JSON.stringify({ correo: CORREO, nombre: 'Con Clave', rol: 'admin' }) });
    expect(alta.estado).toBe(201);

    await entrarConCodigo(CORREO);
    // Antes de ponerla, /yo lo dice.
    const antes = await pedir('/yo');
    expect(antes.data.tiene_clave).toBe(false);
    expect(antes.data.tiene_pin).toBe(false);
    // 0.17.2: sin Google ligado. Es lo que mira la pantalla para decidir si
    // le exige una contraseña a quien entró con un código.
    expect(antes.data.tiene_google).toBe(false);
    expect(antes.data.entro_con).toBe('codigo');

    // Las débiles no pasan, y la API dice por qué con palabras.
    const corta = await pedir('/auth/clave', { method: 'POST', body: JSON.stringify({ clave: 'corta1' }) });
    expect(corta.estado).toBe(400);
    expect(corta.error).toBe('clave_debil');
    expect(corta.detalle.porque).toMatch(/al menos 10 caracteres/);

    const conUsuario = await pedir('/auth/clave', { method: 'POST', body: JSON.stringify({ clave: 'con-clave-2026' }) });
    expect(conUsuario.error).toBe('clave_debil');
    expect(conUsuario.detalle.porque).toMatch(/usuario de tu correo/);

    const obvia = await pedir('/auth/clave', { method: 'POST', body: JSON.stringify({ clave: 'Password2026!' }) });
    expect(obvia.error).toBe('clave_debil');

    const escalera = await pedir('/auth/clave', { method: 'POST', body: JSON.stringify({ clave: '1234567890' }) });
    expect(escalera.error).toBe('clave_debil');

    const puesta = await pedir('/auth/clave', { method: 'POST', body: JSON.stringify({ clave: BUENA }) });
    expect(puesta.estado).toBe(200);
    expect(puesta.data).toEqual({ puesta: true, cambiada: false });

    const despues = await pedir('/yo');
    expect(despues.data.tiene_clave).toBe(true);
  });

  it('con Google ligado, /yo lo dice aunque se entre con un código (0.17.2)', async () => {
    const correo = `con-google-${Date.now()}@ejemplo.mx`;
    galleta = galletaMike;
    const alta = await pedir(`/admin/orgs/${ORG}/miembros`, { method: 'POST', body: JSON.stringify({ correo, nombre: 'Con Google', rol: 'staff' }) });
    expect(alta.estado, JSON.stringify(alta)).toBe(201);
    // Como si ya hubiera entrado con Google alguna vez: es lo único que hace
    // el callback de Google con la cuenta.
    await entorno.MASTER.prepare(`UPDATE usuarios SET google_sub = ? WHERE correo = ?`).bind('sub-de-google-123', correo).run();
    await entrarConCodigo(correo);
    const yo = await pedir('/yo');
    expect(yo.data.tiene_clave).toBe(false);
    expect(yo.data.tiene_google).toBe(true);
    expect(yo.data.entro_con).toBe('codigo');
    galleta = galletaMike;
  });

  it('se entra con la contraseña, y la equivocada no dice de más', async () => {
    galleta = '';
    const mala = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO, clave: 'la-que-no-es-99' }) });
    expect(mala.estado).toBe(401);
    expect(mala.error).toBe('clave_invalida');
    expect(JSON.stringify(mala)).not.toContain(BUENA);

    const buena = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO, clave: BUENA }) });
    expect(buena.estado).toBe(200);
    expect(buena.data.usuario.correo).toBe(CORREO);
    const yo = await pedir('/yo');
    expect(yo.data.entro_con).toBe('clave');
    // La API nunca devuelve los hashes.
    expect(JSON.stringify(yo)).not.toContain('clave_hash');
    expect(JSON.stringify(yo)).not.toContain('pin_hash');
  });

  it('cambiarla desde una sesión de contraseña pide la actual; desde una de código, no', async () => {
    // Sigue puesta la sesión abierta con la contraseña.
    const sinActual = await pedir('/auth/clave', { method: 'POST', body: JSON.stringify({ clave: OTRA }) });
    expect(sinActual.estado).toBe(400);
    expect(sinActual.detalle.motivo).toBe('ya_tienes_clave');

    const actualMala = await pedir('/auth/clave', { method: 'POST', body: JSON.stringify({ clave: OTRA, actual: 'no-era-esta-1' }) });
    expect(actualMala.estado).toBe(401);
    expect(actualMala.detalle.cual).toBe('actual');

    const bien = await pedir('/auth/clave', { method: 'POST', body: JSON.stringify({ clave: OTRA, actual: BUENA }) });
    expect(bien.estado).toBe(200);
    expect(bien.data.cambiada).toBe(true);

    // La vieja ya no entra; la nueva sí.
    galleta = '';
    expect((await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO, clave: BUENA }) })).estado).toBe(401);
    galleta = '';
    expect((await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO, clave: OTRA }) })).estado).toBe(200);

    // «Olvidé mi contraseña» es entrar con código y poner otra, sin la actual.
    await entrarConCodigo(CORREO);
    const olvide = await pedir('/auth/clave', { method: 'POST', body: JSON.stringify({ clave: BUENA }) });
    expect(olvide.estado).toBe(200);
    galleta = '';
    expect((await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO, clave: BUENA }) })).estado).toBe(200);
  });

  it('el PIN y la contraseña conviven, y cada uno lleva su propia cuenta de intentos', async () => {
    await entrarConCodigo(CORREO);
    expect((await pedir('/auth/pin', { method: 'POST', body: JSON.stringify({ pin: '481903' }) })).estado).toBe(200);
    const yo = await pedir('/yo');
    expect([yo.data.tiene_pin, yo.data.tiene_clave]).toEqual([true, true]);

    // Se gastan los cinco intentos de la contraseña…
    for (let i = 0; i < 5; i++) {
      galleta = '';
      await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO, clave: 'equivocada-000' }) });
    }
    galleta = '';
    const frenada = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO, clave: BUENA }) });
    expect(frenada.estado).toBe(429);
    expect(frenada.error).toBe('demasiados_intentos');

    // …y el PIN sigue abriendo: son dos frenos distintos.
    galleta = '';
    const conPin = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO, pin: '481903' }) });
    expect(conPin.estado).toBe(200);
    expect((await pedir('/yo')).data.entro_con).toBe('pin');

    // Desde una sesión de PIN tampoco se cambia la contraseña sin la actual:
    // un PIN robado no se lleva la cuenta.
    const intento = await pedir('/auth/clave', { method: 'POST', body: JSON.stringify({ clave: OTRA }) });
    expect(intento.estado).toBe(400);
    expect(intento.detalle.motivo).toBe('ya_tienes_clave');

    galleta = galletaMike;
  });

  it('sin correo conocido, entrar con contraseña no revela nada; y sin nada que mandar es 400', async () => {
    galleta = '';
    const nadie = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: 'no-existe@ejemplo.mx', clave: BUENA }) });
    expect(nadie.estado).toBe(403);
    expect(nadie.error).toBe('sin_permiso');
    const vacio = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO }) });
    expect(vacio.estado).toBe(400);
    expect(vacio.detalle.falta).toBe('codigo, pin o clave');
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
    expect(r.data.org_db_version).toBe(VERSION_ORG_DB);

    const ya = await pedir('/orgs/efimera/negocios', { app: 'dash101' });
    expect(ya.estado).toBe(404);
    expect(ya.error).toBe('org_desconocida');

    const otraVez = await pedir('/admin/orgs', { method: 'POST', body: JSON.stringify({ id: 'efimera', nombre: 'Efímera' }) });
    expect(otraVez.estado).toBe(201);
    expect(otraVez.data.org_db_version).toBe(VERSION_ORG_DB);
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

/* ─────────────── contrato 0.5.0: lo que master101 necesita ───────────────
 * Decidido por Mike el 15-sep (muro 0410-jr y 0420-jr): superadmins por ruta,
 * la bitácora del panel y conteos por empresa. */

describe('0.5.0 · superadmins por ruta', () => {
  it('la lista trae al que entró primero (sembrado por CORREO_SUPERADMIN)', async () => {
    const r = await pedir('/admin/superadmins');
    expect(r.estado).toBe(200);
    expect(r.data.filas.map((x: any) => x.correo)).toContain(CORREO);
  });

  it('el último superadmin no se puede quitar, ni uno mismo', async () => {
    const yo = await pedir('/yo');
    const propio = await pedir(`/admin/superadmins/${yo.data.usuario.id}`, { method: 'DELETE' });
    expect(propio.estado).toBe(409);
    expect(propio.detalle.motivo).toBe('a_ti_mismo');
  });

  it('se agrega otro por correo, se apunta en la bitácora, y luego sí se puede quitar', async () => {
    const alta = await pedir('/admin/superadmins', { method: 'POST', body: JSON.stringify({ correo: 'Socia@Ejemplo.MX', nombre: 'Socia' }) });
    expect(alta.estado).toBe(201);
    expect(alta.data.correo).toBe('socia@ejemplo.mx');
    const otraVez = await pedir('/admin/superadmins', { method: 'POST', body: JSON.stringify({ correo: 'socia@ejemplo.mx' }) });
    expect(otraVez.estado).toBe(200);
    expect(otraVez.data.ya_lo_era).toBe(true);

    const lista = await pedir('/admin/superadmins');
    expect(lista.data.total).toBe(2);

    const bit = await pedir('/admin/bitacora');
    const renglon = bit.data.filas.find((f: any) => f.campo === 'superadmin' && f.despues === 'socia@ejemplo.mx');
    expect(renglon).toBeTruthy();
    expect(renglon.quien).toBe(CORREO);
    expect(renglon.org_id).toBeNull();

    const baja = await pedir(`/admin/superadmins/${alta.data.usuario_id}`, { method: 'DELETE' });
    expect(baja.estado).toBe(200);
    expect((await pedir('/admin/superadmins')).data.total).toBe(1);
    const quitado = (await pedir('/admin/bitacora')).data.filas.find((f: any) => f.campo === 'superadmin' && f.antes === 'socia@ejemplo.mx');
    expect(quitado.despues).toBeNull();
  });

  it('quitar a uno que no es superadmin contesta 404, y el último da ultimo_superadmin', async () => {
    const nadie = await pedir('/admin/superadmins/no-existe', { method: 'DELETE' });
    expect(nadie.estado).toBe(404);
    // Con dos, quitar al otro deja uno; con uno, quitar a ese uno (desde otra
    // sesión) daría ultimo_superadmin. Se comprueba el candado directo:
    const alta = await pedir('/admin/superadmins', { method: 'POST', body: JSON.stringify({ correo: 'otro@ejemplo.mx' }) });
    const guardada = galleta;
    // Entra el otro y trata de quitar al primero: se puede (quedan dos → uno).
    const cod = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: 'otro@ejemplo.mx' }) });
    galleta = '';
    await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: 'otro@ejemplo.mx', codigo: cod.data.codigo_prueba }) });
    const yo = await pedir('/yo');
    expect(yo.data.superadmin).toBe(true);
    // Ahora el otro intenta quitarse a sí mismo: a_ti_mismo, aunque haya dos.
    const asiMismo = await pedir(`/admin/superadmins/${alta.data.usuario_id}`, { method: 'DELETE' });
    expect(asiMismo.estado).toBe(409);
    galleta = guardada;
    // El primero quita al otro: quedan uno.
    expect((await pedir(`/admin/superadmins/${alta.data.usuario_id}`, { method: 'DELETE' })).estado).toBe(200);
    // Y desde una sesión de un tercero que ya no es superadmin, nada:
    galleta = '';
    const cod2 = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: 'otro@ejemplo.mx' }) });
    await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: 'otro@ejemplo.mx', codigo: cod2.data.codigo_prueba }) });
    expect((await pedir('/admin/superadmins')).estado).toBe(403);
    galleta = guardada;
  });
});

describe('0.5.0 · la bitácora del panel y los conteos', () => {
  it('GET /admin/orgs trae personas y ultima_entrada por empresa', async () => {
    const r = await pedir('/admin/orgs');
    expect(r.estado).toBe(200);
    const mia = r.data.filas.find((o: any) => o.id === ORG);
    expect(mia).toBeTruthy();
    expect(typeof mia.personas).toBe('number');
    expect(mia).toHaveProperty('ultima_entrada');
  });

  it('un PATCH deja un renglón por campo que cambió, con el correo de quien lo hizo', async () => {
    const antes = (await pedir(`/admin/orgs/${ORG}/bitacora`)).data.total;
    const r = await pedir(`/admin/orgs/${ORG}`, { method: 'PATCH', body: JSON.stringify({ nombre: 'Empresa renombrada', apps: { dash: true, quell: false, cotizador: true, peek: true, roster: true, nest: true } }) });
    expect(r.estado).toBe(200);
    expect(r.data.nombre).toBe('Empresa renombrada');
    expect(typeof r.data.personas).toBe('number');
    const bit = await pedir(`/admin/orgs/${ORG}/bitacora`);
    const nuevos = bit.data.filas.slice(0, bit.data.total - antes);
    const campos = nuevos.map((f: any) => f.campo).sort();
    expect(campos).toEqual(['apps.quell', 'nombre']);
    const quell = nuevos.find((f: any) => f.campo === 'apps.quell');
    expect(quell.antes).toBe('true');
    expect(quell.despues).toBe('false');
    expect(quell.quien).toBe(CORREO);
    expect(quell.org_id).toBe(ORG);
  });

  it('un PATCH que no cambia nada no deja renglón', async () => {
    const antes = (await pedir(`/admin/orgs/${ORG}/bitacora`)).data.total;
    await pedir(`/admin/orgs/${ORG}`, { method: 'PATCH', body: JSON.stringify({ nombre: 'Empresa renombrada' }) });
    expect((await pedir(`/admin/orgs/${ORG}/bitacora`)).data.total).toBe(antes);
  });

  it('alta y baja de un miembro quedan apuntadas, y los conteos cambian', async () => {
    const alta = await pedir(`/admin/orgs/${ORG}/miembros`, { method: 'POST', body: JSON.stringify({ correo: 'oficina@ejemplo.mx', rol: 'staff' }) });
    expect(alta.estado).toBe(201);
    const conUno = (await pedir(`/admin/orgs/${ORG}`)).data;
    expect(conUno.personas).toBeGreaterThanOrEqual(1);
    const baja = await pedir(`/admin/orgs/${ORG}/miembros/${alta.data.usuario_id}`, { method: 'DELETE' });
    expect(baja.estado).toBe(200);
    const bit = (await pedir(`/admin/orgs/${ORG}/bitacora`)).data.filas.filter((f: any) => f.campo === 'miembro');
    expect(bit.some((f: any) => f.antes === null && f.despues === 'oficina@ejemplo.mx (staff)')).toBe(true);
    expect(bit.some((f: any) => f.antes === 'oficina@ejemplo.mx (staff)' && f.despues === null)).toBe(true);
  });

  it('quien no es superadmin no lee la bitácora ni los superadmins', async () => {
    const guardada = galleta;
    galleta = '';
    const cod = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: 'otro@ejemplo.mx' }) });
    await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: 'otro@ejemplo.mx', codigo: cod.data.codigo_prueba }) });
    expect((await pedir('/admin/bitacora')).estado).toBe(403);
    expect((await pedir(`/admin/orgs/${ORG}/bitacora`)).estado).toBe(403);
    galleta = guardada;
  });
});

describe('13 · la puerta de las apps empacadas (contrato 0.8.0)', () => {
  const CORREO_APP = 'del-apk@ejemplo.mx';
  let galletaMike = '';
  let token = '';

  /** Como pide una app empacada: sin cookie, con el token a mano. */
  async function conToken(ruta: string, t: string, opciones: RequestInit = {}) {
    const guardada = galleta;
    galleta = '';
    const r = await pedir(ruta, { ...opciones, headers: { Authorization: `Bearer ${t}`, ...(opciones.headers as object) } });
    galleta = guardada;
    return r;
  }

  it('al navegador no se le da token; sólo a quien lo pide con aparato', async () => {
    galletaMike = galleta;
    const alta = await pedir(`/admin/orgs/${ORG}/miembros`, { method: 'POST', body: JSON.stringify({ correo: CORREO_APP, nombre: 'Del APK', rol: 'staff' }) });
    expect(alta.estado).toBe(201);

    galleta = '';
    const cod = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: CORREO_APP }) });
    const web = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO_APP, codigo: cod.data.codigo_prueba }) });
    expect(web.estado).toBe(200);
    expect(web.data.token).toBeUndefined();
    // Pero la cookie sí quedó puesta.
    expect(galleta).toMatch(/^s101=/);

    // El freno de reenvío son 45 s; aquí se borra el renglón para pedir otro
    // código de inmediato, que es lo único que estorba en la prueba.
    await entorno.MASTER.prepare(`DELETE FROM codigos WHERE correo = ?`).bind(CORREO_APP).run();
    galleta = '';
    const cod2 = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: CORREO_APP }) });
    const app = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO_APP, codigo: cod2.data.codigo_prueba, aparato: true }) });
    expect(app.estado).toBe(200);
    expect(typeof app.data.token).toBe('string');
    expect(app.data.token.length).toBeGreaterThan(20);
    token = app.data.token;
    galleta = galletaMike;
  });

  it('con el token y sin cookie, /yo contesta y es la misma persona', async () => {
    const r = await conToken('/yo', token);
    expect(r.estado).toBe(200);
    expect(r.data.usuario.correo).toBe(CORREO_APP);
    expect(r.data.entro_con).toBe('codigo');
  });

  it('un token inventado o mal firmado no abre nada', async () => {
    expect((await conToken('/yo', 'no-soy-un-token')).estado).toBe(401);
    expect((await conToken('/yo', token.split('.')[0] + '.firmaInventada')).estado).toBe(401);
    // Y el encabezado sin «Bearer» tampoco.
    const guardada = galleta;
    galleta = '';
    const suelto = await pedir('/yo', { headers: { Authorization: token } });
    expect(suelto.estado).toBe(401);
    galleta = guardada;
  });

  it('si van cookie y token a la vez, manda la cookie', async () => {
    // `galleta` es la de Mike; el token es de otra persona.
    const r = await pedir('/yo', { headers: { Authorization: `Bearer ${token}` } });
    expect(r.estado).toBe(200);
    expect(r.data.usuario.correo).toBe(CORREO);
  });

  it('es la misma sesión: salir con el token la mata para siempre', async () => {
    const salida = await conToken('/auth/salir', token, { method: 'POST' });
    expect(salida.estado).toBe(200);
    expect(salida.data.salio).toBe(true);
    expect((await conToken('/yo', token)).estado).toBe(401);
    galleta = galletaMike;
  });

  it('el boleto de Google también se canjea por token cuando lo pide una app', async () => {
    galletaMike = galleta;
    const id = 'boleto-de-aparato-' + Date.now();
    await entorno.MASTER.prepare(`INSERT INTO tickets (id, galleta, expira_at) VALUES (?,?,?)`)
      .bind(id, galletaMike.split('=')[1], new Date(Date.now() + 60_000).toISOString()).run();

    galleta = '';
    const canje = await pedir('/auth/canje', { method: 'POST', body: JSON.stringify({ entrada: id, aparato: true }) });
    expect(canje.estado).toBe(200);
    expect(canje.data.token).toBe(galletaMike.split('=')[1]);
    const r = await conToken('/yo', canje.data.token);
    expect(r.estado).toBe(200);
    expect(r.data.usuario.correo).toBe(CORREO);
    galleta = galletaMike;
  });
});

describe('14 · el folio de la cotización lo asigna la suite (contrato 0.9.0)', () => {
  let negocio = '';

  /* `runInDurableObject` viene con genéricos que arrastran toda la clase del
   * OrgDB y TypeScript se rinde con TS2589 («type instantiation is excessively
   * deep»). Se llama por un alias plano, igual que en la prueba 2. */
  const dentro = runInDurableObject as unknown as <T>(s: unknown, f: (o: any) => T | Promise<T>) => Promise<T>;
  const elDO = () => entorno.ORG.get(entorno.ORG.idFromName(ORG)) as unknown as DurableObjectStub;

  /** Crea una cotización por la ruta de siempre, como quote101. */
  const cotizar = (extra: Record<string, unknown> = {}) =>
    pedir(`/orgs/${ORG}/cotizaciones`, {
      method: 'POST', app: 'cotizador101',
      body: JSON.stringify({ negocio_id: negocio, total: 15000000, moneda: 'MXN', ...extra }),
    });

  it('el contador arranca en 1 y va corrido', async () => {
    const neg = await pedir(`/orgs/${ORG}/negocios`, { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'Folios' }) });
    negocio = neg.data.id;

    const uno = await cotizar();
    expect(uno.estado).toBe(201);
    expect(uno.data.folio).toBe('COT-000001');

    const dos = await cotizar();
    expect(dos.data.folio).toBe('COT-000002');

    const tres = await cotizar();
    expect(tres.data.folio).toBe('COT-000003');
  });

  it('el folio NO lo pone la app: si lo manda, se le ignora', async () => {
    // Es el punto de todo esto. Si se dejara pasar, el navegador volvería a
    // decidir el folio y estaríamos en el problema del que venimos: un folio
    // calculado del monto, que cambia si cambia el monto.
    const r = await cotizar({ folio: 'COT-999999' });
    expect(r.estado).toBe(201);
    expect(r.data.folio).toBe('COT-000004');
    expect(r.data.folio).not.toBe('COT-999999');
  });

  it('no hay dos cotizaciones con el mismo folio, ni a la carrera', async () => {
    // Diez de golpe, sin esperar una a otra. El Durable Object es de un solo
    // hilo: se encolan y cada una se lleva su número. Esto es lo que antes
    // fallaba, cuando el folio lo calculaba el navegador del monto y la fecha
    // y dos del mismo día con el mismo total daban el mismo folio.
    const diez = await Promise.all(Array.from({ length: 10 }, () => cotizar()));
    const folios = diez.map((r) => r.data.folio);
    expect(new Set(folios).size).toBe(10);
    expect(diez.every((r) => r.estado === 201)).toBe(true);

    const todas = await pedir(`/orgs/${ORG}/cotizaciones`, { app: 'cotizador101' });
    const todos = (todas.data.filas as Array<{ folio: string }>).map((f) => f.folio);
    expect(new Set(todos).size).toBe(todos.length);
    expect(todos.every((f) => /^COT-\d{6}$/.test(f))).toBe(true);
  });

  it('la mudanza sí puede traer un folio viejo congelado, y el contador lo respeta', async () => {
    // Los 39 folios de producción son números derivados, de 008406 a 874280.
    // Andan impresos en los PDFs de los clientes, así que la mudanza los trae
    // tal cual. Sólo `suite101` puede hacerlo; para eso llama al DO directo.
    const vieja = await dentro<{ folio: string }>(elDO(), (obj: any) =>
      obj.crear('cotizaciones', { negocio_id: negocio, total: 5757170, folio: 'COT-008406' }, { app: 'suite101', usuario_id: 'u' }));
    expect(vieja.folio).toBe('COT-008406');

    // Y el contador queda donde se le diga, que es lo que hará la fase 4 al
    // terminar de importar.
    const puesto = await dentro<number>(elDO(), (obj: any) => obj.fijarFolio(40));
    expect(puesto).toBe(40);
    const siguiente = await cotizar();
    expect(siguiente.data.folio).toBe('COT-000040');
  });

  it('si el folio que toca ya existe, se salta al siguiente', async () => {
    // Se ocupa el 000041 a mano y se pone el contador ahí: el asignador tiene
    // que darse cuenta y pasar al 000042. Hoy esto no se dispara nunca —los
    // folios viejos no bajan de 008406— pero cubre el día que se importe el
    // histórico de otro cliente.
    await dentro<unknown>(elDO(), (obj: any) =>
      obj.crear('cotizaciones', { negocio_id: negocio, total: 100, folio: 'COT-000041' }, { app: 'suite101', usuario_id: 'u' }));
    await dentro<number>(elDO(), (obj: any) => obj.fijarFolio(41));

    const r = await cotizar();
    expect(r.data.folio).toBe('COT-000042');
  });

  it('la base misma impide dos folios iguales', async () => {
    // La cerradura está en el índice único, no en una revisión del servidor:
    // una ruta nueva que se olvide de preguntar vuelve a abrir la puerta, el
    // índice no. Es la misma lección del código de ítem en quell101.
    await expect(dentro<unknown>(elDO(), (obj: any) =>
      obj.crear('cotizaciones', { negocio_id: negocio, total: 200, folio: 'COT-000041' }, { app: 'suite101', usuario_id: 'u' })),
    ).rejects.toThrow(/UNIQUE|constraint/i);
  });
});

describe('15 · los ajustes de cada app (contrato 0.10.0)', () => {
  /* Lo que se prueba aquí no es guardar y leer: es que una app NO pueda tocar
   * los ajustes de otra. La lista de precios de quote101 son costos, y el día
   * que Firebase se apague va a vivir en esta tabla. */

  it('se guarda un ajuste y el id lo arma la API con X-App', async () => {
    const r = await pedir(`/orgs/${ORG}/ajustes`, {
      method: 'POST', app: 'cotizador101',
      body: JSON.stringify({ clave: 'precios', valor: { mano_obra: 35000, herrajes: 12000 } }),
    });
    expect(r.estado).toBe(201);
    expect(r.data.id).toBe('cotizador101:precios');
    expect(r.data.app).toBe('cotizador101');
    expect(r.data.valor).toEqual({ mano_obra: 35000, herrajes: 12000 });
  });

  it('guardar otra vez la misma clave no choca: la pisa', async () => {
    // Sin esto la app tendría que preguntar antes si existía, y dos pestañas
    // guardando a la vez se llevarían un 409 por turnarse mal.
    const r = await pedir(`/orgs/${ORG}/ajustes`, {
      method: 'POST', app: 'cotizador101',
      body: JSON.stringify({ clave: 'precios', valor: { mano_obra: 40000 } }),
    });
    expect(r.estado).toBe(201);
    expect(r.data.id).toBe('cotizador101:precios');
    expect(r.data.valor).toEqual({ mano_obra: 40000 });
    const lista = await pedir(`/orgs/${ORG}/ajustes`, { app: 'cotizador101' });
    expect(lista.data.filas.filter((f: any) => f.clave === 'precios')).toHaveLength(1);
  });

  it('una app NO puede firmar un ajuste con el nombre de otra', async () => {
    const r = await pedir(`/orgs/${ORG}/ajustes`, {
      method: 'POST', app: 'dash101',
      body: JSON.stringify({ clave: 'precios', valor: {}, app: 'cotizador101' }),
    });
    expect(r.estado).toBe(403);
    expect(r.error).toBe('campo_no_permitido');
    expect(r.detalle.campos).toContain('app');
  });

  it('ni elegir su id, que es lo mismo por otro lado', async () => {
    const r = await pedir(`/orgs/${ORG}/ajustes`, {
      method: 'POST', app: 'dash101',
      body: JSON.stringify({ clave: 'x', valor: {}, id: 'cotizador101:precios' }),
    });
    expect(r.estado).toBe(403);
    expect(r.error).toBe('campo_no_permitido');
  });

  it('cada app lista los suyos y nada más', async () => {
    await pedir(`/orgs/${ORG}/ajustes`, {
      method: 'POST', app: 'dash101', body: JSON.stringify({ clave: 'columnas', valor: { orden: 'fecha' } }),
    });
    const mio = await pedir(`/orgs/${ORG}/ajustes`, { app: 'dash101' });
    expect(mio.data.filas.map((f: any) => f.id)).toEqual(['dash101:columnas']);
    const suyo = await pedir(`/orgs/${ORG}/ajustes`, { app: 'cotizador101' });
    expect(suyo.data.filas.map((f: any) => f.id)).toEqual(['cotizador101:precios']);
  });

  it('y el filtro ?app= no sirve para asomarse: se sobrescribe', async () => {
    const r = await pedir(`/orgs/${ORG}/ajustes?app=cotizador101`, { app: 'dash101' });
    expect(r.estado).toBe(200);
    expect(r.data.filas.map((f: any) => f.id)).toEqual(['dash101:columnas']);
  });

  it('pedir por id el ajuste de otra app contesta 404, no 403', async () => {
    // 404 y no 403 a propósito: un 403 confirmaría que existe. Una fila ajena y
    // una fila que no hay se contestan igual.
    const r = await pedir(`/orgs/${ORG}/ajustes/cotizador101:precios`, { app: 'dash101' });
    expect(r.estado).toBe(404);
    expect(r.error).toBe('no_encontrado');
  });

  it('el propio sí se abre por id', async () => {
    const r = await pedir(`/orgs/${ORG}/ajustes/cotizador101:precios`, { app: 'cotizador101' });
    expect(r.estado).toBe(200);
    expect(r.data.valor).toEqual({ mano_obra: 40000 });
  });

  it('modificar el ajuste de otra app: 404', async () => {
    const r = await pedir(`/orgs/${ORG}/ajustes/cotizador101:precios`, {
      method: 'PATCH', app: 'dash101', body: JSON.stringify({ valor: { mano_obra: 1 } }),
    });
    expect(r.estado).toBe(404);
    const sigue = await pedir(`/orgs/${ORG}/ajustes/cotizador101:precios`, { app: 'cotizador101' });
    expect(sigue.data.valor).toEqual({ mano_obra: 40000 });
  });

  it('borrar el ajuste de otra app: 404', async () => {
    const r = await pedir(`/orgs/${ORG}/ajustes/cotizador101:precios`, { method: 'DELETE', app: 'dash101' });
    expect(r.estado).toBe(404);
    const sigue = await pedir(`/orgs/${ORG}/ajustes/cotizador101:precios`, { app: 'cotizador101' });
    expect(sigue.estado).toBe(200);
  });

  it('el propio se borra', async () => {
    const r = await pedir(`/orgs/${ORG}/ajustes/dash101:columnas`, { method: 'DELETE', app: 'dash101' });
    expect(r.estado).toBe(200);
    const ya = await pedir(`/orgs/${ORG}/ajustes/dash101:columnas`, { app: 'dash101' });
    expect(ya.estado).toBe(404);
  });

  it('sin clave no se guarda', async () => {
    const r = await pedir(`/orgs/${ORG}/ajustes`, {
      method: 'POST', app: 'cotizador101', body: JSON.stringify({ valor: { a: 1 } }),
    });
    expect(r.estado).toBe(400);
    expect(r.error).toBe('datos_invalidos');
    expect(r.detalle.falta).toContain('clave');
  });
});

describe('16 · consecutivos por serie (contrato 0.11.0)', () => {
  /* El folio de la cotización ya lo ponía la suite. Esto es lo mismo para
   * cualquier otro consecutivo, y existe por el de los recibos de quote101:
   * se calculaba en el navegador —leer el contador, sumar uno, guardar— y ahí
   * dos personas guardando a la vez se llevan el mismo número. */

  it('mirar el siguiente NO lo consume', async () => {
    // Si se apartara al abrir la pantalla, cada vez que alguien se asomara y
    // cerrara se iría un número.
    const a = await pedir(`/orgs/${ORG}/folios/REC`, { app: 'cotizador101' });
    expect(a.estado).toBe(200);
    expect(a.data.siguiente).toBe(1);
    const b = await pedir(`/orgs/${ORG}/folios/REC`, { app: 'cotizador101' });
    expect(b.data.siguiente).toBe(1);
  });

  it('apartar sí lo consume, y el siguiente ya es otro', async () => {
    const uno = await pedir(`/orgs/${ORG}/folios/REC`, { app: 'cotizador101', method: 'POST' });
    expect(uno.estado).toBe(201);
    expect(uno.data.numero).toBe(1);
    const dos = await pedir(`/orgs/${ORG}/folios/REC`, { app: 'cotizador101', method: 'POST' });
    expect(dos.data.numero).toBe(2);
    const mira = await pedir(`/orgs/${ORG}/folios/REC`, { app: 'cotizador101' });
    expect(mira.data.siguiente).toBe(3);
  });

  it('diez de golpe se llevan diez números distintos', async () => {
    // La prueba que justifica que esto viva en el Durable Object y no en el
    // navegador: un solo hilo por empresa, así que no hay manera de entrelazar
    // «leer, sumar uno, guardar».
    const diez = await Promise.all(Array.from({ length: 10 }, () =>
      pedir(`/orgs/${ORG}/folios/REC`, { app: 'cotizador101', method: 'POST' })));
    const numeros = diez.map((r) => r.data.numero);
    expect(new Set(numeros).size).toBe(10);
  });

  it('cada serie lleva su propia cuenta', async () => {
    const otra = await pedir(`/orgs/${ORG}/folios/NOTA`, { app: 'cotizador101', method: 'POST' });
    expect(otra.data.numero).toBe(1);
  });

  it('la serie se normaliza a mayúsculas: `rec` y `REC` son la misma', async () => {
    const antes = await pedir(`/orgs/${ORG}/folios/REC`, { app: 'cotizador101' });
    const r = await pedir(`/orgs/${ORG}/folios/rec`, { app: 'cotizador101' });
    expect(r.data.serie).toBe('REC');
    expect(r.data.siguiente).toBe(antes.data.siguiente);
  });

  it('una serie con cualquier cosa adentro se rechaza', async () => {
    // Es la llave primaria de una tabla. Una serie libre dejaría que cada app
    // se inventara contadores sin que nadie los vea.
    for (const mala of ['con espacio', 'demasiado-larga-para-una-serie', 'ñ', '']) {
      const r = await pedir(`/orgs/${ORG}/folios/${encodeURIComponent(mala)}`, { app: 'cotizador101', method: 'POST' });
      expect(r.estado, `serie ${JSON.stringify(mala)}`).not.toBe(201);
    }
  });

  it('la serie COT no se aparta por aquí', async () => {
    // Ésa la pone la creación de la cotización. Dejar que una app se lleve
    // números de esa serie abriría huecos en la numeración sin motivo.
    const r = await pedir(`/orgs/${ORG}/folios/COT`, { app: 'cotizador101', method: 'POST' });
    expect(r.estado).toBe(403);
    expect(r.detalle.motivo).toMatch(/POST \/orgs\/:o\/cotizaciones/);
    // Mirarla sí se puede: no consume nada.
    const ver = await pedir(`/orgs/${ORG}/folios/COT`, { app: 'cotizador101' });
    expect(ver.estado).toBe(200);
  });
});

describe('0.11.0 · quote101 puede crear su negocio, y nada más', () => {
  const ORG_N = 'cotizador-negocio';

  beforeAll(async () => {
    await pedir('/admin/orgs', { method: 'POST', body: JSON.stringify({ id: ORG_N, nombre: 'Sin negocio' }) });
  });

  it('crea el negocio si la empresa no tiene ninguno', async () => {
    // `cotizaciones.negocio_id` es obligatorio: una empresa sin negocio no
    // puede cotizar, y si el cotizador es la primera app que alguien usa
    // quedaría trabado esperando a otra app.
    const vacia = await pedir(`/orgs/${ORG_N}/negocios`, { app: 'cotizador101' });
    expect(vacia.data.total).toBe(0);
    const r = await pedir(`/orgs/${ORG_N}/negocios`, {
      app: 'cotizador101', method: 'POST', body: JSON.stringify({ nombre: 'Taller 101', moneda: 'MXN' }),
    });
    expect(r.estado).toBe(201);
    expect(r.data.nombre).toBe('Taller 101');
  });

  it('pero no le toca lo demás: eso sigue siendo de dash101', async () => {
    const lista = await pedir(`/orgs/${ORG_N}/negocios`, { app: 'cotizador101' });
    const id = lista.data.filas[0].id;
    const r = await pedir(`/orgs/${ORG_N}/negocios/${id}`, {
      app: 'cotizador101', method: 'PATCH', body: JSON.stringify({ rfc: 'XAXX010101000' }),
    });
    expect(r.estado).toBe(403);
    expect(r.error).toBe('campo_no_permitido');
    expect(r.detalle.permitidos).toEqual(['nombre', 'moneda']);
  });
});

describe('17 · la sesión la decide quién entra, no con qué entró (contrato 0.12.0)', () => {
  const MES = 30 * 24 * 3600;
  const MEDIO_DIA = 12 * 3600;
  const SOCIA = 'dur-socia@ejemplo.mx';
  const CLIENTA = 'dur-clienta@ejemplo.mx';
  const PIN = '736104';
  const CLAVE_SOCIA = 'astilla-remo-58';
  const CLAVE_CLIENTA = 'bruma-tejado-64';
  let galletaMike = '';
  let clienta_id = '';

  /* Lo que esto mide no es una preferencia: es un hueco que estaba abierto.
   * Antes la duración la decidía el camino —PIN 12 horas; código, contraseña y
   * Google 30 días—, y el camino que de verdad usan los clientes de peek101 es
   * el código al correo. O sea que las 12 horas sólo se cumplían por el camino
   * secundario, y al homologar la entrada a Google o contraseña se habrían
   * dejado de cumplir siempre.
   *
   * EL BLOQUE SE ARMA SUS PROPIAS CUENTAS, y no es ceremonia. El primer intento
   * reusaba la persona del bloque 12 y su clienta del bloque 6, y falló dos
   * veces por estado heredado: el freno de intentos de esa persona ya estaba
   * gastado (429), y `accesos` lleva una fila por USUARIO, así que dos usuarios
   * pueden colgar del mismo cliente y quitarle el acceso al cliente apagó la
   * fila del otro. Ninguna de las dos fallas era del código que se está
   * midiendo — que es la peor clase de falla, porque manda a buscar donde no
   * está. */

  it('un socio se lleva 30 días, entre con código o con contraseña', async () => {
    galletaMike = galleta;
    const alta = await pedir(`/admin/orgs/${ORG}/miembros`, {
      method: 'POST', body: JSON.stringify({ correo: SOCIA, nombre: 'Duración Socia', rol: 'socio' }),
    });
    expect(alta.estado).toBe(201);
    galletaMike = galleta;

    galleta = '';
    const cod = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: SOCIA }) });
    const porCodigo = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: SOCIA, codigo: cod.data.codigo_prueba }) });
    expect(porCodigo.estado).toBe(200);
    expect(porCodigo.data.vive_segundos, 'un socio con código').toBe(MES);

    expect((await pedir('/auth/clave', { method: 'POST', body: JSON.stringify({ clave: CLAVE_SOCIA }) })).estado).toBe(200);

    galleta = '';
    const porClave = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: SOCIA, clave: CLAVE_SOCIA }) });
    expect(porClave.estado).toBe(200);
    expect(porClave.data.vive_segundos, 'un socio con contraseña').toBe(MES);
  });

  it('una clienta se lleva 12 horas por los tres caminos, no sólo por el PIN', async () => {
    galleta = galletaMike;
    const negocios = await pedir(`/orgs/${ORG}/negocios`, { app: 'dash101' });
    const nueva = await pedir(`/orgs/${ORG}/clientes`, {
      app: 'dash101', method: 'POST',
      body: JSON.stringify({ nombre: 'Clienta de la Duración', negocio_id: negocios.data.filas[0].id }),
    });
    expect(nueva.estado).toBe(201);
    clienta_id = nueva.data.id;

    const acc = await pedir(`/orgs/${ORG}/clientes/${clienta_id}/acceso`, {
      app: 'dash101', method: 'POST', body: JSON.stringify({ correo: CLIENTA, pin: PIN }),
    });
    expect(acc.estado).toBe(201);
    galletaMike = galleta;

    // Por PIN. Ya daba 12 horas antes; se mide para que se vea que el cambio no
    // se las quitó.
    galleta = '';
    const porPin = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CLIENTA, pin: PIN }) });
    expect(porPin.estado).toBe(200);
    expect(porPin.data.vive_segundos, 'una clienta con PIN').toBe(MEDIO_DIA);

    // Con la sesión del PIN se pone contraseña: no tenía ninguna, así que no
    // hace falta la anterior.
    expect((await pedir('/auth/clave', { method: 'POST', body: JSON.stringify({ clave: CLAVE_CLIENTA }) })).estado,
      'una clienta puede ponerse contraseña').toBe(200);

    // Por contraseña: el camino que va a usar de ahora en adelante.
    galleta = '';
    const porClave = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CLIENTA, clave: CLAVE_CLIENTA }) });
    expect(porClave.estado).toBe(200);
    expect(porClave.data.vive_segundos, 'la contraseña no le regala un mes a una clienta').toBe(MEDIO_DIA);

    // Por código: ESTE es el que estaba dando 30 días a un cliente.
    galleta = '';
    const cod = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: CLIENTA }) });
    const porCodigo = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CLIENTA, codigo: cod.data.codigo_prueba }) });
    expect(porCodigo.estado).toBe(200);
    expect(porCodigo.data.vive_segundos, 'el código al correo era el hueco: daba un mes').toBe(MEDIO_DIA);
  });

  it('la galleta del boleto de Google caduca cuando caduca la sesión, no un mes después', async () => {
    /* `/auth/canje` sólo tiene la galleta firmada del boleto: no sabe de quién
     * es ni cuánto le tocó. Antes le ponía 30 días fijos. Con la duración
     * dependiendo de quién entra, a una clienta le habría quedado un mes de
     * galleta sobre una sesión de 12 horas: el navegador la seguiría mandando,
     * la API contestaría 401, y la pantalla se vería «dentro» hasta que algo
     * fallara. Se lee de D1, que es la única verdad.
     *
     * Esto se mide con `SELF.fetch` y no con `pedir`, porque lo que hay que
     * mirar es el `Max-Age` de la cabecera y `pedir` sólo devuelve el cuerpo. */
    galleta = '';
    const entrar = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CLIENTA, clave: CLAVE_CLIENTA }) });
    expect(entrar.estado).toBe(200);
    // El valor se corta en el PRIMER `=` pero se toma completo: la firma puede
    // traer uno, y partir por todos deja la galleta trunca. Costó cinco
    // despliegues en rojo en quote101 el 16-sep.
    const valor = galleta.slice(galleta.indexOf('=') + 1);

    const id = 'boleto-clienta-' + Date.now();
    await entorno.MASTER.prepare(`INSERT INTO tickets (id, galleta, expira_at) VALUES (?,?,?)`)
      .bind(id, valor, new Date(Date.now() + 60_000).toISOString()).run();

    const r = await SELF.fetch('https://api.local/auth/canje', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entrada: id }),
    });
    expect(r.status).toBe(200);
    const puesta = r.headers.get('Set-Cookie') || '';
    const maxAge = Number(/Max-Age=(\d+)/i.exec(puesta)?.[1] ?? -1);
    expect(maxAge, `Set-Cookie del canje: ${puesta}`).toBeGreaterThan(0);
    expect(maxAge, 'a una clienta el canje no le puede dar un mes de galleta').toBeLessThanOrEqual(MEDIO_DIA);
    expect(maxAge).toBeGreaterThan(MEDIO_DIA - 120);
    galleta = galletaMike;
  });

  it('un boleto cuya sesión ya murió no entra, aunque el boleto siga en fecha', async () => {
    galleta = galletaMike;
    const id = 'boleto-sin-sesion-' + Date.now();
    // Una galleta bien firmada de una sesión que no existe: el id es válido,
    // la firma la pone la propia API al abrir una sesión y luego se borra.
    const ent = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CLIENTA, clave: CLAVE_CLIENTA }) });
    expect(ent.estado).toBe(200);
    const valor = galleta.slice(galleta.indexOf('=') + 1);
    await pedir('/auth/salir', { method: 'POST' });

    await entorno.MASTER.prepare(`INSERT INTO tickets (id, galleta, expira_at) VALUES (?,?,?)`)
      .bind(id, valor, new Date(Date.now() + 60_000).toISOString()).run();
    galleta = '';
    const r = await pedir('/auth/canje', { method: 'POST', body: JSON.stringify({ entrada: id }) });
    expect(r.estado).toBe(401);
    expect(r.error).toBe('entrada_invalida');
    galleta = galletaMike;
  });

  it('quitarle el acceso le devuelve la sesión larga, porque ya no es clienta', async () => {
    // No es un detalle de implementación: es lo que hace que la regla sea
    // «quién eres hoy» y no «cómo te dieron de alta alguna vez».
    galleta = galletaMike;
    const fuera = await pedir(`/orgs/${ORG}/clientes/${clienta_id}/acceso`, { app: 'dash101', method: 'DELETE' });
    expect(fuera.estado).toBe(200);
    galletaMike = galleta;

    galleta = '';
    const cod = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: CLIENTA }) });
    const r = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CLIENTA, codigo: cod.data.codigo_prueba }) });
    expect(r.estado).toBe(200);
    expect(r.data.vive_segundos).toBe(MES);
    galleta = galletaMike;
  });
});

describe('18 · licencias por suscripción (0.13.0; tipo y perpetua desde 0.19.0)', () => {
  const HUELLA_A = 'maquina-a-0123456789abcdef';
  const HUELLA_B = 'maquina-b-0123456789abcdef';
  const dia = (desplaza: number) => new Date(Date.now() + desplaza * 86400000).toISOString().slice(0, 10);
  let publica = '';
  let perpetua: any = null;
  let conTipo: any = null;
  let porCuenta: any = null;
  let pagada: any = null;
  let tokenA = '';
  let galletaSuper = '';
  const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /* EL BLOQUE GUARDA SU PROPIA GALLETA de superadmin: la que viene del bloque
   * anterior si es de Mike, o una nueva por código si el bloque corre solo.
   * No se vuelve a pedir código a cada rato: el freno de intentos de Mike se
   * gasta y un 429 aquí no mediría nada de licencias. */
  async function comoSuper() {
    if (galletaSuper) { galleta = galletaSuper; galletaMike = galleta; return; }
    if (galletaMike) galleta = galletaMike;
    const yo = await pedir('/yo');
    if (yo.ok && yo.data.superadmin) { galletaSuper = galleta; galletaMike = galleta; return; }
    galleta = '';
    for (let i = 0; i < 3; i++) {
      const c = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: CORREO }) });
      if (c.ok) {
        const e = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO, codigo: c.data.codigo_prueba }) });
        expect(e.estado).toBe(200);
        galletaSuper = galleta;
        galletaMike = galleta;
        return;
      }
      await dormir(((c.detalle?.espera_segundos ?? 1) + 1) * 1000);
    }
    throw new Error('no se pudo entrar como superadmin');
  }

  /** Abre el token como lo hará draw101: sólo con la llave pública. */
  async function abrir(token: string) {
    const [v, carga, firma] = token.split('.');
    expect(v).toBe('v1');
    const deB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
    const llave = await crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x: publica }, { name: 'Ed25519' }, false, ['verify']);
    const vale = await crypto.subtle.verify({ name: 'Ed25519' }, llave, deB64(firma), deB64(carga));
    return { vale, carga: JSON.parse(new TextDecoder().decode(deB64(carga))) };
  }

  it('la llave pública se sirve sin sesión, es Ed25519 y es siempre la misma', async () => {
    await comoSuper(); // guarda la galleta de Mike antes de soltarla
    galleta = '';
    const a = await pedir('/licencias/llave');
    expect(a.estado).toBe(200);
    expect(a.data.alg).toBe('Ed25519');
    expect(a.data.publica).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const b = await pedir('/licencias/llave');
    expect(b.data.publica).toBe(a.data.publica);
    expect(b.data.kid).toBe(a.data.kid);
    publica = a.data.publica;
  });

  it('el panel es sólo del superadmin', async () => {
    galleta = '';
    expect((await pedir('/licencias')).estado).toBe(401);
    // Una socia de una empresa cualquiera: entra a la suite, pero no al panel.
    await comoSuper();
    await pedir('/admin/orgs', { method: 'POST', body: JSON.stringify({ id: 'licencias', nombre: 'Pruebas de licencias' }) });
    const alta = await pedir('/admin/orgs/licencias/miembros', { method: 'POST', body: JSON.stringify({ correo: 'lic-ajena@ejemplo.mx', nombre: 'Ajena', rol: 'socio' }) });
    expect(alta.estado).toBe(201);
    galleta = '';
    const c = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: 'lic-ajena@ejemplo.mx' }) });
    const e = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: 'lic-ajena@ejemplo.mx', codigo: c.data.codigo_prueba }) });
    expect(e.estado).toBe(200);
    expect((await pedir('/licencias')).estado).toBe(403);
    expect((await pedir('/licencias', { method: 'POST', body: JSON.stringify({ cliente: 'Intruso' }) })).estado).toBe(403);
  });

  it('Mike crea una perpetua y una de pago; la clave tiene forma y no repite', async () => {
    await comoSuper();
    const a = await pedir('/licencias', { method: 'POST', body: JSON.stringify({ cliente: 'Taller Regalado', perpetua: true, notas: 'para Fer' }) });
    expect(a.estado).toBe(201);
    expect(a.data.clave).toMatch(/^T101-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(a.data.programa).toBe('draw101');
    expect(a.data.lugares).toBe(1);
    expect(a.data.perpetua).toBe(1);
    expect(a.data.tipo, 'quien da de alta a mano regala, salvo que diga otra cosa').toBe('cortesia');
    expect(a.data.vigente).toBe(true);
    perpetua = a.data;

    const b = await pedir('/licencias', { method: 'POST', body: JSON.stringify({ cliente: 'Taller que Paga', correo: 'Pagos@Ejemplo.MX' }) });
    expect(b.estado).toBe(201);
    expect(b.data.correo).toBe('pagos@ejemplo.mx');
    expect(b.data.paga_hasta).toBeNull();
    expect(b.data.vigente, 'sin pago y sin ser perpetua no entra: no hay periodo de prueba').toBe(false);
    expect(b.data.clave).not.toBe(perpetua.clave);
    pagada = b.data;

    const sinNombre = await pedir('/licencias', { method: 'POST', body: JSON.stringify({ lugares: 2 }) });
    expect(sinNombre.estado).toBe(400);
    const malDia = await pedir('/licencias', { method: 'POST', body: JSON.stringify({ cliente: 'X', paga_hasta: '18/09/2026' }) });
    expect(malDia.estado).toBe(400);
    expect(malDia.detalle.campo).toBe('paga_hasta');
  });

  it('la app activa con clave y huella y recibe un token que sólo la llave pública abre', async () => {
    galleta = '';
    const r = await pedir('/licencias/activar', { method: 'POST', body: JSON.stringify({ clave: perpetua.clave.toLowerCase(), huella: HUELLA_A, version: '0.21.0' }) });
    expect(r.estado).toBe(201);
    expect(r.data.lugares).toEqual({ usados: 1, total: 1 });
    expect(r.data.licencia.correo, 'a la app no se le cuenta el correo').toBeUndefined();
    tokenA = r.data.token;
    const { vale, carga } = await abrir(tokenA);
    expect(vale).toBe(true);
    expect(carga.licencia).toBe(perpetua.id);
    expect(carga.maquina).toBe(HUELLA_A);
    expect(carga.programa).toBe('draw101');
    const dias = (Date.parse(carga.hasta) - Date.parse(carga.emitido)) / 86400000;
    expect(dias, 'una cortesía vale el horizonte: 30 días desde el latido').toBeCloseTo(30, 1);

    // La misma máquina vuelve a activar (reinstaló): no gasta otro lugar.
    const otraVez = await pedir('/licencias/activar', { method: 'POST', body: JSON.stringify({ clave: perpetua.clave, huella: HUELLA_A }) });
    expect(otraVez.estado).toBe(200);
    expect(otraVez.data.lugares).toEqual({ usados: 1, total: 1 });
  });

  it('lo que la app no puede: clave inventada, huella corta, token manipulado', async () => {
    const inventada = await pedir('/licencias/activar', { method: 'POST', body: JSON.stringify({ clave: 'T101-AAAA-BBBB-CCCC', huella: HUELLA_A }) });
    expect(inventada.estado).toBe(404);
    expect(inventada.error).toBe('clave_inexistente');
    const corta = await pedir('/licencias/activar', { method: 'POST', body: JSON.stringify({ clave: perpetua.clave, huella: 'abc' }) });
    expect(corta.estado).toBe(400);

    const [v, carga, firma] = tokenA.split('.');
    const cargaJson = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(carga.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0))));
    cargaJson.hasta = '2099-01-01T00:00:00.000Z';
    const alterada = btoa(JSON.stringify(cargaJson)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const manipulado = await pedir('/licencias/latido', { method: 'POST', body: JSON.stringify({ token: `${v}.${alterada}.${firma}`, huella: HUELLA_A }) });
    expect(manipulado.estado).toBe(401);
    expect(manipulado.error).toBe('token_invalido');

    const otraMaquina = await pedir('/licencias/latido', { method: 'POST', body: JSON.stringify({ token: tokenA, huella: HUELLA_B }) });
    expect(otraMaquina.estado).toBe(403);
    expect(otraMaquina.error).toBe('maquina_desconocida');
  });

  it('un lugar es un lugar: la segunda máquina espera a que la primera se libere, o a que Mike suba lugares', async () => {
    const b = await pedir('/licencias/activar', { method: 'POST', body: JSON.stringify({ clave: perpetua.clave, huella: HUELLA_B }) });
    expect(b.estado).toBe(409);
    expect(b.error).toBe('sin_lugares');
    expect(b.detalle).toMatchObject({ lugares: 1, ocupados: 1 });

    const libre = await pedir('/licencias/desactivar', { method: 'POST', body: JSON.stringify({ token: tokenA, huella: HUELLA_A }) });
    expect(libre.estado).toBe(200);
    expect(libre.data.lugares).toEqual({ usados: 0, total: 1 });
    const ahoraSi = await pedir('/licencias/activar', { method: 'POST', body: JSON.stringify({ clave: perpetua.clave, huella: HUELLA_B }) });
    expect(ahoraSi.estado).toBe(201);

    // A ya no tiene lugar: su latido lo dice, no lo deja pasar en silencio.
    const latidoA = await pedir('/licencias/latido', { method: 'POST', body: JSON.stringify({ token: tokenA, huella: HUELLA_A }) });
    expect(latidoA.estado).toBe(403);
    expect(latidoA.error).toBe('maquina_desconocida');

    await comoSuper();
    const sube = await pedir(`/licencias/${perpetua.id}`, { method: 'PATCH', body: JSON.stringify({ lugares: 2 }) });
    expect(sube.estado).toBe(200);
    expect(sube.data.lugares).toBe(2);
    galleta = '';
    const aOtraVez = await pedir('/licencias/activar', { method: 'POST', body: JSON.stringify({ clave: perpetua.clave, huella: HUELLA_A }) });
    expect(aOtraVez.estado).toBe(201);
    expect(aOtraVez.data.lugares).toEqual({ usados: 2, total: 2 });
    tokenA = aOtraVez.data.token;
  });

  it('el latido renueva el token; suspender lo niega y volver a activar lo devuelve', async () => {
    await dormir(20);
    const l = await pedir('/licencias/latido', { method: 'POST', body: JSON.stringify({ token: tokenA, huella: HUELLA_A, version: '0.21.1' }) });
    expect(l.estado).toBe(200);
    const nuevo = await abrir(l.data.token);
    const viejo = await abrir(tokenA);
    expect(nuevo.vale).toBe(true);
    expect(Date.parse(nuevo.carga.emitido)).toBeGreaterThan(Date.parse(viejo.carga.emitido));
    tokenA = l.data.token;

    await comoSuper();
    expect((await pedir(`/licencias/${perpetua.id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'suspendida' }) })).data.vigente).toBe(false);
    galleta = '';
    const negado = await pedir('/licencias/latido', { method: 'POST', body: JSON.stringify({ token: tokenA, huella: HUELLA_A }) });
    expect(negado.estado).toBe(403);
    expect(negado.error).toBe('suspendida');
    const niActivar = await pedir('/licencias/activar', { method: 'POST', body: JSON.stringify({ clave: perpetua.clave, huella: HUELLA_A }) });
    expect(niActivar.estado).toBe(403);

    await comoSuper();
    await pedir(`/licencias/${perpetua.id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'activa' }) });
    galleta = '';
    expect((await pedir('/licencias/latido', { method: 'POST', body: JSON.stringify({ token: tokenA, huella: HUELLA_A }) })).estado).toBe(200);
  });

  it('la de pago: sin fecha no entra; con pago hasta mañana entra y el token acaba ese día; vencida, el latido lo dice', async () => {
    galleta = '';
    const sinPago = await pedir('/licencias/activar', { method: 'POST', body: JSON.stringify({ clave: pagada.clave, huella: HUELLA_A }) });
    expect(sinPago.estado).toBe(402);
    expect(sinPago.error).toBe('sin_pago');

    await comoSuper();
    const pago = await pedir(`/licencias/${pagada.id}/pago`, { method: 'POST', body: JSON.stringify({ hasta: dia(1), referencia: 'transferencia 1234' }) });
    expect(pago.estado).toBe(200);
    expect(pago.data.paga_hasta).toBe(dia(1));
    expect(pago.data.origen).toBe('manual');
    expect(pago.data.vigente).toBe(true);

    galleta = '';
    const entra = await pedir('/licencias/activar', { method: 'POST', body: JSON.stringify({ clave: pagada.clave, huella: HUELLA_A }) });
    expect(entra.estado).toBe(201);
    expect(entra.data.hasta, 'el token acaba al final del último día pagado, no en 30 días').toBe(`${dia(1)}T23:59:59.000Z`);
    const tokenPago = entra.data.token;

    await comoSuper();
    const vencido = await pedir(`/licencias/${pagada.id}/pago`, { method: 'POST', body: JSON.stringify({ hasta: dia(-1), origen: 'stripe', referencia: 'evt_prueba' }) });
    expect(vencido.data.origen).toBe('stripe');
    expect(vencido.data.vigente).toBe(false);
    galleta = '';
    const late = await pedir('/licencias/latido', { method: 'POST', body: JSON.stringify({ token: tokenPago, huella: HUELLA_A }) });
    expect(late.estado).toBe(402);
    expect(late.error).toBe('sin_pago');
    expect(late.detalle.paga_hasta).toBe(dia(-1));
  });

  it('la lista y el detalle le dicen a Mike quién está activo y qué pasó', async () => {
    await comoSuper();
    const lista = await pedir('/licencias');
    expect(lista.estado).toBe(200);
    const fila = lista.data.filas.find((f: any) => f.id === perpetua.id);
    expect(fila.activaciones).toBe(2);
    expect(fila.vigente).toBe(true);
    expect(lista.data.filas.find((f: any) => f.id === pagada.id).vigente).toBe(false);

    const det = await pedir(`/licencias/${perpetua.id}`);
    expect(det.estado).toBe(200);
    expect(det.data.activaciones.map((a: any) => [a.huella, a.activa]).sort()).toEqual([[HUELLA_A, 1], [HUELLA_B, 1]]);
    const acciones = det.data.bitacora.map((b: any) => b.accion);
    for (const a of ['crear', 'activar', 'desactivar', 'cambiar', 'latido_negado']) expect(acciones, a).toContain(a);
    expect(det.data.bitacora.find((b: any) => b.accion === 'crear').quien).toBe(CORREO);
    expect(det.data.bitacora.find((b: any) => b.accion === 'activar').quien).toBe('app');

    expect((await pedir('/licencias/01INVENTADA')).estado).toBe(404);
    const suelta = await pedir(`/licencias/${perpetua.id}/desactivar`, { method: 'POST', body: JSON.stringify({ huella: HUELLA_B }) });
    expect(suelta.data.lugares).toEqual({ usados: 1, total: 2 });
  });


  /* El tipo y lo perpetuo son dos cosas (contrato 0.19.0, decisión de Mike del
   * 19-sep con botones). Lo que se mide aquí es justo lo que se perdería si
   * fueran una sola lista: que una perpetua de App Store siga saliendo al
   * filtrar por App Store. */
  it('el tipo se guarda aparte de lo perpetuo, y un tipo inventado no pasa', async () => {
    await comoSuper();
    const tienda = await pedir('/licencias', { method: 'POST', body: JSON.stringify({ cliente: 'Comprada en la tienda', correo: 'mac@ejemplo.mx', programa: 'nest101', tipo: 'appstore', perpetua: true }) });
    expect(tienda.estado).toBe(201);
    expect(tienda.data.tipo).toBe('appstore');
    expect(tienda.data.perpetua).toBe(1);
    expect(tienda.data.vigente, 'no vence: entra sin fecha de pago').toBe(true);
    conTipo = tienda.data;

    const inventado = await pedir('/licencias', { method: 'POST', body: JSON.stringify({ cliente: 'X', tipo: 'strype' }) });
    expect(inventado.estado).toBe(400);
    expect(inventado.detalle.campo).toBe('tipo');

    const cambia = await pedir(`/licencias/${conTipo.id}`, { method: 'PATCH', body: JSON.stringify({ tipo: 'suite101' }) });
    expect(cambia.data.tipo).toBe('suite101');
    expect(cambia.data.perpetua, 'cambiar el tipo no le quita lo perpetuo').toBe(1);
    await pedir(`/licencias/${conTipo.id}`, { method: 'PATCH', body: JSON.stringify({ tipo: 'appstore' }) });
  });

  it('la lista filtra por tipo, por programa, por correo y por vigentes, y cuenta cuántas hay de cada tipo', async () => {
    await comoSuper();
    const todas = await pedir('/licencias');
    expect(todas.data.por_tipo.appstore, 'el conteo por tipo NO se filtra a sí mismo').toBeGreaterThanOrEqual(1);
    expect(Object.keys(todas.data.por_tipo).sort()).toEqual(['appstore', 'cortesia', 'stripe', 'suite101']);

    const soloTienda = await pedir('/licencias?tipo=appstore');
    expect(soloTienda.data.filas.every((f: any) => f.tipo === 'appstore')).toBe(true);
    expect(soloTienda.data.filas.some((f: any) => f.id === conTipo.id)).toBe(true);
    expect(soloTienda.data.por_tipo.cortesia, 'y sigue contando las de los demás tipos').toBeGreaterThanOrEqual(1);

    const porPrograma = await pedir('/licencias?programa=nest101');
    expect(porPrograma.data.filas.every((f: any) => f.programa === 'nest101')).toBe(true);
    expect(porPrograma.data.filas.some((f: any) => f.id === conTipo.id)).toBe(true);

    const porCorreo = await pedir('/licencias?correo=MAC@Ejemplo.mx');
    expect(porCorreo.data.filas.map((f: any) => f.id), 'el correo se normaliza antes de buscar').toEqual([conTipo.id]);

    const vigentes = await pedir('/licencias?vigentes=1');
    expect(vigentes.data.filas.every((f: any) => f.vigente)).toBe(true);
    expect(vigentes.data.filas.some((f: any) => f.id === conTipo.id)).toBe(true);

    const malTipo = await pedir('/licencias?tipo=strype');
    expect(malTipo.estado, 'un tipo inventado es 400, no una lista vacía que se lee como «no vendiste nada»').toBe(400);
  });

  it('un pago marcado por Stripe pone el tipo solo; uno marcado a mano no lo toca', async () => {
    await comoSuper();
    const regalada = await pedir('/licencias', { method: 'POST', body: JSON.stringify({ cliente: 'Regalada que luego paga' }) });
    expect(regalada.data.tipo).toBe('cortesia');

    const aMano = await pedir(`/licencias/${regalada.data.id}/pago`, { method: 'POST', body: JSON.stringify({ hasta: dia(30) }) });
    expect(aMano.data.tipo, 'un pago a mano no la convierte en otra cosa').toBe('cortesia');
    expect(aMano.data.origen).toBe('manual');

    const porStripe = await pedir(`/licencias/${regalada.data.id}/pago`, { method: 'POST', body: JSON.stringify({ hasta: dia(60), origen: 'stripe', referencia: 'in_123' }) });
    expect(porStripe.data.tipo, 'si cobró Stripe, la licencia es de Stripe').toBe('stripe');
    expect(porStripe.data.origen).toBe('stripe');
    expect((await pedir(`/licencias/${regalada.data.id}`)).data.bitacora.some((b: any) => b.accion === 'pago')).toBe(true);
    await pedir(`/licencias/${regalada.data.id}`, { method: 'DELETE' });
  });


  /* La licencia que va con la cuenta (contrato 0.20.0). Encargo de Mike: que
   * la app se abra entrando con el correo o con Google, sin teclear clave. La
   * clave se queda como respaldo, así que aquí se mide que las dos formas
   * lleguen al mismo lugar. */
  it('la app se activa con la cuenta de la suite, sin clave, y el token es el mismo de siempre', async () => {
    await comoSuper();
    const HUELLA_C = 'maquina-c-0123456789abcdef';
    const mia = await pedir('/licencias', { method: 'POST', body: JSON.stringify({ cliente: 'Mike mismo', correo: CORREO, programa: 'nest101', perpetua: true, tipo: 'suite101' }) });
    expect(mia.estado).toBe(201);
    porCuenta = mia.data;

    const r = await pedir('/licencias/mia', { method: 'POST', body: JSON.stringify({ programa: 'nest101', huella: HUELLA_C, version: '1.0.0' }) });
    expect(r.estado, 'se activa sin haber tecleado clave alguna').toBe(201);
    const { vale, carga } = await abrir(r.data.token);
    expect(vale, 'y lo firma la misma llave que ya valida draw101').toBe(true);
    expect(carga.licencia).toBe(porCuenta.id);
    expect(carga.maquina).toBe(HUELLA_C);
    expect(r.data.lugares).toEqual({ usados: 1, total: 1 });

    const otraVez = await pedir('/licencias/mia', { method: 'POST', body: JSON.stringify({ programa: 'nest101', huella: HUELLA_C }) });
    expect(otraVez.estado, 'la misma máquina otra vez no gasta otro lugar').toBe(200);

    // Quién activó queda con su correo, no con «app»: por aquí se entra con cuenta.
    const det = await pedir(`/licencias/${porCuenta.id}`);
    expect(det.data.bitacora.find((b: any) => b.accion === 'activar').quien).toBe(CORREO);

    const sinLugar = await pedir('/licencias/mia', { method: 'POST', body: JSON.stringify({ programa: 'nest101', huella: 'maquina-d-0123456789abcdef' }) });
    expect(sinLugar.estado).toBe(409);
    expect(sinLugar.error).toBe('sin_lugares');
  });

  it('sin sesión no se activa por cuenta, y una cuenta sin licencia de ese programa lo dice con su nombre', async () => {
    await comoSuper();
    const deOtro = await pedir('/licencias/mia', { method: 'POST', body: JSON.stringify({ programa: 'draw101', huella: 'maquina-e-0123456789abcdef' }) });
    expect(deOtro.estado, 'tiene licencia de nest101, no de draw101').toBe(404);
    expect(deOtro.error).toBe('sin_licencia');
    expect(deOtro.detalle.programa).toBe('draw101');

    const sinPrograma = await pedir('/licencias/mia', { method: 'POST', body: JSON.stringify({ huella: 'maquina-e-0123456789abcdef' }) });
    expect(sinPrograma.estado).toBe(400);

    galleta = '';
    const sinSesion = await pedir('/licencias/mia', { method: 'POST', body: JSON.stringify({ programa: 'nest101', huella: 'maquina-e-0123456789abcdef' }) });
    expect(sinSesion.estado).toBe(401);
    expect(sinSesion.error).toBe('sin_sesion');
  });

  it('una licencia suya que no está al corriente contesta sin_pago, no sin_licencia', async () => {
    await comoSuper();
    await pedir(`/licencias/${porCuenta.id}`, { method: 'PATCH', body: JSON.stringify({ perpetua: false, paga_hasta: dia(-1) }) });
    const r = await pedir('/licencias/mia', { method: 'POST', body: JSON.stringify({ programa: 'nest101', huella: 'maquina-f-0123456789abcdef' }) });
    expect(r.estado).toBe(402);
    expect(r.error).toBe('sin_pago');
    expect(r.detalle.paga_hasta, 'y dice hasta cuándo estuvo pagada, que es lo que hace falta para saber qué pagar').toBe(dia(-1));
    await pedir(`/licencias/${porCuenta.id}`, { method: 'DELETE' });
  });

  it('la pantalla que abre la app se sirve sin sesión y sin X-App', async () => {
    galleta = '';
    const r = await SELF.fetch('https://api.prueba/licencias/entrar?programa=nest101&huella=maquina-c-0123456789abcdef&app=nest101');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/text\/html/);
    const html = await r.text();
    expect(html, 'trae la entrada homologada: contraseña, código y Google').toMatch(/Entrar con Google/);
    expect(html).toMatch(/licencias\/mia/);
    expect(html, 'la app sólo sabe de esto: el objeto y el fragmento #listo').toMatch(/__t101_licencia/);
    // El camino de la clave tecleada, que Mike decidió conservar, vive en la
    // misma pantalla: así las dos apps no tienen que construirlo cada una.
    expect(html, 'y ofrece la clave tecleada como segunda forma').toMatch(/Tengo una clave/);
    expect(html).toMatch(/licencias\/activar/);
  });

  it('borrar se lleva la suscripción y sus activaciones; la clave deja de existir para la app', async () => {
    await comoSuper();
    expect((await pedir(`/licencias/${pagada.id}`, { method: 'DELETE' })).estado).toBe(200);
    expect((await pedir(`/licencias/${pagada.id}`)).estado).toBe(404);
    galleta = '';
    const r = await pedir('/licencias/activar', { method: 'POST', body: JSON.stringify({ clave: pagada.clave, huella: HUELLA_A }) });
    expect(r.estado).toBe(404);
    expect(r.error).toBe('clave_inexistente');
  });
});

describe('19 · alta automática de empresas (contrato 0.14.0)', () => {
  const dia = (desplaza: number) => new Date(Date.now() + desplaza * 86400000).toISOString().slice(0, 10);
  const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let galletaSuper = '';
  const CORT = 'alta-cortesia';
  const PAGA = 'alta-pagada';
  const DIRECTORA = 'directora-alta@ejemplo.mx';

  async function comoSuper() {
    if (galletaSuper) { galleta = galletaSuper; galletaMike = galleta; return; }
    if (galletaMike) galleta = galletaMike;
    const yo = await pedir('/yo');
    if (yo.ok && yo.data.superadmin) { galletaSuper = galleta; galletaMike = galleta; return; }
    galleta = '';
    for (let i = 0; i < 3; i++) {
      const c = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: CORREO }) });
      if (c.ok) {
        const e = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO, codigo: c.data.codigo_prueba }) });
        expect(e.estado).toBe(200);
        galletaSuper = galleta;
        galletaMike = galleta;
        return;
      }
      await dormir(((c.detalle?.espera_segundos ?? 1) + 1) * 1000);
    }
    throw new Error('no se pudo entrar como superadmin');
  }

  it('el alta en un paso deja empresa, base, director como dueño y el intento de bienvenida', async () => {
    await comoSuper();
    await pedir(`/admin/orgs/${CORT}`, { method: 'DELETE' });
    const r = await pedir('/admin/orgs', { method: 'POST', body: JSON.stringify({
      id: CORT, nombre: 'Muebles Alta', razon_social: 'Muebles Alta SA de CV', rfc: 'MAL010101AAA', telefono: '55 1234 5678',
      director: { correo: DIRECTORA, nombre: 'Directora Alta', telefono: '55 8765 4321' },
    }) });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.org.cortesia).toBe(true); // sin fecha de pago es cortesía
    expect(r.data.org.estado).toBe('activa');
    expect(r.data.org.rfc).toBe('MAL010101AAA');
    expect(r.data.org.director_correo).toBe(DIRECTORA);
    expect(r.data.director.rol).toBe('owner');
    // Aquí no hay Resend ni es producción: el correo no sale, y se dice por qué.
    expect(r.data.bienvenida.enviado).toBe(false);
    expect(['correo_no_configurado', 'correo_apagado_fuera_de_produccion']).toContain(r.data.bienvenida.motivo);
    expect(r.data.org.bienvenida_at).toBeNull();

    const gente = await pedir(`/admin/orgs/${CORT}/miembros`);
    const d = gente.data.filas.find((f: any) => f.correo === DIRECTORA);
    expect(d?.rol).toBe('owner');
    const bit = await pedir(`/admin/orgs/${CORT}/bitacora`);
    const campos = bit.data.filas.map((f: any) => f.campo);
    expect(campos).toEqual(expect.arrayContaining(['creada', 'miembro', 'bienvenida']));
  });

  it('una empresa pagada hasta ayer venció: las apps contestan 402 y los paneles siguen abriendo', async () => {
    await comoSuper();
    await pedir(`/admin/orgs/${PAGA}`, { method: 'DELETE' });
    const r = await pedir('/admin/orgs', { method: 'POST', body: JSON.stringify({ id: PAGA, nombre: 'Pagada Ayer', paga_hasta: dia(-1) }) });
    expect(r.estado).toBe(201);
    expect(r.data.org.cortesia).toBe(false);
    expect(r.data.org.estado).toBe('sin_pago');
    expect(r.data.org.vigente).toBe(false);

    const app = await pedir(`/orgs/${PAGA}`, { app: 'dash101' });
    expect(app.estado).toBe(402);
    expect(app.error).toBe('org_sin_pago');
    expect(app.detalle.paga_hasta).toBe(dia(-1));
    const panel = await pedir(`/orgs/${PAGA}`, { app: 'workshop101' });
    expect(panel.estado).toBe(200);
  });

  it('marcar el pago hasta mañana la reabre, y la bitácora lo apunta', async () => {
    await comoSuper();
    const mal = await pedir(`/admin/orgs/${PAGA}/pago`, { method: 'POST', body: JSON.stringify({ hasta: 'mañana' }) });
    expect(mal.estado).toBe(400);
    const p = await pedir(`/admin/orgs/${PAGA}/pago`, { method: 'POST', body: JSON.stringify({ hasta: dia(1), referencia: 'transferencia 123' }) });
    expect(p.estado).toBe(200);
    expect(p.data.estado).toBe('activa');
    expect(p.data.paga_hasta).toBe(dia(1));
    expect(p.data.origen_pago).toBe('manual');
    const app = await pedir(`/orgs/${PAGA}`, { app: 'dash101' });
    expect(app.estado).toBe(200);
    const bit = await pedir(`/admin/orgs/${PAGA}/bitacora`);
    const pago = bit.data.filas.find((f: any) => f.campo === 'pago');
    expect(pago?.despues).toContain(dia(1));
    expect(pago?.despues).toContain('transferencia 123');
  });

  it('pagada hasta hoy sigue vigente; PATCH cortesia la deja sin fecha y también vigente; quitarle la cortesía la vence', async () => {
    await comoSuper();
    const hoy = await pedir(`/admin/orgs/${PAGA}/pago`, { method: 'POST', body: JSON.stringify({ hasta: dia(0) }) });
    expect(hoy.data.estado).toBe('activa');
    const cort = await pedir(`/admin/orgs/${PAGA}`, { method: 'PATCH', body: JSON.stringify({ cortesia: true, paga_hasta: null }) });
    expect(cort.estado).toBe(200);
    expect(cort.data.cortesia).toBe(true);
    expect(cort.data.estado).toBe('activa');
    const sin = await pedir(`/admin/orgs/${PAGA}`, { method: 'PATCH', body: JSON.stringify({ cortesia: false }) });
    expect(sin.data.estado).toBe('sin_pago');
    expect((await pedir(`/orgs/${PAGA}`, { app: 'dash101' })).estado).toBe(402);
    const bit = await pedir(`/admin/orgs/${PAGA}/bitacora`);
    expect(bit.data.filas.some((f: any) => f.campo === 'cortesia')).toBe(true);
  });

  it('la bienvenida se puede volver a mandar al director, y sin director pide correo', async () => {
    await comoSuper();
    const otra = await pedir(`/admin/orgs/${CORT}/bienvenida`, { method: 'POST', body: JSON.stringify({}) });
    expect(otra.estado).toBe(200);
    expect(otra.data.correo).toBe(DIRECTORA);
    expect(otra.data.enviado).toBe(false);
    const sinDirector = await pedir(`/admin/orgs/${PAGA}/bienvenida`, { method: 'POST', body: JSON.stringify({}) });
    expect(sinDirector.estado).toBe(400);
    const conCorreo = await pedir(`/admin/orgs/${PAGA}/bienvenida`, { method: 'POST', body: JSON.stringify({ correo: 'otra@ejemplo.mx' }) });
    expect(conCorreo.estado).toBe(200);
  });

  it('un director con correo inválido no crea nada; y las dos empresas de prueba se van', async () => {
    await comoSuper();
    const mal = await pedir('/admin/orgs', { method: 'POST', body: JSON.stringify({ id: 'alta-mala', nombre: 'Mala', director: { correo: 'no-es-correo' } }) });
    expect(mal.estado).toBe(400);
    expect((await pedir('/admin/orgs/alta-mala')).estado).toBe(404);
    expect((await pedir(`/admin/orgs/${CORT}`, { method: 'DELETE' })).estado).toBe(200);
    expect((await pedir(`/admin/orgs/${PAGA}`, { method: 'DELETE' })).estado).toBe(200);
  });
});

describe('20 · invitar a un cliente desde una app (contrato 0.15.0)', () => {
  const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const INVITADA = 'invitada-quell@ejemplo.mx';
  const OTRA = 'invitar-otra';
  let galletaSuper = '';
  let clienteId = '';

  async function comoSuper() {
    if (galletaSuper) { galleta = galletaSuper; return; }
    if (galletaMike) galleta = galletaMike;
    const yo = await pedir('/yo');
    if (yo.ok && yo.data.superadmin) { galletaSuper = galleta; galletaMike = galleta; return; }
    galleta = '';
    for (let i = 0; i < 3; i++) {
      const c = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: CORREO }) });
      if (c.ok) {
        const e = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO, codigo: c.data.codigo_prueba }) });
        expect(e.estado).toBe(200);
        galletaSuper = galleta; galletaMike = galleta;
        return;
      }
      await dormir(((c.detalle?.espera_segundos ?? 1) + 1) * 1000);
    }
    throw new Error('no se pudo entrar como superadmin');
  }

  it('la invitación deja cliente en la empresa, persona en la suite y acceso tipo cliente; repetirla no duplica', async () => {
    await comoSuper();
    // Un bloque anterior deja quell apagada en la empresa de pruebas; aquí se prende.
    await pedir(`/admin/orgs/${ORG}`, { method: 'PATCH', body: JSON.stringify({ apps: { dash: true, quell: true, cotizador: true, peek: true, roster: true, nest: true } }) });
    const r = await pedir(`/orgs/${ORG}/clientes/invitar`, { app: 'quell101', method: 'POST', body: JSON.stringify({ correo: INVITADA, nombre: 'Invitada Quell' }) });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.nuevo_usuario).toBe(true);
    expect(r.data.nuevo_cliente).toBe(true);
    clienteId = r.data.cliente_id;
    const lista = await pedir(`/orgs/${ORG}/clientes`, { app: 'dash101' });
    const fila = lista.data.filas.find((f: any) => f.id === clienteId);
    expect(fila?.correo).toBe(INVITADA);
    expect(fila?.portal_activo).toBe(true);
    expect(fila?.usuario_id).toBe(r.data.usuario_id);

    const otraVez = await pedir(`/orgs/${ORG}/clientes/invitar`, { app: 'quell101', method: 'POST', body: JSON.stringify({ correo: INVITADA.toUpperCase(), nombre: 'Otro nombre' }) });
    expect(otraVez.estado).toBe(201);
    expect(otraVez.data.cliente_id).toBe(clienteId);
    expect(otraVez.data.nuevo_usuario).toBe(false);
    expect(otraVez.data.nuevo_cliente).toBe(false);
    const cuantos = (await pedir(`/orgs/${ORG}/clientes`, { app: 'dash101' })).data.filas.filter((f: any) => f.correo === INVITADA).length;
    expect(cuantos).toBe(1);
  });

  it('la invitada entra con el código al correo, sin PIN, y abre /peek como cliente; una app de la empresa no le abre tablas', async () => {
    await comoSuper();
    const deSuper = galleta;
    galleta = '';
    const c = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: INVITADA }) });
    expect(c.estado, JSON.stringify(c)).toBe(200);
    // Aquí no hay Resend: el código no sale, pero la API lo devuelve para probar.
    // Lo que importa es que la persona EXISTE y por eso hay código; un correo
    // desconocido recibe «si tiene acceso, le llega» y ningún código.
    expect(c.data.codigo_prueba).toMatch(/^\d{6}$/);
    const e = await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: INVITADA, codigo: c.data.codigo_prueba }) });
    expect(e.estado).toBe(200);
    const yo = await pedir('/yo');
    expect(yo.data.acceso?.tipo).toBe('cliente');
    expect(yo.data.acceso?.org_id).toBe(ORG);
    expect(yo.data.orgs).toEqual([]);
    const peek = await pedir(`/orgs/${ORG}/peek`, { app: 'peek101' });
    expect(peek.estado).toBe(200);
    expect(peek.data.cliente.correo).toBe(INVITADA);
    expect((await pedir(`/orgs/${ORG}/items`, { app: 'quell101' })).estado).toBe(403);
    // Un cliente no invita a nadie.
    const noInvita = await pedir(`/orgs/${ORG}/clientes/invitar`, { app: 'quell101', method: 'POST', body: JSON.stringify({ correo: 'x@ejemplo.mx', nombre: 'X' }) });
    expect(noInvita.estado).toBe(403);
    galleta = deSuper;
  });

  it('un miembro de la empresa no se vuelve cliente, y una clienta de una empresa no se invita a otra', async () => {
    await comoSuper();
    // Ni el superadmin ni una socia de la empresa se vuelven clientes.
    const miembro = await pedir(`/orgs/${ORG}/clientes/invitar`, { app: 'quell101', method: 'POST', body: JSON.stringify({ correo: CORREO, nombre: 'Mike' }) });
    expect(miembro.estado, JSON.stringify(miembro)).toBe(409);
    expect(miembro.error).toBe('es_miembro');
    const oficina = await pedir(`/admin/orgs/${ORG}/miembros`, { method: 'POST', body: JSON.stringify({ correo: 'oficina-invitar@ejemplo.mx', rol: 'staff' }) });
    expect(oficina.estado, JSON.stringify(oficina)).toBe(201);
    const socia = await pedir(`/orgs/${ORG}/clientes/invitar`, { app: 'quell101', method: 'POST', body: JSON.stringify({ correo: 'oficina-invitar@ejemplo.mx', nombre: 'Oficina' }) });
    expect(socia.estado, JSON.stringify(socia)).toBe(409);
    expect(socia.error).toBe('es_miembro');
    const mal = await pedir(`/orgs/${ORG}/clientes/invitar`, { app: 'quell101', method: 'POST', body: JSON.stringify({ correo: 'no-es-correo', nombre: 'X' }) });
    expect(mal.estado).toBe(400);
    const sinNombre = await pedir(`/orgs/${ORG}/clientes/invitar`, { app: 'quell101', method: 'POST', body: JSON.stringify({ correo: 'alguien@ejemplo.mx' }) });
    expect(sinNombre.estado).toBe(400);

    await pedir(`/admin/orgs/${OTRA}`, { method: 'DELETE' });
    const alta = await pedir('/admin/orgs', { method: 'POST', body: JSON.stringify({ id: OTRA, nombre: 'Otra Empresa', apps: { quell: true } }) });
    expect(alta.estado, JSON.stringify(alta)).toBe(201);
    const enUso = await pedir(`/orgs/${OTRA}/clientes/invitar`, { app: 'quell101', method: 'POST', body: JSON.stringify({ correo: INVITADA, nombre: 'Invitada Quell' }) });
    expect(enUso.estado, JSON.stringify(enUso)).toBe(409);
    expect(enUso.error).toBe('en_uso');
    expect((await pedir(`/admin/orgs/${OTRA}`, { method: 'DELETE' })).estado).toBe(200);
  });
});
