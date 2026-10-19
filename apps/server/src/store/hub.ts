import type { RoomPlaybackState } from '@sinc/shared';
import type { Redis } from 'ioredis';

export class RoomHub {
  private rooms = new Map<string, RoomPlaybackState>();
  private codes = new Map<string, string>();

  constructor(private redis: Redis | null) {}

  async getByCode(code: string): Promise<RoomPlaybackState | null> {
    const id = this.codes.get(code);
    if (id && this.rooms.has(id)) return this.rooms.get(id) ?? null;
    return this.readRedis(code, true);
  }

  async getById(id: string): Promise<RoomPlaybackState | null> {
    const local = this.rooms.get(id);
    if (local) return local;
    return this.readRedis(id, false);
  }

  async save(state: RoomPlaybackState): Promise<void> {
    this.rooms.set(state.roomId, state);
    this.codes.set(state.code, state.roomId);
    if (!this.redis) return;
    try {
      const payload = JSON.stringify(state);
      await this.redis
        .multi()
        .set(`sinc:room:${state.roomId}`, payload, 'EX', 60 * 60 * 18)
        .set(`sinc:code:${state.code}`, state.roomId, 'EX', 60 * 60 * 18)
        .exec();
    } catch (error) {
      console.warn('[redis] save', error instanceof Error ? error.message : error);
    }
  }

  async delete(roomId: string, code: string): Promise<void> {
    this.rooms.delete(roomId);
    this.codes.delete(code);
    if (!this.redis) return;
    try {
      await this.redis.del(`sinc:room:${roomId}`, `sinc:code:${code}`);
    } catch (error) {
      console.warn('[redis] delete', error instanceof Error ? error.message : error);
    }
  }

  private async readRedis(key: string, byCode: boolean): Promise<RoomPlaybackState | null> {
    if (!this.redis) return null;
    try {
      const roomId = byCode ? await this.redis.get(`sinc:code:${key}`) : key;
      if (!roomId) return null;
      const raw = await this.redis.get(`sinc:room:${roomId}`);
      if (!raw) return null;
      const state = JSON.parse(raw) as RoomPlaybackState;
      this.rooms.set(state.roomId, state);
      this.codes.set(state.code, state.roomId);
      return state;
    } catch (error) {
      console.warn('[redis] read', error instanceof Error ? error.message : error);
      return null;
    }
  }
}
