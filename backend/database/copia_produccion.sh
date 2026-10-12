#!/usr/bin/env bash
# Carga una copia de producción SEUDONIMIZADA en la base de desarrollo. Lo lanza
# una persona con `make copia-produccion [COPIA=backups/<fichero>.dump]`; no lo
# lanza ningún agente, porque es el único paso en que los datos personales
# están en claro.
#
# Camino, todo dentro del servicio `db` de compose.yaml:
#   1. Crea la base intermedia `flowsync_staging`, a la que `flowsync_ro` (el rol
#      del servidor MCP) no puede conectarse: nace sin admitir conexiones, se le
#      quita CONNECT a PUBLIC y solo entonces se abre al dueño.
#   2. Restaura en ella la copia (pg_dump formato custom), sin dueños, permisos
#      ni comentarios.
#   3. Aplica database/seudonimizar.sql, que aborta si la copia no tiene
#      exactamente el esquema de las migraciones.
#   4. Sustituye el esquema `public` de `flowsync_dev` por el de la intermedia,
#      en UNA transacción: si algo falla, desarrollo queda como estaba.
#   5. Vuelve a aplicar el rol de solo lectura (`make db-readonly`): al recrear
#      el esquema se pierden sus permisos.
#   6. Borra la base intermedia, también si algo ha fallado por el camino.
#
# Si falla, los mensajes de pg_restore pueden citar filas de la copia: no los
# pegues en una conversación con un agente.
set -euo pipefail

raiz=$(cd "$(dirname "$0")/../.." && pwd)
cd "$raiz"

copia=${1:?Uso: copia_produccion.sh <ruta al .dump>}
[ -f "$copia" ] || { echo "❌ No existe $copia" >&2; exit 1; }

STAGING=flowsync_staging
DEV=flowsync_dev
psql_db() { docker compose exec -T db psql -U flowsync -v ON_ERROR_STOP=1 -q "$@"; }

borrar_staging() {
  psql_db -d postgres -c "DROP DATABASE IF EXISTS $STAGING WITH (FORCE)" >/dev/null
}
trap 'echo "🧹 Borrando $STAGING..."; borrar_staging' EXIT

echo "🐘 Levantando db..."
docker compose up -d --wait db

echo "🔑 Generando el hash de la contraseña de demostración..."
hash=$(cd backend && node --import=@poppinss/ts-exec database/hash_demo_password.ts)

echo "🏗️  Creando $STAGING (cerrada a flowsync_ro)..."
borrar_staging
psql_db -d postgres <<SQL
CREATE DATABASE $STAGING WITH ALLOW_CONNECTIONS false;
REVOKE ALL ON DATABASE $STAGING FROM PUBLIC;
ALTER DATABASE $STAGING WITH ALLOW_CONNECTIONS true;
DO \$\$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'flowsync_ro')
     AND has_database_privilege('flowsync_ro', '$STAGING', 'CONNECT') THEN
    RAISE EXCEPTION 'flowsync_ro puede conectarse a $STAGING: no se sigue';
  END IF;
END \$\$;
SQL

echo "📥 Restaurando la copia en $STAGING..."
docker compose exec -T db pg_restore -U flowsync -d "$STAGING" \
  --no-owner --no-acl --no-comments --exit-on-error < "$copia"

echo "🎭 Seudonimizando..."
psql_db -d "$STAGING" -v password_hash="$hash" < backend/database/seudonimizar.sql

echo "🔁 Sustituyendo el contenido de $DEV..."
docker compose exec -T db bash -o pipefail -c "
  { echo 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
    pg_dump -U flowsync -d $STAGING --no-owner --no-acl --no-comments
  } | psql -U flowsync -d $DEV -v ON_ERROR_STOP=1 -q --single-transaction
"

echo "🔒 Reaplicando el rol de solo lectura..."
make --no-print-directory db-readonly

echo "✅ Copia seudonimizada cargada en $DEV. Cualquier persona entra con su"
echo "   correo persona-<id> en flowsync.example y la contraseña flowsync-demo."
