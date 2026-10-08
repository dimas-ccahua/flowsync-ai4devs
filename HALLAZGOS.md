# Hallazgos

## 1. Las filas que cambian y la rama

- Cambian 0 filas: lo medí con `COUNT(*)` sobre `users`, `tasks` y `auth_access_tokens` en desarrollo y pruebas; el cambio no transforma ni destruye datos y cae en la rama que se deshace mediante otra migración o reconfiguración, sin recuperar una copia de seguridad.

## 2. Lo que la batería de pruebas no podía ver

- La batería pasó en verde porque ningún test cubre dueDate ni isOverdue; PostgreSQL entrega due_date mediante el driver pg como un objeto Date y Task.isOverdueOn lo compara con referenceDay, que es texto AAAA-MM-DD, haciendo que una tarea realmente vencida aparezca como no vencida.

## 3. Tu duda

- Dudé de si el schema TypeScript y el typecheck demostraban que el cambio de motor conservaba la semántica; no la conservan: schema.ts sigue declarando dueDate como string, pero en ejecución PostgreSQL devuelve un Date.
