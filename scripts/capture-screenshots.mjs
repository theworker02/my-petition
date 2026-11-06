import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base='http://127.0.0.1:5173';
await mkdir('docs/screenshots',{recursive:true});
let ready=false;
for(let attempt=0;attempt<45;attempt++){
  try{
    const [app,health]=await Promise.all([fetch(base),fetch('http://127.0.0.1:8787/api/health')]);
    if(app.ok&&health.ok){ready=true;break;}
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,2000));
}
if(!ready) throw new Error('Vite or the Cloudflare Worker did not start within the readiness window.');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[];
async function screenshot(path,name,viewport){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce',colorScheme:'light'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(name+': '+e.message));
  await page.goto(base+path,{waitUntil:'networkidle',timeout:30000});
  if(path==='/'||path==='/explore')await page.locator('.proposal-card').first().waitFor();
  if(path.startsWith('/proposal/'))await page.locator('.vote-panel').waitFor();
  if(path==='/create'){
    await page.locator('.create-form').waitFor();
    await page.locator('#creator-name').fill('Demo Organizer');
    await page.locator('#proposal-title').fill('Should our neighborhood create more community gardens?');
    await page.locator('#proposal-description').fill('This local demonstration proposes creating additional shared gardening spaces, with public input on suitable locations, ongoing upkeep, accessible design, and available funding sources.');
    await page.locator('#proposal-category').selectOption('Community');
  }
  await page.waitForTimeout(850);
  await page.screenshot({path:'docs/screenshots/'+name+'.png',fullPage:true,animations:'disabled'});
  console.log('Captured docs/screenshots/'+name+'.png');
  await context.close();
}
try{
  await screenshot('/','home-desktop',{width:1440,height:960});
  await screenshot('/explore','explore-desktop',{width:1440,height:960});
  await screenshot('/proposal/more-street-trees-demo','petition-detail-desktop',{width:1440,height:960});
  await screenshot('/create','create-petition-desktop',{width:1440,height:960});
  await screenshot('/proposal/more-street-trees-demo','petition-detail-mobile',{width:390,height:844});
  if(errors.length)throw new Error('Page errors:\n'+errors.join('\n'));
  console.log('Screenshot capture complete. All screenshots use local demo data only.');
}finally{await browser.close();}
