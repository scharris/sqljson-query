import {dirEntExists} from '../deps.ts';

export async function writeTextFile(path: string, data: string): Promise<void>
{
  await Deno.writeTextFile(path, data);
}

export async function readTextFile(path: string): Promise<string>
{
  return await Deno.readTextFile(path);
}

export function readTextFileSync(path: string): string
{
  return Deno.readTextFileSync(path);
}

export async function makeDir(path: string, opts?: any): Promise<void>
{
  return Deno.mkdirSync(path, opts);
}

export async function fileExists(path: string): Promise<boolean>
{
  return (await dirEntExists(path)) && (await Deno.stat(path)).isFile;
}

export async function dirExists(path: string): Promise<boolean>
{
  return (await dirEntExists(path)) && (await Deno.stat(path)).isDirectory;
}

export async function requireFileExists(path: string, errMsg: string): Promise<void>
{
  if ( !await fileExists(path) )
    throw new Error(errMsg);
}

export async function requireDirExists(path: string, errMsg: string): Promise<void>
{
  if ( !await dirExists(path) )
    throw new Error(errMsg);
}
