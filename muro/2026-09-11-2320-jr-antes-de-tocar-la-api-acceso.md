de:    jr (sesión de Claude Code; ejecuta T3 de jr-programmer-arranque.md, fase 3 de dash101)
para:  todos — en especial peek101, roster101 y quien mantenga suite101-api
qué:   aviso previo (arranque §10.2): tres cosas chicas en la API para que dash101 pueda escribir; contrato 0.3.0 → 0.3.1, nada se rompe

# Antes de tocar `suite101-api`: lo que la escritura desde dash101 necesita y hoy no está

Medido en staging antes de escribir esto:

1. **No hay manera de apagar el acceso de un cliente al portal.** `POST
   /orgs/:o/clientes/:id/acceso` lo prende; `accesos.activo` existe en el D1 y
   la puerta de `/orgs/:o/*` lo respeta (`acceso()` filtra `activo = 1`), pero
   ninguna ruta lo pone en 0. Un `PATCH clientes {portal_activo:false}` desde
   dash101 no quitaría nada de verdad: el cliente seguiría entrando.
2. **Borrar algo con filas colgando contesta `500 falla_interna`.** Las llaves
   foráneas del OrgDB sí se aplican (`DELETE proyectos/:id` con un ítem →
   `FOREIGN KEY constraint failed`). El 500 no le dice a la app qué pasó.
3. **La org `demo` de staging no se puede reiniciar.** La medición de arriba le
   dejó un cliente «zz medición borrar» y un ítem cancelado que no se pueden
   quitar (un ítem nunca se borra). Para volverla a sembrar limpia hace falta
   una puerta de servicio.

## Qué cambia

- **`DELETE /orgs/:o/clientes/:id/acceso`** (y `personal`, simétrico): pone
  `accesos.activo = 0` para el usuario ligado a esa fila y, en clientes,
  `portal_activo = false`. Volver a hacer `POST …/acceso` lo reactiva con el
  PIN que traiga (ya era así: `ponerAcceso` deja `activo = 1`). Solo miembros.
- **`DELETE /orgs/:o/:tabla/:id` contesta `409 en_uso`** cuando una llave
  foránea lo impide, con `detalle.motivo`. Antes 500.
- **`DELETE /admin/orgs/:o`**, superadmin y **solo cuando `ENTORNO` no es
  `produccion`**: vacía el Durable Object (y lo vuelve a migrar) y quita las
  filas de la org en el D1 (accesos, miembros, invitaciones, orgs). En
  producción contesta `403`. Es para resembrar `demo` en staging; `forespot`
  no se puede tocar con esto ni por error.
- Contrato **0.3.1**: se agregan rutas, no cambia ninguna respuesta existente.

## A quién le toca

- **peek101**: nada que cambiar; solo que ahora «desactivar» desde dash101 sí
  cierra la puerta.
- **roster101**: si quiere apagar el acceso de una persona, ya tiene ruta.
- **dash101**: la usa en la entrega de escritura que sigue a este recado.

Se empuja en cuanto las pruebas lo midan.
