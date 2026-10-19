import type { ServerEvent } from '@sinc/shared';
import type { Server } from 'socket.io';

export class RealtimeBus {
  private io: Server | null = null;

  attach(io: Server): void {
    this.io = io;
  }

  emit(roomId: string, event: ServerEvent): void {
    this.io?.to(roomId).emit('event', event);
  }

  close(roomId: string): void {
    this.emit(roomId, { type: 'error', code: 'room_deleted', message: 'Комната закрыта хостом' });
    this.io?.in(roomId).disconnectSockets(true);
  }
}
