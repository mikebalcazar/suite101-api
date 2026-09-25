# DNS de taller101.com — foto del 25-sep-2026, ANTES de mover el DNS a Cloudflare

Leído desde el DNS público de Google (dns.google), sin entrar a ningún panel.
Sirve para comparar lo que Cloudflare importe, y para reponer lo que no cruce.
El correo (Google Workspace) depende de: MX, SPF de la raíz, el TXT `dc-…_spfm`, DKIM (`google._domainkey`) y DMARC.

Nota: los renglones de `www` y `_domainconnect` que dicen A/TXT con el valor de
un nombre son el CNAME seguido por el resolutor, no registros propios; lo que
hay de verdad ahí es el CNAME. `_domainconnect` es de GoDaddy y no hace falta
en Cloudflare.

| Tipo | Nombre | TTL | Valor |
|---|---|---|---|
| NS | `@` | 3600 | ns55.domaincontrol.com. |
| NS | `@` | 3600 | ns56.domaincontrol.com. |
| A | `@` | 2139 | 13.248.243.5 |
| A | `@` | 2139 | 76.223.105.230 |
| MX | `@` | 3600 | 10 alt3.aspmx.l.google.com. |
| MX | `@` | 3600 | 5 alt1.aspmx.l.google.com. |
| MX | `@` | 3600 | 5 alt2.aspmx.l.google.com. |
| MX | `@` | 3600 | 1 aspmx.l.google.com. |
| MX | `@` | 3600 | 10 alt4.aspmx.l.google.com. |
| TXT | `@` | 3600 | google-site-verification=MZkNoV6fWN9D6NLubKsMrI7yC2gXtwZQq52OxDTIBlk |
| TXT | `@` | 3600 | v=spf1 include:dc-aa8e722993._spfm.taller101.com ~all |
| CNAME | `www` | 3600 | taller101.com. |
| A | `www` | 2139 | taller101.com. |
| A | `www` | 3600 | 13.248.243.5 |
| A | `www` | 3600 | 76.223.105.230 |
| TXT | `www` | 2139 | taller101.com. |
| TXT | `www` | 3600 | google-site-verification=MZkNoV6fWN9D6NLubKsMrI7yC2gXtwZQq52OxDTIBlk |
| TXT | `www` | 3600 | v=spf1 include:dc-aa8e722993._spfm.taller101.com ~all |
| TXT | `_dmarc` | 2129 | v=DMARC1; p=reject; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net; |
| TXT | `google._domainkey` | 3600 | v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7U+yRRXsQkH1Krfjy02im9IXAFDyw8czqODsSlsgAZk52nAIPfGYtpJj2I1Rafv/HrL7gaAHqA5HROTpZNXPj1UnLCxbdlPOdGUABsyQLPIeQeZCo6eeyizNWV/gOUFMpv2o7QIyWdiWG/i02SbzWujxgqKeB+RQZ9dPWGLO8p+CE8dL1mBNXg9yJoYoLOubsdpQ67HFlU7BsyhfpKp5XDp1AIis//vfowiWJq0FeloJiaC4NMnTZsXqrgK9VzkWMyUoctFfxZYFBux2dzAx+McvJvsd9t/gdWi+fiscNSFgwrQvvZKFshrDphjnXmdBzIPEkifbPww60FbkGh0yFQIDAQAB |
| TXT | `dc-aa8e722993._spfm` | 3600 | v=spf1 include:_spf.google.com ~all |
| CNAME | `_domainconnect` | 3600 | _domainconnect.gd.domaincontrol.com. |
| A | `_domainconnect` | 3599 | _domainconnect.gd.domaincontrol.com. |
| TXT | `_domainconnect` | 3600 | _domainconnect.gd.domaincontrol.com. |
| TXT | `_domainconnect` | 3600 | domainconnect.api.godaddy.com |
