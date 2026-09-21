import { isGenre, isValidGenreForSection, GENRES } from './music';

describe('isGenre', () => {
  it('acepta cualquiera de los 8 géneros del universo cerrado', () => {
    for (const genre of GENRES) expect(isGenre(genre)).toBe(true);
  });

  it('rechaza strings que no son un Genre válido', () => {
    expect(isGenre('reggaeton')).toBe(false);
    expect(isGenre('')).toBe(false);
    expect(isGenre('Lo-Fi')).toBe(false); // case-sensitive: el valor real es 'lofi'
  });
});

describe('isValidGenreForSection', () => {
  it('acepta un ítem cuyo género principal coincide con la sección', () => {
    expect(isValidGenreForSection({ primaryGenre: 'lofi' }, 'lofi')).toBe(true);
  });

  it('rechaza un ítem de otro género aunque "suene parecido"', () => {
    // Ambient y Lo-Fi comparten estética pero no son el mismo género — sin
    // declaración explícita, no se mezclan.
    expect(isValidGenreForSection({ primaryGenre: 'ambient' }, 'lofi')).toBe(false);
  });

  it('acepta un género secundario *declarado* explícitamente', () => {
    expect(isValidGenreForSection({ primaryGenre: 'lofi', secondaryGenres: ['ambient'] }, 'ambient')).toBe(true);
  });

  it('rechaza un ítem sin ningún género asignado', () => {
    expect(isValidGenreForSection({}, 'rock')).toBe(false);
  });
});
