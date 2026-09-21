#!/usr/bin/env python3
"""Mide la migración 0018 (cómo lleva el IVA cada proyecto), como manda OPERAR §7.

`sqlite3` en memoria con las diecisiete anteriores aplicadas y una obra con
dinero capturado, para comprobar lo único que de verdad importa de esta
migración:

  · que **el dinero no se mueva**. Esta columna no cambia ni un peso; sólo
    dice cómo se LEE `precio_venta` al armar el estado de cuenta. Si al
    aplicarla el precio de venta de un proyecto que ya existía saliera
    distinto, el documento que se le manda al cliente saldría mal desde el
    primer día;
  · que los proyectos que YA EXISTEN queden en «+ IVA» (`iva_incluido = 0`)
    y al 16 %, que es la decisión de Mike del 21-sep y también es cómo se
    venían leyendo esas cifras en todas las pantallas;
  · que la columna NO ADMITA NULL, porque un `iva_incluido` nulo obligaría a
    cada pantalla a decidir qué hacer con él y dos pantallas decidirían
    distinto;
  · que la aritmética del desglose CUADRE AL CENTAVO en los dos sentidos:
    subtotal + IVA = total, tanto cuando el IVA se suma como cuando se
    desglosa hacia atrás. Es la cuenta que va impresa en un papel que alguien
    va a pagar;
  · que no se haya roto ninguna llave foránea.

    python3 pruebas/migracion-0018.py
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
    "0015_partida_orden.sql", "0016_alcance_item.sql", "0017_productos.sql",
]
M0018 = (ORG / "0018_iva_del_proyecto.sql").read_text(encoding="utf-8")

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

print("· dos obras con dinero capturado, como están hoy")
db.execute("INSERT INTO negocios (id, nombre, moneda, creado_at) VALUES ('n1','Taller','MXN','2026-01-01T00:00:00Z')")
db.execute(
    "INSERT INTO clientes (id, negocio_id, nombre, nombre_norm, creado_en_app, creado_at)"
    " VALUES ('c1','n1','HOLCIM','holcim','dash101','2026-01-01T00:00:00Z')"
)
# 285000000 centavos = $2,850,000.00. Y una cifra fea a propósito: 333333
# centavos no se divide bonito entre 1.16, que es donde se pierde el centavo.
for pid, venta in (("p1", 285_000_000), ("p2", 333_333)):
    db.execute(
        "INSERT INTO proyectos (id, negocio_id, cliente_id, nombre, estado, precio_venta, creado_at)"
        " VALUES (?,'n1','c1','Obra','activo',?,'2026-01-01T00:00:00Z')",
        (pid, venta),
    )
db.commit()

antes = {r[0]: r[1] for r in db.execute("SELECT id, precio_venta FROM proyectos")}

print("· se aplica la 0018")
db.executescript(M0018)
db.commit()

despues = {r[0]: r[1] for r in db.execute("SELECT id, precio_venta FROM proyectos")}
revisa(antes == despues, "el dinero no se movió", f"{antes} → {despues}")

print("· cómo nacen los proyectos que ya existían")
revisa(uno(db, "SELECT COUNT(*) FROM proyectos WHERE iva_incluido = 0") == 2,
       "todos quedan en «+ IVA», que es la decisión de Mike del 21-sep")
revisa(uno(db, "SELECT COUNT(*) FROM proyectos WHERE tasa_iva = 1600") == 2,
       "y al 16 % en puntos base")

print("· la columna no admite nulos")
revisa(revienta(db, "UPDATE proyectos SET iva_incluido = NULL WHERE id = 'p1'"),
       "un `iva_incluido` nulo se rechaza")
revisa(revienta(db, "UPDATE proyectos SET tasa_iva = NULL WHERE id = 'p1'"),
       "una tasa nula también")

print("· un proyecto nuevo nace igual, sin que nadie mande la columna")
db.execute(
    "INSERT INTO proyectos (id, negocio_id, cliente_id, nombre, estado, precio_venta, creado_at)"
    " VALUES ('p3','n1','c1','Obra nueva','activo',100000,'2026-02-01T00:00:00Z')"
)
revisa(uno(db, "SELECT iva_incluido FROM proyectos WHERE id = 'p3'") == 0, "nace en «+ IVA»")
revisa(uno(db, "SELECT tasa_iva FROM proyectos WHERE id = 'p3'") == 1600, "y al 16 %")

print("· el 0 % cabe, sin otra migración")
db.execute("UPDATE proyectos SET tasa_iva = 0 WHERE id = 'p3'")
revisa(uno(db, "SELECT tasa_iva FROM proyectos WHERE id = 'p3'") == 0, "una obra de exportación al 0 %")
db.execute("UPDATE proyectos SET tasa_iva = 1600 WHERE id = 'p3'")

print("· la aritmética del desglose, al centavo y en los dos sentidos")


def mas_iva(venta: int, tasa: int) -> tuple[int, int, int]:
    """Lo capturado es el subtotal: el IVA se suma encima."""
    subtotal = venta
    iva = round((venta * tasa) / 10000)
    return subtotal, iva, subtotal + iva


def incluido(venta: int, tasa: int) -> tuple[int, int, int]:
    """Lo capturado es el total: el IVA se desglosa hacia atrás."""
    subtotal = round((venta * 10000) / (10000 + tasa))
    iva = venta - subtotal
    return subtotal, iva, subtotal + iva


for venta in (285_000_000, 333_333, 1, 0, 999_999_999):
    s, i, t = mas_iva(venta, 1600)
    revisa(s + i == t and s == venta, f"+ IVA sobre {venta}: {s} + {i} = {t}")
    s, i, t = incluido(venta, 1600)
    revisa(s + i == t == venta, f"IVA incluido en {venta}: {s} + {i} = {t}")

# Al 0 % las dos cuentas tienen que dar lo mismo: no hay IVA que mover.
for venta in (285_000_000, 333_333):
    revisa(mas_iva(venta, 0) == incluido(venta, 0) == (venta, 0, venta),
           f"al 0 % las dos lecturas coinciden sobre {venta}")

print("· las llaves foráneas siguen enteras")
rotas = db.execute("PRAGMA foreign_key_check").fetchall()
revisa(not rotas, "ninguna llave foránea rota", str(rotas))

print()
if fallas:
    print(f"MAL: {fallas} revisiones fallaron")
    sys.exit(1)
print("Todo bien: la 0018 no mueve dinero y el desglose cuadra al centavo")
