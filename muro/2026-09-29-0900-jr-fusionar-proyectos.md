de:     jr (programador)
para:   quien toque proyectos (API, dash101, quote101) y quien atienda un «no se puede borrar»
fecha:  29-sep-2026
asunto: fusionar dos proyectos que son el mismo (contrato 0.52.0), el bloque en dash101 y el aviso de quote101

Mike, 29-sep, con la captura de quote101 («No se guardó. “Sanje CC37”
tiene 11 movimientos de dinero registrados: no se borra (…) fusiónalo
con el otro cliente»): «No puedo fusionar el proyecto, solo el cliente.
Y quiero fusionar proyectos.»

1. API 0.52.0 (#154): `POST /orgs/:o/proyectos/:id/fusionar {se_va_id, seco?}`
   Misma forma que fusionar clientes (0.23.0): `:id` se queda con TODO
   lo del que se va y éste desaparece. Sólo dueño y administración.
   · Las tablas con `proyecto_id` se descubren del esquema
     (`sqlite_master … sql LIKE '%proyecto_id%'`, menos `proyectos` y
     `quell_projects`): hoy items, partidas, movimientos, ordenes. Una
     tabla nueva con `proyecto_id` entra sola. `movidos` trae la cuenta
     por tabla (sólo las que tenían algo).
   · Lo que no es una columna: las cotizaciones de quote101 apuntan al
     proyecto en `datos.proyecto_id` (json_set); los archivos cuelgan por
     (de_tabla='proyectos', de_id); la obra de quell es una por proyecto
     (índice único): si el que se queda ya tiene la suya, la del que se
     va queda con proyecto_id NULL y se contesta `obra_suelta: true`.
   · Los ítems que llegan toman el `cliente_id` del proyecto que se
     queda: un ítem con el cliente de un proyecto que ya no existe es un
     renglón huérfano en el estado de cuenta. Conservan su `partida`.
   · Al final `recalcularProyecto(queda)` y `item.cambio` por cada ítem
     movido. `seco: true` contesta lo mismo sin escribir.
   · Errores: 400 `datos_invalidos` (mismo id, sin se_va_id), 404
     `no_encontrado`, 403 `sin_permiso`.
   pruebas/proyectos-fusion.spec.ts (6). Suite 598/598.

2. dash101 (#97): «¿Está repetido?» en la pantalla del proyecto
   `components/fusionar-proyecto.tsx`, igual que el de clientes, pero
   con un paso más: al escoger el otro proyecto se pide la cuenta en
   seco y se enseña («Se van a mover 2 ítems, 1 movimiento de dinero…»)
   antes de «Sí, juntarlos». Después dice qué se movió, y si la obra de
   quell quedó suelta. Va antes de la zona peligrosa.
   `lib/proyectos.fusionarProyectos(queda, seVa, seco)` →
   `escribir.fusionarProyectos`. pruebas/fusionar-proyectos.spec.ts (3)
   contra staging en una org propia (`fp-<run>`), como escritura-api.

3. quote101 G104 (#68): el aviso de «tiene dinero» distingue proyecto de
   cliente y manda a la pantalla que toca en dash101 (Proyectos → abrir
   el proyecto → ¿Está repetido?), o a cerrarlo si ya terminó.
   pruebas/guardado.spec.mjs +1 (31).

4. Lo que Mike hace con esto: en dash101, abrir «Sanje CC37» (el que se
   queda), escoger «Sanje CC37 NEW» (o al revés) en «¿Está repetido?»,
   ver la cuenta y confirmar. Es producción y es irreversible: lo hace
   él con su sesión, como con los clientes.

5. Pendiente del mismo tema: dash101 sigue con su `deleteProyecto`
   propio (0.51.0 tiene `/proyectos/:id/borrar` con las razones).
