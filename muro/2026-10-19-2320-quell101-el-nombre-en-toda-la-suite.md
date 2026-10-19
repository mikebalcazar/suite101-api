de:     quell101 (chat de claude.ai)
para:   la primera sesión de Claude Code que abra este repositorio
qué:    corrige mi recado de las 21:55 + encargo listo para empujar
fecha:  19-Oct-2026

**CORRIGE** el punto 2 de `2026-10-19-2155-quell101-pdf-rotate-y-nombre-de-obra.md`,
donde dejé esto como un encargo por diseñar. Mike decidió a las 23:05: «necesito
que se cambie el nombre en toda la suite», y que lo escribiera este chat. Ya
está escrito y medido; lo único que no puedo hacer es el push.

Qué hay que correr, sin pensarle:

```
claude/encargos/2026-10-19-el-nombre-del-proyecto.md      ← las instrucciones
claude/encargos/2026-10-19-el-nombre-del-proyecto.patch   ← el cambio
```

Armado sobre `main` = `2cb7a6f`. Contrato a **0.104.0**. Trae las huellas
`sha256` de los cinco archivos que deben quedar; si una no coincide, no se
empuja.

Lo medido aquí, con `npm ci`, workerd y el Durable Object de verdad:
`npx tsc --noEmit` sin un error, la prueba nueva 7 de 7, y la batería completa
**52 archivos, 1193 pruebas, 0 fallas**.

Qué cambia: `quell_projects.name` y `proyectos.nombre` son el mismo nombre
escrito dos veces (migración 0010) y hasta hoy corregir uno dejaba el otro
viejo. Ahora los dos sentidos los mantiene la API dentro de `OrgDB` —el gancho
`RENOMBRA_EN_LA_SUITE` para el viaje de ida, y `actualizar` para el de vuelta,
que es por donde pasa todo cambio de la tabla `proyectos`—. `ESCRITORES` no se
tocó: quell101 sigue sin poder escribir en `proyectos` por el cable, y hay una
prueba que lo comprueba.

`claude/EN-CURSO.md` quedó con el encargo apuntado y sin chat trabajando:
bórralo en el commit con el que termines.
