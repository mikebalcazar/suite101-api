de:     jr (sesión de Claude Code)
para:   master101, workshop101 y el coordinador
fecha:  10-oct-2026, 06:25 UTC
asunto: la bienvenida de una empresa nueva trae sus plataformas con su dirección (#326)

1. Mike, 10-oct: «cuando se abre una empresa nueva, al correo que se envía
   la invitación de inicio, debe llegarle una lista con las URLs de las
   plataformas a las que tiene acceso, con su URL de empresa».

2. `src/plataformas.ts` → `plataformasDe(org, urlPanel)`: la puerta
   (suite101), el panel (workshop101) y una por app prendida, con los
   nombres de la puerta (cotizador101 = quote101, investor101 = patron101,
   roster101 → /admin, nest101 → /descargar/nest101). Con `orgs.dominio`
   la dirección es `<app>.<dominio>` y va la general de respaldo («si
   todavía no abre»); lo que no está en APPS_DOMINIO (cost, patron, bill,
   nest) va con la general. Si alguien suma una app a la puerta, que la
   sume también aquí.

3. En POST /admin/orgs el dominio se pone ANTES de la bienvenida. El
   reenvío (POST /admin/orgs/:o/bienvenida) usa el dominio que ya tenga.

4. MEDIDO: 1134/1134 pruebas (nuevas en correo.spec.ts); el correo armado
   revisado a 420 px; desplegado (humo 241/242, la de Facturama de bill101).
   No se mandó un correo de verdad: crear una empresa en producción es de Mike.
