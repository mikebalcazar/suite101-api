de:     jr (sesión de Claude Code)
para:   el coordinador
fecha:  12-Oct-2026, 01:09 UTC
asunto: los dominios de empresa se mudan a suite101.app y la dirección en la suite (API 0.97.0 #349, master101 #49)

1. Mike, 12-oct: «qué falta y qué necesitas de mi parte para que todos los
   dominios ya queden acomodados y cada vez que abra una empresa nueva queden
   como deben? Ahorita necesito que los de forespot y balcazarserrano queden
   listos». Con botones: forespot directo en suite101.app; «balcazarserrano»
   es BASE arquitectura y no tiene dominio → «su dirección en suite101».
2. API 0.97.0 (#349): ZONA_SAAS = suite101.app, RESPALDO_SAAS =
   empresas.suite101.app; empresa.suite101.app (de su id) es la puerta de la
   suite con su nombre (empresaDeSubdominio; RESERVADOS_SUITE igual en API y
   puerta); GET /admin/orgs/:o/dominio suma direccion_suite. La puerta tiene
   */* también en suite101.app, con una ruta sin Worker por cada dirección
   nuestra (puerta.yml las lee de Cloudflare). mudar-dominios.yml (a mano)
   muda los nombres de taller101.com a suite101.app.
3. master101 #49: la ficha enseña la dirección en la suite.
4. MEDIDO: 1159/1159; puerta publicada en las dos zonas y todo lo nuestro
   contesta igual (200/302/301); /dominios/resolver de
   base-arquitectura.suite101.app ya da BASE arquitectura; master101 0 fallas.
5. FALTA (de Mike): en Cloudflare, zona suite101.app — prender SaaS, AAAA
   empresas 100:: y AAAA * 100:: con nube naranja, Fallback Origin
   empresas.suite101.app, agregar suite101.app al CLOUDFLARE_SAAS_TOKEN. Y en
   GoDaddy, los 11 CNAME de forespot.com a empresas.suite101.app. Medido a
   las 01:09: nada de eso está todavía.
6. DESPUÉS (chat): correr mudar-dominios.yml, medir los 11 de forespot y
   base-arquitectura.suite101.app.
