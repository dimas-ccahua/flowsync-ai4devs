/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import { controllers } from '#generated/controllers'
import openapi from '@foadonis/openapi/services/main'

router.get('/', () => {
  return { hello: 'world' }
})

/**
 * Documentación OpenAPI. Registra tres rutas a partir del `path` que reciba
 * —por defecto `/api`—: la interfaz en `/api`, y el documento en `/api.json` y
 * `/api.yaml`. La interfaz se sirve en la raíz del `path` y lee el documento
 * del `/api.json`, así que las dos cosas viven en sitios distintos.
 *
 * Va fuera del grupo `/api/v1` a propósito: dentro heredaría ese prefijo y la
 * documentación pasaría a colgar de la propia versión que documenta.
 */
openapi.registerRoutes()

router
  .group(() => {
    router
      .group(() => {
        router.post('signup', [controllers.NewAccount, 'store'])
        router.post('login', [controllers.AccessTokens, 'store'])
      })
      .prefix('auth')
      .as('auth')

    router
      .group(() => {
        router.get('profile', [controllers.Profile, 'show'])
        router.post('logout', [controllers.AccessTokens, 'destroy'])
      })
      .prefix('account')
      .as('profile')
      .use(middleware.auth())

    router
      .group(() => {
        router.get('/', [controllers.Tasks, 'index'])
        router.post('/', [controllers.Tasks, 'store'])
        // La papelera antes que `:id`, y `:id` solo números: así `trash` nunca
        // se lee como un identificador, se declaren en el orden que se declaren.
        router.get('trash', [controllers.TaskTrash, 'index'])
        router.get(':id', [controllers.Tasks, 'show']).where('id', router.matchers.number())
        router.delete(':id', [controllers.Tasks, 'destroy']).where('id', router.matchers.number())
        router
          .post(':id/restore', [controllers.TaskTrash, 'restore'])
          .where('id', router.matchers.number())
        router
          .patch(':id/status', [controllers.TaskStatuses, 'update'])
          .where('id', router.matchers.number())
        router
          .put(':id/due-date', [controllers.TaskDueDates, 'update'])
          .where('id', router.matchers.number())
      })
      .prefix('tasks')
      .as('tasks')
      .use(middleware.auth())
  })
  .prefix('/api/v1')
