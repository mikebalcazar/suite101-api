/* Envío de correo por Resend. Copiado en espíritu de src/correo.js de
 * roster101, que es el molde que ya funciona.
 *
 * Identidad Taller 101: azul #0080C1, Raleway para el texto, y el código —que
 * es una cifra— en Fira Sans con las cifras tabulares. En un correo no se
 * puede confiar en una fuente descargada, así que se pide la pila completa y
 * se acepta que un cliente de correo caiga en la de al lado; lo que no se hace
 * es pedirle una fuente que contradiga la identidad. */

import type { Env } from '../entorno';

const AZUL = '#0080C1';
const OSCURO = '#122733';
const TEXTO = "'Raleway',Helvetica,Arial,sans-serif";
const CIFRAS = "'Fira Sans','Raleway',Helvetica,Arial,sans-serif";

/** ¿Sale el correo de verdad?
 *
 *  Sólo en producción. Fuera de producción NO se llama a Resend, y la razón no
 *  es el ahorro: es que ese correo no lo lee nadie. La prueba de humo entra con
 *  el código que `/auth/codigo` le devuelve en la respuesta —eso es justo lo que
 *  `ENTORNO !== 'produccion'` habilita—, así que el mensaje se enviaba para
 *  morir en un buzón que nadie abre.
 *
 *  Lo caro no era el gasto. Las pruebas entran con direcciones inventadas
 *  (`@ejemplo.mx`), que no existen: cada una era un **rebote** a nombre de
 *  `envios.taller101.mx`, el mismo dominio con el que le llega el código de
 *  acceso a la gente de verdad. Una tasa alta de rebotes es lo que hace que un
 *  proveedor de correo empiece a mandar tus mensajes a la basura. El 16-sep se
 *  agotaron los 100 envíos del día en unas veinte corridas de medición, y ahí
 *  se vio: el gasto sólo fue el síntoma.
 *
 *  Ninguna prueba comprueba que el correo salga —todas leen el código de la
 *  respuesta—, así que apagarlo aquí no deja nada sin cubrir. Lo que sí se
 *  comprueba, y sigue igual, es que en producción el código NUNCA viaja en la
 *  respuesta.
 *
 *  Para probar el camino del correo a propósito en staging, se pone la variable
 *  `CORREO_DE_VERDAD = "1"` y se quita al terminar. No está puesta en ningún
 *  lado, y es una variable —no un secreto—, así que se ve en `wrangler.toml`
 *  quién la prendió. */
const sale = (env: Env) => env.ENTORNO === 'produccion' || env.CORREO_DE_VERDAD === '1';

/** El pie que va en TODOS los mensajes, y por qué.
 *
 *  Mike decidió el 20-sep que estos correos no llevan `Reply-To`: no hay
 *  buzón que alguien lea todos los días, y un `Reply-To` que nadie contesta
 *  es peor que no tenerlo —la gente responde, nadie le contesta, y la
 *  siguiente vez ya no confía en el remitente—.
 *
 *  Pero si no se contesta, HAY QUE DECIRLO. Un correo que parece una persona
 *  y no lo es acaba marcado como basura por quien escribió tres veces sin
 *  respuesta, y eso sí pega en la reputación del dominio. */
export const NO_SE_CONTESTA = 'Este buzón no recibe respuestas. Si necesitas algo, escríbele a quien administra la Suite 101 en tu empresa.';

/** ¿A dónde se pide dejar de recibir avisos?
 *
 *  Es una dirección de verdad, atendida por una persona, o no se pone. Un
 *  `List-Unsubscribe` que nadie procesa es una promesa falsa en una cabecera,
 *  y de ésas vive la carpeta de basura.
 *
 *  Y NO se pone en el correo del código de acceso, ni en ningún otro que la
 *  persona pidió al momento: darle salida a tu propio código de entrada es
 *  ofrecerle a alguien que se deje fuera de su cuenta. La cabecera es para
 *  los avisos —la bienvenida, el estado de una orden—, que sí son algo que
 *  uno puede querer que deje de llegarle. */
const bajaDe = (env: Env): string | null => (env.CORREO_BAJA ? `<mailto:${env.CORREO_BAJA}?subject=Baja>` : null);

export async function enviarCorreo(
  env: Env,
  msg: { para: string; asunto: string; html: string; texto: string; conBaja?: boolean },
): Promise<{ enviado: boolean; motivo?: string }> {
  if (!env.RESEND_API_KEY) return { enviado: false, motivo: 'correo_no_configurado' };
  if (!sale(env)) return { enviado: false, motivo: 'correo_apagado_fuera_de_produccion' };
  const baja = msg.conBaja ? bajaDe(env) : null;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.CORREO_REMITENTE || 'Suite 101 <onboarding@resend.dev>',
      to: [msg.para],
      subject: msg.asunto,
      html: msg.html,
      text: msg.texto,
      headers: {
        /* Sin esto, Gmail agrupa los mensajes de asunto parecido —«Tu código
         * de acceso: 481920»— en una sola conversación y colapsa los de
         * atrás. La persona pide un código nuevo, le llega, y ve el viejo
         * hasta arriba: teclea el que ya venció y cree que el sistema está
         * descompuesto. Una referencia distinta por mensaje lo impide. */
        'X-Entity-Ref-ID': crypto.randomUUID(),
        ...(baja ? { 'List-Unsubscribe': baja } : {}),
      },
    }),
  });
  if (!r.ok) {
    console.error('resend', r.status, await r.text());
    return { enviado: false, motivo: 'correo_no_salio' };
  }
  return { enviado: true };
}

export function correoCodigo(codigo: string): { asunto: string; html: string; texto: string } {
  return {
    asunto: `Tu código de acceso: ${codigo} — Suite 101`,
    texto: `Tu código de acceso es ${codigo}. Vence en 10 minutos. Si tú no lo pediste, ignora este correo.\n\n${NO_SE_CONTESTA}`,
    html: `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f8;font-family:${TEXTO};color:${OSCURO}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 14px rgba(18,39,51,.08)">
    <tr><td style="background:${AZUL};padding:20px 26px">
      <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:.5px">SUITE 101</span>
    </td></tr>
    <tr><td style="padding:28px 26px">
      <h1 style="margin:0 0 14px;font-size:20px;font-family:${TEXTO}">Código de acceso</h1>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6">Úsalo para entrar. Vence en 10 minutos.</p>
      <div style="font-family:${CIFRAS};font-variant-numeric:tabular-nums;font-size:34px;font-weight:600;letter-spacing:10px;color:${AZUL};background:#f0f7fb;border-radius:10px;padding:16px;text-align:center">${codigo}</div>
      <p style="margin:18px 0 0;font-size:13px;color:#6b7a85">Si tú no lo pediste, ignora este correo.</p>
    </td></tr>
    <tr><td style="padding:16px 26px 24px;border-top:1px solid #e6ebef;font-size:12px;color:#6b7a85">
      Mensaje automático de Taller 101. ${NO_SE_CONTESTA}
    </td></tr>
  </table>
</td></tr></table></body></html>`,
  };
}

/** 0.14.0 · lo que recibe el director cuando MASTER101 abre su empresa. No
 *  lleva ningún secreto: entra con su correo y el código que le llega al
 *  momento, en el panel de su empresa o en cualquiera de sus apps. */
export function correoBienvenida(d: { empresa: string; director: string | null; correo: string; urlPanel: string; apps: string[] }): { asunto: string; html: string; texto: string } {
  const saludo = d.director ? `Hola, ${d.director}.` : 'Hola.';
  const apps = d.apps.length ? d.apps.join(', ') : 'las que se prendan después';
  const texto = `${saludo}

Tu empresa ${d.empresa} ya está dada de alta en la Suite 101 y tú quedaste como su director.

Entra aquí con este correo (${d.correo}): ${d.urlPanel}
No hay contraseña que recordar: al escribir tu correo te llega un código de acceso. Si prefieres, ahí mismo puedes ponerte una contraseña o entrar con tu cuenta de Google.

Desde ese panel das de alta a tu gente y decides quién entra a qué. Apps de tu empresa: ${apps}.

Si tú no esperabas este correo, ignóralo.

${NO_SE_CONTESTA}`;
  return {
    asunto: `${d.empresa} ya está en la Suite 101 — tu acceso como director`,
    texto,
    html: `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f8;font-family:${TEXTO};color:${OSCURO}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 14px rgba(18,39,51,.08)">
    <tr><td style="background:${AZUL};padding:20px 26px">
      <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:.5px">SUITE 101</span>
    </td></tr>
    <tr><td style="padding:28px 26px">
      <h1 style="margin:0 0 14px;font-size:20px;font-family:${TEXTO}">${escapa(d.empresa)} ya está dada de alta</h1>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${escapa(saludo)} Quedaste como <b>director</b> de la empresa: desde tu panel das de alta a tu gente y decides quién entra a qué.</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6">Entra con este correo, <b>${escapa(d.correo)}</b>. No hay contraseña que recordar: al escribirlo te llega un código de acceso. Ahí mismo puedes ponerte una contraseña o entrar con tu cuenta de Google.</p>
      <p style="margin:0 0 22px;text-align:center"><a href="${escapa(d.urlPanel)}" style="display:inline-block;background:${AZUL};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:9px">Entrar a mi panel</a></p>
      <p style="margin:0;font-size:13px;color:#6b7a85">Apps de tu empresa: ${escapa(apps)}.<br>Si tú no esperabas este correo, ignóralo.</p>
    </td></tr>
    <tr><td style="padding:16px 26px 24px;border-top:1px solid #e6ebef;font-size:12px;color:#6b7a85">
      Mensaje automático de la Suite 101. ${NO_SE_CONTESTA}
    </td></tr>
  </table>
</td></tr></table></body></html>`,
  };
}

const escapa = (t: string): string => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string);

/* ─────────────── órdenes de compra (0.21.0) ───────────────
 * Al que pidió la compra le llega un correo cuando se paga, cuando se le
 * devuelve para corregir y cuando se rechaza. Es el mismo molde de arriba:
 * azul #0080C1, Raleway en el texto, y el dinero en Fira Sans con cifras
 * tabulares, que es lo que hace que una columna de pesos se lea de un
 * vistazo.
 *
 * El dinero llega en CENTAVOS y se pinta en pesos aquí, una sola vez. Un
 * correo que dice «116000» en vez de «$1,160.00» es un correo que nadie
 * entiende y que hace que le llamen a Mike a preguntar. */

interface DatosOrden {
  folio: string; proveedor: string; concepto: string; monto: number; moneda: string;
  fecha: string; cuenta: string; nota: string; url: string;
}

const pesos = (centavos: number, moneda = 'MXN') =>
  `$${(Math.round(centavos) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`;

const renglon = (etiqueta: string, valor: string, cifra = false) =>
  `<tr><td style="padding:6px 0;color:#6b7a85;font-size:13px">${etiqueta}</td>
       <td style="padding:6px 0;text-align:right;font-size:15px;font-weight:600${cifra ? `;font-family:${CIFRAS};font-variant-numeric:tabular-nums` : ''}">${valor}</td></tr>`;

const sobre = (titulo: string, color: string, cuerpo: string) =>
  `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f8;font-family:${TEXTO};color:${OSCURO}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 14px rgba(18,39,51,.08)">
    <tr><td style="background:${color};padding:20px 26px">
      <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:.5px">SUITE 101</span>
    </td></tr>
    <tr><td style="padding:28px 26px">
      <h1 style="margin:0 0 14px;font-size:20px;font-family:${TEXTO}">${titulo}</h1>
      ${cuerpo}
    </td></tr>
    <tr><td style="padding:16px 26px 24px;border-top:1px solid #e6ebef;font-size:12px;color:#6b7a85">
      Mensaje automático de Taller 101. ${NO_SE_CONTESTA}
    </td></tr>
  </table>
</td></tr></table></body></html>`;

export function correoOrdenPagada(d: DatosOrden): { asunto: string; html: string; texto: string } {
  const monto = pesos(d.monto, d.moneda);
  return {
    asunto: `Pagada tu orden ${d.folio} · ${monto}`,
    texto: `Se pagó tu orden ${d.folio}.\n\nProveedor: ${d.proveedor}\nConcepto: ${d.concepto}\n`
      + `Monto: ${monto}\nFecha de pago: ${d.fecha || 'hoy'}\nSalió de: ${d.cuenta || 'la cuenta de la empresa'}\n`
      + (d.url ? `\nEl comprobante y la orden completa: ${d.url}\n` : '')
      + `\n${NO_SE_CONTESTA}\n`,
    html: sobre('Ya se pagó tu orden', AZUL,
      `<p style="margin:0 0 18px;font-size:15px;line-height:1.6">La orden que pediste ya está pagada.</p>
       <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 18px">
         ${renglon('Folio', d.folio, true)}
         ${renglon('Proveedor', d.proveedor)}
         ${renglon('Concepto', d.concepto)}
         ${renglon('Monto', monto, true)}
         ${renglon('Fecha de pago', d.fecha || 'hoy', true)}
         ${renglon('Salió de', d.cuenta || 'la cuenta de la empresa')}
       </table>
       ${d.url ? `<p style="margin:0"><a href="${d.url}" style="display:inline-block;background:${AZUL};color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:600;font-size:15px">Ver la orden y su comprobante</a></p>` : ''}`),
  };
}

export function correoOrdenResuelta(que: 'devuelta' | 'rechazada', d: DatosOrden): { asunto: string; html: string; texto: string } {
  const monto = pesos(d.monto, d.moneda);
  const devuelta = que === 'devuelta';
  const titulo = devuelta ? 'Te devolvieron una orden para corregir' : 'Se rechazó tu orden';
  const que_sigue = devuelta
    ? 'Corrígela y vuelve a mandarla: conserva el mismo folio y toda su historia.'
    : 'Si crees que fue un error, háblalo con quien administra antes de volver a pedirla.';
  return {
    asunto: `${devuelta ? 'Devuelta' : 'Rechazada'} tu orden ${d.folio} · ${monto}`,
    texto: `${titulo}: ${d.folio}.\n\nProveedor: ${d.proveedor}\nConcepto: ${d.concepto}\nMonto: ${monto}\n\n`
      + `Motivo: ${d.nota}\n\n${que_sigue}\n` + (d.url ? `\n${d.url}\n` : '')
      + `\n${NO_SE_CONTESTA}\n`,
    html: sobre(titulo, devuelta ? '#9A6200' : '#A32D2D',
      `<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 14px">
         ${renglon('Folio', d.folio, true)}
         ${renglon('Proveedor', d.proveedor)}
         ${renglon('Concepto', d.concepto)}
         ${renglon('Monto', monto, true)}
       </table>
       <p style="margin:0 0 6px;font-size:13px;color:#6b7a85">Motivo</p>
       <p style="margin:0 0 18px;font-size:15px;line-height:1.6;background:#f6f8fa;border-radius:10px;padding:12px 14px">${d.nota}</p>
       <p style="margin:0 0 18px;font-size:15px;line-height:1.6">${que_sigue}</p>
       ${d.url ? `<p style="margin:0"><a href="${d.url}" style="display:inline-block;background:${AZUL};color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:600;font-size:15px">Ver la orden</a></p>` : ''}`),
  };
}
