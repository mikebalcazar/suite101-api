-- 0008 · supply101 deja de decir que es dash101 (contrato 0.42.0)
--
-- DEFECTO, encontrado por Mike el 21-sep-2026: fer@forespot.com abría
-- supply101 y le contestaba `app_no_permitida`.
--
-- La causa: supply101 mandaba `X-App: dash101`, así que la puerta buscaba la
-- llave `dash` en la lista de apps de cada persona. Fer tiene
-- ["quell","peek","cotizador","roster","nest"] — sin `dash`— y por eso se le
-- cerraba.
--
-- Y no era una configuración mal puesta: supply101 se hizo EXACTAMENTE para
-- quien no entra a dash101 —«quien pide no tiene por qué entrar al tablero
-- del dinero»—, así que la app cerraba la puerta justo a la gente para la que
-- se hizo. En Forespot, de cuatro personas, las dos que la necesitaban eran
-- las dos que no podían entrar.
--
-- Mike escogió el 21-sep, con botones: PERMISO PROPIO. supply101 gana su
-- llave `supply`, y se puede dar sin dar `dash`.
--
-- ESTA MIGRACIÓN NO LE QUITA NADA A NADIE. Ésa fue la promesa con la que se
-- escogió esa opción, y aquí es donde se cumple: quien hoy entra a supply101
-- lo hace por su `dash`, así que a esos mismos se les da `supply` de una vez.
-- A partir de mañana son dos permisos independientes.

-- 1. Las empresas. Donde dash101 está prendido, supply101 también: es la otra
--    cara del mismo módulo de órdenes y no se cobra aparte. Una empresa sin
--    dash101 no tiene órdenes que pedir, así que ahí no se prende.
UPDATE orgs
   SET apps = json_set(apps, '$.supply', json('true'))
 WHERE json_extract(apps, '$.dash') = 1;

-- 2. Las personas con lista recortada. `[]` significa «todas las de la
--    empresa» y por eso NO se toca: ya incluye supply101 desde que la llave
--    existe. A quien trae `dash` escrito se le agrega `supply`, que es el
--    acceso que hoy ya está usando.
UPDATE miembros
   SET apps = json_insert(apps, '$[#]', 'supply')
 WHERE EXISTS (SELECT 1 FROM json_each(miembros.apps) WHERE value = 'dash')
   AND NOT EXISTS (SELECT 1 FROM json_each(miembros.apps) WHERE value = 'supply');
