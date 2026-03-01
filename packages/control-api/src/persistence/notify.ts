import { EventEmitter } from "node:events";

import type { PoolClient } from "pg";

import { DatabaseManager } from "./database.js";

export type NotifyListener = (payload: string) => void;

export class PostgresNotifyManager {
  private listenerClient: PoolClient | null = null;
  private readonly listenersByChannel = new Map<string, Set<NotifyListener>>();
  private reconnecting = false;
  private readonly emitter = new EventEmitter();

  constructor(private readonly db: DatabaseManager) {}

  async publish(channel: string, payload: string): Promise<void> {
    await this.db.query(`SELECT pg_notify($1, $2)`, [channel, payload]);
  }

  async subscribe(channel: string, listener: NotifyListener): Promise<() => Promise<void>> {
    const listeners = this.listenersByChannel.get(channel) ?? new Set<NotifyListener>();
    listeners.add(listener);
    this.listenersByChannel.set(channel, listeners);

    await this.ensureListenerClient();
    await this.listenerClient?.query(`LISTEN "${channel}"`);

    return async () => {
      const channelListeners = this.listenersByChannel.get(channel);
      if (!channelListeners) {
        return;
      }

      channelListeners.delete(listener);
      if (channelListeners.size > 0) {
        return;
      }

      this.listenersByChannel.delete(channel);
      if (this.listenerClient) {
        await this.listenerClient.query(`UNLISTEN "${channel}"`);
      }
    };
  }

  async close(): Promise<void> {
    if (!this.listenerClient) {
      return;
    }

    this.listenerClient.removeAllListeners();
    this.listenerClient.release();
    this.listenerClient = null;
  }

  private async ensureListenerClient(): Promise<void> {
    if (this.listenerClient) {
      return;
    }

    this.listenerClient = await this.db.getClient();
    this.listenerClient.on("notification", (message) => {
      if (!message.channel || !message.payload) {
        return;
      }

      const listeners = this.listenersByChannel.get(message.channel);
      if (!listeners) {
        return;
      }

      for (const listener of listeners) {
        listener(message.payload);
      }
    });

    this.listenerClient.on("error", (error) => {
      this.emitter.emit("error", error);
      void this.reconnect();
    });
  }

  private async reconnect(): Promise<void> {
    if (this.reconnecting) {
      return;
    }

    this.reconnecting = true;
    try {
      await this.close();
      await this.ensureListenerClient();
      for (const channel of this.listenersByChannel.keys()) {
        await this.listenerClient?.query(`LISTEN "${channel}"`);
      }
    } finally {
      this.reconnecting = false;
    }
  }
}
