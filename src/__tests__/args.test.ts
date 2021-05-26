import { assertEquals, assertMatch } from "https://deno.land/std@0.97.0/testing/asserts.ts";
import {parseArgs} from '../util/args.ts';

const args = ["--param1", "value1", "--param2", "value2", "positionalArgValue"];

Deno.test('parse valid app args', () => {
  const parsed: any = parseArgs(args, ["param1"], ["param2"], 0);
  assertEquals(typeof parsed, "object");
  assertEquals(parsed._, ["positionalArgValue"]);
  assertEquals(parsed.param1, "value1");
  assertEquals(parsed.param2, "value2");
});

Deno.test('reject app args with missing required param', () => {
  const parsed: any = parseArgs(args, ["param1", "missingParam"], ["param2"], 0);
  assertEquals(typeof parsed, "string");
  assertMatch(parsed, /missing required parameter/i);
});

Deno.test('reject app args with unrecognized param', () => {
  const parsed: any = parseArgs(args, ["param1"], ["otherParam2"], 0);
  assertEquals(typeof parsed, "string");
  assertMatch(parsed, /parameter .* is not valid/i);
});

Deno.test('reject app args with too many positional params', () => {
  const parsed: any = parseArgs(args, ["param1"], ["param2"], 0, 0);
  assertEquals(typeof parsed, "string");
  assertMatch(parsed, /expected at most [0-9]+ positional/i);
});

Deno.test('reject app args with too few positional params', () => {
  const parsed: any = parseArgs(args, ["param1"], ["param2"], 2, 2);
  assertEquals(typeof parsed, "string");
  assertMatch(parsed, /expected at least [0-9]+ positional/i);
});
