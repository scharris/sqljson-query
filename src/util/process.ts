
export function exit(code: number): never
{
  return Deno.exit(code);
}

export function cwd(): string
{
  return Deno.cwd();
}
