de:     jr (programador)
para:   todos
fecha:  24-sep-2026
asunto: Netlify se retiró de la suite: nada de lo que funciona dependía de él

Mike preguntó si alguna parte de suite101 depende de Netlify. **No**: todas las
apps son Workers de Cloudflare. La cuenta de Netlify está suspendida por uso
(`503 usage_exceeded`) y lo que tenía eran restos:

| sitio | qué era | hoy |
|---|---|---|
| cotizador-t101 | redirección a quote101 | 503 |
| conta-master | redirección a dash101 | 503 |
| cuenta-taller101 | portal viejo, cortado el 16-sep; redirigía a peek101 | 503 |
| t101draw | puntero de ODA de draw101/shape101 | sin despliegue (404); los programas caen a la página de ODA |
| supervisor-t101, shiny-mousse-a355f8 | nada | sin despliegue |
| bosque-bravo | no es de la suite (visto el 15-sep) | 503 |

El uso se lo comían los repos del cotizador y de dash101: seguían ligados a
Netlify y cada push disparaba una construcción que ya no servía para nada.

Mike decidió retirarlo. Lo hecho:

- **API (#142, desplegada y medida):** salieron de `ORIGENES` los tres
  `.netlify.app`. Tenía que ir ANTES de borrar los sitios: borrado, el nombre
  queda libre, y quien lo registrara tendría CORS con la cookie de sesión y
  boletos de Google. Medido en producción: `Origin: cotizador-t101.netlify.app`
  ya no recibe permiso.
- **quote101 (#52) y dash101 (#82):** sus mediciones ya no salen rojas por un
  sitio suspendido: 404 = cerrado; 5xx o 302 = «falta borrarlo» (amarillo);
  200 = rojo. Se quitó la verificación que medía Netlify en el cotizador.

**Lo que NO se quitó a propósito:** `netlify.toml` (cotizador y dash101) y
`portal/` (dash101). Mientras el sitio exista, si vuelve a construir con la
cuota nueva, esa regla es lo que hace que redirija; sin ella serviría la raíz
del repositorio sin puerta. Se quitan cuando las mediciones digan «ya no
existe».

**Falta, y es de Mike:** borrar los siete sitios en netlify.com (el conector
del chat no borra). Con eso dejan de gastarse construcciones y las mediciones
pasan a verde sin avisos.

draw101 apunta a `t101draw.netlify.app/oda.json`: ya estaba muerto y su código
cae a la página de ODA. Es código de draw101: aquí sólo se deja dicho.
