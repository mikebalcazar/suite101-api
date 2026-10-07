/* El título de la página a la que apunta una liga (0.79.0).
 *
 * Mike, 7-oct, sobre las notas internas de quote101: «las ligas que se
 * agreguen y que se identifican, en donde aparece el link arriba, sólo pon
 * el título de la página a la que liga, no todo el link».
 *
 * El navegador no puede leer el <title> de otro sitio (CORS); la API sí. Lo
 * que se cuida:
 *   · sólo http(s), y nunca un host interno: ni localhost, ni una IP
 *     escrita a mano, ni un nombre sin punto. Esta ruta no es un proxy
 *     para asomarse a la red de nadie;
 *   · 5 s y 256 KB como mucho: el título va al principio del HTML;
 *   · lo que no es HTML, o no trae título, contesta `null` y la pantalla
 *     enseña el dominio. */

const ENTIDADES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', middot: '·', hellip: '…', laquo: '«', raquo: '»',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
};

function decodificar(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (todo, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : todo;
    }
    return ENTIDADES[e] ?? ENTIDADES[e.toLowerCase()] ?? todo;
  });
}

const limpio = (s: string) => decodificar(s).replace(/\s+/g, ' ').trim().slice(0, 140);

/** El título de un HTML: <title>, o si viene vacío, og:title. */
export function tituloDeHtml(html: string): string | null {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (t && limpio(t[1])) return limpio(t[1]);
  const og = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(html)
    || /<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:title["']/i.exec(html);
  return og && limpio(og[1]) ? limpio(og[1]) : null;
}

/** La liga, si se puede ir a buscarla; `null` si no. */
export function urlPermitida(texto: string): URL | null {
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
  if (/^\[.*\]$/.test(host) || /^\d+(\.\d+){3}$/.test(host)) return null; // IP escrita a mano
  return u;
}

const TOPE = 256 * 1024;

export async function tituloDeLiga(u: URL, traer: typeof fetch = fetch): Promise<string | null> {
  let r: Response;
  try {
    r = await traer(u.toString(), {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Suite101/1.0; +https://taller101.com)', Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(5000),
    });
  } catch { return null; }
  if (!r.ok || !/html/i.test(r.headers.get('content-type') || '')) { await r.body?.cancel(); return null; }
  const lector = r.body?.getReader();
  if (!lector) return null;
  const dec = new TextDecoder();
  let html = '', leidos = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      leidos += value.byteLength;
      html += dec.decode(value, { stream: true });
      if (/<\/title>/i.test(html) || leidos >= TOPE) break;
    }
  } catch { /* lo leído alcanza o no */ }
  await lector.cancel().catch(() => {});
  return tituloDeHtml(html);
}
