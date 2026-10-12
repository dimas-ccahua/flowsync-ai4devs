// Imprime el hash de la contraseña de demostración `flowsync-demo` con el
// hasher por defecto de config/hash.ts, para que `make copia-produccion` se la
// ponga a todas las personas seudonimizadas sin copiar aquí la configuración.
// Se ejecuta desde backend/ con el mismo cargador de TypeScript que `ace.js`:
// `node --import=@poppinss/ts-exec database/hash_demo_password.ts`.
import hashConfig from '#config/hash'

const resolved = await hashConfig.resolver({} as never)
const hasher = resolved.list[resolved.default!]()

process.stdout.write(await hasher.make('flowsync-demo'))
