#!/usr/bin/env python3
"""Mide la migración 0015 (la partida del ítem y su orden), como manda OPERAR §7.

`sqlite3` en memoria con las catorce anteriores aplicadas y datos que imitan a
una empresa en uso: un proyecto con sus ítems vendidos y sus compromisos con
proveedores —que en esta base se llaman `partidas`, y por eso esta prueba
existe—.

LO QUE DE VERDAD APORTA, y es lo que una prueba de la API no alcanza a ver:

  · que lo viejo quede **sin partida y en orden cero**. Nada se reacomoda
    solo: un proyecto que alguien ya leía ayer se tiene que ver igual hoy;
  · que **el dinero no se mueva**. Es una columna de acomodo; si el precio de
    venta cambiara al aplicarla, el problema no sería la pantalla;
  · que la tabla `partidas` —los compromisos con proveedores— **siga intacta**
    y separada de `items.partida`. Son dos cosas con el mismo nombre en el
    oficio, y esta prueba es el recordatorio de que no se tocan entre sí;
  · que `PRAGMA foreign_key_check` quede limpio con las llaves prendidas.

    python3 pruebas/migracion-0015.py
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
]
M0015 = (ORG / "0015_partida_orden.sql").read_text(encoding="utf-8")

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

print("· una empresa en uso: un proyecto con ítems y con compromisos de proveedor")
db.execute("INSERT INTO negocios (id, nombre, moneda, creado_at) VALUES ('n1','Taller','MXN','2026-01-01T00:00:00Z')")
db.execute(
    "INSERT INTO clientes (id, negocio_id, nombre, nombre_norm, creado_en_app, creado_at)"
    " VALUES ('c1','n1','Familia','familia','dash101','2026-01-01T00:00:00Z')"
)
db.execute(
    "INSERT INTO proyectos (id, negocio_id, cliente_id, nombre, estado, precio_venta, creado_at)"
    " VALUES ('p1','n1','c1','Casa','activo',0,'2026-01-01T00:00:00Z')"
)
for i, monto in enumerate([800000, 800000, 1500000], start=1):
    db.execute(
        "INSERT INTO items (id, negocio_id, proyecto_id, cliente_id, nombre, monto, estado, creado_at, creado_por)"
        f" VALUES ('i{i}','n1','p1','c1','Puerta {i}',{monto},'vendido','2026-01-0{i}T00:00:00Z','u1')"
    )
db.execute(
    "INSERT INTO partidas (id, proyecto_id, proveedor_nombre, concepto, monto_acordado, creado_at)"
    " VALUES ('pa1','p1','Herrería López','Herrería de la escalera',450000,'2026-01-01T00:00:00Z')"
)
venta_antes = uno(db, "SELECT SUM(monto) FROM items WHERE proyecto_id='p1' AND estado='vendido'")

print("· se aplica 0015")
db.executescript(M0015)

cols = {f[1]: f for f in db.execute("PRAGMA table_info(items)").fetchall()}
revisa("partida" in cols and "orden" in cols, "el ítem gana `partida` y `orden`")

sin_partida = uno(db, "SELECT COUNT(*) FROM items WHERE partida = ''")
en_cero = uno(db, "SELECT COUNT(*) FROM items WHERE orden = 0")
revisa(sin_partida == 3, "todo lo viejo queda sin partida", f"{sin_partida} de 3")
revisa(en_cero == 3, "y en orden cero: nada se reacomoda solo", f"{en_cero} de 3")

venta = uno(db, "SELECT SUM(monto) FROM items WHERE proyecto_id='p1' AND estado='vendido'")
revisa(venta == venta_antes, "el dinero no se movió", f"{venta} == {venta_antes}")

print("· y la tabla `partidas` (los compromisos con proveedores) sigue aparte")
compromisos = uno(db, "SELECT COUNT(*) FROM partidas WHERE proyecto_id='p1'")
acordado = uno(db, "SELECT monto_acordado FROM partidas WHERE id='pa1'")
revisa(compromisos == 1 and acordado == 450000, "intacta, y no se mezcló con la columna nueva")
db.execute("UPDATE items SET partida = 'Cocina' WHERE id = 'i1'")
revisa(
    uno(db, "SELECT monto_acordado FROM partidas WHERE id='pa1'") == 450000,
    "poner la partida de un ítem no toca el compromiso del proveedor",
)

print("· acomodar dentro de la partida")
db.execute("UPDATE items SET partida = 'Cocina', orden = 2 WHERE id = 'i2'")
db.execute("UPDATE items SET orden = 1 WHERE id = 'i1'")
en_orden = [f[0] for f in db.execute(
    "SELECT id FROM items WHERE proyecto_id='p1' AND partida='Cocina' ORDER BY orden, creado_at"
).fetchall()]
revisa(en_orden == ["i1", "i2"], "salen en el orden que se les puso", str(en_orden))

indices = {f[1] for f in db.execute("PRAGMA index_list(items)").fetchall()}
revisa("items_partida" in indices, "y hay índice por proyecto, partida y orden")

malas = db.execute("PRAGMA foreign_key_check").fetchall()
revisa(not malas, "ninguna llave foránea rota", str(malas[:3]))

print()
if fallas:
    print(f"FALLARON {fallas}")
    sys.exit(1)
print("Todo bien.")
