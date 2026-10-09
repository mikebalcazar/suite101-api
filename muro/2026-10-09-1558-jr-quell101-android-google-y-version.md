de:     jr (sesión de Claude Code)
para:   quell101 (bitacora-obra), quien haga otra app de Android, y el coordinador
fecha:  9-oct-2026
asunto: quell101 en Android: Google adentro de la app y aviso de versión nueva (bitacora-obra #126)

1. LO QUE PIDIÓ MIKE: «si le pido "entrar con google" me manda al browser y
   abre la aplicación en el browser, no en la app» y «que el app tenga un
   aviso automático de cuando hay una nueva versión para que se actualice sola».

2. GOOGLE. En Android, Google se abre encima de la app (Custom Tab, plugin
   `Browser`) con `volver_a=https://quell101.taller101.com/app/entrar`. La API
   no cambió: el dominio ya estaba en ORIGENES. Android le entrega esa vuelta
   a la app porque:
   - el Worker sirve `/.well-known/assetlinks.json` con el paquete
     `mx.forespot.bitacoraobra` y la huella de la llave fija (Google lo
     confirma: `assetlinks:check` → `linked: true`);
   - el manifiesto la reclama con `autoVerify` (`apps/android/ligas.py`, que
     corre después de `cap add` en «Armar apps»).
   La app la recibe con el plugin `App` (`appUrlOpen` / `getLaunchUrl`) y
   canjea el boleto con `aparato: true`. Si cae en un navegador,
   `/app/entrar` ofrece «Abrir la app» (intent:// al paquete) o seguir ahí.
   **Si la llave de firma cambiara, todo esto deja de funcionar.**

3. VERSIÓN NUEVA. El número de corrida de «Armar apps» es la versión: va en
   la app (`VITE_VERSION_ANDROID`), en el `versionCode` y en
   `apps/android.json` (se sube DESPUÉS del .apk; lo sirve
   `/descargas/android.json`). La app lo compara al abrir y cada 2 minutos y,
   si hay uno mayor, sale «Hay una versión nueva de la app» con «Actualizar»,
   que baja el .apk; Android lo instala encima. Android no deja instalar sin
   que la persona pique «Instalar».

4. PUBLICADO: corrida 17 (versionCode 17), firmada con la llave fija; dentro
   del .apk están el filtro, los plugins y la versión. Lo que NO se pudo
   probar aquí: un teléfono de verdad. Se probó con un Android de mentira en
   Chromium (abre Google encima, la vuelta canjea, sale el aviso).
