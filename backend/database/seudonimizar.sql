-- Seudonimiza una copia de producción restaurada en `flowsync_staging`, antes
-- de que pase a la base de desarrollo. Lo lanza `make copia-produccion`
-- (backend/database/copia_produccion.sh); no se ejecuta a mano ni contra otra
-- base.
--
-- Escrito mirando SOLO las migraciones de backend/database/migrations, nunca
-- los datos. Por eso empieza comprobando que la copia tiene exactamente ese
-- esquema: si producción tiene una tabla, una columna, un esquema o un objeto
-- que las migraciones no conocen, este script no sabe si lleva datos personales
-- y aborta sin tocar nada. Los mensajes de error dan nombres y recuentos,
-- nunca valores.
--
-- Qué se conserva, para reproducir INC-0412: los identificadores, `status` tal
-- cual (ni trim, ni minúsculas: es el principal sospechoso), las fechas y
-- `assignee_id`.
-- Qué se sustituye:
--   users.full_name  -> 'Persona <id>'
--   users.email      -> 'persona-<id>' en el dominio flowsync.example
--   users.password   -> hash de `flowsync-demo` (variable psql :password_hash)
--   tasks.title      -> 'Tarea <id>' (texto libre: puede llevar datos de
--                       clientes, y no hay forma segura de limpiarlo)
--   auth_access_tokens -> se vacía: los tokens de sesión no viajan.

\set ON_ERROR_STOP on

BEGIN;

-- 0. Solo en la base intermedia.
DO $$
BEGIN
  IF current_database() <> 'flowsync_staging' THEN
    RAISE EXCEPTION 'seudonimizar.sql solo se ejecuta en flowsync_staging, no en %', current_database();
  END IF;
END $$;

-- El hash entra como variable de psql; los bloques DO no ven esas variables,
-- así que se deja en un ajuste de la transacción. \o evita imprimirlo.
\o /dev/null
SELECT set_config('seudonimizar.password_hash', :'password_hash', true);
\o

-- 1. El esquema es el de las migraciones, y nada más.
DO $$
DECLARE
  extra text;
BEGIN
  -- Ningún esquema propio aparte de `public`.
  SELECT string_agg(nspname, ', ') INTO extra
  FROM pg_namespace
  WHERE nspname NOT IN ('public', 'information_schema')
    AND nspname NOT LIKE 'pg\_%';
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'La copia tiene esquemas que las migraciones no conocen: %', extra;
  END IF;

  -- Ninguna tabla, vista, vista materializada ni tabla foránea desconocida.
  SELECT string_agg(c.relname, ', ') INTO extra
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND c.relname NOT IN ('users', 'auth_access_tokens', 'tasks',
                          'adonis_schema', 'adonis_schema_versions');
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'La copia tiene relaciones que las migraciones no conocen: %', extra;
  END IF;

  -- Ninguna función, procedimiento ni trigger propios: su código puede llevar
  -- literales con datos.
  SELECT string_agg(p.proname, ', ') INTO extra
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e');
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'La copia tiene funciones que las migraciones no crean: %', extra;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal) THEN
    RAISE EXCEPTION 'La copia tiene triggers que las migraciones no crean';
  END IF;

  -- Ningún objeto grande (no van en ninguna tabla, pero pg_dump los copia).
  IF EXISTS (SELECT 1 FROM pg_largeobject_metadata) THEN
    RAISE EXCEPTION 'La copia tiene objetos grandes (large objects)';
  END IF;
END $$;

-- Las columnas de las tablas con datos personales son exactamente las de las
-- migraciones. Una columna de más (un teléfono, un comentario...) aborta.
DO $$
DECLARE
  esperado CONSTANT jsonb := '{
    "users": ["created_at", "email", "full_name", "id", "password", "updated_at"],
    "tasks": ["assignee_id", "created_at", "due_date", "id", "status", "title", "updated_at"],
    "auth_access_tokens": ["abilities", "created_at", "expires_at", "hash", "id", "last_used_at",
                           "name", "tokenable_id", "type", "updated_at"],
    "adonis_schema": ["batch", "id", "migration_time", "name"],
    "adonis_schema_versions": ["version"]
  }';
  tabla text;
  real jsonb;
BEGIN
  FOR tabla IN SELECT jsonb_object_keys(esperado) LOOP
    SELECT coalesce(jsonb_agg(column_name::text ORDER BY column_name::text), '[]') INTO real
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = tabla;
    IF real <> esperado -> tabla THEN
      RAISE EXCEPTION 'Las columnas de % no son las de las migraciones. Esperadas: %. En la copia: %',
        tabla, esperado -> tabla, real;
    END IF;
  END LOOP;
END $$;

-- 2. Los tokens de sesión no viajan.
DELETE FROM auth_access_tokens;

-- 3. Personas.
UPDATE users SET
  full_name = 'Persona ' || id,
  email     = 'persona-' || id || '@flowsync.example',
  password  = current_setting('seudonimizar.password_hash');

-- 4. Tareas: el título no se conserva.
UPDATE tasks SET title = 'Tarea ' || id;

-- 5. Comprobación: si algo no ha quedado sustituido, no se hace COMMIT.
DO $$
DECLARE
  n bigint;
BEGIN
  SELECT count(*) INTO n FROM auth_access_tokens;
  IF n > 0 THEN RAISE EXCEPTION 'Quedan % tokens', n; END IF;

  SELECT count(*) INTO n FROM users
  WHERE full_name IS DISTINCT FROM 'Persona ' || id
     OR email <> 'persona-' || id || '@flowsync.example'
     OR password <> current_setting('seudonimizar.password_hash');
  IF n > 0 THEN RAISE EXCEPTION 'Quedan % personas sin seudonimizar', n; END IF;

  SELECT count(*) INTO n FROM tasks WHERE title <> 'Tarea ' || id;
  IF n > 0 THEN RAISE EXCEPTION 'Quedan % títulos sin sustituir', n; END IF;
END $$;

COMMIT;
