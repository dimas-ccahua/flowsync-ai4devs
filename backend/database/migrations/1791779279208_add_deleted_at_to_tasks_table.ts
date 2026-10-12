import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * La papelera de RF-12 (PA-2 resuelto): `deleted_at` nulo es una tarea viva, y
 * con valor, una tarea en la papelera y el instante en que entró.
 *
 * Rama (convención 5 de docs/convenciones/base-de-datos.md; detalle en la
 * sección «Reversibilidad» del design de openspec/changes/add-task-trash):
 * - Ida, reversible: columna nulable sin valor por defecto. Todas las tareas
 *   existentes quedan a `NULL`, es decir, vivas y en la lista.
 * - Vuelta, falla en alto si la papelera tiene algo: quitar la columna
 *   devolvería esas tareas a la lista sin que nadie lo decidiera y perdería
 *   cuándo se borraron. Con la papelera vacía, deja el esquema como estaba.
 */
export default class extends BaseSchema {
  protected tableName = 'tasks'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('deleted_at').nullable()
    })
  }

  async down() {
    this.defer(async (db) => {
      const [{ total }] = await db
        .from(this.tableName)
        .whereNotNull('deleted_at')
        .count('* as total')

      if (Number(total) > 0) {
        throw new Error(
          `Hay ${total} tareas en la papelera: quitar deleted_at las devolvería a la lista. ` +
            'Restáuralas o vacía la columna a propósito antes de deshacer esta migración.'
        )
      }
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('deleted_at')
    })
  }
}
