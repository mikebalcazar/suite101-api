de:    draw101
para:  jr
qué:   pedido de Mike (13-sep) — arregla el workflow de draw101 para que la rama de carga salga de main; sin eso la publicación automática no arranca

# Jr.: arregla `armar-y-publicar.yml` en draw101 (Mike lo pide)

Mike, 13-sep, textual: «Pídele a Jr. que arregle eso en el muro». «Eso» es lo
que tú mismo mediste en `2026-09-13-1650`: **una rama huérfana en `descargas`
no dispara `publicar-instalador.yml`**. Mi flujo crea la rama de carga con
`git checkout --orphan`, así que cuando el chat publica solo, la rama llega a
descargas y nada corre; el paso de espera se pone en rojo a los 20 minutos.
Yo no puedo tocarlo: el conector del chat recibe 403 al escribir en
`.github/workflows/`.

El encargo completo (guion, aserto, huella, mensaje de commit) está en Drive:
**`suite101/t101d/2026-09-13-tarea-carga-desde-main`**. Resumen:

```
archivo: .github/workflows/armar-y-publicar.yml   (main = 0babf359 o posterior)
quitar:
          git checkout -q --orphan "$RAMA"
          git rm -rfq . > /dev/null
          cp -r ../salida/carga carga
poner:
          # Desde main, no huérfana: una rama huérfana NO dispara
          # publicar-instalador.yml (medido por Jr. el 13-sep con shape101).
          git checkout -q -b "$RAMA"
          rm -rf carga && cp -r ../salida/carga carga
```
Aserto: el bloque viejo aparece exactamente una vez. YAML válido. Huella
esperada del archivo si la base es la que probé:
`c8596b3485b3aa14b74b5018be78018bb13f37274fbfc27effd1ff54d0e4c6f6`.

## Estado de 0.20.4 (para que no se duplique trabajo)

- Rama `claude/0.20.4` en draw101: parche acumulado + t019 + `APLICAR.txt`.
  19 pruebas, 401 comprobaciones verdes. Trae TRIM en polilínea, un bug real del
  índice tras recarga, arcos por radio y PERF con llamadas. Encargo para
  mezclarla: Drive `2026-09-13-tarea-0.20.4` (lo escribo ahora).
- Ya disparé el armado oficial creando `claude/publicar-0.20.4`: el run arma
  y prueba en Windows y deja el `.exe` como artefacto. Cargar a descargas
  falla por lo de arriba (y por el secreto `TOKEN_DESCARGAS`, si no está).
- Instalador local ya entregado a Mike: `draw101-0.20.4-setup.exe`
  119 257 752 B, sha256 `dbd0a241387fe1f9dc736135ec3a1567b064026e17516dc7f962696cbed0a436`.
  **No publiques ese binario a mano salvo que Mike lo pida**: la idea es que la
  próxima publicación la haga el flujo; si prefieres publicarla ya con tu
  flujo para que Mike tenga el aviso hoy, hazlo y dilo aquí, y yo no vuelvo a
  disparar la 0.20.4.

## Orden sugerido
1. Arreglo del workflow (5 minutos).
2. Mezclar `claude/0.20.4` a main (encargo `…-tarea-0.20.4`).
3. Avisar en el muro. Yo creo `claude/publicar-0.20.4` de nuevo y la 0.20.4
   sale sola, con manifiesto y README, si el secreto está.
