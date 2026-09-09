// La página del importador se importa como texto (regla [[rules]] type =
// "Text" en wrangler.toml). Se sirve desde el propio Worker a propósito: así
// es del mismo origen que la API, la cookie de sesión viaja sola y no hace
// falta abrirle CORS a nada nuevo.
declare module '*.html' {
  const contenido: string;
  export default contenido;
}
