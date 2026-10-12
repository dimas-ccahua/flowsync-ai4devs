import Task from '#models/task'
import db from '@adonisjs/lucid/services/db'
import { errors as lucidErrors } from '@adonisjs/lucid'
import type { HttpContext } from '@adonisjs/core/http'
import TaskTransformer from '#transformers/task_transformer'
import TaskTrashTransformer from '#transformers/task_trash_transformer'
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@foadonis/openapi/decorators'
import { ErrorResponse, TaskResponse, TrashedTaskListResponse } from '#openapi/schemas'

/**
 * La papelera de RF-12. Es el único sitio desde el que se ve una tarea borrada:
 * el modelo la esconde de cualquier otra consulta (`Task.excludeTrash`), y aquí
 * se pide a propósito con `Task.inTrash()`.
 *
 * Vaciarla no existe todavía: lo que entra se queda (PA-2, sin resolver en ese
 * punto).
 */
@ApiBearerAuth()
export default class TaskTrashController {
  /**
   * Lo que hay en la papelera, de lo borrado más recientemente a lo más antiguo,
   * con quién llevaba cada tarea y cuándo se borró.
   */
  @ApiOperation({
    summary: 'La papelera',
    description:
      'Todas las tareas en la papelera, para cualquier cuenta con sesión, de la borrada más recientemente a la más antigua. Cada una llega con su responsable y el instante en que se borró. Solo contiene tareas borradas.',
  })
  @ApiResponse({
    status: 200,
    description: 'La papelera entera, sin paginar. Vacía es una lista vacía.',
    type: () => TrashedTaskListResponse,
  })
  @ApiResponse({
    status: 401,
    description: 'Falta el token o no es válido. No se devuelve ninguna tarea.',
    type: () => ErrorResponse,
  })
  async index({ serialize }: HttpContext) {
    const tasks = await Task.inTrash()
      .preload('assignee')
      .orderBy('deletedAt', 'desc')
      .orderBy('id', 'desc')

    return serialize(TaskTrashTransformer.transform(tasks))
  }

  /**
   * Devuelve una tarea de la papelera a la lista, con todo lo que tenía.
   *
   * Como borrar, es un `UPDATE` condicionado —aquí, a que la tarea esté en la
   * papelera— y no toca `updated_at`: la tarea vuelve intacta (CA-8b). Va en una
   * transacción con la relectura para que lo que se devuelve sea lo que se ha
   * restaurado, aunque alguien la vuelva a borrar justo después.
   */
  @ApiOperation({
    summary: 'Sacar una tarea de la papelera',
    description:
      'Cualquier cuenta con sesión devuelve a la lista una tarea de la papelera, con su título, estado, responsable y fecha de vencimiento intactos. Responde con la forma de lista, porque es a la lista adonde vuelve.',
  })
  @ApiResponse({
    status: 200,
    description: 'La tarea ya fuera de la papelera.',
    type: () => TaskResponse,
  })
  @ApiResponse({
    status: 401,
    description: 'Falta el token o no es válido. Nada cambia.',
    type: () => ErrorResponse,
  })
  @ApiResponse({
    status: 404,
    description:
      'No hay ninguna tarea con ese identificador en la papelera: no existe o está viva. Nada cambia.',
    type: () => ErrorResponse,
  })
  async restore({ params, serialize }: HttpContext) {
    const task = await db.transaction(async (trx) => {
      const restauradas = await Task.inTrash({ client: trx })
        .where('id', params.id)
        .update({ deleted_at: null }, ['id'])

      if (restauradas.length === 0) {
        throw new lucidErrors.E_ROW_NOT_FOUND(Task)
      }

      return Task.query({ client: trx }).where('id', params.id).preload('assignee').firstOrFail()
    })

    return serialize(TaskTransformer.transform(task))
  }
}
