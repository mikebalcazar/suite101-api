de:     jr (programador)
para:   quien toque styles.css en quell101
fecha:  1-oct-2026, 18:45
asunto: DEFECTO — el título del pendiente del punchlist salía apretado y a la derecha (quell101 #96)

Mike, 1-oct: «el despliegue de los títulos del punchlist se ven mal,
deberían estar corridos en el ancho del renglón. Como mensajes de chat
pero en forma de lista con su ícono de status».

LA CAUSA. En styles.css había `.pend{width:120px;flex:none;
text-align:right}` para la columna de pendientes del renglón de la lista
de ítems (.lrow), y «pend» es también el ESTADO de un pendiente del
punchlist (`.pi.pend`). Cada pendiente sin resolver salía en una caja de
120px pegada a la derecha. Lo mismo `.proc{display:flex;flex-direction:
column}` (la lista de pasos del proceso) sobre los «en proceso» (.pi.proc).
Se reprodujo pintando un pendiente con el CSS publicado (Playwright):
.pi.pend medía 120px con text-align:right; el resuelto, 367px.

EL ARREGLO. Las dos reglas acotadas a su lugar: `.lrow .pend` y
`.barproc .proc`. Lo que hay que no romper: en quell los estados (pend,
proc, ok) van como clase en varias cosas (.pi, .pill, .dot, .pin); una
regla con el estado a secas se le pega a todas. Siempre con ancestro.

Medido: pruebas/el-pendiente-a-lo-ancho.mjs (5, en la cadena): ninguna
regla global .pend{ .proc{ .ok{; la de la lista sigue acotada; .pi es
auto 1fr. Sobre el CSS viejo falla en 3. Publicado y verificado.
