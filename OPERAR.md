# Cómo opera un chat en este repositorio

Este archivo va **igual en los seis repositorios** con código de taller101
(`suite101-api` todavía está vacío). Si lo cambias en uno, cópialo a los demás
en el mismo trabajo: seis copias que se separan son peor que ninguna. El 8-sep
se comprobaron las seis y estaban idénticas; conviene volver a comprobarlo. Es el contrato: un chat nuevo lo lee y ya sabe
trabajar sin preguntarle nada a Mike y sin que Mike prenda su computadora.

La regla de fondo: **Mike decide, el chat ejecuta y mide.** Si un chat te está
pidiendo que abras GitHub, que hagas merge o que le digas si el sitio quedó
bien, ese chat no leyó este archivo.

---

## 1. Arranque (esto va primero, siempre)

El contenedor del chat se borra entre sesiones. El token no: vive en el
conocimiento del proyecto. Se recupera así, sin imprimirlo nunca:

```bash
python3 -c "import re,pathlib; t=pathlib.Path('/mnt/project/CONTEXTO.md').read_text(); \
pathlib.Path('/tmp/.gh_token').write_text(re.search(r'github_pat_[A-Za-z0-9_]+',t).group(0))"
chmod 600 /tmp/.gh_token
```

Comprobar que alcanza este repositorio antes de cualquier otra cosa:

```bash
T=$(cat /tmp/.gh_token)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $T" \
  https://api.github.com/repos/mikebalcazar/suite101-api
```

`200` = adelante. `404` = el token no tiene este repositorio en su lista;
**eso se le dice a Mike y se para ahí**, no se busca otro camino.

Clonar:

```bash
git clone "https://x-access-token:${T}@github.com/mikebalcazar/suite101-api.git" /home/claude/repo
cd /home/claude/repo && git config user.name "claude" && git config user.email "mike@forespot.com"
```

Nunca se escribe el token en un mensaje, en un commit, ni en un archivo del
repositorio. Solo en `/tmp/.gh_token`.

## 2. Un chat a la vez

Después de clonar, mirar si existe `claude/EN-CURSO.md`. Si existe y tiene menos
de dos horas, **otro chat está trabajando aquí**: no se toca nada, se le dice a
Mike qué dice el archivo y se para. Si no existe o ya venció, se escribe, se
empuja a `main` de inmediato —el Action lo ignora por `paths-ignore`— se
trabaja, y se borra en el mismo commit con el que se termina.

```
# EN CURSO
chat:    <título del chat>
tarea:   <qué se está haciendo>
desde:   2026-09-08 05:02 UTC     (date -u)
```

El 8-sep dos chats hicieron lo mismo al mismo tiempo, dos veces. La segunda dolió
más: un commit anunciaba en su mensaje "Fira Sans para numeros" y el archivo no
la traía —cero `@font-face`, cero carpeta de fuentes, los enlaces a Google
intactos—. De ahí sale la regla que sigue.

## 3. El mensaje de un commit no es prueba de nada

Antes de dar por hecho lo que dice un commit, un `continuar.md` o este mismo
archivo, **se abre y se mide**. Un mensaje describe la intención de quien lo
escribió; el archivo dice lo que quedó. Cuando no coinciden, manda el archivo.

## 4. Lo primero que se mira

```bash
git log --oneline -5
curl -s -H "Authorization: Bearer $T" \
  "https://api.github.com/repos/mikebalcazar/suite101-api/actions/runs?per_page=3" \
  | python3 -c "import json,sys; [print(r['name'], r['status'], r['conclusion'], r['head_branch']) for r in json.load(sys.stdin)['workflow_runs']]"
```

Si el último run no está verde, **eso va primero**. No se apila trabajo nuevo
sobre un despliegue roto.

## 5. Un cambio

1. Rama `claude/<lo-que-hace>`.
2. Medirlo antes de empujar, con lo que aplique (ver §7).
3. Commit **en español**, diciendo qué se hizo, por qué y **cómo se probó**.
   Sin identificadores de modelo, sin coautorías.
4. PR y merge a `main`, por API. Todo desde el chat:

```bash
curl -s -X POST -H "Authorization: Bearer $T" \
  https://api.github.com/repos/mikebalcazar/suite101-api/pulls \
  -d '{"title":"…","head":"claude/…","base":"main","body":"…"}'
# y con el número que devuelve:
curl -s -X PUT -H "Authorization: Bearer $T" \
  https://api.github.com/repos/mikebalcazar/suite101-api/pulls/<N>/merge \
  -d '{"merge_method":"squash"}'
```

5. Leer el run del merge y **contarle a Mike qué se midió, con números, y qué
   no se pudo verificar.**

## 6. El chat no alcanza producción — el runner sí

El proxy de salida del chat rechaza `*.workers.dev`, `*.netlify.app`,
`api.cloudflare.com`, Google Fonts y casi todo. Solo pasan `github.com`,
`api.github.com`, npm y PyPI. **No se rodea: se usa el runner.**

El corredor de GitHub Actions sí tiene internet abierto. Por eso **cada
workflow que publica termina probando lo que publicó**. Ver `verificar.yml`.

**Ojo: el log de Actions NO es el canal de vuelta.** Descargarlo redirige a
`results-receiver.actions.githubusercontent.com`, que el proxy también rechaza.
Se midió el 8-sep con el run #36. Del log, el chat solo alcanza a ver si el
paso salió `success` o `failure`, sin un solo número.

Por eso `verificar.yml` **deja lo que midió como comentario del commit**. Eso
lo sirve `api.github.com`, que sí pasa:

```bash
# el resultado de la verificación del último merge
curl -s -H "Authorization: Bearer $T" \
  "https://api.github.com/repos/mikebalcazar/suite101-api/commits/<SHA>/comments" \
  | python3 -c "import json,sys; [print(c['body']) for c in json.load(sys.stdin)]"

# y si algo falló, en qué trabajo fue
curl -s -H "Authorization: Bearer $T" \
  "https://api.github.com/repos/mikebalcazar/suite101-api/actions/runs/<ID>/jobs" \
  | python3 -c "import json,sys; [print(j['name'], j['conclusion']) for j in json.load(sys.stdin)['jobs']]"
```

Regla general: **lo que el chat necesite saber del corredor tiene que volver por
`api.github.com`** —comentario de commit, estado de commit o conclusión del
trabajo—, nunca por el log.

**Si el paso sale verde pero no hay comentario**, el token de Actions está en
solo lectura: el `curl` recibe 403 y no falla, así que miente. Se arregla en
Settings → Actions → General → Workflow permissions → **Read and write**. El
8-sep estaba así en cuatro de los cinco repositorios y por eso el verificador
solo daba semáforo, nunca números. Ya están los cinco en `write`; se comprueba:

```bash
curl -s -H "Authorization: Bearer $T" \
  "https://api.github.com/repos/mikebalcazar/suite101-api/actions/permissions/workflow"
```

`verificar.yml` se puede disparar solo, sin publicar nada:

```bash
curl -s -X POST -H "Authorization: Bearer $T" \
  "https://api.github.com/repos/mikebalcazar/suite101-api/actions/workflows/verificar.yml/dispatches" \
  -d '{"ref":"main","inputs":{"url":"https://…","marca":"…","rutas":"/api/salud","cifras":"Cifras, Raleway, sans-serif"}}'
```

**Cuidado con `marca`:** se busca en el HTML tal como llega. Si el nombre está
dibujado en un SVG o en un `<img>`, no aparece como texto y la comprobación sale
roja con el sitio perfecto. Pasó el 8-sep en el portal: la portada dice
`roster101`, no "Taller 101", y se perdió un run buscando una fuente que estaba
bien. **Ante un rojo, se revisa primero la cadena que se pidió.**

Regla: **si algo no se puede medir desde el chat, se mide en el runner.** Si
tampoco ahí, se le dice a Mike qué quedó sin verificar. Nunca se supone.

## 7. Cómo se mide, por tipo de cambio

| Qué cambió | Cómo se prueba, sin Mike |
|---|---|
| Interfaz web | Vite en local + Playwright con `fetch` simulado. 390×844 y 1440. Contar elementos (`locator().count()`), no mirar la captura. Los archivos de prueba se borran antes del commit |
| Migración de base | `sqlite3` en memoria, todas las anteriores aplicadas, `PRAGMA foreign_keys = ON`, con datos. Filas antes/después y `PRAGMA foreign_key_check` |
| Sitio ya publicado | Paso `Verificar` dentro del workflow. El runner le pega a la dirección real |
| Tipografía | El input `cifras` de `verificar.yml` abre el sitio en Chromium y mide el ancho del texto ya pintado. Que una `.woff2` responda 200 no dice que se esté aplicando |
| Iconos y logotipo | `cairosvg` + PIL a 512 y a 32; se mide el resultado, no se ve |
| Apps (APK, instalador) | `workflow_dispatch` de `apps.yml`; el log dice si armó y subió |
| Netlify | El push dispara la construcción; el estado se lee en el commit (`/commits/<sha>/statuses`) |

## 8. Lo que un chat NO hace nunca

- Pedirle a Mike que abra GitHub, que haga merge o que verifique un despliegue.
  Todo eso lo hace el chat.
- Escribir, leer o listar secretos. Se comprueban por el deploy en verde.
- Tocar los nombres de infraestructura (Worker, base, bucket, sitio de Netlify,
  `appId`, extensiones de archivo). Renombrarlos desliga cosas que ya viven.
- Rodear el proxy. Si no alcanza, se reporta.
- Inventar un procedimiento nuevo. Si este archivo no cubre el caso, se resuelve
  **y se agrega aquí**, en los seis repositorios.

## 9. Lo único que sigue necesitando a Mike

Corto y explícito, para que nadie invente más:

1. **Que el PAT exista y traiga los seis repositorios**, con permisos
   *Contents: RW · Pull requests: RW · Actions: RW · Workflows: RW ·
   Administration: RW*. Sin `Workflows: RW` los archivos de
   `.github/workflows/` no se pueden empujar; sin `Administration: RW` no se
   puede cambiar la rama por defecto ni leer los permisos del token de Actions.
   Los cinco quedaron comprobados el 8-sep con empujes reales, no supuestos.
2. **Renovar el PAT cuando venza** y pegarlo en `CONTEXTO.md §3.3`. Un solo
   lugar, un solo renglón.
3. **Los secretos de cada repositorio** (`CLOUDFLARE_API_TOKEN`,
   `RESEND_API_KEY`, lo de Netlify). Se ponen una vez; ya están.
4. **Decidir.** Producto, alcance, prioridad. Eso no se delega.

Todo lo demás —escribir, probar, empujar, mergear, publicar, armar apps,
verificar— lo hace el chat.
