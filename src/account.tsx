import { useEffect,useState,type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Download, FileWarning, LockKeyhole, Mail, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from './api';
import { TurnstileChallenge,useTurnstileSiteKey } from './turnstile';

export function ResetPasswordPage(){
  const siteKey=useTurnstileSiteKey();
  const [email,setEmail]=useState('');
  const [token]=useState(()=>new URLSearchParams(window.location.search).get('token')||'');
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [captcha,setCaptcha]=useState('');
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const submit=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setError('');
    try{
      if(token){
        if(newPassword!==confirmPassword)throw new Error('Passwords do not match.');
        const result=await api<{message:string}>('/auth/password-reset/confirm',{token,newPassword});
        setDone(true);setMessage(result.message);
        // Remove the bearer token from browser history after it is used.
        window.history.replaceState(null,'','/reset-password');
      }else{
        const result=await api<{message:string}>('/auth/password-reset/request',{email,turnstileToken:captcha});
        setDone(true);setMessage(result.message);
      }
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  return <main className="container page-container account-page">
    <div className="account-panel">
      <div className="eyebrow"><span className="eyebrow-line"/> ACCOUNT RECOVERY</div>
      <LockKeyhole size={32} className="account-purple"/>
      <h1>{token?'Choose a new password':'Reset your password'}</h1>
      <p>Accounts are optional on My Petition and are used for saving proposals. Guest participation does not require an account.</p>
      {done?<div className="feature-success"><CheckCircle2 size={20}/>{message}</div>:
      <form className="inline-form" onSubmit={e=>void submit(e)}>
        {token?<><label htmlFor="new-password">New password</label><input type="password" id="new-password" minLength={12} maxLength={200} autoComplete="new-password" required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/><label htmlFor="repeat-password">Confirm password</label><input id="repeat-password" type="password" autoComplete="new-password" minLength={12} maxLength={200} required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></>:
        <><label htmlFor="recovery-email">Account email</label><input type="email" id="recovery-email" autoComplete="email" required value={email} placeholder="you@example.com" onChange={e=>setEmail(e.target.value)}/>{siteKey&&<TurnstileChallenge siteKey={siteKey} onToken={setCaptcha}/>}</>}
        {error&&<p className="feature-notice" role="alert">{error}</p>}
        <button className="button button-primary" disabled={busy||(!token&&Boolean(siteKey)&&!captcha)}>{busy?'Processing...':token?'Change password':'Email reset instructions'}<ArrowRight size={17}/></button>
      </form>}
      <Link className="text-link" to="/">Back to My Petition <ArrowRight size={17}/></Link>
    </div>
  </main>;
}

export function PrivacyControls({registered}:{registered:boolean}){
  const [confirm,setConfirm]=useState('');
  const [password,setPassword]=useState('');
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const download=async()=>{
    setBusy(true);setError('');
    try{
      const data=await api<unknown>('/me/export');
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;link.download='my-petition-personal-data.json';
      document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),2000);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const deleteAll=async(e:FormEvent)=>{
    e.preventDefault();
    if(confirm!=='DELETE MY DATA')return;
    if(!window.confirm('Permanently delete your account or guest data, authored proposals, votes, comments and signatures? This cannot be undone.'))return;
    setBusy(true);setError('');
    try{
      await api('/me/account',{confirmation:confirm,password},'DELETE');
      window.location.assign('/');
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  return <section className="privacy-controls">
    <div className="privacy-controls-intro"><ShieldCheck size={23}/><div><h2>Data and privacy</h2><p>Download the information linked to your current {registered?'account':'guest browser session'} or erase it. No account is necessary for ordinary participation.</p></div></div>
    <button className="button button-outline" onClick={()=>void download()} disabled={busy}><Download size={17}/> Download my data</button>
    <button className="privacy-delete-toggle" onClick={()=>setOpen(!open)} aria-expanded={open}><Trash2 size={16}/> {open?'Cancel deletion':'Delete my data'}</button>
    {open&&<form className="privacy-delete-form" onSubmit={e=>void deleteAll(e)}>
      <div className="privacy-warning"><FileWarning size={22}/><div><strong>Permanent deletion</strong><p>Deleting your data removes authored proposals, votes, comments, saved petitions, and electronic signature records. Signature receipts associated with deleted signatures can no longer be verified. Other people's comments on your proposals will also disappear.</p></div></div>
      <label htmlFor="delete-confirm">Type DELETE MY DATA</label>
      <input id="delete-confirm" required value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="off" placeholder="DELETE MY DATA"/>
      {registered&&<><label htmlFor="delete-password">Confirm your account password</label><input id="delete-password" type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></>}
      <button className="button button-danger" disabled={busy||confirm!=='DELETE MY DATA'} type="submit"><Trash2 size={17}/> Permanently delete my data</button>
    </form>}
    {error&&<p className="feature-notice" role="alert">{error}</p>}
  </section>;
}

export function LegalPage({kind}:{kind:'privacy'|'terms'}){
  const isPrivacy=kind==='privacy';
  const [email,setEmail]=useState('');
  useEffect(()=>{api<{siteSupportEmail?:string}>('/config').then(x=>setEmail(x.siteSupportEmail||'')).catch(()=>{});},[]);
  return <main className="container page-container legal-page">
    <div className="eyebrow"><span className="eyebrow-line"/> PLATFORM INFORMATION</div>
    <h1>{isPrivacy?'Privacy and data use':'Terms of participation'}</h1>
    <p className="legal-intro">These are preliminary platform disclosures. Before a public launch, the operator must review the final policies for applicable laws and publish effective dates and contact details.</p>
    {isPrivacy?<div className="legal-sections">
      <section><h2>Information we collect</h2><p>You may browse, create proposals, vote, comment, and report content without registering. Guest activity is associated with a random browser-session token; this does not establish a unique real-world person. If you choose to register to save petitions, we store your account email, display name, and a password-derived hash—not your plaintext password.</p></section>
      <section><h2>Electronic signatures</h2><p>Signing a petition requires a verified email and an explicit typed-name consent. We retain your full signer name, email, signing timestamp, petition fingerprint, consent text/version, and protected connection fingerprints. Signer names appear in a public list only if the signer opts in. The site operator controls the integrity-seal key.</p></section>
      <section><h2>Public content and participation</h2><p>Proposal text, publicly chosen creator and comment names, and support/opposition totals are public. Votes can hide display names, but are still connected to an internal participant record. Locality verification requests contain self-reported location information and review status, which is not automatically published.</p></section>
      <section><h2>Service providers and security</h2><p>Cloudflare may process service requests and traffic metadata as a hosting and anti-bot provider. If configured, Resend transmits verification and account recovery emails. Cookies are HttpOnly, and signing connection data is stored as keyed or hashed evidence; operational providers may retain additional security logs.</p></section>
      <section><h2>Access, deletion and retention</h2><p>From My Activity, you can download your stored participation data and permanently delete it. Deletion removes your votes, e-signatures, comments, and authored proposals, and makes your deleted signature receipts unverifiable. We have not yet established formal operational log retention or a legally reviewed exception process, which must be finalized before public release.</p></section>
    </div>:<div className="legal-sections">
      <section><h2>Public participation only</h2><p>My Petition is a community participation platform, not a government election, statistically representative poll, or legally certified petition service. Counts are based on self-selected online submissions. Guest-cookie or email verification does not prove one human, legal identity, or residency.</p></section>
      <section><h2>Respectful participation</h2><p>Do not post threats, harassment, illegal content, impersonations, nonconsensual personal information, bot-generated participation or fabricated support. Present proposals with context, and respect disagreement. Moderators may hide reported content under published rules, but are not allowed to manipulate votes to favor a position.</p></section>
      <section><h2>Signing and evidence</h2><p>Electronic signing requires an affirmative consent and verified email. The platform stores evidence and a server-controlled integrity seal; this is not an independent identity check or a guarantee that any agency will accept a signature for statutory purposes. Do not rely on this service for ballot access or binding referenda.</p></section>
      <section><h2>Local eligibility</h2><p>Local verification requires independent manual review; submitting a city and postal code alone is not proof of residence. Participation can be restricted where a proposal explicitly requires verified eligibility.</p></section>
      <section><h2>Accuracy and availability</h2><p>Proposals represent their creators' views. The platform may be unavailable during maintenance; operators should avoid promising uninterrupted access. The operator should review and publish a formal final agreement before onboarding public users.</p></section>
    </div>}
    <div className="legal-contact"><Mail size={19}/>{email?<span>Support: <a href={'mailto:'+email}>{email}</a></span>:<span>Contact information will be published by the operator before launch.</span>}</div>
  </main>;
}
