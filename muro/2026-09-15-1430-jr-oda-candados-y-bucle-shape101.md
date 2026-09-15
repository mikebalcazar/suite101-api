de:    jr
para:  coordinador, mike, chat de shape101, chat de draw101
qué:   Del barrido de seguridad, Mike decidió arreglar ya el instalador de ODA: el MSI sólo de opendesign.com por https y, si el puntero trae sha256, se comprueba. Va en draw101 0.20.5 (armándose) y en shape101 main (sale con la 0.4.0 del chat de shape101). De paso se cortó un bucle de 63 corridas fallidas de recado.yml en shape101.

# ODA con candados · y el bucle de recado.yml

## 1. El bucle de shape101 (urgente, ya cortado)

De 14:00Z a 14:16Z de hoy, `recado.yml` de shape101 corrió **63 veces**, una
cada 13 segundos, todas en rojo. Causa: `claude/recado.py`, cuando falla,
empuja su aviso con `push -f` a `claude/recado-fallo`; como el nombre cuadra
con `claude/recado-*`, el aviso volvía a disparar el mandadero, que volvía a
fallar (`ModuleNotFoundError: fastapi` al comprobar `core/solido/rutas.py` en
el corredor) y a avisar. Minutos de Actions de un repo privado, sin fin.

Corte: PR #11 de shape101 (`438838b`), el disparador excluye
`claude/recado-fallo`. Medido: última corrida del bucle 14:16:34Z; después
sólo la del chat de shape101 (`claude/recado-3d-pantalla`, verde, 14:19Z).

**Para el chat de shape101:** el fallo de fondo del recado 6 sigue (el
corredor no trae `fastapi`; hay que instalarlo antes de la comprobación, o
comprobar sin importar FastAPI). Y el aviso de fracaso nunca debe ir a una
rama que dispare el mismo flujo.

## 2. El instalador de ODA, con dos candados

`core/oda.py` (idéntico en draw101 y shape101) corría la liga que dijera
`t101draw.netlify.app/oda.json` tal cual y le pasaba el MSI a `msiexec`. Ese
sitio hoy contesta 404 (muro 12-sep), así que el botón vive del segundo
camino: leer la página de ODA. Pero si alguien levantara ese sitio, o
interceptara la descarga, instalaba lo que quisiera. Desde hoy:

- **Sólo opendesign.com, por https.** Una liga ajena del puntero se ignora y
  se pasa a la siguiente fuente; `_trabajo()` la vuelve a rechazar antes de
  bajar nada. El puntero elige versión, no programa.
- **Si el puntero declara `sha256`** (`"oda": {"sha256": {"windows": "…"}}`),
  lo bajado se compara antes de `msiexec`; si no cuadra, se borra y no se
  instala. Sin huella declarada manda el candado del dominio.

Una huella en el mismo JSON no cierra sola el hueco (quien controle el JSON
pone las dos cosas); el candado que cierra es el del dominio. La huella queda
para el día que el puntero reviva.

| Repo | Cambio | Prueba | Versión |
|---|---|---|---|
| draw101 | PR #11 (`4f4e39f`) | `t020_oda`, 28 comprobaciones; suite completa local 429/429 | **0.20.5**, armándose (workflow_dispatch sobre main, ver abajo) |
| shape101 | PR #12 (`3267e3e`) | `t023_oda`, 28 comprobaciones | un renglón más en la bitácora de la **0.4.0** que el chat de shape101 puso en main a las 14:19Z; la publica ese chat |

**Para el chat de draw101:** tu rama `claude/publicar-0.20.5` (`25cde32`,
«cambiar unidades es un paso del historial») falló en «Aplicar parches» y
nunca publicó; el número 0.20.5 se lo lleva este arreglo. Tu cambio, rebasado
sobre main, sería la 0.20.6, y tu prueba `t020_unidades_deshacer` tendría que
llamarse `t021`, porque `t020_oda` ya existe. No toqué tu rama ni tu commit:
el armado se disparó a mano sobre main (el proxy del chat no deja empujar
tags, 403).

## 3. Lo que sigue

Cuando el armado de draw101 termine: comprobar la release `draw101-0.20.5` en
`descargas`, su sha256, `draw101.json` y el README. Se apunta aquí abajo.
