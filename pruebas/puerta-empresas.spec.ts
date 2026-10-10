/* La puerta de las empresas: a dónde va cada host · 2-oct-2026
 *
 * Es la regla de puerta/destino.ts, medida sin red: lo nuestro pasa tal cual,
 * un dominio de empresa va a la app que dice su primera palabra, y lo demás
 * es una página que dice que no es de nadie. Si esta regla se equivoca, o
 * bien la suite entera deja de servirse (si tocara lo propio) o una empresa
 * abre la app equivocada.
 */
import { describe, expect, it } from 'vitest';
import { BINDINGS, cabecerasDeEmpresa, destinoDe, esValidacionDeCertificado, paginaDeNadie } from '../puerta/destino';
import { APPS_DOMINIO, PREFIJO } from '../src/dominios';

describe('lo nuestro pasa tal cual', () => {
  it('taller101.com y cualquier subdominio son propios', () => {
    for (const h of ['taller101.com', 'api.taller101.com', 'dash101.taller101.com', 'suite101.taller101.com', 'wall101.taller101.com', 'API.Taller101.com:443']) {
      expect(destinoDe(h), h).toEqual({ tipo: 'propio' });
    }
  });
});

describe('un dominio de empresa va a su app', () => {
  it('cada app con puerta tiene su binding, con los mismos nombres que la API (sin «101», salvo suite101)', () => {
    expect(Object.keys(BINDINGS).sort()).toEqual(APPS_DOMINIO.map((a) => PREFIJO[a]).sort());
    expect(BINDINGS.master101).toBeUndefined();
    expect(BINDINGS.master).toBeUndefined();
  });
  it('10-oct · todas las apps: cost, patron y bill también', () => {
    expect(destinoDe('cost.acme.com')).toMatchObject({ tipo: 'empresa', binding: 'COST', dominio: 'acme.com' });
    expect(destinoDe('patron.acme.com')).toMatchObject({ tipo: 'empresa', binding: 'PATRON' });
    expect(destinoDe('bill.acme.com')).toMatchObject({ tipo: 'empresa', binding: 'BILL' });
    expect(destinoDe('quell101.acme.com'), 'con el 101 ya no').toMatchObject({ tipo: 'nadie', motivo: 'sin_app' });
  });
  it('lo que Cloudflare usa para el certificado pasa tal cual', () => {
    expect(esValidacionDeCertificado('/.well-known/acme-challenge/abc')).toBe(true);
    expect(esValidacionDeCertificado('/.well-known/pki-validation/x.txt')).toBe(true);
    expect(esValidacionDeCertificado('/.well-known/assetlinks.json')).toBe(false);
    expect(esValidacionDeCertificado('/')).toBe(false);
  });
  it('roster.acme.com → ROSTER, con acme.com como dominio', () => {
    expect(destinoDe('roster.acme.com')).toEqual({ tipo: 'empresa', app: 'roster', binding: 'ROSTER', dominio: 'acme.com', host: 'roster.acme.com' });
    expect(destinoDe('Suite101.Muebles-Ramirez.com.mx')).toMatchObject({ tipo: 'empresa', binding: 'API', dominio: 'muebles-ramirez.com.mx' });
  });
  it('master101, www o un host pelón no son de nadie', () => {
    expect(destinoDe('master101.acme.com')).toMatchObject({ tipo: 'nadie', motivo: 'sin_app' });
    expect(destinoDe('www.acme.com')).toMatchObject({ tipo: 'nadie', motivo: 'sin_app' });
    expect(destinoDe('acme')).toMatchObject({ tipo: 'nadie', motivo: 'sin_dominio' });
    expect(destinoDe('')).toMatchObject({ tipo: 'nadie' });
  });
});

describe('lo que viaja con la petición', () => {
  it('las tres cabeceras, sin perder las que venían', () => {
    const h = cabecerasDeEmpresa(new Headers({ Cookie: 's101=abc', 'X-Dominio-Empresa': 'mentira.com' }), { dominio: 'acme.com', host: 'dash.acme.com', org_id: 'acme' });
    expect(h.get('Cookie')).toBe('s101=abc');
    expect(h.get('X-Dominio-Empresa'), 'la que venía de afuera se pisa: la decide la puerta').toBe('acme.com');
    expect(h.get('X-Host-Original')).toBe('dash.acme.com');
    expect(h.get('X-Org-Empresa')).toBe('acme');
  });
  it('la página de nadie no inventa una empresa y escapa el host', () => {
    const p = paginaDeNadie('master101.<b>x</b>.com', 'sin_app');
    expect(p).toContain('no corresponde a ningún programa');
    expect(p).toContain('&lt;b&gt;');
    expect(p).not.toContain('<b>x</b>');
    expect(paginaDeNadie('dash.nadie.com', 'sin_dominio')).toContain('no está dada de alta');
  });
});
