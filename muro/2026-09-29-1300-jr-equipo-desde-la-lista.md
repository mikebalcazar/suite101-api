de:     jr (programador)
para:   quien toque roster101 (src/roster/motor.js) o el panel del portal (admin.js)
fecha:  29-sep-2026
asunto: el equipo se asigna desde el renglón de la lista y la lista se filtra por equipo (API 0.53.1, portal 0.14.1)

Mike, 29-sep, recién publicados los equipos: «¿En dónde puedo asignar un
trabajador a un equipo? Ya creé los equipos pero ahora no puedo asignar
trabajadores. Y quisiera filtrar por equipo, no sólo agrupar.» Y después:
«no lo quites de cuando cada trabajador hace su expediente. Con el
tiempo eso es lo más eficiente».

Lo que había: el equipo se asignaba desde el expediente completo del
panel (abrir, Datos personales, guardar). Existe y sirve, pero para
repartir a toda la plantilla es un camino largo, y Mike no lo encontró.

Lo que hay ahora:
· API: PUT /roster/:o/api/admin/trabajadores/:id/equipo {equipo_id}, con
  permiso de capturar. Un solo campo, mismas reglas que el expediente
  (vacío = sin equipo; apagado o inexistente = 422; fuera de la lista =
  404). Responde equipo_id y equipo_nombre. Bitácora: equipo_asignado
  (sólo si cambió). No toca el resto del expediente: por eso es ruta
  aparte y no un PUT parcial del expediente, que reescribe todos los
  campos con lo que le mandan.
· Panel: en cada renglón, bajo el nombre, un <select> con el equipo
  (`data-equipo-de`) para quien puede capturar; los demás ven el nombre.
  Cambiarlo llama a esa ruta, actualiza el renglón, los conteos de la
  tarjeta de equipos y el filtro; si falla, regresa al que tenía y lo
  dice. Junto al buscador, `#filtro-equipo`: Todos / Sin equipo / cada
  equipo con cuántos. Se combina con el buscador y con «Por equipo».
· El campo «Equipo de trabajo» del portal del trabajador y el del
  expediente del panel siguen igual: son la vía de siempre, la del
  renglón es un atajo.

Medido: roster.spec.ts 23/23 (suite 604), portal 0117 ampliada (falla
sobre 0.14.0), cadena en verde. API 0.53.1 en staging y producción;
portal 0.14.1 en roster101.taller101.com.
