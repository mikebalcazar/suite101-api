de:    jr
para:  draw101, coordinador, mike
qué:   Mike decidió arrancar shape101 (13-sep, por botones); la prueba de concepto ya está medida en P2–P6 y sólo falta P1 (Windows), que espera el repositorio en GitHub porque esta sesión no puede crearlo. Va lo que encontré, incluido un error del documento y dos hallazgos del kernel.

# shape101: la prueba de concepto, medida

Mike pidió «revisa Drive para instrucciones de shape101». Leí los dos
documentos de la carpeta `shape101` (decisión y prueba de concepto, 12-sep) y
le pregunté por botones si arrancaba: **«Sí, crea el repo y arranca»**. Queda
anotado aquí como pide OPERAR.md §0.

## Estado

El repositorio `shape101` está armado en local con el contrato (OPERAR.md y
CLAUDE.md), `poc/` y dos commits, **pero no está en GitHub**: esta sesión no
puede crear repositorios (403, «sessions are bound to their configured
repositories», por las dos vías). Eso es de Mike: crearlo vacío y privado y
conectarlo a la sesión. En cuanto exista, empujo, corre el flujo de P1 en un
Windows de GitHub y abro el PR.

`python poc/verificar.py --resultados`: **80 comprobaciones en 5 pruebas,
todas verdes**; los números en `poc/RESULTADOS.md`. Resumen por paso:

| Paso | Veredicto | Lo que importa |
|---|---|---|
| P1 Windows y peso | sin medir | Listo como flujo de Actions (`p1-peso-windows.yml` + cascarón Electron vacío). Referencia Linux: OCP 159 MB; `import build123d` 3,75 s frío / 2,4 s caliente. |
| P2 boceto → sólido | sí | Bocetos hechos con el motor de draw101 (con cotas), leídos con él sin tocarlo. Área y volumen exactos, con bulges. STEP reabre igual. |
| P3 historial y referencias | sí, con límite | Nombres por derivación sobreviven a cambiar una cota de abajo; la huella geométrica NO (0 de 2). 30 ops desde cero: 750 ms (< 1 s ✓); 60 ops: 10 s. |
| P4 vista 3D y empujar | sí; fps no medibles | Raycast por cara con nombre; arrastre = empujar. 50 caras: empujar una pared 92 ms (✓ < 100); empujar «arriba» (cambian las 50) 149 ms (✗). fps: sin GPU aquí, 11 fps con la escena vacía. |
| P5 vistas a draw101 | sí | Planta/alzado/lateral/corte con ocultas, como líneas/arcos/círculos exactos en un .t101d; reabierto y acotado con el motor de draw101: 900, ⌀160, 28. |
| P6 glTF | sí | 11 caras → 5,7 KB; 504 caras → ~180 KB; carga con GLTFLoader. |

## Tres cosas que conviene saber

1. **El documento dice `.t101x` y `core/t101x.py`; en draw101 eso es el
   proyecto de Taller 101 (cocina, gabinetes), no el dibujo.** El dibujo de
   draw101 es el `.t101d` (`core/proyecto.py`). Es el que se lee. draw101: si
   escribes la app, que no se repita el nombre.
2. **La huella geométrica no sirve para referencias estables** —el documento
   la sugería como opción—: al cambiar el ancho, el lado derecho se mueve 100
   mm y ninguna tolerancia razonable lo vuelve a encontrar. Lo que sí sirve, y
   está hecho, es nombrar por derivación (`lado[i]` por la arista del boceto
   que generó la cara; una cara conserva su nombre si conserva su superficie;
   lo nuevo se llama por la operación y por lo que lo produjo). Dos hallazgos
   del kernel al hacerlo: (a) tras restar una herramienta, las paredes del
   hueco quedan con la normal al revés de la cara que las produjo, así que la
   identidad de superficie tiene que ser canónica; (b) UnifySameDomain no
   funde las tiras cilíndricas de un empuje con los redondeos que continúan:
   quedan caras extra con la misma superficie (4 en el tablero), que hay que
   nombrar como continuación. Nada de eso rompe; hay que saberlo.
3. **El costo está en las booleanas, y crece con las caras.** Regenerar desde
   cero cumple con 30 operaciones y no con 60; y empujar una cara que hace
   crecer las 50 paredes cuesta 149 ms, casi todo fusión + unificación +
   reteselar. La app necesita las dos cosas que el marco ya prevé —caché por
   operación (hecha en `historial.extender`) y teselado por cara (hecho)— y
   una tercera que no está: el empuje como operación local del kernel
   (BRepFeat) en vez de extruir + fusionar.

## Lo que queda

- **Mike:** crear el repositorio `shape101` (privado, vacío) y conectarlo a
  la sesión. Con eso: push, P1 en Windows, PR, wall.
- Los fps con 500 caras se miden en una máquina con GPU: el corredor de
  Windows no tiene; la de Mike sí. Lo pido cuando el resto esté publicado.
- Las tres preguntas abiertas del documento de decisión (unidades y
  tolerancias, ensambles desde el principio o una pieza por documento,
  materiales/espesores) siguen abiertas; no urgen, según el propio documento.
