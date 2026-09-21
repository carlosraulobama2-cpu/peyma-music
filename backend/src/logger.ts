import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Un solo logger estructurado para toda la API. En dev se imprime legible
 * (pino-pretty si está disponible); en producción, JSON por línea — el
 * formato que esperan Datadog/CloudWatch/Loki y cualquier stack de miles de
 * usuarios donde `console.log` deja de ser suficiente.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});
