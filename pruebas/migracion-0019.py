#!/usr/bin/env python3
"""Mide la migración 0019 (la documentación del ítem), como manda OPERAR §7.

`sqlite3` en memoria con las dieciocho anteriores aplicadas y una obra con un
ítem, para comprobar lo que una prueba de la API no alcanza a ver:

  · que NO QUEPAN DOS PRINCIPALES VIVOS en un ítem. Es un índice y no una
    costumbre: «sólo en el principal se hacen anotaciones» deja de ser cierto
    en cuanto haya dos y nadie sepa cuál manda;
  · que las VERSIONES ARCHIVADAS SÍ QUEPAN todas, que es lo contrario y es lo
    que hace posible «sin borrar la anterior, pero archivarla»;
  · que no haya DOS VERSIONES VIVAS de la misma familia;
  · que borrar el ítem se lleve sus documentos y sus marcas, y que borrar un
    documento se lleve las suyas —si una marca sobreviviera a su plano, sería
    una anotación sobre nada—;
  · que el CHECK del rol y el del tipo de marca muerdan de verdad;
  · que no se haya roto ninguna llave foránea.

    python3 pruebas/migracion-0019.py
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
    "0018_iva_del_proyecto.sql",
]
M0019 = (ORG / "0019_docs_del_item.sql").read_text(encoding="utf-8")

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
    """True si la base RECHAZA la escritura."""
    try:
        db.execute(sql, args)
    except sqlite3.IntegrityError:
        db.rollback()
        return True
    db.rollback()
    return False


db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
for nombre in ANTERIORES:
    db.executescript((ORG / nombre).read_text(encoding="utf-8"))

print("· una obra con un plano y dos ítems")
db.executescript(M0019)
db.execute("INSERT INTO quell_projects (id, name) VALUES ('ob1','Obra')")
db.execute("INSERT INTO quell_plans (id, project_id, name, image_key, width, height) VALUES ('pl1','ob1','Planta','k.png',1000,800)")
for eid, code in (("el1", "CAR-01"), ("el2", "CAR-02")):
    db.execute("INSERT INTO quell_elements (id, project_id, plan_id, code, name, x, y) VALUES (?,?,?,?,?,0.5,0.5)",
               (eid, "ob1", "pl1", code, "Gradas"))
db.execute("INSERT INTO quell_users (id, email, name) VALUES ('u1','mike@ejemplo.mx','Mike')")
db.commit()

alta = ("INSERT INTO quell_element_docs (id, element_id, familia_id, rol, nombre, r2_key, version, archivado_at)"
        " VALUES (?,?,?,?,?,?,?,?)")

print("· un solo principal VIVO por ítem")
db.execute(alta, ("d1", "el1", "d1", "principal", "Plano del mueble", "k/d1.pdf", 1, None))
db.commit()
revisa(revienta(db, alta, "d2", "el1", "d2", "principal", "Otro plano", "k/d2.pdf", 1, None),
       "un segundo principal vivo se rechaza")
# Y se inserta DE VERDAD, no con `revienta`, que deshace lo que alcanzó a
# entrar: más abajo se comprueba que borrar el ítem de al lado no se lo lleve.
db.execute(alta, ("d3", "el2", "d3", "principal", "El de la otra pieza", "k/d3.pdf", 1, None))
db.commit()
revisa(uno(db, "SELECT COUNT(*) FROM quell_element_docs WHERE element_id='el2' AND rol='principal'") == 1,
       "pero cada ítem tiene el suyo")

print("· los de soporte no tienen tope")
for n in range(4, 8):
    db.execute(alta, (f"s{n}", "el1", f"s{n}", "soporte", f"Anexo {n}", f"k/s{n}.pdf", 1, None))
db.commit()
revisa(uno(db, "SELECT COUNT(*) FROM quell_element_docs WHERE element_id='el1' AND rol='soporte'") == 4,
       "cuatro de soporte conviven")

print("· las versiones: la anterior se archiva, no se borra")
db.execute("UPDATE quell_element_docs SET archivado_at = '2026-09-21T00:00:00Z' WHERE id = 'd1'")
db.execute(alta, ("d1b", "el1", "d1", "principal", "Plano del mueble", "k/d1b.pdf", 2, None))
db.commit()
revisa(uno(db, "SELECT COUNT(*) FROM quell_element_docs WHERE familia_id='d1'") == 2, "la familia tiene dos versiones")
revisa(uno(db, "SELECT COUNT(*) FROM quell_element_docs WHERE familia_id='d1' AND archivado_at IS NULL") == 1,
       "y sólo una viva")
revisa(revienta(db, alta, "d1c", "el1", "d1", "principal", "Tercera", "k/d1c.pdf", 3, None),
       "una tercera viva de la misma familia se rechaza")

print("· y varias archivadas SÍ caben, que es de lo que se trata")
db.execute("UPDATE quell_element_docs SET archivado_at = '2026-09-21T01:00:00Z' WHERE id = 'd1b'")
db.execute(alta, ("d1c", "el1", "d1", "principal", "Tercera", "k/d1c.pdf", 3, None))
db.commit()
revisa(uno(db, "SELECT COUNT(*) FROM quell_element_docs WHERE familia_id='d1'") == 3, "tres versiones guardadas")
revisa(uno(db, "SELECT version FROM quell_element_docs WHERE familia_id='d1' AND archivado_at IS NULL") == 3,
       "la viva es la última")

print("· el rol no admite inventos")
revisa(revienta(db, alta, "dx", "el2", "dx", "adjunto", "Raro", "k/dx.pdf", 1, None), "un rol que no existe se rechaza")

print("· las marcas cuelgan de la VERSIÓN")
marca = ("INSERT INTO quell_doc_marcas (id, doc_id, tipo, pagina, x, y, trazo, texto)"
         " VALUES (?,?,?,?,?,?,?,?)")
db.execute(marca, ("m1", "d1", "nota", 1, 0.3, 0.4, None, "Falta la medida"))
db.execute(marca, ("m2", "d1c", "nota", 1, 0.5, 0.5, None, "Ya con la medida"))
db.execute(marca, ("m3", "d1c", "trazo", 1, None, None, "[[0.1,0.1],[0.2,0.2]]", ""))
db.commit()
revisa(uno(db, "SELECT COUNT(*) FROM quell_doc_marcas WHERE doc_id='d1'") == 1,
       "la versión archivada conserva lo que se marcó sobre ELLA")
revisa(uno(db, "SELECT COUNT(*) FROM quell_doc_marcas WHERE doc_id='d1c'") == 2, "y la nueva las suyas")
revisa(revienta(db, marca, "mx", "d1c", "flecha", 1, 0.1, 0.1, None, ""), "un tipo de marca que no existe se rechaza")
revisa(revienta(db, marca, "my", "no-existe", "nota", 1, 0.1, 0.1, None, "x"), "una marca sin documento se rechaza")

print("· borrar arrastra lo que cuelga, y nada más")
db.execute("DELETE FROM quell_element_docs WHERE id = 'd1'")
db.commit()
revisa(uno(db, "SELECT COUNT(*) FROM quell_doc_marcas WHERE doc_id='d1'") == 0, "borrar un documento se lleva sus marcas")
revisa(uno(db, "SELECT COUNT(*) FROM quell_doc_marcas WHERE doc_id='d1c'") == 2, "y no toca las de las otras versiones")

db.execute("DELETE FROM quell_elements WHERE id = 'el1'")
db.commit()
revisa(uno(db, "SELECT COUNT(*) FROM quell_element_docs WHERE element_id='el1'") == 0,
       "borrar el ítem se lleva su documentación")
revisa(uno(db, "SELECT COUNT(*) FROM quell_doc_marcas") == 0, "y con ella sus marcas")
revisa(uno(db, "SELECT COUNT(*) FROM quell_element_docs WHERE element_id='el2'") == 1,
       "la del otro ítem sigue ahí")

print("· las llaves foráneas siguen enteras")
rotas = db.execute("PRAGMA foreign_key_check").fetchall()
revisa(not rotas, "ninguna llave foránea rota", str(rotas))

print()
if fallas:
    print(f"MAL: {fallas} revisiones fallaron")
    sys.exit(1)
print("Todo bien: un principal vivo, las versiones se archivan y las marcas se quedan con la suya")
