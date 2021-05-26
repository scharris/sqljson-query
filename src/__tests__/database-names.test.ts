import {assertEquals} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import {quoteIfNeeded, caseNormalizeName} from '../util/database-names.ts';

Deno.test('leave uppercase name unquoted for stored-uppercase db', () => {
  assertEquals(quoteIfNeeded('UC', 'INSENSITIVE_STORED_UPPER'), 'UC');
});

Deno.test('leave lowercase name unquoted for stored-lowercase db', () => {
  assertEquals(quoteIfNeeded('lc', 'INSENSITIVE_STORED_LOWER'), 'lc');
});

Deno.test('quote mixedcase name for stored-uppercase db', () => {
  assertEquals(quoteIfNeeded('mC', 'INSENSITIVE_STORED_UPPER'), '"mC"');
});

Deno.test('quote mixedcase name for stored-lowercase db', () => {
  assertEquals(quoteIfNeeded('mC', 'INSENSITIVE_STORED_LOWER'), '"mC"');
});

Deno.test('leave quoted name quoted for stored-lowercase db', () => {
  assertEquals(quoteIfNeeded('"mC"', 'INSENSITIVE_STORED_LOWER'), '"mC"');
});

Deno.test('leave quoted name quoted for stored-uppercase db', () => {
  assertEquals(quoteIfNeeded('"mC"', 'INSENSITIVE_STORED_UPPER'), '"mC"');
});

Deno.test('leave quoted name quoted for stored-lowercase db', () => {
  assertEquals(quoteIfNeeded('"mC"', 'INSENSITIVE_STORED_LOWER'), '"mC"');
});

Deno.test('nromalize quoted name as quoted for stored-lowercase db', () => {
  assertEquals(caseNormalizeName('"mC"', 'INSENSITIVE_STORED_LOWER'), '"mC"');
});

Deno.test('normalize quoted name as quoted for stored-uppercase db', () => {
  assertEquals(caseNormalizeName('"mC"', 'INSENSITIVE_STORED_UPPER'), '"mC"');
});

Deno.test('normalize unquoted name to uppercase for stored-uppercase db', () => {
  assertEquals(caseNormalizeName('mC', 'INSENSITIVE_STORED_UPPER'), 'MC');
});

Deno.test('normalize unquoted name to lowercase for stored-lowercase db', () => {
  assertEquals(caseNormalizeName('mC', 'INSENSITIVE_STORED_LOWER'), 'mc');
});
