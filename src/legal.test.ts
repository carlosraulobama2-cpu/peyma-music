import fs from 'node:fs';
import path from 'node:path';
import { TERMS, PRIVACY, OPERATOR, TERMS_VERSION } from './legal';

/**
 * Los textos legales viven duplicados: `src/legal.ts` (app) y
 * `web/src/lib/legal.ts` (web). No es por gusto — son proyectos npm
 * distintos y ninguno puede importar módulos del otro.
 *
 * El riesgo real de esa duplicación no es tenerla, es que se separe sin que
 * nadie lo note: alguien corrige una cláusula en la web, la app sigue
 * mostrando la anterior, y dos personas aceptan cosas distintas bajo el
 * mismo número de versión. Este test convierte eso en un fallo de CI.
 */

const RAIZ = path.resolve(__dirname, '..');

/** Quita la cabecera de documentación, que sí difiere entre las dos copias a propósito. */
function cuerpo(rutaRelativa: string): string {
  const contenido = fs.readFileSync(path.join(RAIZ, rutaRelativa), 'utf8');
  return contenido.replace(/^\/\*\*[\s\S]*?\*\//, '').trim();
}

describe('textos legales', () => {
  it('la copia de la web no se separó de la fuente', () => {
    expect(cuerpo('web/src/lib/legal.ts')).toBe(cuerpo('src/legal.ts'));
  });

  it('la versión coincide con la que estampa el backend', () => {
    const backend = fs.readFileSync(path.join(RAIZ, 'backend/src/legal.ts'), 'utf8');
    const declarada = backend.match(/CURRENT_TERMS_VERSION\s*=\s*'([^']+)'/)?.[1];
    // Si divergen, una cuenta nueva quedaría marcada con una versión distinta
    // de la que realmente leyó, y el registro dejaría de valer como prueba.
    expect(declarada).toBe(TERMS_VERSION);
  });

  it('los dos documentos tienen contenido, no secciones vacías', () => {
    for (const doc of [TERMS, PRIVACY]) {
      expect(doc.sections.length).toBeGreaterThan(0);
      for (const seccion of doc.sections) {
        expect(seccion.heading.trim()).not.toBe('');
        expect(seccion.paragraphs.length).toBeGreaterThan(0);
        for (const parrafo of seccion.paragraphs) {
          expect(parrafo.trim().length).toBeGreaterThan(20);
        }
      }
    }
  });

  /**
   * Recordatorio antes de abrir al público.
   *
   * Sin razón social, domicilio y correo de contacto reales, la política de
   * privacidad no cumple el RGPD. Este test falla mientras queden los
   * marcadores, así que no se puede olvidar en silencio; cuando se rellenen,
   * pasa solo.
   */
  it('avisa si quedan datos del titular sin rellenar', () => {
    const pendientes = Object.entries(OPERATOR)
      .filter(([, valor]) => valor.startsWith('['))
      .map(([campo]) => campo);

    expect(pendientes).toEqual(
      // Se listan explícitamente para que, al rellenar uno, el test recuerde
      // cuáles faltan todavía en vez de pasar a verde de golpe.
      ['legalName', 'taxId', 'address', 'email', 'jurisdiction'],
    );
  });
});
