// Envío de correo vía Resend — roster101
//
// Ningún texto de aquí nombra a una empresa en particular: el nombre entra por
// parámetro, desde la configuración del cliente.
import { empresaDe } from './lib.js';

const AZUL = '#0080C1';
const OSCURO = '#122733';

function plantilla({ empresa, titulo, cuerpo, pie }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f8;font-family:'Raleway',Helvetica,Arial,sans-serif;color:${OSCURO}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 14px rgba(18,39,51,.08)">
    <tr><td style="background:${AZUL};padding:20px 26px">
      <span style="color:#fff;font-size:20px;font-weight:800;letter-spacing:.5px">${String(empresa).toUpperCase()}</span>
    </td></tr>
    <tr><td style="padding:28px 26px">
      <h1 style="margin:0 0 14px;font-size:20px;color:${OSCURO}">${titulo}</h1>
      ${cuerpo}
    </td></tr>
    <tr><td style="padding:16px 26px 24px;border-top:1px solid #e6ebef;font-size:12px;color:#6b7a85">
      ${pie || 'Este mensaje es automático. Si no reconoces esta actividad, avísale a administración.'}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

export async function enviarCorreo(env, { para, asunto, html, texto }) {
  // Fuera de producción el correo no sale (la misma regla que el resto de la
  // suite): el de una prueba no lo lee nadie y rebota contra el dominio real.
  if (!env.RESEND_API_KEY || !env.CORREO_SALE) {
    console.log('[correo simulado]', para, asunto, texto || '');
    return { simulado: true };
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.CORREO_REMITENTE || `${empresaDe(env)} <onboarding@resend.dev>`,
      to: [para],
      subject: asunto,
      html,
      text: texto,
    }),
  });
  if (!r.ok) {
    const detalle = await r.text();
    console.error('Resend error', r.status, detalle);
    throw new Error('No se pudo enviar el correo');
  }
  return await r.json();
}

export function correoCodigo(empresa, codigo) {
  return {
    asunto: `Tu código de acceso: ${codigo} — ${empresa}`,
    html: plantilla({
      empresa,
      titulo: 'Código de acceso',
      cuerpo: `<p style="margin:0 0 18px;font-size:15px;line-height:1.6">Usa este código para entrar a tu expediente. Vence en 10 minutos.</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:${AZUL};background:#f0f7fb;border-radius:10px;padding:16px;text-align:center">${codigo}</div>
      <p style="margin:18px 0 0;font-size:13px;color:#6b7a85">Si tú no lo pediste, ignora este correo.</p>`,
    }),
    texto: `Tu código de acceso a ${empresa} es ${codigo}. Vence en 10 minutos.`,
  };
}

export function correoConfirmacion(empresa, t, faltantes) {
  const nombre = `${t.nombre} ${t.apellido_paterno}`.trim();
  const lista = faltantes.length
    ? `<p style="margin:18px 0 6px;font-size:15px"><strong>Todavía falta subir:</strong></p><ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.7">${faltantes.map((f) => `<li>${f}</li>`).join('')}</ul>`
    : `<p style="margin:18px 0 0;font-size:15px;color:#1a7f37"><strong>Tu expediente está completo.</strong> No falta nada.</p>`;
  return {
    asunto: `Confirmación de tu expediente — ${empresa}`,
    html: plantilla({
      empresa,
      titulo: `Recibimos tus datos, ${nombre}`,
      cuerpo: `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">Guardamos tu información en el expediente de ${empresa}. Este es el resumen:</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#6b7a85">Nombre</td><td style="padding:6px 0"><strong>${t.nombre} ${t.apellido_paterno} ${t.apellido_materno}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7a85">Celular</td><td style="padding:6px 0">${t.celular}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7a85">CURP</td><td style="padding:6px 0">${t.curp}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7a85">NSS</td><td style="padding:6px 0">${t.nss}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7a85">Banco</td><td style="padding:6px 0">${t.banco}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7a85">CLABE</td><td style="padding:6px 0">•••• •••• •••• ${String(t.clabe).slice(-4)}</td></tr>
      </table>
      ${lista}
      <p style="margin:22px 0 0;font-size:14px;line-height:1.6">Puedes volver a entrar cuando quieras con tu correo: pedimos un código y listo.</p>`,
      pie: 'Si algún dato está mal, entra al portal y corrígelo tú mismo.',
    }),
    texto: `Recibimos tu expediente, ${nombre}. ${faltantes.length ? 'Falta subir: ' + faltantes.join(', ') : 'Expediente completo.'}`,
  };
}

export function correoAvisoAdmin(empresa, t, faltantes) {
  return {
    asunto: `Expediente ${faltantes.length ? 'actualizado' : 'COMPLETO'}: ${t.apellido_paterno} ${t.apellido_materno}, ${t.nombre}`,
    html: plantilla({
      empresa,
      titulo: 'Movimiento en el portal de trabajadores',
      cuerpo: `<p style="font-size:15px;line-height:1.6"><strong>${t.nombre} ${t.apellido_paterno} ${t.apellido_materno}</strong> (${t.email}) guardó su expediente.</p>
      <p style="font-size:15px">${faltantes.length ? 'Pendientes: ' + faltantes.join(', ') : 'Sin pendientes.'}</p>`,
    }),
    texto: `${t.nombre} ${t.apellido_paterno} guardó su expediente. ${faltantes.length ? 'Pendientes: ' + faltantes.join(', ') : 'Completo.'}`,
  };
}
