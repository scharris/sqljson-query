import * as strings from '../util/strings';

test('lower camel case', () => {
  expect(strings.lowerCamelCase('some_name')).toBe('someName');
  expect(strings.lowerCamelCase('sOme_name')).toBe('someName');
});

test('upper camel case', () => {
  expect(strings.upperCamelCase('some_name')).toBe('SomeName');
  expect(strings.upperCamelCase('sOme_name')).toBe('SomeName');
});

test('lowercase initials', () => {
  expect(strings.lowerCaseInitials('some_multipart_name', '_')).toBe('smn');
  expect(strings.lowerCaseInitials('some', '_')).toBe('s');
});

test('replace all', () => {
  expect(strings.replaceAll('line 1 $$\n$$ on line 2', '$$', 'repl')).toBe('line 1 repl\nrepl on line 2');
});

test('make names not in set', () => {
  const existingNames = new Set(['aName', 'aName_1', 'bName']);
  expect(strings.makeNameNotInSet('aName', existingNames)).toBe('aName1');
  expect(strings.makeNameNotInSet('aName', existingNames, '_')).toBe('aName_2');
  expect(strings.makeNameNotInSet('cName', existingNames, '_')).toBe('cName');
});

test('indent lines', () => {
  expect(strings.indentLines('line 1\nline 2', 2)).toBe('  line 1\n  line 2');
  expect(strings.indentLines('line 1\nline 2', 2, false)).toBe('line 1\n  line 2');
});

test('un-doublequote', () => {
  expect(strings.unDoubleQuote('not quoted')).toBe('not quoted');
  expect(strings.unDoubleQuote('"abc"')).toBe('abc');
});
