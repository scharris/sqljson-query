import {assertEquals, assert} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import * as strings from '../util/strings.ts';

Deno.test('lower camel case', () => {
  assertEquals(strings.lowerCamelCase('some_name'), 'someName');
  assertEquals(strings.lowerCamelCase('sOme_name'), 'someName');
});

Deno.test('upper camel case', () => {
  assertEquals(strings.upperCamelCase('some_name'), 'SomeName');
  assertEquals(strings.upperCamelCase('sOme_name'), 'SomeName');
});

Deno.test('lowercase initials', () => {
  assertEquals(strings.lowerCaseInitials('some_multipart_name', '_'), 'smn');
  assertEquals(strings.lowerCaseInitials('some', '_'), 's');
});

Deno.test('replace all', () => {
  assertEquals(strings.replaceAll('line 1 $$\n$$ on line 2', '$$', 'repl'), 'line 1 repl\nrepl on line 2');
});

Deno.test('make names not in set', () => {
  const existingNames = new Set(['aName', 'aName_1', 'bName']);
  assertEquals(strings.makeNameNotInSet('aName', existingNames), 'aName1');
  assertEquals(strings.makeNameNotInSet('aName', existingNames, '_'), 'aName_2');
  assertEquals(strings.makeNameNotInSet('cName', existingNames, '_'), 'cName');
});

Deno.test('indent lines', () => {
  assertEquals(strings.indentLines('line 1\nline 2', 2), '  line 1\n  line 2');
  assertEquals(strings.indentLines('line 1\nline 2', 2, false), 'line 1\n  line 2');
});

Deno.test('un-doublequote', () => {
  assertEquals(strings.unDoubleQuote('not quoted'), 'not quoted');
  assertEquals(strings.unDoubleQuote('"abc"'), 'abc');
});

