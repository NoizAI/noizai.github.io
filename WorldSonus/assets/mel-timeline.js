// Mel frames are indexed by media time, never by elapsed wall/playback time.
(() => {
  const cache = new Map();
  const scriptBase = new URL('.', document.currentScript.src);
  const stops = [[5,9,14],[15,35,55],[52,55,103],[139,62,111],[240,105,83],[255,190,103],[255,239,167]];
  const palette = Array.from({length:256}, (_, i) => {
    const p = i / 255 * (stops.length - 1), j = Math.min(stops.length - 2, Math.floor(p));
    return stops[j].map((v,k) => Math.round(v + (stops[j+1][k] - v) * (p-j)));
  });
  window.createMelTimeline = (player) => {
    const canvas = document.querySelector('#melStream');
    if (!player || !canvas) return null;
    const ctx = canvas.getContext('2d', {alpha:false});
    const status = document.querySelector('#vizStatus');
    const live = document.querySelector('#vizLive');
    const clock = document.querySelector('#vizClock');
    let source = '', sheet = null, frame = 0, generation = 0, destroyed = false;
    let controller = null, worker = null, decoder = null, failure = false;
    let lastTime = -1, dirty = true;
    const draw = () => {
      const time = Math.max(0, Number(player.currentTime) || 0);
      const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.round(rect.width*dpr)), h = Math.max(2, Math.round(rect.height*dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width=w; canvas.height=h; dirty=true; }
      if (time === lastTime && !dirty) return;
      lastTime=time; dirty=false;
      clock.textContent = `${String(Math.floor(time/60)).padStart(2,'0')}:${String(Math.floor(time%60)).padStart(2,'0')}.${String(Math.floor(time%1*1000)).padStart(3,'0')}`;
      ctx.fillStyle='#05080b'; ctx.fillRect(0,0,w,h);
      if (sheet && time > 0) {
        const end = Math.min(time, sheet.duration), start = Math.max(0, time-8);
        if (end > start) {
          // Right edge is always NOW, left edge is NOW minus eight seconds.
          const sx=start*sheet.fps, sw=(end-start)*sheet.fps;
          ctx.drawImage(sheet.canvas,sx,0,sw,80,w*(1-(time-start)/8),0,w*(end-start)/8,h);
        }
      }
      canvas.dataset.mediaTime = String(time);
      canvas.dataset.windowStart = String(Math.max(0,time-8));
      canvas.dataset.source = source;
      canvas.dataset.melReady = String(!!sheet);
    };
    const updateStatus = () => {
      status.textContent = failure ? 'Mel unavailable' : !sheet ? 'Loading Mel…' : player.seeking ? 'Seeking' : player.ended ? 'Playback complete' : player.paused ? 'Paused' : 'Live playback';
      live.classList.toggle('is-live', !player.paused && !player.seeking);
      dirty=true; draw();
    };
    const cancel = () => {
      controller?.abort(); controller=null;
      worker?.terminate(); worker=null;
      decoder?.close().catch(()=>{}); decoder=null;
    };
    const load = async () => {
      // Both codec variants retain the same audio. Decode the broadly supported
      // H.264 container even when the video player is using HEVC.
      const url = player.dataset.fallback || player.currentSrc || player.src;
      if (!url || url === source || destroyed) return;
      const id=++generation;
      cancel(); source=url; sheet=null; failure=false; updateStatus();
      if (cache.has(url)) { sheet=cache.get(url); cache.delete(url); cache.set(url,sheet); updateStatus(); return; }
      controller=new AbortController();
      try {
        const precomputed=JSON.parse(player.dataset.mel || 'null');
        if (precomputed) {
          const image=new Image(); image.src=precomputed.url;
          await image.decode();
          if (destroyed || id!==generation) return;
          sheet={canvas:image,fps:precomputed.fps,duration:precomputed.duration};
          cache.set(url,sheet); while(cache.size>6) cache.delete(cache.keys().next().value);
          updateStatus(); return;
        }
        const response=await fetch(url,{signal:controller.signal});
        if (!response.ok) throw new Error('Audio fetch failed');
        const encoded=await response.arrayBuffer();
        if (destroyed || id!==generation) return;
        const Engine=window.AudioContext || window.webkitAudioContext;
        const localDecoder=new Engine(); decoder=localDecoder;
        let audio;
        try { audio=await localDecoder.decodeAudioData(encoded); }
        finally { await localDecoder.close().catch(()=>{}); if(decoder===localDecoder) decoder=null; }
        if (destroyed || id!==generation) return;
        const channels=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i).slice());
        worker=new Worker(new URL('mel-worker.js',scriptBase));
        worker.onerror=()=>{ if(id===generation && !destroyed){worker?.terminate();worker=null;failure=true;updateStatus();} };
        worker.onmessage=({data})=>{
          if (destroyed || id!==generation) return;
          worker.terminate(); worker=null;
          const imageCanvas=document.createElement('canvas'); imageCanvas.width=data.frames; imageCanvas.height=80;
          const imageCtx=imageCanvas.getContext('2d'), pixels=imageCtx.createImageData(data.frames,80);
          for(let x=0;x<data.frames;x++) for(let y=0;y<80;y++) {
            const color=palette[data.values[x*80+y]], p=((79-y)*data.frames+x)*4;
            pixels.data[p]=color[0];pixels.data[p+1]=color[1];pixels.data[p+2]=color[2];pixels.data[p+3]=255;
          }
          imageCtx.putImageData(pixels,0,0);
          sheet={canvas:imageCanvas,fps:data.fps,duration:audio.duration};
          cache.set(url,sheet); while(cache.size>6) cache.delete(cache.keys().next().value);
          updateStatus();
        };
        worker.postMessage({channels,sampleRate:audio.sampleRate},channels.map(c=>c.buffer));
      } catch(error) {
        if (destroyed || id!==generation || error.name==='AbortError') return;
        failure=true; updateStatus();
      }
    };
    const sync=()=>{load();updateStatus();};
    const events=['loadedmetadata','loadstart','emptied','seeking','seeked','timeupdate','play','pause','ended'];
    events.forEach(e=>player.addEventListener(e,sync));
    const resize=new ResizeObserver(()=>{dirty=true;draw();}); resize.observe(canvas);
    const animate=()=>{if(destroyed)return;draw();frame=requestAnimationFrame(animate);};
    load(); animate();
    return {reset:sync,destroy(){destroyed=true;generation++;cancel();cancelAnimationFrame(frame);resize.disconnect();events.forEach(e=>player.removeEventListener(e,sync));}};
  };
})();
