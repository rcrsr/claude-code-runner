/**
 * DeadDrop client for sending messages to a Deaddrop endpoint
 * https://deaddrop.sh
 */

export interface DeadDropConfig {
  apiKey: string;
  host: string;
  runId: string;
}

export type DeadDropUser = 'Runner' | 'Claude Code';

export interface DeadDropClient {
  send(content: string, user: DeadDropUser): Promise<void>;
}

const DEFAULT_HOST = 'https://deaddrop.bezoan.com';

/**
 * Create a DeadDrop client from environment variables
 * Returns null if DEADDROP_API_KEY is not set
 */
export function createDeadDropClientFromEnv(
  runId: string
): DeadDropClient | null {
  const apiKey = process.env['DEADDROP_API_KEY'];
  if (!apiKey) {
    return null;
  }

  const host = process.env['DEADDROP_HOST'] ?? DEFAULT_HOST;
  return createDeadDropClient({ apiKey, host, runId });
}

/**
 * Create a DeadDrop client with the given configuration
 */
export function createDeadDropClient(config: DeadDropConfig): DeadDropClient {
  const host = config.host.replace(/\/+$/, ''); // Remove trailing slashes
  const url = `${host}/v1/messages`;

  return {
    async send(content: string, user: DeadDropUser): Promise<void> {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/markdown',
            'X-API-Key': config.apiKey,
            'X-DeadDrop-User': user,
            'X-DeadDrop-Subject': config.runId,
          },
          body: content,
        });

        if (!response.ok) {
          console.warn(
            `[DEADDROP] Warning: Failed to send message (${response.status})`
          );
        }
      } catch (err) {
        console.warn(`[DEADDROP] Warning: ${(err as Error).message}`);
      }
    },
  };
}
