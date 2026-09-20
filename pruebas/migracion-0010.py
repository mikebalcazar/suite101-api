#!/usr/bin/env python3
"""Mide la migración 0010 (la obra ligada al proyecto), como manda OPERAR §7.

`sqlite3` en memoria con las nueve anteriores aplicadas y datos que imitan a
una empresa en uso: proyectos con dinero y obras de quell101 con sus planos,
sus ítems ubicados y su bitácora.

LO QUE DE VERDAD APORTA, y es lo que una prueba de la API no alcanza a ver:

  · que **borrar un proyecto NO borre la obra**. Es `ON DELETE SET NULL`, y
    la diferencia con un `CASCADE` mal puesto son los planos, las fotos y la
    bitácora de la gente que estuvo ahí. Eso no se recupera;
  · que un proyecto no pueda quedar ligado a DOS obras. Lo cuida un índice
    único parcial, en la base, no una comprobación en el código: el código se
    salta, la base no;
  · que dos obras SUELTAS puedan convivir. Un índice único mal escrito —sin
    el `WHERE proyecto_id IS NOT NULL`— dejaría una sola obra sin proyecto en
    toda la empresa, y eso se descubriría el día que alguien abra la segunda;
  · que `PRAGMA foreign_key_check` quede limpio con las llaves prendidas.

No sustituye a la suite de vitest, que la corre en el SQLite del Durable
Object de verdad: complementa, y responde en un segundo.

    python3 pruebas/migracion-0010.py
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
    "0008_ordenes.sql", "0009_fiscal.sql",
]
M0010 = (ORG / "0010_obras.sql").read_text(encoding="utf-8")

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

print("· una empresa en uso: dos proyectos con dinero y tres obras con plano")
db.execute("INSERT INTO negocios (id, nombre, moneda, creado_at) VALUES ('n1','Taller','MXN','2026-01-01T00:00:00Z')")
db.execute("INSERT INTO clientes (id, negocio_id, nombre, nombre_norm, creado_en_app, creado_at)"
           " VALUES ('c1','n1','Familia Uno','familia uno','dash101','2026-01-01T00:00:00Z')")
for pid, nombre, precio in (("p1", "Casa Uno", 500000), ("p2", "Casa Dos", 300000)):
    db.execute(
        "INSERT INTO proyectos (id, negocio_id, cliente_id, nombre, precio_venta, creado_at)"
        " VALUES (?,?,?,?,?,'2026-01-02T00:00:00Z')", (pid, "n1", "c1", nombre, precio))
db.execute("INSERT INTO quell_users (id, email, name, role) VALUES ('qu1','jefe@ejemplo.mx','Jefe','admin')")
for oid, nombre in (("o1", "Casa Uno (obra)"), ("o2", "Casa Dos (obra)"), ("o3", "Depa suelto")):
    db.execute("INSERT INTO quell_projects (id, name, client, created_by) VALUES (?,?,'Familia Uno','qu1')", (oid, nombre))
    db.execute(
        "INSERT INTO quell_plans (id, project_id, name, image_key, width, height)"
        " VALUES (?,?,'Planta baja','orgs/x/quell/plans/a.png',1000,800)", (f"pl-{oid}", oid))
    db.execute(
        "INSERT INTO quell_elements (id, plan_id, project_id, code, name, x, y)"
        " VALUES (?,?,?,'M01','Cocina',0.5,0.5)", (f"e-{oid}", f"pl-{oid}", oid))
db.commit()

antes = {t: uno(db, f"SELECT COUNT(*) FROM {t}") for t in
         ("proyectos", "quell_projects", "quell_plans", "quell_elements")}
dinero_antes = uno(db, "SELECT COALESCE(SUM(precio_venta),0) FROM proyectos")

print("\n· se aplica 0010")
db.executescript(M0010)
db.commit()

print("\n· nada de lo que ya había se movió")
for t, n in antes.items():
    revisa(uno(db, f"SELECT COUNT(*) FROM {t}") == n, f"{t} conserva sus {n} filas")
revisa(uno(db, "SELECT COALESCE(SUM(precio_venta),0) FROM proyectos") == dinero_antes,
       "el dinero de los proyectos no cambió", f"{dinero_antes} centavos")
revisa(uno(db, "SELECT COUNT(*) FROM quell_projects WHERE proyecto_id IS NULL") == 3,
       "las tres obras nacen sueltas: la liga no se inventa")

print("\n· la liga")
db.execute("UPDATE quell_projects SET proyecto_id = 'p1' WHERE id = 'o1'")
db.commit()
revisa(uno(db, "SELECT proyecto_id FROM quell_projects WHERE id = 'o1'") == "p1", "se pone y se guarda")

try:
    db.execute("UPDATE quell_projects SET proyecto_id = 'p1' WHERE id = 'o2'")
    db.rollback()
    revisa(False, "un proyecto con DOS obras se rechaza en la base")
except sqlite3.IntegrityError:
    db.rollback()
    revisa(True, "un proyecto con DOS obras se rechaza en la base")

revisa(uno(db, "SELECT COUNT(*) FROM quell_projects WHERE proyecto_id IS NULL") == 2,
       "y dos obras SUELTAS conviven: el único es parcial, no sobre el NULL")

try:
    db.execute("UPDATE quell_projects SET proyecto_id = 'no-existe' WHERE id = 'o2'")
    db.rollback()
    revisa(False, "ligar a un proyecto que no existe se rechaza")
except sqlite3.IntegrityError:
    db.rollback()
    revisa(True, "ligar a un proyecto que no existe se rechaza")

print("\n· borrar el proyecto NO se lleva la obra")
db.execute("DELETE FROM proyectos WHERE id = 'p1'")
db.commit()
revisa(uno(db, "SELECT COUNT(*) FROM quell_projects WHERE id = 'o1'") == 1, "la obra sigue ahí")
revisa(uno(db, "SELECT proyecto_id FROM quell_projects WHERE id = 'o1'") is None, "y quedó suelta, lista para otro")
revisa(uno(db, "SELECT COUNT(*) FROM quell_plans WHERE project_id = 'o1'") == 1, "con su plano")
revisa(uno(db, "SELECT COUNT(*) FROM quell_elements WHERE project_id = 'o1'") == 1, "y sus ítems ubicados")
revisa(not db.execute("PRAGMA foreign_key_check").fetchall(), "las llaves siguen limpias")

print("\n· volver a aplicarla no truena (el índice es IF NOT EXISTS)")
try:
    db.executescript("CREATE UNIQUE INDEX IF NOT EXISTS quell_projects_proyecto ON quell_projects(proyecto_id) WHERE proyecto_id IS NOT NULL")
    revisa(True, "el índice se deja crear dos veces")
except sqlite3.OperationalError as e:
    revisa(False, "el índice se deja crear dos veces", str(e))

print(f"\n{'TODO BIEN' if not fallas else f'{fallas} FALLA(S)'} · migración 0010\n")
sys.exit(1 if fallas else 0)
