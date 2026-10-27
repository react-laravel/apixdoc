// Run only on the builder. No credentials, database connection or package install.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = await fs.realpath(process.cwd());
const output = path.join(root, '.next/standalone');
const require = createRequire(path.join(root, 'package.json'));
const { nodeFileTrace } = require('next/dist/compiled/@vercel/nft');
// pg has optional/dynamic imports; trace the installed driver explicitly. The
// adapter may be inlined by Next, so require('@prisma/adapter-pg') is not a probe.
const traced = await nodeFileTrace([require.resolve('pg')], {
  base: root, processCwd: root, mixedModules: true,
});
for (const name of traced.fileList) {
  if (!name.startsWith('node_modules/')) throw Error('Driver trace escaped dependencies');
  const source = path.join(root, name);
  if (!(await fs.stat(source)).isFile()) continue;
  const target = path.join(output, name);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}
for (const name of ['.next/static', 'public', 'prisma/migrations', 'node_modules/.prisma/client']) {
  await fs.cp(path.join(root, name), path.join(output, name), { recursive: true, dereference: true });
}
await fs.copyFile(path.join(root, 'package-lock.json'), path.join(output, 'package-lock.json'));
const runtimeRequire = createRequire(path.join(output, 'package.json'));
runtimeRequire('pg');
runtimeRequire('@prisma/client');
console.log(JSON.stringify({ standalone: true, generatedPrismaClient: true, pgDriver: true, migrationSQLIsMetadataOnly: true }));
