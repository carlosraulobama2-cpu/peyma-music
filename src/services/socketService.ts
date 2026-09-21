/**
 * Peyma Music — Peyma Connect (app móvil)
 *
 * Mismo protocolo que el cliente web (`web/src/lib/socketService.ts`):
 * mismos nombres de evento y misma forma de payload, a propósito, para que
 * el backend no tenga que distinguir de dónde viene cada mensaje.
 */
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, type Socket } from 'socket.io-client';
import { getAuthToken } from './httpClient';

export type DeviceKind = 'web' | 'mobile';

export interface RemotePlayerState {
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
  positionMs?: number;
  volume?: number;
  deviceId: string;
  timestamp: number;
}

const DEVICE_ID_KEY = 'peyma-device-id';

let cachedDeviceId: string | null = null;

/** Identidad estable del dispositivo, persistida — para que "Sonando en …" no cambie entre arranques. */
async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (stored) {
    cachedDeviceId = stored;
    return stored;
  }
  const generated = `mobile-${Crypto.randomUUID()}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, generated);
  cachedDeviceId = generated;
  return generated;
}

const deviceName = Platform.OS === 'ios' ? 'iPhone' : 'Android';

/** La URL del socket es la del backend sin `/api` — Socket.io va montado en la raíz del mismo servidor. */
function getSocketUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/api\/?$/, '');
}

let socket: Socket | null = null;

export async function connectSocket(): Promise<Socket | null> {
  const token = await getAuthToken();
  if (!token) return null;
  if (socket?.connected) return socket;

  const deviceId = await getDeviceId();
  socket = io(getSocketUrl(), {
    auth: { token, deviceId, deviceKind: 'mobile' as DeviceKind, deviceName },
    transports: ['websocket'],
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export async function emitState(state: Omit<RemotePlayerState, 'deviceId' | 'deviceKind' | 'deviceName'>): Promise<void> {
  const active = await connectSocket();
  const deviceId = await getDeviceId();
  active?.emit('player:state-change', { ...state, deviceId, deviceKind: 'mobile', deviceName });
}

export async function emitCommand(command: Omit<PlayerCommand, 'deviceId' | 'timestamp'>): Promise<void> {
  const active = await connectSocket();
  const deviceId = await getDeviceId();
  active?.emit('player:command', { ...command, deviceId, timestamp: Date.now() });
}

export async function requestSync(): Promise<void> {
  const active = await connectSocket();
  active?.emit('devices:request-sync');
}
