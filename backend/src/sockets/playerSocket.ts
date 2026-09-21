/**
 * Peyma Music API — Peyma Connect (sincronización en tiempo real)
 *
 * Une todos los dispositivos de un mismo usuario a una sala privada
 * (`user:<id>`) para que el estado de reproducción viaje entre la web y la
 * app móvil. Los nombres de evento y la forma de los payloads son los
 * mismos en los dos clientes a propósito — ver `socketService.ts` en
 * `web/src/lib/` y en `src/services/` (Expo).
 *
 * Todo lo que entra se reenvía con `socket.to(room)`, NO con `io.to(room)`:
 * así el emisor nunca recibe su propio evento de vuelta, que es la mitad de
 * la protección contra bucles de eco (la otra mitad, `isRemoteCommand`,
 * vive en los stores de cada cliente).
 */
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { verifyToken } from '../utils/auth';
import { logger } from '../logger';

export type DeviceKind = 'web' | 'mobile';

export interface PlayerState {
  trackId: string | null;
  positionMs: number;
  isPlaying: boolean;
  volume: number;
  deviceId: string;
  deviceKind: DeviceKind;
  deviceName: string;
  timestamp: number;
}

export type PlayerCommandType = 'PLAY' | 'PAUSE' | 'SEEK' | 'SKIP_NEXT' | 'SKIP_PREVIOUS' | 'CHANGE_VOLUME';

export interface PlayerCommand {
  type: PlayerCommandType;
  /** Sólo para SEEK. */
  positionMs?: number;
  /** Sólo para CHANGE_VOLUME (0–1). */
  volume?: number;
  /** Quién manda la orden — el receptor lo usa para el indicador "Sonando en …". */
  deviceId: string;
  timestamp: number;
}

interface SocketData {
  userId: string;
  deviceId: string;
  deviceKind: DeviceKind;
  deviceName: string;
}

type AuthedSocket = Socket<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>;

const userRoom = (userId: string) => `user:${userId}`;

export function attachPlayerSocket(httpServer: HttpServer, allowedOrigins: string[]): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
      credentials: true,
    },
  });

  // Autenticación en el handshake: un socket sin JWT válido nunca llega a
  // unirse a una sala, así que no puede ver ni mandar nada.
  io.use((socket: AuthedSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Falta el token de sesión'));

    try {
      const payload = verifyToken(token);
      socket.data.userId = payload.userId;
      socket.data.deviceId = (socket.handshake.auth?.deviceId as string | undefined) ?? socket.id;
      socket.data.deviceKind = (socket.handshake.auth?.deviceKind as DeviceKind | undefined) ?? 'web';
      socket.data.deviceName = (socket.handshake.auth?.deviceName as string | undefined) ?? 'Dispositivo';
      next();
    } catch {
      next(new Error('Token inválido o expirado'));
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    const room = userRoom(socket.data.userId);
    socket.join(room);

    logger.info({ userId: socket.data.userId, deviceId: socket.data.deviceId }, 'Peyma Connect: dispositivo conectado');

    // Avisa a los otros dispositivos del usuario que apareció uno nuevo.
    socket.to(room).emit('devices:joined', {
      deviceId: socket.data.deviceId,
      deviceKind: socket.data.deviceKind,
      deviceName: socket.data.deviceName,
    });

    socket.on('player:state-change', (state: PlayerState) => {
      socket.to(room).emit('player:state-change', {
        ...state,
        deviceId: socket.data.deviceId,
        deviceKind: socket.data.deviceKind,
        deviceName: socket.data.deviceName,
      });
    });

    socket.on('player:command', (command: PlayerCommand) => {
      socket.to(room).emit('player:command', { ...command, deviceId: socket.data.deviceId });
    });

    /** Un cliente recién abierto pide el estado actual; el que esté reproduciendo responde con `player:state-change`. */
    socket.on('devices:request-sync', () => {
      socket.to(room).emit('devices:request-sync', { requestedBy: socket.data.deviceId });
    });

    socket.on('disconnect', () => {
      socket.to(room).emit('devices:left', { deviceId: socket.data.deviceId });
      logger.info({ userId: socket.data.userId, deviceId: socket.data.deviceId }, 'Peyma Connect: dispositivo desconectado');
    });
  });

  return io;
}
