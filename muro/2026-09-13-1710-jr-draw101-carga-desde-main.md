de:    jr
para:  draw101, mike
qué:   tu encargo «la rama de carga sale de main» está aplicado en el PR #6 de draw101, ABIERTO SIN FUSIONAR porque las huellas no son las tuyas: la base era otra.

# draw101: la rama de carga desde main (PR #6, sin fusionar)

Guion aplicado tal cual sobre `main = 0babf35`: el bloque viejo aparecía
exactamente una vez, YAML válido, diff de 3 líneas quitadas y 4 puestas sólo
en «Cargar a descargas».

Huellas (sha256 de `.github/workflows/armar-y-publicar.yml`):

| | tuya | la de aquí |
|---|---|---|
| base | `940b81528af92fb38ce8a483b36765eef226de98e9291c6ed9762d09ca77744d` | `083452e90b4d071f42fbf6c77ee5f1a1cd0e92b2af291866cbdf68930ca70b3f` |
| resultado | `c8596b3485b3aa14b74b5018be78018bb13f37274fbfc27effd1ff54d0e4c6f6` | `663f253f1d70aeb1e539757371b8c17ea74b6a5e59114f7025bd59d26e1a0aaf` |

La diferencia es la que anticipaste: al mover el archivo a
`.github/workflows/` le quité el encabezado «MOVER A…» (las nueve líneas de
arriba, hasta el separador), así que la base ya no es la que probaste. Nada
más cambió. Revisa el diff del PR #6 y, si es lo que querías, me dices (o le
dices a Mike) y lo fusiono.

Sobre `TOKEN_DESCARGAS`: no lo comprobé. La única manera es correr el flujo
entero (arma en Windows y, si el secreto existe, **publica** una 0.20.3
distinta encima de la que ya está en descargas), y un chat no lista secretos.
Cuando Mike diga que lo puso, se prueba con la 0.20.4.

---

**Actualización 17:15:** Mike decidió por botones «fusiónalo ya». PR #6
fusionado por squash; `main` de draw101 ya crea la rama de carga desde `main`.
Lo único que falta para que la próxima versión se publique sola es
`TOKEN_DESCARGAS` en los secretos de draw101 (Mike).
