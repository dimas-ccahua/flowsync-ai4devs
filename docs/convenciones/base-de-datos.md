# Convenciones de base de datos

Este documento es la única fuente de las convenciones de base de datos de FlowSync. `CLAUDE.md` lo importa y `openspec/config.yaml` apunta a él; no se copian en ningún otro sitio.

Bases implicadas (ver `compose.yaml`): `db` es la de **desarrollo** (puerto 54410, con datos del seeder) y `db-test` la de **pruebas** (puerto 54411, en `tmpfs`, vacía en cada arranque). El servidor MCP `dbhub` lee `db` con el rol de solo lectura `flowsync_ro`.

## 1. El esquema y los valores se miran en la base real

Antes de escribir una consulta, un filtro o una migración, el esquema (tipos, nulabilidad, defaults, restricciones, claves foráneas, triggers) y los valores que hay de verdad se consultan en la base real por el servidor MCP. El código dice cómo se llaman las columnas, no qué hay dentro.

*De dónde sale:* `tasks.status` es un `varchar(255)` sin restricción alguna, aunque el validador solo deje pasar tres valores. Y tras migrar a PostgreSQL, el driver `pg` entrega `due_date` como `Date` mientras el código lo comparaba con texto `AAAA-MM-DD`: ni los tests ni el typecheck lo detectaron.

## 2. Los valores permitidos los impone la base con un `CHECK`

Si una columna solo admite un conjunto cerrado de valores, la migración declara un `CHECK` (o un tipo enum) que lo impone. El validador de VineJS sigue existiendo para dar errores legibles, pero no es la única barrera: cualquier escritura que no pase por la API (seeder, REPL, SQL a mano, otra aplicación) también tiene que respetarlo.

*De dónde sale:* consultada por MCP, `tasks.status` admite cualquier cadena. Un recuento con `status = 'done'` no ve un `'Done'` ni un `' done'`, y la base no impide que existan.

## 3. Toda clave foránea declara su `ON DELETE`, con el porqué al lado

Cada `.references(...)` lleva un `.onDelete(...)` explícito (`CASCADE`, `RESTRICT`, `SET NULL`…) y un comentario en la misma migración que explique por qué esa política y no otra. No se confía en el comportamiento por defecto.

*De dónde sale:* `tasks.assignee_id` y `auth_access_tokens.tokenable_id` usan `CASCADE` sin ninguna explicación. En los tokens es obvio. En las tareas, borrar a una persona borra todo su trabajo, y nadie ha dejado escrito si eso es lo que se quería.

## 4. Toda migración lleva su `down`, probado ida, vuelta e ida contra la base de pruebas

El `down()` se escribe siempre y deshace exactamente lo que hace el `up()`. Antes de dar la migración por buena, se ejecuta contra **`db-test`**, nunca contra `db`:

```bash
cd backend
NODE_ENV=test node ace migration:run        # ida
NODE_ENV=test node ace migration:rollback   # vuelta
NODE_ENV=test node ace migration:run        # ida otra vez
```

Si alguno de los tres pasos falla, la migración no está terminada. Si el `down` no puede devolver los datos (ver la convención 5), se dice en el propio `down` con un comentario.

*De dónde sale:* `db-test` vive en `tmpfs` y se puede romper sin coste. `db` tiene los datos del seeder y es la que lee el servidor MCP: si se rompe, se pierde la referencia contra la que comprobar las convenciones 1 y 5.

## 5. Una migración que mueve o transforma datos se mide antes de escribirse

Si una migración hace algo más que cambiar la estructura (rellenar una columna nueva, convertir valores, mover datos de una columna o tabla a otra, añadir una restricción a datos que ya existen), **antes de escribirla** se cuentan por MCP contra la base real las filas que afecta y las que no cumplirían la nueva regla. Además se dice en cuál de estas tres ramas cae:

- **Reversible:** el `down` devuelve exactamente los datos de antes.
- **Falla en alto:** si hay datos que no encajan, la migración aborta con un error y no toca nada (por ejemplo, un `CHECK` sobre filas que lo incumplen).
- **Pierde datos:** el `down` no puede reconstruir lo que había. Se dice qué se pierde y cuántas filas.

*De dónde sale:* el recuento de tareas cerradas. No hay columna `closed_at`, y `updated_at` solo dice cuándo se tocó la tarea por última vez. Rellenar un futuro `closed_at` a partir de `updated_at` sería una migración de datos que mete un error en cada fila que toca. Ese error hay que saber cuántas filas lo arrastran antes de escribir la migración, no después.

## 6. Una columna con datos no se borra ni se renombra en el mismo cambio en que se deja de usar

Primero, en un cambio, el código deja de leerla y escribirla. Después, en **otro** cambio, una migración la borra o la renombra. Así, si el primer cambio hay que revertirlo, la columna y sus datos siguen ahí.

*De dónde sale:* es la consecuencia de las convenciones 4 y 5. Un `dropColumn` con datos cae siempre en la rama «pierde datos», y juntarlo con el cambio de código hace que revertir el código no baste para recuperarlos.
