import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import {
  buildOpenApiDocument,
  diffDocuments,
  openApiDocumentPath,
  OPENAPI_DOCUMENT_RELATIVE_PATH,
  type DocumentDifference,
} from '#openapi/document'

/** Cuántas diferencias se enseñan antes de resumir el resto. */
const MAX_DIFFERENCES_SHOWN = 20

/**
 * Comprueba que el documento versionado sigue describiendo la API de verdad.
 *
 * Regenera el documento en un directorio temporal, lo compara con el que está
 * en el repositorio y termina con código distinto de cero si no coinciden.
 *
 * **Solo compara.** No escribe en `docs/api/openapi.json` bajo ninguna
 * circunstancia: si arreglara la diferencia por su cuenta, dejaría de haber
 * nada que avisara de que el contrato se había movido, que es justo su trabajo.
 */
export default class OpenapiCheck extends BaseCommand {
  static commandName = 'openapi:check'
  static description =
    'Regenera el documento OpenAPI en un temporal y comprueba que coincide con docs/api/openapi.json'

  static options: CommandOptions = { startApp: true }

  async run() {
    const versionedPath = openApiDocumentPath(this.app)

    const regenerated = await buildOpenApiDocument(this.app)
    const temporaryPath = await this.#writeToTemporaryLocation(regenerated)
    this.logger.info(`documento regenerado en ${temporaryPath}`)

    const versioned = await this.#readVersioned(versionedPath)
    if (versioned === null) return

    if (versioned === regenerated) {
      this.logger.success(`${OPENAPI_DOCUMENT_RELATIVE_PATH} coincide con la API`)
      return
    }

    this.exitCode = 1
    this.#reportDifferences(versioned, regenerated, temporaryPath)
  }

  /**
   * El documento regenerado va a un temporal y no a memoria porque la orden es
   * comparar dos ficheros: dejarlo escrito permite abrirlo, pasarle un `diff` o
   * copiarlo encima del versionado a mano si el cambio es el que se buscaba.
   */
  async #writeToTemporaryLocation(document: string): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'flowsync-openapi-'))
    const path = join(directory, 'openapi.json')

    await mkdir(directory, { recursive: true })
    await writeFile(path, document, 'utf-8')

    return path
  }

  /** El contenido del documento versionado, o `null` si no se puede leer. */
  async #readVersioned(path: string): Promise<string | null> {
    try {
      return await readFile(path, 'utf-8')
    } catch {
      this.exitCode = 1
      this.logger.error(`no existe ${OPENAPI_DOCUMENT_RELATIVE_PATH}`)
      this.logger.info('ejecuta `npm run openapi:generate` para crearlo y commitéalo')

      return null
    }
  }

  #reportDifferences(versioned: string, regenerated: string, temporaryPath: string) {
    this.logger.error(`${OPENAPI_DOCUMENT_RELATIVE_PATH} no describe la API actual`)

    for (const line of this.#describe(versioned, regenerated)) {
      this.logger.log(`  ${line}`)
    }

    this.logger.log('')
    this.logger.info('el documento del repositorio se ha quedado atrás respecto al código')
    this.logger.info('ejecuta `npm run openapi:generate` y commitea el resultado con el cambio')
    this.logger.info(
      `o compara los dos a mano: diff ${temporaryPath} ${relative(process.cwd(), openApiDocumentPath(this.app))}`
    )
  }

  /**
   * Las diferencias, en texto. Si los documentos no son JSON comparable —porque
   * el versionado se editó a mano y quedó roto—, se dice eso en vez de fingir
   * una comparación estructural que no se puede hacer.
   */
  #describe(versioned: string, regenerated: string): string[] {
    let differences: DocumentDifference[]
    try {
      differences = diffDocuments(JSON.parse(versioned), JSON.parse(regenerated))
    } catch {
      return ['el documento versionado no es JSON válido: regenéralo entero']
    }

    if (differences.length === 0) {
      return ['mismo contenido pero distinto formato: regenéralo para normalizarlo']
    }

    const shown = differences.slice(0, MAX_DIFFERENCES_SHOWN).map((difference) => {
      if (difference.kind === 'falta') {
        return `falta en el fichero  ${difference.path}: ${difference.regenerated}`
      }
      if (difference.kind === 'sobra') {
        return `sobra en el fichero  ${difference.path}: ${difference.versioned}`
      }

      return `difiere              ${difference.path}: ${difference.versioned} (fichero) → ${difference.regenerated} (API)`
    })

    if (differences.length > MAX_DIFFERENCES_SHOWN) {
      shown.push(`… y ${differences.length - MAX_DIFFERENCES_SHOWN} diferencias más`)
    }

    return shown
  }
}
