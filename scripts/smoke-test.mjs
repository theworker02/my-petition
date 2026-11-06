/**
 * My Petition API smoke tests against a real local Cloudflare Worker + D1.
 * Run after "npm run build" and "npm run db:local".
 * Uses only Node.js built-ins and never calls external email providers.
 */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID,randomBytes,createHash } from 'node:crypto';
import { writeFileSync,unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const port=8789;
const origin='http://127.0.0.1:'+port;
// Synthetic, pre-verified account for integration-testing the signing subsystem.
// This bypasses sending actual email in CI and does not create a real user.
const signerId=randomUUID();
const signerEmail='smoke-signer-'+signerId+'@example.test';
const signerToken=randomBytes(32).toString('hex');
const signerCookie='mp_session='+signerToken;
const tokenHash=createHash('sha256').update(signerToken).digest('hex');
const expires=new Date(Date.now()+3600000).toISOString();
const seedSql=[
  "INSERT INTO users(id,email,display_name,password_hash,password_salt,is_guest) VALUES ('"+signerId+"','"+signerEmail+"','Signature Test Account','!test-account-disabled','test-salt',0);",
  "INSERT INTO verified_emails(user_id,email) VALUES ('"+signerId+"','"+signerEmail+"');",
  "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ('"+tokenHash+"','"+signerId+"','"+expires+"');"
].join('\n');
const seedFile=join(tmpdir(),'my-petition-smoke-'+signerId+'.sql');
writeFileSync(seedFile,seedSql);
try{
  execFileSync('node_modules/.bin/wrangler',['d1','execute','my-petition-db','--local','--file',seedFile],{stdio:'pipe',timeout:45000});
}finally{unlinkSync(seedFile);}
const worker=spawn('node_modules/.bin/wrangler',['dev','--local','--port',String(port),'--ip','127.0.0.1','--var','AUDIT_HASH_SECRET:my-petition-smoke-only-secret-key'],{
  stdio:['ignore','pipe','pipe'],detached:true
});
let output='';
worker.stdout.on('data',part=>{output+=part.toString();if(output.length>20000)output=output.slice(-15000);});
worker.stderr.on('data',part=>{output+=part.toString();if(output.length>20000)output=output.slice(-15000);});
let exited=false;
worker.on('exit',()=>{exited=true;});

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function request(path,{method='GET',body,cookie}={}){
  const headers={Origin:origin};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(cookie)headers.Cookie=cookie;
  const response=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json().catch(()=>null);
  const setCookie=response.headers.get('set-cookie')||'';
  const guest=setCookie.match(/mp_guest=[a-f0-9]{64}/)?.[0];
  const session=setCookie.match(/mp_session=[a-f0-9]{64}/)?.[0];
  return {status:response.status,data,cookie:session??guest??cookie??''};
}
function status(result,expected,label){
  assert.equal(result.status,expected,label+' failed: '+JSON.stringify(result.data));
}
async function ready(){
  for(let i=0;i<100;i++){
    if(exited)throw new Error('Worker exited unexpectedly:\n'+output);
    try{
      const r=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(800)});
      if(r.ok)return;
    }catch{}
    await sleep(250);
  }
  throw new Error('Worker startup timed out:\n'+output);
}
async function run(){
  await ready();
  const readiness=await request('/api/ready');
  status(readiness,200,'Development readiness');
  assert.equal(readiness.data.ready,true);
  const health=await request('/api/health');
  status(await request('/api/auth/password-reset/request',{method:'POST',body:{email:'not-configured@example.test'}}),503,'Email recovery fails closed without delivery configuration');
  status(await request('/api/auth/password-reset/confirm',{method:'POST',body:{token:'a'.repeat(64),newPassword:'secure-test-password-123456'}}),503,'Password reset confirmation requires configured secret');
  status(health,200,'Health endpoint');
  assert.equal(health.data.product,'My Petition');

  const nonce=randomUUID().slice(0,8);
  const proposal={
    title:'Add more recycling bins in '+nonce+' neighborhood',
    description:'Please consider a balanced proposal for additional recycling bins, including maintenance responsibilities, placement and municipal cost estimates.',
    category:'Environment',location:'Test City',kind:'petition',authorName:'Smoke Test Organizer'
  };
  let created=await request('/api/proposals',{method:'POST',body:proposal});
  status(created,201,'Guest creates petition');
  assert.ok(created.cookie.startsWith('mp_guest='));
  const slug=created.data.slug;
  const detailPath='/api/proposals/'+encodeURIComponent(slug);
  let details=await request(detailPath,{cookie:created.cookie});
  status(details,200,'Guest reads petition');
  assert.equal(details.data.isAuthor,true);
  assert.equal(details.data.proposal.support_count,0);
  assert.equal(details.data.proposal.oppose_count,0);
  assert.equal(details.data.proposal.signature_count,0);

  let unauthorizedSave=await request(detailPath+'/save',{method:'POST',body:{saved:true},cookie:created.cookie});
  status(unauthorizedSave,401,'Saving requires registered account');
  let sign=await request(detailPath+'/sign',{method:'POST',cookie:created.cookie,body:{signerName:'Demo Signer',consent:true}});
  status(sign,403,'Unverified guests cannot e-sign');
  const emailSend=await request('/api/verification/email/request',{method:'POST',cookie:created.cookie,body:{email:'smoke-'+nonce+'@example.test'}});
  status(emailSend,503,'Unconfigured email service fails safely');

  const malformedVote=await request(detailPath+'/vote',{method:'POST',cookie:created.cookie,body:{stance:'maybe',showName:false}});
  status(malformedVote,400,'Invalid vote rejected');
  let vote=await request(detailPath+'/vote',{method:'POST',cookie:created.cookie,body:{stance:'support',showName:false}});
  status(vote,200,'Anonymous-display guest vote');
  details=await request(detailPath,{cookie:created.cookie});
  assert.equal(details.data.proposal.support_count,1);
  assert.equal(details.data.proposal.oppose_count,0);
  assert.equal(details.data.participants[0].display_name,null);
  assert.equal(details.data.myVote.stance,'support');

  const rapidChange=await request(detailPath+'/vote',{method:'POST',cookie:created.cookie,body:{stance:'oppose',showName:true,publicName:'Example Voter'}});
  status(rapidChange,429,'Rapid vote changes throttled');
  await sleep(2200);
  vote=await request(detailPath+'/vote',{method:'POST',cookie:created.cookie,body:{stance:'oppose',showName:true,publicName:'Example Voter'}});
  status(vote,200,'Vote update');
  details=await request(detailPath,{cookie:created.cookie});
  assert.equal(details.data.proposal.support_count,0);
  assert.equal(details.data.proposal.oppose_count,1);
  assert.equal(details.data.participants[0].display_name,'Example Voter');

  // Traceable e-signatures are a separate operation from advisory votes.
  const missingConsent=await request(detailPath+'/sign',{method:'POST',cookie:signerCookie,body:{signerName:'Demo Verified Signer',consent:false,showName:true}});
  status(missingConsent,400,'E-signature requires explicit consent');
  const signed=await request(detailPath+'/sign',{method:'POST',cookie:signerCookie,body:{signerName:'Demo Verified Signer',consent:true,showName:true}});
  status(signed,201,'Verified-email signature with evidence seal');
  assert.ok(signed.data.receiptId);
  assert.equal(signed.data.integrity,'sealed');
  const checked=await request('/api/signatures/'+signed.data.receiptId+'/verify');
  status(checked,200,'Public receipt integrity verification');
  assert.equal(checked.data.verified,true);
  assert.equal(checked.data.integrity,'valid');
  assert.equal(checked.data.documentHash,signed.data.documentHash);
  assert.equal(checked.data.identityVerified,false);
  assert.ok(!JSON.stringify(checked.data).includes(signerEmail),'Private signer email is never returned by public verification');
  assert.ok(!JSON.stringify(checked.data).includes('Demo Verified Signer'),'Private signer name is never returned by public verification');
  const receipt=await request(detailPath+'/signature-receipt',{cookie:signerCookie});
  status(receipt,200,"Private signer's receipt");
  assert.equal(receipt.data.integrity,'valid');
  assert.equal(receipt.data.receipt.signer_email,signerEmail);
  details=await request(detailPath);
  assert.equal(details.data.proposal.signature_count,1);
  assert.equal(details.data.publicSigners.length,1);
  assert.equal(details.data.publicSigners[0].display_name,'Demo Verified Signer');
  status(await request(detailPath+'/sign',{method:'POST',cookie:signerCookie,body:{signerName:'Demo Verified Signer',consent:true,showName:true}}),409,'Duplicate e-signature rejected');
  status(await request('/api/signatures/not-a-uuid/verify'),400,'Invalid receipt ID rejected');
  status(await request('/api/signatures/'+randomUUID()+'/verify'),404,'Unknown receipt rejected');

  const comment=await request(detailPath+'/comments',{method:'POST',cookie:created.cookie,body:{body:'Please consider accessibility too.',publicName:'Example Organizer'}});
  status(comment,201,'Guest public comment');
  details=await request(detailPath,{cookie:created.cookie});
  assert.equal(details.data.comments[0].display_name,'Example Organizer');
  const firstReport=await request('/api/reports',{method:'POST',cookie:created.cookie,body:{targetType:'comment',targetId:details.data.comments[0].id,reason:'other',details:'Smoke test report'}});
  status(firstReport,201,'Report content');
  const secondReport=await request('/api/reports',{method:'POST',cookie:created.cookie,body:{targetType:'comment',targetId:details.data.comments[0].id,reason:'other'}});
  status(secondReport,409,'Duplicate report blocked');
  status(await request('/api/moderation/queue',{cookie:created.cookie}),403,'Moderator queue requires privileges');

  const list=await request('/api/proposals?q='+encodeURIComponent(nonce));
  status(list,200,'Search proposals');
  assert.ok(list.data.proposals.some(p=>p.slug===slug));
  const activity=await request('/api/me/activity',{cookie:created.cookie});
  assert.ok(activity.data.created.some(p=>p.slug===slug));
  assert.ok(activity.data.voted.some(p=>p.slug===slug));

  const locationProposal=await request('/api/proposals',{method:'POST',cookie:created.cookie,body:{
    ...proposal,title:'Local participation check '+nonce,localOnly:true,locality:'Example Town',region:'Connecticut'
  }});
  status(locationProposal,201,'Guest creates local-only poll');
  const localVote=await request('/api/proposals/'+locationProposal.data.slug+'/vote',{method:'POST',cookie:created.cookie,body:{stance:'support',showName:false}});
  status(localVote,403,'Local-only voting gate');
  const localRequest=await request('/api/verification/location/request',{method:'POST',cookie:created.cookie,body:{locality:'Example Town',region:'Connecticut',postalCode:'06400'}});
  status(localRequest,403,'Email required before local verification');

  const newAccount=await request('/api/auth/register',{method:'POST',body:{email:'smoke-'+nonce+'@example.test',displayName:'Saved Proposal Tester',password:'long-test-password-32-'+nonce}});
  status(newAccount,201,'Create an optional account');
  assert.ok(newAccount.cookie.startsWith('mp_session='));
  const saved=await request(detailPath+'/save',{method:'POST',cookie:newAccount.cookie,body:{saved:true}});
  status(saved,200,'Save proposal to account');
  assert.equal(saved.data.saved,true);
  const accountActivity=await request('/api/me/activity',{cookie:newAccount.cookie});
  assert.ok(accountActivity.data.saved.some(p=>p.slug===slug),'Saved proposal visible to account');
  const accountExport=await request('/api/me/export',{cookie:newAccount.cookie});
  status(accountExport,200,'Registered account export');
  assert.equal(accountExport.data.profile.email,'smoke-'+nonce+'@example.test');
  const loggedOut=await request('/api/auth/logout',{method:'POST',cookie:newAccount.cookie,body:{}});
  status(loggedOut,200,'Log out');
  status(await request(detailPath+'/save',{method:'POST',cookie:newAccount.cookie,body:{saved:true}}),401,'Logged-out session refused');

  const close=await request(detailPath+'/close',{method:'POST',cookie:created.cookie,body:{}});
  status(close,200,'Guest creator closes petition');
  details=await request(detailPath);
  assert.equal(details.data.proposal.is_open,false);
  status(await request(detailPath+'/vote',{method:'POST',cookie:created.cookie,body:{stance:'support',showName:false}}),409,'Closed petition blocks new votes');
  const guestExport=await request('/api/me/export',{cookie:created.cookie});
  status(guestExport,200,'Guest data export');
  assert.ok(guestExport.data.proposals.some(item=>item.slug===slug));
  const rejectDelete=await request('/api/me/account',{method:'DELETE',cookie:created.cookie,body:{confirmation:'not confirmed'}});
  status(rejectDelete,400,'Destructive guest erasure needs typed confirmation');
  const deletedGuest=await request('/api/me/account',{method:'DELETE',cookie:created.cookie,body:{confirmation:'DELETE MY DATA'}});
  status(deletedGuest,200,'Guest can erase participation and authored proposals');
  assert.equal(deletedGuest.data.deleted,true);
  status(await request(detailPath),404,'Erased guest proposal no longer public');
  status(await request('/api/signatures/'+signed.data.receiptId+'/verify'),404,'Erased signatures are no longer verifiable');
  status(await request('/api/me/export',{cookie:created.cookie}),401,'Erased guest token revoked');
  const relogin=await request('/api/auth/login',{method:'POST',body:{email:'smoke-'+nonce+'@example.test',password:'long-test-password-32-'+nonce}});
  status(relogin,200,'Account can log in after explicit logout');
  status(await request('/api/me/account',{method:'DELETE',cookie:relogin.cookie,body:{confirmation:'DELETE MY DATA',password:'wrong-password'}}),403,'Account deletion requires password');
  status(await request('/api/me/account',{method:'DELETE',cookie:relogin.cookie,body:{confirmation:'DELETE MY DATA',password:'long-test-password-32-'+nonce}}),200,'Account holder can erase account');
  status(await request('/api/auth/login',{method:'POST',body:{email:'smoke-'+nonce+'@example.test',password:'long-test-password-32-'+nonce}}),401,'Deleted account cannot log in');
  console.log('PASS: API smoke checks for guest participation, support/oppose votes, private receipt integrity, opt-in signer names, moderation, local restrictions, account saves and proposal closure.');
}
try{await run();}
catch(error){console.error(error);await sleep(500);console.error('Worker output:\n'+output.slice(-12500));process.exitCode=1;}
finally{
  try{process.kill(-worker.pid,'SIGTERM');}catch{worker.kill('SIGTERM');}
}
