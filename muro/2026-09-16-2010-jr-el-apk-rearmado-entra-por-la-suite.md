# El APK rearmado entra por la suite

**16-sep-2026 20:10Z · Jr. PROGRAMADOR**

Encargo de Mike, después de cerrar la puerta vieja. Armado, publicado y
comprobado **contra el binario**.

## Lo que se publicó

`android.apk`, 4,895,291 bytes, 18:00:16Z. La página de descargas lo reporta con
ese mismo tamaño y esa misma hora, así que lo que se puede bajar es lo que se
armó. Se baja de `/descargas/android.apk`, sin sesión: quien lo instala todavía
no tiene cuenta.

## Lo que se comprobó, y cómo

No «debería llevar el login nuevo»: se bajó el artefacto, se abrió el APK y se
buscó adentro.

| adentro del APK | |
|---|---|
| `/s101` | está |
| `/auth/entrar`, `/auth/codigo`, `/auth/pin` | están |
| `aparato` (el modo de app empacada) | está |
| `bo_token` (donde guarda el token) | está |
| **`/api/auth`** (la puerta vieja) | **no está** |
| dirección del servidor | `https://bitacora-obra.mike-929.workers.dev` |

Y el pedazo tal como queda después de minificar:
`fetch(\`${F}/s101${e}\`, {method:t, …})`.

### El primer grep midió mal, y vale decirlo

Busqué `/s101/auth/entrar` y salió **0**, con `aparato` y `bo_token` en 1. Por un
momento parecía que el APK no llevaba el login nuevo.

No: esa cadena **no existe en el archivo minificado**. La URL se arma con una
plantilla —`` `${BASE}/s101${ruta}` ``— así que en el resultado hay `"/s101"` y
`"/auth/entrar"` por separado, y nunca juntas. Buscar la cadena completa era
buscar algo que el compilador garantiza que no está.

**Regla:** al medir dentro de código minificado se buscan los pedazos que
sobreviven, no la cadena como se escribió. Es la variante de hoy de lo mismo que
ya mordió cuatro veces: medir contra una idea de cómo debería verse el dato en
vez de contra el dato.

## Un cambio que hizo falta antes de armar

El flujo `Armar apps` armaba y **publicaba** las cuatro de un jalón. Entre ellas
el **piloto nativo**, que es el único que no lleva el sitio adentro: tiene su
pantalla de entrada en C++ contra `/api/auth/pin`, y eso se cerró hace un rato.
Correr el flujo tal como estaba habría dejado en la página de descargas un
programa que no abre, junto a tres que sí.

Ahora pregunta cuál: `android`, `windows`, `windows-nativo`, `piloto`, `todas`.
Y el trabajo del piloto revisa su propio `main.cpp` antes de compilar: si sigue
llamando a esa ruta, truena y dice qué arreglar. **Se limpia solo** en cuanto
alguien le cambie la entrada.

## Un nombre cruzado que ya costó un despiste mío

En el reporte anterior dije que «la versión de Windows hecha a la medida» era la
que necesitaba trabajo. Impreciso, y por un cruce de nombres que ya quedó escrito
en `apps/LEEME.md`:

* el trabajo **`windows-nativo`** del flujo compila `apps/windows-cpp/`, que
  **sí** lleva el sitio adentro —ventana de Windows con WebView— y por tanto ya
  entra por la suite;
* el que no puede entrar es `apps/windows-nativo/`, que en el flujo se llama
  **`windows-piloto`**, y no es una app de trabajo: se hizo para medir si el
  plano se siente mejor dibujado en nativo. «Mide, no trabaja», dice su propio
  LEEME.

O sea: de las cuatro, **tres sólo hay que rearmarlas** y la cuarta es un piloto.

## Lo que falta

Rearmar el instalador de Windows —`cual: windows`— cuando Mike lo pida; es el
mismo botón. Y el piloto, sólo si algún día se quiere seguir midiendo con él.
