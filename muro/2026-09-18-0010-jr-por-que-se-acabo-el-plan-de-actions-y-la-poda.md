# Por qué se acabó el plan de Actions, y la poda que Mike decidió

**18-sep-2026 00:10Z · Jr. PROGRAMADOR**

Mike revisó la facturación de GitHub el 17-sep y decidió dos cosas: en GitHub
se quedan **sólo las 3 versiones más recientes** de cada instalador, y los
repositorios pasan a **públicos** para que Actions corra gratis (más adelante
volverán a privados). Esto es lo medido y lo hecho.

## Lo que se estaba gastando (medido por la API REST el 17-sep)

**Almacenamiento.** El plan gratis incluye 0.5 GB de artefactos. Había 6.1 GB
vivos en cuatro repositorios:

| repo | artefactos | GB | retención |
|---|---|---|---|
| shape101 | 11 (de 236–248 MB) | 2.43 | 14 días |
| nest101 | 10 | 1.43 | 14 días |
| draw101 | 11 | 1.37 | 14 días |
| bitacora-obra | 30 | 0.89 | **90 días (sin `retention-days`)** |

**Minutos.** Sumando la duración de los 811 runs desde el 1-sep (×2 los de
Windows): ≈1 700 minutos facturables, sin contar que GitHub redondea cada
job al minuto. El plan gratis de repos privados da 2 000. Los pesados son
shape101 (≈352), bitacora-obra (≈248), descargas (≈193, público, no cuenta),
dash101 (≈185), draw101 (≈183) y suite101-api (≈178).

Nota para otras sesiones: `GET …/actions/runs/{id}/timing` devuelve
`billable.*.total_ms = 0` en toda la cuenta; la duración hay que calcularla
con `run_started_at`/`updated_at` o con los jobs. Y los endpoints de
facturación (`/users/…/settings/billing/*`) no pasan por el proxy.

## Lo hecho

1. **Poda manual, ya:** 40 artefactos borrados por la API (`DELETE
   …/actions/artifacts/{id}`, 204 cada uno), ≈4.2 GB liberados. Quedan
   3 por familia: draw101 0.20.12–14, shape101 0.4.1/0.5.0/0.6.0, nest101
   0.18.0–2, y en bitacora-obra 3 android, 3 windows y 3 de cada nativo.
2. **Poda permanente:** cada armada termina borrando los artefactos de su
   familia del cuarto en adelante. PRs mezclados: draw101 #14, shape101 #13,
   nest101 #12 (paso al final del job, `actions: write` en el workflow) y
   bitacora-obra #64 (job `podar` aparte, porque sus jobs son condicionales).
   Probado corriendo el `run:` exacto con un `gh` de mentira sobre las listas
   guardadas antes de la poda: escogió exactamente los viejos. **No medido en
   runner:** Actions sigue bloqueado; la primera armada que corra lo dirá.
3. **Antes de hablar de repos públicos** se buscó en el historial completo de
   los 12 clones llaves con forma de secreto (AIza, sk_, re_, ghp_, AKIA,
   PRIVATE KEY, tokens de Cloudflare). Sólo aparecen las llaves web de
   Firebase de dash101 y cotizador-t101 (públicas por diseño, y Firebase se
   está apagando) y *nombres* de secretos, nunca valores.

## Lo que sigue

- **Mike** cambia la visibilidad de los 12 repos privados (el proxy de la
  sesión no permite escribir ajustes de repositorio: `PATCH /repos` responde
  «Repository settings writes are not permitted»).
- En cuanto suite101-api sea público: `desplegar.yml` → 0.12.0 → mezclar las
  siete ramas `claude/entrar-homologado` una por una.
- Cuando vuelvan a privados, hay que volver a mirar los minutos: con la poda
  el almacenamiento ya no es el problema; los minutos de Windows sí.
