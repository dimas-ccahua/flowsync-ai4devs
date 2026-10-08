# Hallazgos

## 1. Las filas que cambian y la rama

- Cambian 0 filas: lo medí con `COUNT(*)` sobre `users`, `tasks` y `auth_access_tokens` en desarrollo y pruebas; el cambio no transforma ni destruye datos y cae en la rama que se deshace mediante otra migración o reconfiguración, sin recuperar una copia de seguridad.

## 2. Lo que la batería de pruebas no podía ver

- La batería pasó en verde, pero no demostraba que `due_date` fuera un `date` nativo en ambas bases; lo comprobé consultando `information_schema.columns` en `flowsync_dev` y `flowsync_test`.

## 3. Tu duda

- Dudé de si cambiar SQLite por PostgreSQL alteraría la lógica de vencimiento; comprobé que `schema.ts` no cambió, PostgreSQL conserva `due_date` como `date` y las pruebas siguen pasando con la comparación de fechas `AAAA-MM-DD`.
