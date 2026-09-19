# Para draw101 y nest101: la licencia por cuenta, y lo que queda de su lado

**19-sep-2026 23:00Z · Jr. PROGRAMADOR**
**para: draw101, nest101 · copia: Mike, coordinador**

Mike puso el límite hoy y tiene razón: **draw101 y nest101 hacen sus propios
armados**. Yo no vuelvo a tocar su código ni a disparar sus flujos; lo que la
suite les ofrezca va por aquí.

Este recado es de dos partes: lo que hay que integrar, y lo que YO YA METÍ en
sus repos antes de que se pusiera el límite —que ahora es de ustedes, para
quedárselo, cambiarlo o rehacerlo.

## 1. Lo que la suite ofrece (contrato 0.20.1, ya en producción)

Encargo de Mike: que la app se abra entrando con la cuenta de la suite
—correo y contraseña, o Google— y que la licencia vaya ligada al correo. La
clave tecleada se queda como segunda forma; decisión suya, con botones.

- **`GET /licencias/entrar?programa=&huella=&app=&version=`** — la pantalla.
  **La sirve la suite: no la escriban.** Trae la entrada homologada (correo y
  contraseña, código para recuperar, Google) y abajo «Tengo una clave
  T101-…». Los dos caminos terminan igual, así que la app no distingue.
- **`POST /licencias/mia {programa, huella, version}`** — con la sesión de la
  suite y sin clave, activa la licencia del correo de quien entró. Devuelve
  el MISMO token firmado que `/activar`.
- **`POST /licencias/activar`**, **`/latido`**, **`/desactivar`** y
  **`/licencias/llave`** — sin cambios.

**Cómo recoge la app el resultado:** la pantalla deja el objeto en
`window.__t101_licencia` y cambia el fragmento a `#listo`. Escuchen ese
cambio y lean el objeto.

**El token NO viaja en la dirección, y no lo pongan ahí.** Una dirección se
copia, se pega y se queda en registros de cualquiera que la vea pasar.

## 2. Tres cosas que cuestan caro si se hacen distinto

**«La suite dice que no» y «no se pudo llegar a la suite» no son lo mismo.**
Un 503 o una falta de señal NO deben borrar la licencia guardada. Si se
confunden, un mal rato del servidor deja a un taller sin su programa, y no se
nota probando a mano con buen internet. Es lo que más conviene tener medido.

**Sin internet, el token manda.** El token trae su propio `hasta` firmado:
mientras ese día no pase, abran sin preguntarle a nadie y manden el latido
sin detener el arranque. Cuando vence y no hay forma de llegar, no abran, y
díganlo con esas palabras.

**La huella del equipo no es la MAC ni el número de serie del disco.** Un
azar guardado la primera vez, con el nombre del equipo sólo como sal. No
identifica a la persona y no se puede volver atrás. Reinstalar Windows cuenta
como equipo nuevo: es lo honesto, y el lugar viejo se libera desde master101.

## 3. Lo que ya está en sus repos, y es de ustedes

Antes del límite metí una primera versión funcionando. Queda como entrega,
no como algo que yo mantenga. Revísenlo y háganlo suyo:

- `electron/licencia-nucleo.js` — huella, guardado, vigencia y latido. **No
  importa Electron**, para poder medirlo con node a secas.
- `electron/licencia.js` — sólo abrir la ventana y recoger el token.
- `electron/main.js` — la puerta antes del motor (draw101) y antes del
  backend (nest101).
- `pruebas/licencia.mjs` — 20 comprobaciones, y un paso en su flujo que las
  corre en cada armado.

Es el mismo módulo palabra por palabra en los dos, a propósito: dos copias
que se comparan de un vistazo valen más que un paquete compartido entre
repos que se arman distinto.

Publicado: **draw101 0.21.0** (#18, #19, #20, #21) y **nest101 10.1.0**
(#15, #16). Los dos `.json` de descargas ya dicen la versión nueva.

## 4. Dos cosas que me encontré en el camino, para que no las repitan

**draw101: el parche 0.20.6 que estaba pendiente ya está integrado.**
`claude/APLICAR.txt` ya no existe. Estaba escrito contra `main = 7d476c9` y
dejó de aplicar; sus únicos choques eran los renglones de versión. Lo grave
era otro: `t021` y `t022` ya estaban en el árbol pero el código que miden no,
así que main sólo salía en verde **porque el corredor aplicaba el parche
durante el armado**. Ahora main se sostiene sola: 466 comprobaciones en 22
pruebas. La versión vive en TRES lugares —`core/version.py`, `package.json →
version` y `package.json → build.artifactName`— y el flujo los compara.

**nest101: las notas con acentos ya no tiran la publicación a medias.** El
paso escribía `notas.txt` redirigiendo la salida de python, que en Windows
usa cp1252, y el paso de abajo lo leía como UTF-8. Una «ñ» tronaba JUSTO
DESPUÉS de subir la release: instalador publicado y `nest101.json` sin
actualizar. Ya se escribe con `encoding="utf-8"`.

## 5. Lo que le toca a Mike, no a ustedes

Las licencias de `mike@forespot.com` y `mikebalcazar@hotmail.com` para los
dos programas están dadas de alta pero **sin marcar como perpetuas y sin
fecha de pago**, así que hoy no dejan entrar. Se arregla en master101 →
Licencias → Ver → «Perpetua: no vence nunca» → «Guardar tipo y vigencia».
