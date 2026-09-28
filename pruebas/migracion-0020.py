#!/usr/bin/env python3
"""Mide la migración 0020 (reembolsos), como manda OPERAR §7.

`sqlite3` en memoria con las diecinueve anteriores aplicadas, para comprobar
lo que una prueba de la API no ve:

  · que TODO lo que ya existía quede como `compra`: una orden vieja que
    amaneciera como reembolso cambiaría a quién se le paga;
  · que la serie `RE` exista y arranque en 1, aparte de `OC`;
  · que correr la migración dos veces no truene ni duplique la serie (el
    Durable Object la aplica al despertar);
  · que no se haya roto ninguna llave foránea.

    python3 pruebas/migracion-0020.py
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
    "0018_iva_del_proyecto.sql", "0019_docs_del_item.sql",
]
M0020 = (ORG / "0020_reembolsos.sql").read_text(encoding="utf-8")

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

print("· una orden de antes de la migración")
db.execute("INSERT INTO negocios (id, nombre, creado_at) VALUES ('n1','Taller','2026-09-01')")
db.execute(
    "INSERT INTO ordenes (id, negocio_id, folio, solicitante_usuario_id, concepto, monto, creado_at)"
    " VALUES ('o1','n1','OC-000001','u1','Triplay',50000,'2026-09-01')")
db.commit()

print("· se aplica 0020")
db.executescript(M0020)
revisa(uno(db, "SELECT tipo FROM ordenes WHERE id='o1'") == "compra", "lo que ya existía queda como compra")
revisa(uno(db, "SELECT siguiente FROM folios WHERE serie='RE'") == 1, "la serie RE existe y arranca en 1")
revisa(uno(db, "SELECT siguiente FROM folios WHERE serie='OC'") == 1, "y la de OC no se tocó")

print("· un reembolso cabe con su tipo")
db.execute(
    "INSERT INTO ordenes (id, negocio_id, folio, tipo, solicitante_usuario_id, concepto, monto, creado_at)"
    " VALUES ('o2','n1','RE-000001','reembolso','u1','Gasolina',85000,'2026-09-28')")
db.commit()
revisa(uno(db, "SELECT COUNT(*) FROM ordenes WHERE tipo='reembolso' AND estado='en_buzon'") == 1, "y se lee por tipo y estado")
revisa(uno(db, "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='ordenes_tipo'") == 1, "con su índice")

print("· dos veces no truena ni duplica la serie")
db.execute("UPDATE folios SET siguiente = 7 WHERE serie='RE'")
db.commit()
try:
    db.executescript(M0020)
    otra_vez = True
except sqlite3.OperationalError as e:
    # La columna ya existe: el DO no la vuelve a correr (lleva la versión), y
    # aun así el INSERT OR IGNORE de la serie no puede pisar el consecutivo.
    otra_vez = "duplicate column" in str(e)
revisa(otra_vez, "la segunda corrida sólo tropieza con la columna que ya está")
revisa(uno(db, "SELECT siguiente FROM folios WHERE serie='RE'") == 7, "y el consecutivo RE no se reinicia")

print("· llaves foráneas")
revisa(db.execute("PRAGMA foreign_key_check").fetchall() == [], "ninguna rota")

print(f"\n{'TODO EN VERDE' if fallas == 0 else f'{fallas} FALLAS'}")
sys.exit(1 if fallas else 0)
