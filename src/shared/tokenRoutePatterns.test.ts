import { describe, expect, it } from 'vitest';

describe('token route pattern helpers', () => {
  it('treats bracket-prefixed literal model names as exact patterns', async () => {
    const {
      isExactTokenRouteModelPattern,
      matchesTokenRouteModelPattern,
    } = await import('./tokenRoutePatterns.js');
    expect(isExactTokenRouteModelPattern('[NV]deepseek-v3.1-terminus')).toBe(true);
    expect(matchesTokenRouteModelPattern('[NV]deepseek-v3.1-terminus', '[NV]deepseek-v3.1-terminus')).toBe(true);
    expect(matchesTokenRouteModelPattern('Ndeepseek-v3.1-terminus', '[NV]deepseek-v3.1-terminus')).toBe(false);
  });

  it('supports exact, glob, and standard-regex route matches', async () => {
    const { matchesTokenRouteModelPattern } = await import('./tokenRoutePatterns.js');

    expect(matchesTokenRouteModelPattern('gpt-4o-mini', 'gpt-4o-mini')).toBe(true);
    expect(matchesTokenRouteModelPattern('claude-sonnet-4-6', 'claude-*')).toBe(true);
    expect(matchesTokenRouteModelPattern('claude-sonnet-4-6', 're:^claude-(opus|sonnet)-4-6$')).toBe(true);
    expect(matchesTokenRouteModelPattern('gpt-4o-mini-2025', 're:^gpt-4o-mini-\\d+$')).toBe(true);
  });

  it('rejects regex patterns longer than the allowed body length', async () => {
    const { parseTokenRouteRegexPattern } = await import('./tokenRoutePatterns.js');
    const longBody = 'a'.repeat(260);
    const parsed = parseTokenRouteRegexPattern(`re:${longBody}`);
    expect(parsed.regex).toBeNull();
    expect(parsed.error).toContain('过长');
  });

  it('supports standard regex features: lookaround, backreferences, named groups', async () => {
    const { matchesTokenRouteModelPattern, parseTokenRouteRegexPattern } = await import('./tokenRoutePatterns.js');

    // Lookahead
    expect(matchesTokenRouteModelPattern('gpt-5-0601', 're:gpt-5(?=-\\d{4})')).toBe(true);
    expect(matchesTokenRouteModelPattern('gpt-5', 're:gpt-5(?=-\\d{4})')).toBe(false);
    // Negative lookahead
    expect(matchesTokenRouteModelPattern('claude-opus-3-5', 're:claude-(?!haiku)\\w+')).toBe(true);
    expect(matchesTokenRouteModelPattern('claude-haiku-3-5', 're:claude-(?!haiku)\\w+')).toBe(false);
    // Backreference
    expect(matchesTokenRouteModelPattern('a-b-a', 're:^(\\w+)-b-\\1$')).toBe(true);
    expect(matchesTokenRouteModelPattern('a-b-c', 're:^(\\w+)-b-\\1$')).toBe(false);
    // Named group
    expect(matchesTokenRouteModelPattern('claude-sonnet-4-6', 're:^claude-(?<tier>sonnet|opus)-\\d+-\\d+$')).toBe(true);
    expect(matchesTokenRouteModelPattern('claude-flash-4-6', 're:^claude-(?<tier>sonnet|opus)-\\d+-\\d+$')).toBe(false);
  });

  it('supports standard regex shorthands \\w \\s \\b', async () => {
    const { matchesTokenRouteModelPattern } = await import('./tokenRoutePatterns.js');

    expect(matchesTokenRouteModelPattern('gpt-4o mini', 're:^gpt-\\d+\\w mini$')).toBe(true);
    expect(matchesTokenRouteModelPattern('gpt-4o mini', 're:^gpt-\\d+o\\smini$')).toBe(true);
    expect(matchesTokenRouteModelPattern('gpt-4o mini', 're:^gpt-\\d+o mini$')).toBe(true);
    // \b word boundary
    expect(matchesTokenRouteModelPattern('claude-opus', 're:^claude-opus\\b$')).toBe(true);
    expect(matchesTokenRouteModelPattern('claude-opus-4', 're:^claude-opus\\b$')).toBe(false);
  });

  it('keeps contains-matching semantics for unanchored patterns and anchoring with ^/$', async () => {
    const { matchesTokenRouteModelPattern } = await import('./tokenRoutePatterns.js');

    // Unanchored -> match anywhere in the model name
    expect(matchesTokenRouteModelPattern('ant-claude-opus-1', 're:claude-opus')).toBe(true);
    // Anchored start
    expect(matchesTokenRouteModelPattern('claude-opus-1', 're:^claude')).toBe(true);
    expect(matchesTokenRouteModelPattern('xclaude-opus-1', 're:^claude')).toBe(false);
    // Anchored end
    expect(matchesTokenRouteModelPattern('claude-opus-1', 're:opus-1$')).toBe(true);
    expect(matchesTokenRouteModelPattern('claude-opus-12', 're:opus-1$')).toBe(false);
  });

  it('rejects invalid regex syntax with a parse error', async () => {
    const { parseTokenRouteRegexPattern, matchesTokenRouteModelPattern } = await import('./tokenRoutePatterns.js');

    const parsed = parseTokenRouteRegexPattern('re:^claude-(?<tier)');
    expect(parsed.regex).toBeNull();
    expect(parsed.error).toBeTruthy();
    expect(matchesTokenRouteModelPattern('claude-x', 're:^claude-(?<tier)')).toBe(false);
  });

  it('rejects an empty regex body', async () => {
    const { parseTokenRouteRegexPattern } = await import('./tokenRoutePatterns.js');
    expect(parseTokenRouteRegexPattern('re:').regex).toBeNull();
    expect(parseTokenRouteRegexPattern('re:  ').error).toContain('缺少');
  });

  it('rejects catastrophic nested-quantifier patterns (ReDoS lint)', async () => {
    const { parseTokenRouteRegexPattern } = await import('./tokenRoutePatterns.js');

    // (a+)+$ — exponential backtracking shape
    expect(parseTokenRouteRegexPattern('re:(a+)+$').regex).toBeNull();
    expect(parseTokenRouteRegexPattern('re:(a+)+$').error).toContain('安全');
    // (a{1,3})* — nested unbounded outer repeat
    expect(parseTokenRouteRegexPattern('re:(a{1,3})*$').regex).toBeNull();
    // ((\d+\.)+) inner unbounded group repeated unboundedly
    expect(parseTokenRouteRegexPattern('re:((\\d+\\.)+)+$').regex).toBeNull();
    // (?:a+)+ non-capturing still dangerous
    expect(parseTokenRouteRegexPattern('re:(?:a+)+$').regex).toBeNull();
  });

  it('allows bounded and benign nested patterns', async () => {
    const { parseTokenRouteRegexPattern, matchesTokenRouteModelPattern } = await import('./tokenRoutePatterns.js');

    // Bounded outer repeat is safe
    expect(parseTokenRouteRegexPattern('re:(\\d{1,3}\\.){1,4}x$').regex).not.toBeNull();
    // Capturing group with a plain quantifier, no inner quantifier
    expect(parseTokenRouteRegexPattern('re:(claude|opus)-\\d+$').regex).not.toBeNull();
    // Escaped/literal quantifiers inside groups are not atoms
    expect(parseTokenRouteRegexPattern('re:claude-opus\\d+$').regex).not.toBeNull();
    // Standard, common patterns still work after lint
    expect(matchesTokenRouteModelPattern('gpt-4o-mini-2025', 're:^gpt-4o-mini-\\d+$')).toBe(true);
  });
});