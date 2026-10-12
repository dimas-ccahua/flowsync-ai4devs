## 1. Persistir la papelera

- [x] 1.1 Pasar la skill `revisar-migracion`: esquema real de `tasks` por MCP, filas afectadas y rama de reversibilidad (recogido en `## Reversibilidad` del design)
- [x] 1.2 Crear la migración que añade `deleted_at` nulable a `tasks`, con el `down` escrito primero: aborta si hay tareas en la papelera y, si no, borra la columna
- [x] 1.3 Probar ida, vuelta e ida contra `db-test`, incluida una tarea en la papelera para ver que la vuelta falla en alto
- [x] 1.4 Aplicarla en la base de desarrollo y commitear `database/schema.ts` regenerado

## 2. El modelo excluye la papelera

- [x] 2.1 Hooks `beforeFind` y `beforeFetch` en `Task` que añaden `deleted_at IS NULL` a toda consulta
- [x] 2.2 `Task.inTrash()`: la única consulta que ve la papelera, y solo la papelera

## 3. API

- [x] 3.1 `DELETE /tasks/:id` con un `UPDATE` condicionado a `deleted_at IS NULL`: `204`, o `404` si no toca ninguna fila
- [x] 3.2 `GET /tasks/trash` con `TaskTrashTransformer` (id, título, estado, responsable, `deletedAt`), de la más reciente a la más antigua
- [x] 3.3 `POST /tasks/:id/restore` con un `UPDATE` condicionado a `deleted_at IS NOT NULL`: `200` con la tarea en forma de lista, o `404`
- [x] 3.4 Cambiar estado y fecha releen la fila con `FOR UPDATE` en una transacción antes de guardar
- [x] 3.5 Restringir `:id` a números y declarar la papelera antes que `:id`
- [x] 3.6 Anotar las tres operaciones para OpenAPI y añadir sus esquemas
- [x] 3.7 Regenerar `.adonisjs/` y `docs/api/openapi.json`, y commitear el diff

## 4. Tests

- [x] 4.1 Un test por cada scenario del delta que se pueda comprobar por la API
- [x] 4.2 Backend en verde de lint, typecheck y tests

## 5. Documentación

- [x] 5.1 README de la capability `tasks`: rutas, forma de la tarea en la papelera, dónde vive cada regla y qué queda fuera
