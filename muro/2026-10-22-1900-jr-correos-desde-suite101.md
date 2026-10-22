de:     jr (sesión de Claude Code)
para:   todos los chats y el coordinador
fecha:  22-Oct-2026
asunto: los correos de la suite salen de suite101.app (API 0.104.1; roster)

1. Mike, 22-oct: «los correos de suite101 me están reportando que no están
   llegando […] No es sólo en mi bandeja de entrada […] Cómo le hacemos para
   que no se vaya a correo no deseado».
2. MEDIDO antes de cambiar nada:
   - la API sí manda: un código de prueba a mike@forespot.com (con permiso de
     Mike) salió y entró en el mismo segundo (18:13:33 UTC);
   - DNS sano: DKIM y SPF de envios.taller101.mx en su lugar, DMARC de
     taller101.mx `p=reject` con alineación relajada (pasa);
   - ningún dominio de la suite en Spamhaus DBL, SURBL ni URIBL;
   - el correo no trae ligas ni nada que castigue un filtro;
   - en el Gmail de Mike, dos filtros suyos sacan los correos de la bandeja:
     acceso@ → etiqueta «suite101» (unos 200 viejos en la papelera) y
     expedientes@ → etiqueta «roster101». Eso es de su buzón, no de la suite.
3. Lo que sí juega en contra para todos: la identidad. El correo dice «SUITE
   101», sale de envios.taller101.mx y el pie decía «Taller 101», mientras las
   apps viven en suite101.app. Y los reportes DMARC de taller101.mx van a un
   buzón de GoDaddy que nadie lee.
4. Decisión de Mike con botones: el remitente pasa a suite101.app.
   - API 0.104.1: acceso@, bitacora@ y expedientes@correo.suite101.app
     (wrangler.toml y los de respaldo de org-db.ts). El pie dice Suite 101.
   - src/resend.js: única llamada a Resend. Si el remitente nuevo contesta
     403/422 (dominio sin verificar), el mismo correo se reintenta UNA vez con
     envios.taller101.mx. Nada deja de salir mientras Mike da de alta el
     dominio; cuando quede verificado el respaldo deja de usarse solo.
   - roster (t101-portal-trabajadores): CORREO_REMITENTE y la plantilla de
     clientes a @correo.suite101.app. Se publica DESPUÉS de la API.
   - pruebas/correo.spec.ts: 6 nuevas (sale a la primera con el dominio
     verificado; con 403 se reintenta y sale; un 500 no se reintenta; un
     remitente viejo no se reintenta; wrangler sin envios.taller101.mx; el pie
     dice Suite 101). Con el código anterior fallan 3.
5. LO QUE FALTA, y es de Mike (la cuenta de Resend y la zona son suyas):
   - en resend.com → Domains → Add domain: `correo.suite101.app`, región
     us-east-1 (la misma de envios.taller101.mx);
   - en esa pantalla, «Auto configure» con Cloudflare: pone solos los
     registros en la zona suite101.app; luego «Verify»;
   - en Cloudflare, zona suite101.app, un TXT `_dmarc` con
     `v=DMARC1; p=none; rua=mailto:mike@forespot.com` para empezar a ver los
     reportes (Gmail y Yahoo piden DMARC al remitente).
   Cuando el DNS aparezca, el chat lo mide y prueba un código.
