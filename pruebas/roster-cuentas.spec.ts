/* Las reglas de las cuentas del panel de roster101, sin base: los niveles,
 * sus permisos y los candados. Es la prueba 0110 del Worker de roster101,
 * traída aquí con el módulo (19-sep). */

import { describe, expect, it } from 'vitest';
import { NIVELES, candado, duenosActivos, nivelValido, permisosDe, puede } from '../src/roster/cuentas.js';

describe('roster101 · niveles y permisos (la tabla del encargo)', () => {
  it('son tres niveles: dueño, admin y consulta', () => expect(NIVELES.join(',')).toBe('dueno,admin,consulta'));
  it('dueño puede todo', () => { for (const q of ['expedientes', 'fichas', 'exportar', 'baja', 'cuentas', 'capturar']) expect(puede('dueno', q), q).toBe(true); });
  it('admin todo menos cuentas', () => {
    for (const q of ['expedientes', 'fichas', 'exportar', 'baja', 'capturar']) expect(puede('admin', q), q).toBe(true);
    expect(puede('admin', 'cuentas')).toBe(false);
  });
  it('consulta ve y saca fichas, nada más', () => {
    expect(puede('consulta', 'expedientes')).toBe(true);
    expect(puede('consulta', 'fichas')).toBe(true);
    for (const q of ['exportar', 'baja', 'cuentas', 'capturar']) expect(puede('consulta', q), q).toBe(false);
  });
  it('un nivel que no existe no puede nada, y «arranque» no se da de alta', () => {
    expect(puede('otro', 'expedientes')).toBe(false);
    expect(puede(undefined, 'fichas')).toBe(false);
    expect(nivelValido('arranque')).toBe(false);
    expect(nivelValido('consulta')).toBe(true);
    expect(Object.keys(permisosDe('dueno')).length).toBe(6);
  });
});

describe('roster101 · candados', () => {
  const cuentas = [
    { id: 'd1', email: 'duena@e.mx', nivel: 'dueno', activo: 1 },
    { id: 'a1', email: 'admin@e.mx', nivel: 'admin', activo: 1 },
    { id: 'c1', email: 'consulta@e.mx', nivel: 'consulta', activo: 0 },
  ];
  const duena = cuentas[0];
  it('la dueña no se borra, no se apaga ni se baja a sí misma siendo la última', () => {
    expect(duenosActivos(cuentas)).toBe(1);
    expect(candado(cuentas, duena, duena, { borrar: true })).not.toBeNull();
    expect(candado(cuentas, duena, duena, { activo: false })).not.toBeNull();
    expect(candado(cuentas, duena, duena, { nivel: 'admin' })).not.toBeNull();
    expect(candado(cuentas, duena, duena, { nivel: 'dueno' })).toBeNull();
    expect(candado(cuentas, duena, duena, { nombre: 'Otro nombre' })).toBeNull();
  });
  it('a los demás sí se les puede tocar; una cuenta que no existe da motivo, no truena', () => {
    expect(candado(cuentas, duena, cuentas[1], { borrar: true })).toBeNull();
    expect(candado(cuentas, duena, cuentas[1], { activo: false })).toBeNull();
    expect(candado(cuentas, duena, cuentas[2], { activo: true })).toBeNull();
    expect(candado(cuentas, duena, null, { borrar: true })).not.toBeNull();
  });
  it('con dos dueños uno se puede borrar o bajar, pero nadie se borra a sí mismo; un dueño apagado no cuenta', () => {
    const dos = [...cuentas, { id: 'd2', email: 'otra@e.mx', nivel: 'dueno', activo: 1 }];
    expect(candado(dos, duena, dos[3], { borrar: true })).toBeNull();
    expect(candado(dos, duena, dos[3], { nivel: 'consulta' })).toBeNull();
    expect(candado(dos, duena, duena, { borrar: true })).not.toBeNull();
    const dosUnoApagado = [...cuentas, { id: 'd2', email: 'otra@e.mx', nivel: 'dueno', activo: 0 }];
    expect(candado(dosUnoApagado, duena, duena, { nivel: 'admin' })).not.toBeNull();
  });
});
