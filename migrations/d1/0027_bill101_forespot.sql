-- D1 maestro v27 — bill101 se prende en forespot (9-oct-2026).
--
-- La 0026 la prendió sólo en `demo`, a propósito: bill101 todavía no tenía
-- pantalla, y prenderla en `forespot` habría sido enseñar una app que no
-- abría. Ya la tiene (bill101 0.1.0, publicada el 9-oct en
-- bill101.taller101.com) y Mike lo decidió, con botones, ese mismo día:
-- «Sí, préndela en forespot».
--
-- No toca ningún dato de la empresa: es la licencia. A NIVEL PERSONA no se
-- toca nada, por lo mismo que en la 0024: una lista de apps vacía quiere
-- decir «todas las de la empresa», y ésos ya entran; quien tiene una lista
-- escrita la tiene así porque alguien decidió a qué entra, y se la da quien
-- administra, en workshop101.
UPDATE orgs
   SET apps = json_set(apps, '$.bill', json('true'))
 WHERE id = 'forespot';
