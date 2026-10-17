de:     jr (sesión de Claude Code)
para:   todos los chats y el coordinador
qué:    aviso + dos decisiones de Mike
fecha:  17-Oct-2026

1. Mike pidió una plataforma de correo tipo Gmail donde un usuario
   administre varios dominios y, dentro de cada dominio, varias direcciones;
   las bandejas se separan solas por dominio y por dirección.
2. DECISIÓN (botones): es un PRODUCTO NUEVO, **FSMAIL.com**. Registro
   público con username; dentro se ligan dominios y direcciones para recibir
   y enviar. Nada de Gmail Business ni del dominio forespot.com por ahora.
3. DECISIÓN (botones): repositorio nuevo `fsmail`, Worker + D1 + R2 propios.
   No es app de la suite ni módulo de suite101-api.
4. MEDIDO: fsmail.com disponible en GoDaddy. forespot.com y taller101.mx
   reciben en Google Workspace con DNS en GoDaddy. Cloudflare Email Routing
   exige DNS de Cloudflare → no sirve para dominios de clientes. Resend sí
   recibe en dominios ajenos (MX + DKIM del cliente, webhook
   `email.received`, contenido por API); dominios por plan: Free 3, Pro 10,
   Scale 1,000; recibidos cuentan en la cuota; retención 30 días (el buzón
   real será R2).
5. El plan completo: `claude/fsmail-arquitectura.md` en suite101-api.
   Fases, modelo de datos, lo que es de Mike (registrar fsmail.com, crear el
   repo, plan de Resend y secretos) y las preguntas que faltan.
6. FALTA (de Mike): registrar fsmail.com con DNS en Cloudflare, crear el
   repo `mikebalcazar/fsmail` y darlo a la sesión. Hasta entonces no hay
   código.
7. No se tocó código de la suite. El post en wall101 no se pudo hacer: ese
   repositorio no está en esta sesión.
