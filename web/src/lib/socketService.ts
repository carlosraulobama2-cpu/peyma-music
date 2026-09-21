"use client";

import { io, type Socket } from "socket.io-client";
import { getAuthToken } from "./httpClient";

export type DeviceKind = "web" | "mobile";

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

export type PlayerCommandType = "PLAY" | "PAUSE" | "SEEK" | "SKIP_NEXT" | "SKIP_PREVIOUS" | "CHANGE_VOLUME";

export interface PlayerCommand {
  type: PlayerCommandType;
  positionMs?: number;
  volume?: number;
  deviceId: string;
  timestamp: number;
}

/** Identidad estable de este navegador — se mantiene entre recargas para que "Sonando en …" no cambie de nombre solo. */
const DEVICE_ID_KEY = "peyma-device-id";

function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `web-${crypto.randomUUID()}`;
    window.localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function getDeviceName(): string {
  if (typeof navigator === "undefined") return "Navegador";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : "";
  return os ? `${browser} en ${os}` : browser;
}

/** La URL del socket es la del backend sin el sufijo `/api` — Socket.io se monta en la raíz del mismo servidor HTTP. */
function getSocketUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  return apiUrl.replace(/\/api\/?$/, "");
}

let socket: Socket | null = null;

export const deviceId = getDeviceId();
export const deviceName = getDeviceName();

/** Singleton: una sola conexión por pestaña, reutilizada por quien la pida. */
export function getSocket(): Socket | null {
  if (typeof window === "undefined") return null;
  const token = getAuthToken();
  if (!token) return null;

  if (!socket) {
    socket = io(getSocketUrl(), {
      auth: { token, deviceId, deviceKind: "web" as DeviceKind, deviceName },
      transports: ["websocket"],
      autoConnect: true,
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function emitState(state: Omit<RemotePlayerState, "deviceId" | "deviceKind" | "deviceName">): void {
  getSocket()?.emit("player:state-change", { ...state, deviceId, deviceKind: "web", deviceName });
}

export function emitCommand(command: Omit<PlayerCommand, "deviceId" | "timestamp">): void {
  getSocket()?.emit("player:command", { ...command, deviceId, timestamp: Date.now() });
}

export function requestSync(): void {
  getSocket()?.emit("devices:request-sync");
}
