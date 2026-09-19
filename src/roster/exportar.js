// Exportación: ZIP con una carpeta por trabajador + tabla CSV
import { zipSync, strToU8 } from 'fflate';
import { limpiaNombre, csvCampo, empresaDe } from './lib.js';
import { NOMBRES_DOC, DOCS_OBLIGATORIOS } from './validar.js';

const COLUMNAS = [
  ['folio', 'Folio'],
  ['apellido_paterno', 'Apellido paterno'],
  ['apellido_materno', 'Apellido materno'],
  ['nombre', 'Nombre(s)'],
  ['puesto', 'Puesto'],
  ['celular', 'Celular'],
  ['email', 'Correo'],
  ['nss', 'NSS'],
  ['curp', 'CURP'],
  ['rfc', 'RFC'],
  ['banco', 'Banco'],
  ['clabe', 'CLABE'],
  ['beneficiario', 'Beneficiario'],
  ['emerg_nombre', 'Emergencia — nombre'],
  ['emerg_parentesco', 'Emergencia — parentesco'],
  ['emerg_telefono', 'Emergencia — teléfono'],
  ['emerg_email', 'Emergencia — correo'],
  ['estado', 'Estado'],
  ['creado_en', 'Alta'],
  ['actualizado_en', 'Última actualización'],
  ['aviso_aceptado', 'Aviso de privacidad aceptado'],
];

const EXT_DE_MIME = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf',
};

export function carpetaDe(t) {
  const base = limpiaNombre(`${t.apellido_paterno} ${t.apellido_materno} ${t.nombre}`).toUpperCase();
  return base || limpiaNombre(t.email) || t.id.slice(0, 8);
}

async function leerTodo(env) {
  const { results: trabajadores } = await env.DB.prepare(
    `SELECT * FROM roster_trabajadores
     WHERE id NOT IN (SELECT trabajador_id FROM roster_papelera)
     ORDER BY apellido_paterno, apellido_materno, nombre`
  ).all();
  const { results: docs } = await env.DB.prepare('SELECT * FROM roster_documentos ORDER BY tipo, subido_en').all();
  const porTrab = {};
  for (const d of docs || []) (porTrab[d.trabajador_id] ||= []).push(d);
  // La fecha en que aceptó el aviso de privacidad es la constancia del consentimiento:
  // va en la tabla y en la ficha de cada carpeta.
  const { results: consents } = await env.DB.prepare('SELECT * FROM roster_consentimientos').all();
  const porConsent = {};
  for (const x of consents || []) porConsent[x.trabajador_id] = x;
  for (const t of trabajadores || []) {
    const c = porConsent[t.id];
    t.aviso_aceptado = c ? `${c.aceptado_en} (v${c.version})` : 'NO ACEPTADO';
  }
  return { trabajadores: trabajadores || [], porTrab };
}

export function armaCsv(trabajadores, porTrab) {
  const encabezados = [...COLUMNAS.map(([, t]) => t), 'Documentos faltantes', 'Carpeta'];
  const filas = [encabezados.map(csvCampo).join(',')];
  for (const t of trabajadores) {
    const ds = porTrab[t.id] || [];
    const hay = new Set(ds.map((d) => d.tipo));
    const faltan = DOCS_OBLIGATORIOS.filter((x) => !hay.has(x)).map((x) => NOMBRES_DOC[x]).join(' | ');
    const fila = COLUMNAS.map(([k]) => csvCampo(t[k] ?? ''));
    fila.push(csvCampo(faltan || 'ninguno'), csvCampo(carpetaDe(t)));
    filas.push(fila.join(','));
  }
  return filas.join('\r\n');
}

export async function exportarCsv(env) {
  const { trabajadores, porTrab } = await leerTodo(env);
  return armaCsv(trabajadores, porTrab);
}

// Los documentos de un trabajador, ya bajados de R2 y con el nombre con el que
// se van a ver en la carpeta: "Acta de nacimiento.jpg", "Certificación DC-3 2.pdf".
// Lo usan la exportación completa y el ZIP de fichas.
export async function archivosDe(env, docs) {
  const contenido = {};
  const conteo = {};
  for (const d of docs) {
    const obj = await env.DOCS.get(d.llave);
    if (!obj) continue;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const ext = EXT_DE_MIME[d.mime] || ((d.nombre_archivo || '').split('.').pop() || 'bin');
    conteo[d.tipo] = (conteo[d.tipo] || 0) + 1;
    const sufijo = conteo[d.tipo] > 1 ? ` ${conteo[d.tipo]}` : '';
    const etiqueta = d.tipo === 'otro' && d.etiqueta ? limpiaNombre(d.etiqueta) : NOMBRES_DOC[d.tipo] || d.tipo;
    contenido[`${limpiaNombre(etiqueta)}${sufijo}.${ext}`] = bytes;
  }
  return contenido;
}

// Descarga de fichas con documentos: un solo PDF con todas las fichas —una hoja
// por trabajador— y, junto a él, un ZIP por trabajador con sus documentos tal
// como los subió, cada uno con su nombre. Todo eso viaja dentro de un ZIP, que
// es la única forma de bajar varios archivos de una sola vez.
export async function armaZipFichas(env, gente, docsDe, pdfTodos, nombrePdf) {
  const empresa = empresaDe(env);
  const arbol = {};
  const usados = new Set();
  const sinNada = [];

  arbol[nombrePdf] = pdfTodos;

  for (const t of gente) {
    const contenido = await archivosDe(env, await docsDe(t));
    if (!Object.keys(contenido).length) { sinNada.push(carpetaDe(t)); continue; }

    let nombre = carpetaDe(t);
    let n = 2;
    while (usados.has(nombre)) nombre = `${carpetaDe(t)} (${n++})`;
    usados.add(nombre);
    arbol[`${nombre}.zip`] = zipSync(contenido, { level: 0 });
  }

  arbol['LEEME.txt'] = strToU8('\ufeff' +
    `${empresa.toUpperCase()} — Fichas de trabajadores\r\n\r\n` +
    `"${nombrePdf}" trae una hoja por trabajador.\r\n` +
    'Cada ZIP con nombre de persona trae los documentos que esa persona subió.\r\n' +
    (sinNada.length ? `Sin documentos todavía: ${sinNada.join(', ')}.\r\n` : '') +
    `Generado: ${new Date().toISOString()}\r\n`
  );

  // level 0 = sin recomprimir: los PDF, los JPG y los ZIP de adentro ya vienen comprimidos
  return zipSync(arbol, { level: 0 });
}

export async function armaZip(env) {
  const empresa = empresaDe(env);
  const { trabajadores, porTrab } = await leerTodo(env);
  const arbol = {};
  const usadas = new Set();

  for (const t of trabajadores) {
    let carpeta = carpetaDe(t);
    let n = 2;
    while (usadas.has(carpeta)) carpeta = `${carpetaDe(t)} (${n++})`;
    usadas.add(carpeta);

    const ds = porTrab[t.id] || [];
    const contenido = await archivosDe(env, ds);

    // Ficha de datos dentro de la carpeta del trabajador
    const ficha = COLUMNAS.map(([k, etq]) => `${etq}: ${t[k] ?? ''}`).join('\r\n');
    contenido['Datos del trabajador.txt'] = strToU8('﻿' + `${empresa.toUpperCase()} — EXPEDIENTE\r\n\r\n${ficha}\r\n`);

    arbol[carpeta] = contenido;
  }

  arbol['Tabla de trabajadores.csv'] = strToU8('﻿' + armaCsv(trabajadores, porTrab));
  arbol['LEEME.txt'] = strToU8(
    `﻿${empresa.toUpperCase()} — Expedientes de trabajadores\r\n\r\n` +
    'Una carpeta por trabajador (APELLIDOS NOMBRE) con sus documentos.\r\n' +
    '"Tabla de trabajadores.csv" abre en Excel; la columna "Carpeta" dice a qué carpeta corresponde cada renglón.\r\n' +
    `Generado: ${new Date().toISOString()}\r\n`
  );

  // level 0 = sin recomprimir: los PDF/JPG ya vienen comprimidos
  return zipSync(arbol, { level: 0 });
}
