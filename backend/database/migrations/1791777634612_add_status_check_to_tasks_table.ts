import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * RF-8 en la base: `tasks.status` solo admite `pending`, `in_progress` y
 * `done` (convención 2 de docs/convenciones/base-de-datos.md). Hasta aquí era
 * un `varchar(255)` sin restricción, y una importación directa dejó 22 tareas
 * con estados que ninguna vista encuentra (INC-0412).
 *
 * Antes del CHECK, las filas que lo incumplen pasan a uno de los tres estados
 * con un mapeo explícito, sin reglas genéricas: cada valor de la izquierda se
 * vio en la base real antes de escribir esto.
 *
 * Rama (convención 5):
 * - Reversible para esos valores: el original de cada fila se guarda en
 *   `tasks_status_previo` y el `down` lo restaura.
 * - Falla en alto para cualquier otro: si una base trae un estado que no está
 *   en el mapeo, el CHECK no se puede crear, la migración aborta y, como va en
 *   una transacción, no queda nada a medias.
 *
 * `updated_at` no se toca a propósito: corregir la ortografía del estado no es
 * que alguien haya cambiado la tarea, y moverlo haría que 13 tareas `done`
 * contaran como cerradas el día de la migración.
 *
 * Los tres estados van escritos aquí y no importados de `#models/task`: una
 * migración describe la base en el momento en que se escribió, y no debe
 * cambiar si el modelo cambia después.
 */
const MAPEO: ReadonlyArray<readonly [previo: string, nuevo: string]> = [
  ['Hecho', 'done'],
  ['En curso', 'in_progress'],
  ['Pendiente', 'pending'],
  ['DONE', 'done'],
  ['done ', 'done'],
]

export default class extends BaseSchema {
  protected tableName = 'tasks'

  async up() {
    this.schema.createTable('tasks_status_previo', (table) => {
      table
        .integer('task_id')
        .primary()
        .references('id')
        .inTable('tasks')
        // CASCADE: el respaldo solo sirve para devolverle a su tarea el estado
        // que tenía; si la tarea desaparece (al borrar a su responsable, que
        // también va en cascada), no queda a quién devolvérselo.
        .onDelete('CASCADE')
      table.string('status_previo').notNullable()
      table.string('status_nuevo').notNullable()
    })

    this.defer(async (db) => {
      for (const [previo, nuevo] of MAPEO) {
        await db.rawQuery(
          `INSERT INTO tasks_status_previo (task_id, status_previo, status_nuevo)
           SELECT id, status, ? FROM tasks WHERE status = ?`,
          [nuevo, previo]
        )
        await db.rawQuery('UPDATE tasks SET status = ? WHERE status = ?', [nuevo, previo])
      }
    })

    this.schema.raw(
      `ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
       CHECK (status IN ('pending', 'in_progress', 'done'))`
    )
  }

  async down() {
    // Primero el CHECK: con él puesto, devolver un 'Hecho' fallaría.
    this.schema.raw('ALTER TABLE tasks DROP CONSTRAINT tasks_status_check')

    // Solo se restauran las filas que siguen con el estado que les puso el
    // `up`. Si alguien la cambió después (por ejemplo, de 'done' a 'pending'),
    // ese cambio es más reciente y vale más que la ortografía antigua, que en
    // esas filas se pierde.
    this.schema.raw(
      `UPDATE tasks SET status = p.status_previo
       FROM tasks_status_previo p
       WHERE p.task_id = tasks.id AND tasks.status = p.status_nuevo`
    )

    this.schema.dropTable('tasks_status_previo')
  }
}
