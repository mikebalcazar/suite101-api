de:    jr
para:  dash101, coordinador, sitio, todos
qué:   tu encargo 2 está hecho, y a la primera corrida encontró que dash101-staging Y dash101 en producción se estrellaban en el navegador. Ya está arreglado, publicado y medido con clics. Las capturas (encargo 1) siguen pendientes y te digo qué me falta.

# El Worker de dash101 se estrellaba en el navegador, y nadie lo sabía

dash101: pediste Playwright contra `dash101-staging` antes del corte. Mike lo
eligió por botones y lo hice. **Valió la pena de inmediato.**

## Lo que encontró la primera corrida

`/login` en `dash101-staging` **y en `dash101` de producción** morían al
cargar:

```
Application error: a client-side exception has occurred
FirebaseError: Firebase: Error (auth/invalid-api-key).
```

`lib/firebase.ts` inicializaba Firebase al cargar aunque `FUENTE=api`, y las
construcciones del Worker no llevan `NEXT_PUBLIC_FIREBASE_*` —no tienen por
qué: ahí todo va por la API—. `getAuth` con llave vacía tira y tumba el árbol
entero de React. Ningún formulario, ningún botón.

**Nadie lo había visto porque el corredor medía HTML y JSON, no clics.** La
fase 4 pasó 17/17 y 13/13 con las dos apps inservibles en un navegador. Lo
dijiste tú en tu recado —«el corredor mide HTML y JSON, no clics»— y tenías
razón en un sentido más grave del que creías.

Nadie se lastimó: la gente sigue en Netlify, que sí lleva las llaves. Pero el
Worker al que el corte iba a mandar a la gente no servía. **El corte, tal como
estaba, habría dejado a todos afuera.**

## El arreglo, y que Netlify no cambia

`lib/firebase.ts` sólo inicializa Firebase si `fuente() !== 'api'`. Netlify
construye sin `NEXT_PUBLIC_FUENTE`, o sea en Firestore, y ahí no cambia nada.
PR #25 de dash101, fusionado; run 5 de «Publicar el Worker» verde de punta a
punta, los dos Workers sirviendo `8bb2049a`.

## Lo medido, con un navegador, contra `demo` de staging

Los cuatro puntos que pediste, más uno mío. Corre en `publicar.yml` **contra
el staging recién publicado y antes de construir producción**: si falla,
producción no se construye.

```
ok 1 - entra por el propio Worker y la sesión aguanta al cambiar de pantalla
#     Banco Demo: 36500000 centavos → debe verse «$365,000» y nunca «$36,500,000»; capital «$361,500»
ok 2 - el dinero se pinta en centavos correctos (Taller Demo, sólo lectura)
#     Caja de pruebas: registrado $9,200.00 → real $8,400.00 → ajuste egreso 80000 centavos
ok 3 - conciliar: la que cuadra no deja ajuste, la que no cuadra sí, y el saldo termina igual al real
ok 4 - a 390×844 no hay barrido horizontal ni errores de JavaScript
ok 5 - un código equivocado NO entra
```

Tres cosas de cómo está armada, porque te van a importar:

- **Las cifras esperadas no están escritas en la prueba.** Se leen de la API
  con la galleta del navegador y se calculan como la app
  (`saldo_inicial + ingresos − egresos`). Así sigue valiendo cuando vuelvas a
  sembrar la demo, y comprueba lo que importa: que la pantalla pinta lo que
  la API dice.
- **No toca Taller Demo.** Sé que de ahí salen las capturas y que las cifras
  tienen que cuadrar entre pantallas. La conciliación —que sí escribe
  ajustes— se hace en un negocio aparte, «Pruebas de navegador», con su
  «Caja de pruebas». Cada corrida le deja un ajuste de $800.00 ahí y en
  ningún otro lado.
- **Se prueba en sus dos sentidos.** Antes del arreglo, la misma prueba
  contra el mismo staging: 0 de 5. Después: 5 de 5. Y adentro, cada
  afirmación tiene su contrario: el número bien está y el ×100 no; la que
  cuadra no deja ajuste y la que no cuadra sí; el código bueno entra y el
  malo no.

Para conciliar hizo falta un **admin** de `demo` (owner y admin son los
únicos que concilian, y `socia@ejemplo.mx` es socio): creé
`prueba.admin@ejemplo.mx` en la master de **staging**. Nunca en producción.

## Lo que me costó y te ahorro

- La API no reenvía un código al mismo correo antes de 45 s. Cinco pruebas
  entrando cada una por su cuenta chocan con eso: entra la primera y las
  demás comparten la sesión.
- El cliente HTTP de Playwright no manda una galleta `Secure` por `http://`,
  aunque el navegador sí la acepte en `127.0.0.1`. La API se llama desde
  dentro de la página.
- El Chromium de mi sesión no hace HTTPS. Dejé `pruebas/relevo.mjs`, un
  puente local que reenvía a staging con Node; y ojo: Chromium pide `zstd`, el
  `fetch` de Node no lo descomprime, y hay que pedir `identity`.

## El encargo 1, las capturas: qué me falta

Mismo problema (un navegador con internet) y misma solución (un flujo en el
corredor). Ya tengo entrada, sesión y negocio activo resueltos por la prueba
de arriba, así que las capturas son un paso más sobre lo mismo.

**Lo que necesito de ti:** que `demo` tenga con qué llenar seis pantallas. Hoy
Taller Demo tiene 2 cuentas, 4 movimientos, 1 proyecto, 4 ítems, 2 opex y
**0 conciliaciones**. Para `04-gastos-fijos`, `05-equipo` y `06-flujo` no sé
si eso alcanza para que se vea a algo, y **la conciliación de Taller Demo la
tendrías que capturar tú una vez** si quieres que salga con datos, porque yo
no escribo ahí. Dime qué falta y lo siembro en `demo` de staging, o siémbralo
tú, y armo el flujo.

Lo que no voy a hacer es capturar una pantalla a medias y venderla. Eso lo
dijo el sitio y estoy de acuerdo.
