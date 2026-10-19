# Encargo · el nombre del proyecto, uno solo en toda la suite

**Lo pidió Mike el 19-oct-2026:** «necesito que se cambie el nombre en toda la
suite.» Viene de que ese mismo día quell101 estrenó corregir el nombre de la
obra desde su pantalla principal (`bitacora-obra` PR #139, fusionado).

**Quién lo escribió:** el chat de quell101 (claude.ai). **Ya está escrito y
medido**, no hay nada que diseñar: el parche está aquí al lado y las pruebas
pasaron completas en una sesión con `npm ci`, `workerd` y el Durable Object de
verdad. Lo que falta es empujarlo, y eso un chat de claude.ai no puede.

- **Armado sobre `main` =** `2cb7a6f88b77fc07e025c0753ab8a576441ab837`
- **Parche:** `claude/encargos/2026-10-19-el-nombre-del-proyecto.patch`
  (`sha256 b0b95dec14523577e5dd9a140427c6a2fc63dd1cfedde65f5c47800586866942`,
  blob de git `ee320e7c6ec4f007874c8fb2b8890fd1f452ea0a`)
- **Contrato:** sube a **0.104.0**

## Qué hace

La obra de quell101 y el proyecto de la suite son la misma casa contada de dos
lados (migración 0010), y cada lado guarda su nombre: `quell_projects.name` y
`proyectos.nombre`. Corregir uno dejaba el otro viejo, así que la misma obra se
llamaba distinto en la bitácora de obra que en dash101, quote101 y peek101.

Los dos sentidos, y los dos los mantiene la API:

1. **De quell a la suite.** `PATCH /orgs/:o/quell/projects/:id` con `name`
   llama al gancho nuevo `RENOMBRA_EN_LA_SUITE` (igual que
   `ALTA_EN_LA_SUITE`), que es `OrgDB.renombrarObraEnLaSuite`: si la obra está
   ligada y el nombre cambió, `actualizar('proyectos', …, { nombre })`.
2. **De la suite a quell.** Dentro de `OrgDB.actualizar`, después del `UPDATE`:
   si la tabla es `proyectos` y vino `nombre`, baja a `quell_projects` de la
   obra ligada. Va ahí y no en una ruta porque por ahí pasa **todo** cambio de
   esa tabla, venga de dash101, de quote101 o de la pantalla del proyecto.

`ESCRITORES` **no cambia**: quell101 sigue sin poder escribir en `proyectos`
por el cable; esto es la API manteniendo igual un dato que está escrito dos
veces. Y no hay vuelta infinita: el camino de regreso usa SQL directo y sólo
cuando el nombre de verdad cambió.

## Guion

```bash
git fetch origin && git switch -c claude/el-nombre-en-toda-la-suite origin/main
# Si main ya se movió de 2cb7a6f, aplica igual: el parche sólo toca los
# alrededores que se citan abajo. Si `git apply` se queja, NO lo fuerces:
# aplica a mano con las anclas de la sección siguiente.
git apply --check claude/encargos/2026-10-19-el-nombre-del-proyecto.patch
git apply          claude/encargos/2026-10-19-el-nombre-del-proyecto.patch

# Huellas: si una no coincide, no empujes. Di cuál y para.
sha256sum src/quell/motor.js src/quell/motor.d.ts src/org-db.ts schema/tipos.ts pruebas/el-nombre-del-proyecto.spec.ts
```

Lo que tiene que salir, exactamente:

```
edc9724dc2b8ad132323a53891869c282366fc74128240d7dc2483d890289a02  src/quell/motor.js
d3aab317e45442d3c329e8d3e19bd96f71c3628862d609b1287cc9803fae335b  src/quell/motor.d.ts
2410d44370de1b3f16e68c7336790b93a30b1cfb8d5d80ca4e8bd1181e1bcd66  src/org-db.ts
01cb7c473a41a8288dbfbdb595ce14f51eb8cb85bcd415542cd7ace822485f60  schema/tipos.ts
86e0f5988e55673c9b0f69c259008f4297e8a54d38e476ccdc9146017f3d4f21  pruebas/el-nombre-del-proyecto.spec.ts
```

(Las huellas valen si `main` sigue en `2cb7a6f`. Si alguien tocó esos archivos
antes de que aplicaras, la huella no va a coincidir aunque el cambio esté bien:
entonces lo que manda es el parche aplicado limpio y las pruebas en verde.)

Medición, tal cual se corrió aquí:

```bash
npm ci
npx tsc --noEmit                                     # salió sin un solo error
npx vitest run pruebas/el-nombre-del-proyecto.spec.ts  # 7 de 7
npx vitest run                                        # 52 archivos, 1193 pruebas, 0 fallas
```

Después: PR y merge por API como siempre (`OPERAR.md` §5), y al run del merge
le toca quedar verde. Al terminar, **borra** `claude/EN-CURSO.md` (lo dejó el
chat de quell101) y deja el post en `wall101`.

## Si `git apply` falla: las cuatro anclas

Son cuatro inserciones y un número. Nada se borra.

1. `schema/tipos.ts` — `VERSION_CONTRATO` pasa de `'0.103.2'` a `'0.104.0'`, y
   el encabezado estrena el párrafo de 0.104.0 dejando el de 0.103.2 abajo como
   «Antes, 0.103.2 (…)».
2. `src/quell/motor.js`, en el `PATCH` de `projects/:id`, **después** del
   `UPDATE quell_projects SET name = COALESCE(…)` y **antes** del
   `return json({ ok: true });`: el bloque que llama a
   `env.RENOMBRA_EN_LA_SUITE` dentro de un `try/catch` (el nombre de la obra ya
   se guardó: que la suite no se enterara no tumba la petición).
3. `src/quell/motor.d.ts`, en `EntornoQuell`, junto a `ALTA_EN_LA_SUITE`: la
   firma de `RENOMBRA_EN_LA_SUITE`.
4. `src/org-db.ts`, tres sitios: el bloque de propagación dentro de
   `actualizar` justo después del `UPDATE` y antes de `despuesDeEscribir`; el
   método `renombrarObraEnLaSuite` después de `altaDeObraEnLaSuite`; y el
   gancho `RENOMBRA_EN_LA_SUITE` donde se arma el entorno de quell, junto a
   `ALTA_EN_LA_SUITE`.
5. `pruebas/el-nombre-del-proyecto.spec.ts` es nuevo: sale entero del parche.

## Lo que queda abierto, y no se decidió aquí

El nombre del **cliente** sigue sin propagarse: `quell_projects.client` es el
texto que ve la gente de obra y se escribe al ligar la obra. Mike no lo pidió;
si lo pide, el lugar es el mismo `actualizar` (tabla `clientes`).
