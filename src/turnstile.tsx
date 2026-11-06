import { useEffect, useRef, useState } from 'react';
import { api } from './api';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: {
        sitekey:string;
        callback:(token:string)=>void;
        'expired-callback':()=>void;
        'error-callback'?:()=>void;
      })=>string;
      remove:(id:string)=>void;
    };
  }
}
let configPromise:Promise<string>|null=null;
let loadedKey:string|null=null;
export function useTurnstileSiteKey(){
  const [key,setKey]=useState(loadedKey||'');
  useEffect(()=>{
    let active=true;
    configPromise??=api<{turnstileSiteKey:string}>('/config')
      .then(x=>{loadedKey=x.turnstileSiteKey||'';return loadedKey;})
      .catch(()=>{configPromise=null;return '';});
    void configPromise.then(value=>{if(active)setKey(value);});
    return()=>{active=false;};
  },[]);
  return key;
}
let loader:Promise<void>|null=null;
function ensureScript(){
  if(window.turnstile)return Promise.resolve();
  if(!loader)loader=new Promise<void>((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async=true;
    script.onload=()=>resolve();
    script.onerror=()=>{loader=null;reject(new Error('Unable to load verification.'));};
    document.head.appendChild(script);
  });
  return loader;
}
export function TurnstileChallenge({siteKey,onToken}:{siteKey:string;onToken:(token:string)=>void}){
  const host=useRef<HTMLDivElement>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let mounted=true;
    let widget:string|null=null;
    void ensureScript().then(()=>{
      if(!mounted||!host.current||!window.turnstile)return;
      widget=window.turnstile.render(host.current,{
        sitekey:siteKey,callback:onToken,
        'expired-callback':()=>onToken(''),
        'error-callback':()=>{onToken('');setError('Verification was interrupted. Refresh and try again.');}
      });
    }).catch((e:Error)=>{if(mounted)setError(e.message);});
    return()=>{
      mounted=false;
      if(widget!==null)window.turnstile?.remove(widget);
    };
  },[siteKey,onToken]);
  return <div className="challenge-container"><div className="turnstile-slot" ref={host}/>{error&&<p role="alert" className="feature-notice">{error}</p>}</div>;
}
