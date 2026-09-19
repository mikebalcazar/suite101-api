#!/usr/bin/env python3
"""Mide las migraciones 0008 (órdenes) y 0009 (fiscal), como manda OPERAR §7.

`sqlite3` en memoria con las siete anteriores aplicadas y datos que imitan a
una empresa en uso: cuentas, un proyecto con partida, movimientos viejos con
dinero y gente en `personal`. Se cuenta todo antes y después.

LO QUE DE VERDAD APORTA, y es lo que una prueba de la API no puede ver:

  · que **ninguna cifra de dinero de lo que ya había cambie**. Estas dos
    migraciones sólo agregan; si un ALTER trajera un DEFAULT mal puesto, los
    saldos de una empresa con años de movimientos se moverían solos;
  · que todo lo viejo quede con `facturado = 0`. Lo viejo no se inventa: no
    se sabe si tenía factura, así que no se dice que sí;
  · que `PRAGMA foreign_key_check` quede limpio con las llaves prendidas. Las
    tablas nuevas apuntan a `proyectos`, `partidas`, `movimientos` y
    `personal`; una FK mal escrita no truena al crear la tabla, truena meses
    después al borrar un proyecto.

No sustituye a la suite de vitest, que las corre en el SQLite del Durable
Object de verdad: complementa, y responde en un segundo.

    python3 pruebas/migracion-0008-0009.py
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
]
M0008 = (ORG / "0008_ordenes.sql").read_text(encoding="utf-8")
M0009 = (ORG / "0009_fiscal.sql").read_text(encoding="utf-8")

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

print("\n· una empresa en uso, antes de migrar")
db.executescript(
    """
    INSERT INTO negocios (id, nombre, moneda, creado_at) VALUES ('n1','Taller','MXN','2026-01-01T00:00:00Z');
    INSERT INTO cuentas (id, negocio_id, nombre, tipo, moneda, saldo_inicial, creado_at)
      VALUES ('c1','n1','Banco','banco','MXN',500000,'2026-01-01T00:00:00Z'),
             ('c2','n1','Caja','efectivo','MXN',20000,'2026-01-01T00:00:00Z');
    INSERT INTO clientes (id, negocio_id, nombre, nombre_norm, creado_en_app, creado_at)
      VALUES ('cl1','n1','Cliente Uno','cliente uno','dash101','2026-01-01T00:00:00Z');
    INSERT INTO proyectos (id, negocio_id, cliente_id, nombre, estado, creado_at)
      VALUES ('p1','n1','cl1','Casa Uno','activo','2026-01-02T00:00:00Z');
    INSERT INTO partidas (id, proyecto_id, concepto, monto_acordado, creado_at)
      VALUES ('pa1','p1','Madera',50000,'2026-01-02T00:00:00Z');
    INSERT INTO personal (id, nombre, nombre_norm, correo, creado_en_app, creado_at)
      VALUES ('pe1','Ana','ana','ana@ejemplo.mx','roster101','2026-01-02T00:00:00Z'),
             ('pe2','Beto','beto','beto@ejemplo.mx','roster101','2026-01-02T00:00:00Z');
    INSERT INTO movimientos (id, negocio_id, tipo, monto, fecha, cuenta_id, proyecto_id, creado_por, creado_at)
      VALUES ('m1','n1','ingreso',116000,'2026-02-01','c1','p1','u1','2026-02-01T00:00:00Z'),
             ('m2','n1','egreso',34500,'2026-02-03','c1','p1','u1','2026-02-03T00:00:00Z'),
             ('m3','n1','egreso',1250,'2026-02-04','c2',NULL,'u1','2026-02-04T00:00:00Z');
    """
)
db.commit()

antes = {t: uno(db, f"SELECT COUNT(*) FROM {t}") for t in
         ("negocios", "cuentas", "clientes", "proyectos", "partidas", "personal", "movimientos")}
dinero_antes = {
    "movimientos": uno(db, "SELECT COALESCE(SUM(monto),0) FROM movimientos"),
    "ingresos": uno(db, "SELECT COALESCE(SUM(monto),0) FROM movimientos WHERE tipo='ingreso'"),
    "egresos": uno(db, "SELECT COALESCE(SUM(monto),0) FROM movimientos WHERE tipo='egreso'"),
    "cuentas": uno(db, "SELECT COALESCE(SUM(saldo_inicial),0) FROM cuentas"),
    "partidas": uno(db, "SELECT COALESCE(SUM(monto_acordado),0) FROM partidas"),
}
uno_por_uno_antes = db.execute("SELECT id, monto FROM movimientos ORDER BY id").fetchall()
revisa(antes["movimientos"] == 3, "hay tres movimientos antes", str(antes))

print("\n· se aplican 0008 y 0009")
db.executescript(M0008)
db.executescript(M0009)
db.commit()

print("\n· nada de lo que ya había se movió")
for t, n in antes.items():
    revisa(uno(db, f"SELECT COUNT(*) FROM {t}") == n, f"{t} conserva sus {n} filas")
for k, v in dinero_antes.items():
    ahora = {
        "movimientos": "SELECT COALESCE(SUM(monto),0) FROM movimientos",
        "ingresos": "SELECT COALESCE(SUM(monto),0) FROM movimientos WHERE tipo='ingreso'",
        "egresos": "SELECT COALESCE(SUM(monto),0) FROM movimientos WHERE tipo='egreso'",
        "cuentas": "SELECT COALESCE(SUM(saldo_inicial),0) FROM cuentas",
        "partidas": "SELECT COALESCE(SUM(monto_acordado),0) FROM partidas",
    }[k]
    revisa(uno(db, ahora) == v, f"el dinero de {k} no cambió", f"{v} centavos")
revisa(db.execute("SELECT id, monto FROM movimientos ORDER BY id").fetchall() == uno_por_uno_antes,
       "y ninguno cambió de monto uno por uno")

print("\n· lo viejo no se inventa")
revisa(uno(db, "SELECT COUNT(*) FROM movimientos WHERE facturado = 0") == 3,
       "los tres movimientos viejos quedan sin facturar")
revisa(uno(db, "SELECT COUNT(*) FROM movimientos WHERE uuid_cfdi IS NOT NULL") == 0,
       "y ninguno se inventa un UUID de factura")
revisa(uno(db, "SELECT COUNT(*) FROM personal WHERE es_contador = 0") == 2,
       "nadie nace pudiendo pagar: la etiqueta se da a mano")

print("\n· las tablas nuevas nacen vacías y con su contador de folios")
for t in ("ordenes", "orden_eventos", "cfdi", "cfdi_movimientos"):
    revisa(uno(db, f"SELECT COUNT(*) FROM {t}") == 0, f"{t} nace vacía")
revisa(uno(db, "SELECT siguiente FROM folios WHERE serie = 'OC'") == 1,
       "el folio de las órdenes arranca en 1")
revisa(uno(db, "SELECT siguiente FROM folios WHERE serie = 'COT'") == 1,
       "y el de las cotizaciones no se tocó")

print("\n· las llaves foráneas quedan limpias")
huerfanos = db.execute("PRAGMA foreign_key_check").fetchall()
revisa(not huerfanos, "PRAGMA foreign_key_check sin huérfanos", str(huerfanos[:3]))

print("\n· y las cerraduras cierran")
db.executescript(
    """
    INSERT INTO ordenes (id, negocio_id, folio, solicitante_usuario_id, concepto, monto, creado_at)
      VALUES ('o1','n1','OC-000001','u1','Tornillos',116000,'2026-03-01T00:00:00Z');
    """
)
try:
    db.execute("INSERT INTO ordenes (id, negocio_id, folio, solicitante_usuario_id, concepto, monto, creado_at)"
               " VALUES ('o2','n1','OC-000001','u2','Otra',100,'2026-03-01T00:00:00Z')")
    revisa(False, "dos órdenes con el mismo folio se rechazan")
except sqlite3.IntegrityError:
    revisa(True, "dos órdenes con el mismo folio se rechazan")

try:
    db.execute("INSERT INTO ordenes (id, negocio_id, folio, solicitante_usuario_id, concepto, monto, estado, creado_at)"
               " VALUES ('o3','n1','OC-000002','u1','Estado raro',100,'aprobada','2026-03-01T00:00:00Z')")
    revisa(False, "un estado que no existe se rechaza")
except sqlite3.IntegrityError:
    revisa(True, "un estado que no existe se rechaza")

db.execute("INSERT INTO cfdi (id, negocio_id, uuid, tipo, subtotal, iva, total, fecha, creado_por, creado_at)"
           " VALUES ('f1','n1','UUID-1','egreso',100000,16000,116000,'2026-03-01','u1','2026-03-01T00:00:00Z')")
try:
    db.execute("INSERT INTO cfdi (id, negocio_id, uuid, tipo, subtotal, iva, total, fecha, creado_por, creado_at)"
               " VALUES ('f2','n1','UUID-1','egreso',1,1,2,'2026-03-02','u1','2026-03-02T00:00:00Z')")
    revisa(False, "la misma factura capturada dos veces se rechaza")
except sqlite3.IntegrityError:
    revisa(True, "la misma factura capturada dos veces se rechaza")

# Un evento sin orden: es el de la etiqueta de contador, y tiene que caber.
db.execute("INSERT INTO orden_eventos (id, orden_id, que, quien_usuario_id, sobre_personal_id, ts)"
           " VALUES ('e1',NULL,'contador','u1','pe2','2026-03-01T00:00:00Z')")
revisa(uno(db, "SELECT COUNT(*) FROM orden_eventos WHERE orden_id IS NULL") == 1,
       "un evento de permiso (sin orden) cabe en la bitácora")
db.commit()
revisa(not db.execute("PRAGMA foreign_key_check").fetchall(), "y las llaves siguen limpias con datos nuevos")

print(f"\n{'TODO BIEN' if not fallas else f'{fallas} FALLA(S)'} · migraciones 0008 y 0009\n")
sys.exit(1 if fallas else 0)
