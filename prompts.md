# Prompts

Aquí van **todos los prompts que lanzaste** para hacer el ejercicio, en el orden en que los
lanzaste, con el modelo y la herramienta de cada uno.

Esto no es papeleo. Lo que se revisa es **cómo pediste las cosas**, no solo lo que salió: un
resultado flojo con un prompt bueno y un resultado flojo con un prompt vago necesitan feedback
distinto, y sin este archivo no se distinguen.

## Cómo rellenarlo

- Un apartado `## Prompt N` por cada prompt.
- **Pega el prompt tal cual lo lanzaste**, dentro del bloque de código, aunque ocupe diez líneas
  y aunque tenga faltas. No lo reescribas para que quede bien: el que arreglaste mentalmente
  después no es el que lanzaste.
- Incluye también los que **no funcionaron**. Suelen ser los más útiles de leer.
- `Modelo` y `Herramienta` en todos. Si cambiaste de una a otra a mitad, se nota aquí.

Borra el ejemplo de abajo cuando escribas el primero.

---

## Prompt 1

**Modelo:** Opus 5.5 Medium
**Herramienta:** Claude Code

```
Migra este proyecto de SQLite a PostgreSQL ejecutado en Docker.

Antes de modificar archivos:

1. Lee CLAUDE.md y las instrucciones aplicables del repositorio.
2. Inspecciona el Makefile, los archivos de entorno, la configuración de base de datos, las migraciones existentes y la configuración de pruebas.
3. Ejecuta git status y no sobrescribas cambios previos del usuario.
4. Explica brevemente qué archivos necesitarás modificar.

Objetivo:

Dejar el proyecto funcionando con dos bases PostgreSQL independientes: una para desarrollo y otra para pruebas.

Restricciones obligatorias:

- El archivo de Docker Compose debe llamarse compose.yaml.
- Los servicios deben llamarse exactamente db y db-test.
- Ambos deben utilizar la imagen pgvector/pgvector:pg17.
- Desarrollo debe exponerse en el puerto 54410.
- Pruebas debe exponerse en el puerto 54411.
- La base de pruebas debe ser efímera y no debe tener volumen persistente.
- Los dos servicios deben tener healthcheck.
- Los comandos que dependan de las bases deben esperar hasta que sus servicios estén saludables.
- No utilices la clave version: en compose.yaml.
- La batería de pruebas debe apuntar exclusivamente a db-test mediante su propio archivo de entorno de pruebas, cargado automáticamente por el framework.
- Añade al Makefile comandos claros para:
  - levantar las bases;
  - detenerlas;
  - ejecutar las migraciones de desarrollo;
  - ejecutar las migraciones de pruebas;
  - migrar ambas bases;
  - ejecutar la batería de pruebas.
- No modifiques ninguna migración existente.
- No cambies todavía la lógica de negocio para acomodar diferencias de tipos.
- No ocultes errores de typecheck usando any, casts inseguros o desactivando comprobaciones.
- No hagas cambios fuera del alcance de esta migración.

Verificación obligatoria:

1. Valida la sintaxis de compose.yaml.
2. Levanta ambas bases desde cero.
3. Comprueba que ambas estén saludables.
4. Ejecuta las migraciones en ambas bases.
5. Ejecuta la batería completa de pruebas del backend.
6. Ejecuta npm run typecheck en backend, pero no corrijas automáticamente sus resultados: repórtalos.
7. Confirma mediante git diff que ninguna migración existente fue modificada.
8. Informa:
   - archivos modificados;
   - comandos ejecutados;
   - resultado de las pruebas;
   - resultado del typecheck;
   - cualquier diferencia observada entre SQLite y PostgreSQL.

No des por terminada la tarea únicamente porque los tests estén verdes.
```

**Qué salió:** (opcional, una línea) funcionó a la primera / tuve que insistir / me inventó una ruta que no existe.

## Prompt 2

**Modelo:** Opus 5.5 Medium
**Herramienta:** Claude Code

```
Corrige únicamente HALLAZGOS.md y prompts.md con la evidencia de la regresión silenciosa encontrada después de migrar de SQLite a PostgreSQL.

No corrijas la implementación ni modifiques código de producción, pruebas, configuración, migraciones o compose.yaml. El objetivo del ejercicio es documentar el fallo descubierto, no resolverlo.

En HALLAZGOS.md conserva el punto 1 actual y sustituye solamente los puntos 2 y 3 por una sola línea cada uno:

Punto 2:
La batería pasó en verde porque ningún test cubre dueDate ni isOverdue; PostgreSQL entrega due_date mediante el driver pg como un objeto Date y Task.isOverdueOn lo compara con referenceDay, que es texto AAAA-MM-DD, haciendo que una tarea realmente vencida aparezca como no vencida.

Punto 3:
Dudé de si el schema TypeScript y el typecheck demostraban que el cambio de motor conservaba la semántica; no la conservan: schema.ts sigue declarando dueDate como string, pero en ejecución PostgreSQL devuelve un Date.

Añade además este prompt completo como Prompt 2 en prompts.md, indicando:
Modelo: Opus 5.5 Medium
Herramienta: Claude Code

No hagas commit. Al terminar, muestra git diff --check y git status -sb.
```
