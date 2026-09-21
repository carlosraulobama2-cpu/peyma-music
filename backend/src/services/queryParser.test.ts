import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchQuery, normalizeText, type QueryNode } from './queryParser';

/** Aplana el AST a una forma corta y comparable, para no escribir objetos gigantes en cada aserción. */
function shape(node: QueryNode | null): string {
  if (!node) return 'null';
  switch (node.type) {
    case 'field':
      return node.range ? `${node.field}[${node.range.from}..${node.range.to}]` : `${node.field}=${node.value}`;
    case 'text':
      return `text(${node.value})`;
    case 'not':
      return `NOT(${shape(node.operand)})`;
    case 'and':
      return `AND(${shape(node.left)},${shape(node.right)})`;
    case 'or':
      return `OR(${shape(node.left)},${shape(node.right)})`;
  }
}

describe('normalizeText', () => {
  test('quita tildes', () => {
    assert.equal(normalizeText('Rosalía'), 'Rosalia');
    assert.equal(normalizeText('Luna Neón'), 'Luna Neon');
  });
});

describe('comandos de campo', () => {
  test('extrae un par campo:valor', () => {
    assert.equal(shape(parseSearchQuery('genre:rock').ast), 'genre=rock');
  });

  test('normaliza el nombre del campo a minúsculas', () => {
    assert.equal(shape(parseSearchQuery('GENRE:pop').ast), 'genre=pop');
  });

  test('acepta valores entre comillas con espacios', () => {
    assert.equal(shape(parseSearchQuery('artist:"Luna Neón"').ast), 'artist=Luna Neon');
  });

  test('acepta comillas simples', () => {
    assert.equal(shape(parseSearchQuery("album:'Tierra y Cielo'").ast), 'album=Tierra y Cielo');
  });

  test('el ISRC conserva mayúsculas y no se le quitan caracteres', () => {
    assert.equal(shape(parseSearchQuery('isrc:espym0002600').ast), 'isrc=ESPYM0002600');
  });

  test('permite escapar caracteres especiales', () => {
    assert.equal(shape(parseSearchQuery('artist:AC\\/DC').ast), 'artist=AC/DC');
  });

  test('una palabra que no es un campo conocido es texto libre', () => {
    assert.equal(shape(parseSearchQuery('foo:bar').ast), 'text(foo:bar)');
  });
});

describe('rangos de año', () => {
  test('año puntual se vuelve un rango de un solo año', () => {
    assert.equal(shape(parseSearchQuery('year:1985').ast), 'year[1985..1985]');
  });

  test('rango cronológico', () => {
    assert.equal(shape(parseSearchQuery('year:1990-1999').ast), 'year[1990..1999]');
  });

  test('rango invertido se ordena solo', () => {
    assert.equal(shape(parseSearchQuery('year:1999-1990').ast), 'year[1990..1999]');
  });

  test('año no numérico no produce rango', () => {
    assert.equal(shape(parseSearchQuery('year:abc').ast), 'year=abc');
  });
});

describe('álgebra booleana', () => {
  test('AND explícito', () => {
    assert.equal(shape(parseSearchQuery('genre:rock AND year:1990').ast), 'AND(genre=rock,year[1990..1990])');
  });

  test('AND implícito entre términos contiguos', () => {
    assert.equal(shape(parseSearchQuery('genre:rock year:1990').ast), 'AND(genre=rock,year[1990..1990])');
  });

  test('OR', () => {
    assert.equal(shape(parseSearchQuery('genre:pop OR genre:rock').ast), 'OR(genre=pop,genre=rock)');
  });

  test('NOT', () => {
    assert.equal(shape(parseSearchQuery('NOT genre:rock').ast), 'NOT(genre=rock)');
  });

  test('AND tiene más precedencia que OR', () => {
    assert.equal(
      shape(parseSearchQuery('genre:pop OR genre:rock AND year:2024').ast),
      'OR(genre=pop,AND(genre=rock,year[2024..2024]))',
    );
  });

  test('los paréntesis cambian la precedencia', () => {
    assert.equal(
      shape(parseSearchQuery('(genre:pop OR genre:rock) AND year:2024').ast),
      'AND(OR(genre=pop,genre=rock),year[2024..2024])',
    );
  });

  test('operadores en minúscula son texto, no operadores', () => {
    assert.equal(shape(parseSearchQuery('rock and roll').ast), 'AND(AND(text(rock),text(and)),text(roll))');
  });
});

describe('tolerancia a errores', () => {
  test('comilla sin cerrar no rompe y conserva la intención del campo', () => {
    // Se prefiere `artist=Luna Neon` antes que degradar a texto libre: el
    // usuario claramente quiso filtrar por artista, sólo se olvidó la comilla.
    assert.equal(shape(parseSearchQuery('artist:"Luna Neon').ast), 'artist=Luna Neon');
  });

  test('campo sin valor se descarta', () => {
    assert.equal(shape(parseSearchQuery('genre:').ast), 'null');
  });

  test('campo sin valor junto a otro término conserva el término válido', () => {
    assert.equal(shape(parseSearchQuery('genre: rock').ast), 'text(rock)');
  });

  test('paréntesis sin cerrar no rompe', () => {
    assert.equal(shape(parseSearchQuery('(genre:pop OR genre:rock').ast), 'OR(genre=pop,genre=rock)');
  });

  test('query vacía devuelve null', () => {
    assert.equal(shape(parseSearchQuery('   ').ast), 'null');
  });

  test('espacios redundantes y caracteres nulos se limpian', () => {
    assert.equal(shape(parseSearchQuery('  genre:rock\0   ').ast), 'genre=rock');
  });

  test('operador suelto sin operandos no rompe', () => {
    assert.equal(shape(parseSearchQuery('AND').ast), 'null');
  });
});

describe('wildcards y texto libre', () => {
  test('el asterisco se conserva para que el filtro lo interprete como prefijo', () => {
    assert.equal(shape(parseSearchQuery('track:love*').ast), 'track=love*');
  });

  test('texto libre suelto', () => {
    assert.equal(shape(parseSearchQuery('horizonte').ast), 'text(horizonte)');
  });
});

describe('resumen legible', () => {
  test('describe cómo se interpretó la consulta', () => {
    assert.equal(parseSearchQuery('genre:rock NOT year:1975').summary, '(genre:rock AND NOT year:1975-1975)');
  });
});
