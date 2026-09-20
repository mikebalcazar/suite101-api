#!/usr/bin/env python3
"""Mide la migración 0012 («se espera factura»), como manda OPERAR §7.

`sqlite3` en memoria con las once anteriores aplicadas y datos que imitan a
una empresa en uso: dos pagos a proveedor —uno de una orden marcada «con
factura» y todavía sin ella, otro de una orden sin factura— y dos cobros a
cliente, uno ya facturado y otro no.

LO QUE DE VERDAD APORTA, y es lo que una prueba de la API no alcanza a ver:

  · que LA LISTA DE EGRESOS PENDIENTES NO CAMBIE DE CONTENIDO. Es lo único
    que Mike ya usa hoy. La espera de la factura se mudó de la orden de
    compra al movimiento, y si el rellenado de la migración se equivocara,
    mañana le faltarían pagos por perseguir —o le sobrarían— sin que nada
    truene;
  · que un pago de una orden SIN factura no se marque por accidente. El
    rellenado va por `con_factura = 1`, no por «tiene orden»;
  · que lo ya facturado no se vuelva a pedir. Un pago con su factura ya
    dentro no es un pendiente aunque su orden dijera que llevaba factura;
  · que el dinero no se mueva: la 0012 sólo agrega una bandera;
  · que `PRAGMA foreign_key_check` quede limpio con las llaves prendidas.

    python3 pruebas/migracion-0012.py
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
]
M0012 = (ORG / "0012_factura_esperada.sql").read_text(encoding="utf-8")

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

print("· una empresa en uso: dos pagos a proveedor y dos cobros a cliente")
db.execute("INSERT INTO negocios (id, nombre, moneda, creado_at) VALUES ('n1','Taller','MXN','2026-01-01T00:00:00Z')")
db.execute("INSERT INTO cuentas (id, negocio_id, nombre, tipo, moneda, saldo_inicial, creado_at)"
           " VALUES ('cta1','n1','Banco','banco','MXN',0,'2026-01-01T00:00:00Z')")
db.execute("INSERT INTO clientes (id, negocio_id, nombre, nombre_norm, creado_en_app, creado_at)"
           " VALUES ('c1','n1','Familia Uno','familia uno','dash101','2026-01-01T00:00:00Z')")
db.execute("INSERT INTO proveedores (id, nombre, nombre_norm, creado_en_app, creado_at)"
           " VALUES ('pr1','Maderas','maderas','dash101','2026-01-01T00:00:00Z')")

MOVS = [
    # id,     tipo,      monto,   facturado, descripción
    ("m-eg1", "egreso",  5000000, 0, "pago de orden CON factura, todavía sin ella"),
    ("m-eg2", "egreso",  2500000, 0, "pago de orden SIN factura"),
    ("m-eg3", "egreso",  1800000, 1, "pago de orden con factura, YA facturado"),
    ("m-in1", "ingreso", 9000000, 0, "cobro al cliente, sin facturar"),
    ("m-in2", "ingreso", 3000000, 1, "cobro al cliente, ya facturado"),
]
for mid, tipo, monto, fact, _ in MOVS:
    db.execute(
        "INSERT INTO movimientos (id, negocio_id, tipo, monto, fecha, cuenta_id, facturado, creado_at, creado_por)"
        " VALUES (?,?,?,?, '2026-03-01', 'cta1', ?, '2026-03-01T00:00:00Z','u1')", (mid, "n1", tipo, monto, fact))

# Las órdenes de compra: dos «con factura» y una sin.
ORDENES = [("o1", "m-eg1", 1), ("o2", "m-eg2", 0), ("o3", "m-eg3", 1)]
for oid, mov, con in ORDENES:
    db.execute(
        "INSERT INTO ordenes (id, negocio_id, folio, solicitante_usuario_id, concepto, monto,"
        " proveedor_nombre, con_factura, estado, movimiento_id, creado_at)"
        " VALUES (?,?,?, 'u1', 'Material', 100, 'Maderas', ?, 'pagada', ?, '2026-02-01T00:00:00Z')",
        (oid, "n1", f"OC-{ORDENES.index((oid, mov, con)) + 1:06d}", con, mov))
db.commit()

dinero_antes = uno(db, "SELECT COALESCE(SUM(monto),0) FROM movimientos")

# La consulta VIEJA, la que Mike usa hoy: sale de la orden de compra.
pendientes_viejo = [f[0] for f in db.execute(
    "SELECT m.id FROM movimientos m JOIN ordenes o ON o.movimiento_id = m.id"
    " WHERE o.con_factura = 1 AND m.facturado = 0 ORDER BY m.id").fetchall()]

print("\n· se aplica 0012")
db.executescript(M0012)
db.commit()

# La consulta NUEVA: sale del movimiento, y sirve para los dos lados.
def pendientes(tipo: str | None = None) -> list[str]:
    sql = ("SELECT m.id FROM movimientos m LEFT JOIN ordenes o ON o.movimiento_id = m.id"
           " WHERE m.requiere_factura = 1 AND m.facturado = 0")
    args: tuple = ()
    if tipo:
        sql += " AND m.tipo = ?"
        args = (tipo,)
    return [f[0] for f in db.execute(sql + " ORDER BY m.id", args).fetchall()]

print("\n· lo que Mike ya usa hoy sigue igual")
revisa(pendientes("egreso") == pendientes_viejo,
       "la lista de egresos pendientes no cambió de contenido",
       f"antes {pendientes_viejo} · ahora {pendientes('egreso')}")
revisa(pendientes_viejo == ["m-eg1"], "y es la que se esperaba", str(pendientes_viejo))

print("\n· el rellenado no se pasó de listo")
revisa(uno(db, "SELECT requiere_factura FROM movimientos WHERE id = 'm-eg2'") == 0,
       "un pago de orden SIN factura no quedó marcado")
revisa(uno(db, "SELECT requiere_factura FROM movimientos WHERE id = 'm-eg3'") == 0,
       "y uno que YA tiene su factura tampoco: no es un pendiente")
revisa(uno(db, "SELECT COUNT(*) FROM movimientos WHERE tipo = 'ingreso' AND requiere_factura = 1") == 0,
       "ningún ingreso viejo se marcó solo: eso lo decide quien captura")

print("\n· y ahora un ingreso SÍ puede estar pendiente, que era el encargo")
db.execute("UPDATE movimientos SET requiere_factura = 1 WHERE id = 'm-in1'")
db.commit()
revisa(pendientes("ingreso") == ["m-in1"], "el cobro sin factura sale en la lista", str(pendientes("ingreso")))
revisa(pendientes() == ["m-eg1", "m-in1"], "y sin filtro vienen los dos lados", str(pendientes()))

print("\n· al llegar la factura, deja de pedirse —sin borrar que se esperaba")
db.execute("UPDATE movimientos SET facturado = 1 WHERE id = 'm-in1'")
db.commit()
revisa(pendientes("ingreso") == [], "ya no está pendiente")
revisa(uno(db, "SELECT requiere_factura FROM movimientos WHERE id = 'm-in1'") == 1,
       "pero sigue diciendo que se esperaba: las dos cosas son distintas")
db.execute("UPDATE movimientos SET facturado = 0 WHERE id = 'm-in1'")
db.commit()
revisa(pendientes("ingreso") == ["m-in1"],
       "y si la factura se cancela, vuelve a la lista sola")

print("\n· el dinero no se movió")
revisa(uno(db, "SELECT COALESCE(SUM(monto),0) FROM movimientos") == dinero_antes,
       "la suma de los movimientos es la misma", f"{dinero_antes} centavos")

print("\n· el índice y las llaves")
revisa(uno(db, "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='movimientos_por_facturar'") == 1,
       "el índice de la lista de pendientes existe")
revisa(len(db.execute("PRAGMA foreign_key_check").fetchall()) == 0, "ninguna llave foránea quedó rota")

print(f"\n{'TODO BIEN' if fallas == 0 else str(fallas) + ' FALLAS'}")
sys.exit(1 if fallas else 0)
