import { describe, it, expect } from 'vitest';
import { createStreamParser } from '../../src/parsers/stream.js';

describe('createStreamParser', () => {
  it('parses complete JSON lines', () => {
    const parser = createStreamParser();
    const messages = parser.process('{"type":"system","subtype":"init"}\n');

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: 'system', subtype: 'init' });
  });

  it('handles multiple lines', () => {
    const parser = createStreamParser();
    const messages = parser.process('{"type":"assistant"}\n{"type":"user"}\n');

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ type: 'assistant' });
    expect(messages[1]).toEqual({ type: 'user' });
  });

  it('buffers incomplete lines', () => {
    const parser = createStreamParser();

    const first = parser.process('{"type":"ass');
    expect(first).toHaveLength(0);

    const second = parser.process('istant"}\n');
    expect(second).toHaveLength(1);
    expect(second[0]).toEqual({ type: 'assistant' });
  });

  it('strips ANSI codes from input', () => {
    const parser = createStreamParser();
    const messages = parser.process('\x1b[32m{"type":"result"}\x1b[0m\n');

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: 'result' });
  });

  it('skips invalid JSON', () => {
    const parser = createStreamParser();
    const messages = parser.process('not json\n{"type":"valid"}\n');

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: 'valid' });
  });

  it('flushes remaining buffer', () => {
    const parser = createStreamParser();
    parser.process('partial content');

    expect(parser.flush()).toBe('partial content');
    expect(parser.flush()).toBe('');
  });
});
