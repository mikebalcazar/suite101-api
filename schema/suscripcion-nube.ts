/* Las tres columnas que la migración 0021 le agregó a `suscripciones`.
 *
 * POR QUÉ ESTÁN AQUÍ Y NO DENTRO DE `Suscripcion`, que es su sitio: el chat
 * que escribió esto no puede empujar por `git` —el proxy de la sesión deja
 * leer de GitHub pero no escribir— y tiene que mandar cada archivo COMPLETO
 * por el conector. `schema/tipos.ts` son 1 709 renglones y 90 KB; transcribirlo
 * entero para agregarle doce renglones es cambiar un riesgo pequeño por uno
 * grande, en el archivo del que dependen las catorce aplicaciones.
 *
 * ES DEUDA, y está anotada como tal en claude/nube-estado.md: la próxima vez
 * que alguien toque `schema/tipos.ts` de todos modos, estas tres líneas se
 * mudan a `Suscripcion` y este archivo se borra. Mientras, `SuscripcionFila`
 * es lo que devuelve un SELECT de la tabla, y `Suscripcion` lo que el resto de
 * la API ya conocía.
 */

import type { Suscripcion } from './tipos';

export type SuscripcionFila = Suscripcion & {
  /** Las últimas cuatro letras de la clave, para reconocerla en master101.
   *  Cuatro de doce no sirven para adivinar el resto. */
  clave_pista: string | null;
  /** La llave maestra de la cuenta, ya cifrada con lo que sale de su clave
   *  T101. El servidor la guarda y no puede abrirla: nace en la máquina del
   *  dueño. */
  llave_envuelta: string | null;
  /** La sal del PBKDF2 con que se envolvió. */
  llave_sal: string | null;
};
