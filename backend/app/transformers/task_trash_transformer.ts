import type Task from '#models/task'
import { BaseTransformer } from '@adonisjs/core/transformers'
import TaskAssigneeTransformer from '#transformers/task_assignee_transformer'

/**
 * Una tarea tal y como se ve en la papelera: lo justo para reconocerla, quién
 * la llevaba y cuándo se borró (CA-8 de E2-10). El resto —la fecha de
 * vencimiento, sobre todo— se ve al restaurarla y abrirla, porque mientras
 * está en la papelera no es una tarea con la que se trabaje.
 *
 * Aparte de `TaskTransformer` por el mismo motivo que `TaskDetailTransformer`:
 * `deletedAt` solo tiene sentido aquí, y la lista no debe poder enseñarlo.
 */
export default class TaskTrashTransformer extends BaseTransformer<Task> {
  toObject() {
    return {
      ...this.pick(this.resource, ['id', 'title', 'status', 'deletedAt']),
      assignee: TaskAssigneeTransformer.transform(this.whenLoaded(this.resource.assignee)),
    }
  }
}
