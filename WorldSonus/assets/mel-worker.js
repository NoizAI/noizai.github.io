// Compute deterministic, time-indexed Mel power without touching playback.
self.onmessage=({data:{channels,sampleRate}})=>{
  const n=2048,bands=80,fps=50,length=channels[0].length;
  const frames=Math.ceil(length/sampleRate*fps), values=new Uint8Array(frames*bands);
  const re=new Float64Array(n),im=new Float64Array(n),power=new Float64Array(n/2);
  const window=Float64Array.from({length:n},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(n-1)));
  const reverse=new Uint16Array(n);
  for(let i=0;i<n;i++){let x=i,r=0;for(let b=0;b<11;b++){r=(r<<1)|(x&1);x>>=1;}reverse[i]=r;}
  const hzToMel=h=>2595*Math.log10(1+h/700),melToHz=m=>700*(10**(m/2595)-1);
  const lo=hzToMel(20),hi=hzToMel(Math.min(16000,sampleRate/2));
  const points=Array.from({length:bands+2},(_,i)=>Math.min(n/2-1,Math.floor(melToHz(lo+(hi-lo)*i/(bands+1))/sampleRate*n)));
  for(let f=0;f<frames;f++){
    power.fill(0);
    // Average channel power, not waveforms: anti-phase stereo must not vanish.
    for(const pcm of channels){
      const start=Math.round(f/fps*sampleRate)-n/2;
      for(let i=0;i<n;i++){re[reverse[i]]=(pcm[start+i]||0)*window[i];im[reverse[i]]=0;}
      for(let size=2;size<=n;size*=2){
        const half=size/2,angle=-2*Math.PI/size,wr=Math.cos(angle),wi=Math.sin(angle);
        for(let base=0;base<n;base+=size){let cr=1,ci=0;
          for(let j=0;j<half;j++){
            const a=base+j,b=a+half,tr=cr*re[b]-ci*im[b],ti=cr*im[b]+ci*re[b];
            re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;
            const next=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=next;
          }
        }
      }
      for(let i=0;i<power.length;i++) power[i]+=(re[i]**2+im[i]**2)/(n*n*channels.length);
    }
    for(let b=0;b<bands;b++){
      const a=points[b],p=points[b+1],z=points[b+2];let energy=0,weights=0;
      for(let i=a;i<=z;i++){const w=Math.max(0,i<=p?(i-a)/Math.max(1,p-a):(z-i)/Math.max(1,z-p));energy+=power[i]*w;weights+=w;}
      const db=10*Math.log10(Math.max(1e-10,energy/Math.max(1e-6,weights)));
      values[f*bands+b]=Math.round(Math.max(0,Math.min(1,(db+88)/68))**.78*255);
    }
  }
  self.postMessage({values,frames,fps},[values.buffer]);
};
