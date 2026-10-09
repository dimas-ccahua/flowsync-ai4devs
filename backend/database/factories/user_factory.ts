import factory from '@adonisjs/lucid/factories'
import User from '#models/user'

/**
 * La contraseña con la que entra toda persona de los datos de desarrollo. Cumple
 * por sí sola la regla del registro (entre 8 y 32 caracteres), y se guarda en
 * claro aquí porque el mixin de autenticación del modelo la hashea al guardar.
 */
export const DEMO_PASSWORD = 'flowsync-demo'

/**
 * El dominio de todos los correos inventados. Es un dominio reservado: nunca
 * puede pertenecer a nadie, así que ningún dato de desarrollo puede confundirse
 * con el de una persona real.
 */
export const DEMO_EMAIL_DOMAIN = 'flowsync.example'

const NOMBRES = [
  'Lucía',
  'Mateo',
  'Carmen',
  'Hugo',
  'Elena',
  'Pablo',
  'Marta',
  'Álvaro',
  'Nuria',
  'Diego',
  'Irene',
  'Javier',
  'Rocío',
  'Sergio',
  'Alba',
  'Andrés',
]

const APELLIDOS = [
  'García',
  'Martín',
  'Sánchez',
  'Romero',
  'Navarro',
  'Domínguez',
  'Gil',
  'Ortega',
  'Molina',
  'Delgado',
  'Castro',
  'Rubio',
  'Iglesias',
  'Herrero',
  'Vidal',
  'Peña',
]

/**
 * La parte local del correo, sin tildes ni mayúsculas: `Álvaro Domínguez` da
 * `alvaro.dominguez`.
 */
const toEmailLocalPart = (...words: string[]) =>
  words
    .map((word) =>
      word
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
    )
    .join('.')

/**
 * El correo es único en la base, y dos personas inventadas pueden salir con el
 * mismo nombre y apellido. El número de secuencia hace que la factory no choque
 * nunca consigo misma dentro de un mismo proceso.
 */
let sequence = 0

export const UserFactory = factory
  .define(User, async ({ faker }) => {
    sequence += 1

    const nombre = faker.helpers.arrayElement(NOMBRES)
    const apellido = faker.helpers.arrayElement(APELLIDOS)

    return {
      /**
       * Siempre nombre y apellido, aunque la columna admita `null`: el registro
       * pide nombre (RF-1), la lista enseña al responsable por su nombre (RF-17)
       * y las iniciales del perfil salen de esas dos palabras.
       */
      fullName: `${nombre} ${apellido}`,
      email: `${toEmailLocalPart(nombre, apellido)}.${sequence}@${DEMO_EMAIL_DOMAIN}`,
      password: DEMO_PASSWORD,
    }
  })
  .build()
