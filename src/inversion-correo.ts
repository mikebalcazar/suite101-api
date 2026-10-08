/* investor101 — los correos (contrato 0.82.0).
 *
 * Tienen su propio sobre, y no el de `auth/correo.ts`, por una razón: quien
 * los recibe NO es de la empresa. El pie de los demás dice «escríbele a quien
 * administra la Suite 101 en tu empresa», y a un inversionista esa frase no
 * le dice nada. Aquí el remitente que se nombra es la empresa a la que le
 * presta, que es a quien conoce.
 *
 * Lo demás es lo mismo, y por lo mismo (CORREO.md): texto plano además del
 * HTML, «este buzón no recibe respuestas» dicho con todas sus letras, y el
 * dinero en pesos —llega en centavos y se pinta aquí, una sola vez—.
 */

import { tasaEnPalabras } from './inversion';
import type { TipoTasa } from '../schema/tipos';

const AZUL = '#0080C1';
const OSCURO = '#122733';
const TEXTO = "'Raleway',Helvetica,Arial,sans-serif";
const CIFRAS = "'Fira Sans','Raleway',Helvetica,Arial,sans-serif";

export type Mensaje = { asunto: string; html: string; texto: string };

const escapa = (t: unknown): string => String(t ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string);

export const pesos = (centavos: number): string =>
  `$${(Math.round(centavos) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** '2026-10-29' → '29 de octubre de 2026'. */
export const diaEnPalabras = (dia: string | null | undefined): string => {
  if (!dia) return '';
  const [a, m, d] = dia.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
};

const noSeContesta = (empresa: string) => `Este buzón no recibe respuestas. Si tienes una duda, escríbele directo a ${empresa}.`;

const renglon = (etiqueta: string, valor: string, cifra = false) =>
  `<tr><td style="padding:6px 0;color:#6b7a85;font-size:13px">${escapa(etiqueta)}</td>
       <td style="padding:6px 0;text-align:right;font-size:15px;font-weight:600${cifra ? `;font-family:${CIFRAS};font-variant-numeric:tabular-nums` : ''}">${escapa(valor)}</td></tr>`;

const boton = (url: string, texto: string) =>
  url ? `<p style="margin:18px 0 0"><a href="${escapa(url)}" style="display:inline-block;background:${AZUL};color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:600;font-size:15px">${escapa(texto)}</a></p>` : '';

const sobre = (empresa: string, titulo: string, cuerpo: string) =>
  `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f8;font-family:${TEXTO};color:${OSCURO}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 14px rgba(18,39,51,.08)">
    <tr><td style="background:${AZUL};padding:20px 26px">
      <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:.5px">${escapa(empresa)}</span>
    </td></tr>
    <tr><td style="padding:28px 26px">
      <h1 style="margin:0 0 14px;font-size:20px;font-family:${TEXTO}">${escapa(titulo)}</h1>
      ${cuerpo}
    </td></tr>
    <tr><td style="padding:16px 26px 24px;border-top:1px solid #e6ebef;font-size:12px;color:#6b7a85">
      Mensaje automático de ${escapa(empresa)}, enviado por investor101. ${escapa(noSeContesta(empresa))}
    </td></tr>
  </table>
</td></tr></table></body></html>`;

const parrafo = (t: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${t}</p>`;
const tabla = (filas: string) => `<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 6px">${filas}</table>`;

export interface DatosRonda {
  empresa: string; nombre_persona: string; ronda: string; descripcion: string | null;
  monto_meta: number; monto_minimo: number | null;
  tipo_tasa: TipoTasa; tasa_pb: number; esquema: 'unico' | 'parcialidades';
  frecuencia: string | null; num_pagos: number | null;
  fecha_inicio: string; fecha_vencimiento: string | null; fecha_limite: string | null;
  /** Lo que regresa un préstamo de $10,000 con estas condiciones. */
  ejemplo_total: number | null;
  url: string;
}

const CADA: Record<string, string> = { semanal: 'cada semana', quincenal: 'cada 15 días', mensual: 'cada mes' };

/** Cómo se paga, en una frase. La usan el correo y el mensaje de WhatsApp. */
export function comoSePaga(d: Pick<DatosRonda, 'esquema' | 'frecuencia' | 'num_pagos' | 'fecha_vencimiento'>): string {
  if (d.esquema === 'unico') return `Un solo pago el ${diaEnPalabras(d.fecha_vencimiento)}`;
  return `${d.num_pagos} pagos, ${CADA[String(d.frecuencia)] ?? ''}`.trim();
}

export function correoRondaAbierta(d: DatosRonda): Mensaje {
  const tasa = tasaEnPalabras(d.tipo_tasa, d.tasa_pb);
  const lineas = [
    `Se busca juntar: ${pesos(d.monto_meta)}`,
    `Rendimiento: ${tasa}`,
    `Cómo se paga: ${comoSePaga(d)}`,
    `El dinero se necesita el: ${diaEnPalabras(d.fecha_inicio)}`,
    ...(d.monto_minimo ? [`Se entra desde: ${pesos(d.monto_minimo)}`] : []),
    ...(d.fecha_limite ? [`Se puede entrar hasta el: ${diaEnPalabras(d.fecha_limite)}`] : []),
    ...(d.ejemplo_total ? [`Por cada $10,000.00 regresan: ${pesos(d.ejemplo_total)}`] : []),
  ];
  return {
    asunto: `${d.empresa} abrió una ronda: ${d.ronda} · ${pesos(d.monto_meta)}`,
    texto: `Hola, ${d.nombre_persona}.\n\n${d.empresa} abrió una ronda de inversión: ${d.ronda}.\n`
      + (d.descripcion ? `\n${d.descripcion}\n` : '')
      + `\n${lineas.join('\n')}\n`
      + (d.url ? `\nPara decir con cuánto entras, abre: ${d.url}\nEntras con este mismo correo. Si es tu primera vez, escoge «No tengo contraseña o la olvidé» y te llega un código para ponerla.\n` : '')
      + `\nDecir que entras no te compromete todavía: ${d.empresa} revisa cada oferta y te confirma.\n\n${noSeContesta(d.empresa)}\n`,
    html: sobre(d.empresa, `Ronda abierta: ${d.ronda}`,
      parrafo(`Hola, ${escapa(d.nombre_persona)}. ${escapa(d.empresa)} abrió una ronda de inversión.`)
      + (d.descripcion ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;background:#f6f8fa;border-radius:10px;padding:12px 14px">${escapa(d.descripcion)}</p>` : '')
      + tabla(
        renglon('Se busca juntar', pesos(d.monto_meta), true)
        + renglon('Rendimiento', tasa, true)
        + renglon('Cómo se paga', comoSePaga(d))
        + renglon('El dinero se necesita el', diaEnPalabras(d.fecha_inicio))
        + (d.monto_minimo ? renglon('Se entra desde', pesos(d.monto_minimo), true) : '')
        + (d.fecha_limite ? renglon('Se puede entrar hasta el', diaEnPalabras(d.fecha_limite)) : '')
        + (d.ejemplo_total ? renglon('Por cada $10,000.00 regresan', pesos(d.ejemplo_total), true) : ''),
      )
      + boton(d.url, 'Ver la ronda y decir con cuánto entro')
      + `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#6b7a85">Entras con este mismo correo. Si es tu primera vez, escoge «No tengo contraseña o la olvidé» y te llega un código para ponerla. Decir que entras no te compromete todavía: ${escapa(d.empresa)} revisa cada oferta y te confirma.</p>`),
  };
}

/** El mismo aviso, para mandarlo a mano por WhatsApp (decisión de Mike con
 *  botones: «correo + WhatsApp manual»). Texto plano y corto. */
export function mensajeWhatsApp(d: DatosRonda): string {
  return [
    `Hola, ${d.nombre_persona}. ${d.empresa} abrió una ronda de inversión: *${d.ronda}*.`,
    '',
    `• Se busca juntar: ${pesos(d.monto_meta)}`,
    `• Rendimiento: ${tasaEnPalabras(d.tipo_tasa, d.tasa_pb)}`,
    `• ${comoSePaga(d)}`,
    `• El dinero se necesita el ${diaEnPalabras(d.fecha_inicio)}`,
    ...(d.ejemplo_total ? [`• Por cada $10,000.00 regresan ${pesos(d.ejemplo_total)}`] : []),
    ...(d.url ? ['', `Para ver el detalle y decir con cuánto entras: ${d.url}`] : []),
  ].join('\n');
}

export function correoOfertaRecibida(d: { empresa: string; quien: string; ronda: string; monto: number; url: string }): Mensaje {
  return {
    asunto: `${d.quien} le entra a ${d.ronda} con ${pesos(d.monto)}`,
    texto: `${d.quien} dijo que le entra a la ronda ${d.ronda} con ${pesos(d.monto)}.\n\nQueda pendiente hasta que la apruebes, la ajustes o la rechaces.\n`
      + (d.url ? `\n${d.url}\n` : '') + `\n${noSeContesta(d.empresa)}\n`,
    html: sobre(d.empresa, 'Hay una oferta nueva',
      parrafo(`<b>${escapa(d.quien)}</b> dijo que le entra a la ronda <b>${escapa(d.ronda)}</b>.`)
      + tabla(renglon('Con', pesos(d.monto), true))
      + parrafo('Queda pendiente hasta que la apruebes, la ajustes o la rechaces.')
      + boton(d.url, 'Ver la oferta')),
  };
}

export function correoOfertaResuelta(d: {
  empresa: string; nombre_persona: string; ronda: string; aprobada: boolean; ofrecido: number; aprobado: number | null;
  motivo: string | null; instrucciones: string | null; folio: string | null; url: string;
}): Mensaje {
  if (!d.aprobada) {
    return {
      asunto: `Tu oferta para ${d.ronda} no entró`,
      texto: `Hola, ${d.nombre_persona}.\n\n${d.empresa} no tomó tu oferta de ${pesos(d.ofrecido)} para la ronda ${d.ronda}.\n`
        + (d.motivo ? `\nMotivo: ${d.motivo}\n` : '') + `\nGracias por levantar la mano.\n\n${noSeContesta(d.empresa)}\n`,
      html: sobre(d.empresa, 'Tu oferta no entró esta vez',
        parrafo(`Hola, ${escapa(d.nombre_persona)}. ${escapa(d.empresa)} no tomó tu oferta de <b>${pesos(d.ofrecido)}</b> para la ronda <b>${escapa(d.ronda)}</b>.`)
        + (d.motivo ? `<p style="margin:0 0 6px;font-size:13px;color:#6b7a85">Motivo</p><p style="margin:0 0 16px;font-size:15px;line-height:1.6;background:#f6f8fa;border-radius:10px;padding:12px 14px">${escapa(d.motivo)}</p>` : '')
        + parrafo('Gracias por levantar la mano.')),
    };
  }
  const aprobado = d.aprobado ?? d.ofrecido;
  const ajuste = aprobado !== d.ofrecido ? ` (ofreciste ${pesos(d.ofrecido)})` : '';
  return {
    asunto: `Aceptada tu oferta para ${d.ronda} · ${pesos(aprobado)}`,
    texto: `Hola, ${d.nombre_persona}.\n\n${d.empresa} aceptó tu oferta para la ronda ${d.ronda} por ${pesos(aprobado)}${ajuste}.\n`
      + (d.folio ? `Tu préstamo es el ${d.folio}.\n` : '')
      + `\nLo que sigue: haz el depósito y sube tu comprobante. El préstamo y sus intereses arrancan el día que ${d.empresa} confirma que lo recibió.\n`
      + (d.instrucciones ? `\nA dónde depositar:\n${d.instrucciones}\n` : '')
      + (d.url ? `\nTu préstamo, su tabla de pagos y dónde subir el comprobante: ${d.url}\n` : '') + `\n${noSeContesta(d.empresa)}\n`,
    html: sobre(d.empresa, 'Tu oferta fue aceptada',
      parrafo(`Hola, ${escapa(d.nombre_persona)}. ${escapa(d.empresa)} aceptó tu oferta para la ronda <b>${escapa(d.ronda)}</b>.`)
      + tabla(renglon('Monto aceptado', `${pesos(aprobado)}${ajuste}`, true) + (d.folio ? renglon('Tu préstamo', d.folio, true) : ''))
      + parrafo(`<b>Lo que sigue:</b> haz el depósito y sube tu comprobante. El préstamo y sus intereses arrancan el día que ${escapa(d.empresa)} confirma que lo recibió.`)
      + (d.instrucciones ? `<p style="margin:0 0 6px;font-size:13px;color:#6b7a85">A dónde depositar</p><p style="margin:0 0 4px;font-size:15px;line-height:1.6;background:#f0f7fb;border-radius:10px;padding:12px 14px;white-space:pre-line;font-family:${CIFRAS}">${escapa(d.instrucciones)}</p>` : '')
      + boton(d.url, 'Ver mi préstamo y subir el comprobante')),
  };
}

export function correoDepositoRecibido(d: { empresa: string; nombre_persona: string; folio: string; monto: number; fecha: string; proximo_fecha: string | null; proximo_total: number | null; url: string }): Mensaje {
  return {
    asunto: `Recibido tu depósito · ${d.folio} · ${pesos(d.monto)}`,
    texto: `Hola, ${d.nombre_persona}.\n\n${d.empresa} confirmó que recibió tu depósito de ${pesos(d.monto)} el ${diaEnPalabras(d.fecha)}. Tu préstamo ${d.folio} arranca ese día.\n`
      + (d.proximo_fecha ? `\nTu primer pago: ${pesos(d.proximo_total ?? 0)} el ${diaEnPalabras(d.proximo_fecha)}.\n` : '')
      + (d.url ? `\nLa tabla completa: ${d.url}\n` : '') + `\n${noSeContesta(d.empresa)}\n`,
    html: sobre(d.empresa, 'Recibimos tu depósito',
      parrafo(`Hola, ${escapa(d.nombre_persona)}. Tu préstamo <b>${escapa(d.folio)}</b> ya arrancó.`)
      + tabla(
        renglon('Depósito', pesos(d.monto), true) + renglon('Recibido el', diaEnPalabras(d.fecha))
        + (d.proximo_fecha ? renglon('Tu primer pago', `${pesos(d.proximo_total ?? 0)} · ${diaEnPalabras(d.proximo_fecha)}`, true) : ''),
      )
      + boton(d.url, 'Ver mi tabla de pagos')),
  };
}

export function correoPagoHecho(d: {
  empresa: string; nombre_persona: string; folio: string; numero: number; de: number;
  capital: number; interes: number; fecha: string; liquidado: boolean; saldo: number; url: string;
}): Mensaje {
  const total = d.capital + d.interes;
  const cierre = d.liquidado ? 'Con este pago tu préstamo quedó liquidado. Gracias.' : `Capital que queda por devolverte: ${pesos(d.saldo)}.`;
  return {
    asunto: `Te pagaron ${pesos(total)} · ${d.folio} · pago ${d.numero} de ${d.de}`,
    texto: `Hola, ${d.nombre_persona}.\n\n${d.empresa} registró el pago ${d.numero} de ${d.de} de tu préstamo ${d.folio}.\n\n`
      + `Capital: ${pesos(d.capital)}\nInterés: ${pesos(d.interes)}\nTotal: ${pesos(total)}\nFecha de pago: ${diaEnPalabras(d.fecha)}\n\n${cierre}\n`
      + (d.url ? `\nEl comprobante y tu estado de cuenta: ${d.url}\n` : '') + `\n${noSeContesta(d.empresa)}\n`,
    html: sobre(d.empresa, d.liquidado ? 'Tu préstamo quedó liquidado' : 'Te hicieron un pago',
      parrafo(`Hola, ${escapa(d.nombre_persona)}. ${escapa(d.empresa)} registró el pago <b>${d.numero} de ${d.de}</b> de tu préstamo <b>${escapa(d.folio)}</b>.`)
      + tabla(
        renglon('Capital', pesos(d.capital), true) + renglon('Interés', pesos(d.interes), true)
        + renglon('Total', pesos(total), true) + renglon('Fecha de pago', diaEnPalabras(d.fecha)),
      )
      + parrafo(escapa(cierre))
      + boton(d.url, 'Ver el comprobante y mi estado de cuenta')),
  };
}

export function correoTablaCambiada(d: { empresa: string; nombre_persona: string; folio: string; motivo: string; url: string }): Mensaje {
  return {
    asunto: `Cambió la tabla de pagos de tu préstamo ${d.folio}`,
    texto: `Hola, ${d.nombre_persona}.\n\n${d.empresa} cambió la tabla de pagos de tu préstamo ${d.folio}.\n\nMotivo: ${d.motivo}\n`
      + (d.url ? `\nLa tabla nueva, y cómo estaba antes: ${d.url}\n` : '') + `\n${noSeContesta(d.empresa)}\n`,
    html: sobre(d.empresa, 'Cambió tu tabla de pagos',
      parrafo(`Hola, ${escapa(d.nombre_persona)}. ${escapa(d.empresa)} cambió la tabla de pagos de tu préstamo <b>${escapa(d.folio)}</b>.`)
      + `<p style="margin:0 0 6px;font-size:13px;color:#6b7a85">Motivo</p><p style="margin:0 0 16px;font-size:15px;line-height:1.6;background:#f6f8fa;border-radius:10px;padding:12px 14px">${escapa(d.motivo)}</p>`
      + boton(d.url, 'Ver la tabla nueva')),
  };
}
