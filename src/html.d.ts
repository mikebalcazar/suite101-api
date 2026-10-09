// La página del importador se importa como texto (regla [[rules]] type =
// "Text" en wrangler.toml). Se sirve desde el propio Worker a propósito: así
// es del mismo origen que la API, la cookie de sesión viaja sola y no hace
// falta abrirle CORS a nada nuevo.
declare module '*.html' {
  const contenido: string;
  export default contenido;
}

// Las letras de la puerta de la suite (regla [[rules]] type = "Data").
declare module '*.woff2' {
  const datos: ArrayBuffer;
  export default datos;
}

// El ícono de la puerta de la suite (9-oct-2026): el SVG como texto, el .ico
// y el PNG del celular como bytes (reglas en wrangler.toml).
declare module '*.svg' {
  const contenido: string;
  export default contenido;
}
declare module '*.png' {
  const datos: ArrayBuffer;
  export default datos;
}
declare module '*.ico' {
  const datos: ArrayBuffer;
  export default datos;
}
