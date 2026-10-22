/* La única llamada a Resend de la API, con el dominio de la suite y su respaldo.
 *
 * Mike, 22-oct-2026: «los correos de suite101 me están reportando que no están
 * llegando […] cómo le hacemos para que no se vaya a correo no deseado».
 * Decidió con botones que los correos salgan de `suite101.app`, la marca y el
 * dominio de las apps, en vez de `envios.taller101.mx`: un remitente que no se
 * parece a la marca ni a las ligas es de lo que más castigan Hotmail y Gmail.
 *
 * Mientras Resend no verifica `correo.suite101.app` (lo da de alta Mike en su
 * cuenta), mandar con él contesta 403 y el correo no sale. Para que el cambio
 * no corte nada, si el remitente nuevo es rechazado se reintenta UNA vez el
 * mismo correo con el dominio de siempre. Cuando el dominio quede verificado el
 * respaldo deja de usarse solo, sin tocar código. */

export const DOMINIO_CORREO = 'correo.suite101.app';
export const DOMINIO_RESPALDO = 'envios.taller101.mx';

/** El mismo remitente, pero con el dominio de respaldo («Suite 101
 *  <acceso@correo.suite101.app>» → «Suite 101 <acceso@envios.taller101.mx>»).
 *  Null si el remitente no es del dominio nuevo: no hay a qué volver. */
export function remitenteDeRespaldo(de) {
  const s = String(de || '');
  return s.includes('@' + DOMINIO_CORREO) ? s.split('@' + DOMINIO_CORREO).join('@' + DOMINIO_RESPALDO) : null;
}

/** Manda `cuerpo` (el JSON de POST /emails de Resend) y devuelve la respuesta.
 *  Un 403 o 422 con el remitente nuevo —dominio sin verificar— se reintenta con
 *  el de respaldo; cualquier otra respuesta se devuelve tal cual. */
export async function mandarPorResend(llave, cuerpo) {
  const pedir = (c) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(c),
  });
  const r = await pedir(cuerpo);
  const respaldo = remitenteDeRespaldo(cuerpo.from);
  if (r.ok || !respaldo || (r.status !== 403 && r.status !== 422)) return r;
  console.error('resend: el remitente nuevo no pasó', r.status, await r.text(), '· se reintenta con', DOMINIO_RESPALDO);
  return pedir({ ...cuerpo, from: respaldo });
}
