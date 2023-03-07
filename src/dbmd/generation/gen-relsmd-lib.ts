import {promises as fs} from 'fs';
import {generateRelationsMetadataSource} from '../relations-md-source-generator';
import {replaceAll} from './utils';
import path from "path";

export interface RelsMdGenerationOptions {
  dbmdFile: string;
  tsOutputDir?: string | null;
  tsFileName?: string | null;
  javaOutputBaseDir?: string | null;
  javaClassName?: string | null;
  javaPackage?: string | null;
}

export async function generateRelationsMetadata(opts: RelsMdGenerationOptions)
{
  if (!opts.tsOutputDir && !opts.javaOutputBaseDir)
    throw new Error('No output directory option was specified for relations metadata generation.');

  if (opts.tsOutputDir)
  {
    await fs.mkdir(opts.tsOutputDir, {recursive: true});

    const fileNameNoExt = opts.tsFileName ? path.parse(opts.tsFileName).name : "relations-metadata";

    console.log(`Writing TS relation metadatas source file to ${opts.tsOutputDir}/${fileNameNoExt}.ts.`);

    await generateRelationsMetadataSource(opts.dbmdFile, opts.tsOutputDir, fileNameNoExt, 'TS');
  }

  // Write Java relation metadatas if specified.
  if (opts.javaOutputBaseDir)
  {
    if (!opts.javaPackage)
      throw new Error('javaRelsMdPkg options is required for Java source generation');

    const jpkg = opts.javaPackage;

    const javaRelsMdOutputDir = `${opts.javaOutputBaseDir}/${replaceAll(jpkg, '.','/')}`;

    const fileNameNoExt = opts.javaClassName ?? "RelationsMetadata";

    await fs.mkdir(javaRelsMdOutputDir, {recursive: true});

    console.log(`Writing Java relations metadata file to ${javaRelsMdOutputDir}/${fileNameNoExt}.java.`);

    await generateRelationsMetadataSource(opts.dbmdFile, javaRelsMdOutputDir, fileNameNoExt, 'Java', jpkg);
  }
}