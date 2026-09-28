import fs from 'node:fs';
const root=new URL('./',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,root),'utf8');
const engine=read('engine.mjs').replace(/^export /gm,'');
const script=`(()=>{'use strict';\n${engine}\n${read('ui.js')}\n})();`;
fs.writeFileSync(new URL('index.html',root),read('shell.html').replace('/* STYLES */',()=>read('style.css')).replace('/* APPLICATION */',()=>script));
fs.mkdirSync(new URL('android/app/src/main/assets/',root),{recursive:true});
fs.copyFileSync(new URL('index.html',root),new URL('android/app/src/main/assets/index.html',root));
console.log('Built self-contained index.html');
