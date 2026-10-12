import User from '#models/user'
import { beforeFetch, beforeFind, belongsTo } from '@adonisjs/lucid/orm'
import { TaskSchema } from '#database/schema'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { ModelAdapterOptions, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'

/**
 * Los tres estados que puede tener una tarea. No se añaden, ni se renombran,
 * ni se eliminan: la lista sería otra cosa si esto fuera configurable.
 */
export const TASK_STATUSES = ['pending', 'in_progress', 'done'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

/**
 * Lo que devuelve la lista cuando no se pide ningún filtro. No es «todas»: lo
 * hecho queda fuera, que es justo el motivo por el que existe el filtro.
 *
 * Se escribe explícita y no como `TASK_STATUSES` menos `'done'`: es una
 * decisión de producto sobre qué merece ocupar la pantalla, no el resultado de
 * una resta.
 */
export const DEFAULT_LIST_STATUSES = [
  'pending',
  'in_progress',
] as const satisfies readonly TaskStatus[]

/**
 * Las consultas que han pedido ver la papelera. Es un `WeakSet` de objetos de
 * consulta, no un flag en el modelo: la marca vive lo que vive esa consulta y
 * no se puede quedar puesta para la siguiente.
 */
const consultasDePapelera = new WeakSet<object>()

export default class Task extends TaskSchema {
  @belongsTo(() => User, { foreignKey: 'assigneeId' })
  declare assignee: BelongsTo<typeof User>

  /**
   * Lo que está en la papelera no existe para ninguna consulta del modelo:
   * `find`, `findOrFail`, `first` y cualquier `query()` llevan
   * `deleted_at IS NULL` sin que el controlador lo pida. Así, la lista, los
   * filtros, abrir una tarea y cambiarle el estado o la fecha la tratan como si
   * no existiera, y una consulta nueva que se escriba mañana también.
   *
   * Lo que hay que pedir a propósito es lo contrario: ver la papelera, con
   * `Task.inTrash()`. No cubre lo que salte el modelo (`db.from('tasks')`).
   */
  @beforeFind()
  @beforeFetch()
  static excludeTrash(query: ModelQueryBuilderContract<typeof Task>) {
    if (!consultasDePapelera.has(query)) {
      query.whereNull('deleted_at')
    }
  }

  /**
   * La única consulta que ve la papelera, y solo la papelera.
   */
  static inTrash(options?: ModelAdapterOptions) {
    const query = this.query(options).whereNotNull('deleted_at')
    consultasDePapelera.add(query)
    return query
  }

  /**
   * Si la tarea está vencida para quien mira desde `referenceDay`, un día del
   * calendario en formato `AAAA-MM-DD`.
   *
   * Tres condiciones y ninguna más: hay fecha, esa fecha es **anterior** al día
   * de referencia, y la tarea no está hecha. El `<` es estricto a propósito:
   * vencer hoy todavía no es estar vencida, y un `<=` incumpliría esa regla sin
   * que nada fallara ruidosamente.
   *
   * El día llega por parámetro y no de ningún reloj. Es lo que hace que dos
   * personas en husos distintos obtengan lecturas distintas y las dos sean
   * correctas, y que una tarea pase a vencida sola al cambiar el día sin que
   * nadie la haya tocado: no hay nada congelado, se decide al mirar.
   *
   * Se compara texto contra texto porque dos fechas ISO comparadas así **son**
   * la comparación de días del calendario: no hay hora, ni huso, ni instante
   * intermedio donde se cuele un día de más.
   *
   * Esta es la única definición de «vencida» del sistema. No se reimplementa en
   * ninguna otra capa, y en particular el frontend nunca compara fechas.
   */
  isOverdueOn(referenceDay: string): boolean {
    if (this.dueDate === null) return false

    return this.dueDate < referenceDay
  }
}
