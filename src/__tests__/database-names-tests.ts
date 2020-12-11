import {quoteIfNeeded, normalizeName} from '../util/database-names';

test('leave uppercase name unquoted for stored-uppercase db', () => {
  expect(quoteIfNeeded('UC', 'INSENSITIVE_STORED_UPPER')).toBe('UC');
});

test('leave lowercase name unquoted for stored-lowercase db', () => {
  expect(quoteIfNeeded('lc', 'INSENSITIVE_STORED_LOWER')).toBe('lc');
});

test('quote mixedcase name for stored-uppercase db', () => {
  expect(quoteIfNeeded('mC', 'INSENSITIVE_STORED_UPPER')).toBe('"mC"');
});

test('quote mixedcase name for stored-lowercase db', () => {
  expect(quoteIfNeeded('mC', 'INSENSITIVE_STORED_LOWER')).toBe('"mC"');
});

test('leave quoted name quoted for stored-lowercase db', () => {
  expect(quoteIfNeeded('"mC"', 'INSENSITIVE_STORED_LOWER')).toBe('"mC"');
});

test('leave quoted name quoted for stored-uppercase db', () => {
  expect(quoteIfNeeded('"mC"', 'INSENSITIVE_STORED_UPPER')).toBe('"mC"');
});

test('leave quoted name quoted for stored-lowercase db', () => {
  expect(quoteIfNeeded('"mC"', 'INSENSITIVE_STORED_LOWER')).toBe('"mC"');
});

test('nromalize quoted name as quoted for stored-lowercase db', () => {
  expect(normalizeName('"mC"', 'INSENSITIVE_STORED_LOWER')).toBe('"mC"');
});

test('normalize quoted name as quoted for stored-uppercase db', () => {
  expect(normalizeName('"mC"', 'INSENSITIVE_STORED_UPPER')).toBe('"mC"');
});

test('normalize unquoted name to uppercase for stored-uppercase db', () => {
  expect(normalizeName('mC', 'INSENSITIVE_STORED_UPPER')).toBe('MC');
});

test('normalize unquoted name to lowercase for stored-lowercase db', () => {
  expect(normalizeName('mC', 'INSENSITIVE_STORED_LOWER')).toBe('mc');
});
