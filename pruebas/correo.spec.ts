/* El correo sólo sale en producción.
 *
 * Por qué hay un archivo entero para esto: el 16-sep se agotaron los 100
 * envíos del día de Resend en unas veinte corridas de medición. Cada prueba
 * que entraba a la suite de ensayo mandaba un correo de verdad que nadie leía
 * —la prueba usa el código que `/auth/codigo` le devuelve en la respuesta—, y
 * la mitad iba a direcciones inventadas (`@ejemplo.mx`) que rebotaban contra
 * `envios.taller101.mx`, el dominio con el que le llega el código a la gente.
 *
 * El gasto se repone al día siguiente; la reputación de un dominio que rebota
 * no. Así que lo que se comprueba aquí no es el ahorro: es que una prueba no
 * pueda volver a mandarle correo a nadie.
 *
 * Se prueba `enviarCorreo` sola, con un `fetch` de mentiras, porque es la
 * única puerta por donde sale correo de toda la API: lo que se demuestre aquí
 * vale para cualquier ruta que mande correo, incluidas las que no existen
 * todavía.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { enviarCorreo } from '../src/auth/correo';
import type { Env } from '../src/entorno';

const MSG = { para: 'nadie@ejemplo.mx', asunto: 'x', html: '<p>x</p>', texto: 'x' };

/** Un `env` mínimo con la llave puesta: así, si algo sale, es por el entorno y
 *  no porque falte la llave. */
const entorno = (ENTORNO: string, extra: Partial<Env> = {}) =>
  ({ RESEND_API_KEY: 'llave-de-mentiras', ENTORNO, ...extra }) as unknown as Env;

const original = globalThis.fetch;
let salidas: string[] = [];

/** Cuenta a dónde salió la API, y contesta como Resend contento. */
function espiar(ok = true) {
  salidas = [];
  globalThis.fetch = (async (entrada: RequestInfo | URL) => {
    salidas.push(String(entrada instanceof Request ? entrada.url : entrada));
    return new Response(ok ? '{"id":"1"}' : 'no', { status: ok ? 200 : 422 });
  }) as typeof fetch;
}

afterEach(() => { globalThis.fetch = original; });

describe('el correo sólo sale en producción', () => {
  it('en staging NO se llama a Resend, ni una vez', async () => {
    espiar();
    const r = await enviarCorreo(entorno('staging'), MSG);
    expect(salidas).toEqual([]);
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe('correo_apagado_fuera_de_produccion');
  });

  it('en las pruebas tampoco', async () => {
    espiar();
    const r = await enviarCorreo(entorno('prueba'), MSG);
    expect(salidas).toEqual([]);
    expect(r.enviado).toBe(false);
  });

  it('en producción sí sale, y va a Resend', async () => {
    espiar();
    const r = await enviarCorreo(entorno('produccion'), MSG);
    expect(salidas).toEqual(['https://api.resend.com/emails']);
    expect(r.enviado).toBe(true);
  });

  it('sin llave no sale nada, aunque sea producción', async () => {
    espiar();
    const r = await enviarCorreo({ ENTORNO: 'produccion' } as unknown as Env, MSG);
    expect(salidas).toEqual([]);
    expect(r.motivo).toBe('correo_no_configurado');
  });

  it('CORREO_DE_VERDAD=1 lo prende a mano en staging, para probar el camino', async () => {
    espiar();
    const r = await enviarCorreo(entorno('staging', { CORREO_DE_VERDAD: '1' }), MSG);
    expect(salidas).toEqual(['https://api.resend.com/emails']);
    expect(r.enviado).toBe(true);
  });

  it('cualquier otro valor de CORREO_DE_VERDAD no lo prende', async () => {
    // Que sólo el '1' cuente es a propósito: un "false" o un "0" heredado de
    // otro lado no debe abrir la puerta por parecer un valor puesto.
    for (const v of ['0', 'false', 'true', 'sí', '']) {
      espiar();
      await enviarCorreo(entorno('staging', { CORREO_DE_VERDAD: v }), MSG);
      expect(salidas, `con CORREO_DE_VERDAD=${JSON.stringify(v)}`).toEqual([]);
    }
  });

  it('si Resend contesta mal en producción, se dice, no se finge', async () => {
    espiar(false);
    const r = await enviarCorreo(entorno('produccion'), MSG);
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe('correo_no_salio');
  });
});
