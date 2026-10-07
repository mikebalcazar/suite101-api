-- D1 maestro v23 — el nombre de Mike.
--
-- Mike, 7-oct-2026: «el nombre del usuario que está generando la
-- cotización, en este caso que es mike@forespot.com, el nombre de ese
-- usuario debe estar registrado como Mike Balcázar». Desde hoy la hoja de
-- quote101 pone como responsable el nombre de quien la arma; para la cuenta
-- de Mike ese nombre es éste. Los demás nombres los pone el director en
-- workshop101 («Gente»), como siempre.
UPDATE usuarios SET nombre = 'Mike Balcázar' WHERE correo = 'mike@forespot.com';
