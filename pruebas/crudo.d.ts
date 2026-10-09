/* Vite deja importar un archivo como texto con `?raw`; TypeScript no lo sabe. */
declare module '*?raw' {
  const texto: string;
  export default texto;
}
