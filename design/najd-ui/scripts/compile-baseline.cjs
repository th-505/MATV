const fs=require('fs'),path=require('path'),vm=require('vm'),cp=require('child_process');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'ui/manifest.json')));
for(const r of manifest.filter(x=>x.origin==='baseline')){
 const file=path.join(root,'ui',r.path);let text=fs.readFileSync(file,'utf8');const scripts=[...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]);const config=scripts.find(s=>s.includes('tailwind.config'));const sandbox={tailwind:{},require};if(config){vm.runInNewContext(config,sandbox,{timeout:1000});}const cfg=sandbox.tailwind.config||{};cfg.content=[file];cfg.plugins=[];
 const configPath=path.join(root,'.tailwind-build.cjs');fs.writeFileSync(configPath,'module.exports='+JSON.stringify({...cfg,plugins:[]})+';');
 cp.execFileSync(process.execPath,[path.join(root,'node_modules/tailwindcss/lib/cli.js'),'-c',configPath,'-i',path.join(root,'ui/shared/tailwind-input.css'),'-o',path.join(path.dirname(file),'compiled.css'),'--minify'],{stdio:'pipe'});
 text=text.replace(/<script\b[^>]*src="https:\/\/cdn.tailwindcss.com[^>]*><\/script>/g,'').replace(/<script\b[^>]*>[\s\S]*?tailwind.config[\s\S]*?<\/script>/g,'');
 text=text.replace('</head>','<link rel="stylesheet" href="compiled.css"></head>');fs.writeFileSync(file,text);
}
fs.rmSync(path.join(root,'.tailwind-build.cjs'),{force:true});console.log('Compiled 31 baseline styles locally');
