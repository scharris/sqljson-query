import {promises as fs} from 'fs'; // for some older node versions (e.g. v10)
import * as cbfs from 'fs';

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
