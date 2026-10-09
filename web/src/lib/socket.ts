import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { tokenStore } from './api';

let socket: Socket | null = null;
const statusListeners = new Set<(connected: boolean) => void>();

/**
 * One shared connection per tab. socket.io tries WebSocket and silently falls back to
 * HTTP long-polling, and reconnects on its own after network drops.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      auth: (cb) => cb({ token: tokenStore.get() }),
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 5000,
    });
    socket.on('connect', () => statusListeners.forEach((l) => l(true)));
    socket.on('disconnect', () => statusListeners.forEach((l) => l(false)));
  }
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}

export function useSocketEvent<T = any>(event: string, handler: (payload: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = getSocket();
    const fn = (p: T) => ref.current(p);
    s.on(event, fn);
    return () => {
      s.off(event, fn);
    };
  }, [event]);
}

export function useSocketConnected() {
  const [connected, setConnected] = useState(() => getSocket().connected);
  useEffect(() => {
    statusListeners.add(setConnected);
    setConnected(getSocket().connected);
    return () => {
      statusListeners.delete(setConnected);
    };
  }, []);
  return connected;
}

/**
 * Keeps a view fresh: refetch after every reconnect (events missed while offline),
 * and poll every `intervalMs` while the realtime channel is down.
 */
export function useLiveRefresh(fn: () => void, intervalMs = 10000) {
  const ref = useRef(fn);
  ref.current = fn;
  const connected = useSocketConnected();
  useEffect(() => {
    const s = getSocket();
    const mountedAt = Date.now();
    const onConnect = () => Date.now() - mountedAt > 1500 && ref.current();
    s.on('connect', onConnect);
    return () => {
      s.off('connect', onConnect);
    };
  }, []);
  useEffect(() => {
    if (connected) return;
    const t = setInterval(() => ref.current(), intervalMs);
    return () => clearInterval(t);
  }, [connected, intervalMs]);
}
