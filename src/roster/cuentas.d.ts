/* La firma de cuentas.js (las reglas de las cuentas del panel de roster101:
 * niveles, permisos y candados), para las pruebas en TypeScript. */
export const NIVELES: readonly string[];
export const NOMBRE_NIVEL: Record<string, string>;
export const DICE_NIVEL: Record<string, string>;
export function puede(nivel: string | undefined, que: string): boolean;
export function permisosDe(nivel: string | undefined): Record<string, boolean>;
export function nivelValido(n: unknown): boolean;
export interface CuentaPanel { id: string; email: string; nivel: string; activo: number | boolean; nombre?: string }
export function duenosActivos(cuentas: CuentaPanel[]): number;
export function candado(cuentas: CuentaPanel[], yo: CuentaPanel, objetivo: CuentaPanel | null | undefined, cambio: { borrar?: boolean; activo?: boolean; nivel?: string; nombre?: string }): string | null;
