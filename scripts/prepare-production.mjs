#!/usr/bin/env node
// Generate ephemeral production config. Never commit or print secrets.
import { readFileSync,writeFileSync,chmodSync } from 'node:fs';
const env=process.env;
const required=['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN','D1_DATABASE_ID','RESEND_API_KEY','MAIL_FROM','EMAIL_OTP_SECRET','AUDIT_HASH_SECRET','TURNSTILE_SITE_KEY','TURNSTILE_SECRET','MODERATOR_EMAILS','SITE_SUPPORT_EMAIL'];
const missing=required.filter(key=>!env[key]?.trim());
if(missing.length)throw Error('Missing production setting(s): '+missing.join(', '));
if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(env.D1_DATABASE_ID)||/^0+$/.test(env.D1_DATABASE_ID.replace(/-/g,'')))throw Error('Invalid or placeholder D1 database ID');
if(!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID))throw Error('Invalid Cloudflare account ID');
if(env.EMAIL_OTP_SECRET.length<32||env.AUDIT_HASH_SECRET.length<32||env.EMAIL_OTP_SECRET===env.AUDIT_HASH_SECRET)throw Error('Use distinct random hash secrets at least 32 characters');
const emailAddress=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
if(!emailAddress.test(env.SITE_SUPPORT_EMAIL)||!env.MODERATOR_EMAILS.split(',').every(x=>emailAddress.test(x.trim())))throw Error('Invalid support or moderator email');
if(!emailAddress.test(env.MAIL_FROM.replace(/^.*</,'').replace(/>$/,'')))throw Error('MAIL_FROM must use a verified sender domain');
if(env.PRODUCTION_BASE_URL){
  const u=new URL(env.PRODUCTION_BASE_URL);
  if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('PRODUCTION_BASE_URL must be a public HTTPS origin');
}
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
config.d1_databases[0].database_id=env.D1_DATABASE_ID;
config.workers_dev=true;
config.vars={
  PRODUCTION_MODE:'true',
  MAIL_FROM:env.MAIL_FROM,
  TURNSTILE_SITE_KEY:env.TURNSTILE_SITE_KEY,
  MODERATOR_EMAILS:env.MODERATOR_EMAILS,
  SITE_SUPPORT_EMAIL:env.SITE_SUPPORT_EMAIL
};
config.secrets=['RESEND_API_KEY','EMAIL_OTP_SECRET','AUDIT_HASH_SECRET','TURNSTILE_SECRET'];
writeFileSync('wrangler.production.jsonc',JSON.stringify(config,null,2)+'\n',{mode:0o600});
writeFileSync('.secrets.production.json',JSON.stringify({
  RESEND_API_KEY:env.RESEND_API_KEY,
  EMAIL_OTP_SECRET:env.EMAIL_OTP_SECRET,
  AUDIT_HASH_SECRET:env.AUDIT_HASH_SECRET,
  TURNSTILE_SECRET:env.TURNSTILE_SECRET
}),{mode:0o600});
chmodSync('wrangler.production.jsonc',0o600);
chmodSync('.secrets.production.json',0o600);
console.log('Production config assembled; no secret values were printed.');
