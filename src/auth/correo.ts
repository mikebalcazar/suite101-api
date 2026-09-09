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

export async function enviarCorreo(env: Env, msg: { para: string; asunto: string; html: string; texto: string }): Promise<{ enviado: boolean; motivo?: string }> {
  if (!env.RESEND_API_KEY) return { enviado: false, motivo: 'correo_no_configurado' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.CORREO_REMITENTE || 'Suite 101 <onboarding@resend.dev>',
      to: [msg.para],
      subject: msg.asunto,
      html: msg.html,
      text: msg.texto,
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
    texto: `Tu código de acceso es ${codigo}. Vence en 10 minutos. Si tú no lo pediste, ignora este correo.`,
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
      Mensaje automático de Taller 101. Si no reconoces esta actividad, avísale a administración.
    </td></tr>
  </table>
</td></tr></table></body></html>`,
  };
}
