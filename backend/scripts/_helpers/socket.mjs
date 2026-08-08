/**
 * Socket.IO helpers for messaging / realtime e2e.
 */

import { io } from 'socket.io-client';
import { getSocketUrl } from './http.mjs';

export function waitFor(socket, event, timeoutMs = 10_000, predicate) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    function handler(payload) {
      if (predicate && !predicate(payload)) return;
      clearTimeout(t);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

export function connectSocket(token, options = {}) {
  return new Promise((resolve, reject) => {
    const socket = io(getSocketUrl(), {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket'],
      ...options,
    });
    socket.on('connect_error', (err) => reject(err));
    socket.on('connect', () => resolve(socket));
  });
}

export function joinConversation(socket, conversationId) {
  return new Promise((resolve, reject) => {
    socket.emit('conversation:join', conversationId, (ack) => {
      if (ack?.ok) resolve(ack);
      else reject(new Error(`conversation:join failed ${JSON.stringify(ack)}`));
    });
  });
}

export function joinJob(socket, jobId) {
  return new Promise((resolve, reject) => {
    socket.emit('job:join', jobId, (ack) => {
      if (ack?.ok) resolve(ack);
      else reject(new Error(`job:join failed ${JSON.stringify(ack)}`));
    });
  });
}
