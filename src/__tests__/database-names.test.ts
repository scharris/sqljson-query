import {caseNormalizeName} from '../util/database-names';

test('nromalize quoted name as quoted for stored-lowercase db', () => {
  expect(caseNormalizeName('"mC"', 'INSENSITIVE_STORED_LOWER')).toBe('"mC"');
});

test('normalize quoted name as quoted for stored-uppercase db', () => {
  expect(caseNormalizeName('"mC"', 'INSENSITIVE_STORED_UPPER')).toBe('"mC"');
});

test('normalize unquoted name to uppercase for stored-uppercase db', () => {
  expect(caseNormalizeName('mC', 'INSENSITIVE_STORED_UPPER')).toBe('MC');
});

test('normalize unquoted name to lowercase for stored-lowercase db', () => {
  expect(caseNormalizeName('mC', 'INSENSITIVE_STORED_LOWER')).toBe('mc');
});
