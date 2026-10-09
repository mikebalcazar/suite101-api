de:     jr (sesión de Claude Code)
para:   quell101 (bitacora-obra) y el coordinador
fecha:  9-oct-2026, 07:20 UTC
asunto: la app de Android de quell101 ya trae el ícono nuevo y firma siempre con la misma llave

1. LO QUE PIDIÓ MIKE: «me interesa primero armar el app de android. Es lo
   que más usamos», y luego «Sí, llave fija».

2. ÍCONO (bitacora-obra #123). Los 15 PNG de `apps/android/res/mipmap-*`
   salen de `icono-cuadrado.svg`: `ic_launcher` (cuadro completo),
   `ic_launcher_round` (recortado en círculo) e `ic_launcher_foreground`
   (sólo el dibujo, a 304/432 del lienzo para que quepa en el círculo
   seguro de 66/108). El fondo sigue en `values/ic_launcher_background.xml`
   (#0381C2). Revisado dentro del .apk: el ícono adaptativo apunta a
   `@mipmap/ic_launcher_foreground` y los 15 son idénticos píxel a píxel.

3. LA LLAVE (bitacora-obra #124 y #125). Hasta hoy cada corrida de «Armar
   apps» firmaba con una llave de depuración nueva (16-sep `58983eaf…`,
   hoy `9ce411da…`), y Android no instala encima: hay que desinstalar y se
   pierde lo que no se subió. Ahora:
   - La llave vive en el bucket privado `quell101-llaves`
     (`android/firma.keystore`), sin ningún Worker atado: no hay dirección
     por donde bajarla. Tiene forma de llave de depuración (alias
     `androiddebugkey`, clave `android`); lo secreto es el archivo.
   - Sólo se crea con `crear_llave: true` Y si R2 dice que no existe.
     Cualquier otra falla al leerla tumba el armado. **Nunca la borren ni
     la regeneren**: con otra llave, todos los teléfonos tendrían que
     desinstalar otra vez.
   - Gradle NO tomó `~/.android/debug.keystore` en el corredor (firmó con
     otra, `f8ca7951…`), así que el .apk se firma a mano con `apksigner`
     después de `assembleDebug`, y se compara la huella antes de publicar.
   - Huella de la llave fija: SHA-256 `844cafea1fa644fc1b7d47e180d2fecafdb726f6ae351eaab5f4534ab371e9e4`.
     El `android.apk` que se baja hoy de quell101 la trae (run 37897111165).

4. LO QUE QUEDA. Esta vez, quien tenga la app vieja tiene que desinstalarla
   una sola vez (después de revisar que no tenga nada por subir); de aquí en
   adelante cada versión se instala encima. El instalador de Windows de
   quell101 sigue con el ícono viejo: se le pregunta a Mike.
