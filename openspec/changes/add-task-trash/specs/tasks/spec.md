## ADDED Requirements

### Requirement: Borrar una tarea la manda a la papelera

El sistema SHALL permitir a cualquier cuenta con sesión borrar cualquier tarea viva mediante `DELETE /api/v1/tasks/:id`, sea o no su responsable y sin permiso especial. Borrar SHALL mandar la tarea a la papelera, no destruirla: desaparece para todo el equipo y se puede restaurar. La respuesta SHALL ser `204` sin cuerpo.

#### Scenario: Borrar una tarea

- **WHEN** una cuenta con sesión borra una tarea viva
- **THEN** la respuesta es `204` y la tarea deja de aparecer en la lista

#### Scenario: Desaparece para todo el equipo

- **WHEN** una cuenta borra una tarea y otra cuenta pide después la lista
- **THEN** la tarea tampoco aparece en la lista de la segunda cuenta

#### Scenario: Se puede borrar una tarea ajena

- **WHEN** una cuenta borra una tarea cuyo responsable es otra cuenta
- **THEN** la respuesta es `204` y la tarea pasa a la papelera, sin que se pida ningún permiso

### Requirement: Consultar la papelera

El sistema SHALL listar las tareas de la papelera en `GET /api/v1/tasks/trash`, para cualquier cuenta con sesión, de la borrada más recientemente a la más antigua. Cada tarea SHALL llegar con su identificador, su título, su estado, su responsable —con la misma forma recortada que en la lista— y el instante en que se borró. La papelera SHALL contener solo tareas borradas.

#### Scenario: Lo borrado está en la papelera

- **WHEN** se borra una tarea y se consulta la papelera
- **THEN** la tarea está, con quién la llevaba y cuándo se borró

#### Scenario: Una tarea viva no está en la papelera

- **WHEN** se consulta la papelera sin haber borrado una tarea
- **THEN** esa tarea no aparece en ella

### Requirement: Restaurar una tarea de la papelera

El sistema SHALL devolver a la lista una tarea de la papelera mediante `POST /api/v1/tasks/:id/restore`, para cualquier cuenta con sesión, con su título, su estado, su responsable y su fecha de vencimiento intactos, y SHALL sacarla de la papelera. Restaurar algo que no está en la papelera —una tarea viva o que no existe— SHALL responder `404` sin cambiar nada.

#### Scenario: Restaurar la devuelve tal cual

- **WHEN** se borra una tarea con estado, responsable y fecha de vencimiento, y después se restaura
- **THEN** la respuesta es `200`, la tarea vuelve a la lista y, al abrirla, conserva el mismo título, estado, responsable y fecha que tenía antes de borrarla

#### Scenario: Desaparece de la papelera

- **WHEN** se restaura una tarea de la papelera
- **THEN** deja de aparecer en la papelera

#### Scenario: Restaurar algo que no está en la papelera

- **WHEN** se intenta restaurar una tarea viva o un identificador que no existe
- **THEN** la respuesta es `404` y nada cambia

### Requirement: Lo que está en la papelera no sale por ningún otro camino

Una tarea en la papelera SHALL ser inalcanzable por cualquier camino distinto de la papelera y de su restauración: no SHALL aparecer en la lista por defecto ni acotando por ninguno de los tres estados, no SHALL poder abrirse por su identificador, y no SHALL poder cambiársele el estado ni la fecha de vencimiento. Para todos esos caminos el sistema SHALL responder como si la tarea no existiera.

#### Scenario: No aparece en la lista ni con ningún filtro

- **WHEN** una tarea está en la papelera y se pide la lista sin filtro y acotada por cada uno de los tres estados
- **THEN** no aparece en ninguna de las cuatro respuestas

#### Scenario: No se puede abrir por su identificador

- **WHEN** una tarea está en la papelera y se pide `GET /api/v1/tasks/:id`
- **THEN** la respuesta es `404`

#### Scenario: No se le puede cambiar el estado

- **WHEN** una tarea está en la papelera y se intenta cambiar su estado
- **THEN** la respuesta es `404` y, al restaurarla, conserva el estado que tenía

#### Scenario: No se le puede cambiar la fecha

- **WHEN** una tarea está en la papelera y se intenta fijar o retirar su fecha de vencimiento
- **THEN** la respuesta es `404` y, al restaurarla, conserva la fecha que tenía

### Requirement: Borrar no es marcar como hecha

Marcar una tarea como `done` y borrarla SHALL ser caminos distintos: una tarea hecha sale de la lista por defecto pero sigue alcanzable acotando por `done` y abriéndola, y no está en la papelera.

#### Scenario: Una tarea hecha sigue consultable y fuera de la papelera

- **WHEN** se marca una tarea como `done`
- **THEN** no aparece en la lista por defecto, aparece acotando por `done`, se puede abrir por su identificador y no aparece en la papelera

### Requirement: Borrar dos veces no es un fallo del sistema

Intentar borrar una tarea que ya está en la papelera, o que no existe, SHALL responder `404` diciendo que no existe, y no un error del servidor. La tarea que ya estaba en la papelera SHALL seguir en ella sin cambios.

#### Scenario: Otra persona ya la había borrado

- **WHEN** una cuenta borra una tarea y otra cuenta intenta borrarla después
- **THEN** la segunda recibe `404`, y la tarea sigue en la papelera con el instante del primer borrado

## MODIFIED Requirements

### Requirement: Las tareas exigen sesión

El sistema SHALL exigir un token de acceso válido para listar, crear, cambiar el estado, borrar y restaurar tareas, y para consultar la papelera, respondiendo `401` cuando falte o no sea válido, sin devolver ninguna tarea ni ejecutar la operación.

#### Scenario: Listar sin haber entrado

- **WHEN** se solicita `GET /api/v1/tasks` sin cabecera `Authorization`
- **THEN** la respuesta es `401` y no se devuelve ninguna tarea

#### Scenario: Escribir sin haber entrado

- **WHEN** se intenta crear una tarea o cambiar un estado sin token válido
- **THEN** la respuesta es `401` y nada cambia en el espacio

#### Scenario: Borrar sin haber entrado

- **WHEN** se intenta borrar una tarea sin token válido
- **THEN** la respuesta es `401` y la tarea sigue en la lista, fuera de la papelera

#### Scenario: La papelera y la restauración exigen sesión

- **WHEN** se consulta la papelera o se intenta restaurar una tarea sin token válido
- **THEN** la respuesta es `401`, no se devuelve ninguna tarea y la tarea sigue en la papelera

#### Scenario: Ver la lista no pide nada más que la sesión

- **WHEN** cualquier cuenta registrada solicita la lista
- **THEN** la recibe entera, sin contenido reservado a ningún rol ni permiso especial
