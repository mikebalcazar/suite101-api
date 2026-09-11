de:    jr
para:  todos
qué:   suite101-arquitectura.md ya se puede leer; es la v1 y falta la v2

# El documento que «manda» ya está donde todos lo alcanzan

`README.md`, `claude/ENCARGO-fase1.md` y `claude/COORDINACION.md` lo citan como
el documento que manda, y vivía en el único sitio que ningún chat puede leer:
el conocimiento de un proyecto de claude.ai. Mike lo recuperó el 11-sep.

Está en dos lugares, y son idénticos byte por byte — huella `sha256`
`360c069709d6daabd5117839a705a31e29f3e658e2fc4c096e3323158fc8862e`,
23 048 bytes:

- `suite101-api/claude/suite101-arquitectura.md` (la historia)
- Drive `suite101/coordinacion/suite101-arquitectura.md` (para leerlo)

## Ojo: es la v1, y hay una v2

Su primera línea dice **v1, 7-sep-2026**. `COORDINACION.md` habla de una
**v2** del mismo día. Y `README.md` describe un contenido —las 13 tablas del
OrgDB, el D1 master, el contrato de la API— que **esta v1 no trae**.

Esta v1 es el diseño **sobre Firestore**, anterior a la API en Cloudflare. Así
que no se lee entera como vigente:

**Sigue mandando:** el modelo org → negocio → proyecto → ítem; el ítem como
bloque; `estado` (comercial) y `etapa` (fabricación) como ejes independientes;
un escritor por campo (§3); las siete etapas (§2); y los agregados del
proyecto como cachés calculadas.

**Quedó superado:** las decisiones 1, 2 y 9 (un solo Firebase, subcolecciones,
plan Spark); las rules de §5; los índices de §6; y el plan de migración de §7.
Hoy la fuente de verdad de infraestructura es CONTEXTO §5 y el plan es
`dash101-arranque.md`.

**Mike: la v2 sigue faltando.** Estará en el mismo proyecto de donde salió
ésta. Cuando aparezca, reemplaza a la v1 en los dos sitios; la huella de
arriba sirve para no confundirlas.

## Las siete etapas del ítem, para quien las necesite ya

| # | Etapa | Termina cuando | La marca |
|---|---|---|---|
| 1 | Diseño autorizado | el cliente firma el diseño | oficina |
| 2 | Anticipo pagado | entra el anticipo | administración |
| 3 | Compra de materiales | material recibido en taller | compras / almacén |
| 4 | Despiece y ensamble | embalado y etiquetado — aquí nace la `clave` | taller |
| 5 | Entrega | descargado en sitio | chofer, desde su teléfono |
| 6 | Instalación | colocado en su lugar | instalador, desde su teléfono |
| 7 | Cierre | el cliente acepta | residente / cliente |

Etapa 0 es «cotizado, sin empezar». `estado` va aparte: cotizado, vendido o
cancelado.

Para el chat «sitio»: las maquetas de peek101 en el escaparate usan estos
mismos siete nombres, abreviados. Quedaron bien.

## Decisiones de §9 que ya tienen respuesta

- **Partidas** (§9.1): Mike decidió el 9-sep que bajan al ítem (migración
  `0002`, pendiente). Es la fase 2 de `dash101-arranque.md`.
- **Un cliente en dos empresas** (§9.4): dos documentos. Aceptado; está en
  CONTEXTO §6.
- **Renombrar `conta-master` → `dash101`** (§9.5): decidido, pendiente de Mike
  (M9).
