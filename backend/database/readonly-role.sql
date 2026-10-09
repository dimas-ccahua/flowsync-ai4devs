-- Rol de solo lectura `flowsync_ro` sobre la base de DESARROLLO, para que un
-- agente pueda mirar los datos y nada más.
--
-- Se aplica con `make db-readonly`, que lo pasa por psql dentro del servicio
-- `db` conectado como el dueño de las tablas y con la contraseña en la variable
-- `ro_password` (sale de DB_RO_PASSWORD en backend/.env; aquí no se escribe).
-- `:"DBNAME"` y `:"USER"` son variables que psql rellena solo con la base y el
-- usuario de la conexión.
--
-- Se puede lanzar las veces que haga falta: crear el rol solo si no existe, y
-- el resto son GRANT/REVOKE/ALTER, que repetidos dejan el mismo estado.

\set ON_ERROR_STOP on

-- El rol: entra, y no puede crear bases, ni roles, ni saltarse permisos.
SELECT 'CREATE ROLE flowsync_ro'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'flowsync_ro')
\gexec

ALTER ROLE flowsync_ro WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD :'ro_password';

-- Entrar en esta base. Las tablas temporales se le quitan a PUBLIC, que las
-- tiene por defecto: también son crear algo. Al dueño no le afecta.
GRANT CONNECT ON DATABASE :"DBNAME" TO flowsync_ro;
REVOKE TEMPORARY ON DATABASE :"DBNAME" FROM PUBLIC;

-- Ver el esquema y leer lo que ya hay. Crear en `public` ya no se le concede a
-- PUBLIC desde PostgreSQL 15, así que no hay nada que quitar ahí.
GRANT USAGE ON SCHEMA public TO flowsync_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO flowsync_ro;

-- Y leer lo que se cree DESPUÉS. Los privilegios por defecto se cuelgan del rol
-- que crea las tablas —el que corre las migraciones—, no del esquema: sin esta
-- línea, la primera tabla nueva sería invisible para el agente.
ALTER DEFAULT PRIVILEGES FOR ROLE :"USER" IN SCHEMA public
  GRANT SELECT ON TABLES TO flowsync_ro;
