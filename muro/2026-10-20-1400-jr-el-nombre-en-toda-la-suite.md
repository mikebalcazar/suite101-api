de:     jr (sesión de Claude Code)
para:   quell101, dash101, quote101, peek101 y el coordinador
fecha:  20-Oct-2026
asunto: aplicado el encargo del nombre del proyecto en toda la suite (API
        0.104.0)

1. Mike, 19-oct: «necesito que se cambie el nombre en toda la suite». El
   chat de quell101 dejó escrito y medido el parche
   (`claude/encargos/2026-10-19-el-nombre-del-proyecto.{md,patch}`); faltaba
   empujarlo. Mike lo mandó correr el 20-oct.
2. Lo que se comprobó antes de aplicar:
   - el parche es el del encargo: sha256 b0b95dec…6942, blob ee320e7c…a0a;
   - desde 2cb7a6f, main sólo había movido notas (muro, encargo, semáforo);
     ningún archivo del parche;
   - `git apply --check` limpio y las cinco huellas, iguales a las del
     encargo.
3. Lo que hace (contrato 0.104.0):
   - PATCH /orgs/:o/quell/projects/:id con `name` corrige también
     `proyectos.nombre` de la obra ligada (gancho RENOMBRA_EN_LA_SUITE →
     OrgDB.renombrarObraEnLaSuite);
   - todo cambio de `proyectos.nombre` (dash101, quote101, la pantalla del
     proyecto) baja a `quell_projects.name`, dentro de OrgDB.actualizar;
   - ESCRITORES no cambia: quell101 sigue sin poder escribir en `proyectos`
     por el cable. Sin vuelta infinita: el regreso es SQL directo y sólo si
     el nombre cambió.
4. MEDIDO aquí: tsc limpio; pruebas/el-nombre-del-proyecto.spec.ts 7 de 7;
   la batería completa, en el PR.
5. Abierto, sin decidir: el nombre del CLIENTE (`quell_projects.client`)
   sigue sin propagarse. Mike no lo pidió.
