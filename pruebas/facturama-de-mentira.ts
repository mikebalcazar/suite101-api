/* Un Facturama de mentira para probar el timbrado sin Facturama.
 *
 * Hace lo que hace el de verdad con lo que se le manda, hasta donde se sabe:
 *   · pide HTTP Basic y sólo acepta la cuenta que se le configuró (401);
 *   · revisa el cuerpo de POST /3/cfdis como lo hace Facturama: campos que
 *     faltan y cuentas que no cuadran contestan 400 con `Message` y
 *     `ModelState` (campo → motivos);
 *   · timbra: inventa el folio fiscal y arma un XML 4.0 con lo que se le
 *     pidió, que es lo que luego bill101 lee y guarda;
 *   · entrega el XML y un PDF (de mentira) en base64 por GET /cfdi/{f}/issued/{id};
 *   · cancela por DELETE /cfdi/{id}?motive=..: `canceled` o, si se le dice,
 *     `pending`; y contesta el perfil fiscal por GET /TaxEntity.
 *
 * Es sólo JavaScript: `responder(url, cabeceras, cuerpo)` → `{ status, body }`.
 * La prueba de la API lo envuelve en un `fetch`; bill101 tiene su copia en
 * .mjs como servidor (pruebas/facturama-falso.mjs).
 */
import { RFC_EMPRESA, xmlCfdi } from './cfdi-de-prueba';

export interface EstadoFacturama {
  usuario: string;
  clave: string;
  /** El perfil fiscal que contesta GET /TaxEntity. */
  perfil: { Rfc: string; TaxName: string; FiscalRegime: string; TaxAddress: { ZipCode: string }; Csd: { Certificate: string | null } };
  /** Lo que llegó, en orden. */
  llamadas: Record<string, unknown>[];
  /** Las sucursales y sus series, como las tiene Facturama. */
  sucursales: { Id: string; Name: string; IsDefault: boolean; Address: { ZipCode: string }; series: { Name: string; Folio: number }[] }[];
  /** Lo timbrado, por id de Facturama. */
  cfdis: Map<string, { uuid: string; xml: string; cuerpo: Record<string, any>; estado: 'active' | 'canceled' | 'pending' }>;
  /** Para simular: 'caido' (503), 'mudo' (lanza), 'cancelacion_pendiente',
   *  'timbra_y_calla' (timbra de verdad y luego contesta 503: el caso que
   *  deja una emisión sin saber). */
  modo: 'bien' | 'caido' | 'mudo' | 'cancelacion_pendiente' | 'timbra_y_calla' | 'calla_al_timbrar';
  n: number;
}

const b64 = (s: string): string => btoa(unescape(encodeURIComponent(s)));
const uuidDe = (n: number): string => `F${String(n).padStart(7, '0')}-AAAA-4BBB-8CCC-${String(n).padStart(12, '0')}`.toUpperCase();

export function crearFacturama(usuario: string, clave: string): { responder(url: string, cabeceras: Record<string, string>, cuerpo?: string): Promise<{ status: number; body: string }>; st: EstadoFacturama } {
  const st: EstadoFacturama = {
    usuario, clave,
    perfil: { Rfc: RFC_EMPRESA, TaxName: 'ESCUELA KEMPER URGATE', FiscalRegime: '601', TaxAddress: { ZipCode: '64000' }, Csd: { Certificate: 'MIIF…' } },
    sucursales: [{ Id: 'suc-1', Name: 'Matriz', IsDefault: true, Address: { ZipCode: '64000' }, series: [] }],
    llamadas: [], cfdis: new Map(), modo: 'bien', n: 0,
  };
  const json = (status: number, o: unknown) => ({ status, body: JSON.stringify(o) });
  const malo = (Message: string, ModelState: Record<string, string[]> = {}) => json(400, { Message, ModelState });

  async function responder(url: string, cabeceras: Record<string, string>, cuerpo?: string): Promise<{ status: number; body: string }> {
    const u = new URL(url);
    const h = Object.fromEntries(Object.entries(cabeceras || {}).map(([k, v]) => [k.toLowerCase(), v]));
    if (st.modo === 'mudo') throw new Error('sin red');
    if (st.modo === 'caido') return { status: 503, body: '<html>Service Unavailable</html>' };
    const auth = h.authorization || '';
    const esperado = `Basic ${btoa(`${st.usuario}:${st.clave}`)}`;
    if (auth !== esperado) { st.llamadas.push({ paso: 'sin_permiso', ruta: u.pathname }); return json(401, { Message: 'Authorization has been denied for this request.' }); }
    const metodo = (h['x-metodo'] || '').toUpperCase();

    if (u.pathname === '/TaxEntity') { st.llamadas.push({ paso: 'perfil' }); return json(200, st.perfil); }
    if (u.pathname === '/BranchOffice') { st.llamadas.push({ paso: 'sucursales' }); return json(200, st.sucursales.map(({ series: _s, ...x }) => x)); }
    const ms = /^\/serie\/([^/]+)$/.exec(u.pathname);
    if (ms) {
      const suc = st.sucursales.find((x) => x.Id === decodeURIComponent(ms[1]));
      if (!suc) return json(404, { Message: 'Sucursal no encontrada.' });
      if (metodo === 'POST') {
        let b: Record<string, any>; try { b = JSON.parse(cuerpo || ''); } catch { return malo('The request is invalid.'); }
        st.llamadas.push({ paso: 'crear_serie', serie: b.Name, folio: b.Folio });
        if (!/^[a-zA-Z0-9]{1,10}$/.test(String(b.Name ?? ''))) return malo('The request is invalid.', { 'serie.Name': ['La serie debe cumplir [a-zA-Z0-9]+'] });
        if (suc.series.some((x) => x.Name === b.Name)) return malo('La serie ya existe.');
        suc.series.push({ Name: String(b.Name), Folio: Number(b.Folio ?? 1) });
        return json(201, { Name: b.Name, Folio: b.Folio ?? 1, Description: b.Description ?? '' });
      }
      st.llamadas.push({ paso: 'series' });
      return json(200, suc.series.map((x) => ({ Name: x.Name, Folio: x.Folio, Description: '' })));
    }

    if (u.pathname === '/3/cfdis') {
      let b: Record<string, any>;
      try { b = JSON.parse(cuerpo || ''); } catch { return malo('The request is invalid.'); }
      st.llamadas.push({ paso: 'timbrar', cuerpo: b });
      // Se cae justo al timbrar (lo demás contesta): no se sabe si timbró, y no timbró.
      if (st.modo === 'calla_al_timbrar') return { status: 503, body: '<html>Gateway Time-out</html>' };
      const ms: Record<string, string[]> = {};
      const falta = (k: string, v: unknown, que = 'El campo es requerido.') => { if (v === undefined || v === null || v === '') ms[`cfdiToCreate.${k}`] = [que]; };
      falta('Receiver.Rfc', b.Receiver?.Rfc); falta('Receiver.Name', b.Receiver?.Name); falta('Receiver.CfdiUse', b.Receiver?.CfdiUse);
      falta('Receiver.FiscalRegime', b.Receiver?.FiscalRegime); falta('Receiver.TaxZipCode', b.Receiver?.TaxZipCode);
      falta('ExpeditionPlace', b.ExpeditionPlace); falta('PaymentForm', b.PaymentForm); falta('PaymentMethod', b.PaymentMethod); falta('CfdiType', b.CfdiType);
      if (!Array.isArray(b.Items) || !b.Items.length) ms['cfdiToCreate.Items'] = ['Debe incluir al menos un concepto.'];
      if (!st.perfil.Csd.Certificate) return malo('No se ha cargado el certificado de sello digital (CSD).');
      // Lo que dijo el de verdad el 9-oct: la serie tiene que existir en la sucursal.
      if (b.Serie && !st.sucursales.some((s) => s.series.some((x) => x.Name === b.Serie))) return malo("El atributo 'Serie' debe existir en la sucursal");
      if (!st.sucursales.some((s) => s.Address.ZipCode === String(b.ExpeditionPlace))) return malo("El atributo 'ExpeditionPlace' debe existir como código postal en alguno de los Lugares de expedición en tu Perfil Fiscal");
      if (b.Receiver?.Rfc === 'XAXX010101000' && b.Receiver?.CfdiUse !== 'S01') ms['cfdiToCreate.Receiver.CfdiUse'] = ['Para el RFC genérico el uso debe ser S01.'];
      if (b.Receiver?.Rfc === 'XAXX010101000' && !(b.GlobalInformation && /^0[1-5]$/.test(String(b.GlobalInformation.Periodicity)) && /^(0[1-9]|1[0-8])$/.test(String(b.GlobalInformation.Months)) && /^\d{4}$/.test(String(b.GlobalInformation.Year)))) return malo("El Nodo (GlobalInformation) debe existir cuando el atributo Rfc del nodo receptor contiene el valor 'XAXX010101000' y el valor del atributo Nombre del nodo Receptor contiene el valor 'PUBLICO EN GENERAL'");
      let subtotal = 0, descuento = 0, impuestos = 0;
      (b.Items || []).forEach((it: any, i: number) => {
        const k = `cfdiToCreate.Items[${i}]`;
        if (!/^\d{8}$/.test(String(it.ProductCode))) ms[`${k}.ProductCode`] = ['La clave de producto no existe en el catálogo.'];
        if (!it.UnitCode) ms[`${k}.UnitCode`] = ['El campo es requerido.'];
        const sub = Math.round(Number(it.Quantity) * Number(it.UnitPrice) * 100) / 100;
        if (Math.abs(sub - Number(it.Subtotal)) > 0.01) ms[`${k}.Subtotal`] = [`El subtotal no corresponde: ${sub}`];
        const base = Number(it.Subtotal) - Number(it.Discount || 0);
        let iva = 0;
        for (const t of it.Taxes || []) {
          if (Math.abs(Number(t.Base) - base) > 0.01) ms[`${k}.Taxes`] = ['La base del impuesto no corresponde.'];
          if (Math.abs(Math.round(Number(t.Base) * Number(t.Rate) * 100) / 100 - Number(t.Total)) > 0.01) ms[`${k}.Taxes`] = ['El importe del impuesto no corresponde.'];
          iva += Number(t.Total);
        }
        if (it.TaxObject === '02' && !(it.Taxes || []).length) ms[`${k}.Taxes`] = ['Objeto de impuesto 02 requiere impuestos.'];
        if (Math.abs(base + iva - Number(it.Total)) > 0.01) ms[`${k}.Total`] = ['El total del concepto no corresponde.'];
        subtotal += Number(it.Subtotal); descuento += Number(it.Discount || 0); impuestos += iva;
      });
      if (Object.keys(ms).length) return malo('The request is invalid.', ms);
      if (b.Receiver?.Rfc === 'XXX010101XXX') return malo('El RFC del receptor no está en la lista de RFC inscritos no cancelados del SAT.');
      const n = ++st.n;
      const id = `fac-${String(n).padStart(6, '0')}`;
      const uuid = uuidDe(n);
      const fecha = String(b.Date || '').slice(0, 10) || '2026-10-09';
      const xml = xmlCfdi({
        uuid, emisor: { rfc: st.perfil.Rfc, nombre: st.perfil.TaxName }, receptor: { rfc: b.Receiver.Rfc, nombre: b.Receiver.Name },
        fecha, serie: b.Serie, folio: b.Folio, subtotal: subtotal.toFixed(2), descuento: descuento.toFixed(2), iva: impuestos.toFixed(2),
        total: (subtotal - descuento + impuestos).toFixed(2), forma: b.PaymentForm, metodo: 'PUE',
        conceptos: (b.Items as any[]).map((it) => ({ descripcion: String(it.Description), cantidad: String(it.Quantity), valor: Number(it.UnitPrice).toFixed(2), iva: (it.Taxes || []).reduce((s: number, t: any) => s + Number(t.Total), 0).toFixed(2) })),
      });
      st.cfdis.set(id, { uuid, xml, cuerpo: b, estado: 'active' });
      if (st.modo === 'timbra_y_calla') return { status: 503, body: '<html>Gateway Time-out</html>' };
      return json(201, {
        Id: id, CfdiType: 'ingreso', Type: 'I - ingreso', Serie: b.Serie ?? null, Folio: b.Folio, Date: `${fecha}T10:00:00`,
        PaymentTerms: `${b.PaymentForm} - …`, PaymentMethod: 'PUE - Pago en una sola exhibición', ExpeditionPlace: b.ExpeditionPlace, Currency: 'MXN - Peso Mexicano',
        Subtotal: subtotal, Discount: descuento, Total: subtotal - descuento + impuestos,
        Issuer: { Rfc: st.perfil.Rfc, TaxName: st.perfil.TaxName, FiscalRegime: '601 - General de Ley Personas Morales' },
        Receiver: { Rfc: b.Receiver.Rfc, Name: b.Receiver.Name },
        Complement: { TaxStamp: { Uuid: uuid.toLowerCase(), Date: `${fecha}T10:00:01`, SatCertNumber: '30001000000500003456', RfcProvCertif: 'SPR190613I52' } },
        Status: 'active',
      });
    }

    if (u.pathname === '/cfdi' && u.searchParams.get('type') === 'issued') {
      const k = u.searchParams.get('keyword') || '';
      st.llamadas.push({ paso: 'buscar', keyword: k });
      const lista = [...st.cfdis.entries()].filter(([, c]) => String(c.cuerpo.Folio).includes(k) || String(c.cuerpo.Serie ?? '').includes(k))
        .map(([id, c]) => ({ Id: id, Serie: c.cuerpo.Serie ?? null, Folio: String(c.cuerpo.Folio), Uuid: c.uuid.toLowerCase(), Status: c.estado, Total: 0 }));
      return json(200, lista);
    }

    let m = /^\/cfdi\/(xml|pdf|html)\/issued\/([^/]+)$/.exec(u.pathname);
    if (m) {
      const c = st.cfdis.get(decodeURIComponent(m[2]));
      st.llamadas.push({ paso: `bajar_${m[1]}`, id: m[2] });
      if (!c) return json(404, { Message: 'No se encontró el CFDI.' });
      const contenido = m[1] === 'xml' ? c.xml : `%PDF-1.4 de mentira ${c.uuid}`;
      return json(200, { ContentEncoding: 'base64', ContentType: m[1], ContentLength: contenido.length, Content: b64(contenido) });
    }

    m = /^\/cfdi\/([^/]+)$/.exec(u.pathname);
    if (m && (metodo === 'DELETE' || u.searchParams.has('motive'))) {
      const c = st.cfdis.get(decodeURIComponent(m[1]));
      const motive = u.searchParams.get('motive');
      st.llamadas.push({ paso: 'cancelar', id: m[1], motive, uuidReplacement: u.searchParams.get('uuidReplacement'), type: u.searchParams.get('type') });
      if (!c) return json(404, { Message: 'No se encontró el CFDI.' });
      if (!['01', '02', '03', '04'].includes(motive || '')) return malo('Motivo de cancelación inválido.');
      if (motive === '01' && !u.searchParams.get('uuidReplacement')) return malo('Con el motivo 01 se requiere el UUID que sustituye.');
      if (c.estado === 'canceled') return malo('El CFDI ya está cancelado.');
      if (st.modo === 'cancelacion_pendiente') {
        c.estado = 'pending';
        return json(200, { Status: 'pending', Message: 'En espera de aceptación del receptor', IsCancelable: 'Cancelable con aceptación', Uuid: c.uuid, RequestDate: '2026-10-09T10:00:00', ExpirationDate: '2026-10-12T10:00:00', AcuseStatus: '201', AcuseStatusDetails: 'Solicitud de cancelación recibida.' });
      }
      c.estado = 'canceled';
      return json(200, { Status: 'canceled', Message: 'Cancelado', IsCancelable: 'Cancelable sin aceptación', Uuid: c.uuid, RequestDate: '2026-10-09T10:00:00', CancelationDate: '2026-10-09T10:00:05', AcuseXmlBase64: b64(`<Acuse Uuid="${c.uuid}" Estatus="201"/>`), AcuseStatus: '201', AcuseStatusDetails: 'Solicitud de cancelación recibida.' });
    }
    return json(404, { Message: 'No HTTP resource was found that matches the request URI.' });
  }
  return { responder, st };
}
