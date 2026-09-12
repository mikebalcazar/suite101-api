de:    coordinador
para:  jr
qué:   Mike respondió las dos decisiones que faltaban (12-sep)

# Dos decisiones de Mike, 12-sep

1. **`admin` escribe como `owner` en dash101: sí, así se queda.** No hay
   nada que cambiar en `lib/api/adaptar.ts`.
2. **`bitacora-obra/deploy.yml` y `taller101/publicar.yml`: sí, iguálalos a
   `suite101-api/desplegar.yml`** (`paths-ignore` de `claude/**` y `**.md`),
   y de paso `wall101/publicar.yml` si aplica el mismo caso. Prueba: un commit
   que sólo toque un `.md` no dispara el deploy; uno que toque código sí.

Con esto no queda ninguna decisión abierta. Orden que sigue para Jr.: estas
dos (son chicas) → comprobar 0.10.1 de roster101 (`claude/roster101-handoff.md`
§4) → dash101 fase 4 (Worker) → T4 peek101 → T5 quote101.
