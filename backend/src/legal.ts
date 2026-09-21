/**
 * Peyma Music — Términos y privacidad: versión vigente.
 *
 * Una sola constante para toda la plataforma. La versión la estampa el
 * SERVIDOR al registrar, no la manda el cliente: si viajara en la petición,
 * cualquiera podría declarar que aceptó una versión antigua (o una que no
 * existe), y el registro dejaría de valer como prueba de nada. El cliente
 * sólo dice "sí, acepto"; qué aceptó lo decide este archivo.
 *
 * Al publicar una revisión de los textos se sube esta constante. A partir de
 * ahí, `acceptedTermsVersion` deja de coincidir para las cuentas antiguas y
 * se las puede detectar con una consulta para volver a pedirles el
 * consentimiento.
 *
 * Formato `AAAA-MM-DD`: ordena solo y dice de un vistazo de cuándo es el
 * texto, que es justo lo que se quiere saber al mirar una fila.
 */
export const CURRENT_TERMS_VERSION = '2026-09-22';
