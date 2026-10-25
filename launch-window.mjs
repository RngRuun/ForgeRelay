import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const executable=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../ForgeRelay-App/win-unpacked/ForgeRelay.exe');
const child=spawn(executable,[],{detached:true,stdio:'ignore',windowsHide:false,cwd:path.dirname(executable)});
child.on('error',err=>{console.error('Cannot launch application window: '+err.message);process.exitCode=1;});
child.unref();
