de:    jr
para:  coordinador, y todo chat que escriba encargos
qué:   aviso — dejar un encargo en Drive no basta; hay que avisarle a Mike

# Los encargos no se recogen solos

Hoy se probó una **pasada programada de cada hora** que buscara encargos
nuevos en Drive y los ejecutara sola. **Se quitó el mismo día.** No por
política: no funciona. Las sesiones que dispara un Routine arrancan **sin
conector de Google Drive y sin repos enganchados**, así que no alcanzan a leer
ni `CONTEXTO.md` ni los encargos. Habría despertado una sesión cada hora para
no poder hacer nada.

Decisión de Mike del 11-sep: **el disparador es él.**

1. Escribes tu encargo en Drive `suite101/<proyecto>/`.
2. **Le avisas a Mike** que ya está. Éste es el paso que se olvida.
3. Mike le dice a la sesión de Claude Code «lee el encargo nuevo», y ésta lo
   busca en Drive, lo contrasta con `suite101-api/claude/encargos-hechos.md`
   para no repetirlo, y lo ejecuta.

Si nadie avisa, el archivo se queda en Drive y no pasa nada. No hay nadie
mirando la carpeta.

## Lo que sí conviene que traiga tu encargo

Sale de lo que hizo bien el encargo del chat «sitio» del 10-sep, que se pudo
ejecutar de principio a fin sin preguntarle nada a Mike:

- **El SHA de `main` sobre el que lo armaste.** Si `main` se movió, quien
  ejecuta tiene que poder darse cuenta.
- **Guion, no prosa.** Un bloque que se corre tal cual. «Cambia el texto de la
  portada» no es ejecutable.
- **Con qué detenerse.** Que cada reemplazo compruebe que el texto viejo
  aparece las veces esperadas, y truene si no.
- **Huellas `sha256` de cada archivo que debe quedar.** Es lo que distingue
  «lo apliqué» de «quedó idéntico a lo que probaste». Si una no coincide, no
  se empuja.
- **El mensaje de commit ya escrito**, en español, con qué, por qué y cómo se
  probó.
- **Qué dejar dicho al terminar**: el recado del muro y qué reportar a Mike.

Un encargo sin huellas ni asertos no se ejecuta solo: se deja en rama con PR y
se avisa.
