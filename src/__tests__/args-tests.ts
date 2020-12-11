import {parseAppArgs} from '../util/args';

const args = ["--param1", "value1", "--param2", "value2", "positionalArgValue"];

test('parse valid app args', () => {
  const parsed: any = parseAppArgs(args, ["param1"], ["param2"], 0);
  expect(typeof parsed).toBe("object");
  expect(parsed._).toEqual(["positionalArgValue"]);
  expect(parsed.param1).toBe("value1");
  expect(parsed.param2).toBe("value2");
});

test('reject app args with missing required param', () => {
  const parsed: any = parseAppArgs(args, ["param1", "missingParam"], ["param2"], 0);
  expect(typeof parsed).toBe("string");
  expect(parsed).toMatch(/missing required parameter/i);
});

test('reject app args with unrecognized param', () => {
  const parsed: any = parseAppArgs(args, ["param1"], ["otherParam2"], 0);
  expect(typeof parsed).toBe("string");
  expect(parsed).toMatch(/parameter .* is not valid/i);
});

test('reject app args with too many positional params', () => {
  const parsed: any = parseAppArgs(args, ["param1"], ["param2"], 0, 0);
  expect(typeof parsed).toBe("string");
  expect(parsed).toMatch(/expected at most [0-9]+ positional/i);
});

test('reject app args with too few positional params', () => {
  const parsed: any = parseAppArgs(args, ["param1"], ["param2"], 2, 2);
  expect(typeof parsed).toBe("string");
  expect(parsed).toMatch(/expected at least [0-9]+ positional/i);
});
