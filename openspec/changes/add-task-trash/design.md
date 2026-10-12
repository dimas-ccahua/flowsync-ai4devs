## Context

`tasks` no tiene borrado de ningún tipo y la API no expone ninguno. Las lecturas y escrituras de una tarea pasan por cuatro sitios: `TasksController.index` (lista y filtro), `TasksController.show` (tarea suelta), `TaskStatusesController.update` y `TaskDueDatesController.update`. Los cuatro usan `Task.query()` o `Task.findOrFail()`. No hay relaciones que carguen tareas desde otro modelo: `User` no declara `hasMany` de tareas.

Estado de la base de desarrollo, consultado por MCP antes de escribir nada (convención 1): `tasks` tiene 230 filas, ninguna columna con «delet» en el nombre en ninguna tabla, `tasks_status_check` y la clave foránea de `tasks_status_previo` apuntando a `tasks.id` con `CASCADE`.

## Goals / Non-Goals

**Goals:**
- Borrar, listar la papelera y restaurar por la API, con los nombres fijados: `deleted_at`, `DELETE /tasks/:id`, `GET /tasks/trash`, `POST /tasks/:id/restore`.
- Que lo borrado no se pueda alcanzar por ningún otro camino, y que eso no dependa de que cada controlador se acuerde.

**Non-Goals:**
- Interfaz, vaciar la papelera, guardar quién borró (ver proposal).

## Decisions

### 1. Borrado lógico con `deleted_at`, no una tabla aparte

Una columna nulable en `tasks`. Mover la fila a otra tabla obligaría a duplicar el esquema de `tasks`, a mantener las dos en paralelo con cada migración y a reescribir las claves foráneas que apuntan a `tasks.id`. Con la columna, restaurar es poner `NULL` y la tarea vuelve con todo lo que tenía, que es exactamente CA-8b.

### 2. El filtro de la papelera vive en el modelo

`Task` declara hooks `beforeFind` y `beforeFetch` que añaden `deleted_at IS NULL` a **toda** consulta del modelo. La única forma de ver la papelera es pedirla explícitamente con `Task.inTrash()`, que marca su consulta para que el hook no la filtre y añade `deleted_at IS NOT NULL`.

Alternativa descartada: un `scope` o un `whereNull` en cada controlador. Funciona hoy, pero la próxima consulta que se escriba sin él saca la papelera a la luz sin que nada falle. Con el hook, olvidarse produce el comportamiento seguro, y lo que hay que recordar es lo excepcional: ver la papelera.

### 3. Borrar y restaurar son un `UPDATE` condicionado, no `find` + `save`

`DELETE` hace `UPDATE tasks SET deleted_at = now() WHERE id = ? AND deleted_at IS NULL`, y `restore` lo contrario con `IS NOT NULL`. Si no toca ninguna fila, es un `404`. Así dos personas borrando a la vez no se pisan (CA-11): la segunda no encuentra nada que borrar y recibe `404`, sin carrera entre leer y escribir.

Ninguno de los dos toca `updated_at`. Mandar a la papelera o sacar de ella no cambia la tarea, y CA-8b pide que vuelva intacta.

### 4. Cambiar estado o fecha bloquea la fila

`TaskStatusesController` y `TaskDueDatesController` siguen comprobando primero que la tarea existe (404 antes que el cuerpo, como hoy), y luego releen la fila con `FOR UPDATE` dentro de una transacción antes de guardar. Sin el bloqueo, un borrado que entrase entre la lectura y el guardado dejaría cambiado el estado de una tarea que ya está en la papelera. Con él, el borrado espera y, si ganó antes, la relectura no la encuentra y la respuesta es `404`.

### 5. `:id` solo admite números

Las rutas con `:id` llevan `.where('id', router.matchers.number())`. Sin eso, `GET /tasks/trash` competiría con `GET /tasks/:id`, y el resultado dependería del orden de declaración. La ruta de la papelera se declara además antes.

### 6. Forma de una tarea en la papelera

Transformer propio, `TaskTrashTransformer`: `id`, `title`, `status`, `deletedAt` y el `assignee` recortado de siempre. CA-8 pide quién la llevaba y cuándo se borró; el resto de la tarea se ve al restaurarla. `restore` devuelve la forma de lista (`TaskTransformer`), porque es a la lista adonde vuelve.

## Reversibilidad

Una migración: `add_deleted_at_to_tasks_table`.

- **Filas que toca, contadas por MCP contra la base de desarrollo:** 230 tareas, todas con la columna nueva a `NULL`. Ninguna se reescribe ni cambia de estado: todas siguen vivas y en la lista. No hay datos que mover ni transformar.
- **Ida: reversible.** Añade una columna nulable sin valor por defecto.
- **Vuelta: falla en alto si la papelera tiene algo.** Quitar `deleted_at` con tareas en la papelera las devolvería a la lista sin que nadie lo decidiera, y perdería cuándo se borraron. Por eso el `down` cuenta las filas con `deleted_at` no nulo y, si hay alguna, aborta con un error que da el número. Con la papelera vacía (hoy: 0 filas), el `down` borra la columna y deja el esquema exactamente como estaba.
- **Cómo se vuelve atrás con la papelera llena:** primero se decide qué hacer con lo que hay en ella (restaurarlo con `POST /tasks/:id/restore` o asumir que vuelve a la lista) y se vacía la columna a propósito. Solo entonces se ejecuta el rollback.
- Probada ida, vuelta e ida en `db-test`, con una tarea en la papelera para comprobar que la vuelta falla en alto.

## Risks / Trade-offs

- [Una consulta que salte el modelo, con `db.from('tasks')` o SQL a mano, ve la papelera] → El hook solo protege las consultas del modelo. Hoy no hay ninguna que lo salte; se anota en el README de la capability.
- [Los hooks `beforeFind`/`beforeFetch` no cubren `update()` ni `delete()` masivos del query builder] → Este change no usa ninguno sobre tareas vivas salvo el `UPDATE` condicionado de la decisión 3, que lleva su condición escrita.
- [La papelera crece sin límite] → Aceptado: vaciarla está fuera de este corte (RF-12).
- [El borrado no guarda quién lo hizo] → Aceptado: CA-8 no lo pide.

## Open Questions

- Vaciar la papelera, y quién puede hacerlo (PA-2, lo que no resuelve).
- PA-8: qué ve quien tenía abierta una tarea que otra persona manda a la papelera.
