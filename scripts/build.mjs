import { mkdir, cp, rm, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const digest=createHash('sha256');
for(const name of (await readdir('src',{recursive:true})).sort()){
  if((await stat('src/'+name)).isFile())digest.update(name).update(await readFile('src/'+name));
}
const assets='assets/'+digest.digest('hex').slice(0,16);
await rm('dist', { recursive: true, force: true });
await mkdir('dist/'+assets, { recursive: true });
await cp('src', 'dist/'+assets, { recursive: true });
await cp('public', 'dist', { recursive: true });
const html=(await readFile('index.html','utf8')).replaceAll('./src/', './'+assets+'/');
await writeFile('dist/index.html',html);
await writeFile('dist/404.html',html);
await writeFile('dist/.nojekyll', '');
const config = JSON.parse(await readFile('public/config.json', 'utf8'));
config.supabaseUrl = process.env.HOWDY_SUPABASE_URL || config.supabaseUrl;
config.publishableKey = process.env.HOWDY_SUPABASE_PUBLISHABLE_KEY || config.publishableKey;
await writeFile('dist/config.json', JSON.stringify(config, null, 2));
console.log('Built GitHub Pages frontend in dist/');
