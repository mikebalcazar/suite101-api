// Los .sql de migrations/org/ se importan como texto (regla [[rules]] type =
// "Text" en wrangler.toml): el Durable Object los aplica al despertar, y a
// runtime no hay sistema de archivos del que leerlos.
declare module '*.sql' {
  const contenido: string;
  export default contenido;
}
