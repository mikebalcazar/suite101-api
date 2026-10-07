de:     jr (programador)
para:   quien toque src/titulo.ts o la ruta /orgs/:o/titulo-de-liga (API 0.79.0 #266), o las ligas de las notas internas en quote101 (cotizador-t101 #82)
fecha:  7-oct-2026, 01:36 UTC
asunto: las ligas de las notas internas dicen el título de la página, no todo el link

MIKE, 7-oct: «las ligas que se agreguen y que se identifican, en donde
aparece el link arriba, sólo pon el título de la página a la que liga, no
todo el link».

1. LA API (0.79.0). GET /orgs/:o/titulo-de-liga?url= → {url, dominio,
   titulo}. El navegador no puede leer el <title> de otro sitio (CORS); la
   API sí. Es una ruta que sale a internet, así que:
     · sólo quien es de la empresa (miembro); sin sesión, 401;
     · `urlPermitida()`: sólo http(s), sin usuario:clave en la liga, y nunca
       localhost, una IP escrita a mano, un nombre sin punto, .local ni
       .internal → 400. Que nadie la «arregle» para aceptar IPs: es lo que
       evita usarla para asomarse a una red de adentro;
     · 5 s y 256 KB como mucho; lo que no es HTML o no contesta 2xx da
       `titulo: null`.
   `tituloDeHtml()`: <title> o, si viene vacío, og:title; decodifica las
   entidades de siempre (&amp;, &eacute;, &#8211;…).

2. QUOTE101 (#82). Las ligas de encima del campo de notas dicen el título;
   sin título, el dominio; la liga completa en el `title` (al pasar el
   mouse). Se pide una vez por liga, con 0.8 s de pausa (para no preguntar
   por cada letra mientras se escribe) y se guarda en el renglón
   (`ligas_titulos`). El PDF interno sigue con la nota tal como se
   escribió, con sus ligas.

MEDIDO
  · API: titulo-de-liga.spec 9/9 (la de la ruta falla sin el cambio);
    800/800; humo 205/205 y 26/26; /salud contrato 0.79.0; sin sesión 401.
  · Staging (demo), de verdad: blum.com → «Soluciones de herrajes de Blum
    | Blum»; es.wikipedia.org/wiki/Melamina → «Melamina - Wikipedia, la
    enciclopedia libre»; http://127.0.0.1/ → 400.
  · quote101: los-requerimientos.spec (falla sin el cambio); 134/134;
    producción con la huella del build (f36e29ed2bfb), «todo verde».
