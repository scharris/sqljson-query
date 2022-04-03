import path from 'path';
import * as os from 'os';
import { Dirent, promises as fs } from 'fs'; // for some older node versions (e.g. v10)
import * as cbfs from 'fs';

interface FileWriteOptions { avoidWritingSameContents: boolean };

export async function writeTextFile
  (
    path: string,
    text: string,
    opts?: FileWriteOptions
  )
  : Promise<void>
{
  const exists = await fileExists(path);
  const write = !exists || (opts?.avoidWritingSameContents ? await readTextFile(path) !== text : true);

  if (write)
    await fs.writeFile(path, text);
}

export async function readTextFile(path: string): Promise<string>
{
  return await fs.readFile(path, 'utf8');
}

export function readTextFileSync(path: string): string
{
  return cbfs.readFileSync(path, 'utf8');
}

export async function makeDir(path: string, opts?: any): Promise<void>
{
  await fs.mkdir(path, opts);
}

export async function readDir(path: string): Promise<Dirent[]>
{
  return fs.readdir(path, { withFileTypes: true });
}

export function readDirSync(path: string): Dirent[]
{
  return cbfs.readdirSync(path, { withFileTypes: true });
}

export async function makeTempDir(prefix: string): Promise<string>
{
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

export async function rm(path: string, opts?: any): Promise<void>
{
  await fs.rm(path, opts);
}

function dirEntExists(path: string): Promise<boolean>
{
  return new Promise((resolve, reject) => {
    cbfs.access(path, cbfs.constants.F_OK, error => {resolve(!error);});
  });
}

export async function fileExists(path: string): Promise<boolean>
{
  return (await dirEntExists(path)) && (await fs.stat(path)).isFile();
}

export async function dirExists(path: string): Promise<boolean>
{
  return (await dirEntExists(path)) && (await fs.stat(path)).isDirectory();
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
