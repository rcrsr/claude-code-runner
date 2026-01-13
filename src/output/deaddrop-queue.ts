/**
 * Serial message queue for deaddrop communication
 * Encapsulates module-level state into a testable class
 */

import type { DeadDropSender, DeadDropUser } from './colors.js';

interface QueuedMessage {
  content: string;
  user: DeadDropUser;
}

/**
 * Serial message queue for deaddrop communication
 * Ensures messages are sent one at a time in order
 */
export class DeadDropQueue {
  private sender: DeadDropSender | null = null;
  private messageQueue: QueuedMessage[] = [];
  private isProcessing = false;
  private flushResolve: (() => void) | null = null;

  /**
   * Configure the sender function
   * Call once at startup when --deaddrop is enabled
   */
  configure(sender: DeadDropSender | null): void {
    this.sender = sender;
  }

  /**
   * Enqueue a message for sending
   */
  send(message: string, user: DeadDropUser): void {
    if (this.sender) {
      this.messageQueue.push({ content: message, user });
      void this.processQueue();
    }
  }

  /**
   * Wait for all pending messages to be sent
   * Call before process.exit to ensure delivery
   */
  async flush(): Promise<void> {
    if (this.messageQueue.length === 0 && !this.isProcessing) return;

    return new Promise<void>((resolve) => {
      this.flushResolve = resolve;
      if (!this.isProcessing) {
        void this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || !this.sender) return;
    this.isProcessing = true;

    let msg = this.messageQueue.shift();
    while (msg) {
      await this.sender(msg.content, msg.user);
      msg = this.messageQueue.shift();
    }

    this.isProcessing = false;

    if (this.flushResolve && this.messageQueue.length === 0) {
      this.flushResolve();
      this.flushResolve = null;
    }
  }
}

// Singleton instance (maintains backward compatibility)
const defaultQueue = new DeadDropQueue();

/**
 * Configure the deaddrop sender for all output functions
 * Call once at startup when --deaddrop is enabled
 */
export function configureDeadDrop(sender: DeadDropSender | null): void {
  defaultQueue.configure(sender);
}

/**
 * Send a message to deaddrop if configured
 */
export function sendToDeadDrop(message: string, user: DeadDropUser): void {
  defaultQueue.send(message, user);
}

/**
 * Flush all pending deaddrop sends
 * Call before process.exit to ensure all messages are sent
 */
export async function flushDeadDrop(): Promise<void> {
  return defaultQueue.flush();
}
