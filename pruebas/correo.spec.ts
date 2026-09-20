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
import { enviarCorreo, correoCodigo, correoBienvenida, correoOrdenPagada, correoOrdenResuelta, NO_SE_CONTESTA } from '../src/auth/correo';
import type { Env } from '../src/entorno';

const MSG = { para: 'nadie@ejemplo.mx', asunto: 'x', html: '<p>x</p>', texto: 'x' };

/** Un `env` mínimo con la llave puesta: así, si algo sale, es por el entorno y
 *  no porque falte la llave. */
const entorno = (ENTORNO: string, extra: Partial<Env> = {}) =>
  ({ RESEND_API_KEY: 'llave-de-mentiras', ENTORNO, ...extra }) as unknown as Env;

const original = globalThis.fetch;
let salidas: string[] = [];
/** Lo que se le mandó a Resend en la última llamada. Sirve para mirar las
 *  cabeceras y el texto, que es donde vive lo de no caer en basura. */
let cuerpos: Array<Record<string, unknown>> = [];

/** Cuenta a dónde salió la API, y contesta como Resend contento. */
function espiar(ok = true) {
  salidas = [];
  cuerpos = [];
  globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    salidas.push(String(entrada instanceof Request ? entrada.url : entrada));
    if (typeof init?.body === 'string') cuerpos.push(JSON.parse(init.body));
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

/* ─────────────── que no caiga en la basura ───────────────
 *
 * Mike, 20-sep: los correos de la suite le están llegando a spam.
 *
 * Lo que decide eso casi todo es el DNS del dominio que envía —SPF, DKIM y
 * DMARC de `envios.taller101.mx`—, y eso no vive en este código. Lo que sí
 * vive aquí es la forma del mensaje, y hay tres cosas que un filtro mira y
 * que sí se pueden romper sin darse cuenta.
 */

describe('la forma del mensaje, para no caer en basura', () => {
  it('siempre va la parte de texto plano, no nada más el HTML', async () => {
    /* Un mensaje sólo-HTML es de las señales más viejas de correo basura.
     * Ya iba, y esta prueba es para que no se caiga el día que alguien
     * agregue una plantilla nueva y se le olvide el `texto`. */
    espiar();
    await enviarCorreo(entorno('produccion'), MSG);
    expect(cuerpos[0].text, 'la parte de texto').toBeTruthy();
    expect(cuerpos[0].html, 'y la de HTML').toBeTruthy();
  });

  it('cada mensaje lleva su propia referencia: Gmail no los amontona', async () => {
    /* Sin esto, Gmail junta «Tu código de acceso: 481920» con el de hace un
     * rato y colapsa el de atrás. La persona ve el viejo hasta arriba,
     * teclea un código vencido, y cree que el sistema está descompuesto. */
    espiar();
    await enviarCorreo(entorno('produccion'), MSG);
    await enviarCorreo(entorno('produccion'), MSG);
    const uno = (cuerpos[0].headers as Record<string, string>)['X-Entity-Ref-ID'];
    const dos = (cuerpos[1].headers as Record<string, string>)['X-Entity-Ref-ID'];
    expect(uno, 'la referencia existe').toBeTruthy();
    expect(dos).not.toBe(uno);
  });

  it('el código de acceso NO lleva salida de baja, y el aviso sí', async () => {
    /* Es la mitad que se piensa al revés. Darle «darse de baja» a tu propio
     * código de entrada es ofrecerle a alguien que se deje fuera de su
     * cuenta; en un aviso sí tiene sentido.
     *
     * Y la cabecera sólo sale si hay una dirección de verdad configurada:
     * una salida que nadie procesa es una promesa falsa, y de ésas vive la
     * carpeta de basura. */
    const env = entorno('produccion', { CORREO_BAJA: 'baja@envios.taller101.mx' } as Partial<Env>);
    espiar();
    await enviarCorreo(env, MSG);
    expect((cuerpos[0].headers as Record<string, string>)['List-Unsubscribe']).toBeUndefined();

    espiar();
    await enviarCorreo(env, { ...MSG, conBaja: true });
    expect((cuerpos[0].headers as Record<string, string>)['List-Unsubscribe'])
      .toBe('<mailto:baja@envios.taller101.mx?subject=Baja>');
  });

  it('sin dirección de baja configurada, la cabecera no se inventa', async () => {
    espiar();
    await enviarCorreo(entorno('produccion'), { ...MSG, conBaja: true });
    expect((cuerpos[0].headers as Record<string, string>)['List-Unsubscribe']).toBeUndefined();
  });

  it('todas las plantillas dicen que el buzón no se contesta', async () => {
    /* Mike decidió no poner `Reply-To`: no hay buzón que alguien lea todos
     * los días. Entonces hay que DECIRLO. Quien escribe tres veces sin
     * respuesta acaba marcando al remitente como basura, y eso sí pega en
     * la reputación del dominio.
     *
     * Se revisan las dos partes, texto y HTML: quien lee en texto plano es
     * justamente quien no va a ver el pie del HTML. */
    const plantillas = [
      correoCodigo('481920'),
      correoBienvenida({ empresa: 'Forespot', director: 'Mike', correo: 'mike@forespot.com', urlPanel: 'https://x.mx', apps: ['dash101'] }),
      correoOrdenPagada({ folio: 'OC-1', proveedor: 'Maderas', concepto: 'Triplay', monto: 116_00, moneda: 'MXN', fecha: '2026-03-20', cuenta: 'Banco', nota: '', url: 'https://x.mx' }),
      correoOrdenResuelta('devuelta', { folio: 'OC-2', proveedor: 'Maderas', concepto: 'Triplay', monto: 116_00, moneda: 'MXN', fecha: '', cuenta: '', nota: 'Falta el precio', url: '' }),
    ];
    for (const p of plantillas) {
      expect(p.texto, `«${p.asunto}» lo dice en texto`).toContain(NO_SE_CONTESTA);
      expect(p.html, `«${p.asunto}» lo dice en HTML`).toContain(NO_SE_CONTESTA);
    }
  });
});
