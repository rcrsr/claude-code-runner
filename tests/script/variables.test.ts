import { describe, expect, it } from 'vitest';

import {
  captureOutput,
  createVariableStore,
  getCaptureLogMessage,
  getSubstitutionList,
  substituteVariables,
} from '../../src/script/variables.js';

describe('createVariableStore', () => {
  it('creates empty store', () => {
    const store = createVariableStore();

    expect(store.named.size).toBe(0);
    expect(store.last).toBe('');
  });
});

describe('captureOutput', () => {
  it('updates $_ (last)', () => {
    const store = createVariableStore();

    captureOutput(store, 'output text');

    expect(store.last).toBe('output text');
  });

  it('updates named variable when provided', () => {
    const store = createVariableStore();

    captureOutput(store, 'captured', 'result');

    expect(store.named.get('result')).toBe('captured');
    expect(store.last).toBe('captured');
  });

  it('overwrites existing variables', () => {
    const store = createVariableStore();

    captureOutput(store, 'first', 'var');
    captureOutput(store, 'second', 'var');

    expect(store.named.get('var')).toBe('second');
  });

  it('updates $_ even without named capture', () => {
    const store = createVariableStore();

    captureOutput(store, 'first', 'named');
    captureOutput(store, 'second');

    expect(store.last).toBe('second');
    expect(store.named.get('named')).toBe('first');
  });
});

describe('getCaptureLogMessage', () => {
  it('formats named capture message', () => {
    const msg = getCaptureLogMessage('x'.repeat(100), 'result');

    expect(msg).toBe('$result captured (100 chars)');
  });

  it('formats $_ capture message', () => {
    const msg = getCaptureLogMessage('x'.repeat(50));

    expect(msg).toBe('$_ captured (50 chars)');
  });

  it('formats K for thousands', () => {
    const msg = getCaptureLogMessage('x'.repeat(1500), 'big');

    expect(msg).toBe('$big captured (1.5K chars)');
  });

  it('formats M for millions', () => {
    const msg = getCaptureLogMessage('x'.repeat(1500000), 'huge');

    expect(msg).toBe('$huge captured (1.5M chars)');
  });
});

describe('substituteVariables', () => {
  it('substitutes $_', () => {
    const store = createVariableStore();
    store.last = 'previous output';

    const result = substituteVariables('Process: $_', store);

    expect(result).toBe('Process: previous output');
  });

  it('substitutes named variables', () => {
    const store = createVariableStore();
    store.named.set('issues', 'bug1, bug2');

    const result = substituteVariables('Fix: $issues', store);

    expect(result).toBe('Fix: bug1, bug2');
  });

  it('substitutes multiple variables', () => {
    const store = createVariableStore();
    store.named.set('a', 'AAA');
    store.named.set('b', 'BBB');
    store.last = 'CCC';

    const result = substituteVariables('$a and $b and $_', store);

    expect(result).toBe('AAA and BBB and CCC');
  });

  it('substitutes $ARGUMENTS', () => {
    const store = createVariableStore();

    const result = substituteVariables('Args: $ARGUMENTS', store, [
      'src/',
      '--verbose',
    ]);

    expect(result).toBe('Args: src/ --verbose');
  });

  it('substitutes positional args $1, $2', () => {
    const store = createVariableStore();

    const result = substituteVariables('Review $1 with $2', store, [
      'file.ts',
      'strict',
    ]);

    expect(result).toBe('Review file.ts with strict');
  });

  it('removes unmatched positional args', () => {
    const store = createVariableStore();

    const result = substituteVariables('$1 and $2 and $3', store, ['only']);

    expect(result).toBe('only and  and ');
  });

  it('replaces missing named vars with empty string', () => {
    const store = createVariableStore();

    const result = substituteVariables('Missing: $notfound', store);

    expect(result).toBe('Missing: ');
  });

  it('handles variable at start of string', () => {
    const store = createVariableStore();
    store.named.set('prefix', 'START');

    const result = substituteVariables('$prefix: rest', store);

    expect(result).toBe('START: rest');
  });

  it('handles variable at end of string', () => {
    const store = createVariableStore();
    store.last = 'END';

    const result = substituteVariables('Result: $_', store);

    expect(result).toBe('Result: END');
  });

  it('does not substitute partial matches', () => {
    const store = createVariableStore();
    store.named.set('var', 'VALUE');

    // $variable should not match $var
    const result = substituteVariables('$variable', store);

    expect(result).toBe('');
  });
});

describe('getSubstitutionList', () => {
  it('returns empty list when no variables used', () => {
    const store = createVariableStore();

    const list = getSubstitutionList('No vars here', store);

    expect(list).toEqual([]);
  });

  it('detects $_ usage', () => {
    const store = createVariableStore();
    store.last = 'something';

    const list = getSubstitutionList('Using $_', store);

    expect(list).toContain('$_');
  });

  it('does not report $_ if empty', () => {
    const store = createVariableStore();

    const list = getSubstitutionList('Using $_', store);

    expect(list).not.toContain('$_');
  });

  it('detects named variables', () => {
    const store = createVariableStore();
    store.named.set('issues', 'stuff');
    store.named.set('unused', 'other');

    const list = getSubstitutionList('Fix $issues please', store);

    expect(list).toContain('$issues');
    expect(list).not.toContain('$unused');
  });

  it('returns multiple variables', () => {
    const store = createVariableStore();
    store.named.set('a', 'A');
    store.named.set('b', 'B');
    store.last = 'last';

    const list = getSubstitutionList('$a and $b and $_', store);

    expect(list).toHaveLength(3);
    expect(list).toContain('$a');
    expect(list).toContain('$b');
    expect(list).toContain('$_');
  });
});
