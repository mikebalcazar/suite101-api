#!/usr/bin/env python3
"""Mide la migración 0021 (la nube de draw101), como manda OPERAR §7.

`sqlite3` en memoria con las anteriores aplicadas y CON DATOS, y con las llaves
foráneas ENCENDIDAS, como corre D1 de verdad.

ESTA PRUEBA YA SE GANÓ EL SUELDO, y conviene dejarlo escrito. La primera
versión de esta migración REHACÍA la tabla `suscripciones` —copiar a una nueva,
soltar la vieja, renombrar— para quitarle el `UNIQUE` a `clave`, que SQLite no
sabe quitar de una columna ya declarada. Habría pasado el `tsc`, habría pasado
las 623 pruebas de la API (workerd no enciende las llaves foráneas) y habría
reventado al desplegar, sobre la base donde viven las licencias vendidas:
`activaciones` referencia `suscripciones`, y con `PRAGMA foreign_keys = 1` el
`DROP TABLE` falla.

De ahí salió el diseño que sí está: la columna `clave` se queda donde está y
pasa a guardar la HUELLA de la clave en vez de sus letras. No hay que rehacer
nada, y de paso el `UNIQUE` pasa a decir algo verdadero —no hay dos licencias
con la misma clave—.

Lo que se mide, que es lo que una prueba de la API no ve:

  · que NO SE PIERDA NI SE CAMBIE UNA SOLA FILA. Son las licencias que el
    taller tiene vendidas: una fila perdida es un cliente que mañana no abre
    su programa;
  · que las claves lleguen intactas, porque el puente las convierte después:
    si llegaran vacías, nadie podría volver a activar;
  · que las activaciones sigan apuntando a su suscripción, con
    `PRAGMA foreign_key_check`;
  · que el `UNIQUE` siga impidiendo dos licencias con la misma huella, y que
    migradas y sin migrar convivan en la misma tabla;
  · y que la tabla de archivos deje a dos cuentas tener un archivo con el
    mismo token sin pisarse, que es de lo que depende la regla de Mike: quien
    abre un archivo ajeno genera el suyo.

    python3 pruebas/migracion-0021.py
"""

from __future__ import annotations

import pathlib
import sqlite3
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
D1 = RAIZ / "migrations/d1"

fallos: list[str] = []


def revisa(condicion: bool, que: str, detalle: str = "") -> None:
    print(("  ok   " if condicion else "  MAL  ") + que + (f"   ({detalle})" if detalle else ""))
    if not condicion:
        fallos.append(que)


def anteriores() -> list[pathlib.Path]:
    return sorted(p for p in D1.glob("*.sql") if p.name < "0021")


def main() -> int:
    con = sqlite3.connect(":memory:")
    con.executescript("PRAGMA foreign_keys = ON;")

    for sql in anteriores():
        con.executescript(sql.read_text(encoding="utf-8"))

    # Datos como los de producción: siete suscripciones y sus activaciones.
    claves = [
        ("01AAA", "T101-FAVC-FCK6-Y6AX", "draw101", "Mike Balcázar", 2),
        ("01BBB", "T101-LJGF-GRJJ-EGZU", "draw101", "Mike Balcázar", 2),
        ("01CCC", "T101-3F76-H4VC-PYUL", "nest101", "Mike Balcázar", 2),
        ("01DDD", "T101-2RXB-ZN44-6NXQ", "nest101", "Mike Balcázar", 2),
        ("01EEE", "T101-N32Z-GJU6-8FEN", "nest101", "Fernando Balcázar", 1),
        ("01FFF", "T101-7QLT-L96C-GHED", "draw101", "Fernando Balcázar", 1),
        ("01GGG", "T101-6D5R-QEP5-TJ6P", "draw101", "Alex Balcazar", 1),
    ]
    for i, (sid, clave, prog, cliente, lugares) in enumerate(claves):
        con.execute(
            "INSERT INTO suscripciones (id, clave, programa, cliente, correo, plan, lugares, estado, origen,"
            " perpetua, paga_hasta, notas, creado_at, actualizado_at, tipo)"
            " VALUES (?,?,?,?,?,'mensual',?,'activa','manual',?,?,?,?,?,'cortesia')",
            (sid, clave, prog, cliente, f"quien{i}@ejemplo.mx", lugares, i % 2, None if i % 2 else "2026-12-31",
             f"nota {i}", "2026-09-01T00:00:00Z", "2026-09-20T00:00:00Z"),
        )
    con.execute(
        "INSERT INTO activaciones (id, suscripcion_id, huella, version, alta_at, ultimo_latido_at, activa)"
        " VALUES ('act1','01AAA','huella-de-mike-1','0.21.5','2026-09-02T00:00:00Z','2026-09-29T00:00:00Z',1)")
    con.execute(
        "INSERT INTO activaciones (id, suscripcion_id, huella, version, alta_at, ultimo_latido_at, activa)"
        " VALUES ('act2','01AAA','huella-de-mike-2','0.21.5','2026-09-03T00:00:00Z','2026-09-29T00:00:00Z',1)")
    con.commit()

    campos = ("id, clave, programa, cliente, correo, plan, lugares, estado, origen,"
              " perpetua, paga_hasta, notas, creado_at, actualizado_at, tipo")
    antes = con.execute(f"SELECT {campos} FROM suscripciones ORDER BY id").fetchall()
    n_act_antes = con.execute("SELECT COUNT(*) FROM activaciones").fetchone()[0]

    print("\n  migración 0021 · la nube de draw101\n")

    # AQUÍ está el valor de esta prueba. La primera versión de esta migración
    # rehacía la tabla `suscripciones` para quitarle el UNIQUE a `clave`, y
    # rehacerla revienta: `activaciones` la referencia y D1 corre con
    # `PRAGMA foreign_keys = 1`. Habría pasado el typecheck, habría pasado las
    # pruebas de la API —que no encienden las llaves foráneas— y habría fallado
    # al desplegar, sobre la base de las licencias vendidas.
    con.executescript((D1 / "0021_nube.sql").read_text(encoding="utf-8"))
    con.commit()

    despues = con.execute(f"SELECT {campos} FROM suscripciones ORDER BY id").fetchall()

    revisa(len(despues) == len(antes) == 7, "las siete suscripciones siguen ahí",
           f"{len(antes)} → {len(despues)}")
    revisa(despues == antes, "y NINGUNA cambió ni un campo: la migración sólo agrega columnas")
    revisa(all(f[1].startswith("T101-") for f in despues),
           "las claves llegan intactas: quien active mañana entra igual, sin volver a activar")

    n_act = con.execute("SELECT COUNT(*) FROM activaciones").fetchone()[0]
    revisa(n_act == n_act_antes == 2, "las activaciones siguen", f"{n_act_antes} → {n_act}")
    revisa(con.execute("PRAGMA foreign_key_check").fetchall() == [],
           "PRAGMA foreign_key_check no encuentra nada")

    # Las columnas nuevas, y que nazcan vacías: una licencia que todavía no ha
    # estrenado la nube no tiene llave, y eso tiene que poder ser.
    cols = {r[1] for r in con.execute("PRAGMA table_info(suscripciones)")}
    for c in ("clave_pista", "llave_envuelta", "llave_sal"):
        revisa(c in cols, f"la columna {c} existe")
    revisa(con.execute("SELECT COUNT(*) FROM suscripciones WHERE llave_envuelta IS NULL").fetchone()[0] == 7,
           "y las siete nacen sin llave de cifrado, que es lo correcto")

    # EL PUNTO DEL DISEÑO: la clave se reemplaza por su huella EN LA MISMA
    # columna, y el UNIQUE sigue valiendo para algo —ahora dice «no hay dos
    # licencias con la misma clave», que es verdad y es útil—.
    con.execute("UPDATE suscripciones SET clave = 'huella-de-mike-aaa', clave_pista = 'Y6AX' WHERE id = '01AAA'")
    con.execute("UPDATE suscripciones SET clave = 'huella-de-fer-bbb', clave_pista = 'GHED' WHERE id = '01FFF'")
    revisa(con.execute("SELECT clave FROM suscripciones WHERE id = '01AAA'").fetchone()[0] == "huella-de-mike-aaa",
           "la clave se reemplaza por su huella en la misma columna")

    choco = False
    try:
        con.execute("UPDATE suscripciones SET clave = 'huella-de-mike-aaa' WHERE id = '01BBB'")
    except sqlite3.IntegrityError:
        choco = True
    revisa(choco, "y dos licencias no pueden compartir huella: el UNIQUE sigue diciendo algo verdadero")

    # Y las que faltan por migrar conviven con las migradas sin chocar, porque
    # sus letras son distintas entre sí.
    revisa(con.execute("SELECT COUNT(*) FROM suscripciones WHERE clave LIKE 'T101-%'").fetchone()[0] == 5,
           "migradas y sin migrar conviven en la misma tabla")

    # La tabla de archivos: dos cuentas con el mismo token sin pisarse.
    con.execute("INSERT INTO archivos_nube (suscripcion_id, id, nombre_cifrado, bytes, version, creado_at,"
                " modificado_at, subido_at) VALUES ('01AAA','DOC1','cifrado',10,1,'t','t','t')")
    con.execute("INSERT INTO archivos_nube (suscripcion_id, id, nombre_cifrado, bytes, version, creado_at,"
                " modificado_at, subido_at) VALUES ('01FFF','DOC1','otro',10,1,'t','t','t')")
    revisa(con.execute("SELECT COUNT(*) FROM archivos_nube").fetchone()[0] == 2,
           "dos cuentas pueden tener un archivo con el mismo token sin pisarse")

    dup = False
    try:
        con.execute("INSERT INTO archivos_nube (suscripcion_id, id, nombre_cifrado, bytes, version, creado_at,"
                    " modificado_at, subido_at) VALUES ('01AAA','DOC1','tercero',10,1,'t','t','t')")
    except sqlite3.IntegrityError:
        dup = True
    revisa(dup, "pero la misma cuenta no puede tener dos veces el mismo token")

    # Un archivo de una cuenta que no existe no entra: es la llave foránea.
    fk = False
    try:
        con.execute("INSERT INTO archivos_nube (suscripcion_id, id, nombre_cifrado, bytes, version, creado_at,"
                    " modificado_at, subido_at) VALUES ('01NOEXISTE','DOC9','x',1,1,'t','t','t')")
        con.commit()
    except sqlite3.IntegrityError:
        fk = True
    revisa(fk, "y un archivo de una cuenta inexistente no entra")

    # Dos veces seguidas: D1 puede reintentar una migración.
    print("\n  y correrla dos veces:")
    con2 = sqlite3.connect(":memory:")
    con2.executescript("PRAGMA foreign_keys = ON;")
    for sql in anteriores():
        con2.executescript(sql.read_text(encoding="utf-8"))
    con2.execute("INSERT INTO suscripciones (id, clave, programa, cliente, plan, lugares, estado, origen,"
                 " perpetua, creado_at, actualizado_at, tipo)"
                 " VALUES ('01X','T101-AAAA-BBBB-CCCC','draw101','Quien','mensual',1,'activa','manual',1,'t','t','cortesia')")
    texto = (D1 / "0021_nube.sql").read_text(encoding="utf-8")
    con2.executescript(texto)
    # El ALTER TABLE ADD COLUMN sí truena la segunda vez, y eso está bien: D1
    # lleva su propia cuenta de qué migraciones aplicó y no repite ninguna. Lo
    # que se comprueba es que si se repitiera, NO SE PIERDEN DATOS.
    try:
        con2.executescript(texto)
    except sqlite3.Error:
        pass
    revisa(con2.execute("SELECT COUNT(*) FROM suscripciones").fetchone()[0] == 1,
           "repetirla no duplica ni pierde filas")
    revisa(con2.execute("SELECT clave FROM suscripciones WHERE id='01X'").fetchone()[0] == 'T101-AAAA-BBBB-CCCC',
           "y la clave sigue intacta")

    print()
    if fallos:
        print(f"  {len(fallos)} fallo(s)\n")
        return 1
    print("  todo bien\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
