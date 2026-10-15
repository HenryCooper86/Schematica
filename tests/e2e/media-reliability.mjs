// Exercise real SVG rasterization and GIF decoding while the editor changes.
export async function runMediaReliabilityChecks({ js, check, sleep, send, origin }) {
  const wait = async expression => {
    for (let i = 0; i < 120; i++) {
      if (await js(expression)) return;
      await sleep(50);
    }
    throw new Error('Media reliability check timed out: ' + expression);
  };
  const before = await js('performance.timeOrigin');
  await send('Page.navigate', { url: origin + '/?media-reliability=' + Date.now() });
  await wait(`performance.timeOrigin!==${before}&&!!document.getElementById('btn-engineering')`);
  await js(`(async()=>{
    for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
    const {EXAMPLES}=await import('/src/examples.js');
    const {serialize,deserialize}=await import('/src/serialize.js');
    const {setLang,getLang}=await import('/src/i18n.js');
    const {setThemePreference,getThemePreference}=await import('/src/theme.js');
    window.mediaPrevious={language:getLang(),theme:getThemePreference()};
    setLang('en');setThemePreference('dark');
    const doc=structuredClone(EXAMPLES.find(e=>e.id==='weather-station').doc);
    doc.title='Original GIF board';doc.nodes[0].label='Original GIF part';
    doc.nodes[0].locked=true;doc.nodes[0].flags=['thermal'];doc.nodes[0].status='deprecated';
    doc.wires[0].style='sneakernet';doc.wires[0].flow='on';
    doc.wires[1].flow='on';doc.wires[2].flow='off';
    window.mediaOriginal=deserialize(serialize(doc)).doc;
    const transfer=new DataTransfer();transfer.items.add(new File([serialize(doc)],'original-gif.json'));
    const input=document.getElementById('file-input');input.files=transfer.files;input.dispatchEvent(new Event('change'));
  })()`);
  await wait(`document.getElementById('title').value==='Original GIF board'`);
  try {
    await js(`(()=>{
      window.mediaFrames=[];window.mediaDownload=null;window.mediaFailure=null;window.mediaRelease=null;
      window.mediaDecode=Image.prototype.decode;window.mediaClick=HTMLAnchorElement.prototype.click;
      Image.prototype.decode=async function(){
        const source=await fetch(this.src).then(response=>response.text());
        window.mediaFrames.push(source);
        if(window.mediaFrames.length===1)await new Promise(resolve=>{window.mediaRelease=resolve;});
        return window.mediaDecode.call(this);
      };
      HTMLAnchorElement.prototype.click=function(){
        if(!this.download.endsWith('.loop.gif'))return window.mediaClick.call(this);
        const filename=this.download;
        fetch(this.href).then(response=>response.arrayBuffer()).then(async data=>{
          const decoder=new ImageDecoder({data:new Uint8Array(data),type:'image/gif'});
          try{
            await decoder.completed;await decoder.tracks.ready;
            const {image}=await decoder.decode({frameIndex:0});
            window.mediaDownload={filename,frames:decoder.tracks.selectedTrack.frameCount,width:image.displayWidth};
            image.close();
          }finally{decoder.close();}
        }).catch(error=>{window.mediaFailure=error.message;});
      };
      document.getElementById('btn-export').click();document.getElementById('export-w').value='64';
      document.getElementById('export-theme').value='current';
      document.getElementById('export-gifloop-go').click();return true;
    })()`);
    await wait(`!!window.mediaRelease`);
    await js(`(async()=>{
      const {setLang}=await import('/src/i18n.js'),{setThemePreference}=await import('/src/theme.js');
      const title=document.getElementById('title');title.value='Edited GIF board';title.dispatchEvent(new Event('change'));
      setLang('zh');setThemePreference('light');
      const {newDoc}=await import('/src/state.js');const transfer=new DataTransfer();
      transfer.items.add(new File([JSON.stringify(newDoc('Replacement GIF board'))],'replacement-gif.json'));
      const input=document.getElementById('file-input');input.files=transfer.files;input.dispatchEvent(new Event('change'));
    })()`);
    await wait(`document.getElementById('title').value==='Replacement GIF board'`);
    await js(`window.mediaRelease();true`);
    await wait(`!!window.mediaDownload||!!window.mediaFailure`);
    check('loop GIF preserves the original board, translated labels and theme across asynchronous replacement', await js(`window.mediaFrames.length===60&&window.mediaFrames.every(source=>source.includes('Original GIF part')&&source.includes('<title>Locked</title>')&&!source.includes('data-export-theme="light"')&&!source.includes('Replacement GIF board'))`));
    check('loop GIF animation matches independently rendered flow, halo, blink and footprint phases', await js(`(async()=>{
      const {buildExportSVG}=await import('/src/export.js'),{LOOP_MS}=await import('/src/render.js');
      const {setLang}=await import('/src/i18n.js');setLang('en');
      const attributes=source=>{
        const doc=new DOMParser().parseFromString(source,'image/svg+xml');
        return [...doc.querySelectorAll('.wire .vis,.fxhalo,.blink,.footstep')].map(element=>[element.tagName,[...element.attributes].map(a=>[a.name,a.value]).sort((a,b)=>a[0].localeCompare(b[0]))]);
      };
      return [0,7,17,31,59].every(index=>JSON.stringify(attributes(window.mediaFrames[index]))===JSON.stringify(attributes(buildExportSVG(window.mediaOriginal,{theme:'dark',now:index*LOOP_MS/60}))));
    })()`));
    check('the downloaded GIF decodes to 60 frames at the requested width with its original filename', await js(`!window.mediaFailure&&window.mediaDownload?.filename==='Original_GIF_board.loop.gif'&&window.mediaDownload.frames===60&&window.mediaDownload.width===64`));
  } finally {
    await js(`(async()=>{
      if(window.mediaRelease)window.mediaRelease();
      if(window.mediaDecode)Image.prototype.decode=window.mediaDecode;
      if(window.mediaClick)HTMLAnchorElement.prototype.click=window.mediaClick;
      const {setLang}=await import('/src/i18n.js'),{setThemePreference}=await import('/src/theme.js');
      setLang(window.mediaPrevious.language);setThemePreference(window.mediaPrevious.theme);
      return true;
    })()`);
  }
}
