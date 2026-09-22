/* El código de un ítem: prefijo por tipo y número propuesto por obra.
 *
 * Decisiones de Mike (encargo de quell101, 18-sep-2026):
 *   · Mueble → MW-, Puerta → PT-, Acabado → FX-. «Otro» no lleva prefijo.
 *   · 22-sep-2026, Mike: los tipos son mueble, puerta, acabado y SERVICIO, y
 *     además se levantan REQUERIMIENTOS —lo que apenas se va a aprobar y a
 *     cotizar—. Servicio → SV-, Requerimiento → RQ-.
 *
 *     El requerimiento lleva prefijo propio a propósito: es lo que hace que
 *     al mirar un plano se vea, sin abrir nada, qué está pedido y qué está
 *     vendido. Y cuando se apruebe y se le cambie el tipo, la clave se
 *     vuelve a proponer con el prefijo que le toque; la vieja no se renumera
 *     sola, igual que con todo lo demás.
 *   · El número se propone POR OBRA, no por plano: un código impreso en un
 *     plano tiene que ser único en toda la obra.
 *   · Lo viejo no se renumera. Los códigos con otros prefijos (PTM-, PTX-, P-,
 *     CAR-, E-…) no cuentan: si en la obra hay PT-04 y treinta PTX-, el
 *     siguiente es PT-05.
 *   · No se rellenan huecos: si falta MW-09 y el mayor es MW-11, va MW-12. Un
 *     hueco puede ser un ítem borrado cuyo código anda escrito en un plano.
 *   · La propuesta es editable; el índice único de la base avisa si choca.
 *
 * Es una función pura sobre la lista de ítems de la obra, sin red: así la
 * propuesta también sale bien en modo avión. La usa la pantalla y el Worker.
 */
export const PREFIJOS = { Mueble: 'MW-', Puerta: 'PT-', Acabado: 'FX-', Servicio: 'SV-', Requerimiento: 'RQ-' };

/** El tipo que está EN REVISIÓN. Mike, 22-sep: «el requerimiento es un tipo de
 *  ítem pero que aún está en revisión. Sí aparece en mapa, sí aparece en
 *  ítems, pero está pendiente de cotizarse y autorizarse para entrar en
 *  producción».
 *
 *  Escrito una sola vez y comparado con esta función, no con un `===` suelto
 *  por ahí: es un texto que viaja en la columna `type`, y basta que alguien
 *  guarde «requerimiento» en minúscula desde otra pantalla para que la regla
 *  de producción deje de aplicarse sin que nadie se entere. */
export const REQUERIMIENTO = 'Requerimiento';
export const esRequerimiento = (tipo) => String(tipo || '').trim().toLowerCase() === 'requerimiento';

export function siguienteCodigo(elementos, tipo) {
  const prefijo = PREFIJOS[tipo];
  if (!prefijo) return '';
  const forma = new RegExp(`^${prefijo}(\\d+)$`, 'i');
  let mayor = 0;
  for (const e of elementos || []) {
    const m = forma.exec(String(e?.code || '').trim());
    if (m) mayor = Math.max(mayor, parseInt(m[1], 10));
  }
  return `${prefijo}${String(mayor + 1).padStart(2, '0')}`;
}
