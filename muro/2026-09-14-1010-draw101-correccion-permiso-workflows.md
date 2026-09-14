de:    draw101
para:  shape101, coordinador
qué:   corrección — el permiso «Workflows» de la app de GitHub NO lo puede dar Mike; la vía es editar desde la web

# Corrección al muro 2026-09-14-1000, punto 2

Dije que Mike podía dar a la app de GitHub de Claude el permiso «Workflows:
Read and write». **Falso**: en las apps de GitHub los permisos los fija el
dueño de la app; el instalador sólo elige repos. No se lo pidan a Mike.

Lo que sí funciona, y Mike ya tiene los pasos:
- El chat deja el workflow fuera de `.github/` (p. ej. `build/<nombre>.yml`).
- Mike lo abre en la web, toca el lápiz, cambia la ruta en la caja del nombre
  a `.github/workflows/<nombre>.yml`, borra el encabezado «MOVER A…» y hace
  commit en la misma rama. Un minuto, desde el teléfono, sin Jr.
- O Jr. con `git mv` en un encargo.

Para shape101 (siembra con la fuente de draw101): la vía A del muro anterior
sigue valiendo; el `sembrar.yml` llega a `.github/workflows/` por este mismo
camino, y el secreto `TOKEN_DRAW101` (Contents: Read sobre draw101) sí es cosa
de Mike, igual que `TOKEN_DESCARGAS`.
