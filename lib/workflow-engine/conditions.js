import { getPath } from './template';

export const CONDITION_OPERATORS = {
  eq: 'equals',
  neq: 'does not equal',
  gt: 'greater than',
  gte: 'greater than or equal',
  lt: 'less than',
  lte: 'less than or equal',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  ends_with: 'ends with',
  in: 'is one of',
  exists: 'has a value',
  not_exists: 'is empty',
};

export const UNARY_OPERATORS = new Set(['exists', 'not_exists']);

function isEmpty(value) {
  return (
    value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
  );
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function normalizeText(value) {
  return isEmpty(value) ? '' : String(value).toLowerCase();
}

function compare(operator, actual, expected) {
  switch (operator) {
    case 'exists':
      return !isEmpty(actual);
    case 'not_exists':
      return isEmpty(actual);
    case 'eq': {
      const a = toNumber(actual);
      const b = toNumber(expected);
      if (a !== null && b !== null) return a === b;
      if (typeof actual === 'boolean' || typeof expected === 'boolean') {
        return String(actual) === String(expected);
      }
      return normalizeText(actual) === normalizeText(expected);
    }
    case 'neq':
      return !compare('eq', actual, expected);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = toNumber(actual);
      const b = toNumber(expected);
      if (a === null || b === null) return false;
      if (operator === 'gt') return a > b;
      if (operator === 'gte') return a >= b;
      if (operator === 'lt') return a < b;
      return a <= b;
    }
    case 'contains':
      if (Array.isArray(actual)) return actual.map(normalizeText).includes(normalizeText(expected));
      return normalizeText(actual).includes(normalizeText(expected));
    case 'not_contains':
      return !compare('contains', actual, expected);
    case 'starts_with':
      return normalizeText(actual).startsWith(normalizeText(expected));
    case 'ends_with':
      return normalizeText(actual).endsWith(normalizeText(expected));
    case 'in': {
      const list = Array.isArray(expected)
        ? expected
        : String(expected ?? '')
            .split(',')
            .map((s) => s.trim());
      return list.map(normalizeText).includes(normalizeText(actual));
    }
    default:
      throw new Error(`Unsupported operator "${operator}"`);
  }
}

/**
 * Evaluates a list of conditions against the execution context.
 * Returns the overall result plus a per-condition trace for the execution log.
 */
export function evaluateConditions({ conditions, match = 'all' }, context) {
  const evaluated = conditions.map((condition) => {
    const actual = getPath(context, condition.field);
    const passed = compare(condition.operator, actual, condition.value);
    return {
      field: condition.field,
      operator: condition.operator,
      expected: UNARY_OPERATORS.has(condition.operator) ? undefined : condition.value,
      actual: actual === undefined ? null : actual,
      passed,
    };
  });
  const result =
    match === 'any' ? evaluated.some((e) => e.passed) : evaluated.every((e) => e.passed);
  return { result, match, evaluated };
}
