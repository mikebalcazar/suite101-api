-- OrgDB v22 — los datos del proveedor para poderle pagar y encontrarlo.
--
-- Mike, 29-sep-2026, para supply101: «poner la opción de dar de alta a un
-- nuevo proveedor, y dentro de los datos deben poder agregar: nombre, RFC,
-- número de cuenta (CLABE y banco y beneficiario), email de contacto,
-- teléfono de contacto, ubicación (si se puede guardar una ubicación de
-- Google Maps)».
--
-- `nombre`, `rfc`, `correo` y `telefono` ya estaban (0001). Faltaban la
-- cuenta y la ubicación. La ubicación se guarda como Google Maps la comparte:
-- una liga (`maps_url`) y, aparte, la dirección en texto (`direccion`) para
-- leerla sin abrir el mapa.
ALTER TABLE proveedores ADD COLUMN clabe TEXT;
ALTER TABLE proveedores ADD COLUMN banco TEXT;
ALTER TABLE proveedores ADD COLUMN beneficiario TEXT;
ALTER TABLE proveedores ADD COLUMN direccion TEXT;
ALTER TABLE proveedores ADD COLUMN maps_url TEXT;
