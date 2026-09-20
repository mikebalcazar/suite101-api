#!/usr/bin/env python3
"""Mide la migración 0017 (el producto del catálogo), como manda OPERAR §7.

`sqlite3` en memoria con las dieciséis anteriores aplicadas y una empresa con
un proyecto de puertas: varias piezas del mismo modelo, cada una su renglón.

LO QUE DE VERDAD APORTA, y es lo que una prueba de la API no alcanza a ver:

  · que **el dinero no se mueva al aplicarla**. La columna nace en NULL, que
    quiere decir «este ítem es su propio producto único»: es exactamente lo
    que los ítems que ya existen son hoy, así que el precio de venta del
    proyecto tiene que salir igual del otro lado;
  · que el código de catálogo NO SE REPITA dentro de una empresa, que es para
    lo que existe el índice, y que a la vez **varios productos sin código
    quepan juntos** — un producto nace sin código cuando sale de agrupar dos
    piezas, y si el índice fuera total, el segundo sin código chocaría con el
    primero y agrupar reventaría en la cara de quien agrupa;
  · que dos empresas SÍ puedan usar el mismo código, porque el catálogo es de
    cada quien;
  · que la llave foránea de `items.producto_id` muerda de verdad, con las
    llaves prendidas, y que no se pueda borrar un producto que todavía tiene
    piezas colgando;
  · que no se haya roto ninguna otra llave foránea.

    python3 pruebas/migracion-0017.py
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
    "0015_partida_orden.sql", "0016_alcance_item.sql",
]
M0017 = (ORG / "0017_productos.sql").read_text(encoding="utf-8")

fallas = 0


def revisa(cond: bool, que: str, dato: str = "") -> None:
    global fallas
    marca = "ok " if cond else "MAL"
    print(f"  [{marca}] {que}" + (f" — {dato}" if dato else ""))
    if not cond:
        fallas += 1


def uno(db: sqlite3.Connection, sql: str, *args):
    return db.execute(sql, args).fetchone()[0]


def revienta(db: sqlite3.Connection, sql: str, *args) -> bool:
    """True si la base RECHAZA la escritura. Se deshace lo que alcanzó a
    entrar, para que una prueba no le deje basura a la siguiente."""
    try:
        db.execute(sql, args)
    except sqlite3.IntegrityError:
        return True
    db.rollback()
    return False


db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
for nombre in ANTERIORES:
    db.executescript((ORG / nombre).read_text(encoding="utf-8"))

print("· una obra con puertas: cada pieza su renglón, como están hoy")
for neg in ("n1", "n2"):
    db.execute("INSERT INTO negocios (id, nombre, moneda, creado_at) VALUES (?,?,'MXN','2026-01-01T00:00:00Z')",
               (neg, "Taller " + neg))
db.execute(
    "INSERT INTO clientes (id, negocio_id, nombre, nombre_norm, creado_en_app, creado_at)"
    " VALUES ('c1','n1','Familia','familia','dash101','2026-01-01T00:00:00Z')"
)
db.execute(
    "INSERT INTO proyectos (id, negocio_id, cliente_id, nombre, estado, precio_venta, creado_at)"
    " VALUES ('p1','n1','c1','Casa','activo',0,'2026-01-01T00:00:00Z')"
)
for n in range(1, 6):
    db.execute(
        "INSERT INTO items (id, negocio_id, proyecto_id, cliente_id, clave, nombre, monto, cantidad, estado,"
        " creado_at, creado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (f"i{n}", "n1", "p1", "c1", f"PT-0{n}", f"Puerta {n:02d}", 4000000, 1, "vendido",
         "2026-01-02T00:00:00Z", "u1"),
    )
vendido_antes = uno(db, "SELECT SUM(monto) FROM items WHERE proyecto_id='p1' AND estado='vendido'")

print("· se aplica 0017")
db.executescript(M0017)

cols = {f[1] for f in db.execute("PRAGMA table_info(items)").fetchall()}
revisa("producto_id" in cols, "el ítem gana la columna del producto")
revisa(uno(db, "SELECT COUNT(*) FROM items WHERE producto_id IS NULL") == 5,
       "y las cinco puertas quedan sin producto: cada una es su producto único, que es lo que son hoy")
revisa(uno(db, "SELECT SUM(monto) FROM items WHERE proyecto_id='p1' AND estado='vendido'") == vendido_antes,
       "el dinero no se movió", f"{vendido_antes}")

print("· el catálogo: un código no se repite dentro de una empresa")
db.execute(
    "INSERT INTO productos (id, negocio_id, codigo, nombre, precio, creado_at, creado_por)"
    " VALUES ('pr1','n1','PUE-A','Puerta modelo A',4000000,'2026-02-01T00:00:00Z','u1')"
)
revisa(
    revienta(db, "INSERT INTO productos (id, negocio_id, codigo, nombre, precio, creado_at, creado_por)"
                 " VALUES ('pr2','n1','PUE-A','Otra puerta',100,'2026-02-01T00:00:00Z','u1')"),
    "dos productos con el mismo código en la misma empresa: rechazado",
)
db.execute(
    "INSERT INTO productos (id, negocio_id, codigo, nombre, precio, creado_at, creado_por)"
    " VALUES ('pr9','n2','PUE-A','Puerta de otro taller',900,'2026-02-01T00:00:00Z','u1')"
)
revisa(uno(db, "SELECT COUNT(*) FROM productos WHERE codigo='PUE-A'") == 2,
       "pero otra empresa sí puede usar ese código: el catálogo es de cada quien")

print("· y varios sin código caben juntos, que es como nacen al agrupar")
for pid in ("pr3", "pr4", "pr5"):
    db.execute(
        "INSERT INTO productos (id, negocio_id, nombre, precio, creado_at, creado_por)"
        " VALUES (?,'n1','Sin catalogar',0,'2026-02-01T00:00:00Z','u1')", (pid,)
    )
revisa(uno(db, "SELECT COUNT(*) FROM productos WHERE negocio_id='n1' AND codigo=''") == 3,
       "tres productos sin código conviven", "el índice es parcial")

print("· las piezas entran al producto y el apuntador muerde")
db.execute("UPDATE items SET producto_id='pr1' WHERE id IN ('i1','i2','i3')")
revisa(uno(db, "SELECT COUNT(*) FROM items WHERE producto_id='pr1'") == 3, "tres puertas son el modelo A")
revisa(revienta(db, "UPDATE items SET producto_id='no-existe' WHERE id='i4'"),
       "apuntar a un producto que no existe: rechazado")
revisa(revienta(db, "DELETE FROM productos WHERE id='pr1'"),
       "borrar un producto con piezas colgando: rechazado")

print("· moverse de grupo es cambiar el apuntador, y salirse es ponerlo en NULL")
db.execute(
    "INSERT INTO productos (id, negocio_id, codigo, nombre, precio, creado_at, creado_por)"
    " VALUES ('pr6','n1','PUE-B','Puerta modelo B',5500000,'2026-02-01T00:00:00Z','u1')"
)
db.execute("UPDATE items SET producto_id='pr6' WHERE id='i3'")
revisa(uno(db, "SELECT producto_id FROM items WHERE id='i3'") == "pr6",
       "la puerta 03 pasó de modelo A a modelo B sin dejar de existir")
db.execute("UPDATE items SET producto_id=NULL WHERE id='i2'")
revisa(uno(db, "SELECT producto_id FROM items WHERE id='i2'") is None,
       "y la puerta 02 se salió: vuelve a ser su propio producto único")
revisa(uno(db, "SELECT COUNT(*) FROM items WHERE producto_id='pr1'") == 1, "al modelo A le queda una")

indices = {f[1] for f in db.execute("PRAGMA index_list(items)").fetchall()}
revisa("items_producto" in indices, "hay índice por producto")

print("· y no se rompió ninguna llave")
revisa(db.execute("PRAGMA foreign_key_check").fetchall() == [], "foreign_key_check limpio")

print()
if fallas:
    print(f"{fallas} MAL")
    sys.exit(1)
print("migración 0017: todo bien")
