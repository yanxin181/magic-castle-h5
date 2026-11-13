const { chromium } = require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs');
const assert = require('assert/strict');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1400,height:900}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://localhost:7456',{waitUntil:'networkidle'});
  await page.waitForTimeout(1200);
  await page.evaluate(async()=>{
   const cc=await System.import('cc');
   const nodes=[]; const walk=n=>{nodes.push(n);n.children.forEach(walk)};walk(cc.director.getScene());
   const all=nodes.flatMap(n=>n.components);
   window.introTest={cc,gm:all.find(c=>cc.js.getClassName(c)==='GameManager'),intro:all.find(c=>cc.js.getClassName(c)==='IntroController'),enemies:nodes.find(n=>n.name==='Enemies')};
  });
  const state=()=>page.evaluate(()=>({phase:introTest.gm.phase,enemies:introTest.enemies.children.length,intro:!!introTest.intro.root,frames:introTest.intro.frames.size,cues:[...introTest.intro.cues],sounds:[...introTest.intro.soundClips.keys()]}));
  const results={};
  await page.mouse.click(700,553);
  await page.waitForTimeout(1700);
  results.during=await state();
  assert.equal(results.during.phase,'start');assert.equal(results.during.enemies,0);assert.equal(results.during.frames,15);assert.ok(results.during.intro);
  await page.locator('#GameCanvas').screenshot({path:'artifacts/intro/hero-shot.png'});
  await page.waitForTimeout(3500);
  await page.locator('#GameCanvas').screenshot({path:'artifacts/intro/dragon-shot.png'});
  results.reveal=await state();assert.ok(results.reveal.cues.includes('reveal'));assert.equal(results.reveal.sounds.length,3);
  await page.waitForFunction(()=>!introTest.intro.root,null,{timeout:45000});
  results.completed=await state();assert.equal(results.completed.phase,'battle');assert.ok(!results.completed.intro && results.completed.enemies>=4);assert.ok(results.completed.cues.includes('hero-voice'));
  await page.evaluate(()=>introTest.gm.resetGame());await page.waitForTimeout(120);
  await page.mouse.click(700,553);await page.waitForTimeout(450);await page.mouse.click(1240,154);await page.waitForTimeout(120);
  results.skipped=await state();assert.equal(results.skipped.phase,'battle');assert.equal(results.skipped.enemies,4);assert.equal(results.skipped.intro,false);
  await page.evaluate(()=>{introTest.gm.resetGame();introTest.intro.loading=new Promise(resolve=>{introTest.resolveLoad=resolve;});});
  await page.waitForTimeout(120);await page.mouse.click(700,553);await page.waitForTimeout(100);assert.equal((await state()).phase,'start');
  await page.mouse.click(1240,154);await page.evaluate(()=>introTest.resolveLoad(true));await page.waitForTimeout(150);
  results.loadingSkip=await state();assert.equal(results.loadingSkip.phase,'battle');assert.equal(results.loadingSkip.enemies,4);assert.equal(results.loadingSkip.intro,false);
  await page.evaluate(()=>{introTest.gm.resetGame();introTest.intro.loading=Promise.resolve(false);});
  await page.waitForTimeout(120);await page.mouse.click(700,553);await page.waitForTimeout(120);
  results.assetFallback=await state();assert.equal(results.assetFallback.phase,'battle');assert.equal(results.assetFallback.intro,false);
  assert.deepEqual(errors,[]);
  fs.writeFileSync('artifacts/intro/validation.json',JSON.stringify({results,errors},null,2));
  console.log('PASS: playback, sound cues, replay, skip, delayed-load skip, asset failure fallback; no browser errors.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
