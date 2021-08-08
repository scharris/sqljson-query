
export function exit(code: number): never
{
  return process.exit(code);
}

export function cwd(): string
{
  return process.cwd();
}
