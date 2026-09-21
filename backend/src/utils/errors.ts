/**
 * Peyma Music API — Errores de dominio
 *
 * Express 5 reenvía automáticamente los rechazos de promesas de handlers
 * async al middleware de errores — por eso las rutas ya no necesitan
 * try/catch propio: simplemente `throw` uno de estos y el middleware central
 * (ver index.ts) decide el status code y la forma de la respuesta.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Recurso') {
    super(`${resource} no encontrado`, 404, 'not_found');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'No tienes permiso para hacer esto') {
    super(message, 403, 'forbidden');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'El recurso ya existe') {
    super(message, 409, 'conflict');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'No autorizado') {
    super(message, 401, 'unauthorized');
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Solicitud inválida') {
    super(message, 400, 'bad_request');
  }
}
