#!/usr/bin/env python3
"""Mide la migración 0003 como manda OPERAR.md §7, sin desplegar nada.

`sqlite3` en memoria con `0001` y `0002` aplicadas y datos que imitan a una
empresa en uso: tres cuentas (banco, caja y tarjeta), movimientos y un
proyecto con su partida. Se cuenta todo antes y después, se comprueba que
`negocios` gane la columna `dia_conciliacion` con el lunes por omisión y sin
perder ninguna fila, que las dos tablas nuevas nazcan vacías, que las llaves
foráneas queden limpias y que **ningún dinero de lo que ya había cambie**:
esta migración sólo agrega.

No sustituye a la suite de vitest, que corre la migración en el SQLite del
Durable Object de verdad: complementa. Esto corre en cualquier máquina con
Python y responde en un segundo.

    python3 pruebas/migracion-0003.py
"""

from __future__ import annotations

import pathlib
import sqlite3
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
M0001 = (RAIZ / "migrations/org/0001_inicial.sql").read_text(encoding="utf-8")
M0002 = (RAIZ / "migrations/org/0002_partidas.sql").read_text(encoding="utf-8")
M0003 = (RAIZ / "migrations/org/0003_conciliaciones.sql").read_text(encoding="utf-8")

fallas = 0


def revisa(cond: bool, que: str, dato: str = "") -> None:
    global fallas
    marca = "ok " if cond else "MAL"
    print(f"  [{marca}] {que}" + (f" — {dato}" if dato else ""))
    if not cond:
        fallas += 1


def uno(db: sqlite3.Connection, sql: str, *args):
    return db.execute(sql, args).fetchone()[0]


db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
db.executescript(M0001)
db.executescript(M0002)
print(f"SQLite {sqlite3.sqlite_version}; 0001 y 0002 aplicadas")

# ── datos de una empresa en uso ──────────────────────────────────────────
T = "2026-09-01T12:00:00.000Z"
db.execute("INSERT INTO negocios (id, nombre, creado_at) VALUES ('NEG1','Taller',?)", (T,))
db.execute("INSERT INTO negocios (id, nombre, creado_at) VALUES ('NEG2','Obra',?)", (T,))
CUENTAS = [("CTA1", "Banco", "banco", 25000000), ("CTA2", "Caja", "caja", 500000), ("CTA3", "Tarjeta", "credito", -3000000)]
for cid, nombre, tipo, saldo in CUENTAS:
    db.execute(
        "INSERT INTO cuentas (id, negocio_id, nombre, tipo, saldo_inicial, creado_at) VALUES (?,?,?,?,?,?)",
        (cid, "NEG1", nombre, tipo, saldo, T),
    )
db.execute("INSERT INTO clientes (id, negocio_id, nombre, nombre_norm, creado_en_app, creado_at) VALUES ('CLI1','NEG1','Familia','familia','dash101',?)", (T,))
db.execute(
    "INSERT INTO proyectos (id, negocio_id, cliente_id, nombre, estado, precio_venta, cobrado, pagado_prov, creado_at)"
    " VALUES ('PRO1','NEG1','CLI1','Cocina','activo',18500000,12000000,2500000,?)",
    (T,),
)
db.execute(
    "INSERT INTO partidas (id, proyecto_id, proveedor_nombre, concepto, monto_acordado, monto_pagado, estado, creado_at)"
    " VALUES ('PRO1-p1','PRO1','Maderas','Tablero',4200000,2500000,'parcial',?)",
    (T,),
)
MOVS = [("MOV1", "ingreso", 12000000, "CTA1"), ("MOV2", "egreso", 2500000, "CTA1"), ("MOV3", "egreso", 850000, "CTA2")]
for mid, tipo, monto, cta in MOVS:
    db.execute(
        "INSERT INTO movimientos (id, negocio_id, tipo, monto, fecha, cuenta_id, creado_por, creado_at)"
        " VALUES (?,?,?,?,?,?,?,?)",
        (mid, "NEG1", tipo, monto, "2026-09-02", cta, "UID", T),
    )

antes = {
    "negocios": uno(db, "SELECT COUNT(*) FROM negocios"),
    "cuentas": uno(db, "SELECT COUNT(*) FROM cuentas"),
    "movimientos": uno(db, "SELECT COUNT(*) FROM movimientos"),
    "proyectos": uno(db, "SELECT COUNT(*) FROM proyectos"),
    "partidas": uno(db, "SELECT COUNT(*) FROM partidas"),
}
dinero_antes = {
    "cuentas.saldo_inicial": uno(db, "SELECT COALESCE(SUM(saldo_inicial),0) FROM cuentas"),
    "movimientos.monto": uno(db, "SELECT COALESCE(SUM(monto),0) FROM movimientos"),
    "partidas.monto_acordado": uno(db, "SELECT COALESCE(SUM(monto_acordado),0) FROM partidas"),
    "proyectos.cobrado": uno(db, "SELECT COALESCE(SUM(cobrado),0) FROM proyectos"),
}

# ── la migración ─────────────────────────────────────────────────────────
print("\n0003 aplicada\n")
db.executescript(M0003)

despues = {k: uno(db, f"SELECT COUNT(*) FROM {k}") for k in antes}
revisa(antes == despues, "ninguna tabla que ya existía perdió o ganó filas", f"{antes} → {despues}")

dinero_despues = {
    "cuentas.saldo_inicial": uno(db, "SELECT COALESCE(SUM(saldo_inicial),0) FROM cuentas"),
    "movimientos.monto": uno(db, "SELECT COALESCE(SUM(monto),0) FROM movimientos"),
    "partidas.monto_acordado": uno(db, "SELECT COALESCE(SUM(monto_acordado),0) FROM partidas"),
    "proyectos.cobrado": uno(db, "SELECT COALESCE(SUM(cobrado),0) FROM proyectos"),
}
for llave, valor in dinero_antes.items():
    revisa(dinero_despues[llave] == valor, f"{llave} no cambió", f"{valor} → {dinero_despues[llave]}")

revisa(uno(db, "SELECT COUNT(*) FROM conciliaciones") == 0, "`conciliaciones` nace vacía")
revisa(uno(db, "SELECT COUNT(*) FROM conciliacion_cuentas") == 0, "`conciliacion_cuentas` nace vacía")

dias = db.execute("SELECT id, dia_conciliacion FROM negocios ORDER BY id").fetchall()
revisa(all(d == 1 for _, d in dias), "los negocios que ya existían quedan en lunes (1)", str(dias))

# ── que las tablas nuevas sirvan de verdad ───────────────────────────────
db.execute("INSERT INTO conciliaciones (id, negocio_id, corte_at, hecha_por, creado_at) VALUES ('C1','NEG1',?, 'UID', ?)", (T, T))
# El banco: registrado 25,000,000 + 12,000,000 − 2,500,000 = 34,500,000.
# El real son 34,420,000: faltan 80,000 centavos ($800), el caso de la tarea.
db.execute(
    "INSERT INTO movimientos (id, negocio_id, tipo, monto, fecha, cuenta_id, categoria, creado_por, creado_at)"
    " VALUES ('AJU1','NEG1','egreso',80000,'2026-09-07','CTA1','ajuste_conciliacion','UID',?)",
    (T,),
)
db.execute(
    "INSERT INTO conciliacion_cuentas (id, conciliacion_id, cuenta_id, saldo_registrado, saldo_real, diferencia, movimiento_id, creado_at)"
    " VALUES ('CC1','C1','CTA1',34500000,34420000,80000,'AJU1',?)",
    (T,),
)
db.execute(
    "INSERT INTO conciliacion_cuentas (id, conciliacion_id, cuenta_id, saldo_registrado, saldo_real, diferencia, movimiento_id, creado_at)"
    " VALUES ('CC2','C1','CTA2',-350000,-350000,0,NULL,?)",
    (T,),
)
registrado = uno(db, "SELECT saldo_registrado FROM conciliacion_cuentas WHERE id = 'CC1'")
real = uno(db, "SELECT saldo_real FROM conciliacion_cuentas WHERE id = 'CC1'")
ajuste = uno(db, "SELECT monto FROM movimientos WHERE id = 'AJU1'")
revisa(registrado - real == ajuste == 80000, "la diferencia y el ajuste cuadran al centavo", f"{registrado} − {real} = {ajuste}")
nuevo_saldo = 25000000 + uno(db, "SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END),0) FROM movimientos WHERE cuenta_id = 'CTA1'")
revisa(nuevo_saldo == real, "con el ajuste, el saldo del banco queda igual al real", f"{nuevo_saldo}")
revisa(uno(db, "SELECT COUNT(*) FROM conciliacion_cuentas WHERE movimiento_id IS NULL") == 1, "la cuenta que cuadró no tiene ajuste")

# El ajuste no toca ningún proyecto: por eso los cachés no se mueven.
revisa(uno(db, "SELECT COUNT(*) FROM movimientos WHERE categoria = 'ajuste_conciliacion' AND proyecto_id IS NOT NULL") == 0,
       "ningún ajuste cuelga de un proyecto")
revisa(uno(db, "SELECT cobrado FROM proyectos WHERE id = 'PRO1'") == 12000000, "el proyecto no se movió")

malas = db.execute("PRAGMA foreign_key_check").fetchall()
revisa(not malas, "foreign_key_check limpio", str(malas))
revisa(db.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "integrity_check limpio")

# ── aplicarla dos veces tiene que tronar ─────────────────────────────────
try:
    db.executescript(M0003)
    revisa(False, "aplicarla dos veces truena")
except sqlite3.OperationalError as e:
    revisa(True, "aplicarla dos veces truena", str(e).split("\n")[0])

print()
if fallas:
    print(f"FALLAS: {fallas}")
    sys.exit(1)
print("0003 medida: sólo agrega, y lo que ya había queda igual al centavo.")
