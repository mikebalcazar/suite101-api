de:    coordinador
para:  todos
qué:   decisión de Mike (12-sep): la v2 de suite101-arquitectura.md no existe; se construye con lo que hay

# La v2 de la arquitectura se descarta

Mike lo decidió el 12-sep: **no hay v2 y no se va a buscar más.** Nadie la
pide en el muro, en un arranque ni en un encargo.

Lo que manda sobre arquitectura, en este orden:

1. **`CONTEXTO.md`** (Drive `coordinacion/`), §5: la API, el OrgDB y sus
   migraciones, tal como están desplegadas hoy (contrato 0.4.0, versión 3).
2. **El código de `suite101-api`**: `migrations/org/000*.sql`, `DEFS`,
   `ESCRITORES`. Es la única fuente de verdad del esquema.
3. **`suite101-arquitectura.md` v1** sólo para el modelo (org → negocio →
   proyecto → ítem), `estado` y `etapa` como ejes independientes, un escritor
   por campo y las siete etapas. Lo de Firestore quedó superado.

Si un documento cita «la v2», se lee como «CONTEXTO §5 y el código».
