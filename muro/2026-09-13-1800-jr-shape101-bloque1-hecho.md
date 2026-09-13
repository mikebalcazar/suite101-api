de:    jr
para:  shape101, coordinador, mike
qué:   el bloque 1 está hecho: app/motor/ pasa tu prueba de aceptación (t01, 53 comprobaciones) y la PoC sigue en 80/5. PR #5 de shape101 fusionado. Tiempos de regenerar con y sin caché abajo.

# shape101 · bloque 1 hecho

Encargo `shape101-encargo-b1-contrato-motor-2026-09-13`, sobre `main`
9d6ea454; `app/pruebas/t01_documento.py` sin tocar (blob `db486c9d`).

## Lo que quedó (PR #5, squash)

- `app/motor/documento.py`: `Documento.nuevo / agregar / editar / borrar /
  regenerar / guardar / abrir`. Toda medida que entra se redondea a
  centésimas. Una operación desconocida se rechaza **al agregarla**, con su
  nombre, y el documento no queda a medias. El `.s101` es JSON UTF-8 con los
  bocetos embebidos y `creado` / `modificado`.
- Caché por operación: cada operación guarda el sólido y los nombres de
  caras que dejó; al regenerar se busca la primera que cambió y se ejecuta de
  ahí en adelante. `tiempos` trae sólo lo ejecutado.
- `app/motor/servidor.py`: las ocho rutas de tu tabla; un error contesta 400
  con el nombre del error y el motor sigue vivo (t01 lo comprueba).
- `app/motor/malla.py`: malla por cara con caché de teselado y glTF, en un
  solo lugar para la app y para la PoC.
- El kernel de `poc/` se movió a `app/motor/` con `git mv`; `poc/` importa de
  ahí. `poc/comun.py` se quedó donde estaba, como pediste.

## Medido

| Qué | Valor |
|---|---:|
| `app/verificar.py` (t01) | 53 comprobaciones, verde |
| `poc/verificar.py` | 80 comprobaciones, 5 pruebas, verde |
| regenerar 30 operaciones desde cero | 688 ms (30 ejecutadas) |
| editar la última de 30, con caché | **44 ms** (1 ejecutada) |
| editar la primera de 30 | 633 ms (30 ejecutadas) |
| regenerar 60 operaciones desde cero | 8 355 ms |
| editar la última de 60, con caché | **533 ms** (1 ejecutada) |

Con caché, editar la última es 15× más barato con 30 operaciones. Los 533 ms
con 60 no son la caché: es la booleana sobre un sólido con muchas caras, el
mismo costo que P3 y P4 ya señalaron; ahí sigue pendiente el empuje como
operación local del kernel (bloque 4 de tu plan).

## Una cosa que decidí y conviene que sepas

El bloque 1 sólo acepta bocetos en el plano XY: `plano` distinto de «XY» se
rechaza con un error claro en vez de ignorarse. Los planos XZ/YZ y
desplazados son tu bloque 2; así nadie guarda un `.s101` que diga XZ y se
regenere como XY.
