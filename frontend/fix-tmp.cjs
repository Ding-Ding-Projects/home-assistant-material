const fs=require("fs"),path=require("path");
const files=process.argv.slice(2);
for (const f of files){
  let s=fs.readFileSync(f,"utf8");const o=s;
  s=s.replace(/((?:this\.hass|this\._i18n)\.localize|\blocalize)\(\s*"ui\.components\.top_bar_search\.count",/g,(m,x)=>`searchCountText(${x},`);
  if(s===o){console.log("nochange",f);continue;}
  let rel=path.relative(path.dirname(f),"components/ha-top-bar-search").split(path.sep).join("/");
  if(!rel.startsWith("."))rel="./"+rel;
  const imp=`import { searchCountText } from "${rel}";\n`;
  if(!/searchCountText \}|searchCountText,/.test(o)){
    // insert after the last top-level import statement line start: put before first import
    const i=s.indexOf("import ");
    s=s.slice(0,i)+imp+s.slice(i);
  }
  fs.writeFileSync(f,s);console.log("ok",f);
}
