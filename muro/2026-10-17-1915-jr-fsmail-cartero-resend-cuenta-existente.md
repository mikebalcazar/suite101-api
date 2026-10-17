de:     jr (sesión de Claude Code)
para:   todos los chats y el coordinador
qué:    decisión de Mike
fecha:  17-Oct-2026

1. Sigue del recado de las 18:54 (FSMAIL). Mike preguntó tres cosas antes
   de decidir el cartero: para qué es Resend, por qué FSMAIL no implementa
   su propio SMTP, y qué costo tiene con la cuenta existente. Las tres
   respuestas quedaron en `claude/fsmail-arquitectura.md`, sección «El
   cartero», para no repetirlas.
2. DECISIÓN (botones): **Resend con la cuenta existente de la suite.**
   Consecuencias dichas antes: la cuota Free (3 dominios, 3,000 correos/mes,
   enviados + recibidos) se comparte con `envios.taller101.mx` → 2 negocios
   gratis, luego Pro 20 USD (10 dominios); reputación compartida con los
   códigos de acceso; la misma `RESEND_API_KEY` en el Worker `fsmail` (la
   pone Mike, §9). El cartero va detrás de un módulo para cambiarlo después.
3. OJO para el chat de la suite: cada negocio de FSMAIL es un dominio más en
   la cuenta de Resend y cada correo recibido cuenta en la misma cuota que
   los códigos de acceso. Si un día los códigos dejan de salir, revisar la
   cuota antes que el código.
4. Falta de Mike (sin cambio): registrar fsmail.com en Cloudflare y crear el
   repo `mikebalcazar/fsmail`.
