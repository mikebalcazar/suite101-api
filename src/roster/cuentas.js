// roster101 — cuentas de administración: niveles, permisos y candados
//
// Aquí no hay base ni Worker: son las reglas solas, para que se puedan probar
// sin levantar nada (pruebas/0110-reglas-de-cuentas.mjs). Lo que toca la base
// vive en index.js.

// Tres niveles. El de arriba manda sobre las cuentas; el de abajo solo mira.
export const NIVELES = ['dueno', 'admin', 'consulta'];

export const NOMBRE_NIVEL = {
  dueno: 'Dueño',
  admin: 'Administración',
  consulta: 'Consulta',
};

export const DICE_NIVEL = {
  dueno: 'Todo, y además maneja las cuentas de este panel.',
  admin: 'Ve, captura, exporta y da de baja. No toca las cuentas.',
  consulta: 'Solo ve expedientes y saca fichas. No exporta ni da de baja.',
};

// Qué puede hacer cada nivel. La tabla es la del encargo, tal cual:
//   expedientes  ver la lista y abrir cada expediente
//   fichas       fichas en PDF (con o sin documentos)
//   exportar     el ZIP con todo y la tabla en CSV
//   baja         mandar a la papelera, devolver y borrar ya
//   cuentas      crear, cambiar, apagar y borrar cuentas de este panel
//   capturar     escribir en el expediente de alguien. No está en la tabla del
//                encargo; se le niega a consulta porque «consulta» es mirar.
const PERMISOS = {
  dueno:    { expedientes: true, fichas: true, exportar: true,  baja: true,  cuentas: true,  capturar: true },
  admin:    { expedientes: true, fichas: true, exportar: true,  baja: true,  cuentas: false, capturar: true },
  consulta: { expedientes: true, fichas: true, exportar: false, baja: false, cuentas: false, capturar: false },
};

export function puede(nivel, que) {
  return !!(PERMISOS[nivel] && PERMISOS[nivel][que]);
}

export function permisosDe(nivel) {
  return { ...(PERMISOS[nivel] || {}) };
}

export function nivelValido(n) {
  return NIVELES.includes(n);
}

/* ─────────── la contraseña se fue a la suite ───────────
 * Hasta el 0.11 este panel tenía su propia contraseña y aquí vivían las reglas
 * para escogerla. Desde el 0.12 la sesión la da la suite 101: el correo, el
 * código, el PIN y la contraseña son los mismos de todas las apps, y las reglas
 * viven en `suite101-api` (`src/lib.ts`, `revisaClave`). Aquí no quedó nada que
 * revisar, y dejar una copia sin uso sólo invita a que las dos se separen.
 */

/* ─────────── los candados ───────────
 * Se deciden aquí, con la lista de cuentas en la mano, para que se puedan
 * probar sin base. `cuentas` son los renglones tal cual; `yo` es la cuenta de
 * quien está pidiendo el cambio; `objetivo` la que se quiere tocar.
 */

export function duenosActivos(cuentas) {
  return cuentas.filter((c) => c.nivel === 'dueno' && c.activo).length;
}

// ¿Se puede quitar de en medio a `objetivo` (borrarla, apagarla o bajarla de
// dueño)? Devuelve el motivo por el que no, o null.
export function candado(cuentas, yo, objetivo, cambio) {
  if (!objetivo) return 'Esa cuenta no existe.';
  const esYo = String(objetivo.id) === String(yo.id);

  if (cambio.borrar || cambio.activo === false) {
    if (esYo) return cambio.borrar ? 'No te puedes borrar a ti misma.' : 'No te puedes desactivar a ti misma.';
  }

  // El último dueño en pie no se borra, no se apaga y no se baja de nivel: sin
  // él nadie podría volver a manejar las cuentas.
  const esUltimoDueno = objetivo.nivel === 'dueno' && objetivo.activo && duenosActivos(cuentas) <= 1;
  if (esUltimoDueno) {
    if (cambio.borrar) return 'Es la única cuenta de dueño activa: no se puede borrar. Nombra a otro dueño primero.';
    if (cambio.activo === false) return 'Es la única cuenta de dueño activa: no se puede desactivar. Nombra a otro dueño primero.';
    if (cambio.nivel && cambio.nivel !== 'dueno') return 'Es la única cuenta de dueño activa: no se puede bajar de nivel. Nombra a otro dueño primero.';
  }
  return null;
}
