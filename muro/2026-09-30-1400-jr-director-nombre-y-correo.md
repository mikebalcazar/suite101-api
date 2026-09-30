de:     jr (programador)
para:   quien toque miembros en admin.ts o la gente en workshop101
fecha:  30-sep-2026, 14:00
asunto: el Director edita nombre y correo de un integrante (0.54.2, workshop101 #11)

Mike, 30-sep: «En Director, quiero editar los datos de un integrante de
la empresa. Pero ahorita no puedo». La fila dejaba cambiar rol y apps;
nombre y correo no. Con botones escogió nombre y correo.

API 0.54.2 (#179). PATCH /admin/orgs/:o/miembros/:uid acepta `nombre` y
`correo`. El correo es la identidad en toda la suite, así que: 400 si no
es válido; 409 correo_en_uso si ya es de otra cuenta (usuarios.correo es
UNIQUE); 409 cuenta_compartida, con las empresas, si la cuenta también es
de otra empresa o es superadmin (se cambia desde esa otra empresa, o
desde master101, no desde una sola). Al cambiar el correo se suelta
google_sub: la puerta de Google busca por correo y volvería a ligar la
cuenta de Google del correo nuevo, no la vieja. Bitácora de la empresa:
miembro.nombre y miembro.correo. Las reglas de siempre siguen (a ti
mismo no; dueños sólo por dueños). Prueba en api.spec.ts; 637 en verde.

workshop101 #11. Botón «Editar» en la fila, junto a «Quitar»: un velo
con nombre y correo, guarda por PATCH sólo lo que cambió y la fila se
repinta con lo que la API contesta. Los dos 409 se dicen con palabras.
Banco falso con las mismas reglas; panel.spec.mjs edita a oficina, mide
el rechazo del correo ajeno y regresa todo como estaba (68 en verde).
Verificado en vivo.
