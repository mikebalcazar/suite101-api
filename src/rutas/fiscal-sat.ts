/* /orgs/:o/fiscal/sat/* — bill101 fase D: bajar del SAT (contrato 0.87.0).
 *
 *   GET    /fiscal/sat           en qué va: la FIEL (de quién, hasta cuándo),
 *                                las solicitudes y qué dijo el SAT
 *   PUT    /fiscal/sat/fiel      subir la FIEL: multipart con `cer`, `key` y `clave`
 *   DELETE /fiscal/sat/fiel      quitarla
 *   PUT    /fiscal/sat/config    { automatico } — bajar solo cada noche, o no
 *   POST   /fiscal/sat/bajar     bajar ahora
 *
 * QUIÉN PUEDE. Ver: quien ve lo fiscal. Bajar ahora y prender o apagar lo
 * automático: quien dirige o lleva la contabilidad. SUBIR O QUITAR LA FIEL:
 * sólo quien dirige (owner o admin). Es la firma legal de la empresa; quien
 * lleva la contabilidad puede usar lo que baja, no ponerla ni quitarla.
 *
 * LA CONTRASEÑA llega aquí, abre la llave y se suelta: no se guarda, no se
 * escribe en ninguna bitácora y no viaja a la base de la empresa. Tampoco la
 * llave abierta: a la base llega ya cifrada (src/fiel.ts). Lo único que esta
 * ruta contesta de la FIEL es lo que dice su certificado, que es público.
 */

import type { Hono } from 'hono';
import { err, ok, type Ctx, type Vars } from '../http';
import type { Env } from '../entorno';
import type { ApiOrgDB } from '../org-db';
import { abrirFiel, cifrarLlave, esFallaFiel, llaveMaestraFiel } from '../fiel';

type App = Hono<{ Bindings: Env; Variables: Vars }>;

const stub = (c: Ctx): ApiOrgDB => c.env.ORG.get(c.env.ORG.idFromName(c.get('org_id'))) as unknown as ApiOrgDB;
const esFalla = (r: unknown): r is { error: string; detalle?: unknown } =>
  !!r && typeof r === 'object' && 'error' in (r as Record<string, unknown>) && typeof (r as Record<string, unknown>).error === 'string';

const TOPE_FORMA = 64 * 1024;

export interface PermisosFiscales {
  puedeLeer(c: Ctx): boolean;
  administra(c: Ctx): Promise<boolean>;
  actor(c: Ctx): { usuario_id: string };
}

export function montarFiscalSat(rutas: App, p: PermisosFiscales): void {
  const dirige = (c: Ctx): boolean => {
    const q = c.get('quien');
    return q.clase === 'miembro' && (q.rol === 'owner' || q.rol === 'admin');
  };

  rutas.get('/:o/fiscal/sat', async (c) => {
    if (!p.puedeLeer(c)) return err(c, 'sin_permiso', 403);
    return ok(c, { ...(await stub(c).sat('estado')), puede_subir_fiel: dirige(c), puede_bajar: await p.administra(c) });
  });

  rutas.put('/:o/fiscal/sat/fiel', async (c) => {
    if (!dirige(c)) return err(c, 'sin_permiso', 403, { motivo: 'la FIEL de la empresa sólo la sube quien dirige' });
    const cuerpo = await c.req.arrayBuffer().catch(() => null);
    if (!cuerpo || cuerpo.byteLength > TOPE_FORMA) return err(c, 'datos_invalidos', 400, { motivo: 'se esperan tres cosas: el .cer, el .key y la contraseña' });
    let cer: Uint8Array | null = null, key: Uint8Array | null = null, clave = '';
    try {
      const forma = await new Response(cuerpo, { headers: { 'Content-Type': c.req.header('Content-Type') || '' } }).formData();
      const a = forma.get('cer'), b = forma.get('key'), k = forma.get('clave');
      if (a && typeof a !== 'string') cer = new Uint8Array(await (a as File).arrayBuffer());
      if (b && typeof b !== 'string') key = new Uint8Array(await (b as File).arrayBuffer());
      if (typeof k === 'string') clave = k;
    } catch {
      return err(c, 'datos_invalidos', 400, { motivo: 'no se pudo leer lo que se subió', forma: 'multipart con `cer`, `key` y `clave`' });
    }
    if (!cer || !key) return err(c, 'datos_invalidos', 400, { falta: !cer ? 'cer' : 'key', forma: 'multipart con `cer`, `key` y `clave`' });

    const fiel = await abrirFiel(cer, key, clave);
    clave = '';
    if (esFallaFiel(fiel)) return err(c, fiel.error, 400, fiel.detalle);
    const org = c.get('org_id');
    const { pkcs8, ...datos } = fiel;
    const cifrada = await cifrarLlave(pkcs8, await llaveMaestraFiel(c.env), org, datos.rfc);
    pkcs8.fill(0);
    const r = await stub(c).sat('guardarFiel', [{ org_id: org, datos, cifrada }, p.actor(c)]);
    if (esFalla(r)) return err(c, r.error, r.error === 'fiel_de_otro_rfc' ? 409 : 400, r.detalle);
    return ok(c, { ...r, puede_subir_fiel: true, puede_bajar: true });
  });

  rutas.delete('/:o/fiscal/sat/fiel', async (c) => {
    if (!dirige(c)) return err(c, 'sin_permiso', 403, { motivo: 'la FIEL de la empresa sólo la quita quien dirige' });
    return ok(c, { ...(await stub(c).sat('quitarFiel')), puede_subir_fiel: true, puede_bajar: true });
  });

  rutas.put('/:o/fiscal/sat/config', async (c) => {
    if (!(await p.administra(c))) return err(c, 'sin_permiso', 403);
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    // Desde cuándo se quiere el historial lo decidió Mike (1-ene-2026): no se cambia desde aquí.
    const r = await stub(c).sat('configurar', [{ automatico: b.automatico }]);
    if (esFalla(r)) return err(c, r.error, 400, r.detalle);
    return ok(c, { ...r, puede_subir_fiel: dirige(c), puede_bajar: true });
  });

  rutas.post('/:o/fiscal/sat/bajar', async (c) => {
    if (!(await p.administra(c))) return err(c, 'sin_permiso', 403);
    const r = await stub(c).sat('bajar', [p.actor(c)]);
    if (esFalla(r)) return err(c, r.error, r.error === 'sin_fiel' ? 409 : 400, r.detalle);
    return ok(c, { ...r, puede_subir_fiel: dirige(c), puede_bajar: true });
  });
}
