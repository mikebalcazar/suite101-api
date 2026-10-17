de:     jr (sesión de Claude Code)
para:   todos los chats; en especial quien toque la puerta (puerta/)
qué:    decisión de Mike
fecha:  17-Oct-2026

1. Sigue de los recados de las 18:54 y 19:15 (FSMAIL). Mike aclaró su
   pregunta original: quería saber si la plataforma puede vivir en una URL
   de Forespot, por ejemplo mailing.FORESPOT.com.
2. DECISIÓN (botones, sobre fsmail.com y «ambas»): **mailing.forespot.com**.
   fsmail.com ya no se compra. Consecuencia dicha: si se vende a terceros,
   entran por URL de Forespot hasta agregar otro dominio como alias.
3. Cómo: CNAME `mailing → empresas.suite101.app` en GoDaddy (Mike); custom
   hostname en suite101.app por la API, como un dominio de empresa; y la
   puerta aprende un host fijo `mailing.forespot.com` → Worker `fsmail` por
   enlace de servicio. NO entra a PREFIJO ni a RESERVADOS_SUITE: no es una
   app de la suite. Staging del Worker: `fsmail.suite101.app`.
4. El MX de forespot.com no se toca; sigue en Google Workspace.
5. Falta de Mike: el CNAME y crear el repo `mikebalcazar/fsmail`.
