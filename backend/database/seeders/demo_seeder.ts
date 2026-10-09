import logger from '@adonisjs/core/services/logger'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import User from '#models/user'
import { DEMO_EMAIL_DOMAIN, UserFactory } from '#database/factories/user_factory'
import { TaskFactory } from '#database/factories/task_factory'

const PERSONAS = 5
const TAREAS = 40

/**
 * Llena la base de desarrollo con un equipo inventado y su lista de tareas, para
 * trabajar con una lista poblada delante (PA-3 del PRD pide decidir el orden de
 * la lista así, no en abstracto). Todas las reglas de los datos viven en las
 * factories; aquí solo se decide cuántos y quién lleva qué.
 */
export default class extends BaseSeeder {
  /**
   * Solo en desarrollo: en pruebas cada test crea lo suyo, y en producción no
   * entra un dato inventado.
   */
  static environment = ['development']

  async run() {
    /**
     * Lanzarlo dos veces no duplica nada: si el equipo inventado ya está, la
     * base ya está sembrada y no se toca. Todo va en una transacción, así que no
     * puede quedar un equipo sin sus tareas que haga saltar esta comprobación.
     */
    const yaSembrada = await User.query({ client: this.client })
      .whereLike('email', `%@${DEMO_EMAIL_DOMAIN}`)
      .first()

    if (yaSembrada) {
      logger.info('La base ya tiene los datos de desarrollo; no se añade nada.')
      return
    }

    await this.client.transaction(async (trx) => {
      const personas = await UserFactory.client(trx).createMany(PERSONAS)

      /**
       * El responsable se reparte por turno, de modo que todas las personas
       * llevan tareas y la lista responde a «quién está en qué» para cada una
       * (RF-17). Cualquier persona puede llevar cualquier tarea (RF-10).
       */
      await TaskFactory.client(trx)
        .merge(
          Array.from({ length: TAREAS }, (_, i) => ({ assigneeId: personas[i % PERSONAS].id }))
        )
        .createMany(TAREAS)
    })
  }
}
