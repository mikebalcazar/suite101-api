#!/usr/bin/env python3
"""Que la configuración del correo no se caiga en silencio.

Hay dos variables de `wrangler.toml` cuyo VALOR no tiene prueba posible desde
el código —el código sólo sabe leerlas— y cuya ausencia no rompe nada: el
Worker arranca igual, los correos salen igual, y lo único que pasa es que una
cabecera deja de ir. Eso es exactamente lo que nadie nota.

  · `CORREO_REMITENTE`: sin ella se manda desde `onboarding@resend.dev`, que
    es el remitente de ejemplo de Resend. Todo «funciona» y el correo llega
    de un dominio que no es el de la empresa;
  · `CORREO_BAJA`: sin ella no va el `List-Unsubscribe` de los avisos. El
    código lo omite a propósito cuando falta —una salida que nadie procesa es
    peor que ninguna—, así que el comportamiento es correcto y la pérdida es
    muda.

Esto no mide el código: mide que la configuración siga puesta en los DOS
entornos. Es una prueba de despliegue, no de lógica.

    python3 pruebas/config-correo.py
"""

from __future__ import annotations

import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
TOML = (RAIZ / "wrangler.toml").read_text(encoding="utf-8")

fallas = 0


def revisa(cond: bool, que: str, dato: str = "") -> None:
    global fallas
    marca = "ok " if cond else "MAL"
    print(f"  [{marca}] {que}" + (f" — {dato}" if dato else ""))
    if not cond:
        fallas += 1


def bloques(texto: str) -> dict[str, str]:
    """Parte el toml por encabezado de sección. Basta con eso: lo que se
    revisa son variables sueltas, no estructuras."""
    salida: dict[str, str] = {}
    actual = ""
    for linea in texto.splitlines():
        m = re.match(r"\s*\[([^\]]+)\]\s*$", linea)
        if m:
            actual = m.group(1)
            salida.setdefault(actual, "")
        elif actual:
            salida[actual] += linea + "\n"
    return salida


def valor(bloque: str, llave: str) -> str | None:
    m = re.search(rf'^\s*{re.escape(llave)}\s*=\s*"([^"]*)"', bloque, re.M)
    return m.group(1) if m else None


secciones = bloques(TOML)
CORREO = re.compile(r"^[^@\s<>]+@[^@\s<>]+\.[a-z]{2,}$", re.I)

for nombre, humano in [("vars", "producción"), ("env.staging.vars", "staging")]:
    print(f"· {humano} (`[{nombre}]`)")
    b = secciones.get(nombre)
    if b is None:
        revisa(False, f"existe la sección [{nombre}]")
        continue

    remitente = valor(b, "CORREO_REMITENTE")
    revisa(bool(remitente), "CORREO_REMITENTE está puesta", remitente or "(falta)")
    if remitente:
        revisa(
            "resend.dev" not in remitente,
            "y NO es el remitente de ejemplo de Resend",
            remitente,
        )

    baja = valor(b, "CORREO_BAJA")
    revisa(bool(baja), "CORREO_BAJA está puesta: sin ella no va el List-Unsubscribe", baja or "(falta)")
    if baja:
        revisa(bool(CORREO.match(baja)), "y tiene forma de dirección de correo", baja)

print()
print("TODO CUADRA" if not fallas else f"{fallas} MEDICIONES EN ROJO")
sys.exit(1 if fallas else 0)
