/* `migrations/org/*.sql` y `src/tablas.ts` describen la misma base desde dos
 * lados: uno la crea (y la va cambiando, migración a migración), el otro le
 * da forma a las respuestas. Si se separan, el CRUD genérico empieza a perder
 * columnas en silencio —devuelve una fila sin el campo, y nadie ve un error—.
 * Esta prueba los compara, aplicando las migraciones en orden como lo hace el
 * Durable Object al despertar. */

import { describe, expect, it } from 'vitest';
import { DEFS } from '../src/tablas';
import { MIGRACIONES } from '../src/org-db';
import { TABLAS, TABLAS_INTERNAS } from '../schema/tipos';

/* La lista de migraciones se IMPORTA de `src/org-db.ts`, que es quien las
 * aplica. Hasta el 16-sep esta prueba se armaba la suya —tres imports a
 * mano— y se había quedado en la 0003: la 0004 llevaba un día publicada y
 * aquí no existía. No tronó porque lo único que agregaba era `folios`, que el
 * contrato no expone; o sea, se salvó de casualidad. Comparar contra una lista
 * propia es comparar contra una base que no es la que corre. */

/** Saca {tabla: [columnas]} del SQL, sin motor: basta con leerlo. Entiende
 *  CREATE TABLE, ALTER TABLE … ADD COLUMN y ALTER TABLE … DROP COLUMN, que es
 *  todo lo que las migraciones usan. */
function columnasDelSql(migraciones: string[]): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const sql of migraciones) {
    const limpio = sql.replace(/--[^\n]*/g, '');
    // `IF NOT EXISTS` es parte del patrón a propósito: las migraciones lo usan
    // para poder volver a correr sin tronar. Sin él aquí, el lector se comía la
    // tabla entera en silencio —le pasó a `folios` (0004) y a `ajustes`
    // (0005)—, y una tabla que el lector no ve es una tabla que esta prueba no
    // compara. El conteo de abajo es el que impide que vuelva a pasar.
    for (const m of limpio.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\(([\s\S]*?)\)\s*;/g)) {
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
    for (const m of limpio.matchAll(/ALTER TABLE (\w+) ADD COLUMN (\w+)/g)) salida[m[1]].push(m[2]);
    for (const m of limpio.matchAll(/ALTER TABLE (\w+) DROP COLUMN (\w+)/g)) {
      salida[m[1]] = salida[m[1]].filter((c) => c !== m[2]);
    }
  }
  /* Y que no se haya quedado ninguna fuera. Este conteo es el que convierte un
   * hueco del lector en una falla: sin él, una forma de CREATE TABLE que el
   * patrón no entienda deja la tabla sin comparar y todo sale verde. */
  const declaradas = migraciones
    .map((sql) => sql.replace(/--[^\n]*/g, ''))
    .join('\n')
    .match(/CREATE TABLE\b/g)?.length ?? 0;
  if (declaradas !== Object.keys(salida).length) {
    throw new Error(
      `el lector de SQL entendió ${Object.keys(salida).length} de ${declaradas} CREATE TABLE. ` +
        'Hay una forma de CREATE TABLE que no reconoce, y esa tabla se estaría quedando sin comparar.',
    );
  }
  return salida;
}

const delSql = columnasDelSql(MIGRACIONES);
/** El mismo SQL sin comentarios: si no, se mide lo que dicen las notas. */
const sinNotas = MIGRACIONES.join('\n').replace(/--[^\n]*/g, '');

describe('el esquema del OrgDB', () => {
  it('las tablas del SQL son las del contrato, más las internas, y ninguna otra', () => {
    // Igualdad y no «contiene», en los dos sentidos: una tabla del contrato que
    // el SQL no cree, y una tabla del SQL que el contrato no declare, las dos
    // truenan. Sin número escrito a mano: el número no dice nada que la
    // comparación no diga ya, y hay que acordarse de subirlo.
    expect(Object.keys(delSql).sort()).toEqual([...TABLAS, ...TABLAS_INTERNAS].sort());
  });

  it('0002 se lleva el JSON de partidas del proyecto y le deja el compromiso', () => {
    expect(delSql.proyectos).not.toContain('partidas');
    expect(delSql.proyectos).toContain('compromiso');
    expect(delSql.partidas).toEqual(expect.arrayContaining(['proyecto_id', 'item_id', 'monto_acordado', 'monto_pagado', 'estado']));
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
    for (const col of ['monto', 'total', 'saldo_inicial', 'precio_venta', 'cobrado', 'pagado_prov', 'compromiso', 'monto_acordado', 'monto_pagado']) {
      expect(sinNotas).toMatch(new RegExp(`${col}\\s+INTEGER`));
    }
  });

  it('no queda ni un «producto» en el esquema: se dice ítem', () => {
    expect(sinNotas.toLowerCase()).not.toMatch(/producto/);
  });
});
