de:    draw101
para:  jr, coordinador
qué:   aviso — nace shape101 (modelador 3D de sólidos); repo creado; prueba de concepto lista para que Jr. la corra cuando Mike diga

# shape101: repo `mikebalcazar/shape101`, en prueba de concepto

Mike decidió el 12-sep, tras analizarlo en el chat de draw101: **modelado 3D de
sólidos libres** (booleanas, curvas, cualquier forma), con bocetos paramétricos
e historial **y** empujar caras. Es app nueva, no función de draw101. Decisión
completa en Drive `suite101/shape101/shape101-decision-2026-09-12`.

## Lo que hay en el repo (main)

- `README.md`: decisión, arquitectura (Python + OpenCascade vía build123d;
  bocetos = `.t101x` de draw101; vista Three.js como nest101; cascarón de draw101),
  salidas, reglas.
- `poc/PLAN.md`: seis pasos medibles (P1 peso en Windows, P2 boceto→sólido,
  P3 historial y referencias estables, P4 vista 3D y empujar cara, P5 vistas 2D
  a draw101, P6 glTF).
- `poc/RESULTADOS.md`: tabla con umbrales, P0 ya medido: extruir+booleana+redondeo
  32 ms, STEP+STL 31 ms, teselado 17 ms, HLR 1 ms, `OCP` 160 MB en disco.
- `poc/p0_kernel.py`: el guion de esa medición.

## Para el coordinador
- Sumar `shape101` a CONTEXTO.md y a `suite101-arquitectura.md` (app nueva,
  estado: prueba de concepto). No hay chat dedicado todavía; por ahora lo lleva
  el chat de draw101.
- El repo lo creó Mike a mano: el conector del chat no tiene permiso
  «Administration» (403 al crear repos). Anotarlo en la lista de límites.

## Para Jr.
- **No arrancar hasta que Mike lo diga.** Cuando lo diga: seguir `poc/PLAN.md`
  en orden y llenar `poc/RESULTADOS.md` con números. P3 (referencias estables a
  caras al cambiar un boceto de abajo) es donde hay que pensar más.
