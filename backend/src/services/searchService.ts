/**
 * Peyma Music API — Traductor de AST a filtros de Prisma
 *
 * Toma el árbol que produce `queryParser` y lo convierte en un
 * `Prisma.TrackWhereInput`. El filtro de moderación (`status: APPROVED`) lo
 * aplica el caller, no este módulo: así una consulta de admin puede reusar
 * el mismo traductor sin quedar limitada al catálogo público.
 */
import type { Prisma } from '@prisma/client';
import type { QueryNode, FieldNode } from './queryParser';

/** `love*` busca por prefijo; sin asterisco, por coincidencia parcial. */
function textFilter(value: string): Prisma.StringFilter {
  if (value.endsWith('*')) {
    return { startsWith: value.slice(0, -1), mode: 'insensitive' };
  }
  return { contains: value, mode: 'insensitive' };
}

function fieldToWhere(node: FieldNode): Prisma.TrackWhereInput {
  switch (node.field) {
    case 'genre': {
      const lowered = node.value.toLowerCase();
      // Ya no hay que contrastar contra una lista fija en código: `Track.genre`
      // apunta a `MusicGenre`, así que filtrar por slug sencillamente no
      // encuentra nada si ese género no existe en la tabla. Se sigue mirando
      // también `Artist.genres`, que es texto libre y un vocabulario aparte.
      return {
        OR: [
          { genre: { slug: lowered } },
          { artist: { genres: { has: node.value } } },
        ],
      };
    }

    case 'year': {
      // Sin rango parseable (`year:abc`), el filtro no aplica en vez de
      // devolver cero resultados por un typo.
      if (!node.range) return {};
      return { album: { releaseYear: { gte: node.range.from, lte: node.range.to } } };
    }

    case 'artist':
      return { artist: { name: textFilter(node.value) } };

    case 'album':
      return { album: { title: textFilter(node.value) } };

    case 'track':
      return { title: textFilter(node.value) };

    case 'label':
      return { label: textFilter(node.value) };

    case 'isrc':
      // Código exacto: no tiene sentido una coincidencia parcial.
      return { isrc: node.value };
  }
}

/** Texto libre: se busca en título, artista y álbum a la vez. */
function freeTextToWhere(value: string): Prisma.TrackWhereInput {
  const filter = textFilter(value);
  return {
    OR: [{ title: filter }, { artist: { name: filter } }, { album: { title: filter } }],
  };
}

export function astToWhere(node: QueryNode): Prisma.TrackWhereInput {
  switch (node.type) {
    case 'field':
      return fieldToWhere(node);
    case 'text':
      return freeTextToWhere(node.value);
    case 'not':
      return { NOT: astToWhere(node.operand) };
    case 'and':
      return { AND: [astToWhere(node.left), astToWhere(node.right)] };
    case 'or':
      return { OR: [astToWhere(node.left), astToWhere(node.right)] };
  }
}
