/* El cronograma de la obra: las cuentas, el Excel y el archivo de Project.
 *
 * Mike, 5-oct-2026: «necesito en quell poder configurar un cronograma, pero
 * algo muy amigable (…) asignar tiempo de fabricación total, y (…) definir
 * tiempo de a) entrega de material b) fabricación c) instalación (…) poder
 * encadenar tareas (…) exportar el cronograma en un formato comercial, ej.
 * Microsoft Project, o en un Excel».
 *
 * LO QUE VIVE AQUÍ ES PURO: sin base ni red. Entra la lista de tareas y el
 * día de arranque, sale cada tarea con su inicio y su fin. Así se prueba
 * sola, y la pantalla no tiene una copia de las cuentas: cada cambio se
 * guarda y el servidor contesta con las fechas.
 *
 * LOS DÍAS SON LABORABLES DE LUNES A SÁBADO (Mike, 5-oct, con botones): un
 * taller trabaja sábados. «5 días» que arrancan jueves terminan el miércoles
 * siguiente; el domingo no cuenta y nada arranca ni termina en domingo.
 *
 * LAS CADENAS. Dentro de una sección, las etapas van en orden fijo: la
 * fabricación arranca cuando llega el material y la instalación cuando
 * termina la fabricación (si esas etapas existen). Entre secciones y entre
 * piezas no hay orden solo: lo que se encadena es `depende_de` —«arranca
 * cuando termine aquélla»—, que es como Mike lo describió: se fabrica e
 * instala la herrería, luego los gabinetes, luego las cubiertas, y sólo se
 * encadenan las instalaciones; lo demás avanza en paralelo.
 */

export const ETAPAS = ['material', 'fabricacion', 'instalacion'];
/* 0.69.0: un proceso puede llevar fases de más ('otra'), con su nombre. */
export const ETAPAS_VALIDAS = [...ETAPAS, 'otra'];
export const NOMBRE_ETAPA = { material: 'Entrega de material', fabricacion: 'Fabricación', instalacion: 'Instalación', otra: 'Otra fase' };
/** Cómo se llama una fase: el nombre que le pusieron, o el de su etapa. */
export const nombreDeFase = (t) => (t.nombre && String(t.nombre).trim()) || NOMBRE_ETAPA[t.etapa] || t.etapa;
/** El orden dentro del proceso: `pos`, y a igual pos el de la etapa. */
export const posDe = (t) => (Number.isInteger(t.pos) ? t.pos : ETAPAS.indexOf(t.etapa) * 10);
/** Qué tipo de proveedor le toca a cada etapa: lo que se compra o quien lo hace. */
export const TIPO_PROVEEDOR_DE = { material: 'materiales', fabricacion: 'servicios', instalacion: 'servicios', otra: 'servicios' };

/* ─────────────── el calendario ─────────────── */
const aFecha = (s) => new Date(`${s}T00:00:00Z`);
const aTexto = (d) => d.toISOString().slice(0, 10);
export const fechaValida = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(aFecha(s).getTime()) && aTexto(aFecha(s)) === s;
export const esLaborable = (s) => aFecha(s).getUTCDay() !== 0;
/** El mismo día si es laborable; si es domingo, el lunes. */
export function siguienteLaborable(s) {
  const d = aFecha(s);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return aTexto(d);
}
/** `n` días laborables después de `s` (s cuenta como día 0). */
export function sumarLaborables(s, n) {
  const d = aFecha(siguienteLaborable(s));
  for (let k = 0; k < n; ) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0) k++; }
  return aTexto(d);
}
/** El último día de una tarea de `dias` días que arranca en `inicio`. */
export const finDe = (inicio, dias) => sumarLaborables(inicio, Math.max(1, dias) - 1);
/** Cuántos días laborables hay de `a` a `b`, los dos incluidos. */
export function laborablesEntre(a, b) {
  const d = aFecha(a); const fin = aFecha(b);
  let n = 0;
  while (d <= fin) { if (d.getUTCDay() !== 0) n++; d.setUTCDate(d.getUTCDate() + 1); }
  return n;
}
const mayor = (a, b) => (a > b ? a : b);

/* ─────────────── las cuentas ─────────────── */
/**
 * `tareas`: [{ id, element_id, seccion, orden, etapa, dias, depende_de, inicio_fijo }].
 * `inicio`: el día de arranque de la obra (AAAA-MM-DD).
 * `pisos`: Map element_id → AAAA-MM-DD desde cuándo pueden correr las fases de
 *   esa pieza (0.70.0: los candados; con los dos, la fecha más tardía; sin
 *   alguno, hoy). Un piso es eso: ni la obra ni las cadenas adelantan una
 *   fase antes de él, y nada le impide correr después.
 * Devuelve { tareas: [{ ...t, inicio, fin, previas: [ids] }], fin, dias_laborables }.
 * Tira `Error('ciclo')` si las cadenas se muerden la cola.
 */
export function programar(tareas, inicio, pisos = new Map()) {
  const arranque = siguienteLaborable(inicio);
  const porId = new Map(tareas.map((t) => [t.id, t]));
  const previas = new Map(tareas.map((t) => [t.id, []]));
  // Las implícitas: dentro de la misma sección de la misma pieza, la etapa anterior que exista.
  const grupos = new Map();
  for (const t of tareas) {
    const llave = `${t.element_id}\u0000${t.seccion || ''}`;
    if (!grupos.has(llave)) grupos.set(llave, []);
    grupos.get(llave).push(t);
  }
  for (const g of grupos.values()) {
    g.sort((a, b) => posDe(a) - posDe(b) || ETAPAS.indexOf(a.etapa) - ETAPAS.indexOf(b.etapa));
    for (let i = 1; i < g.length; i++) previas.get(g[i].id).push(g[i - 1].id);
  }
  // Las explícitas.
  for (const t of tareas) if (t.depende_de && porId.has(t.depende_de) && t.depende_de !== t.id) previas.get(t.id).push(t.depende_de);
  // Orden topológico (Kahn): si quedan tareas sin orden, hay un ciclo.
  const grado = new Map(tareas.map((t) => [t.id, previas.get(t.id).length]));
  const siguientes = new Map(tareas.map((t) => [t.id, []]));
  for (const [id, ps] of previas) for (const p of ps) siguientes.get(p).push(id);
  const cola = tareas.filter((t) => grado.get(t.id) === 0).map((t) => t.id);
  const orden = [];
  while (cola.length) {
    const id = cola.shift(); orden.push(id);
    for (const s of siguientes.get(id)) { grado.set(s, grado.get(s) - 1); if (grado.get(s) === 0) cola.push(s); }
  }
  if (orden.length !== tareas.length) throw new Error('ciclo');
  const fechas = new Map();
  for (const id of orden) {
    const t = porId.get(id);
    let ini = arranque;
    const piso = pisos.get(t.element_id);
    if (piso && fechaValida(piso)) ini = mayor(ini, siguienteLaborable(piso));
    if (t.inicio_fijo && fechaValida(t.inicio_fijo)) ini = mayor(ini, siguienteLaborable(t.inicio_fijo));
    for (const p of previas.get(id)) ini = mayor(ini, sumarLaborables(fechas.get(p).fin, 1));
    const dias = Math.max(1, Number(t.dias) || 1);
    fechas.set(id, { inicio: ini, fin: finDe(ini, dias), dias });
  }
  const salida = tareas.map((t) => ({ ...t, dias: fechas.get(t.id).dias, inicio: fechas.get(t.id).inicio, fin: fechas.get(t.id).fin, previas: previas.get(t.id) }));
  const fin = salida.reduce((m, t) => mayor(m, t.fin), arranque);
  return { inicio: arranque, fin, dias_laborables: salida.length ? laborablesEntre(arranque, fin) : 0, tareas: salida };
}

/* ─────────────── el Excel ─────────────── */
/** Las hojas para `xlsx()` (src/xlsx.ts): una con las tareas y otra con el resumen. */
export function hojasDelCronograma(c) {
  const filas = [['Código', 'Pieza', 'Sección', 'Etapa', 'Proveedor', 'Días', 'Inicio', 'Fin', 'Después de', 'Notas']];
  const nombreDe = new Map(c.tareas.map((t) => [t.id, `${t.code || ''} ${t.seccion ? t.seccion + ' · ' : ''}${nombreDeFase(t)}`.trim()]));
  for (const t of c.tareas) {
    filas.push([t.code || '', t.name || '', t.seccion || '', nombreDeFase(t), t.proveedor_nombre || '', t.dias, t.inicio, t.fin, t.depende_de ? (nombreDe.get(t.depende_de) || '') : '', t.notas || '']);
  }
  const resumen = [
    ['Obra', c.nombre || ''],
    ['Arranque', c.inicio],
    ['Termina', c.fin],
    ['Días laborables (lunes a sábado)', c.dias_laborables],
    ['Objetivo (días)', c.dias_objetivo ?? ''],
    ['Se pasa del objetivo', c.excede ? 'Sí' : 'No'],
    ['Tareas', c.tareas.length],
  ];
  return [{ nombre: 'Cronograma', filas }, { nombre: 'Resumen', filas: resumen }];
}

/* ─────────────── el archivo de Project ─────────────── */
/* Es el XML que Microsoft Project abre con Archivo → Abrir (MSPDI, el mismo
 * desde Project 2003): cada pieza es una tarea resumen, cada sección con
 * nombre otra, y cada etapa una tarea con duración en días de 8 horas y sus
 * predecesoras (fin → inicio). El calendario va de lunes a sábado, como las
 * cuentas de aquí, para que Project llegue a las mismas fechas. */
const X = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function xmlDeProject(c) {
  let uid = 0;
  const tareas = [];
  const uidDe = new Map();
  const dia = (s) => `${s}T08:00:00`;
  const finDia = (s) => `${s}T17:00:00`;
  const porPieza = new Map();
  for (const t of c.tareas) {
    if (!porPieza.has(t.element_id)) porPieza.set(t.element_id, { code: t.code, name: t.name, secciones: new Map() });
    const p = porPieza.get(t.element_id);
    if (!p.secciones.has(t.seccion || '')) p.secciones.set(t.seccion || '', []);
    p.secciones.get(t.seccion || '').push(t);
  }
  const tarea = (nombre, nivel, t) => {
    uid++;
    const id = uid;
    if (t) uidDe.set(t.id, id);
    tareas.push({ uid: id, nombre, nivel, t });
  };
  for (const [, p] of porPieza) {
    const todas = [...p.secciones.values()].flat();
    const ini = todas.reduce((m, t) => (m < t.inicio ? m : t.inicio), todas[0].inicio);
    const fin = todas.reduce((m, t) => (m > t.fin ? m : t.fin), todas[0].fin);
    tarea(`${p.code || ''} ${p.name || ''}`.trim(), 1, { resumen: true, inicio: ini, fin, id: `pieza-${uid}` });
    for (const [nombre, ts] of p.secciones) {
      let nivel = 2;
      if (nombre) {
        const si = ts.reduce((m, t) => (m < t.inicio ? m : t.inicio), ts[0].inicio);
        const sf = ts.reduce((m, t) => (m > t.fin ? m : t.fin), ts[0].fin);
        tarea(nombre, 2, { resumen: true, inicio: si, fin: sf, id: `seccion-${uid}` });
        nivel = 3;
      }
      for (const t of ts) tarea(`${nombreDeFase(t)}${t.proveedor_nombre ? ' · ' + t.proveedor_nombre : ''}`, nivel, t);
    }
  }
  const cuerpo = tareas.map(({ uid: u, nombre, nivel, t }) => {
    const dur = t.resumen ? laborablesEntre(t.inicio, t.fin) : t.dias;
    const pred = !t.resumen ? (t.previas || []).filter((p) => uidDe.has(p)).map((p) => `<PredecessorLink><PredecessorUID>${uidDe.get(p)}</PredecessorUID><Type>1</Type></PredecessorLink>`).join('') : '';
    return `<Task><UID>${u}</UID><ID>${u}</ID><Name>${X(nombre)}</Name><Type>0</Type><OutlineLevel>${nivel}</OutlineLevel><Summary>${t.resumen ? 1 : 0}</Summary>`
      + `<Start>${dia(t.inicio)}</Start><Finish>${finDia(t.fin)}</Finish><Duration>PT${dur * 8}H0M0S</Duration><DurationFormat>7</DurationFormat><CalendarUID>1</CalendarUID>${pred}</Task>`;
  }).join('');
  const diasSemana = [1, 2, 3, 4, 5, 6, 7].map((d) => (d === 1
    ? `<WeekDay><DayType>${d}</DayType><DayWorking>0</DayWorking></WeekDay>`
    : `<WeekDay><DayType>${d}</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>`)).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Project xmlns="http://schemas.microsoft.com/project"><Name>${X(c.nombre || 'Obra')}</Name><Title>${X(c.nombre || 'Obra')}</Title>`
    + `<StartDate>${dia(c.inicio)}</StartDate><FinishDate>${finDia(c.fin)}</FinishDate><CalendarUID>1</CalendarUID>`
    + `<MinutesPerDay>480</MinutesPerDay><MinutesPerWeek>2880</MinutesPerWeek><DaysPerMonth>26</DaysPerMonth><NewTasksAreManual>0</NewTasksAreManual>`
    + `<Calendars><Calendar><UID>1</UID><Name>Lunes a sábado</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${diasSemana}</WeekDays></Calendar></Calendars>`
    + `<Tasks>${cuerpo}</Tasks></Project>`;
}
