#!/usr/bin/env python3
"""Mide la migración 0013 («el precio deja huella»), como manda OPERAR §7.

La 0013 REHACE `quell_log_entries`: SQLite no deja aflojar un NOT NULL ni
cambiar un CHECK con un ALTER, así que hay que crear, copiar, tirar y
renombrar. Una copia es justo donde se pierden cosas sin que nada truene, y
lo que se perdería aquí es la bitácora de la obra: lo que contó la gente que
estuvo parada ahí. Eso no se vuelve a escribir.

LO QUE DE VERDAD APORTA, y una prueba de la API no alcanza a ver:

  · que NO SE PIERDA NI UNA ENTRADA, y que las que quedan sean idénticas:
    mismo id, misma pieza, misma persona, mismo texto, misma fecha. La fecha
    importa tanto como el texto: una bitácora reordenada cuenta otra historia;
  · que los IDS SE CONSERVEN. Las fotos cuelgan de la entrada por
    (owner_type, owner_id) y sin llave foránea: si la copia repartiera ids
    nuevos, cada foto de bitácora quedaría huérfana y nada se quejaría;
  · que el CHECK viejo siga cerrado —no se cuela un `kind` inventado— y que
    el nuevo valor 'precio' sí entre;
  · que `user_id` admita NULL, que es lo que hace posible decir «esto lo
    escribió el sistema» sin inventarle un autor;
  · que el índice de lectura siga ahí. Sin él la bitácora de una pieza se lee
    recorriendo la tabla entera, y eso no falla: nada más se pone lento y
    nadie sabe por qué;
  · que `PRAGMA foreign_key_check` quede limpio con las llaves prendidas.

    python3 pruebas/migracion-0013.py
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
    "0012_factura_esperada.sql",
]
M0013 = (ORG / "0013_bitacora_precio.sql").read_text(encoding="utf-8")

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

print("· una obra con bitácora: tres entradas de tres clases, y sus fotos")
db.execute("INSERT INTO quell_users (id, email, name, role) VALUES ('u1','sup@ejemplo.mx','Sup','int')")
db.execute("INSERT INTO quell_users (id, email, name, role) VALUES ('u2','con@ejemplo.mx','Con','con')")
db.execute("INSERT INTO quell_projects (id, name, client, status) VALUES ('o1','Casa','Familia','activo')")
db.execute("INSERT INTO quell_plans (id, project_id, name, file_name, image_key, width, height)"
           " VALUES ('pl1','o1','Planta','p.pdf','planos/pl1.png',1000,800)")
db.execute("INSERT INTO quell_elements (id, plan_id, project_id, code, type, name, x, y)"
           " VALUES ('e1','pl1','o1','PU-01','Puerta','Puerta 1',0.4,0.6)")

ENTRADAS = [
    ("l1", "e1", "u1", "trabajo", "Se instaló el marco.",       "2026-03-01T10:00:00.000Z"),
    ("l2", "e1", "u2", "arreglo", "Venía rayada, se lijó.",     "2026-03-02T11:00:00.000Z"),
    ("l3", "e1", "u1", "acuerdo", "Queda en nogal, no en encino.", "2026-03-03T12:00:00.000Z"),
]
for e in ENTRADAS:
    db.execute("INSERT INTO quell_log_entries (id, element_id, user_id, kind, text, created_at) VALUES (?,?,?,?,?,?)", e)
db.execute("INSERT INTO quell_photos (id, owner_type, owner_id, r2_key, created_at)"
           " VALUES ('f1','log','l2','fotos/f1.jpg','2026-03-02T11:05:00.000Z')")
db.commit()

antes = db.execute("SELECT id, element_id, user_id, kind, text, created_at FROM quell_log_entries ORDER BY id").fetchall()

print("· se aplica la 0013")
db.executescript(M0013)
db.commit()

print("· la bitácora queda igual, renglón por renglón")
despues = db.execute("SELECT id, element_id, user_id, kind, text, created_at FROM quell_log_entries ORDER BY id").fetchall()
revisa(len(despues) == 3, "no se perdió ninguna entrada", f"{len(despues)} de 3")
revisa(antes == despues, "y las tres son idénticas: id, pieza, persona, clase, texto y FECHA")

print("· las fotos de bitácora siguen siendo de su entrada")
foto = db.execute("SELECT owner_id FROM quell_photos WHERE id='f1'").fetchone()[0]
revisa(foto == "l2", "la foto apunta al mismo id", foto)
revisa(uno(db, "SELECT COUNT(*) FROM quell_log_entries WHERE id = ?", foto) == 1, "y ese id sigue existiendo")

print("· lo nuevo: una entrada de precio, sin persona")
db.execute("INSERT INTO quell_log_entries (id, element_id, user_id, kind, text)"
           " VALUES ('l4','e1',NULL,'precio','El precio pasó de $400,000.00 a $440,000.00.')")
db.commit()
revisa(uno(db, "SELECT COUNT(*) FROM quell_log_entries WHERE kind='precio'") == 1, "`precio` es un `kind` válido")
revisa(uno(db, "SELECT user_id IS NULL FROM quell_log_entries WHERE id='l4'") == 1, "y `user_id` puede ir en NULL")

print("· lo que NO se abrió")
try:
    db.execute("INSERT INTO quell_log_entries (id, element_id, user_id, kind, text) VALUES ('lx','e1','u1','inventado','x')")
    db.commit()
    revisa(False, "un `kind` inventado sigue rechazado")
except sqlite3.IntegrityError:
    db.rollback()
    revisa(True, "un `kind` inventado sigue rechazado")

try:
    db.execute("INSERT INTO quell_log_entries (id, element_id, user_id, kind, text) VALUES ('ly',NULL,'u1','trabajo','x')")
    db.commit()
    revisa(False, "una entrada sin pieza sigue rechazada")
except sqlite3.IntegrityError:
    db.rollback()
    revisa(True, "una entrada sin pieza sigue rechazada")

try:
    db.execute("INSERT INTO quell_log_entries (id, element_id, user_id, kind, text) VALUES ('lz','e1','fantasma','trabajo','x')")
    db.commit()
    revisa(False, "una persona que no existe sigue rechazada")
except sqlite3.IntegrityError:
    db.rollback()
    revisa(True, "una persona que no existe sigue rechazada")

print("· el borrado en cascada y el índice de lectura siguen puestos")
db.execute("DELETE FROM quell_elements WHERE id='e1'")
db.commit()
revisa(uno(db, "SELECT COUNT(*) FROM quell_log_entries") == 0, "borrar la pieza se lleva su bitácora")
idx = uno(db, "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='quell_log_element'")
revisa(idx == 1, "el índice por (pieza, fecha) sobrevivió a la copia")

print("· las llaves foráneas, limpias")
rotas = db.execute("PRAGMA foreign_key_check").fetchall()
revisa(not rotas, "PRAGMA foreign_key_check sin una sola fila", str(rotas))

print()
print("TODO CUADRA" if not fallas else f"{fallas} MEDICIONES EN ROJO")
sys.exit(1 if fallas else 0)
