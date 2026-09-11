#!/usr/bin/env python3
"""Mide la migración 0002 como manda OPERAR.md §7, sin desplegar nada.

`sqlite3` en memoria, con `0001` aplicada y datos que imitan a `forespot`
(medidos el 11-sep con `cuadre-firestore.yml`: 3 proyectos, una sola partida
de 10,000,000 centavos, pendiente y sin pagar), más un proyecto con dos
partidas para comprobar el orden de los ids. Se cuentan filas antes y
después, se corre `PRAGMA foreign_key_check`, y se comprueba que la suma de
`monto_acordado` y `monto_pagado` sea la misma antes y después, al centavo.

No sustituye a la suite de vitest, que corre la migración en el SQLite del
Durable Object de verdad: complementa. Esto se puede correr en cualquier
máquina con Python y responde en un segundo.

    python3 pruebas/migracion-0002.py
"""

from __future__ import annotations

import json
import pathlib
import sqlite3
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
M0001 = (RAIZ / "migrations/org/0001_inicial.sql").read_text(encoding="utf-8")
M0002 = (RAIZ / "migrations/org/0002_partidas.sql").read_text(encoding="utf-8")

fallas = 0


def revisa(cond: bool, que: str, dato: str = "") -> None:
    global fallas
    marca = "ok " if cond else "MAL"
    print(f"  [{marca}] {que}" + (f" — {dato}" if dato else ""))
    if not cond:
        fallas += 1


db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
db.executescript(M0001)
print(f"SQLite {sqlite3.sqlite_version}; 0001 aplicada")

# ── datos que imitan a forespot ──────────────────────────────────────────
T = "2026-01-15T12:00:00.000Z"
db.execute("INSERT INTO negocios (id, nombre, creado_at) VALUES ('NEG1','Forespot',?)", (T,))
db.execute("INSERT INTO cuentas (id, negocio_id, nombre, tipo, saldo_inicial, creado_at) VALUES ('CTA1','NEG1','Banco','banco',14800000,?)", (T,))
for i in (1, 2, 3):
    db.execute(
        "INSERT INTO clientes (id, negocio_id, nombre, nombre_norm, creado_en_app, creado_at) VALUES (?,?,?,?,?,?)",
        (f"CLI{i}", "NEG1", f"Cliente {i}", f"cliente {i}", "conta-master", T),
    )
db.execute("INSERT INTO proveedores (id, nombre, nombre_norm, creado_en_app, creado_at) VALUES ('PROV1','Maderas','maderas','conta-master',?)", (T,))

# La partida real de forespot: 100,000.00 pesos, pendiente, sin pagar.
partida_real = [{"proveedor_id": "PROV1", "proveedor_nombre": "Maderas", "concepto": "Madera",
                 "monto_acordado": 10000000, "monto_pagado": 0, "estado": "pendiente"}]
# Un proyecto con dos, para ver que los ids salen -p1 y -p2 en orden.
dos = [{"proveedor_id": "PROV1", "concepto": "Herrajes", "monto_acordado": 250050, "monto_pagado": 250050, "estado": "pagado"},
       {"proveedor_nombre": "Vidrios", "concepto": "Cristal", "monto_acordado": 99999, "monto_pagado": 1, "estado": "parcial"}]
proyectos = [
    ("PRO1", "CLI1", json.dumps(partida_real), 85000000),
    ("PRO2", "CLI2", "[]", 0),
    ("PRO3", "CLI3", "[]", 0),
    ("PRO4", "CLI1", json.dumps(dos), 0),
]
for pid, cli, partidas, precio in proyectos:
    db.execute(
        "INSERT INTO proyectos (id, negocio_id, cliente_id, nombre, estado, partidas, precio_venta, creado_at) VALUES (?,?,?,?,?,?,?,?)",
        (pid, "NEG1", cli, f"Proyecto {pid}", "activo", partidas, precio, T),
    )
for i in range(8):
    db.execute(
        "INSERT INTO movimientos (id, negocio_id, tipo, monto, fecha, cuenta_id, proyecto_id, contraparte_tipo, creado_por, creado_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (f"MOV{i+1}", "NEG1", "ingreso" if i % 2 == 0 else "egreso", 3875000, "2026-03-01", "CTA1", "PRO1", "otro", "x", T),
    )


def filas(tabla: str) -> int:
    return db.execute(f"SELECT COUNT(*) FROM {tabla}").fetchone()[0]


def suma_json() -> tuple[int, int, int]:
    n, a, p = db.execute(
        "SELECT COUNT(*), COALESCE(SUM(json_extract(je.value,'$.monto_acordado')),0), COALESCE(SUM(json_extract(je.value,'$.monto_pagado')),0) "
        "FROM proyectos p, json_each(p.partidas) je"
    ).fetchone()
    return int(n), int(a), int(p)


TABLAS_ANTES = ["negocios", "cuentas", "clientes", "proveedores", "proyectos", "movimientos"]
antes = {t: filas(t) for t in TABLAS_ANTES}
n_json, acordado_antes, pagado_antes = suma_json()
print("\nAntes de 0002")
for t, n in antes.items():
    print(f"  {t:<12} {n:>4}")
print(f"  partidas en JSON: {n_json}  Σ acordado {acordado_antes}  Σ pagado {pagado_antes}")

# ── la migración, tal cual la corre el Durable Object ────────────────────
db.executescript(M0002)

print("\nDespués de 0002")
despues = {t: filas(t) for t in TABLAS_ANTES}
for t in TABLAS_ANTES:
    revisa(antes[t] == despues[t], f"{t}: {antes[t]} → {despues[t]} filas, ninguna se perdió")

n_tabla, acordado_despues, pagado_despues = db.execute(
    "SELECT COUNT(*), COALESCE(SUM(monto_acordado),0), COALESCE(SUM(monto_pagado),0) FROM partidas"
).fetchone()
revisa(n_tabla == n_json, "cada partida del JSON es un renglón", f"{n_json} → {n_tabla}")
revisa(acordado_despues == acordado_antes, "Σ monto_acordado igual al centavo", f"{acordado_antes} → {acordado_despues}")
revisa(pagado_despues == pagado_antes, "Σ monto_pagado igual al centavo", f"{pagado_antes} → {pagado_despues}")

cols = [r[1] for r in db.execute("PRAGMA table_info(proyectos)")]
revisa("partidas" not in cols, "proyectos ya no tiene la columna partidas")
revisa("compromiso" in cols, "proyectos tiene la columna compromiso")

comp = dict(db.execute("SELECT id, compromiso FROM proyectos").fetchall())
revisa(comp == {"PRO1": 10000000, "PRO2": 0, "PRO3": 0, "PRO4": 250050 + 99999},
       "compromiso = Σ monto_acordado por proyecto", str(comp))

ids = [r[0] for r in db.execute("SELECT id FROM partidas ORDER BY id")]
revisa(ids == ["PRO1-p1", "PRO4-p1", "PRO4-p2"], "los ids salen del proyecto y la posición", ", ".join(ids))

real = db.execute("SELECT proyecto_id, item_id, proveedor_id, monto_acordado, monto_pagado, estado FROM partidas WHERE id='PRO1-p1'").fetchone()
revisa(real == ("PRO1", None, "PROV1", 10000000, 0, "pendiente"), "la partida de forespot quedó entera y sin ítem", str(real))

orden = db.execute("SELECT concepto, estado FROM partidas WHERE proyecto_id='PRO4' ORDER BY id").fetchall()
revisa(orden == [("Herrajes", "pagado"), ("Cristal", "parcial")], "el orden del JSON se respeta", str(orden))

tipos = db.execute("SELECT typeof(monto_acordado), typeof(monto_pagado) FROM partidas").fetchall()
revisa(all(t == ("integer", "integer") for t in tipos), "el dinero quedó INTEGER en todas las filas")

fk = db.execute("PRAGMA foreign_key_check").fetchall()
revisa(fk == [], "PRAGMA foreign_key_check: sin huérfanos", str(fk) if fk else "")
integ = db.execute("PRAGMA integrity_check").fetchone()[0]
revisa(integ == "ok", "PRAGMA integrity_check", integ)

# Correrla dos veces tiene que tronar (la tabla ya existe): es lo que evita
# que el DO la aplique doble. Se comprueba, no se supone.
try:
    db.executescript(M0002)
    revisa(False, "0002 dos veces debería fallar y no falló")
except sqlite3.OperationalError as e:
    revisa("already exists" in str(e), "0002 no se puede aplicar dos veces", str(e)[:60])

print()
if fallas:
    print(f"RESULTADO: {fallas} comprobación(es) fallaron")
    sys.exit(1)
print("RESULTADO: la migración 0002 cuadra al centavo")
