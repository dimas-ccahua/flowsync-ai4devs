# Calibración de revisiones

Reglas para revisar código en este repo: el subagente `adversarial-reviewer` en
local y el job `.github/workflows/revisor.yml` en CI. Solo para revisar.

## Qué es grave aquí

Solo esto se reporta como hallazgo. Lo demás es sugerencia.

- Un scenario de `openspec/specs/**/spec.md` que la implementación no cumple.
  Si el código y la spec discrepan, el hallazgo es del código.
- Datos de una cuenta que salen donde no deben: un transformer que expone un
  campo que el requisito no lista, una tarea de otro usuario accesible.
- Una ruta que debería ir tras `.use(middleware.auth())` y no va.
- Un validador que acepta lo que la spec manda rechazar con 422 (el caso
  clásico aquí: `vine.string()` donde tocaba `vine.enum()`).
- Una respuesta que no pasa por `serialize()` + transformer.
- Una migración que no cuadra con lo que el modelo asume, o que pierde datos.
- Un test que escribe en la BD sin aislarse con `testUtils.db()`: la suite
  comparte fichero con el servidor de desarrollo y el estado se filtra.

## Qué no pasa de sugerencia

Nombres, orden de métodos, duplicación pequeña, comentarios, preferencias de
estructura, optimizaciones sin medición, y cualquier «estaría bien tener» que
ningún scenario exija.

**Máximo tres sugerencias por revisión**, las tres que más ahorrarían a quien
lea el código después. El resto no se enumera: una línea final del tipo «otras
6 sugerencias menores, ninguna bloqueante». Una lista de menudencias entierra
el hallazgo que sí importa.

## Dónde no se reporta

- `backend/.adonisjs/**` y `backend/database/schema.ts`: son generados.
- `docs/api/openapi.json` desincronizado: ya lo vigila `openapi:check` en CI.
- Formato y estilo: ya los vigilan Prettier, ESLint y oxlint.
- Tipos: ya los vigila `tsc --noEmit` (y `npm run build` en el frontend).
- `package-lock.json`, `node_modules/`, `openspec/changes/archive/**`.
- Deudas ya anotadas como **«Sin cumplir hoy»** en
  `docs/capabilities/<capability>/README.md`, salvo que el cambio las empeore.
- La falta de cobertura general de una capability: solo cuenta la que falta
  para el comportamiento que este cambio toca.

Si otra comprobación ya lo caza, callarse: repetirlo gasta turnos y resta
credibilidad al resto del informe.

## Evidencia, no deducción

Para afirmar que algo se comporta de una manera hay que citar el
`fichero:línea` donde se ha leído. No se deduce del nombre, de la firma ni del
comentario de encima: aquí hay un `listTasksValidator` cuyo comentario afirma
que rechaza estados inventados y cuyo código los deja pasar
(`backend/app/validators/task.ts:29-31`).

Lo que se sospecha pero no se ha leído va aparte y marcado como no confirmado.
Nunca mezclado con lo demostrado.
