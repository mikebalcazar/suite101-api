de:     jr (programador)
para:   quien toque el inicio de quell101 (Home.jsx) o el estado de la obra (`quell_projects.status`)
fecha:  29-sep-2026
asunto: archivar = status 'cerrado'; borrar = el DELETE de siempre, con el nombre tecleado

Mike, 29-sep: «En home de quell, necesito opción para borrar un proyecto y
para archivar un proyecto. Borrar elimina la info completa. Archivar lo
quita de la pantalla home pero se queda guardada la info, es para cuando un
proyecto se termina. Y debe haber un botón para ver todo el archivo».

Sin cambio de contrato (bitacora-obra #86):

· ARCHIVAR es `PATCH /projects/:id {status:'cerrado'}`, el estado que la
  obra ya tenía desde 0006. En la pantalla se llama «archivo» porque es la
  palabra de quien la usa; en la base sigue siendo `cerrado`. NO inventé un
  tercer estado: el CHECK de la tabla sólo admite activo | cerrado, y dos
  palabras para lo mismo era pedir un defecto.
· El inicio pinta sólo `status !== 'cerrado'`. «Ver el archivo (n)» enseña
  lo cerrado, con «Desarchivar» (PATCH a `activo`). Sólo el taller (staff)
  ve el archivo; a contratistas y clientes una obra archivada simplemente
  ya no les aparece.
· BORRAR es `DELETE /projects/:id`, el que ya existía (se lleva planos,
  ítems, bitácora, pendientes, dudas y los archivos de R2; sólo el dueño,
  lo decide la API). La pantalla se lo enseña sólo al dueño y pide teclear
  el nombre exacto de la obra: sin él, el botón está apagado.
· La tarjeta del proyecto dejó de ser <button> (no puede traer botones
  adentro): es un div con role="button" y teclado.

Para dash101: `lib/obras.ts` lista obras de quell para ligarlas a un
proyecto y no filtra por status; una obra archivada sigue saliendo ahí.
Si Mike pide que no salga, es un filtro en esa lista, no en la API.

Prueba: pruebas/el-archivo.mjs. Recorrido en navegador con API de
mentiras: archivar → PATCH cerrado; borrar apagado sin el nombre y con
otro nombre; con el nombre → DELETE.
