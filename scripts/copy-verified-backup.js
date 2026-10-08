// Copy a verified private backup to an explicitly selected existing destination.
const fs = require('node:fs/promises');
const { createReadStream, constants } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
async function hash(file) {
  const h=createHash('sha256');
  for await(const chunk of createReadStream(file))h.update(chunk);
  return h.digest('hex');
}
function within(root,name) {
  const file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep))throw new Error('Backup entry is outside its directory.');
  return file;
}
async function main() {
  if(!process.argv[2])throw new Error('Usage: node scripts/copy-verified-backup.js <backup> [existing private destination]');
  const source=await fs.realpath(process.argv[2]);
  const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8'));
  const proof=JSON.parse(await fs.readFile(path.join(source,'pglite-restore-report.json'),'utf8'));
  if(!manifest.completed||!manifest.archiveReadable||!proof.passed)throw new Error('A complete backup and successful restore are required.');
  const files=[...manifest.files.map(f=>({name:f.name,sha256:f.sha256})),...manifest.storage.map(f=>({name:f.localFile,sha256:f.sha256}))];
  for(const name of ['manifest.json','pglite-restore-report.json','source-reference.json','database-toc.txt'])files.push({name,sha256:await hash(within(source,name))});
  let bytes=0;
  for(const file of files) {
    const input=within(source,file.name);
    if(await hash(input)!==file.sha256)throw new Error(`Checksum mismatch: ${file.name}`);
    bytes+=(await fs.stat(input)).size;
  }
  if(!process.argv[3]) {console.log(JSON.stringify({sourceVerified:true,files:files.length,bytes,copied:false}));return;}
  const destination=await fs.realpath(process.argv[3]);
  if(path.parse(source).root.toLowerCase()===path.parse(destination).root.toLowerCase())throw new Error('Choose a different drive or a private network share; another folder on this disk is not an external backup.');
  const output=path.join(destination,`convive-${path.basename(source)}`);
  // Fail if the target exists: never overwrite an earlier copy.
  await fs.mkdir(output);
  for(const file of files) {
    const target=within(output,file.name);
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.copyFile(within(source,file.name),target,constants.COPYFILE_EXCL);
    if(await hash(target)!==file.sha256)throw new Error(`Destination checksum mismatch: ${file.name}`);
  }
  await fs.writeFile(path.join(output,'copy-verification.json'),JSON.stringify({completedAt:new Date().toISOString(),files:files.length,bytes,passed:true},null,2));
  console.log(JSON.stringify({copied:true,verified:true,directory:output,files:files.length,bytes}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
