de:     draw101
para:   jr (programador)
fecha:  30-sep-2026, 01:00 UTC
asunto: ENCARGO. Tres cosas que yo no puedo hacer, una de ellas bloquea la 0.22.0

Mike te va a pedir que revises esto. Va completo y en orden de urgencia: lo
primero bloquea una versión ya terminada, lo segundo nos ahorra cuota todos los
días, y lo tercero es la causa de que este recado exista.

**Las tres son cosas que el proxy de mi sesión me impide hacer**, no cosas que no
quiera hacer. Todo lo demás de la nube ya está hecho y medido: 1038
comprobaciones en draw101, 634 en la API, y la API verificada leyendo la base de
producción.

---

# 1 · URGENTE: la 0.22.0 está armada y no publica. Necesito que me digas por qué

## Qué pasa

Creé la rama `claude/publicar-0.22.0` en draw101 (commit `e178673`) y el armado
debería haber publicado el instalador en `descargas`. Llevo **una hora y media**
viendo `descargas` y sigue en 0.21.6. Los armados anteriores tardaban ~40 min.

## Qué no puedo ver, y es exactamente lo que hace falta

**El estado del run.** Mi sesión no alcanza `api.github.com` (403 del proxy) y no
tengo herramienta de Actions, así que no sé si el run está corriendo, falló, o
nunca arrancó. Sé que la rama existe y que el `push` quedó, y nada más.

## Qué necesito de ti, concreto

Abre Actions en draw101, busca el run de `claude/publicar-0.22.0`, y dime
**cuál de estos cuatro es**:

| Si ves… | Qué significa | Qué hago yo después |
|---|---|---|
| No hay run | Nunca arrancó: cuota de Actions agotada, o el workflow no disparó | Pasa al punto 2 y lo vuelvo a disparar |
| En cola (queued) | Cuota o concurrencia | Esperamos, o punto 2 |
| Falló | Dime **en qué paso** y pégame los últimos ~30 renglones del log | Lo arreglo y vuelvo a disparar |
| Verde | Publicó y yo no lo vi | Me lo dices y sigo |

**Mi apuesta es que no arrancó, por cuota.** Ese workflow corre en
`windows-latest`, que GitHub cobra al doble, y Mike ya lo había notado en
septiembre («se consumieron muy rápido los deploys»). Si es eso, el punto 2 es la
solución y no un parche.

## Lo que SÍ está comprobado, para que no pierdas tiempo buscando ahí

No es el código ni la cadena de parches:

- Cloné `claude/publicar-0.21.6` limpio, apliqué los **62 parches en orden** con
  `git apply` —igual que hace el corredor, quitando el `\r` de Windows— y el
  árbol que sale es **idéntico, archivo por archivo**, al árbol donde corrieron
  las 1038 comprobaciones.
- Sobre ese árbol armado volví a correr las pruebas de node: 36 y 39, verdes.
- Y lo corrí todo **con los saltos de línea de Windows (CRLF)**, que es la
  diferencia real entre mi máquina y el corredor: 56 de 56.

Si el run falló, falló en algo del entorno, no en los parches.

---

# 2 · El armado barato. Y una corrección a lo que dice el propio repo

## Primero, la corrección, porque si no te va a costar media hora

En draw101 hay un archivo `claude/armar-y-publicar-barato-LEEME.md` que se
anuncia como «el workflow barato, muyévelo a `.github/workflows/`». **Ese archivo
no trae el YAML.** Son 30 renglones: la explicación de los cuatro cambios, la
raya de separación… y ahí se acaba. Moverlo dejaría un workflow vacío.

Lo escribió un chat de draw101 (yo, en una sesión anterior) y quedó mal: el
nombre promete algo que el contenido no tiene. **Mike y yo estuvimos a punto de
moverlo hoy creyendo que estaba completo.** Lo dejo dicho aquí para que no le
pase a nadie más, y lo arreglo yo en cuanto pueda escribir en el repo.

## Lo que propongo en su lugar: tres cambios quirúrgicos, no un reemplazo

Reemplazar 200 renglones de workflow a ciegas es peor que cambiar tres cosas.
Todo en `.github/workflows/armar-y-publicar.yml` de draw101, **que es la carpeta
donde el conector me da 403** y por eso te lo pido:

### 2a · El que de verdad importa: quitar la descarga de Chromium

```yaml
      - name: Pruebas (python verificar.py)
        if: ${{ !inputs.saltar_pruebas }}
        run: |
          set -euo pipefail
          pip install -q ezdxf fastapi uvicorn numpy pillow reportlab pymupdf pypdfium2 playwright
          python -m playwright install chromium     # <-- BORRAR ESTE RENGLÓN
          python verificar.py
```

**Por qué:** las pruebas de navegador **no corren en el corredor**.
`pruebas/navegador.py:hay_navegador()` devuelve `False` cuando existe
`GITHUB_ACTIONS` y no está `T101_PRUEBAS_COMPLETAS` —decisión de Mike del
16-sep—. O sea que cada armado **baja Chromium en Windows para pruebas que se
saltan solas**. Son varios minutos de Windows (×2) por run, tirados.

Si alguna vez quieres correrlas en el corredor, la instalación tiene que ir
condicionada a lo mismo:

```yaml
          if [ -n "${T101_PRUEBAS_COMPLETAS:-}" ]; then python -m playwright install chromium; fi
```

**Cómo comprobar que no rompió nada:** el conteo de comprobaciones del run tiene
que ser el mismo que antes. Las tres pruebas de navegador (t050, t051, t052)
reportan una comprobación cada una diciendo «se salta», y eso no cambia.

### 2b · El grande: `windows-latest` → `ubuntu-latest` con wine

```yaml
jobs:
  armar:
    runs-on: windows-latest    # <-- ubuntu-latest
```

**Ocho veces más barato**: el run baja de ~40 min a ~10 y cuenta ×1 en vez de
×2. El instalador sale igual porque quien arma el NSIS es electron-builder, no
Windows —así se armaron la 0.20.2, 0.20.3, 0.20.4 y 0.20.16—.

**Esto no te lo puedo dar como un pegar-y-listo, y prefiero decirlo que fingir
que sí.** Hay que añadir wine antes de `npx electron-builder --win nsis`, y hay
dos cosas que habría que ver corriendo:

- `build/python-empotrado.sh` (baja el Python empotrado del último instalador
  publicado): en Linux debería funcionar igual, pero descomprime un `.exe`, así
  que conviene mirar que no dependa de nada de Windows.
- `PYTHONUTF8: '1'` se puso por el cp1252 del Windows del corredor. En Linux
  sobra pero no estorba; déjalo.

Y los pasos que **no** hay que tocar, porque son los que hacen que el armado
valga: comprobar que la versión coincide, los motores DWG, el Python empotrado, y
**bajar lo publicado y comparar su sha256** antes de tocar el manifiesto.

**Mi recomendación:** haz 2a primero y sola —es de un renglón y sin riesgo—,
disparamos la 0.22.0, y 2b lo haces con calma en una rama, probando con un
`workflow_dispatch`. No conviene que la primera prueba de wine sea la versión que
Mike está esperando.

### 2c · De paso, si te parece: el artefacto de 125 MB

```yaml
      - name: Guardar el instalador como artefacto del run
        ...
          retention-days: 14
```

El instalador que cuenta vive en `descargas`. El artefacto es sólo respaldo del
run, y el propio workflow dice que **6 GB de respaldos fueron parte de lo que
agotó el plan de Actions en septiembre**. Ya hay una poda que deja los 3 más
recientes; bajar `retention-days` a 3 o 5 ayudaría más. Tu criterio.

---

# 3 · La causa de que este recado exista (esto es para Mike, pero te toca saberlo)

**El proxy de mi sesión no me deja empujar por `git`** ni a `draw101` ni a
`suite101-api`:

```
remote: access denied by the git proxy: mikebalcazar/draw101 is not in this
session's authorized repository set, so the proxy will not inject a credential
for it. To fix, add the repository to the session's sources.
```

Así que **cada parche lo transcribo a mano por el conector de GitHub**. Hoy
fueron 160 KB. Y transcribir un parche a mano falla de maneras que el código no
falla: el lazo de clonar la rama y comparar byte por byte detuvo **siete** empujes
malos esta tarde:

1. Una cuenta de renglones equivocada en la cabecera de un archivo nuevo
   (`@@ -0,0 +1,188 @@` cuando eran 192). `git apply` la compara, así que el
   parche no aplicaba. **Ése habría tumbado el armado** si no lo hubiera cazado.
2. El orden de los archivos dentro de un parche: `git diff` los ordena por ruta y
   yo los había puesto en otro orden.
3. Rayas decorativas de 66 caracteres iguales, imposibles de contar a ojo.
4. Un regex de acentos, en **dos** formas distintas: los caracteres combinantes
   son invisibles en el fuente, y escritos como secuencia de escape algo por el
   camino los convierte de vuelta en los invisibles. Se resolvió con
   `\p{Diacritic}`, que es ASCII puro.

Ninguno llegó a `main` ni gastó un armado. Pero **nada de eso es trabajo: es
transporte**, y se fue la mitad de la tarde en él.

**Lo que lo arregla:** autorizar `mikebalcazar/draw101` y
`mikebalcazar/suite101-api` en las fuentes de mi sesión. Tú ya empujas por git
(lo dijiste en tu recado de las 16:00) y por eso tu #168 tomó minutos y mi #171
tomó horas.

Mientras no esté, dos costumbres que adopté y que te sirven si alguna vez
transcribes un parche: **nada de caracteres de dibujo de caja** —usa la
convención del propio repo, `/* --- titulo --- */`— y **nada de secuencias de
escape Unicode** en el fuente.

---

# 4 · Un hueco que encontré en tus pruebas, y que quizá haya más como ése

No es urgente y no te lo pido como tarea: te lo cuento porque el patrón puede
repetirse y es barato de buscar.

La cabecera de `pruebas/nube.spec.ts` decía medir cuatro cosas, y una de ellas
—**«que un token vencido no entre»**— no tenía una sola prueba que la tocara. Esa
puerta es la que impide que `/nube/*` sea el rincón por donde se cuela una
licencia que dejó de pagarse: la app ya no abre, pero los archivos habrían
seguido subiendo y bajando. Estaba en `src/rutas/nube.ts` desde el primer día,
sin medir.

Ya está medida (#171), con un token **firmado de verdad** y fecha pasada, más un
control con el mismo token y fecha buena para que la prueba no pase por un fallo
de firma. Verificado quitando el renglón del vencimiento: falla esa y sólo esa.

**Lo que sugiero, cuando tengas un rato:** pasar por las cabeceras de `pruebas/`
y ver si alguna otra promete algo que nadie mide. Una cabecera que promete más de
lo que mide es peor que no tener cabecera, porque el siguiente que la lea va a
creerle.

---

# Resumen de lo que te pido

| # | Qué | Por qué no lo hago yo | Urgencia |
|---|---|---|---|
| 1 | Decirme el estado del run de `claude/publicar-0.22.0` | El proxy no me deja leer Actions | **Bloquea la 0.22.0** |
| 2a | Borrar `python -m playwright install chromium` del workflow | El conector me da 403 en `.github/workflows/` | Alta, y es un renglón |
| 2b | `windows-latest` → `ubuntu-latest` con wine | Lo mismo | Media, con calma y en rama |
| 2c | Bajar `retention-days` del artefacto | Lo mismo | Baja, tu criterio |
| 3 | (Mike) Autorizar los dos repos para que yo empuje por git | Es configuración de la sesión | Alta — es la causa de todo esto |
| 4 | Revisar si otras cabeceras de `pruebas/` prometen de más | Sí puedo, pero tú conoces el resto mejor | Baja |

Gracias por #168 y #28 — los dos renglones del despliegue y las tres columnas en
`Suscripcion` eran justo lo que me faltaba, y lo de master101 lo hubiera
encontrado Mike antes que nosotros.
