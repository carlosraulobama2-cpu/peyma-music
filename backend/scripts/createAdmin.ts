/**
 * Peyma Music — Alta de una cuenta de administrador
 *
 *   npm run admin:create -- --email=tu@correo.com --name="Tu Nombre"
 *   npm run admin:create -- --email=tu@correo.com --password=unaclavelarga
 *
 * Existe porque no había NINGUNA forma de entrar al panel. El seed sólo
 * crea un oyente (`demo@peyma.music`), el registro público siempre da el rol
 * `USER`, y el panel rechaza cualquier cuenta que no sea `ADMIN` — tanto en
 * el login como en el guardia de rutas. Sin esto, la única salida era
 * editar la fila a mano con Prisma Studio o un UPDATE suelto en Postgres,
 * que es justo el tipo de paso que nadie documenta y todos repiten mal.
 *
 * Es idempotente a propósito: si el correo ya existe lo asciende a ADMIN en
 * vez de fallar con "clave duplicada". Volver a correrlo para recuperar el
 * acceso perdido es el caso de uso más común, no un error del usuario.
 *
 * La contraseña no se pide por argumento si se puede evitar: lo que se
 * escribe en la línea de comandos queda en el historial del shell y en la
 * lista de procesos de la máquina. Sin `--password`, se pregunta con el eco
 * apagado.
 */
import 'dotenv/config';
import { createInterface } from 'node:readline';
import { prisma } from '../src/prismaClient';
import { hashPassword } from '../src/utils/auth';

/** Mismo mínimo que `registerSchema`: si acá fuera más laxo, el panel
 *  aceptaría una clave que el registro público rechaza. */
const MIN_PASSWORD = 8;
/** bcrypt trunca en 72 bytes; el esquema de registro ya lo topa ahí. */
const MAX_PASSWORD = 72;

function ok(mensaje: string): void {
  console.log(`  ✓ ${mensaje}`);
}

function fallo(mensaje: string, detalle?: unknown): never {
  console.error(`  ✗ ${mensaje}`);
  if (detalle) console.error(`    ${detalle instanceof Error ? detalle.message : String(detalle)}`);
  process.exit(1);
}

/** Lee `--clave=valor` y `--clave valor`, que es como la gente lo escribe. */
function leerArgumentos(argv: string[]): Map<string, string> {
  const valores = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const actual = argv[i];
    if (!actual?.startsWith('--')) continue;

    const igual = actual.indexOf('=');
    if (igual !== -1) {
      valores.set(actual.slice(2, igual), actual.slice(igual + 1));
      continue;
    }

    const siguiente = argv[i + 1];
    // Un flag seguido de otro flag no tiene valor; no consumir el siguiente
    // evita que `--force --email x` se lea como email="--email".
    if (siguiente && !siguiente.startsWith('--')) {
      valores.set(actual.slice(2), siguiente);
      i++;
    } else {
      valores.set(actual.slice(2), 'true');
    }
  }
  return valores;
}

/**
 * Pregunta una contraseña sin mostrarla.
 *
 * `readline` no trae modo oculto: se sustituye su escritor interno para que,
 * mientras dure la pregunta, imprima la etiqueta y descarte cada tecla. Si
 * no hay terminal interactiva (un pipe, CI) no hay nada que ocultar ni a
 * quién preguntar, así que se aborta pidiendo `--password` en vez de
 * quedarse esperando una entrada que nunca va a llegar.
 */
function preguntarContrasena(etiqueta: string): Promise<string> {
  if (!process.stdin.isTTY) {
    fallo('No hay terminal interactiva. Pasá la contraseña con --password=…');
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const interno = rl as unknown as { _writeToOutput?: (texto: string) => void };
  const escribirOriginal = interno._writeToOutput?.bind(rl);

  interno._writeToOutput = (texto: string) => {
    escribirOriginal?.(texto.includes(etiqueta) ? etiqueta : '');
  };

  return new Promise((resolve) => {
    rl.question(etiqueta, (respuesta) => {
      interno._writeToOutput = escribirOriginal;
      process.stdout.write('\n');
      rl.close();
      resolve(respuesta);
    });
  });
}

async function main(): Promise<void> {
  const args = leerArgumentos(process.argv.slice(2));

  if (args.has('help') || args.has('h')) {
    console.log(`
Crea o asciende una cuenta de administrador del panel.

  npm run admin:create -- --email=tu@correo.com --name="Tu Nombre"

Opciones:
  --email     Correo de la cuenta. Obligatorio.
  --name      Nombre visible. Sólo se usa al crear una cuenta nueva.
  --password  Contraseña. Si se omite, se pregunta sin mostrarla (recomendado:
              lo que se escribe en la línea de comandos queda en el historial).
  --reset     Al ascender una cuenta que ya existe, también cambia su
              contraseña. Sin este flag, la contraseña actual se respeta.
`);
    return;
  }

  const email = (args.get('email') ?? '').trim().toLowerCase();
  if (!email) fallo('Falta --email. Usá --help para ver los argumentos.');
  // Validación deliberadamente mínima: el correo no se envía a ningún lado,
  // sólo identifica la fila. Rechazar direcciones válidas y raras con una
  // expresión regular casera sería peor que dejarlas pasar.
  if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
    fallo(`"${email}" no parece un correo electrónico.`);
  }

  const existente = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, displayName: true, role: true, passwordHash: true },
  });

  const debeFijarContrasena = !existente || args.has('reset') || existente.passwordHash === null;

  let passwordHash: string | undefined;
  if (debeFijarContrasena) {
    let password = args.get('password');
    if (!password) {
      // Sin `--reset` explícito, una cuenta de Google no tiene contraseña y
      // el panel no admite Google: hay que ponerle una o no podrá entrar.
      if (existente && existente.passwordHash === null) {
        console.log('  · Esa cuenta inicia sesión con Google y el panel pide contraseña. Definí una:');
      }
      password = await preguntarContrasena('  Contraseña: ');
      const repetida = await preguntarContrasena('  Repetila:   ');
      if (password !== repetida) fallo('Las contraseñas no coinciden.');
    }

    if (password.length < MIN_PASSWORD) fallo(`La contraseña necesita al menos ${MIN_PASSWORD} caracteres.`);
    if (Buffer.byteLength(password) > MAX_PASSWORD) fallo(`La contraseña no puede pasar de ${MAX_PASSWORD} bytes.`);

    passwordHash = await hashPassword(password);
  }

  if (existente) {
    const usuario = await prisma.user.update({
      where: { id: existente.id },
      data: { role: 'ADMIN', ...(passwordHash ? { passwordHash } : {}) },
      select: { email: true, displayName: true, role: true },
    });

    if (existente.role === 'ADMIN') ok(`${usuario.email} ya era administrador.`);
    else ok(`${usuario.email} pasó de ${existente.role} a ADMIN.`);
    if (passwordHash) ok('Contraseña actualizada.');
  } else {
    const nombre = (args.get('name') ?? '').trim() || email.split('@')[0]!;
    if (nombre.length < 2) fallo('El nombre necesita al menos 2 caracteres.');

    const usuario = await prisma.user.create({
      data: { email, displayName: nombre, passwordHash: passwordHash!, role: 'ADMIN' },
      select: { email: true, displayName: true },
    });
    ok(`Cuenta creada: ${usuario.email} (${usuario.displayName}) con rol ADMIN.`);
  }

  console.log('\n  Ya podés entrar al panel con ese correo y contraseña.\n');
}

main()
  .catch((error) => fallo('No se pudo completar la operación.', error))
  .finally(() => void prisma.$disconnect());
