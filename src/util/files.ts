import * as fs from 'fs';

export function dirEntExists(path: string): Promise<boolean>
{
  return new Promise((resolve, reject) => {
    fs.access(path, fs.constants.F_OK, error => {resolve(!error);});
  });
}