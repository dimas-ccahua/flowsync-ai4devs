## Why

RF-12 era la única acción irreversible del producto y, con roles planos, cualquiera podía borrar el trabajo de cualquiera. PA-2 se resolvió el 2026-10-02 con una papelera (RF-12 enmendado): borrar deja de destruir y pasa a esconder, y cualquier miembro puede deshacerlo. Este change entrega la parte de backend de la historia E2-10 (`docs/backlog/E2-gestion-tareas/us-borrar-tarea.md`).

## What Changes

- `tasks` gana la columna `deleted_at`: nula es una tarea viva; con valor, una tarea en la papelera y el instante en que entró.
- `DELETE /api/v1/tasks/:id` manda una tarea viva a la papelera. Cualquier cuenta con sesión, sea o no su responsable.
- `GET /api/v1/tasks/trash` lista la papelera, con quién llevaba cada tarea y cuándo se borró.
- `POST /api/v1/tasks/:id/restore` devuelve una tarea de la papelera a la lista con su título, estado, responsable y fecha intactos.
- Lo que está en la papelera **no sale por ningún otro camino**: ni en la lista, ni con ningún filtro, ni abriéndola por su id, ni cambiándole el estado o la fecha. Para todo eso responde como si no existiera.
- Borrar algo que ya está en la papelera, o que no existe, es un `404`, no un fallo del sistema.

### Fuera de este change, y a propósito

- **Toda la interfaz.** Incluidos los guardarraíles que la historia pone en la interfaz: la confirmación explícita (CA-4), que la confirmación diga adónde va la tarea (CA-5), cancelar sin efecto (CA-6) y la distancia entre borrar y cambiar el estado (CA-7). La nota de la historia lo advierte: sin ellos la historia **no** está entregada, solo su API.
- **Vaciar la papelera**, de forma manual o automática. Hoy no se vacía nunca: lo que entra se queda (RF-12, PA-2 sin resolver en ese punto).
- **Quién borró cada tarea.** CA-8 pide quién la llevaba y cuándo se borró, no quién la borró, y guardarlo sería otra columna.
- Lo que ve alguien cuya tarea abierta borra otra persona (PA-8) sigue sin decidir.

## Capabilities

### New Capabilities

Ninguna. La papelera es comportamiento de una tarea.

### Modified Capabilities

- `tasks`: gana el borrado a la papelera, la consulta de la papelera y la restauración; gana la regla de que lo borrado no se alcanza por ningún otro camino; y el requisito de sesión pasa a cubrir las tres operaciones nuevas.

## Impact

**Backend.** Migración que añade `deleted_at` (nulable, sin tocar las filas existentes) y regeneración de `database/schema.ts`. El modelo `Task` excluye la papelera de cualquier consulta por defecto. Controlador nuevo para la papelera, transformer de la tarea en la papelera, rutas nuevas con `:id` restringido a números, esquemas OpenAPI y `.adonisjs/` regenerado. Primeros tests de la capability para esta historia.

**Frontend.** Ninguno en este change.

**Riesgos.** Que una consulta futura se salte el filtro de la papelera y la deje asomar: por eso el filtro vive en el modelo y no en cada controlador (ver design). Y que la vuelta de la migración, con tareas en la papelera, las devuelva a la lista sin avisar: por eso falla en alto (ver `## Reversibilidad`).
