import { describe, it, expect } from 'vitest';
import { stripFrontmatter } from '../../src/templates/command.js';

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
