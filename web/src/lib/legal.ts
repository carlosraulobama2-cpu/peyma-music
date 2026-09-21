/**
 * Peyma Music (web) — Textos legales (COPIA).
 *
 * La fuente es `src/legal.ts`, en la raíz del repositorio. Este archivo es
 * una copia literal de su contenido. `web/src/lib/legal.ts` es una copia literal de
 * su contenido, porque la app y la web son proyectos npm distintos y ninguno
 * puede importar módulos del otro. Para que no se separen en silencio hay un
 * test (`src/legal.test.ts`) que compara los dos y falla si divergen: al
 * tocar uno hay que tocar el otro.
 *
 * `TERMS_VERSION` acompaña a `CURRENT_TERMS_VERSION` de `backend/src/legal.ts`.
 * Aquí es sólo para MOSTRARLA; la que se guarda con cada cuenta la estampa
 * el servidor, que es el único que no se puede manipular desde fuera. Al
 * revisar los textos hay que subir las tres.
 *
 * AVISO: estos textos describen con precisión lo que el sistema hace de
 * verdad, pero no son un dictamen jurídico. Antes de abrir el servicio al
 * público tienen que pasar por un abogado, y hay que rellenar los datos
 * marcados con [CORCHETES]: sin razón social, domicilio y correo de contacto
 * reales, una política de privacidad no cumple el RGPD.
 */
export const TERMS_VERSION = '2026-09-22';

/** Para "Actualizado el …" bajo el título. */
export const TERMS_UPDATED_LABEL = '22 de septiembre de 2026';

/**
 * Datos del titular del servicio.
 *
 * Están aparte y no incrustados en los párrafos porque aparecen en los dos
 * documentos: escribirlos dos veces garantiza que un día uno quede
 * desactualizado. Rellenalos antes de publicar.
 */
export const OPERATOR = {
  legalName: '[RAZÓN SOCIAL]',
  taxId: '[CIF/NIF]',
  address: '[DOMICILIO SOCIAL]',
  email: '[CORREO DE CONTACTO]',
  jurisdiction: '[PAÍS / TRIBUNALES COMPETENTES]',
} as const;

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  slug: 'terminos' | 'privacidad';
  title: string;
  /** Una frase para la cabecera de la página y para el enlace. */
  summary: string;
  sections: LegalSection[];
}

export const TERMS: LegalDocument = {
  slug: 'terminos',
  title: 'Términos de servicio',
  summary: 'Las reglas de uso de Peyma Music: qué podés hacer, qué no, y qué pasa con la música que subís.',
  sections: [
    {
      heading: 'Quién presta el servicio',
      paragraphs: [
        `Peyma Music lo opera ${OPERATOR.legalName}, con ${OPERATOR.taxId} y domicilio en ${OPERATOR.address}. Para cualquier cuestión sobre estos términos podés escribir a ${OPERATOR.email}.`,
        'Al crear una cuenta aceptás estos términos y la política de privacidad. Si no estás de acuerdo con alguno, no uses el servicio.',
      ],
    },
    {
      heading: 'Qué es Peyma Music',
      paragraphs: [
        'Peyma Music es una plataforma de streaming de música independiente. Cualquiera puede escuchar gratis y crear playlists, y quien haga música puede publicarla sin pasar por un sello ni una distribuidora.',
        'Para usar el servicio hace falta una cuenta. Sos responsable de mantener tu contraseña en secreto y de lo que se haga desde tu cuenta. Si creés que alguien accedió a ella, avisanos.',
      ],
    },
    {
      heading: 'Edad mínima',
      paragraphs: [
        'Hay que tener al menos 14 años para abrir una cuenta. Si sos menor de edad, necesitás el permiso de quien ejerza tu tutela.',
        'Si detectamos una cuenta de alguien por debajo de esa edad, la cerramos y borramos sus datos.',
      ],
    },
    {
      heading: 'La música que subís',
      paragraphs: [
        'Al subir una grabación declarás que tenés los derechos necesarios para publicarla, o permiso de quien los tiene. Eso incluye tanto la grabación como la composición.',
        'Seguís siendo el titular: publicar en Peyma no nos cede la propiedad de tu obra. Nos das permiso para almacenarla, transcodificarla a distintas calidades y reproducirla dentro de la plataforma, que es lo mínimo que hace falta para que suene. Ese permiso termina cuando retirás la canción.',
        'Toda subida pasa por revisión antes de ser pública. Podemos rechazar o retirar contenido que infrinja derechos de terceros, o que no cumpla estas reglas.',
      ],
    },
    {
      heading: 'Reclamaciones por derechos de autor',
      paragraphs: [
        `Si creés que una canción publicada infringe tus derechos, podés denunciarla desde la propia canción en la app o la web, o escribir a ${OPERATOR.email} indicando qué obra es, qué derechos tenés y cómo contactarte.`,
        'Revisamos cada reclamación. Si procede, retiramos la canción del catálogo: deja de sonar y desaparece de las búsquedas. Quien la subió recibe un aviso explicando el motivo y quién reclamó, para que pueda responder.',
        'La retirada es reversible. Si la reclamación resulta infundada, la canción vuelve. Cerramos las cuentas que acumulen infracciones repetidas.',
      ],
    },
    {
      heading: 'Uso aceptable',
      paragraphs: [
        'No se permite subir obras de otras personas sin autorización, contenido que incite al odio o a la violencia, ni metadatos falsos para aparentar ser otro artista.',
        'Tampoco se permite manipular las reproducciones de forma artificial, ni usar medios automatizados para descargar el catálogo.',
        'Cualquier persona puede denunciar una canción desde la app o la web. Las denuncias las revisa una persona, no un sistema automático.',
      ],
    },
    {
      heading: 'Precio y suscripciones',
      paragraphs: [
        'Hoy el servicio es gratuito y no cobramos nada por escuchar ni por publicar.',
        'La plataforma está preparada para ofrecer en el futuro calidades de audio superiores mediante suscripción. Si llega a activarse, el precio y las condiciones se comunicarán antes y nunca se cobrará sin una contratación expresa.',
      ],
    },
    {
      heading: 'Disponibilidad del servicio',
      paragraphs: [
        'Hacemos lo razonable para que el servicio esté disponible, pero no garantizamos que funcione sin interrupciones. Puede haber paradas por mantenimiento, y avisamos dentro de la app cuando ocurren.',
        'No respondemos por la pérdida de contenido que subas: guardá siempre una copia de tus grabaciones originales.',
      ],
    },
    {
      heading: 'Suspensión y cierre',
      paragraphs: [
        'Podemos suspender o cerrar una cuenta que incumpla estas reglas de forma grave o reiterada. Cuando sea posible avisaremos antes y explicaremos el motivo.',
        'Podés cerrar tu cuenta cuando quieras desde tu perfil. Al hacerlo se borran tus datos personales según se describe en la política de privacidad.',
      ],
    },
    {
      heading: 'Cambios en estos términos',
      paragraphs: [
        'Si cambiamos algo relevante te lo diremos dentro de la app o de la web y te pediremos que lo aceptes de nuevo antes de seguir usando el servicio. Guardamos qué versión aceptaste y cuándo.',
      ],
    },
    {
      heading: 'Ley aplicable',
      paragraphs: [
        `Estos términos se rigen por la legislación de ${OPERATOR.jurisdiction}, y cualquier conflicto se somete a sus tribunales, sin perjuicio de los derechos que te correspondan como consumidor.`,
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  slug: 'privacidad',
  title: 'Política de privacidad',
  summary: 'Qué datos guardamos, para qué, con quién se comparten y cómo los borrás.',
  sections: [
    {
      heading: 'Quién trata tus datos',
      paragraphs: [
        `El responsable es ${OPERATOR.legalName}, ${OPERATOR.taxId}, con domicilio en ${OPERATOR.address}. Para cualquier cuestión sobre tus datos, incluido ejercer tus derechos, escribí a ${OPERATOR.email}.`,
      ],
    },
    {
      heading: 'Qué guardamos',
      paragraphs: [
        'De tu cuenta: correo electrónico, nombre visible, foto si ponés una, y la contraseña cifrada (nunca en texto plano). Si entrás con Google guardamos además el identificador que nos da Google, no tu contraseña de Google.',
        'De tu uso: qué escuchaste y cuándo, cuántos segundos de cada canción, tus playlists, tus me gusta, los artistas que seguís y lo que buscaste. Con eso funcionan tu biblioteca, las recomendaciones y los contadores de reproducciones de los artistas.',
        'Técnicos: dirección IP y tipo de dispositivo, para seguridad y para frenar abusos como los intentos masivos de inicio de sesión.',
        'En tu propio dispositivo guardamos la sesión y algunas preferencias (tema, calidad de audio, última reproducción). Eso no sale de tu teléfono o navegador salvo lo que se describe aquí.',
      ],
    },
    {
      heading: 'Por qué podemos tratarlos',
      paragraphs: [
        'Para prestarte el servicio que pediste al crear la cuenta: sin correo, contraseña y biblioteca no hay plataforma. Esa es la base contractual.',
        'Por interés legítimo en que el servicio sea seguro y funcione: los datos técnicos y los límites contra abusos.',
        'Por tu consentimiento, y sólo con él, la ubicación aproximada. Podés retirarlo cuando quieras.',
      ],
    },
    {
      heading: 'Tu ubicación es opcional',
      paragraphs: [
        'El mapa de "dónde se escucha" sólo usa datos de quien dio permiso explícito. Si lo das, la coordenada se redondea antes de guardarse, a una precisión de unos 11 kilómetros: sirve para pintar una zona, no para ubicar a nadie.',
        'Podés retirar el permiso cuando quieras desde tu perfil. A partir de ahí el servidor descarta cualquier coordenada que llegue de tu dispositivo y borramos el historial de ubicaciones que hubiéramos guardado.',
      ],
    },
    {
      heading: 'Con quién se comparte',
      paragraphs: [
        'No vendemos tus datos ni los cedemos con fines publicitarios.',
        'Los artistas ven estadísticas agregadas de su propia música: cuánta gente los escuchó y desde qué zonas. Nunca ven quién sos ni qué escuchaste vos en concreto.',
        'Usamos proveedores que tratan datos por cuenta nuestra y no pueden usarlos para otra cosa: Neon (base de datos), Cloudflare R2 (archivos de audio e imágenes) y Google (sólo si elegís entrar con tu cuenta de Google). Los archivos se alojan en la Unión Europea.',
      ],
    },
    {
      heading: 'Cuánto tiempo',
      paragraphs: [
        'Mientras tengas la cuenta abierta. Al cerrarla borramos tus datos personales; lo que quede para las estadísticas del catálogo va sin nada que te identifique.',
        'Los registros técnicos de seguridad se conservan un plazo breve y después se eliminan.',
      ],
    },
    {
      heading: 'Tus derechos',
      paragraphs: [
        'Podés acceder a tus datos, corregirlos, llevártelos, limitar su tratamiento, oponerte a él o pedir que los borremos. Desde tu perfil podés editar tu información, retirar el permiso de ubicación y cerrar la cuenta.',
        `Para lo demás escribinos a ${OPERATOR.email} y respondemos. Si creés que no atendimos bien tu solicitud, podés reclamar ante la autoridad de protección de datos que te corresponda.`,
      ],
    },
    {
      heading: 'Cambios en esta política',
      paragraphs: [
        'Si cambiamos algo relevante te lo diremos dentro de la app o de la web antes de que entre en vigor. La fecha de la última revisión aparece al principio de esta página.',
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<string, LegalDocument> = {
  [TERMS.slug]: TERMS,
  [PRIVACY.slug]: PRIVACY,
};
