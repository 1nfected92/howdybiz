import { spawnSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
const result=spawnSync(process.env.HOWDY_SUPABASE_CLI||'supabase',['migration','new','howdybiz_initial'],{encoding:'utf8',stdio:'pipe'});
if(result.error||result.status!==0)throw Error('Install the Supabase CLI, then run npm run migration. '+(result.stderr||result.error?.message));
const file=(await readdir('supabase/migrations')).filter(n=>n.endsWith('_howdybiz_initial.sql')).sort().at(-1);
if(!file)throw Error('Supabase CLI did not generate the expected migration.');
await writeFile('supabase/migrations/'+file,await readFile('supabase/schema.sql'));
console.log('Created migration: '+file);
