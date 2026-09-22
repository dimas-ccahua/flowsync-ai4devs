# El revisor de CI

`.github/workflows/revisor.yml` lanza el revisor adversarial sobre cada PR:
aplica los criterios de `.claude/agents/adversarial-reviewer.md` y deja los
hallazgos como comentarios inline en el propio cambio.

Tal y como está commiteado **todavía no funciona**. Falta el secreto, que no
puede vivir en el repositorio.

## Pasos manuales pendientes

1. **Crear el secreto con la credencial.** Es el único paso imprescindible.
   Elige uno de los dos caminos de la sección siguiente y créalo en
   `Settings → Secrets and variables → Actions → New repository secret`. El
   nombre tiene que coincidir exactamente con el que espera el workflow.
2. **Llevar el workflow a `main`.** Mientras viva solo en una rama, se ejecuta
   en los PRs de esa rama, pero no queda como comprobación estándar del repo.
3. **Comprobar que Actions está habilitado** en `Settings → Actions → General`.
   El workflow declara sus propios `permissions`, así que no hace falta tocar
   los permisos por defecto del token.
4. **Abrir un PR de prueba** y mirar dos cosas: que aparece el comentario de
   seguimiento y que los hallazgos llegan como comentarios inline. Si el job
   muere en el primer turno, ve directo a «No son intercambiables».
5. *(Opcional)* Instalar la GitHub App de Claude (`/install-github-app` desde
   Claude Code). Sin ella los comentarios los publica `github-actions[bot]`;
   con ella, `claude[bot]`. Es cosmético, no cambia el funcionamiento.

## En qué se va el dinero

El revisor corre **en cada push a la rama de un PR**, no una vez por PR. Esa es
la variable que de verdad mueve la factura, más que el modelo.

**Qué modelo usa.** Sonnet, fijado en `claude_args` con `--model sonnet`, y con
`--effort medium`. Es el escalón barato que todavía razona sobre código de
verdad, y encaja con lo que hace este job: leer un diff acotado y contrastarlo
contra unas reglas escritas. Es además el mismo modelo que declara
`.claude/agents/adversarial-reviewer.md`, así que la revisión de CI y la de
local se parecen. El `--effort` gobierna cuánto razona antes de contestar:
subirlo da revisiones más finas y más caras.

**Los dos techos de gasto.** `--max-turns 40` corta la conversación del agente:
un turno es una respuesta del modelo, y cada llamada a herramienta que hace
consume uno. `timeout-minutes: 10` corta el reloj del job, que es lo que se
factura como minutos de GitHub Actions (gratis en repos públicos, de la cuota
de la organización en privados). Son cosas distintas: el primero limita lo que
pagas a Anthropic, el segundo lo que pagas a GitHub.

**Por qué la lista de herramientas también es dinero.** `Read`, `Grep` y `Glob`
están permitidas explícitamente. Sin ellas el revisor no puede abrir ni el
fichero de calibración ni un solo fichero del cambio: cada intento se le
deniega, y cada denegación le cuesta un turno de los 40. Una allowlist mal
puesta no es solo un revisor mudo, es un revisor caro.

**Cómo cambiarlo.** Todo está en el bloque `claude_args` del workflow:

- `--model opus` para revisiones más profundas en cambios delicados. Bastante
  más caro por PR.
- `--effort high` si el problema es que se queda en la superficie sin llegar a
  gastar los 40 turnos.
- `--max-turns` arriba o abajo según se quede corto o se dedique a pasear.
- `--max-budget-usd <n>` si prefieres un tope duro en dólares antes que en
  turnos.

**Precios.** No los escribo aquí a propósito: cambian, y una cifra desfasada en
un documento interno es peor que ninguna. Las páginas oficiales:

- Planes de suscripción: <https://claude.com/pricing>
- Precio por tokens de la API: <https://docs.claude.com/en/docs/about-claude/pricing>

## La credencial: dos caminos

Los dos sirven. **No son intercambiables**: cada uno entra por una entrada
distinta de la acción y se guarda con un nombre de secreto distinto.

### 1. Token de suscripción (el que usa el workflow)

Se genera en local, con la sesión de Claude Code que ya tienes:

```bash
claude setup-token
```

- **Secreto:** `CLAUDE_CODE_OAUTH_TOKEN`
- **Entrada de la acción:** `claude_code_oauth_token`
- **Contra qué se factura:** la cuota de tu plan de Claude. No consume créditos
  de API ni requiere tarjeta en la consola.

Es el camino por defecto porque no abre una segunda vía de gasto: si el plan ya
está pagado, el revisor entra dentro. La contrapartida es que el token va
atado a una persona; si esa persona rota su credencial o se va del equipo, el
revisor deja de funcionar.

### 2. Clave de API de la consola

Se crea en <https://console.anthropic.com/settings/keys>.

- **Secreto:** `ANTHROPIC_API_KEY`
- **Entrada de la acción:** `anthropic_api_key`
- **Contra qué se factura:** los créditos de API de la organización, por tokens
  consumidos.

Para usarlo hay que cambiar la línea del workflow:

```yaml
# en vez de claude_code_oauth_token:
anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

Tiene sentido cuando el revisor es de un equipo y no de una persona, o cuando
quieres el gasto separado y medible en la consola.

### No son intercambiables

Cruzarlos es el error más fácil de cometer y el más difícil de leer: meter el
token de `setup-token` en `anthropic_api_key`, o una clave `sk-ant-...` en
`claude_code_oauth_token`. **No falla al arrancar.** El job instala Claude
Code, arranca la sesión y se muere en la primera llamada a la API con un `401`
/ `authentication_error` que no menciona en ningún momento que hayas cruzado
las entradas. Si el revisor cae en el primer turno con un 401, comprueba esto
antes que ninguna otra cosa: nombre del secreto, entrada de la acción, y que el
valor sea el que corresponde a esa entrada. El mismo 401 sale si el token
caducó o se revocó; se regenera con el mismo comando.

## PRs desde un fork

GitHub **no expone los secretos del repositorio** a un workflow disparado por
`pull_request` desde un fork, y encima le da un `GITHUB_TOKEN` de solo lectura.
Es una protección deliberada: cualquiera puede abrir un PR contra un repo
público, y ese PR trae código y texto que el atacante controla.

Consecuencia directa: **en un PR desde un fork el revisor no puede
autenticarse ni comentar**. Por eso el job lleva esta condición:

```yaml
if: github.event.pull_request.head.repo.full_name == github.repository
```

Con ella, un PR de fork aparece como *skipped* en vez de como un check rojo con
un 401 dentro. Los PRs desde ramas del propio repositorio se revisan con
normalidad. Si este repo lo forkean alumnos, sus PRs no se revisan solos.

Si algún día hiciera falta cubrirlos, las opciones ordenadas de más a menos
sensata:

1. Que un mantenedor reabra el cambio desde una rama del repositorio.
2. Un `workflow_dispatch` manual que un mantenedor lanza tras leer el diff.
3. `pull_request_target`, que sí recibe los secretos — y que es justo por donde
   se filtran. Ejecuta el workflow de la rama base con permisos de escritura
   mientras revisa contenido de un tercero: si además haces checkout del código
   del fork, le estás dando tus secretos a quien abrió el PR. Si se llega a
   usar, nunca con checkout de la cabeza del fork y nunca con más permisos que
   los estrictamente necesarios.
