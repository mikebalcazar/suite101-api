/* `migrations/org/0001_inicial.sql` y `src/tablas.ts` describen la misma base
 * desde dos lados: uno la crea, el otro le da forma a las respuestas. Si se
 * separan, el CRUD genérico empieza a perder columnas en silencio —devuelve
 * una fila sin el campo, y nadie ve un error—. Esta prueba los compara. */

import { describe, expect, it } from 'vitest';
import inicial from '../migrations/org/0001_inicial.sql';
import { DEFS } from '../src/tablas';
import { TABLAS } from '../schema/tipos';

/** Saca {tabla: [columnas]} del SQL, sin motor: basta con leerlo. */
function columnasDelSql(sql: string): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  const limpio = sql.replace(/--[^\n]*/g, '');
  for (const m of limpio.matchAll(/CREATE TABLE (\w+)\s*\(([\s\S]*?)\)\s*;/g)) {
    const [, tabla, cuerpo] = m;
    const cols: string[] = [];
    let nivel = 0;
    let pieza = '';
    for (const ch of cuerpo) {
      if (ch === '(') nivel++;
      if (ch === ')') nivel--;
      if (ch === ',' && nivel === 0) { cols.push(pieza); pieza = ''; } else pieza += ch;
    }
    cols.push(pieza);
    salida[tabla] = cols
      .map((c) => c.trim().split(/\s+/)[0])
      .filter((c) => c && !['PRIMARY', 'FOREIGN', 'CHECK', 'UNIQUE', 'CONSTRAINT'].includes(c.toUpperCase()));
  }
  return salida;
}

const delSql = columnasDelSql(inicial);
/** El mismo SQL sin comentarios: si no, se mide lo que dicen las notas. */
const sinNotas = inicial.replace(/--[^\n]*/g, '');

describe('el esquema del OrgDB', () => {
  it('tiene las trece tablas del documento, ni una más', () => {
    expect(Object.keys(delSql).sort()).toEqual([...TABLAS].sort());
    expect(TABLAS.length).toBe(13);
  });

  for (const tabla of TABLAS) {
    it(`${tabla}: las columnas del SQL y las de tablas.ts coinciden`, () => {
      expect(Object.keys(DEFS[tabla].cols).sort()).toEqual(delSql[tabla].sort());
    });
  }

  it('el dinero es INTEGER en todas partes: ni un REAL', () => {
    const reales = [...sinNotas.matchAll(/(\w+)\s+REAL\b/gi)].map((m) => m[1]);
    // `avance` es una proporción de 0 a 1, no dinero. Es el único REAL que hay.
    expect(reales).toEqual(['avance']);
    for (const col of ['monto', 'total', 'saldo_inicial', 'precio_venta', 'cobrado', 'pagado_prov']) {
      expect(sinNotas).toMatch(new RegExp(`${col}\\s+INTEGER`));
    }
  });

  it('no queda ni un «producto» en el esquema: se dice ítem', () => {
    expect(sinNotas.toLowerCase()).not.toMatch(/producto/);
  });
});
