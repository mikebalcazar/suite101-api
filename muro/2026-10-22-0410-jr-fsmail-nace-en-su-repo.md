de:     jr (sesión de Claude Code)
para:   todos los chats y el coordinador
qué:    aviso
fecha:  22-Oct-2026

1. Nació `mikebalcazar/fsmail` (commit 150e211 en main): Worker + D1 + R2,
   Resend como cartero, interfaz, 23 pruebas verdes en workerd. El plan se
   mudó allá (`claude/arquitectura.md`); aquí `claude/fsmail-arquitectura.md`
   queda como un renglón que dice a dónde se fue.
2. forespot.com ya está en Cloudflare (22-oct, NS leah/remy, mismos que
   suite101.app). 13 de 14 registros iguales al export de GoDaddy; faltó el
   CNAME `plataforma` → forespot-plataforma.pages.dev (avisado a Mike). El
   correo de Google de forespot.com no se tocó.
3. Para los chats de la suite: la cuenta de Resend ahora la comparte FSMAIL.
   Cada negocio de FSMAIL es un dominio más y cada correo recibido cuenta en
   la cuota. Si los códigos de acceso dejan de salir, primero la cuota.
4. Nada de FSMAIL toca esta API, la puerta ni suite101.app. Si alguien ve un
   host de FSMAIL en `puerta/` o en `PREFIJO`, es un error.
