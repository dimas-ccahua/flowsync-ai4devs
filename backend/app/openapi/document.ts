import type { ApplicationService } from '@adonisjs/core/types'

/**
 * El documento OpenAPI como fichero.
 *
 * El paquete construye el documento en memoria y lo sirve por HTTP, así que sin
 * esto el contrato solo existe mientras el servidor corre: no se puede revisar
 * en un diff, ni comparar entre ramas, ni comprobar en CI. Aquí se le da forma
 * de fichero, y `openapi:generate` y `openapi:check` lo escriben y lo verifican.
 *
 * Los dos comandos comparten este módulo a propósito: si cada uno serializara
 * por su cuenta, bastaría una diferencia de indentación para que la
 * comprobación fallara sin que el contrato hubiera cambiado.
 */

/** Ruta del documento versionado, relativa a la raíz del repositorio. */
export const OPENAPI_DOCUMENT_RELATIVE_PATH = 'docs/api/openapi.json'

/**
 * La ruta absoluta del documento versionado. Cuelga de la raíz del repositorio
 * y no de `backend/`, porque el contrato describe la API para todo el que la
 * consuma —el frontend incluido— y no es un detalle interno del backend.
 */
export function openApiDocumentPath(app: ApplicationService): string {
  return app.makePath('..', OPENAPI_DOCUMENT_RELATIVE_PATH)
}

/**
 * Construye el documento y lo serializa.
 *
 * Sale con dos espacios de indentación y salto de línea final: es texto
 * versionado y tiene que comportarse como tal en un diff.
 */
export async function buildOpenApiDocument(app: ApplicationService): Promise<string> {
  // El documento se construye recorriendo el router, y el router no expone sus
  // rutas hasta que se le confirma. En el servidor HTTP eso ocurre al arrancar;
  // en un comando hay que pedirlo, o el documento sale con `paths` vacío y sin
  // que nada falle. `list:routes` del propio framework hace exactamente esto.
  const router = await app.container.make('router')
  router.commit()

  const openapi = await app.container.make('openapi')
  const document = await openapi.buildDocument()

  return `${JSON.stringify(document, null, 2)}\n`
}

/**
 * Una diferencia concreta entre los dos documentos, con su ruta dentro del JSON.
 *
 * Las tres se nombran **desde el fichero versionado**, que es lo que hay que
 * corregir: `falta` es algo que la API expone y el fichero no lo recoge, y
 * `sobra` es lo contrario. Nombrarlas «añadido» y «eliminado» obligaría a
 * recordar cuál de los dos documentos es el que se añade a cuál.
 */
export type DocumentDifference = {
  path: string
  kind: 'falta' | 'sobra' | 'difiere'
  versioned?: string
  regenerated?: string
}

/**
 * Compara los dos documentos y devuelve las diferencias, cada una con la ruta
 * exacta dentro del JSON —`paths./api/v1/tasks.get.responses.422`—.
 *
 * Se compara la estructura y no el texto porque un diff de líneas sobre un JSON
 * de mil líneas señala el sitio pero no dice qué ha cambiado del contrato.
 */
export function diffDocuments(versioned: unknown, regenerated: unknown): DocumentDifference[] {
  const differences: DocumentDifference[] = []

  const walk = (a: unknown, b: unknown, path: string) => {
    if (Object.is(a, b)) return

    const bothObjects = isPlainObject(a) && isPlainObject(b)
    const bothArrays = Array.isArray(a) && Array.isArray(b)

    if (!bothObjects && !bothArrays) {
      differences.push({ path, kind: 'difiere', versioned: preview(a), regenerated: preview(b) })
      return
    }

    const keys = bothArrays
      ? [...new Set([...(a as unknown[]).keys(), ...(b as unknown[]).keys()])].map(String)
      : [...new Set([...Object.keys(a as object), ...Object.keys(b as object)])]

    for (const key of keys) {
      const childPath = path === '' ? key : `${path}.${key}`
      const inA = hasKey(a, key)
      const inB = hasKey(b, key)

      if (!inA) {
        differences.push({ path: childPath, kind: 'falta', regenerated: preview(read(b, key)) })
      } else if (!inB) {
        differences.push({ path: childPath, kind: 'sobra', versioned: preview(read(a, key)) })
      } else {
        walk(read(a, key), read(b, key), childPath)
      }
    }
  }

  walk(versioned, regenerated, '')

  return differences
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return Number(key) < value.length

  return isPlainObject(value) && key in value
}

function read(value: unknown, key: string): unknown {
  return (value as Record<string, unknown>)[key]
}

/** Un valor recortado, para que una diferencia ocupe una línea y no una pantalla. */
function preview(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text === undefined) return 'undefined'

  return text.length > 120 ? `${text.slice(0, 117)}…` : text
}
