de:     draw101
para:   jr (programador)
fecha:  29-sep-2026
asunto: faltan dos renglones en .github/workflows/desplegar.yml — el conector de GitHub no puede escribir archivos de workflow
qué:    bloqueo (chico, pero deja dos pruebas sin correr)

En la 0.22.0 (#167, ya fusionada y desplegada) entró la nube de draw101. Con
ella van dos archivos de prueba nuevos que el corredor **no está llamando**,
porque para engancharlos hay que tocar `desplegar.yml` y el conector de GitHub
de mi sesión no tiene permiso de escribir en `.github/workflows/`:

    failed to create tree: 403 Resource not accessible by integration

No es que se me haya olvidado ni que estén a medias: los dos pasan, y los corrí
antes de fusionar. Lo único que falta es que alguien con ese permiso los
enganche.

## Los dos renglones

**1 · En el paso «Medir la migración 0002 en un sqlite3 en memoria (OPERAR §7)»**,
junto a las demás, después de `migracion-0020.py`:

```yaml
          python3 pruebas/migracion-0021.py
```

**2 · En el paso «Medir lo publicado»**, después de `node pruebas/humo.mjs`:

```yaml
          # La nube de draw101 (0.22.0) va en su propio archivo; ver el
          # comentario de arriba de pruebas/humo-nube.mjs.
          node pruebas/humo-nube.mjs
```

Nada más. No hay que tocar otra cosa.

## Por qué importan, en orden de urgencia

**`humo-nube.mjs` es el que falta de verdad.** Corre contra el Worker publicado
y el bucket de R2 de verdad, en STAGING, y mide lo que vitest no puede: que las
rutas `/nube/*` existan en lo desplegado, que R2 devuelva los mismos bytes que
se le dieron, y —lo principal— que **una cuenta no vea la de al lado** en la
base compartida. Ese último punto es el encargo entero de Mike («ni siquiera
nosotros como dueños»), y un fallo ahí no da error: da los planos de Fernando
en la pantalla de Alex. Mientras no corra, esa parte queda sin medir en lo
publicado.

Se limpia solo: crea dos licencias de humo, sube un archivo, lo quita y borra
las licencias al terminar. Y va contra staging, nunca contra producción
(OPERAR §8).

**`migracion-0021.py`** es menos urgente —la migración ya se aplicó y la
verifiqué leyendo D1 de producción— pero vale la pena engancharla igual,
porque **esa prueba ya se ganó el sueldo una vez**: la primera versión de 0021
rehacía la tabla `suscripciones` para quitarle el `UNIQUE` a `clave`. Habría
pasado el `tsc`, habría pasado las 631 pruebas de vitest —workerd no enciende
las llaves foráneas— y habría reventado al desplegar, sobre la base donde viven
las licencias vendidas: `activaciones` referencia `suscripciones`, y D1 corre
con `PRAGMA foreign_keys = 1`. La cachó esa prueba, y de ahí salió el diseño
que sí está.

O sea: es la única de las dos familias de pruebas que sabe mirar las llaves
foráneas. Sin engancharla, la siguiente migración que las toque no tiene quien
la vea.

## De paso, dos cosas de la 0.22.0 que conviene que sepas

**La clave T101 ya no se guarda en claro.** La columna `clave` guarda su HUELLA
(HMAC con un secreto que vive en `config`). Las siete que existían siguen
funcionando y nadie tuvo que volver a activar —verificado en producción—, pero:

 · al **crear** una licencia, la clave se ve UNA VEZ, en esa respuesta. Después
   ya no. Si master101 la guardaba en algún lado para enseñarla después, hay
   que quitarlo: ahora sólo hay `clave_pista` (las últimas cuatro letras);
 · y el panel **no** devuelve `llave_envuelta` ni `llave_sal` a propósito. Si
   alguna pantalla las necesitara, no: juntas con la huella son lo que abriría
   los planos de alguien sin su permiso.

**Hay una deuda anotada**: las tres columnas nuevas viven en
`schema/suscripcion-nube.ts` en vez de dentro de `Suscripcion`, porque
`schema/tipos.ts` son 90 KB y mi sesión tiene que mandar cada archivo completo
por el conector —no puedo empujar por `git`—. Transcribirlo entero para
agregarle doce renglones era cambiar un riesgo pequeño por uno grande en el
archivo del que dependen las catorce apps. **Si de todos modos vas a tocar
`tipos.ts`**, mueve esas tres líneas a `Suscripcion` y borra ese archivo; está
explicado en su propio comentario.

Gracias.
