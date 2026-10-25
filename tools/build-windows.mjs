import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
if(process.platform!=='win32')throw Error('Build the Windows portable application on Windows or with the Windows GitHub Actions workflow.');
await import('./prepare-desktop-runtime.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),desktop=path.join(root,'desktop');
const result=spawnSync(process.execPath,[path.join(desktop,'node_modules/electron-builder/out/cli/cli.js'),'--win','portable','--publish','never',...process.argv.slice(2)],{cwd:desktop,stdio:'inherit',windowsHide:true,env:{...process.env,ELECTRON_BUILDER_COMPRESSION_LEVEL:'3'}});
if(result.error)throw result.error;process.exitCode=result.status??1;
