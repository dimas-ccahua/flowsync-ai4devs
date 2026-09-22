import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { buildOpenApiDocument, openApiDocumentPath } from '#openapi/document'

/**
 * Escribe el documento OpenAPI en el repositorio.
 *
 * Se ejecuta a mano cuando un cambio mueve el contrato: rutas, controladores,
 * validadores o transformers. `openapi:check` es quien comprueba que no se
 * haya olvidado.
 */
export default class OpenapiGenerate extends BaseCommand {
  static commandName = 'openapi:generate'
  static description = 'Genera el documento OpenAPI y lo escribe en docs/api/openapi.json'

  /**
   * El documento se construye recorriendo el router, así que hace falta la
   * aplicación arrancada: sin ella no hay rutas que describir.
   */
  static options: CommandOptions = { startApp: true }

  async run() {
    const destination = openApiDocumentPath(this.app)
    const document = await buildOpenApiDocument(this.app)

    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, document, 'utf-8')

    this.logger.success(`documento OpenAPI escrito en ${relative(process.cwd(), destination)}`)
  }
}
