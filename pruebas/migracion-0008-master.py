#!/usr/bin/env python3
"""Mide la migración 0008 de D1 master (supply101 gana llave propia).

DEFECTO que arregla, reportado por Mike el 21-sep-2026: fer@forespot.com
abría supply101 y le salía `app_no_permitida`. supply101 mandaba
`X-App: dash101`, así que la puerta buscaba la llave `dash` en la lista de
apps de la persona; Fer no la tiene. Y la app se hizo precisamente para
quien NO entra a dash101, así que le cerraba la puerta a la gente para la
que se construyó.

Mike escogió, con botones, PERMISO PROPIO. Lo que esta prueba cuida es la
promesa con la que lo escogió: **que nadie pierda lo que hoy tiene.**

Una migración de datos no truena: deja renglones distintos de los que
debía, y eso se descubre semanas después cuando alguien no puede entrar o
—peor— cuando alguien entra a donde no debía. Por eso se mide antes, sobre
los mismos renglones que hay en producción.

    python3 pruebas/migracion-0008-master.py
"""
import json
import sqlite3
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SQL = (RAIZ / 'migrations' / 'd1' / '0008_supply_llave_propia.sql').read_text(encoding='utf-8')

fallas = 0


def rev(ok, texto, extra=''):
    global fallas
    if not ok:
        fallas += 1
    print(f"  {'ok   ' if ok else 'FALLA'} {texto}" + (f'  →  {extra}' if extra else ''))


def base():
    """Lo mínimo de D1 master que esta migración toca, con los renglones que
    de verdad hay en producción el 21-sep (leídos, no inventados) más los
    casos de borde que producción todavía no tiene."""
    db = sqlite3.connect(':memory:')
    db.executescript("""
      CREATE TABLE orgs (id TEXT PRIMARY KEY, apps TEXT NOT NULL DEFAULT '{}');
      CREATE TABLE miembros (usuario_id TEXT, org_id TEXT, apps TEXT NOT NULL DEFAULT '[]');
    """)
    db.execute("INSERT INTO orgs VALUES ('forespot', ?)",
               ['{"dash":true,"quell":true,"peek":true,"cotizador":true,"roster":true,"nest":true}'])
    # Una empresa sin dash101: no tiene órdenes que pedir.
    db.execute("INSERT INTO orgs VALUES ('sin-dash', ?)", ['{"quell":true}'])
    # Y una con dash apagado a propósito, que no es lo mismo que no tenerlo.
    db.execute("INSERT INTO orgs VALUES ('dash-apagado', ?)", ['{"dash":false,"quell":true}'])
    for uid, apps in [
        ('mike', '[]'),                                                  # todas
        ('fer', '["quell","peek","cotizador","roster","nest"]'),         # el del reporte
        ('goyo', '["quell"]'),
        ('miguel', '["dash","roster"]'),                                 # hoy sí entra
        ('ya_la_trae', '["dash","supply"]'),                             # por si se corre dos veces
    ]:
        db.execute("INSERT INTO miembros VALUES (?, 'forespot', ?)", (uid, apps))
    db.commit()
    return db


db = base()
db.executescript(SQL)
db.commit()

orgs = dict(db.execute('SELECT id, apps FROM orgs').fetchall())
gente = dict(db.execute('SELECT usuario_id, apps FROM miembros').fetchall())

print('· las empresas')
rev(json.loads(orgs['forespot']).get('supply') is True,
    'donde dash101 está prendido, supply101 también')
rev(all(json.loads(orgs['forespot'])[k] is True for k in
        ('dash', 'quell', 'peek', 'cotizador', 'roster', 'nest')),
    'y no se apaga ninguna de las que ya tenía', orgs['forespot'])
rev('supply' not in json.loads(orgs['sin-dash']),
    'una empresa sin dash101 no la gana: no tiene órdenes que pedir')
rev('supply' not in json.loads(orgs['dash-apagado']),
    'y una con dash101 APAGADO tampoco')

print('· la gente')
rev(json.loads(gente['mike']) == [],
    'la lista vacía se queda vacía: ya quiere decir «todas»')
rev(json.loads(gente['miguel']) == ['dash', 'roster', 'supply'],
    'QUIEN HOY ENTRA POR SU dash NO PIERDE supply101', gente['miguel'])
rev(json.loads(gente['ya_la_trae']) == ['dash', 'supply'],
    'y a quien ya la traía no se le duplica', gente['ya_la_trae'])

# Esto es la otra mitad: la migración abre la puerta a quien ya la tenía, y a
# nadie más. A Fer y a Goyo se la prende Mike desde workshop101, que es una
# decisión suya y no de un UPDATE.
rev(json.loads(gente['fer']) == ['quell', 'peek', 'cotizador', 'roster', 'nest'],
    'a Fer NO se le regala el permiso: eso lo decide quien administra', gente['fer'])
rev(json.loads(gente['goyo']) == ['quell'], 'ni a Goyo')

print('· y correrla dos veces no cambia nada')
antes = db.execute('SELECT group_concat(apps) FROM miembros').fetchone()[0]
antes_orgs = db.execute('SELECT group_concat(apps) FROM orgs').fetchone()[0]
db.executescript(SQL)
db.commit()
rev(db.execute('SELECT group_concat(apps) FROM miembros').fetchone()[0] == antes
    and db.execute('SELECT group_concat(apps) FROM orgs').fetchone()[0] == antes_orgs,
    'es idempotente')

print(f"\n{'Todo bien: nadie pierde acceso y nadie gana el que no tenía' if not fallas else str(fallas) + ' fallas'}")
sys.exit(1 if fallas else 0)
