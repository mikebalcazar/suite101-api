de:     jr (programador)
para:   quien toque la tabla `empresa` o /orgs/:o/empresa/logo (API 0.80.0 #268), la pantalla «Empresa» de workshop101 (#14), los documentos de quote101 (cotizador-t101 #83) o «Borrar» de un renglón sacado del alcance (dash101 #145)
fecha:  7-oct-2026, 02:16 UTC
asunto: la empresa firma sus documentos; el responsable es quien cotiza; un renglón sacado se borra ahí mismo

MIKE, 7-oct, con la hoja de quote101 enfrente: «El verde debería ser el
logotipo del negocio que cotiza (…) yo debo subir en la configuración de la
empresa (en director) el logotipo en PNG en una buena resolución y que ese
sea el que se ocupe para todos los documentos que se generan en suite101. Lo
rojo debería ser también info que se configura desde director101, no
debería poder editarse aquí (…) Lo azul es el nombre del usuario que está
generando la cotización (…) debe estar registrado como Mike Balcázar».

«director101» se tomó como WORKSHOP101: es el panel de quien dirige la
empresa (dueño o administración). Si Mike pensaba en otra cosa, lo dice y
se mueve; la API no cambia.

1. LA API (0.80.0, #268).
   · `empresa` suma correo, telefono, sitio_web, direccion, logo_llave y
     logo_at. La migración org 0040 CORRE EN CÓDIGO (`empresaLogoYDatos`):
     `SQL_EMPRESA` ya nace con las seis y a la empresa vieja se le agregan
     las que falten. Un ALTER suelto tronaba en las pruebas que re-corren
     migraciones («duplicate column») — no lo regresen a SQL.
   · PATCH /empresa (quien dirige) los acepta; vacío es null. GET contesta
     `logo_ruta` (relativa a la API, con ?v= que cambia con cada logotipo).
   · PUT /orgs/:o/empresa/logo: el cuerpo crudo es la imagen, PNG o JPG de
     hasta 5 MB, y se MIRA LA FIRMA del archivo (no el encabezado). R2
     `orgs/<org>/empresa/logo-<ts>.png|jpg`; el anterior se borra. DELETE lo
     quita; GET lo sirve a cualquier sesión de la empresa (nosniff).
   · `/negocios` conserva su forma vieja: lo nuevo no viaja por ahí.
   · D1 0023: mike@forespot.com se llama «Mike Balcázar» (en producción ya
     lo dice; leído, no escrito, con un SELECT).

2. WORKSHOP101 (#14). Tercera sección, «Empresa»: nombre, RFC, correo,
   teléfono, sitio y dirección; logotipo que se arrastra, se pega o se
   escoge, y se pinta desde la API; quitarlo pide dos piquetes. El banco
   falso imita /empresa y /empresa/logo.

3. QUOTE101 (#83). `suiteDB.empresa()` lee la empresa y trae el logotipo
   como data: URL (sirve igual en la hoja, en los PDF de otra ventana y en
   el Excel); `EMPRESA_DOC` lo guarda y de ahí leen la hoja y TODAS las
   exportaciones: PDF cliente, interno, presupuesto, Excel arq y recibo.
   Se fue `LOGO_SRC` y se fueron «Taller 101», info@taller101.com y el
   teléfono escritos a mano. En la hoja ya no hay campos para el nombre, el
   contacto ni el responsable. Sin logotipo, la hoja dice «Sube el logotipo
   en workshop101 › Empresa» (no se imprime) y los PDF van sin él.
   Responsable: `hoja.responsable`, se apunta la primera vez que alguien la
   EDITA (una vieja abierta para ver enseña a quien entró, sin guardarlo) y
   viaja con la cotización. LA FIRMA (imagen y «Miguel Ángel Balcázar») NO
   se tocó: es de Mike y no estaba en el encargo.

4. «SANJE CC37» (Mike, mismo día: «Elimínalo, yo no encuentro dónde»).
   El único botón era el barrido de todo el proyecto, al final de la lista,
   y no borra un ítem con cobro. Ahora `borrar-cancelados` acepta `ids` y
   `soltar` (sólo con ids): el cobro y el compromiso se quedan en el
   PROYECTO sin ítem, el archivo pasa al proyecto, un avance de obra sigue
   deteniendo. En dash101 cada renglón sacado tiene «Borrar»: revisa, dice
   qué se queda y hasta entonces ofrece «Borrar para siempre». El borrado
   en sí lo pica Mike: en producción sólo se mira.

PENDIENTE (dicho a Mike): los demás documentos de la suite —PDF de dash101,
reportes de quell101, roster101, peek101— todavía no leen el logotipo de la
empresa. La API ya lo da (`logo_ruta`); falta que cada app lo lea.

MEDIDO
  · API: empresa-logo.spec 7/7 y borrar-cancelados (5 nuevas), las dos
    fallan sin el cambio; 812/812; humo «todo verde»; /salud contrato 0.80.0.
  · workshop101: 7+19+78+10 contra el banco; contra STAGING de verdad
    67/67 (subió un PNG a R2 y lo pintó), empresa de prueba borrada;
    producción sirve 4c617433, 16/16.
  · quote101: la-empresa.spec 3/3 (las 3 fallan sin el cambio); 137/137.
  · dash101: pruebas contra staging en verde en el PR.
