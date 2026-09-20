#!/usr/bin/env python3
"""Mide la migración 0014 (la raya), como manda OPERAR §7.

La 0014 hace dos cosas que no se pueden medir desde la API:

  · REHACE `orden_eventos` para que su CHECK admita 'nominas'. Es una copia
    completa de la bitácora de permisos y de órdenes —quién pagó qué y quién
    pudo pagar—, y una copia es donde se pierden cosas sin que nada truene;
  · abre `rayas` y `raya_pagos` con sus candados.

LO QUE DE VERDAD APORTA:

  · que la bitácora de órdenes quede IDÉNTICA: mismos ids, mismos textos,
    mismas fechas y el mismo orden. Un evento perdido aquí es «quién autorizó
    este pago» sin respuesta;
  · que la llave foránea a `ordenes` sobreviva a la copia. Si se cayera, un
    evento podría quedar apuntando a una orden borrada y nadie se enteraría;
  · que una persona no pueda venir DOS VECES en el mismo corte. Lo impide la
    base, no el código: si sólo lo cuidara el código, una importación o un
    arreglo a mano se lo saltaría, se le pagaría dos veces y el total cuadra
    igual;
  · que borrar un corte se lleve sus renglones, y que NO se pueda borrar una
    persona que tiene pagos: su recibo dejaría de tener a quién nombrar;
  · que `es_nominas` nazca apagado en TODOS los que ya estaban. Una columna
    de permiso que naciera encendida le abriría los sueldos a la empresa
    entera el día del despliegue, en silencio;
  · que `PRAGMA foreign_key_check` quede limpio.

    python3 pruebas/migracion-0014.py
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
    "0012_factura_esperada.sql", "0013_bitacora_precio.sql",
]
M0014 = (ORG / "0014_raya.sql").read_text(encoding="utf-8")

fallas = 0


def revisa(cond: bool, que: str, dato: str = "") -> None:
    global fallas
    marca = "ok " if cond else "MAL"
    print(f"  [{marca}] {que}" + (f" — {dato}" if dato else ""))
    if not cond:
        fallas += 1


def uno(db: sqlite3.Connection, sql: str, *args):
    return db.execute(sql, args).fetchone()[0]


def rechaza(db: sqlite3.Connection, sql: str, args: tuple, que: str) -> None:
    try:
        db.execute(sql, args)
        db.commit()
        revisa(False, que)
    except sqlite3.IntegrityError:
        db.rollback()
        revisa(True, que)


db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
for nombre in ANTERIORES:
    db.executescript((ORG / nombre).read_text(encoding="utf-8"))

print("· una empresa en uso: dos personas, una orden pagada y su bitácora")
db.execute("INSERT INTO negocios (id, nombre, moneda, creado_at) VALUES ('n1','Taller','MXN','2026-01-01T00:00:00Z')")
db.execute("INSERT INTO cuentas (id, negocio_id, nombre, tipo, moneda, saldo_inicial, creado_at)"
           " VALUES ('cta1','n1','Caja','caja','MXN',10000000,'2026-01-01T00:00:00Z')")
db.execute("INSERT INTO personal (id, nombre, nombre_norm, activo, creado_en_app, creado_at)"
           " VALUES ('p1','Lupe','lupe',1,'roster101','2026-01-01T00:00:00Z')")
db.execute("INSERT INTO personal (id, nombre, nombre_norm, activo, es_contador, creado_en_app, creado_at)"
           " VALUES ('p2','Beto','beto',1,1,'roster101','2026-01-01T00:00:00Z')")
db.execute("INSERT INTO proveedores (id, nombre, nombre_norm, creado_en_app, creado_at)"
           " VALUES ('pr1','Maderas','maderas','dash101','2026-01-01T00:00:00Z')")
db.execute("INSERT INTO ordenes (id, negocio_id, folio, solicitante_usuario_id, proveedor_id, concepto,"
           " monto, estado, creado_at)"
           " VALUES ('o1','n1','OC-1','u1','pr1','Triplay',5000000,'pagada','2026-02-01T00:00:00Z')")

EVENTOS = [
    ("ev1", "o1",  "creada",   "u1", "Mike",  None, "la pidió",           "2026-02-01T10:00:00.000Z"),
    ("ev2", "o1",  "pagada",   "u2", "Beto",  None, "pagada de Caja",     "2026-02-02T11:00:00.000Z"),
    ("ev3", None,  "contador", "u1", "Mike",  "p2", "Beto ya puede pagar","2026-01-15T09:00:00.000Z"),
]
for e in EVENTOS:
    db.execute("INSERT INTO orden_eventos (id, orden_id, que, quien_usuario_id, quien_nombre,"
               " sobre_personal_id, nota, ts) VALUES (?,?,?,?,?,?,?,?)", e)
db.commit()

antes = db.execute("SELECT id, orden_id, que, quien_usuario_id, quien_nombre, sobre_personal_id, nota, ts"
                   " FROM orden_eventos ORDER BY id").fetchall()

print("· se aplica la 0014")
db.executescript(M0014)
db.commit()

print("· la bitácora de órdenes queda igual, renglón por renglón")
despues = db.execute("SELECT id, orden_id, que, quien_usuario_id, quien_nombre, sobre_personal_id, nota, ts"
                     " FROM orden_eventos ORDER BY id").fetchall()
revisa(len(despues) == 3, "no se perdió ningún evento", f"{len(despues)} de 3")
revisa(antes == despues, "y los tres son idénticos: id, orden, clase, quién, nota y FECHA")
revisa(uno(db, "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='orden_eventos_orden'") == 1,
       "el índice por (orden, fecha) sobrevivió a la copia")

print("· la llave foránea a `ordenes` sobrevivió")
rechaza(db, "INSERT INTO orden_eventos (id, orden_id, que, quien_usuario_id, ts) VALUES (?,?,?,?,?)",
        ("evx", "no-existe", "creada", "u1", "2026-02-03T00:00:00Z"),
        "un evento de una orden que no existe se rechaza")

print("· lo nuevo: 'nominas' es una clase válida de evento")
db.execute("INSERT INTO orden_eventos (id, orden_id, que, quien_usuario_id, sobre_personal_id, nota, ts)"
           " VALUES ('ev4',NULL,'nominas','u1','p1','Lupe ya puede ver la raya','2026-03-01T00:00:00Z')")
db.commit()
revisa(uno(db, "SELECT COUNT(*) FROM orden_eventos WHERE que='nominas'") == 1, "se apunta quién ve la raya")
rechaza(db, "INSERT INTO orden_eventos (id, orden_id, que, quien_usuario_id, ts) VALUES (?,?,?,?,?)",
        ("evy", None, "inventado", "u1", "2026-03-01T00:00:00Z"),
        "y una clase inventada sigue rechazada")

print("· el permiso nace APAGADO en todos los que ya estaban")
revisa(uno(db, "SELECT COUNT(*) FROM personal WHERE es_nominas = 1") == 0,
       "nadie amanece viendo los sueldos el día del despliegue")
revisa(uno(db, "SELECT es_contador FROM personal WHERE id='p2'") == 1,
       "y el permiso de pagar órdenes no se tocó")

print("· la raya y sus candados")
db.execute("INSERT INTO rayas (id, negocio_id, periodo_inicio, periodo_fin) VALUES ('r1','n1','2026-03-16','2026-03-22')")
db.execute("INSERT INTO raya_pagos (id, raya_id, personal_id, nombre, sueldo, neto)"
           " VALUES ('rp1','r1','p1','Lupe',350000,350000)")
db.commit()
revisa(uno(db, "SELECT estado FROM rayas WHERE id='r1'") == 'borrador', "un corte nace en borrador")
revisa(uno(db, "SELECT total FROM rayas WHERE id='r1'") == 0, "y en cero: el total lo pone el servidor, no el INSERT")

rechaza(db, "INSERT INTO raya_pagos (id, raya_id, personal_id, nombre, sueldo, neto) VALUES (?,?,?,?,?,?)",
        ("rp2", "r1", "p1", "Lupe", 100000, 100000),
        "la misma persona NO viene dos veces en el mismo corte")
rechaza(db, "INSERT INTO rayas (id, negocio_id, periodo_inicio, periodo_fin, estado) VALUES (?,?,?,?,?)",
        ("r9", "n1", "2026-03-16", "2026-03-22", "inventado"),
        "un estado inventado se rechaza")
rechaza(db, "DELETE FROM personal WHERE id = ?", ("p1",),
        "no se borra a alguien que tiene pagos: su recibo se quedaría sin nombre")

print("· borrar el corte se lleva sus renglones")
db.execute("DELETE FROM rayas WHERE id='r1'")
db.commit()
revisa(uno(db, "SELECT COUNT(*) FROM raya_pagos") == 0, "y no quedan renglones huérfanos")

print("· las llaves foráneas, limpias")
rotas = db.execute("PRAGMA foreign_key_check").fetchall()
revisa(not rotas, "PRAGMA foreign_key_check sin una sola fila", str(rotas))

print()
print("TODO CUADRA" if not fallas else f"{fallas} MEDICIONES EN ROJO")
sys.exit(1 if fallas else 0)
