#!/usr/bin/env bash
# PreToolUse (Bash): bloquea (exit 2) las órdenes que borran datos o esquema en
# bloque: `migration:fresh`, `migration:reset`, `db:wipe`, `docker compose down`
# con `-v`/`--volumes`, y SQL con DROP TABLE, DROP DATABASE, DROP SCHEMA o
# TRUNCATE. No distingue mayúsculas. `migration:rollback` NO se bloquea: la
# skill `revisar-migracion` lo necesita para probar la vuelta en `db-test`.
#
# Lo que este hook NO ve:
# - El SQL que entra por un archivo o por la entrada estándar: `psql -f
#   borrar.sql`, `psql < borrar.sql`, `cat borrar.sql | psql`. Solo lee el
#   texto de la orden, no lo que la orden va a leer.
# - Una orden escrita de otra forma: una variable (`$CMD`), un alias, un script
#   que hace el borrado por dentro, `eval`, base64, una cadena partida en
#   trozos, `docker volume rm`, `docker rm` del contenedor, borrar los datos
#   del volumen a mano, un `DELETE FROM` sin `WHERE`, un `ALTER TABLE ... DROP
#   COLUMN`, o una migración cuyo `up`/`down` hace `dropTable` y se ejecuta con
#   un `migration:run` o un `migration:rollback` que sí se dejan pasar.
# - Todo lo que se haga por el servidor MCP (`dbhub`): no pasa por Bash.
# - Nada fuera de Claude Code: lo que escribe una persona en su terminal.
# Además da falsos positivos: también bloquea cualquier orden que solo
# MENCIONE esos textos, como un `grep` que los busca o un `git commit -m`
# que los cita.
#
# Por eso el candado es el rol (`flowsync_ro`, solo lectura, el que usa el
# servidor MCP) y esto es solo una red: atrapa el error por descuido, no a
# quien quiera saltárselo.
set -uo pipefail

cmd=$(jq -r '.tool_input.command // empty' | tr '\n' ' ')
[ -n "$cmd" ] || exit 0

# Cada regla: "regex extendida (sin distinguir mayúsculas)@@qué es@@por qué se bloquea".
reglas=(
  'migration:fresh@@node ace migration:fresh@@borra todas las tablas y vuelve a migrar: se pierden todos los datos'
  'migration:reset@@node ace migration:reset@@deshace todas las migraciones: se pierden todas las tablas y sus datos'
  'db:wipe@@node ace db:wipe@@vacía la base entera: tablas, vistas y tipos'
  'docker[ -]compose([[:space:]]+[^;&|]*)?[[:space:]]+down([[:space:]]+[^;&|]*)?[[:space:]](-[a-z]*v[a-z]*|--volumes)([[:space:]=]|$)@@docker compose down con -v/--volumes@@borra los volúmenes: la base de desarrollo pierde todos sus datos'
  'drop[[:space:]]+table@@DROP TABLE@@borra una tabla con sus datos'
  'drop[[:space:]]+database@@DROP DATABASE@@borra una base de datos entera'
  'drop[[:space:]]+schema@@DROP SCHEMA@@borra un esquema con todas sus tablas'
  '(^|[^a-z_])truncate[[:space:]]+(table[[:space:]]+|only[[:space:]]+)?[a-z_"]@@TRUNCATE@@vacía tablas sin dejar rastro fila a fila'
)

for regla in "${reglas[@]}"; do
  re=${regla%%@@*}
  resto=${regla#*@@}
  que=${resto%%@@*}
  porque=${resto#*@@}
  if printf '%s\n' "$cmd" | grep -qiE -- "$re"; then
    {
      echo "Bloqueado por .claude/hooks/sin-borrar-datos.sh: la orden contiene $que, que $porque."
      echo "Convenciones: docs/convenciones/base-de-datos.md. Para probar la vuelta de una migración usa"
      echo "NODE_ENV=test node ace migration:rollback contra db-test (skill revisar-migracion)."
      echo "Si de verdad hace falta, que lo ejecute una persona a mano; no reescribas la orden para esquivar el hook."
    } >&2
    exit 2
  fi
done

exit 0
