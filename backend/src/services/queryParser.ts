/**
 * Peyma Music API — Parser de queries de búsqueda
 *
 * Convierte texto como `genre:rock year:1990-1999 NOT artist:"Luna Neón"`
 * en un AST que `searchService` traduce a filtros de Prisma.
 *
 * Es un parser recursivo-descendente escrito a mano, no una librería: la
 * gramática es chica y cerrada (campo:valor, comillas, AND/OR/NOT,
 * paréntesis), y una dependencia de generación de parsers sería más peso y
 * más superficie que el propio lenguaje que interpreta.
 *
 * Regla de oro: NUNCA lanza por sintaxis inválida. Una comilla sin cerrar o
 * un `genre:` sin valor degradan a búsqueda de texto libre — el buscador de
 * una app de música no puede devolver un 500 porque alguien tecleó raro.
 */

export const SEARCH_FIELDS = ["genre", "year", "artist", "album", "track", "label", "isrc"] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

export interface FieldNode {
  type: "field";
  field: SearchField;
  value: string;
  /** Sólo para `year:1990-1999`. */
  range?: { from: number; to: number };
}

export interface TextNode {
  type: "text";
  value: string;
}

export interface NotNode {
  type: "not";
  operand: QueryNode;
}

export interface BinaryNode {
  type: "and" | "or";
  left: QueryNode;
  right: QueryNode;
}

export type QueryNode = FieldNode | TextNode | NotNode | BinaryNode;

type Token =
  | { kind: "field"; field: SearchField; value: string }
  | { kind: "text"; value: string }
  | { kind: "and" }
  | { kind: "or" }
  | { kind: "not" }
  | { kind: "lparen" }
  | { kind: "rparen" };

const FIELD_SET = new Set<string>(SEARCH_FIELDS);

/**
 * Quita tildes y normaliza a NFKD para que `Rosalía` y `Rosalia` sean el
 * mismo término. No se aplica a los valores de `isrc`, donde cada carácter
 * es significativo.
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function isFieldName(name: string): name is SearchField {
  return FIELD_SET.has(name.toLowerCase());
}

/** Lector de un valor entrecomillado; devuelve el texto y dónde continuar. */
function readQuoted(input: string, start: number): { value: string; next: number } {
  const quote = input[start];
  let value = "";
  let i = start + 1;
  while (i < input.length) {
    const char = input[i]!;
    if (char === "\\" && i + 1 < input.length) {
      value += input[i + 1];
      i += 2;
      continue;
    }
    if (char === quote) return { value, next: i + 1 };
    value += char;
    i++;
  }
  // Comilla sin cerrar: se toma hasta el final en vez de fallar.
  return { value, next: input.length };
}

/** Lector de una palabra suelta, respetando `\` como escape (artist:AC\/DC). */
function readBare(input: string, start: number): { value: string; next: number } {
  let value = "";
  let i = start;
  while (i < input.length) {
    const char = input[i]!;
    if (char === "\\" && i + 1 < input.length) {
      value += input[i + 1];
      i += 2;
      continue;
    }
    // Cortar también en comillas: sin esto, `artist:"Luna Neón"` se leía
    // como la palabra `artist:"Luna` y perdía el valor entrecomillado.
    if (/\s/.test(char) || char === "(" || char === ")" || char === '"' || char === "'") break;
    value += char;
    i++;
  }
  return { value, next: i };
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i]!;

    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (char === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (char === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }

    if (char === '"' || char === "'") {
      const { value, next } = readQuoted(input, i);
      i = next;
      if (value.trim()) tokens.push({ kind: "text", value: value.trim() });
      continue;
    }

    const { value: word, next } = readBare(input, i);
    i = next;
    if (!word) {
      i++;
      continue;
    }

    // Operadores lógicos: sólo cuentan en MAYÚSCULAS, para que buscar la
    // palabra "and" en un título no se interprete como operador.
    if (word === "AND") {
      tokens.push({ kind: "and" });
      continue;
    }
    if (word === "OR") {
      tokens.push({ kind: "or" });
      continue;
    }
    if (word === "NOT") {
      tokens.push({ kind: "not" });
      continue;
    }

    const colon = word.indexOf(":");
    if (colon > 0) {
      const rawField = word.slice(0, colon);
      if (isFieldName(rawField)) {
        const field = rawField.toLowerCase() as SearchField;
        let value = word.slice(colon + 1);

        // `genre: rock` (con espacio) o `genre:"indie pop"`: el valor puede
        // venir en el siguiente token entrecomillado.
        if (!value && i < input.length) {
          while (i < input.length && /\s/.test(input[i]!)) i++;
          if (input[i] === '"' || input[i] === "'") {
            const quoted = readQuoted(input, i);
            value = quoted.value;
            i = quoted.next;
          }
        }

        // `genre:` sin valor: se descarta el token en vez de romper.
        if (value.trim()) tokens.push({ kind: "field", field, value: value.trim() });
        continue;
      }
    }

    tokens.push({ kind: "text", value: word });
  }

  return tokens;
}

const YEAR_RANGE = /^(\d{4})-(\d{4})$/;
const YEAR_SINGLE = /^\d{4}$/;

function buildFieldNode(token: Extract<Token, { kind: "field" }>): FieldNode {
  const node: FieldNode = {
    type: "field",
    field: token.field,
    // El ISRC es un código: normalizar tildes no aplica y perdería precisión.
    value: token.field === "isrc" ? token.value.toUpperCase() : normalizeText(token.value),
  };

  if (token.field === "year") {
    const range = YEAR_RANGE.exec(token.value);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      // `year:1999-1990` se interpreta igual que `1990-1999` en vez de devolver vacío.
      node.range = { from: Math.min(from, to), to: Math.max(from, to) };
    } else if (YEAR_SINGLE.test(token.value)) {
      const year = Number(token.value);
      node.range = { from: year, to: year };
    }
  }

  return node;
}

/**
 * Precedencia: NOT liga más fuerte que AND, y AND más que OR — igual que en
 * álgebra booleana estándar. Los espacios entre términos son AND implícito.
 */
function parseTokens(tokens: Token[]): QueryNode | null {
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];

  function parsePrimary(): QueryNode | null {
    const token = peek();
    if (!token) return null;

    if (token.kind === "lparen") {
      pos++;
      const inner = parseOr();
      // Paréntesis sin cerrar: se acepta lo que haya adentro.
      if (peek()?.kind === "rparen") pos++;
      return inner;
    }
    if (token.kind === "not") {
      pos++;
      const operand = parsePrimary();
      return operand ? { type: "not", operand } : null;
    }
    if (token.kind === "field") {
      pos++;
      return buildFieldNode(token);
    }
    if (token.kind === "text") {
      pos++;
      return { type: "text", value: normalizeText(token.value) };
    }
    // Operador suelto sin operando izquierdo: se ignora.
    pos++;
    return null;
  }

  function parseAnd(): QueryNode | null {
    let left = parsePrimary();
    for (;;) {
      const token = peek();
      if (!token) break;
      if (token.kind === "and") {
        pos++;
        const right = parsePrimary();
        left = left && right ? { type: "and", left, right } : (left ?? right);
        continue;
      }
      // AND implícito entre términos contiguos.
      if (token.kind === "field" || token.kind === "text" || token.kind === "not" || token.kind === "lparen") {
        const right = parsePrimary();
        left = left && right ? { type: "and", left, right } : (left ?? right);
        continue;
      }
      break;
    }
    return left;
  }

  function parseOr(): QueryNode | null {
    let left = parseAnd();
    while (peek()?.kind === "or") {
      pos++;
      const right = parseAnd();
      left = left && right ? { type: "or", left, right } : (left ?? right);
    }
    return left;
  }

  return parseOr();
}

export interface ParsedQuery {
  ast: QueryNode | null;
  /** Para mostrarle al usuario cómo se interpretó su consulta. */
  summary: string;
}

function describe(node: QueryNode): string {
  switch (node.type) {
    case "field":
      return node.range ? `${node.field}:${node.range.from}-${node.range.to}` : `${node.field}:${node.value}`;
    case "text":
      return `"${node.value}"`;
    case "not":
      return `NOT ${describe(node.operand)}`;
    case "and":
      return `(${describe(node.left)} AND ${describe(node.right)})`;
    case "or":
      return `(${describe(node.left)} OR ${describe(node.right)})`;
  }
}

export function parseSearchQuery(raw: string): ParsedQuery {
  const collapsed = raw.replace(/\0/g, "").replace(/\s+/g, " ").trim();
  if (!collapsed) return { ast: null, summary: "" };

  const ast = parseTokens(tokenize(collapsed));
  return { ast, summary: ast ? describe(ast) : "" };
}
