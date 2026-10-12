import Task from '#models/task'
import User from '#models/user'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

/**
 * La papelera de E2-10 (RF-12 tras resolver PA-2). Un test por scenario de los
 * requisitos que añade `openspec/changes/add-task-trash/specs/tasks/spec.md`
 * y que se pueden comprobar por la API:
 *
 * - Borrar una tarea la manda a la papelera (CA-1, CA-2, CA-3)
 * - Consultar la papelera (CA-8)
 * - Restaurar una tarea de la papelera (CA-8b)
 * - Lo que está en la papelera no sale por ningún otro camino (CA-8c)
 * - Borrar no es marcar como hecha (CA-9)
 * - Borrar dos veces no es un fallo del sistema (CA-11)
 * - Las tareas exigen sesión, en sus dos scenarios nuevos (CA-10)
 *
 * CA-4 a CA-7 (confirmación, qué dice, cancelar y el coste del gesto) son de la
 * interfaz y quedan fuera de este change.
 */
test.group('Tasks | papelera', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  const DIA = '2026-10-11'

  async function cuenta(email: string, fullName = 'Ada Lovelace') {
    return User.create({ fullName, email, password: 'secreto123' })
  }

  async function tarea(
    assignee: User,
    datos: Partial<Pick<Task, 'title' | 'status' | 'dueDate'>> = {}
  ) {
    return Task.create({
      title: 'Revisar el informe',
      status: 'pending',
      dueDate: null,
      ...datos,
      assigneeId: assignee.id,
    })
  }

  async function idsDeLaLista(client: any, user: User, status?: string) {
    const request = client.get('/api/v1/tasks').loginAs(user)
    const response = await (status ? request.qs({ status }) : request)
    response.assertStatus(200)
    return response.body().data.map((t: any) => t.id) as number[]
  }

  async function papelera(client: any, user: User) {
    const response = await client.get('/api/v1/tasks/trash').loginAs(user)
    response.assertStatus(200)
    return response.body().data as any[]
  }

  async function idsDeLaPapelera(client: any, user: User) {
    const tareas = await papelera(client, user)
    return tareas.map((t) => t.id) as number[]
  }

  async function enLaPapelera(client: any, user: User, id: number) {
    const tareas = await papelera(client, user)
    return tareas.find((t) => t.id === id)
  }

  // --- Borrar una tarea la manda a la papelera ------------------------------

  test('borrar una tarea responde 204 y la saca de la lista', async ({ client, assert }) => {
    const ada = await cuenta('ada@example.com')
    const t = await tarea(ada)

    const response = await client.delete(`/api/v1/tasks/${t.id}`).loginAs(ada)

    response.assertStatus(204)
    assert.notInclude(await idsDeLaLista(client, ada), t.id)
  })

  test('la tarea borrada desaparece también para el resto del equipo', async ({
    client,
    assert,
  }) => {
    const ada = await cuenta('ada@example.com')
    const grace = await cuenta('grace@example.com', 'Grace Hopper')
    const t = await tarea(ada)

    await client.delete(`/api/v1/tasks/${t.id}`).loginAs(ada)

    assert.notInclude(await idsDeLaLista(client, grace), t.id)
  })

  test('se puede borrar una tarea ajena sin permiso especial', async ({ client, assert }) => {
    const ada = await cuenta('ada@example.com')
    const grace = await cuenta('grace@example.com', 'Grace Hopper')
    const deAda = await tarea(ada)

    const response = await client.delete(`/api/v1/tasks/${deAda.id}`).loginAs(grace)

    response.assertStatus(204)
    assert.include(await idsDeLaPapelera(client, grace), deAda.id)
  })

  // --- Consultar la papelera ------------------------------------------------

  test('lo borrado está en la papelera, con quién la llevaba y cuándo se borró', async ({
    client,
    assert,
  }) => {
    const ada = await cuenta('ada@example.com')
    const grace = await cuenta('grace@example.com', 'Grace Hopper')
    const t = await tarea(ada, { status: 'in_progress' })
    const antes = Date.now()

    await client.delete(`/api/v1/tasks/${t.id}`).loginAs(grace)

    const enPapelera = await enLaPapelera(client, grace, t.id)
    assert.exists(enPapelera)
    assert.equal(enPapelera.title, 'Revisar el informe')
    assert.equal(enPapelera.status, 'in_progress')
    // Quién la llevaba, no quién la borró: el responsable sigue siendo Ada.
    assert.deepEqual(enPapelera.assignee, { id: ada.id, fullName: 'Ada Lovelace', initials: 'AL' })
    assert.isAtLeast(new Date(enPapelera.deletedAt).getTime(), antes - 1000)
  })

  test('una tarea viva no está en la papelera', async ({ client, assert }) => {
    const ada = await cuenta('ada@example.com')
    const viva = await tarea(ada)

    assert.notInclude(await idsDeLaPapelera(client, ada), viva.id)
  })

  // --- Restaurar una tarea de la papelera -----------------------------------

  test('restaurar la devuelve con título, estado, responsable y fecha intactos', async ({
    client,
    assert,
  }) => {
    const ada = await cuenta('ada@example.com')
    const grace = await cuenta('grace@example.com', 'Grace Hopper')
    const t = await tarea(ada, {
      title: 'Cerrar el trimestre',
      status: 'in_progress',
      dueDate: '2026-12-01',
    })

    const antes = await client.get(`/api/v1/tasks/${t.id}`).qs({ today: DIA }).loginAs(ada)
    await client.delete(`/api/v1/tasks/${t.id}`).loginAs(ada)
    const restaurada = await client.post(`/api/v1/tasks/${t.id}/restore`).loginAs(grace)
    const despues = await client.get(`/api/v1/tasks/${t.id}`).qs({ today: DIA }).loginAs(ada)

    restaurada.assertStatus(200)
    assert.equal(restaurada.body().data.id, t.id)
    despues.assertStatus(200)
    assert.include(await idsDeLaLista(client, ada), t.id)
    for (const campo of ['title', 'status', 'dueDate', 'assignee', 'updatedAt']) {
      assert.deepEqual(despues.body().data[campo], antes.body().data[campo], campo)
    }
  })

  test('restaurar la saca de la papelera', async ({ client, assert }) => {
    const ada = await cuenta('ada@example.com')
    const t = await tarea(ada)

    await client.delete(`/api/v1/tasks/${t.id}`).loginAs(ada)
    await client.post(`/api/v1/tasks/${t.id}/restore`).loginAs(ada)

    assert.notInclude(await idsDeLaPapelera(client, ada), t.id)
  })

  test('restaurar algo que no está en la papelera es un 404 y no cambia nada', async ({
    client,
    assert,
  }) => {
    const ada = await cuenta('ada@example.com')
    const viva = await tarea(ada)

    const sobreViva = await client.post(`/api/v1/tasks/${viva.id}/restore`).loginAs(ada)
    const sobreInexistente = await client.post('/api/v1/tasks/999999/restore').loginAs(ada)

    sobreViva.assertStatus(404)
    sobreInexistente.assertStatus(404)
    await viva.refresh()
    assert.isNull(viva.deletedAt)
    assert.include(await idsDeLaLista(client, ada), viva.id)
  })

  // --- Lo que está en la papelera no sale por ningún otro camino ------------

  test('una tarea en la papelera no sale en la lista ni con ningún filtro', async ({
    client,
    assert,
  }) => {
    const ada = await cuenta('ada@example.com')
    const borradas = await Promise.all(
      (['pending', 'in_progress', 'done'] as const).map((status) => tarea(ada, { status }))
    )
    for (const t of borradas) {
      await client.delete(`/api/v1/tasks/${t.id}`).loginAs(ada)
    }

    for (const status of [undefined, 'pending', 'in_progress', 'done']) {
      const ids = await idsDeLaLista(client, ada, status)
      for (const t of borradas) {
        assert.notInclude(ids, t.id, `status=${status ?? '(sin filtro)'}`)
      }
    }
  })

  test('una tarea en la papelera no se puede abrir por su identificador', async ({ client }) => {
    const ada = await cuenta('ada@example.com')
    const t = await tarea(ada)
    await client.delete(`/api/v1/tasks/${t.id}`).loginAs(ada)

    const response = await client.get(`/api/v1/tasks/${t.id}`).qs({ today: DIA }).loginAs(ada)

    response.assertStatus(404)
  })

  test('a una tarea en la papelera no se le puede cambiar el estado', async ({
    client,
    assert,
  }) => {
    const ada = await cuenta('ada@example.com')
    const t = await tarea(ada, { status: 'pending' })
    await client.delete(`/api/v1/tasks/${t.id}`).loginAs(ada)

    const response = await client
      .patch(`/api/v1/tasks/${t.id}/status`)
      .json({ status: 'done' })
      .loginAs(ada)
    const restaurada = await client.post(`/api/v1/tasks/${t.id}/restore`).loginAs(ada)

    response.assertStatus(404)
    assert.equal(restaurada.body().data.status, 'pending')
  })

  test('a una tarea en la papelera no se le puede fijar ni retirar la fecha', async ({
    client,
    assert,
  }) => {
    const ada = await cuenta('ada@example.com')
    const t = await tarea(ada, { dueDate: '2026-12-01' })
    const antes = await client.get(`/api/v1/tasks/${t.id}`).qs({ today: DIA }).loginAs(ada)
    await client.delete(`/api/v1/tasks/${t.id}`).loginAs(ada)

    const fijar = await client
      .put(`/api/v1/tasks/${t.id}/due-date`)
      .json({ dueDate: '2027-01-15', today: DIA })
      .loginAs(ada)
    const retirar = await client
      .put(`/api/v1/tasks/${t.id}/due-date`)
      .json({ dueDate: null, today: DIA })
      .loginAs(ada)
    await client.post(`/api/v1/tasks/${t.id}/restore`).loginAs(ada)
    const abierta = await client.get(`/api/v1/tasks/${t.id}`).qs({ today: DIA }).loginAs(ada)

    fijar.assertStatus(404)
    retirar.assertStatus(404)
    // Contra lo que devolvía antes de borrarla, no contra el literal: la forma
    // en que la API serializa `dueDate` con PostgreSQL es una regresión
    // conocida y ajena a la papelera (ver HALLAZGOS.md). Lo que se prueba aquí
    // es que la papelera no la cambia.
    assert.isNotNull(antes.body().data.dueDate)
    assert.equal(abierta.body().data.dueDate, antes.body().data.dueDate)
  })

  // --- Borrar no es marcar como hecha ---------------------------------------

  test('una tarea hecha sale de la vista por defecto pero sigue consultable y fuera de la papelera', async ({
    client,
    assert,
  }) => {
    const ada = await cuenta('ada@example.com')
    const t = await tarea(ada)

    const marcada = await client
      .patch(`/api/v1/tasks/${t.id}/status`)
      .json({ status: 'done' })
      .loginAs(ada)
    const abierta = await client.get(`/api/v1/tasks/${t.id}`).qs({ today: DIA }).loginAs(ada)

    marcada.assertStatus(200)
    assert.notInclude(await idsDeLaLista(client, ada), t.id)
    assert.include(await idsDeLaLista(client, ada, 'done'), t.id)
    abierta.assertStatus(200)
    assert.notInclude(await idsDeLaPapelera(client, ada), t.id)
  })

  // --- Borrar dos veces no es un fallo del sistema ---------------------------

  test('borrar lo que otra persona ya borró es un 404 y no mueve el instante del borrado', async ({
    client,
    assert,
  }) => {
    const ada = await cuenta('ada@example.com')
    const grace = await cuenta('grace@example.com', 'Grace Hopper')
    const t = await tarea(ada)

    await client.delete(`/api/v1/tasks/${t.id}`).loginAs(ada)
    const primera = await enLaPapelera(client, ada, t.id)
    const segunda = await client.delete(`/api/v1/tasks/${t.id}`).loginAs(grace)
    const despues = await enLaPapelera(client, ada, t.id)
    const inexistente = await client.delete('/api/v1/tasks/999999').loginAs(grace)

    segunda.assertStatus(404)
    inexistente.assertStatus(404)
    assert.equal(despues.deletedAt, primera.deletedAt)
  })

  // --- Las tareas exigen sesión ---------------------------------------------

  test('borrar sin haber entrado es un 401 y la tarea sigue en la lista', async ({
    client,
    assert,
  }) => {
    const ada = await cuenta('ada@example.com')
    const t = await tarea(ada)

    const response = await client.delete(`/api/v1/tasks/${t.id}`)

    response.assertStatus(401)
    assert.include(await idsDeLaLista(client, ada), t.id)
    assert.notInclude(await idsDeLaPapelera(client, ada), t.id)
  })

  test('la papelera y la restauración exigen sesión', async ({ client, assert }) => {
    const ada = await cuenta('ada@example.com')
    const t = await tarea(ada)
    await client.delete(`/api/v1/tasks/${t.id}`).loginAs(ada)

    const lista = await client.get('/api/v1/tasks/trash')
    const restaurar = await client.post(`/api/v1/tasks/${t.id}/restore`)

    lista.assertStatus(401)
    assert.notProperty(lista.body(), 'data')
    restaurar.assertStatus(401)
    assert.include(await idsDeLaPapelera(client, ada), t.id)
  })
})
