import type { Server } from 'socket.io';
import { ROOMS, SOCKET_EVENTS } from './events.js';
import { getSocketServer } from './realtime.js';

function emitToRooms(rooms: string[], event: string, payload: unknown): void {
  const io = getSocketServer();
  if (!io) return;
  for (const room of [...new Set(rooms.filter(Boolean))]) {
    io.to(room).emit(event, payload);
  }
}

export function conversationRoom(conversationId: string): string {
  return ROOMS.conversation(conversationId);
}

export function emitMessageNew(conversationId: string, message: unknown, participantIds: string[]): void {
  const rooms = [conversationRoom(conversationId), ...participantIds.map((id) => ROOMS.user(id))];
  emitToRooms(rooms, SOCKET_EVENTS.MESSAGE_NEW, { conversationId, message });
}

export function emitMessageEdited(conversationId: string, message: unknown, participantIds: string[]): void {
  const rooms = [conversationRoom(conversationId), ...participantIds.map((id) => ROOMS.user(id))];
  emitToRooms(rooms, SOCKET_EVENTS.MESSAGE_EDITED, { conversationId, message });
}

export function emitMessageDeleted(conversationId: string, messageId: string, participantIds: string[]): void {
  const rooms = [conversationRoom(conversationId), ...participantIds.map((id) => ROOMS.user(id))];
  emitToRooms(rooms, SOCKET_EVENTS.MESSAGE_DELETED, { conversationId, messageId });
}

export function emitTyping(
  conversationId: string,
  userId: string,
  isTyping: boolean,
  participantIds: string[],
): void {
  const rooms = [conversationRoom(conversationId), ...participantIds.filter((id) => id !== userId).map((id) => ROOMS.user(id))];
  emitToRooms(rooms, isTyping ? SOCKET_EVENTS.TYPING_STARTED : SOCKET_EVENTS.TYPING_STOPPED, {
    conversationId,
    userId,
    at: new Date().toISOString(),
  });
}

export function emitReadReceipt(
  conversationId: string,
  userId: string,
  lastReadMessageId: string | null,
  participantIds: string[],
): void {
  const rooms = [conversationRoom(conversationId), ...participantIds.map((id) => ROOMS.user(id))];
  emitToRooms(rooms, SOCKET_EVENTS.MESSAGE_READ, {
    conversationId,
    userId,
    lastReadMessageId,
    at: new Date().toISOString(),
  });
}

export function emitMessageDelivered(
  conversationId: string,
  messageId: string,
  userId: string,
  participantIds: string[],
): void {
  const rooms = [conversationRoom(conversationId), ...participantIds.map((id) => ROOMS.user(id))];
  emitToRooms(rooms, SOCKET_EVENTS.MESSAGE_DELIVERED, {
    conversationId,
    messageId,
    userId,
    at: new Date().toISOString(),
  });
}

export function emitConversationUpdated(conversation: unknown, participantIds: string[]): void {
  const conv = conversation as { _id?: { toString(): string }; id?: string };
  const id = conv._id?.toString?.() ?? conv.id;
  if (!id) return;
  const rooms = [conversationRoom(id), ...participantIds.map((pid) => ROOMS.user(pid)), ROOMS.admin()];
  emitToRooms(rooms, SOCKET_EVENTS.CONVERSATION_UPDATED, { conversation });
}

/** Used by socket layer tests / typing without circular imports. */
export function getIo(): Server | null {
  return getSocketServer();
}
