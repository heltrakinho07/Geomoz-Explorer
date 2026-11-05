/* Run with GIS_PLAYWRIGHT_ROOT pointing to a directory containing node_modules. */
const { chromium } = require(process.env.GIS_PLAYWRIGHT_ROOT
  ? `${process.env.GIS_PLAYWRIGHT_ROOT}/node_modules/playwright` : 'playwright');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const engine = readFileSync((process.env.GIS_PLAYWRIGHT_ROOT ? require.resolve('html2canvas-pro', {paths:[process.env.GIS_PLAYWRIGHT_ROOT]}) : require.resolve('html2canvas')), 'utf8');
    await page.setContent('<div id="map" style="width:320px;height:200px;background:oklch(65% 0.2 25);color:oklch(98% 0 0);border:2px solid oklch(40% .1 240)"><p>GeoMoz · Área de Estudo</p><div style="height:40px;background:linear-gradient(oklch(60% .2 25),oklch(80% .1 90))">Severidade dNBR</div></div>');
    await page.addScriptTag({content:engine});
    const result = await page.evaluate(async () => {
      const canvas = await window.html2canvas(document.getElementById('map'), {logging:false,scale:1});
      return {width:canvas.width,height:canvas.height,pixel:Array.from(canvas.getContext('2d').getImageData(100,150,1,1).data),size:canvas.toDataURL().length};
    });
    assert.equal(result.width,324);
    assert.equal(result.height,204);
    assert.equal(result.pixel[3],255);
    assert.ok(result.pixel[0]>result.pixel[1]+50, 'OKLCH red background must retain its colour');
    assert.ok(result.size>2000);
    console.log('Actual Chromium capture of OKLCH colours, borders and gradients passed:',result);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
