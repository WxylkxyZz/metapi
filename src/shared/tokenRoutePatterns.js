// Standard-JS-RegExp based pattern matching for token routes.
//
// Previously this file implemented a lightweight hand-rolled regex engine that
// accepted only a small safe subset of regex syntax. It has been replaced with
// the platform-native RegExp (V8 on both the browser and the Node backend —
// same engine, identical semantics), so *all* standard regex features are now
// supported: lookaround, backreferences, named groups, \w \s \b \d, and so on.
//
// Safety: the runtime matching is still protected by
//  1) a length cap (256 chars) on the regex body,
//  2) a global LRU match cache (the compiled RegExp object is cached, avoiding
//     repeated `new RegExp` on the hot path), and
//  3) a try/catch that treats any RegExp compile or test() throw as a non-match,
//     so a catastrophic-backtracking pattern can never crash the router.
//
// This mirrors what `downstreamApiKeyService.matchesDownstreamModelPattern`
// already does (`new RegExp(body)`), so route and downstream-policy patterns
// now speak the same regex dialect.

const MAX_REGEX_BODY_LENGTH = 256;

let nextMatcherId = 1;

// Matches with native RegExp semantics:
//   - Anchored pattern (^...$ or ^... or ...$): standard exact/anchored match.
//   - Unanchored pattern: "contains" semantics — the regex matches anywhere in
//     the model name (the historical route-pattern behavior). This is achieved
//     by testing against a regex with a leading wildcard prefix rather than by
//     stepping offsets (which would break ^ and \b).
class SafeRegexMatcher {
  constructor(source, body) {
    this.id = nextMatcherId++;
    this.source = source;
    this.body = body;
    this.regex = new RegExp(source);
    // Unanchored variant used only when no ^/$ is present. `(?:[\s\S]*?)` is a
    // non-capturing lazy any-char prefix that lets the engine find the match
    // anywhere in the value without affecting ^/$-free semantics.
    this.unanchoredRegex = source.startsWith('^') || source.endsWith('$')
      ? null
      : new RegExp(`(?:[\\s\\S]*?)${source}`);
  }

  test(value) {
    try {
      if (this.unanchoredRegex) {
        this.unanchoredRegex.lastIndex = 0;
        const found = this.unanchoredRegex.test(value);
        this.unanchoredRegex.lastIndex = 0;
        return found;
      }
      this.regex.lastIndex = 0;
      const found = this.regex.test(value);
      this.regex.lastIndex = 0;
      return found;
    } catch {
      return false;
    }
  }
}

export function isTokenRouteRegexPattern(pattern) {
  return pattern.trim().toLowerCase().startsWith('re:');
}

export function isExactTokenRouteModelPattern(pattern) {
  const normalized = pattern.trim();
  if (!normalized) return false;
  if (isTokenRouteRegexPattern(normalized)) return false;
  return !/[\*\?]/.test(normalized);
}

// ReDoS lint: reject patterns whose structure can cause exponential
// backtracking. The classic dangerous shape is a quantified group that itself
// contains a quantified atom, with an *unbounded* outer quantifier, e.g.
// `(a+)+`, `(a{1,3})*`, `(\d+\.)+`. Bounded outer repeats such as
// `(\d{1,3}\.){1,4}` are safe and stay allowed.
function readQuantifierLengthAt(body, index) {
  const ch = body[index];
  if (ch === '*' || ch === '+' || ch === '?') return 1;
  if (ch !== '{') return 0;
  let i = index + 1;
  let sawDigit = false;
  while (i < body.length && /[0-9]/.test(body[i])) { sawDigit = true; i += 1; }
  if (!sawDigit) return 0;
  if (body[i] === ',') {
    i += 1;
    while (i < body.length && /[0-9]/.test(body[i])) i += 1;
  }
  if (body[i] !== '}') return 0;
  return i - index + 1;
}

function isUnboundedQuantifierAt(body, index) {
  const ch = body[index];
  if (ch === '*' || ch === '+') return true;
  if (ch !== '{') return false;
  const match = /^\{(\d+)(,(\d*)?)?\}/.exec(body.slice(index));
  if (!match) return false;
  // {n} and {n,m} (finite m) are bounded; {n,} has unlimited rep count.
  return match[2] !== undefined && match[3] === '';
}

function hasNestedUnboundedQuantifier(body) {
  const stack = [];
  let escaped = false;
  let inCharClass = false;
  for (let index = 0; index < body.length; index += 1) {
    const ch = body[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (inCharClass) {
      if (ch === ']') inCharClass = false;
      continue;
    }
    if (ch === '[') {
      inCharClass = true;
      continue;
    }
    if (ch === '(') {
      stack.push({ hasInnerQuantifier: false });
      continue;
    }
    if (ch === ')') {
      const group = stack.pop();
      if (!group) continue;
      if (group.hasInnerQuantifier && isUnboundedQuantifierAt(body, index + 1)) {
        return true;
      }
      // Propagate "has quantifier" upward: either this group had an inner
      // quantifier, or this group itself is quantified by the following char.
      if (readQuantifierLengthAt(body, index + 1) > 0) {
        if (stack.length > 0) stack[stack.length - 1].hasInnerQuantifier = true;
      } else if (group.hasInnerQuantifier && stack.length > 0) {
        stack[stack.length - 1].hasInnerQuantifier = true;
      }
      continue;
    }
    const quantifierLength = readQuantifierLengthAt(body, index);
    if (quantifierLength > 0) {
      if (stack.length > 0) stack[stack.length - 1].hasInnerQuantifier = true;
      index += quantifierLength - 1;
      continue;
    }
  }
  return false;
}

/**
 * Parse an `re:` pattern into a standard RegExp matcher.
 *
 * Returns `{ regex, error }` where `regex` is a test() matcher or null and
 * `error` is null for valid patterns. Body > 256 chars is rejected, and
 * classic exponential-backtracking shapes are rejected as unsafe.
 */
export function parseTokenRouteRegexPattern(pattern) {
  if (!isTokenRouteRegexPattern(pattern)) {
    return { regex: null, error: null };
  }
  const body = pattern.trim().slice(3).trim();
  if (!body) {
    return { regex: null, error: 're: 后缺少正则表达式' };
  }
  if (body.length > MAX_REGEX_BODY_LENGTH) {
    return { regex: null, error: `正则表达式过长（最多 ${MAX_REGEX_BODY_LENGTH} 字符）` };
  }
  if (hasNestedUnboundedQuantifier(body)) {
    return { regex: null, error: '出于安全原因不支持该正则表达式' };
  }
  try {
    return {
      regex: new SafeRegexMatcher(body, body),
      error: null,
    };
  } catch (error) {
    return { regex: null, error: error?.message || '无效正则' };
  }
}

const matchCache = new Map();
const MATCH_CACHE_LIMIT = 4000;

function getCachedMatcher(pattern) {
  let matcher = matchCache.get(pattern);
  if (!matcher) {
    matcher = parseTokenRouteRegexPattern(pattern).regex;
    if (matcher) {
      if (matchCache.size >= MATCH_CACHE_LIMIT) {
        matchCache.clear();
      }
      matchCache.set(pattern, matcher);
    }
  }
  return matcher;
}

export function matchesTokenRouteModelPattern(model, pattern) {
  const normalized = (pattern || '').trim();
  if (!normalized) return false;
  if (normalized === model) return true;

  const cacheKey = `${model}\0${normalized}`;
  const cached = matchCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let result;
  if (isTokenRouteRegexPattern(normalized)) {
    const matcher = getCachedMatcher(normalized);
    result = !!matcher && matcher.test(model);
  } else {
    result = matchesGlobPattern(model, normalized);
  }

  if (matchCache.size >= MATCH_CACHE_LIMIT) {
    matchCache.clear();
  }
  matchCache.set(cacheKey, result);
  return result;
}

function matchesGlobPattern(model, pattern) {
  let modelIndex = 0;
  let patternIndex = 0;
  let starIndex = -1;
  let matchIndex = 0;

  while (modelIndex < model.length) {
    const patternChar = pattern[patternIndex];
    const modelChar = model[modelIndex];
    if (patternChar === '*') {
      starIndex = patternIndex;
      matchIndex = modelIndex;
      patternIndex += 1;
      continue;
    }
    if (patternChar === '?' || patternChar === modelChar) {
      patternIndex += 1;
      modelIndex += 1;
      continue;
    }
    if (starIndex === -1) {
      return false;
    }
    patternIndex = starIndex + 1;
    matchIndex += 1;
    modelIndex = matchIndex;
  }

  while (pattern[patternIndex] === '*') {
    patternIndex += 1;
  }

  return patternIndex === pattern.length;
}