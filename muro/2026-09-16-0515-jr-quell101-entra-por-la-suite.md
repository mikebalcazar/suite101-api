# quell101 entra por la suite · contrato 0.8.0

**16-sep-2026 05:15Z · Jr. PROGRAMADOR**

Mike pidió el 16-sep mudar quell101 y roster101 al login de la suite: «que todo
quede homologado y robusto». quell101 ya está. Va lo que hay que saber antes de
tocar cualquiera de los dos repositorios.

## Lo que apareció a medio camino, y por qué importa

quell101 no es sólo un sitio: tiene un APK de Android (Capacitor) y dos apps de
Windows, y **las tres llevan el sitio empaquetado adentro**. Eso significa que no
comparten origen con el servidor, así que la cookie de sesión no les llega
nunca. Por eso quell101 entregaba, además de la cookie, un token suelto que la
app guarda y manda en `Authorization: Bearer`.

La suite sólo entregaba cookie. Mudar quell101 tal cual habría dejado fuera a
las apps ya instaladas.

## Contrato 0.8.0: la puerta de las apps empacadas

`POST /auth/entrar` con `{ aparato: true }` devuelve además `token`, que es **la
misma galleta firmada** que iría en la cookie. `POST /auth/canje` hace lo mismo
con el boleto de Google. Al navegador se le sigue dando sólo la cookie HttpOnly:
el token únicamente sale si se pide.

No es una sesión aparte. Mismo id, misma firma, misma fila en `sesiones`, y el
mismo DELETE la mata. Si van cookie y token a la vez, manda la cookie.
`Access-Control-Allow-Headers` suma `Authorization`, que es lo que pide el
preflight del navegador de una app empacada.

**Regla para las demás apps:** si una app va empacada, pide la sesión con
`aparato: true` y guarda el token. Si vive en un navegador, no lo pidas: la
cookie HttpOnly es más segura que un token que el JavaScript de la página puede
leer.

## Cómo quedó quell101

* El Worker gana `/s101/*` con service binding a `suite101-api` y pone
  `X-App: quell101`.
* `getUser` ya no busca en su tabla `sessions`: le pregunta a la suite quién
  viene y **casa ese correo** con el renglón de `users`.
* **Dos altas, no una.** La suite (workshop101) dice que la persona existe y que
  quell101 está en su lista de apps. La base de quell101 dice qué es en obra
  —dueño, supervisor o contratista— y en qué obras. Quien entra a la suite y no
  tiene renglón aquí ve una pantalla que lo explica; no se le inventa un rol.
* **La puerta vieja se queda en pie** mientras el APK y las apps de Windows no
  se rearmen. Se apaga después, no antes.

## Lo que esto le pide a quien mude otra app

1. Mirar primero si la app tiene una versión empacada. Si la tiene, el token es
   obligatorio y hay que dejar la puerta vieja abierta hasta rearmarla.
2. La lista de apps por miembro (`orgs.apps`, la que pone workshop101) **la
   aplica la app**, no la API, cuando la app tiene su propia base y no pasa por
   `/orgs/:o/*`. Vacía quiere decir todas.
3. Medir desde afuera de la puerta cuando la app no tiene staging. quell101 no
   lo tiene y su base es la obra de verdad: ahí no se entra ni se escribe.

## Lo que falta

* **Goyo Monroy** (contratista) está en quell101 pero todavía no en la suite.
  Hasta que se le dé de alta en workshop101 no puede volver a entrar. Mike y Fer
  ya estaban, con todas las apps.
* Rearmar el APK y las apps de Windows para que entren por la suite.
* roster101: 9 trabajadores (correo + código) y 2 cuentas de administración
  (contraseña).

**Corrección.** En una nota anterior quedó escrito que el hoyo de `esSecuencia`
—medir las escaleras de dígitos en línea recta en vez de en círculo, con lo que
«1234567890» pasaba— seguía vivo en roster101. No es cierto: roster101 nació con
la versión buena (`(d[i] - d[i-1] + 10) % 10`, `src/cuentas.js`). El hoyo fue mío
al portar esas reglas a la API, y la prueba nueva lo cachó ahí mismo. Nada que
arreglar en roster101 por ese lado.

## Medido

* API: 139 pruebas en workerd, humo 106 comprobaciones en staging, producción
  sirviendo `version 0.8.0 · contrato 0.8.0`.
* quell101: 21 comprobaciones en mesa de trabajo (la mayoría de lo que NO debe
  pasar) + 15 contra producción, todas verdes.
