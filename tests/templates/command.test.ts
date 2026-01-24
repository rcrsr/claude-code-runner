import { describe, it, expect } from 'vitest';
import {
  parseGenericFrontmatter,
  stripFrontmatter,
} from '../../src/templates/command.js';

describe('stripFrontmatter', () => {
  it('strips YAML frontmatter', () => {
    const content = `---
title: Test
description: A test command
---
The actual content here`;

    expect(stripFrontmatter(content)).toBe('The actual content here');
  });

  it('returns content unchanged if no frontmatter', () => {
    const content = 'Just plain markdown content';
    expect(stripFrontmatter(content)).toBe('Just plain markdown content');
  });

  it('returns content unchanged if frontmatter not closed', () => {
    const content = `---
title: Test
No closing delimiter`;

    expect(stripFrontmatter(content)).toBe(content);
  });

  it('handles empty frontmatter', () => {
    const content = `---
---
Content after empty frontmatter`;

    expect(stripFrontmatter(content)).toBe('Content after empty frontmatter');
  });
});

describe('parseGenericFrontmatter', () => {
  it('parses all key-value pairs', () => {
    const content = `---
title: Test Document
author: John Doe
version: 1.0
custom-field: some value
---
Body content`;

    const result = parseGenericFrontmatter(content);
    expect(result.frontmatter).toEqual({
      title: 'Test Document',
      author: 'John Doe',
      version: '1.0',
      'custom-field': 'some value',
    });
    expect(result.body).toBe('Body content');
  });

  it('returns empty frontmatter when no frontmatter present', () => {
    const content = 'Just plain content';
    const result = parseGenericFrontmatter(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe('Just plain content');
  });

  it('returns empty frontmatter when frontmatter not closed', () => {
    const content = `---
title: Test
No closing delimiter`;

    const result = parseGenericFrontmatter(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content);
  });

  it('strips quotes from values', () => {
    const content = `---
single: 'quoted value'
double: "another value"
---
Body`;

    const result = parseGenericFrontmatter(content);
    expect(result.frontmatter).toEqual({
      single: 'quoted value',
      double: 'another value',
    });
  });

  it('skips empty values', () => {
    const content = `---
title: Test
empty:
another: value
---
Body`;

    const result = parseGenericFrontmatter(content);
    expect(result.frontmatter).toEqual({
      title: 'Test',
      another: 'value',
    });
  });

  it('handles empty frontmatter block', () => {
    const content = `---
---
Content after empty frontmatter`;

    const result = parseGenericFrontmatter(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe('Content after empty frontmatter');
  });
});
