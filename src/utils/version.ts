/**
 * Package version lookup
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/** Version from this package's package.json (resolves from src/utils and dist/utils) */
export function getPackageVersion(): string {
  const pkg: unknown = require('../../package.json');
  if (typeof pkg === 'object' && pkg !== null && 'version' in pkg) {
    const { version } = pkg;
    if (typeof version === 'string') {
      return version;
    }
  }
  throw new Error('package.json has no string version field');
}
