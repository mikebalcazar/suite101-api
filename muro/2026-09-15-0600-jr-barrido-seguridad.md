de:    jr
para:  coordinador, mike, todos los chats
qué:   Barrido de seguridad de los catorce repositorios, sus workflows, los paquetes copiados a mano y las cuentas de GitHub, Cloudflare y Netlify. No apareció spyware ni código escondido. Tres puntos débiles de diseño y dos cosas que no son de la suite y Mike debe reconocer.

# Barrido de seguridad · 15-sep-2026

Mike lo pidió porque ha tenido «breaches». Se revisó lo que el chat alcanza;
lo que no alcanza (su compu, las consolas web) queda anotado abajo.

## Qué se revisó y qué salió

| Qué | Cómo | Resultado |
|---|---|---|
| Autores de todos los commits, 14 repos | `git log` | sólo Mike, los chats y Actions |
| Llaves en archivos rastreados y en TODO el historial | patrones de tokens (Cloudflare, Resend, GitHub, AWS, Stripe, llaves privadas) y archivos `.env`/`llaves.env` | nada, en ningún repo ni en ningún commit |
| Patrones de malware en código propio | `eval`, `new Function`, base64 ejecutable, keyloggers, portapapeles, registro de Windows, tareas programadas, antivirus, capturas de pantalla, webhooks a Discord/Telegram/pastebin | cada acierto tiene explicación legítima (PDF, sesiones, atajos de teclado, «copiar reporte») |
| Hosts a los que sale el código | extracción de URLs | sólo GitHub, Cloudflare, Netlify, Firebase, Resend, cdnjs, opendesign.com |
| Scripts `.bat`/`.ps1`/`.sh` que corren en la compu de Mike | lectura completa | cargan `llaves.env` local y llaman `wrangler`/`git`; nada sale a otro lado; `llaves.env` está en `.gitignore` y el script se niega a subirlo |
| Cascarones Electron (draw, shape, nest) | `contextIsolation`, `nodeIntegration`, qué lanzan | bien cerrados; sólo lanzan un `.exe` de su carpeta de descargas |
| Actualizadores de escritorio | lectura | bajan de GitHub Releases y comprueban sha256 contra el `.json` de `descargas` antes de instalar |
| Paquetes copiados a mano | diff contra el tarball oficial de npm | `libredwg-web 0.7.10`, `acad-ts 3.0.2`, `three 0.169` idénticos byte a byte |
| Lockfiles y scripts de instalación npm | `resolved`, `postinstall` | todo de registry.npmjs.org; ningún script de instalación |
| Workflows | `uses:`, disparadores, `curl \| sh`, `pull_request_target` | sólo `actions/*` y `google-github-actions/auth@v2`; ningún disparador abierto a terceros |
| Quién corrió los workflows | API de GitHub, últimos 100 por repo | sólo `mikebalcazar` y `claude[bot]` |
| Releases de `descargas` | API | 16, todas subidas por `github-actions[bot]` |
| Colaboradores de los 14 repos | API | sólo Mike (admin); 0 forks |
| Workers de Cloudflare | lista de la cuenta | 15; los 14 de la suite y `komun-api` |
| Sitios de Netlify | lista del equipo | 8; los de la suite, `bosque-bravo` y uno vacío `shiny-mousse-a355f8` |

## Lo que sí hay que atender

1. **El convertidor ODA se instala sin huella.** `draw101/shape101 core/oda.py`
   lee `t101draw.netlify.app/oda.json`, baja el MSI de la URL que diga ese
   archivo y corre `msiexec`, sin comprobar sha256. Quien controle ese sitio
   de Netlify o intercepte la descarga puede instalar lo que quiera en la
   máquina del usuario. Arreglo: sha256 en `oda.json` y comprobarlo como ya
   hace el actualizador propio.
2. **quote101 carga `exceljs` y `jspdf` desde cdnjs sin `integrity`.** Si
   cdnjs sirviera otra cosa, correría en el navegador del cliente. Arreglo:
   atributo `integrity` o empaquetarlos.
3. **`llaves.env` en la compu de Mike guarda en texto plano** el token de
   Cloudflare, la llave de Resend y la clave admin de roster101. No está en
   git, pero un breach en esa compu se lleva las tres. Si hubo breach en la
   compu, hay que rotar esas llaves (Mike, desde cada consola).

## Lo que no es de la suite y Mike debe reconocer

- Worker `komun-api` (creado 12-sep, tocado 14-sep) para `app.komun.com.mx`,
  con correo de demo a mike@forespot.com. Parece proyecto de Mike.
- Sitio Netlify `bosque-bravo` (repo público `mikebalcazar/bosque-bravo`,
  desplegado 8-sep desde la cuenta de Mike) y `shiny-mousse-a355f8` (vacío).

## Lo que el chat no puede revisar

La compu de Mike (ahí es donde vive un spyware real, no en estos repos),
los webhooks y deploy keys de GitHub (el proxy no los deja leer), las
sesiones abiertas y apps autorizadas en GitHub/Cloudflare/Netlify/Google,
y los secretos en sí (un chat no los lee). Eso lo tiene que mirar Mike.
