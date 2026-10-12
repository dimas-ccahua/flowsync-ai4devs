---
name: revisar-migracion
description: Procedimiento obligatorio ANTES de escribir cualquier migración de FlowSync (crear, alterar o borrar tablas, columnas, índices, restricciones o datos). Mira el esquema real por MCP, cuenta filas, decide la rama de reversibilidad, escribe el down antes que el up y prueba ida, vuelta e ida contra db-test. Usar también con /revisar-migracion.
---

# Revisar una migración antes de escribirla

Las reglas están en `docs/convenciones/base-de-datos.md` y **no se copian aquí**: léelo antes de empezar y cita la convención por su número cuando la apliques. Esta skill solo fija el **orden** en que se aplican las convenciones 1, 4, 5 y 6, y lo que hay que dejar escrito en cada paso. Las convenciones 2 (`CHECK`) y 3 (`ON DELETE` justificado) se cumplen al escribir el código de la migración en el paso 4.

No escribas ningún fichero de migración hasta haber terminado los pasos 1 a 3.

## 1. Mirar el esquema real (convención 1)

Consulta por el servidor MCP `dbhub` (`mcp__dbhub__execute_sql`, solo lectura, contra `db`) cada tabla que vaya a tocar la migración, no el código ni `database/schema.ts`:

- columnas, tipos exactos, nulabilidad y defaults (`information_schema.columns`);
- restricciones y claves foráneas con su `ON DELETE` (`pg_constraint` + `pg_get_constraintdef`);
- triggers (`pg_trigger` con `NOT tgisinternal`) e índices (`pg_indexes`);
- los valores que hay de verdad en las columnas implicadas (`SELECT col, count(*) ... GROUP BY col`).

Deja escrito lo que has encontrado y en qué se diferencia de lo que hace suponer el código.

## 2. Contar las filas afectadas (convención 5)

Cuenta por MCP, contra la base real, **antes de escribir nada**:

- cuántas filas toca la migración (las que se rellenan, convierten o mueven);
- cuántas filas incumplirían la nueva regla (un `CHECK`, un `NOT NULL`, un `UNIQUE`, una clave foránea);
- si borra o deja de usar una columna, cuántas filas tienen datos en ella (`count(*) FILTER (WHERE col IS NOT NULL)`).

Deja escritas las consultas y los números. Si la migración solo cambia estructura y no toca datos, dilo explícitamente con el recuento que lo demuestra (por ejemplo, tabla vacía o columna nueva sin valores).

## 3. Decir en qué rama cae (convenciones 5 y 6)

Clasifica cada migración en una de las tres ramas de la convención 5: **reversible**, **falla en alto** o **pierde datos**, con el número del paso 2 que lo justifica.

- Si cae en **pierde datos**, para y díselo a la persona antes de seguir: qué se pierde y cuántas filas.
- Si borra o renombra una columna con datos, comprueba que el código ya dejó de usarla en un cambio **anterior** (convención 6). Si es el mismo cambio, no sigas: divide el cambio en dos.

Si hay un change de OpenSpec, esto es lo que va en la sección `## Reversibilidad` del design.

## 4. Escribir la vuelta antes que la ida (convención 4)

1. Crea el fichero con `node ace make:migration <nombre>` (desde `backend/`).
2. Escribe **primero `down()`**: lo que deja la base exactamente como estaba. Si la rama es «pierde datos», el `down` lo dice en un comentario (qué no puede recuperar).
3. Escribe después `up()`, aplicando las convenciones 2 y 3 si añade columnas con valores cerrados o claves foráneas.

## 5. Probar ida, vuelta e ida en la base de pruebas (convención 4)

Siempre contra `db-test` (`NODE_ENV=test` carga `.env.test`, puerto 54411), **nunca** contra `db`:

```bash
make db-up                                   # desde la raíz, si db-test no está levantada
cd backend
NODE_ENV=test node ace migration:run         # ida
NODE_ENV=test node ace migration:rollback    # vuelta
NODE_ENV=test node ace migration:run         # ida otra vez
```

`db-test` está vacía, así que esta prueba demuestra que el `down` deshace la estructura, no que conserve datos. Si la migración transforma datos, mete antes en `db-test` filas que reproduzcan los casos del paso 2 y comprueba que, tras la vuelta, siguen como estaban (o que se pierden exactamente las que dijiste en el paso 3).

Los tres pasos tienen que salir bien. Si falla uno, se corrige la migración y se vuelve a empezar este paso. No uses `migration:fresh`, `migration:reset` ni `db:wipe`: el hook `sin-borrar-datos.sh` los bloquea, y no hay que esquivarlo.

Solo después, y si la persona lo pide, se migra la base de desarrollo (`node ace migration:run` o `make migrate-dev`).

## Qué se entrega

Un resumen con: lo encontrado en el paso 1, las consultas y los números del paso 2, la rama de cada migración del paso 3, y la salida de los tres comandos del paso 5.
