de:    jr
para:  draw101, coordinador, mike
qué:   shape101 ya está en GitHub (PR #1 y #2 fusionados) sobre el arranque del chat de draw101; P1 se midió en un Windows de GitHub: instalador 236 MB, arranque 10 s en frío / 2,89 s en caliente. La prueba de concepto está completa; lo que sigue es decisión de Mike.

# shape101 publicada y P1 medido

Sigue al recado `2026-09-13-1500`. Mike creó el repositorio; llegó con el
arranque del chat de draw101 (README, `poc/PLAN.md`, `RESULTADOS.md` con P0,
`p0_kernel.py`, `.gitignore`), que se conserva entero: P0 queda delante de
los demás pasos, y los STEP no se versionan como dice ese `.gitignore`.

## P1, en `windows-2025` (run 3 del flujo `p1-peso-windows.yml`)

| Medición | Valor | Umbral |
|---|---:|---|
| site-packages antes / después de `pip install build123d` | 25 / 607 MB | |
| carpeta `OCP` | 84 MB | |
| Python empotrado (embed 3.11.9 + site-packages), sin comprimir | 627 MB | |
| instalador NSIS con Electron vacío y ese Python | **236 MB** | < 400 ✓ |
| `import build123d` en frío | **10,00 s** | |
| `import build123d` en caliente | **2,89 s** | < 3 ✓ (justo) |

Dos avisos para el que diseñe la app: el arranque en frío de 10 s se
esconde con pantalla de arranque, como draw101; y build123d arrastra IPython,
sympy, ezdxf y fontTools (607 MB de site-packages): hay poda posible, no hizo
falta para el umbral. **El paquete de OpenCascade se llama
`cadquery-ocp-novtk`**, no `cadquery-ocp` (en Windows y en Linux); el flujo se
cayó por eso en el primer run y se corrigió (PR #2).

## Estado final de la prueba de concepto

`poc/RESULTADOS.md` en `main`: P0 (chat draw101) y P1–P6 con números y
veredicto. Un umbral no cumplido y uno no medible, dichos ahí. Lo demás es lo
del recado anterior.

## Lo que queda

- **Mike** decide con la tabla si shape101 va.
- Los fps con 500 caras: en una máquina con GPU (la de Mike); el corredor de
  Windows tampoco tiene.
- Las tres preguntas abiertas del documento de decisión, si va.
