#!/usr/bin/env python3
"""Mide la migración 0016 (el alcance del ítem), como manda OPERAR §7.

`sqlite3` en memoria con las quince anteriores aplicadas y una empresa que ya
trae de todo: ítems vendidos, cotizados y cancelados, con sus movimientos y
sus piezas en el plano.

LO QUE DE VERDAD APORTA, y es lo que una prueba de la API no alcanza a ver:

  · que **el dinero no se mueva**. Son tres columnas de clasificación; si el
    precio de venta cambiara al aplicarlas, el problema no sería la pantalla;
  · que el RELLENO deje a los vendidos y a los cancelados con `aprobado_at`.
    De esa columna sale la diferencia entre un cancelado y un descartado, y
    si se quedara vacía, todo lo que ya se canceló pasaría mañana a
    «descartado» —es decir, a «nadie lo aprobó nunca»—, que es falso;
  · que los cotizados de hoy queden SIN `aprobado_at`: ésos de verdad no han
    sido aprobados, y son los que Mike llama requerimientos;
  · que no se haya roto ninguna llave foránea, con las llaves prendidas.

    python3 pruebas/migracion-0016.py
"""

from __future__ import annotations

import pathlib
import sqlite3
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ORG = RAIZ / "migrations/org"
ANTERIORES = [
    "0001_inicial.sql", "0002_partidas.sql", "0003_conciliaciones.sql",
    "0004_folios.sql", "0005_ajustes.sql", "0006_quell.sql", "0007_roster.sql",
    "0008_ordenes.sql", "0009_fiscal.sql", "0010_obras.sql", "0011_cantidad.sql",
    "0012_factura_esperada.sql", "0013_bitacora_precio.sql", "0014_raya.sql",
    "0015_partida_orden.sql",
]
M0016 = (ORG / "0016_alcance_item.sql").read_text(encoding="utf-8")

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
for nombre in ANTERIORES:
    db.executescript((ORG / nombre).read_text(encoding="utf-8"))

print("· una empresa con de todo: vendidos, cotizados y cancelados")
db.execute("INSERT INTO negocios (id, nombre, moneda, creado_at) VALUES ('n1','Taller','MXN','2026-01-01T00:00:00Z')")
db.execute(
    "INSERT INTO clientes (id, negocio_id, nombre, nombre_norm, creado_en_app, creado_at)"
    " VALUES ('c1','n1','Familia','familia','dash101','2026-01-01T00:00:00Z')"
)
db.execute(
    "INSERT INTO proyectos (id, negocio_id, cliente_id, nombre, estado, precio_venta, creado_at)"
    " VALUES ('p1','n1','c1','Casa','activo',0,'2026-01-01T00:00:00Z')"
)
filas = [
    ("i1", "Cocina", 5000000, "vendido"),
    ("i2", "Barra", 1500000, "vendido"),
    ("i3", "Clóset extra", 800000, "cotizado"),
    ("i4", "Pérgola", 900000, "cancelado"),
]
for iid, nombre, monto, estado in filas:
    db.execute(
        "INSERT INTO items (id, negocio_id, proyecto_id, cliente_id, nombre, monto, estado, creado_at, creado_por,"
        " actualizado_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (iid, "n1", "p1", "c1", nombre, monto, estado, "2026-01-02T00:00:00Z", "u1", "2026-02-01T00:00:00Z"),
    )
vendido_antes = uno(db, "SELECT SUM(monto) FROM items WHERE proyecto_id='p1' AND estado='vendido'")

print("· se aplica 0016")
db.executescript(M0016)

cols = {f[1] for f in db.execute("PRAGMA table_info(items)").fetchall()}
revisa({"aprobado_at", "cancelado_at", "cancelado_motivo"} <= cols, "el ítem gana las tres columnas del alcance")

revisa(
    uno(db, "SELECT SUM(monto) FROM items WHERE proyecto_id='p1' AND estado='vendido'") == vendido_antes,
    "el dinero no se movió", f"{vendido_antes}",
)

print("· el relleno de lo que ya existía")
for iid in ("i1", "i2"):
    revisa(uno(db, "SELECT aprobado_at FROM items WHERE id=?", iid) is not None, f"{iid} (vendido) queda aprobado")
revisa(uno(db, "SELECT aprobado_at FROM items WHERE id='i4'") is not None,
       "i4 (cancelado) también: casi todos vienen de quitar un renglón vendido")
revisa(uno(db, "SELECT cancelado_at FROM items WHERE id='i4'") is not None, "y con fecha de cancelación")
revisa(uno(db, "SELECT aprobado_at FROM items WHERE id='i3'") is None,
       "i3 (cotizado) queda SIN aprobar: ése es el requerimiento")

print("· y la clasificación sale de los dos datos")
def alcance(iid: str) -> str:
    estado, aprobado = db.execute("SELECT estado, aprobado_at FROM items WHERE id=?", (iid,)).fetchone()
    if estado == "cancelado":
        return "cancelado" if aprobado else "descartado"
    return "dentro" if estado == "vendido" else "no_aprobado"

revisa(alcance("i1") == "dentro", "la cocina está dentro")
revisa(alcance("i3") == "no_aprobado", "el clóset extra no está aprobado")
revisa(alcance("i4") == "cancelado", "la pérgola está cancelada, no descartada")

db.execute("UPDATE items SET estado='cancelado', cancelado_at='2026-03-01T00:00:00Z' WHERE id='i3'")
revisa(alcance("i3") == "descartado", "y si al clóset extra le dicen que no, queda descartado")

indices = {f[1] for f in db.execute("PRAGMA index_list(items)").fetchall()}
revisa("items_alcance" in indices, "hay índice por proyecto, estado y aprobación")

malas = db.execute("PRAGMA foreign_key_check").fetchall()
revisa(not malas, "ninguna llave foránea rota", str(malas[:3]))

print()
if fallas:
    print(f"FALLARON {fallas}")
    sys.exit(1)
print("Todo bien.")
