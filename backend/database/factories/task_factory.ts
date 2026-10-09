import factory from '@adonisjs/lucid/factories'
import Task, { type TaskStatus } from '#models/task'
import { DateTime } from 'luxon'
import { UserFactory } from '#database/factories/user_factory'

/**
 * Los títulos se componen de una acción y del trabajo sobre el que recae, para
 * que cada uno sea una frase que un compañero reconozca (RF-6, y la apuesta por
 * títulos reconocibles de la sección 4.4 del PRD).
 */
const ACCIONES = [
  'Revisar',
  'Corregir',
  'Documentar',
  'Rediseñar',
  'Probar',
  'Preparar',
  'Migrar',
  'Simplificar',
  'Medir',
  'Actualizar',
]

const TRABAJOS = [
  'el formulario de registro',
  'el flujo de inicio de sesión',
  'la página de precios',
  'el cobro con tarjeta',
  'las facturas de septiembre',
  'el correo de bienvenida',
  'la exportación a CSV',
  'el panel de suscripciones',
  'los textos de error del checkout',
  'la caché de la API de clientes',
  'el onboarding de cuentas nuevas',
  'la guía de estilo de la interfaz',
  'el proceso de copias de seguridad',
  'los permisos del bucket de adjuntos',
  'la búsqueda del centro de ayuda',
]

/**
 * Más pendientes que hechas, y menos en curso que ninguna: es la forma de una
 * lista viva, donde casi todo espera y cada persona lleva poco a la vez. Solo
 * salen los tres estados del dominio (RF-8): la columna es texto y por sí sola
 * aceptaría cualquiera.
 */
const ESTADOS: { value: TaskStatus; weight: number }[] = [
  { value: 'pending', weight: 45 },
  { value: 'in_progress', weight: 20 },
  { value: 'done', weight: 35 },
]

/** Hasta cuántos días atrás puede haberse creado una tarea. */
const VENTANA_DE_CREACION_EN_DIAS = 90

/**
 * Qué parte de las tareas lleva fecha de vencimiento. Una minoría: crear sin
 * fecha es el camino por defecto (RF-13), y que la mayoría la lleve es la señal
 * de que el campo se ha vuelto obligatorio de facto (S-3 del PRD).
 */
const PROBABILIDAD_DE_FECHA = 0.3

export const TaskFactory = factory
  .define(Task, async ({ faker }) => {
    /**
     * Las fechas se cuentan desde el momento en que corre la factory, nunca
     * desde un día fijo: los datos tienen que seguir cayendo en «este mes» el
     * día que se generen.
     */
    const ahora = DateTime.now()
    const createdAt = DateTime.fromJSDate(
      faker.date.between({
        from: ahora.minus({ days: VENTANA_DE_CREACION_EN_DIAS }).toJSDate(),
        to: ahora.toJSDate(),
      })
    )
    const updatedAt = DateTime.fromJSDate(
      faker.date.between({ from: createdAt.toJSDate(), to: ahora.toJSDate() })
    )

    /**
     * La fecha de vencimiento es un día del calendario en texto `AAAA-MM-DD`,
     * igual que la deja el controlador, nunca un instante. Cae entre el día de
     * creación y seis semanas después, así que unas quedan en el pasado y otras
     * en el futuro: vencidas, por vencer y hechas con la fecha ya pasada, que
     * son los casos que distingue la regla de vencimiento (RF-14). Una fecha ya
     * pasada es legítima (CA-13 de FS-118).
     */
    const dueDate = faker.datatype.boolean(PROBABILIDAD_DE_FECHA)
      ? createdAt.plus({ days: faker.number.int({ min: 1, max: 42 }) }).toFormat('yyyy-MM-dd')
      : null

    return {
      title: `${faker.helpers.arrayElement(ACCIONES)} ${faker.helpers.arrayElement(TRABAJOS)}`,
      status: faker.helpers.weightedArrayElement(ESTADOS),
      dueDate,
      createdAt,
      updatedAt,
    }
  })
  .relation('assignee', () => UserFactory)
  .build()
