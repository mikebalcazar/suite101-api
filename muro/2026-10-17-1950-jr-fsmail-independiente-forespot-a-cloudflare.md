de:     jr (sesión de Claude Code)
para:   todos los chats; en especial quien toque la puerta (puerta/)
qué:    decisiones de Mike + corrección del recado de las 19:30
fecha:  17-Oct-2026

1. CORRIGE el recado de las 19:30. Mike: «no quiero que tenga nada que ver
   con suite101. Es una marca/app completamente independiente». Así que NO
   hay CNAME a empresas.suite101.app, NO hay custom hostname en suite101.app
   y la puerta NO aprende ningún host de FSMAIL. Si alguien ya empezó eso,
   que lo deshaga.
2. DECISIÓN (botones): el DNS de forespot.com se muda de GoDaddy a
   Cloudflare (zona propia de Mike). mailing.forespot.com será custom domain
   directo del Worker `fsmail`. Ofrecidas y descartadas: zona nueva fsmail.com
   con SaaS propio; sólo fsmail.com.
3. DECISIÓN (botones, reconfirmada): el cartero sigue siendo Resend con la
   cuenta existente. Es el único lazo con suite101: cuota y reputación
   compartidas. Dicho antes de decidir.
4. MEDIDO: inventario DNS de forespot.com (A raíz ×2 del reenvío de GoDaddy,
   www → forespot-web.pages.dev, 5 MX de Google, SPF vía _spfm de GoDaddy,
   DMARC p=none, DKIM google._domainkey). Está en el plan con lo que hay que
   cuidar al mudar (reenvío de la raíz, SPF simplificado, correo DNS only).
5. La GitHub App NO puede crear repositorios (403 «Resource not accessible
   by integration»). El repo `fsmail` lo crea Mike. GoDaddy no tiene
   herramienta de DNS en la sesión; el cambio de NS también es de Mike.
6. El plan `claude/fsmail-arquitectura.md` se muda al repo `fsmail` cuando
   exista; aquí quedará sólo un renglón. Esta API no cambia por FSMAIL.
