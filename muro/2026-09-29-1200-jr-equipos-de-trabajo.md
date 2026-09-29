de:     jr (programador)
para:   quien toque roster101 (src/roster/motor.js, validar.js, exportar.js) o el portal (t101-portal-trabajadores: app.js, admin.js)
fecha:  29-sep-2026
asunto: equipos de trabajo en roster101 (API 0.53.0, portal 0.14.0)

Mike, 29-sep: «Quiero poder agrupar por "equipo de trabajo" en roster.
Que la gente ponga en qué equipo de trabajo está, pero esos equipos los
doy de alta yo, y ellos sólo seleccionan cuál de los disponibles es el
suyo, o "no tengo equipo".»

Decisiones:
· El catálogo es de la empresa. Migración org 0021: `roster_equipos`
  (id, nombre, activo, orden) y `roster_trabajadores.equipo_id`.
· El trabajador sólo escoge: GET /roster/:o/api/equipos da los
  prendidos; `equipo_id` en PUT /api/yo. Vacío = «no tengo equipo». Uno
  apagado o que no existe = 422 con `errores.equipo_id` (se dice y se
  deja el que tenía). Sin el campo en el cuerpo NO se toca: un guardado
  parcial viejo no le quita el equipo a nadie.
· Apagar ≠ borrar. Apagado deja de ofrecerse, pero quien ya estaba se
  queda (el expediente del panel lo enseña como «X (apagado)» para
  poder quitárselo). Borrar suelta a su gente (equipo_id en NULL) y la
  respuesta dice a cuántos (`soltados`, contados ANTES del UPDATE y sólo
  vivos: `meta.changes` del OrgDB no es de fiar).
· Nombre único sin importar mayúsculas (409): dos «Ebanistería» son un
  error de dedo, no dos equipos.
· Permisos: ver el catálogo, cualquiera del panel; alta, renombrar,
  apagar y borrar, quien puede capturar (dueño y admin). Bitácora:
  equipo_alta, equipo_cambio, equipo_baja.
· La lista del panel trae `equipo_nombre` en cada renglón y el catálogo
  completo (`equipos`, apagados incluidos, con `cuantos`). El detalle
  trae en `campos` la entrada equipo_id con `opciones: [{valor, texto}]`
  y `vacio: 'No tiene equipo'`. El renderer del expediente en admin.js
  ahora acepta opciones objeto además de textos (las de siempre siguen
  igual). CSV con columna «Equipo de trabajo».

Portal (0.14.0, #28): select `#f-equipo_id` en el formulario (oculto si
la empresa no tiene equipos); tarjeta «Equipos de trabajo» en el panel
(`#caja-equipos`, alta/renombrar/apagar/borrar); selector `#agrupar`
junto al buscador con renglones `tr.grupo` por equipo y «Sin equipo» al
final; chip con el equipo bajo el nombre.

Medido: describe «equipos de trabajo» en roster.spec.ts (5, fallan sobre
0.52.1), suite 603/603; portal 0117-equipos-de-trabajo.mjs (falla sobre
0.13.1), cadena en verde. API 0.53.0 en staging y producción; portal
0.14.0 en roster101.taller101.com.

Ojo al probar el spec de roster: Juan ya no existe al final del archivo
(lo borra la prueba de la papelera); las pruebas nuevas usan a Pedro.
