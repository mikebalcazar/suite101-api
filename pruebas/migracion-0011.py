#!/usr/bin/env python3
"""Mide la migración 0011 (la cantidad del ítem), como manda OPERAR §7.

`sqlite3` en memoria con las diez anteriores aplicadas y datos que imitan a
una empresa en uso: un proyecto con su precio de venta y sus ítems vendidos,
y una obra con su plano y sus piezas.

LO QUE DE VERDAD APORTA, y es lo que una prueba de la API no alcanza a ver:

  · que **el dinero no se mueva**. `monto` sigue siendo el importe de la
    línea; si la migración le hubiera cambiado el significado, el precio de
    venta de todos los proyectos que ya existen valdría otra cosa mañana;
  · que todo lo viejo quede en `cantidad = 1`. Uno es lo que siempre quiso
    decir un ítem sin cantidad, y es lo que hace que nada cambie;
  · que borrar un ítem NO borre la pieza del plano. Es `ON DELETE SET NULL`:
    la pieza está dibujada en un plano que alguien usa en obra, y una
    decisión de ventas no se la lleva;
  · que `PRAGMA foreign_key_check` quede limpio con las llaves prendidas.

    python3 pruebas/migracion-0011.py
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
    "0008_ordenes.sql", "0009_fiscal.sql", "0010_obras.sql",
]
M0011 = (ORG / "0011_cantidad.sql").read_text(encoding="utf-8")

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

print("· una empresa en uso: un proyecto vendido y una obra con su plano")
db.execute("INSERT INTO negocios (id, nombre, moneda, creado_at) VALUES ('n1','Taller','MXN','2026-01-01T00:00:00Z')")
db.execute("INSERT INTO clientes (id, negocio_id, nombre, nombre_norm, creado_en_app, creado_at)"
           " VALUES ('c1','n1','Familia Uno','familia uno','dash101','2026-01-01T00:00:00Z')")
db.execute("INSERT INTO proyectos (id, negocio_id, cliente_id, nombre, precio_venta, creado_at)"
           " VALUES ('p1','n1','c1','Casa Uno',4200000,'2026-01-02T00:00:00Z')")
for iid, nombre, monto in (("i1", "Puerta", 3000000), ("i2", "Barra", 1200000)):
    db.execute(
        "INSERT INTO items (id, negocio_id, proyecto_id, cliente_id, nombre, monto, estado, creado_at, creado_por)"
        " VALUES (?,?,?,?,?,?, 'vendido','2026-01-03T00:00:00Z','u1')", (iid, "n1", "p1", "c1", nombre, monto))
db.execute("INSERT INTO quell_users (id, email, name, role) VALUES ('qu1','jefe@ejemplo.mx','Jefe','admin')")
db.execute("INSERT INTO quell_projects (id, name, client, created_by, proyecto_id) VALUES ('o1','Casa Uno (obra)','Familia Uno','qu1','p1')")
db.execute("INSERT INTO quell_plans (id, project_id, name, image_key, width, height)"
           " VALUES ('pl1','o1','Planta','orgs/x/quell/plans/a.png',1000,800)")
db.execute("INSERT INTO quell_elements (id, plan_id, project_id, code, name, x, y)"
           " VALUES ('e1','pl1','o1','M01','Puerta 1',0.5,0.5)")
db.commit()

precio_antes = uno(db, "SELECT precio_venta FROM proyectos WHERE id = 'p1'")
suma_antes = uno(db, "SELECT COALESCE(SUM(monto),0) FROM items")
piezas_antes = uno(db, "SELECT COUNT(*) FROM quell_elements")

print("\n· se aplica 0011")
db.executescript(M0011)
db.commit()

print("\n· el dinero no se movió")
revisa(uno(db, "SELECT precio_venta FROM proyectos WHERE id = 'p1'") == precio_antes,
       "el precio de venta es el mismo", f"{precio_antes} centavos")
revisa(uno(db, "SELECT COALESCE(SUM(monto),0) FROM items") == suma_antes,
       "y la suma de los ítems también", f"{suma_antes} centavos")
revisa(uno(db, "SELECT monto FROM items WHERE id = 'i1'") == 3000000,
       "`monto` sigue siendo el importe de la línea, no el de una pieza")

print("\n· lo viejo vale uno, que es lo que siempre quiso decir")
revisa(uno(db, "SELECT COUNT(*) FROM items WHERE cantidad = 1") == 2, "los dos ítems nacen con cantidad 1")
revisa(uno(db, "SELECT COUNT(*) FROM quell_elements WHERE item_id IS NULL") == piezas_antes,
       "y ninguna pieza del plano se cuelga sola de un ítem")

print("\n· la cantidad y la liga con la pieza")
db.execute("UPDATE items SET cantidad = 20 WHERE id = 'i1'")
db.execute("UPDATE quell_elements SET item_id = 'i1' WHERE id = 'e1'")
db.commit()
revisa(uno(db, "SELECT cantidad FROM items WHERE id = 'i1'") == 20, "20 puertas en un solo renglón")
revisa(uno(db, "SELECT COUNT(*) FROM quell_elements WHERE item_id = 'i1'") == 1, "una ya está ubicada")
revisa(uno(db, "SELECT cantidad - (SELECT COUNT(*) FROM quell_elements e WHERE e.item_id = i.id) FROM items i WHERE i.id = 'i1'") == 19,
       "faltan 19 por ubicar")

try:
    db.execute("UPDATE quell_elements SET item_id = 'no-existe' WHERE id = 'e1'")
    db.rollback()
    revisa(False, "colgarse de un ítem que no existe se rechaza")
except sqlite3.IntegrityError:
    db.rollback()
    revisa(True, "colgarse de un ítem que no existe se rechaza")

print("\n· borrar el ítem NO borra la pieza del plano")
db.execute("DELETE FROM items WHERE id = 'i1'")
db.commit()
revisa(uno(db, "SELECT COUNT(*) FROM quell_elements WHERE id = 'e1'") == 1, "la pieza sigue dibujada")
revisa(uno(db, "SELECT item_id FROM quell_elements WHERE id = 'e1'") is None, "y quedó sin ítem, no borrada")
revisa(not db.execute("PRAGMA foreign_key_check").fetchall(), "las llaves siguen limpias")

print(f"\n{'TODO BIEN' if not fallas else f'{fallas} FALLA(S)'} · migración 0011\n")
sys.exit(1 if fallas else 0)
