import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BadgeCheck, Bell, Bookmark, Check, CheckCircle2, ClipboardCopy, Download, FileSignature, Flag, Globe, MailCheck, MapPin, Share2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { api, number, percentage, type Proposal, type ProposalDetail } from './api';
import { TurnstileChallenge, useTurnstileSiteKey } from './turnstile';
import { SIGNATURE_CONSENT_TEXT } from '../shared/signature';

export type Verification = { verifiedEmail: string | null; location: { locality: string; region: string; postal_code: string; status: 'pending'|'verified'|'rejected' } | null; guest: boolean };
export function EmailVerification({ initialEmail, onVerified }: { initialEmail?: string | null; onVerified: () => void }) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const send = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setNotice('');
    try {
      const data=await api<{challengeId?:string;verified?:boolean}>('/verification/email/request',{email});
      if(data.verified) { onVerified(); return; }
      if(data.challengeId) setChallengeId(data.challengeId);
      setNotice('Verification code sent. Check your inbox and spam folder.');
    } catch(e) {setNotice((e as Error).message);} finally {setBusy(false);}
  };
  const confirm = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setNotice('');
    try {await api('/verification/email/confirm',{challengeId,code});setNotice('Email verified.');onVerified();}
    catch(e){setNotice((e as Error).message);}finally{setBusy(false);}
  };
  return <div className="verify-widget">
    <div className="verify-intro"><MailCheck size={21}/><div><strong>Verify your email</strong><p>No account required. We'll send a one-time code so your signature can be linked to a verified email address.</p></div></div>
    {!challengeId ? <form className="inline-form" onSubmit={e=>void send(e)}>
      <label htmlFor="verify-email">Email address</label><input id="verify-email" type="email" required autoComplete="email" value={email} maxLength={254} placeholder="name@example.com" onChange={e=>setEmail(e.target.value)}/><button className="button button-primary" disabled={busy}>{busy?'Sending...':'Send code'} <ArrowRight size={16}/></button>
    </form> : <form className="inline-form" onSubmit={e=>void confirm(e)}>
      <label htmlFor="verify-code">Six-digit verification code sent to {email}</label><input id="verify-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required placeholder="000000" value={code} onChange={e=>setCode(e.target.value.replace(/[^0-9]/g,''))}/><button className="button button-primary" disabled={busy||code.length!==6}>{busy?'Checking...':'Verify email'} <Check size={16}/></button>
      <button type="button" className="linklike" onClick={()=>{setChallengeId('');setCode('');setNotice('');}}>Use a different address</button>
    </form>}
    {notice&&<p role="status" className="feature-notice">{notice}</p>}
  </div>;
}

export function SignaturePanel({ detail, reload }: {detail:ProposalDetail;reload:()=>Promise<ProposalDetail>}) {
  const p=detail.proposal;
  const [expanded,setExpanded]=useState(false);
  const [name,setName]=useState('');
  const [showName,setShowName]=useState(false);
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [receipt,setReceipt]=useState<null|{receipt:{id:string;signer_name:string;signer_email:string};verificationPath:string;integrity:string}>(null);
  if(p.kind!=='petition') return null;
  const sign=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setMessage('');
    try{
      await api('/proposals/'+encodeURIComponent(p.slug)+'/sign',{signerName:name,showName,consent});
      await reload();setExpanded(false);setMessage('Your electronic signature was recorded. Your private receipt is available below.');
    }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  };
  const receiptAction=async(download:boolean)=>{
    setMessage('');
    try{
      const data=await api<{receipt:{id:string;signer_name:string;signer_email:string};verificationPath:string;integrity:string}>('/proposals/'+encodeURIComponent(p.slug)+'/signature-receipt');
      setReceipt(data);
      if(download){
        const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=url;a.download='my-petition-signature-'+p.slug+'.json';a.click();
        URL.revokeObjectURL(url);
      }
    }catch(e){setMessage((e as Error).message);}
  };
  return <section className="feature-panel signature-panel">
    <div className="feature-heading"><div className="feature-icon"><FileSignature size={23}/></div><div><h3>Electronic signatures</h3><p>Sign the exact petition electronically with a verified email and an audit record.</p></div></div>
    <div className="signature-count"><strong>{number(p.signature_count)}</strong><span>electronic {p.signature_count===1?'signature':'signatures'}</span><BadgeCheck size={19}/></div>
    {detail.mySignature ? <>
      <div className="feature-success"><CheckCircle2 size={19}/> You've already signed this petition.</div>
      <button className="button button-outline button-block" onClick={()=>void receiptAction(true)}><Download size={16}/> Download your signature receipt</button>
      {receipt && <div className="receipt-options"><Link className="text-link" to={receipt.verificationPath}><BadgeCheck size={17}/> Verify integrity of receipt</Link><p className="small-disclaimer">Your private receipt includes your signed name and email. Public verification returns only the record's integrity status and no personal information.</p></div>}
    </> : p.is_open ? <>
      {!expanded ? <button className="button button-primary button-block" onClick={()=>setExpanded(true)}>Electronically sign <FileSignature size={17}/></button> : <>
        {!detail.emailVerified ? <EmailVerification initialEmail={detail.verifiedEmail} onVerified={()=>void reload()}/> : <form className="signature-form" onSubmit={e=>void sign(e)}>
          <p className="verified-email"><BadgeCheck size={17}/> Verified email: {detail.verifiedEmail}</p>
          <label htmlFor="signer-name">Your full legal name</label><input id="signer-name" type="text" autoComplete="name" minLength={2} maxLength={120} placeholder="Type your full legal name" required value={name} onChange={e=>setName(e.target.value)}/>
          <div className="signed-preview"><span>Electronic signature preview</span><strong>{name||'Your full name'}</strong></div>
          <label className="feature-checkbox"><input type="checkbox" checked={showName} onChange={e=>setShowName(e.target.checked)}/> Show my <strong>full legal name</strong> publicly in this petition's signer list (optional).</label>
          <label className="feature-checkbox consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/> {SIGNATURE_CONSENT_TEXT}</label>
          <button disabled={busy||!consent} className="button button-primary button-block" type="submit">{busy?'Signing...':'Confirm electronic signature'} <Check size={17}/></button>
        </form>}
        <button className="linklike" onClick={()=>setExpanded(false)}>Cancel signing</button>
      </>}
    </> : <p className="small-disclaimer">Signing has closed for this petition.</p>}
    {detail.publicSigners.length>0 && <div className="signer-directory"><h4>Signers who chose to be public</h4>{detail.publicSigners.map((person,i)=><div className="signer-entry" key={i}><BadgeCheck size={16}/><span>{person.display_name}</span><time>{new Date(person.signed_at).toLocaleDateString()}</time></div>)}</div>}
    {message&&<p role="status" className="feature-notice">{message}</p>}
    <p className="small-disclaimer"><ShieldCheck size={14}/> Signature records include consent, a document fingerprint, timestamp, verified email, and protected audit metadata. The integrity check is not independent identity validation or statutory certification.</p>
  </section>;
}

export function LocationPanel({ detail, reload }: {detail:ProposalDetail;reload:()=>Promise<ProposalDetail>}) {
  const p=detail.proposal;
  const [expanded,setExpanded]=useState(false);
  const [locality,setLocality]=useState(p.locality||'');
  const [region,setRegion]=useState(p.region||'');
  const [postalCode,setPostalCode]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const v=detail.locationVerification;
  if(!p.local_only) return null;
  const matched= v?.status==='verified' && v.locality.toLowerCase()===p.locality.toLowerCase() && v.region.toLowerCase()===p.region.toLowerCase();
  const submit=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setMessage('');
    try{await api('/verification/location/request',{locality,region,postalCode});await reload();setMessage('Your request was submitted. A moderator must independently verify eligibility.');setExpanded(false);}
    catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  };
  return <section className="feature-panel location-panel">
    <div className="feature-heading"><div className="feature-icon"><MapPin size={23}/></div><div><h3>Locally verified participation</h3><p>Participation is limited to verified people in {p.locality}, {p.region}.</p></div></div>
    <p className="local-stat">{number(p.verified_local_count)} verified local {p.verified_local_count===1?'vote':'votes'}</p>
    {matched?<div className="feature-success"><BadgeCheck size={18}/> Your local eligibility is approved.</div>:
      v?.status==='pending'?<p className="pending-note">Your verification request is pending independent manual review. Verified email alone is not proof of residency.</p>:
      <>{v?.status==='rejected'&&<p className="feature-notice">Your previous request was declined. You may submit corrected details.</p>}
      {!expanded?<button className="button button-outline button-block" onClick={()=>setExpanded(true)}>Request local verification <ArrowRight size={16}/></button>:
        !detail.emailVerified?<EmailVerification initialEmail={detail.verifiedEmail} onVerified={()=>void reload()}/>:
        <form className="inline-form" onSubmit={e=>void submit(e)}>
          <label htmlFor="locality">City/town</label><input id="locality" required minLength={2} maxLength={80} value={locality} onChange={e=>setLocality(e.target.value)}/>
          <label htmlFor="region">State/region</label><input id="region" required minLength={2} maxLength={80} value={region} onChange={e=>setRegion(e.target.value)}/>
          <label htmlFor="postal">Postal code</label><input id="postal" required minLength={3} maxLength={12} value={postalCode} onChange={e=>setPostalCode(e.target.value)}/>
          <button disabled={busy} className="button button-primary">{busy?'Submitting...':'Submit request'}</button>
        </form>}
      </>}
    {message&&<p className="feature-notice" role="status">{message}</p>}
    <p className="small-disclaimer">A city and postal code entered by a participant are only self-reported. This platform never calls that verified until an authorized reviewer records independent evidence.</p>
  </section>;
}

export function SharePanel({ proposal }: { proposal:Proposal }) {
  const [feedback,setFeedback]=useState('');
  const link=typeof window!=='undefined'?window.location.origin+'/proposal/'+proposal.slug:'';
  const embed=typeof window!=='undefined'?'<iframe src="'+window.location.origin+'/embed/'+proposal.slug+'" title="My Petition: '+proposal.title.replace(/"/g,'&quot;')+'" loading="lazy" width="100%" height="360" style="border:0;border-radius:16px" referrerpolicy="strict-origin-when-cross-origin"></iframe>':'';
  async function copy(value:string,label:string){
    try{await navigator.clipboard.writeText(value);setFeedback(label+' copied.');}catch{setFeedback('Unable to copy. You can copy the address from your browser.');}
  }
  return <section className="feature-panel share-panel">
    <div className="feature-heading"><div className="feature-icon"><Share2 size={22}/></div><div><h3>Share the discussion</h3><p>Invite others to consider both positions.</p></div></div>
    <div className="share-buttons"><button className="button button-outline" onClick={()=>void copy(link,'Link')}><ClipboardCopy size={16}/> Copy link</button><button className="button button-outline" onClick={()=>void copy(embed,'Embed code')}><Globe size={16}/> Embed</button>{typeof navigator!=='undefined' && 'share' in navigator && <button className="button button-outline" onClick={()=>{void navigator.share({title:proposal.title,url:link}).catch(()=>{});}}><Share2 size={16}/> Share</button>}</div>
    {feedback&&<p role="status" className="feature-notice">{feedback}</p>}
  </section>;
}

export function SaveButton({ saved, onSave }: { saved:boolean;onSave:()=>Promise<void> }) {
  const [busy,setBusy]=useState(false);
  return <button className={'button save-button'+(saved?' is-saved':'')} disabled={busy} onClick={async()=>{setBusy(true);try{await onSave();}finally{setBusy(false);}}} title="Accounts are required only to save proposals"><Bookmark size={17} fill={saved?'currentColor':'none'}/>{saved?'Saved':'Save petition'}</button>;
}

export function ReportButton({ targetType, targetId }: {targetType:'proposal'|'comment';targetId:string}) {
  const siteKey=useTurnstileSiteKey();
  const [token,setToken]=useState('');
  const [open,setOpen]=useState(false);
  const [reason,setReason]=useState('spam');
  const [details,setDetails]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const submit=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setMessage('');
    try{await api('/reports',{targetType,targetId,reason,details,turnstileToken:token});setMessage('Report received. Thank you for helping keep discussions respectful.');}
    catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  };
  return <>
    <button type="button" className="report-trigger" onClick={()=>{setOpen(true);setMessage('');}} title={'Report '+targetType}><Flag size={15}/> Report</button>
    {open&&<div className="feature-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
      <div className="feature-modal" role="dialog" aria-modal="true" aria-label={'Report '+targetType}><button aria-label="Close report" className="feature-close" onClick={()=>setOpen(false)}><X size={20}/></button>
        <AlertTriangle size={28}/><h2>Report this {targetType}</h2><p>Reports are reviewed under the same rules regardless of a participant's position.</p>
        <form className="inline-form" onSubmit={e=>void submit(e)}>
          <label htmlFor="report-reason">Why are you reporting this?</label><select id="report-reason" value={reason} onChange={e=>setReason(e.target.value)}><option value="spam">Spam or manipulation</option><option value="harassment">Harassment or threats</option><option value="privacy">Private information exposed</option><option value="illegal">Potentially illegal content</option><option value="other">Other</option></select>
          <label htmlFor="report-details">Additional details (optional)</label><textarea id="report-details" maxLength={1000} rows={4} value={details} onChange={e=>setDetails(e.target.value)} placeholder="Help a reviewer understand the issue."/>
          {siteKey&&<TurnstileChallenge siteKey={siteKey} onToken={setToken}/>}
          <button className="button button-primary" disabled={busy||(Boolean(siteKey)&&!token)}>{busy?'Submitting...':'Submit report'}</button>
        </form>{message&&<p role="status" className="feature-notice">{message}</p>}
      </div>
    </div>}
  </>;
}

export type NotificationItem={id:string;kind:string;message:string;created_at:string;is_read:number;slug:string|null};
export function NotificationsBell(){
  const [open,setOpen]=useState(false);
  const [items,setItems]=useState<NotificationItem[]>([]);
  const [unread,setUnread]=useState(0);
  const load=async()=>{try{const data=await api<{notifications:NotificationItem[];unread:number}>('/me/notifications');setItems(data.notifications);setUnread(data.unread);}catch{}};
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),90000);return()=>clearInterval(timer);},[]);
  const openPanel=async()=>{const next=!open;setOpen(next);if(next){await load();if(unread){try{await api('/me/notifications/read',{});setUnread(0);}catch{}}}};
  return <div className="notification-container"><button type="button" className="icon-button notification-bell" aria-label={'Notifications'+(unread?' ('+unread+' unread)':'')} aria-expanded={open} onClick={()=>void openPanel()}><Bell size={19}/>{unread>0&&<span className="notification-dot" />}</button>
    {open&&<div className="notifications-popover"><div className="notifications-title"><strong>Notifications</strong><button aria-label="Close notifications" onClick={()=>setOpen(false)}><X size={17}/></button></div>{items.length?items.map(item=><Link key={item.id} onClick={()=>setOpen(false)} to={item.slug?'/proposal/'+item.slug:'/activity'} className="notification-item"><span><Bell size={16}/></span><span>{item.message}<small>{new Date(item.created_at).toLocaleDateString()}</small></span></Link>):<p className="notifications-empty">Nothing new yet. You'll see activity on proposals you create or save.</p>}</div>}
  </div>;
}
export function EmbedPage(){
  const {slug}=useParams();
  const [proposal,setProposal]=useState<Proposal|null>(null);
  useEffect(()=>{let active=true;api<ProposalDetail>('/proposals/'+encodeURIComponent(slug??'')).then(x=>{if(active)setProposal(x.proposal);}).catch(()=>{});return()=>{active=false;};},[slug]);
  return <main className="embed-page">{proposal?<div className="embed-card"><span className="embed-logo"><Sparkles size={19}/> My Petition</span><h2>{proposal.title}</h2><p>{number(proposal.support_count+proposal.oppose_count)} voices · {proposal.kind==='petition'?'Petition':'Public poll'}</p><div className="embed-track"><span style={{width:proposal.support_count+proposal.oppose_count?percentage(proposal.support_count,proposal.oppose_count)+'%':'0%'}}/></div><div className="embed-figures"><span>Support <b>{number(proposal.support_count)}</b></span><span>Oppose <b>{number(proposal.oppose_count)}</b></span></div><Link target="_blank" rel="noopener noreferrer" to={'/proposal/'+proposal.slug} className="button button-primary">View and participate <ArrowRight size={16}/></Link><p className="small-disclaimer">Voluntary online responses, not a scientific poll.</p></div>:<div className="embed-card"><p>Loading proposal…</p></div>}</main>;
}
export type ModerationQueue={reports:Array<{id:string;target_type:string;target_id:string;reason:string;details:string;created_at:string}>;locations:Array<{user_id:string;locality:string;region:string;postal_code:string;requested_at:string;email:string}>};
export function ModerationPage(){
  const [data,setData]=useState<ModerationQueue|null>(null);
  const [message,setMessage]=useState('');
  const [method,setMethod]=useState('manual-address-review');
  const [refs,setRefs]=useState<Record<string,string>>({});
  const load=async()=>{try{setData(await api<ModerationQueue>('/moderation/queue'));setMessage('');}catch(e){setMessage((e as Error).message);}};
  useEffect(()=>{void load();},[]);
  const handleReport=async(id:string,action:string)=>{try{await api('/moderation/reports/'+id,{action});await load();}catch(e){setMessage((e as Error).message);}};
  const handleLocation=async(id:string,action:string)=>{try{await api('/moderation/locations/'+id,{action,method,evidenceReference:refs[id]??''});await load();}catch(e){setMessage((e as Error).message);}};
  return <main className="container page-container moderation-page"><h1>Moderation queue</h1><p>Access requires a verified email included in the server's moderator allowlist. Do not approve residency without independently checked evidence.</p>{message&&<p className="feature-notice">{message}</p>}{data&&<><h2>Content reports ({data.reports.length})</h2>{data.reports.map(r=><article className="moderation-card" key={r.id}><strong>{r.reason}: {r.target_type}</strong><p>{r.details||'No details submitted.'}</p><small>{r.target_id} · {r.created_at}</small><div><button className="button button-outline" onClick={()=>void handleReport(r.id,'dismiss')}>Dismiss</button><button className="button button-primary" onClick={()=>void handleReport(r.id,'hide')}>Hide content</button></div></article>)}<h2>Local verification requests ({data.locations.length})</h2>{data.locations.map(r=><article className="moderation-card" key={r.user_id}><strong>{r.locality}, {r.region} {r.postal_code}</strong><p>Verified email: {r.email}. Location is still self-reported.</p><label>Independent verification method <select value={method} onChange={e=>setMethod(e.target.value)}><option value="manual-address-review">Manual address review</option><option value="trusted-provider">Trusted external provider</option><option value="mailed-code">Postal mail code</option></select></label><label>Evidence reference (internal only) <input value={refs[r.user_id]??''} placeholder="Verified evidence reference, at least 8 characters" onChange={e=>setRefs(s=>({...s,[r.user_id]:e.target.value}))}/></label><div><button className="button button-outline" onClick={()=>void handleLocation(r.user_id,'reject')}>Reject</button><button className="button button-primary" onClick={()=>void handleLocation(r.user_id,'verify')}>Approve verified</button></div></article>)}</>}</main>;
}


type VerificationResult = {
  receiptId:string;integrity:'valid'|'unsealed'|'mismatch';verified:boolean;
  documentHash:string;signedAt:string;proposalSlug:string;
  identityVerified:boolean;legallyCertified:boolean;notice:string;
};
export function VerifySignaturePage(){
  const {search}=useLocation();
  const initialId=new URLSearchParams(search).get('id')??'';
  const [id,setId]=useState(initialId);
  const [result,setResult]=useState<VerificationResult|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  async function check(receiptId:string){
    setBusy(true);setError('');setResult(null);
    try{
      const data=await api<VerificationResult>('/signatures/'+encodeURIComponent(receiptId.trim())+'/verify');
      setResult(data);
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  useEffect(()=>{if(initialId)void check(initialId);},[initialId]);
  return <main className="container page-container">
    <div className="verification-page">
      <div className="eyebrow"><span className="eyebrow-line"/> SIGNATURE INTEGRITY</div>
      <h1>Verify a signature <span>receipt.</span></h1>
      <p>Check whether an electronic signature record has a matching integrity seal in My Petition. You only need the receipt ID. No signer names, email addresses or private audit metadata are exposed here.</p>
      <form className="inline-form" onSubmit={e=>{e.preventDefault();void check(id);}}>
        <label htmlFor="receipt-id">Receipt identifier</label>
        <input id="receipt-id" autoComplete="off" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={id} onChange={e=>setId(e.target.value)} required maxLength={64}/>
        <button className="button button-primary" disabled={busy||!id.trim()} type="submit">{busy?'Verifying...':'Verify receipt'} <ArrowRight size={18}/></button>
      </form>
      {error&&<div className="verification-result error" role="alert"><X size={23}/><div><strong>Could not verify this receipt</strong><p>{error}</p></div></div>}
      {result&&<div className={'verification-result '+(result.verified?'valid':'warning')} role="status">
        {result.verified?<CheckCircle2 size={27}/>:<AlertTriangle size={27}/>}
        <div><strong>{result.verified?'Integrity seal verified':'Integrity seal not verified'}</strong>
          <p>{result.verified?'The stored evidence matches the server-generated seal. This record has not been detectably altered since it was sealed.':result.integrity==='unsealed'?'This record predates integrity sealing. Its contents have not been cryptographically verified.':'The stored evidence does not match the integrity seal. Do not rely on this record.'}</p>
          <dl className="verification-details">
            <dt>Recorded at</dt><dd>{new Date(result.signedAt).toLocaleString()}</dd>
            <dt>Petition</dt><dd><Link to={'/proposal/'+result.proposalSlug}>View petition <ArrowRight size={14}/></Link></dd>
            <dt>Document fingerprint</dt><dd><code>{result.documentHash}</code></dd>
          </dl>
        </div>
      </div>}
      <p className="verification-warning"><ShieldCheck size={18}/> This check is performed by My Petition, which also controls the signing records and sealing secret. It does not independently establish the signer's identity, residency, consent, or legal eligibility.</p>
    </div>
  </main>;
}
