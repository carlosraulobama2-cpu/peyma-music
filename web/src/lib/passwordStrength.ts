/**
 * Peyma Music — Fuerza de contraseña.
 *
 * Módulo aparte y sin dependencias de React para poder razonarlo (y
 * probarlo) sin montar un formulario.
 *
 * Por qué no una librería: zxcvbn mide mucho mejor, pero pesa ~800 KB con
 * sus diccionarios y esto se carga en la pantalla de registro, que es
 * justo donde un bundle lento cuesta altas. Lo que sí importa es no
 * mentir: el medidor no premia "Contraseña1!" por tener mayúscula, número
 * y símbolo — penaliza explícitamente los patrones que hacen que una
 * contraseña parezca fuerte y no lo sea.
 *
 * La regla que el backend exige de verdad son 8 caracteres
 * (`registerSchema`). Todo lo demás es consejo, no bloqueo: negarle la
 * cuenta a alguien porque su contraseña larga y aleatoria no lleva un
 * símbolo es la clase de norma que empuja a usar "Password1!".
 */

export const MIN_PASSWORD_LENGTH = 8;

export type StrengthLevel = 'muy-debil' | 'debil' | 'aceptable' | 'fuerte' | 'excelente';

export interface PasswordRequirement {
  id: string;
  label: string;
  met: boolean;
  /** `true` si el backend la rechaza; el resto son recomendaciones. */
  required: boolean;
}

export interface PasswordStrength {
  /** 0–4. Alimenta el número de segmentos encendidos de la barra. */
  score: 0 | 1 | 2 | 3 | 4;
  level: StrengthLevel;
  label: string;
  requirements: PasswordRequirement[];
  /** El consejo más útil ahora mismo, o null si ya está bien. */
  hint: string | null;
}

/**
 * Contraseñas que aparecen en cualquier lista de filtrados. No es un
 * diccionario serio — para eso haría falta el peso que se quiso evitar —
 * pero corta las que se escriben sin pensar.
 */
const COMUNES = new Set([
  '12345678', '123456789', '1234567890', 'password', 'contrasena', 'contraseña',
  'qwertyui', 'qwerty123', 'iloveyou', 'admin123', 'welcome1', 'abc12345',
  'password1', 'password123', 'letmein1', 'football', 'baseball', 'princess',
  'peymamusic', 'peyma123',
]);

/** ¿Tiene 3 o más caracteres idénticos seguidos ("aaa", "111")? */
function tieneRepeticiones(valor: string): boolean {
  return /(.)\1{2,}/.test(valor);
}

/** ¿Tiene una secuencia de 4 o más ("abcd", "1234", "qwer")? */
function tieneSecuencia(valor: string): boolean {
  const minus = valor.toLowerCase();
  const alfabetos = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiop', 'asdfghjkl'];

  for (let i = 0; i + 3 < minus.length; i++) {
    const trozo = minus.slice(i, i + 4);
    const alReves = [...trozo].reverse().join('');
    if (alfabetos.some((alfabeto) => alfabeto.includes(trozo) || alfabeto.includes(alReves))) return true;
  }
  return false;
}

export function evaluatePassword(password: string, contexto: { email?: string; displayName?: string } = {}): PasswordStrength {
  const longitud = password.length;

  const requirements: PasswordRequirement[] = [
    { id: 'length', label: `Al menos ${MIN_PASSWORD_LENGTH} caracteres`, met: longitud >= MIN_PASSWORD_LENGTH, required: true },
    { id: 'long', label: '12 o más — es lo que más cuesta de adivinar', met: longitud >= 12, required: false },
    { id: 'variety', label: 'Mezcla letras con números o símbolos', met: /[a-zá-úñ]/i.test(password) && /[^a-zá-úñ]/i.test(password), required: false },
    { id: 'notcommon', label: 'No es una contraseña de las típicas', met: !COMUNES.has(password.toLowerCase()), required: false },
  ];

  if (longitud === 0) {
    return { score: 0, level: 'muy-debil', label: 'Sin contraseña', requirements, hint: null };
  }

  let puntos = 0;
  if (longitud >= MIN_PASSWORD_LENGTH) puntos += 1;
  if (longitud >= 12) puntos += 1;
  if (longitud >= 16) puntos += 1;

  const clases = [/[a-zá-úñ]/, /[A-ZÁ-ÚÑ]/, /\d/, /[^\dA-Za-zÁ-Úá-úÑñ]/].filter((re) => re.test(password)).length;
  if (clases >= 2) puntos += 1;
  if (clases >= 3) puntos += 1;

  // Penalizaciones. Van después de sumar para que puedan tumbar una
  // contraseña que "cumple" todas las casillas pero es adivinable.
  const minus = password.toLowerCase();
  let motivo: string | null = null;

  if (COMUNES.has(minus)) {
    puntos = 0;
    motivo = 'Es una de las contraseñas más usadas del mundo. Está en la primera página de cualquier lista de ataque.';
  } else if (contexto.email && minus.includes(contexto.email.split('@')[0]!.toLowerCase()) && contexto.email.split('@')[0]!.length >= 3) {
    puntos = Math.min(puntos, 1);
    motivo = 'Contiene tu correo. Quien lo intente probará eso primero.';
  } else if (contexto.displayName && contexto.displayName.trim().length >= 3 && minus.includes(contexto.displayName.trim().toLowerCase())) {
    puntos = Math.min(puntos, 1);
    motivo = 'Contiene tu nombre, que es público en tu perfil.';
  } else if (tieneSecuencia(password)) {
    puntos = Math.min(puntos, 2);
    motivo = 'Tiene una secuencia como "1234" o "abcd". Suma longitud pero casi no suma dificultad.';
  } else if (tieneRepeticiones(password)) {
    puntos = Math.min(puntos, 2);
    motivo = 'Repite el mismo carácter tres veces o más.';
  }

  if (longitud < MIN_PASSWORD_LENGTH) {
    puntos = 0;
    motivo = `Te faltan ${MIN_PASSWORD_LENGTH - longitud} caracteres para el mínimo.`;
  } else if (!motivo && puntos <= 2) {
    motivo = 'Sumale largo: una frase de tres o cuatro palabras es más difícil de romper y más fácil de recordar.';
  }

  const score = Math.max(0, Math.min(4, puntos)) as 0 | 1 | 2 | 3 | 4;
  const niveles: Record<number, { level: StrengthLevel; label: string }> = {
    0: { level: 'muy-debil', label: 'Muy débil' },
    1: { level: 'debil', label: 'Débil' },
    2: { level: 'aceptable', label: 'Aceptable' },
    3: { level: 'fuerte', label: 'Fuerte' },
    4: { level: 'excelente', label: 'Excelente' },
  };

  return { score, ...niveles[score]!, requirements, hint: motivo };
}
