de:    coordinador
para:  jr, mike
qué:   el código de draw101 y nest101 está en Drive; falta meterlo a sus repos. Jr. lo baja por liga y lo empuja.

# draw101 y nest101: del zip de Drive al repo

Los repos `draw101` y `nest101` sólo tienen `OPERAR.md`. Su código nunca ha
estado en GitHub: vive en Drive, en zips que Mike subió el 10-sep. El
coordinador no puede empujar un árbol de cientos de archivos con su conector,
así que **lo hace Jr.**, con una liga de descarga.

## Lo que hay en Drive (medido el 12-sep)

| Archivo | id de Drive | Tamaño |
|---|---|---|
| `suite101/t101d/draw101-fuente-X.0.2.zip` | `1y8TU_nu1kptnLxYVU-imFWIpwZkfdMHv` | 6,566,519 bytes |
| `suite101/t101d/draw101 handoff.md` | `1wf9Pijyl1lABJR79vDRgT9IvxfnZa1I8` | 12,802 |
| `suite101/t101x/nest101/nest101-fuente-X.0.2.zip` | `16ivNwHvKiAjglZcvAmN20ERs8Gh6xpm7` | 1,443,997 |
| `suite101/t101x/nest101/nest101-handoff.md` | `1nwDJSTgRykoK1JBbdq8Tc4O5AmTl2vB6` | 12,286 |

## Paso de Mike (una vez)

Poner esos cuatro archivos en «Cualquier persona con el enlace · Lector»
(Compartir → Acceso general). Sin eso la liga pide sesión de Google. Cuando
Jr. termine, Mike puede regresarlos a «Restringido».

## Paso de Jr.

```bash
# 1. medir si el sandbox alcanza Drive (10 s); si no, decirlo a Mike y parar
curl -sIL --max-time 20 "https://drive.google.com/uc?export=download&id=1y8TU_nu1kptnLxYVU-imFWIpwZkfdMHv" | head -1
# 2. bajar, comprobar tamaño exacto y descomprimir
curl -sL -o draw101.zip "https://drive.google.com/uc?export=download&id=1y8TU_nu1kptnLxYVU-imFWIpwZkfdMHv"
[ "$(stat -c %s draw101.zip)" = 6566519 ] || { echo "tamaño distinto: ¿página de confirmación de Drive?"; exit 1; }
unzip -q draw101.zip -d draw101-fuente && find draw101-fuente -type f | wc -l
```

Igual para nest101 (1,443,997 bytes) y los dos handoffs.

- Rama `claude/fuente-inicial` en cada repo; **sin** `node_modules`, `dist`,
  binarios de Electron ni el CPython embebido (van en `.gitignore`; el
  `LEEME.md` dice cómo se regeneran, con `md5` como manda `descargas/venta/LEEME.md`).
- Los handoffs a `claude/<app>-handoff.md`. Léelos antes de decidir qué se
  versiona: dicen qué es fuente y qué es artefacto.
- Commit con la huella `sha256` del zip del que salió, para que quede ligado a
  lo que probó Mike (X.0.2 funciona en su máquina, según los handoffs).
- PR, merge, recado en el muro y post en el wall.

Después de esto, draw101 y nest101 quedan como las demás: se piden cambios
desde el celular y Jr. los hace.
