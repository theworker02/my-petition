import { Hono, type Context } from 'hono';

type Bindings = {
  DB: D1Database;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  EMAIL_OTP_SECRET?: string;
  AUDIT_HASH_SECRET?: string;
  MODERATOR_EMAILS?: string;
};
type AppEnv = { Bindings: Bindings };
type Account = { id: string; email: string; display_name: string };
type SessionRow = Account & { token_hash: string };
type ProposalRow = {
  id: string; slug: string; author_id: string; author_name: string;
  title: string; description: string; category: string; location: string;
  kind: 'petition' | 'poll'; status: 'open' | 'closed'; closes_at: string | null;
  created_at: string; support_count: number; oppose_count: number;
  comment_count: number;
  signature_count: number;
  verified_local_count: number;
  local_only: number;
  locality: string;
  region: string;
  visibility: string;
};

const app = new Hono<AppEnv>();
const encoder = new TextEncoder();
const cookieName = 'mp_session';
const categories = ['Community', 'Environment', 'Infrastructure', 'Education', 'Technology', 'Healthcare', 'Other'];
const selectProposal = [
  'SELECT p.*, COALESCE(NULLIF(p.author_name_override, \'\'),u.display_name) AS author_name,',
  "(SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id AND v.stance = 'support') AS support_count,",
  "(SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id AND v.stance = 'oppose') AS oppose_count,",
  "(SELECT COUNT(*) FROM comments x WHERE x.proposal_id = p.id AND x.visibility = 'visible') AS comment_count,",
  '(SELECT COUNT(*) FROM signatures s WHERE s.proposal_id = p.id) AS signature_count,',
  "(SELECT COUNT(*) FROM votes v JOIN location_verifications lv ON lv.user_id=v.user_id WHERE v.proposal_id=p.id AND lv.status='verified' AND LOWER(lv.locality)=LOWER(p.locality) AND LOWER(lv.region)=LOWER(p.region) AND p.local_only=1) AS verified_local_count",
  'FROM proposals p JOIN users u ON u.id = p.author_id'
].join(' ');

function safeString(data: Record<string, unknown>, key: string): string {
  return typeof data[key] === 'string' ? (data[key] as string).trim() : '';
}
function textToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join('');
}
function randomHex(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return textToHex(bytes);
}
async function sha256(value: string): Promise<string> {
  return textToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
async function passwordHash(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const result = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', iterations: 210000, salt: encoder.encode(salt)
  }, key, 256);
  return textToHex(new Uint8Array(result));
}
function constantTimeMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function cookieToken(c: Context<AppEnv>): string | null {
  const match = (c.req.header('Cookie') ?? '').match(/(?:^|;\s*)mp_session=([a-f0-9]{64})(?:;|$)/);
  return match?.[1] ?? null;
}
async function currentUser(c: Context<AppEnv>): Promise<Account | null> {
  const token = cookieToken(c);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await c.env.DB.prepare(
    'SELECT u.id, u.email, u.display_name, s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > ?'
  ).bind(tokenHash, new Date().toISOString()).first<SessionRow>();
  return row ? { id: row.id, email: row.email, display_name: row.display_name } : null;
}
async function issueSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const token = randomHex(32);
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)')
    .bind(await sha256(token), userId, expires.toISOString()).run();
  const secure = new URL(c.req.url).protocol === 'https:' ? '; Secure' : '';
  c.header('Set-Cookie', cookieName + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Expires=' + expires.toUTCString() + secure);
}
function openForVoting(p: { status: string; closes_at: string | null }): boolean {
  return p.status === 'open' && (!p.closes_at || new Date(p.closes_at).getTime() > Date.now());
}
function formatProposal(p: ProposalRow) {
  const { author_id: _privateAuthorId, ...publicProposal } = p;
  void _privateAuthorId;
  return { ...publicProposal, support_count: Number(p.support_count), oppose_count: Number(p.oppose_count), comment_count: Number(p.comment_count), signature_count: Number(p.signature_count), verified_local_count: Number(p.verified_local_count), is_open: openForVoting(p) };
}
function slugify(title: string) {
  return title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55) || 'proposal';
}
async function body(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  const value: unknown = await c.req.json().catch(() => null);
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
async function verifyTurnstile(c: Context<AppEnv>, token: string): Promise<boolean> {
  if (!c.env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const params = new URLSearchParams({ secret: c.env.TURNSTILE_SECRET, response: token });
  const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: params });
  if (!verification.ok) return false;
  const parsed = await verification.json() as { success?: boolean };
  return parsed.success === true;
}
async function fetchProposal(c: Context<AppEnv>, slug: string): Promise<ProposalRow | null> {
  return c.env.DB.prepare(selectProposal + " WHERE p.slug=? AND p.visibility='visible'").bind(slug).first<ProposalRow>();
}


type Actor = Account & { is_guest: number };
type EmailVerified = { email: string; verified_at: string };
const guestCookieName = 'mp_guest';
function sessionCookie(c: Context<AppEnv>, name: string): string | null {
  const cookie = c.req.header('Cookie') ?? '';
  return cookie.split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1).match(/^[a-f0-9]{64}$/)?.[0] ?? null;
}
function setHttpCookie(c: Context<AppEnv>, name: string, token: string, days: number) {
  const expires = new Date(Date.now() + days * 86400000);
  const secure = new URL(c.req.url).protocol === 'https:' ? '; Secure' : '';
  c.header('Set-Cookie', name + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Expires=' + expires.toUTCString() + secure, { append: true });
}
async function getActor(c: Context<AppEnv>, createGuest = false): Promise<Actor | null> {
  const account = await currentUser(c);
  if (account) return { ...account, is_guest: 0 };
  const token = sessionCookie(c, guestCookieName);
  if (token) {
    const guest = await c.env.DB.prepare(
      "SELECT u.id,u.email,u.display_name,u.is_guest FROM guest_sessions gs JOIN users u ON u.id=gs.user_id WHERE gs.token_hash=? AND gs.expires_at>?"
    ).bind(await sha256(token),new Date().toISOString()).first<Actor>();
    if (guest) return guest;
  }
  if (!createGuest) return null;
  const id = crypto.randomUUID();
  const newToken = randomHex(32);
  const salt = randomHex(16);
  // No usable account password or personal email is generated for guests.
  await c.env.DB.prepare('INSERT INTO users(id,email,display_name,password_hash,password_salt,is_guest) VALUES(?,?,?,?,?,1)')
    .bind(id, 'guest-' + id + '@invalid.my-petition.local', 'Guest participant', await passwordHash(randomHex(32),salt),salt).run();
  await c.env.DB.prepare('INSERT INTO guest_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(await sha256(newToken),id,new Date(Date.now()+365*86400000).toISOString()).run();
  setHttpCookie(c,guestCookieName,newToken,365);
  return { id,email:'',display_name:'Guest participant',is_guest:1 };
}
async function verifiedEmail(c: Context<AppEnv>, userId: string): Promise<EmailVerified | null> {
  return c.env.DB.prepare('SELECT email,verified_at FROM verified_emails WHERE user_id=?').bind(userId).first<EmailVerified>();
}
async function locationVerification(c: Context<AppEnv>, userId: string) {
  return c.env.DB.prepare('SELECT locality,region,postal_code,status,requested_at,reviewed_at FROM location_verifications WHERE user_id=?')
    .bind(userId).first<{locality:string;region:string;postal_code:string;status:string;requested_at:string;reviewed_at:string|null}>();
}
async function isEligibleLocally(c: Context<AppEnv>, actor: Actor, p: ProposalRow) {
  if (!p.local_only) return true;
  const lv = await locationVerification(c,actor.id);
  return lv?.status==='verified' && lv.locality.toLowerCase()===p.locality.toLowerCase() && lv.region.toLowerCase()===p.region.toLowerCase();
}
async function hmacHex(secret:string, data:string) {
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),'HMAC',false,['sign']);
  return textToHex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(data))));
}
async function notify(c:Context<AppEnv>,userId:string,proposalId:string,kind:'comment'|'signature'|'moderation'|'verification',message:string) {
  await c.env.DB.prepare('INSERT INTO notifications(id,user_id,proposal_id,kind,message) VALUES(?,?,?,?,?)')
    .bind(crypto.randomUUID(),userId,proposalId,kind,message).run();
}
async function announce(c:Context<AppEnv>,p:ProposalRow,actorId:string,kind:'comment'|'signature',message:string) {
  const targets=await c.env.DB.prepare('SELECT user_id FROM saved_proposals WHERE proposal_id=? UNION SELECT author_id AS user_id FROM proposals WHERE id=?')
    .bind(p.id,p.id).all<{user_id:string}>();
  for(const target of targets.results ?? []) {
    if(target.user_id!==actorId) await notify(c,target.user_id,p.id,kind,message);
  }
}
async function isModerator(c:Context<AppEnv>,actor:Actor|null) {
  if(!actor || !c.env.MODERATOR_EMAILS) return false;
  const email=await verifiedEmail(c,actor.id);
  return Boolean(email && c.env.MODERATOR_EMAILS.split(',').some(s=>s.trim().toLowerCase()===email.email.toLowerCase()));
}
const reasons = ['spam','harassment','privacy','illegal','other'];

app.use('/api/*', async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    const target = new URL(c.req.url);
    // Browsers may omit Origin on same-origin requests; accept only a matching Fetch Metadata context.
    let allowed = origin === target.origin || (!origin && c.req.header('Sec-Fetch-Site') === 'same-origin');
    if (!allowed && origin && ['localhost', '127.0.0.1'].includes(target.hostname)) {
      try {
        const supplied = new URL(origin);
        allowed = ['localhost', '127.0.0.1'].includes(supplied.hostname) && ['5173', '8787'].includes(supplied.port);
      } catch { allowed = false; }
    }
    if (!allowed) return c.json({ error: 'Invalid request origin.' }, 403);
  }
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
});

app.get('/api/health', (c) => c.json({ status: 'ok', product: 'My Petition' }));
app.get('/api/config', (c) => c.json({ turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || '' }));
app.get('/api/session', async (c) => {
  const user=await currentUser(c);
  return c.json({ user, hasGuest:!!sessionCookie(c,guestCookieName) });
});

app.post('/api/auth/register', async (c) => {
  const payload = await body(c);
  const email = safeString(payload, 'email').toLowerCase();
  const displayName = safeString(payload, 'displayName');
  const password = safeString(payload, 'password');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return c.json({ error: 'Enter a valid email address.' }, 400);
  if (displayName.length < 2 || displayName.length > 60) return c.json({ error: 'Display name must be 2–60 characters.' }, 400);
  if (password.length < 12 || password.length > 200) return c.json({ error: 'Password must have 12–200 characters.' }, 400);
  if (!await verifyTurnstile(c, safeString(payload, 'turnstileToken'))) return c.json({ error: 'Complete the verification challenge.' }, 400);
  const salt = randomHex(16);
  const hash = await passwordHash(password, salt);
  const userId = crypto.randomUUID();
  try {
    await c.env.DB.prepare('INSERT INTO users (id, email, display_name, password_hash, password_salt) VALUES (?,?,?,?,?)')
      .bind(userId, email, displayName, hash, salt).run();
  } catch {
    return c.json({ error: 'An account with that email already exists.' }, 409);
  }
  await issueSession(c, userId);
  return c.json({ user: { id: userId, display_name: displayName, email } }, 201);
});

app.post('/api/auth/login', async (c) => {
  const payload = await body(c);
  const email = safeString(payload, 'email').toLowerCase();
  const password = safeString(payload, 'password');
  if (!email || !password) return c.json({ error: 'Email and password are required.' }, 400);
  const failures = await c.env.DB.prepare('SELECT attempts, window_start FROM auth_failures WHERE email=?').bind(email).first<{ attempts: number; window_start: string }>();
  const activeWindow = failures && Date.now() - new Date(failures.window_start).getTime() < 15 * 60 * 1000;
  if (activeWindow && failures.attempts >= 6) return c.json({ error: 'Too many attempts. Please retry in 15 minutes.' }, 429);
  const row = await c.env.DB.prepare('SELECT id, email, display_name, password_hash, password_salt FROM users WHERE email=?')
    .bind(email).first<Account & { password_hash: string; password_salt: string }>();
  const calculated = await passwordHash(password, row?.password_salt ?? '00000000000000000000000000000000');
  if (!row || !constantTimeMatch(row.password_hash, calculated)) {
    const start = activeWindow ? failures!.window_start : new Date().toISOString();
    const attempts = activeWindow ? failures!.attempts + 1 : 1;
    await c.env.DB.prepare('INSERT INTO auth_failures(email,attempts,window_start) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET attempts=excluded.attempts,window_start=excluded.window_start')
      .bind(email, attempts, start).run();
    return c.json({ error: 'Incorrect email or password.' }, 401);
  }
  await c.env.DB.prepare('DELETE FROM auth_failures WHERE email=?').bind(email).run();
  await issueSession(c, row.id);
  return c.json({ user: { id: row.id, display_name: row.display_name, email: row.email } });
});

app.post('/api/auth/logout', async (c) => {
  const token = cookieToken(c);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run();
  c.header('Set-Cookie', cookieName + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return c.json({ success: true });
});

app.get('/api/stats', async (c) => {
  const [proposals, votes, participants] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM proposals').first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM votes').first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM votes').first<{ n: number }>()
  ]);
  return c.json({ proposals: proposals?.n ?? 0, votes: votes?.n ?? 0, participants: participants?.n ?? 0 });
});

app.get('/api/proposals', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 100);
  const category = c.req.query('category') ?? '';
  const sort = c.req.query('sort') === 'recent' ? 'recent' : 'popular';
  const page = Math.max(1, Math.min(100, Number.parseInt(c.req.query('page') ?? '1', 10) || 1));
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  if (q) { conditions.push('(p.title LIKE ? OR p.description LIKE ? OR p.location LIKE ?)'); values.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); }
  if (categories.includes(category)) { conditions.push('p.category=?'); values.push(category); }
  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
  const order = sort === 'recent' ? 'p.created_at DESC' : '(support_count + oppose_count) DESC, p.created_at DESC';
  const rows = await c.env.DB.prepare(selectProposal + where + ' ORDER BY ' + order + ' LIMIT 16 OFFSET ?')
    .bind(...values, (page - 1) * 16).all<ProposalRow>();
  return c.json({ proposals: (rows.results ?? []).map(formatProposal), page, hasMore: (rows.results ?? []).length === 16 });
});

app.get('/api/proposals/:slug', async (c) => {
  const p = await fetchProposal(c, c.req.param('slug'));
  if (!p) return c.json({ error: 'Proposal not found.' }, 404);
  const user = await currentUser(c);
  const actor=await getActor(c);
  const [myVote, participantRows, commentRows] = await Promise.all([
    actor ? c.env.DB.prepare('SELECT stance,show_name,public_name FROM votes WHERE proposal_id=? AND user_id=?').bind(p.id, actor.id).first<{ stance: string; show_name: number;public_name:string|null }>() : Promise.resolve(null),
    c.env.DB.prepare("SELECT v.stance, CASE WHEN v.show_name=1 THEN COALESCE(NULLIF(v.public_name,''),u.display_name) ELSE NULL END AS display_name FROM votes v JOIN users u ON u.id=v.user_id WHERE v.proposal_id=? ORDER BY v.updated_at DESC LIMIT 14")
      .bind(p.id).all<{ stance: string; display_name: string | null }>(),
    c.env.DB.prepare("SELECT x.id,x.body,x.created_at,COALESCE(NULLIF(x.public_name,''),u.display_name) AS display_name FROM comments x JOIN users u ON u.id=x.user_id WHERE x.proposal_id=? AND x.visibility='visible' ORDER BY x.created_at DESC LIMIT 40")
      .bind(p.id).all<{ id: string; body: string; created_at: string; display_name: string }>()
  ]);
  const signature=actor ? await c.env.DB.prepare('SELECT id FROM signatures WHERE proposal_id=? AND user_id=?').bind(p.id,actor.id).first<{id:string}>():null;
  const email=actor?await verifiedEmail(c,actor.id):null;
  const local=actor?await locationVerification(c,actor.id):null;
  const saved=user?await c.env.DB.prepare('SELECT user_id FROM saved_proposals WHERE user_id=? AND proposal_id=?').bind(user.id,p.id).first():null;
  return c.json({ proposal: formatProposal(p), isAuthor: actor?.id === p.author_id, myVote: myVote ?? null, mySignature: Boolean(signature), emailVerified: Boolean(email), verifiedEmail: email?.email ?? null, locationVerification: local ?? null, saved: Boolean(saved), participants: participantRows.results ?? [], comments: commentRows.results ?? [] });
});

app.post('/api/proposals', async (c) => {
  const user = await getActor(c,true);
  if (!user) return c.json({ error: 'Could not establish your guest session.' }, 500);
  const payload = await body(c);
  const title = safeString(payload, 'title');
  const description = safeString(payload, 'description');
  const category = safeString(payload, 'category');
  const location = safeString(payload, 'location');
  const kind = safeString(payload, 'kind');
  const authorName=safeString(payload,'authorName');
  const localOnly=payload.localOnly===true;
  const locality=safeString(payload,'locality');
  const region=safeString(payload,'region');
  const closesInput = safeString(payload, 'closesAt');
  if (title.length < 12 || title.length > 140) return c.json({ error: 'Title must be 12–140 characters.' }, 400);
  if (description.length < 60 || description.length > 10000) return c.json({ error: 'Description must be 60–10,000 characters.' }, 400);
  if (!categories.includes(category)) return c.json({ error: 'Choose a category.' }, 400);
  if (location.length > 100) return c.json({ error: 'Location must be under 100 characters.' }, 400);
  if (kind !== 'petition' && kind !== 'poll') return c.json({ error: 'Choose a proposal type.' }, 400);
  if (user.is_guest && (authorName.length<2 || authorName.length>60)) return c.json({error:'Please enter a creator display name (2–60 characters).'},400);
  if (localOnly && (!/^[a-zA-Z .'-]{2,80}$/.test(locality)||!/^[a-zA-Z .'-]{2,80}$/.test(region))) return c.json({error:'Verified-local proposals need a city and state/region.'},400);
  let closesAt: string | null = null;
  if (closesInput) {
    const date = new Date(closesInput);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now() + 60 * 60 * 1000 || date.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) return c.json({ error: 'Closing date must be between 1 hour and 1 year in the future.' }, 400);
    closesAt = date.toISOString();
  }
  const volume = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM proposals WHERE author_id=? AND created_at > ?')
    .bind(user.id, new Date(Date.now() - 86400000).toISOString()).first<{ n: number }>();
  if ((volume?.n ?? 0) >= 5) return c.json({ error: 'You can create up to 5 proposals per day.' }, 429);
  const slug = slugify(title) + '-' + randomHex(4);
  await c.env.DB.prepare('INSERT INTO proposals (id,slug,author_id,title,description,category,location,kind,closes_at,author_name_override,local_only,locality,region) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),slug,user.id,title,description,category,location,kind,closesAt,user.is_guest?authorName:null,localOnly?1:0,localOnly?locality:'',localOnly?region:'').run();
  return c.json({ slug }, 201);
});

app.post('/api/proposals/:slug/vote', async (c) => {
  const user = await getActor(c,true);
  if (!user) return c.json({ error: 'Could not establish your guest session.' }, 500);
  const p = await fetchProposal(c, c.req.param('slug'));
  if (!p) return c.json({ error: 'Proposal not found.' }, 404);
  if (!openForVoting(p)) return c.json({ error: 'Voting has closed.' }, 409);
  if(!await isEligibleLocally(c,user,p)) return c.json({error:'This proposal requires approved local verification. Request verification from the participation panel.'},403);
  const payload = await body(c);
  const stance = safeString(payload, 'stance');
  const publicName = safeString(payload,'publicName');
  if(payload.showName===true && user.is_guest && (publicName.length<2 || publicName.length>60)) return c.json({error:'Enter a public display name (2–60 characters) or vote privately.'},400);
  if (!['support', 'oppose'].includes(stance) || typeof payload.showName !== 'boolean') return c.json({ error: 'Choose a position and name visibility.' }, 400);
  const previous = await c.env.DB.prepare('SELECT updated_at FROM votes WHERE proposal_id=? AND user_id=?')
    .bind(p.id, user.id).first<{ updated_at: string }>();
  if (previous && Date.now() - new Date(previous.updated_at).getTime() < 2000) return c.json({ error: 'Please wait a moment before changing your vote.' }, 429);
  await c.env.DB.prepare(
    "INSERT INTO votes(proposal_id,user_id,stance,show_name,public_name) VALUES (?,?,?,?,?) ON CONFLICT(proposal_id,user_id) DO UPDATE SET stance=excluded.stance,show_name=excluded.show_name,public_name=excluded.public_name,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ).bind(p.id,user.id,stance,payload.showName?1:0,payload.showName===true && user.is_guest?publicName:null).run();
  return c.json({ success: true });
});

app.post('/api/proposals/:slug/comments', async (c) => {
  const user = await getActor(c,true);
  if (!user) return c.json({ error: 'Could not establish your guest session.' }, 500);
  const p = await fetchProposal(c, c.req.param('slug'));
  if (!p) return c.json({ error: 'Proposal not found.' }, 404);
  const payload = await body(c);
  const publicName=safeString(payload,'publicName');
  if(user.is_guest && (publicName.length<2 || publicName.length>60)) return c.json({error:'Enter a display name to publish a public comment.'},400);
  const comment = safeString(payload, 'body');
  if (comment.length < 3 || comment.length > 1000) return c.json({ error: 'Comment must be 3–1,000 characters.' }, 400);
  const last = await c.env.DB.prepare('SELECT created_at FROM comments WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(user.id).first<{created_at:string}>();
  if (last && Date.now() - new Date(last.created_at).getTime() < 20000) return c.json({ error: 'Please wait 20 seconds between comments.' }, 429);
  await c.env.DB.prepare('INSERT INTO comments (id,proposal_id,user_id,body,public_name) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),p.id,user.id,comment,user.is_guest?publicName:null).run();
  await announce(c,p,user.id,'comment','New comment on a proposal you follow.');
  return c.json({ success: true }, 201);
});

app.post('/api/proposals/:slug/close', async (c) => {
  const user = await getActor(c);
  if (!user) return c.json({ error: 'This browser has no creator session.' }, 401);
  const p = await fetchProposal(c, c.req.param('slug'));
  if (!p) return c.json({ error: 'Proposal not found.' }, 404);
  if (p.author_id !== user.id) return c.json({ error: 'Only the creator can close this proposal.' }, 403);
  await c.env.DB.prepare("UPDATE proposals SET status='closed' WHERE id=?").bind(p.id).run();
  return c.json({ success: true });
});

app.get('/api/me/activity', async (c) => {
  const user = await getActor(c);
  if(!user) return c.json({created:[],voted:[],saved:[],notifications:[]});
  const [created, voted, saved, notifications] = await Promise.all([
    c.env.DB.prepare(selectProposal + ' WHERE p.author_id=? ORDER BY p.created_at DESC LIMIT 50').bind(user.id).all<ProposalRow>(),
    c.env.DB.prepare(selectProposal + " JOIN votes myv ON myv.proposal_id=p.id WHERE myv.user_id=? AND p.visibility='visible' ORDER BY myv.updated_at DESC LIMIT 50").bind(user.id).all<ProposalRow>(),
    user.is_guest ? Promise.resolve({results:[] as ProposalRow[]}) : c.env.DB.prepare(selectProposal + " JOIN saved_proposals sp ON sp.proposal_id=p.id WHERE sp.user_id=? AND p.visibility='visible' ORDER BY sp.saved_at DESC LIMIT 50").bind(user.id).all<ProposalRow>(),
    c.env.DB.prepare('SELECT n.id,n.kind,n.message,n.is_read,n.created_at,p.slug FROM notifications n LEFT JOIN proposals p ON p.id=n.proposal_id WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 30').bind(user.id).all()
  ]);
  return c.json({created:(created.results??[]).map(formatProposal),voted:(voted.results??[]).map(formatProposal),saved:(saved.results??[]).map(formatProposal),notifications:notifications.results??[]});
});



// Guest participation is cookie-based, while registered accounts are needed only for saved proposals.
// A guest's cookie is not proof of one distinct human and cannot recover activity from another browser.

app.get('/api/me/verification', async (c) => {
  const actor=await getActor(c);
  if(!actor) return c.json({verifiedEmail:null,location:null,guest:true});
  const [verified,location]=await Promise.all([verifiedEmail(c,actor.id),locationVerification(c,actor.id)]);
  return c.json({verifiedEmail:verified?.email??null,location,guest:Boolean(actor.is_guest)});
});
app.post('/api/verification/email/request', async (c) => {
  const actor=await getActor(c,true);
  if(!actor) return c.json({error:'Unable to establish a session.'},500);
  if(!c.env.RESEND_API_KEY || !c.env.MAIL_FROM || !c.env.EMAIL_OTP_SECRET || !c.env.AUDIT_HASH_SECRET) return c.json({error:'Email verification is not configured. Contact the site operator.'},503);
  const input=await body(c);
  const email=safeString(input,'email').toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254) return c.json({error:'Enter a valid email address.'},400);
  if(!actor.is_guest && email!==actor.email.toLowerCase()) return c.json({error:'Verify the address associated with your account.'},400);
  const currently=await verifiedEmail(c,actor.id);
  if(currently?.email===email) return c.json({verified:true});
  const unique=await c.env.DB.prepare('SELECT user_id FROM verified_emails WHERE email=?').bind(email).first<{user_id:string}>();
  if(unique && unique.user_id!==actor.id) return c.json({error:'This email is already verified for another participant.'},409);
  const last=await c.env.DB.prepare('SELECT COUNT(*) as n FROM email_challenges WHERE (user_id=? OR email=?) AND created_at>?').bind(actor.id,email,new Date(Date.now()-3600000).toISOString()).first<{n:number}>();
  if((last?.n??0)>=3) return c.json({error:'Too many verification emails. Try again later.'},429);
  const ip=c.req.header('CF-Connecting-IP')??'unknown';
  const rateKey=await hmacHex(c.env.AUDIT_HASH_SECRET,ip+'|'+email);
  const previous=await c.env.DB.prepare('SELECT attempts,window_start FROM email_rate_limits WHERE rate_key=?').bind(rateKey).first<{attempts:number;window_start:string}>();
  const active=Boolean(previous&&Date.now()-Date.parse(previous.window_start)<3600000);
  if(active&&previous!.attempts>=3) return c.json({error:'Verification limit reached. Try again later.'},429);
  const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
  const id=crypto.randomUUID();
  const codeHash=await hmacHex(c.env.EMAIL_OTP_SECRET,id+'|'+code);
  const emailResponse=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:'Bearer '+c.env.RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({from:c.env.MAIL_FROM,to:[email],subject:'Your My Petition verification code',
      text:'Your My Petition verification code is '+code+'. It expires in 10 minutes. Do not share it. If you did not request this, ignore this message.'})
  });
  if(!emailResponse.ok) return c.json({error:'Could not send the verification email. Try again later.'},503);
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO email_challenges(id,user_id,email,code_hash,expires_at) VALUES(?,?,?,?,?)').bind(id,actor.id,email,codeHash,new Date(Date.now()+600000).toISOString()),
    c.env.DB.prepare('INSERT INTO email_rate_limits(rate_key,attempts,window_start) VALUES(?,?,?) ON CONFLICT(rate_key) DO UPDATE SET attempts=excluded.attempts,window_start=excluded.window_start').bind(rateKey,active?previous!.attempts+1:1,active?previous!.window_start:new Date().toISOString())
  ]);
  return c.json({challengeId:id,expiresInSeconds:600});
});
app.post('/api/verification/email/confirm', async (c) => {
  const actor=await getActor(c);
  if(!actor||!c.env.EMAIL_OTP_SECRET) return c.json({error:'No active verification session.'},401);
  const input=await body(c);
  const id=safeString(input,'challengeId');
  const code=safeString(input,'code');
  if(!/^[0-9]{6}$/.test(code)) return c.json({error:'Enter the six-digit code.'},400);
  const row=await c.env.DB.prepare('SELECT id,email,code_hash,expires_at,attempts,consumed_at FROM email_challenges WHERE id=? AND user_id=?').bind(id,actor.id).first<{id:string;email:string;code_hash:string;expires_at:string;attempts:number;consumed_at:string|null}>();
  if(!row||row.consumed_at||Date.parse(row.expires_at)<=Date.now()||row.attempts>=5) return c.json({error:'The code is invalid or expired. Request a new one.'},400);
  await c.env.DB.prepare('UPDATE email_challenges SET attempts=attempts+1 WHERE id=?').bind(id).run();
  const match=constantTimeMatch(row.code_hash,await hmacHex(c.env.EMAIL_OTP_SECRET,id+'|'+code));
  if(!match) return c.json({error:'Incorrect code.'},400);
  const existing=await c.env.DB.prepare('SELECT user_id FROM verified_emails WHERE email=?').bind(row.email).first<{user_id:string}>();
  if(existing&&existing.user_id!==actor.id) return c.json({error:'That address is already associated with another participant.'},409);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM verified_emails WHERE user_id=?').bind(actor.id),
    c.env.DB.prepare('INSERT INTO verified_emails(user_id,email) VALUES(?,?)').bind(actor.id,row.email),
    c.env.DB.prepare('UPDATE email_challenges SET consumed_at=? WHERE id=?').bind(new Date().toISOString(),id),
    c.env.DB.prepare('UPDATE users SET email_verified_at=? WHERE id=?').bind(new Date().toISOString(),actor.id)
  ]);
  return c.json({verified:true,email:row.email});
});
app.post('/api/verification/location/request', async (c) => {
  const actor=await getActor(c);
  if(!actor) return c.json({error:'Participate first to establish a session.'},401);
  if(!await verifiedEmail(c,actor.id)) return c.json({error:'Verify your email before requesting local participation verification.'},403);
  const input=await body(c);
  const locality=safeString(input,'locality');
  const region=safeString(input,'region');
  const postal=safeString(input,'postalCode').toUpperCase();
  if(!/^[a-zA-Z .'-]{2,80}$/.test(locality)||!/^[a-zA-Z .'-]{2,80}$/.test(region)||!/^[a-zA-Z0-9 -]{3,12}$/.test(postal)) return c.json({error:'Enter a valid city, state/region and postal code.'},400);
  const current=await locationVerification(c,actor.id);
  if(current?.status==='pending') return c.json({error:'You already have a pending request.'},409);
  await c.env.DB.prepare("INSERT INTO location_verifications(user_id,locality,region,postal_code,status,verification_method,evidence_reference,moderator_id,reviewed_at,requested_at) VALUES(?,?,? ,?,'pending','','',NULL,NULL,?) ON CONFLICT(user_id) DO UPDATE SET locality=excluded.locality,region=excluded.region,postal_code=excluded.postal_code,status='pending',verification_method='',evidence_reference='',moderator_id=NULL,reviewed_at=NULL,requested_at=excluded.requested_at")
    .bind(actor.id,locality,region,postal,new Date().toISOString()).run();
  return c.json({status:'pending',notice:'Location is self-reported until independently reviewed. Email verification alone does not verify residency.'},201);
});
app.post('/api/proposals/:slug/sign', async (c) => {
  const actor=await getActor(c);
  if(!actor) return c.json({error:'Start participating or verify your email to sign.'},401);
  const p=await fetchProposal(c,c.req.param('slug'));
  if(!p) return c.json({error:'Petition not found.'},404);
  if(p.kind!=='petition') return c.json({error:'Electronic signatures are only available for petitions.'},400);
  if(!openForVoting(p)) return c.json({error:'This petition is closed.'},409);
  if(!await isEligibleLocally(c,actor,p)) return c.json({error:'Approved local verification is required for this petition.'},403);
  const verified=await verifiedEmail(c,actor.id);
  if(!verified) return c.json({error:'Verify your email address before electronically signing.'},403);
  if(!c.env.AUDIT_HASH_SECRET) return c.json({error:'Signature audit protection is not configured.'},503);
  const input=await body(c);
  const signerName=safeString(input,'signerName');
  const showName=input.showName===true;
  if(signerName.length<2||signerName.length>120) return c.json({error:'Enter your full legal name (2–120 characters).'},400);
  if(input.consent!==true) return c.json({error:'Explicit consent to sign the petition electronically is required.'},400);
  const consentText='I intend to electronically sign this petition exactly as presented, using my typed name. I understand this creates an auditable record and is not automatically a government-recognized petition signature.';
  const documentHash=await sha256(JSON.stringify({id:p.id,slug:p.slug,title:p.title,description:p.description,kind:p.kind,created_at:p.created_at,consentText}));
  const ip=c.req.header('CF-Connecting-IP')??'unavailable';
  const ua=(c.req.header('User-Agent')??'unavailable').slice(0,500);
  const id=crypto.randomUUID();
  try{
    await c.env.DB.prepare('INSERT INTO signatures(id,proposal_id,user_id,signer_name,signer_email,document_hash,consent_text,consent_version,ip_hash,user_agent_hash,show_name) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id,p.id,actor.id,signerName,verified.email,documentHash,consentText,'2026-11-v1',await hmacHex(c.env.AUDIT_HASH_SECRET,ip),await sha256(ua),showName?1:0).run();
  }catch{
    return c.json({error:'This participant or verified email has already signed this petition. Signatures are not duplicated.'},409);
  }
  await announce(c,p,actor.id,'signature','A new electronic signature was added to a petition you follow.');
  return c.json({signed:true,receiptId:id,documentHash,signatureMethod:'typed-name-with-verified-email',notice:'An electronic signature is recorded with audit evidence. Legal recognition depends on the applicable petition rules.'},201);
});
app.get('/api/proposals/:slug/signature-receipt', async (c) => {
  const actor=await getActor(c);
  if(!actor) return c.json({error:'An active signer session is required.'},401);
  const p=await fetchProposal(c,c.req.param('slug'));
  if(!p) return c.json({error:'Petition not found.'},404);
  const receipt=await c.env.DB.prepare('SELECT id,signer_name,signer_email,document_hash,consent_text,consent_version,signed_at FROM signatures WHERE proposal_id=? AND user_id=?')
    .bind(p.id,actor.id).first();
  if(!receipt) return c.json({error:'No signature receipt exists for this participant.'},404);
  return c.json({receipt,petition:{title:p.title,slug:p.slug,created_at:p.created_at},recordType:'Electronic signature evidence — not a statutory certification'});
});
app.post('/api/proposals/:slug/save', async (c) => {
  const account=await currentUser(c);
  if(!account) return c.json({error:'Create an account or log in to save petitions.'},401);
  const p=await fetchProposal(c,c.req.param('slug'));
  if(!p) return c.json({error:'Proposal not found.'},404);
  const input=await body(c);
  if(typeof input.saved!=='boolean') return c.json({error:'Provide a saved boolean.'},400);
  if(input.saved) await c.env.DB.prepare('INSERT OR IGNORE INTO saved_proposals(user_id,proposal_id) VALUES(?,?)').bind(account.id,p.id).run();
  else await c.env.DB.prepare('DELETE FROM saved_proposals WHERE user_id=? AND proposal_id=?').bind(account.id,p.id).run();
  return c.json({saved:input.saved});
});
app.get('/api/me/notifications',async c=>{
  const actor=await getActor(c);
  if(!actor) return c.json({notifications:[],unread:0});
  const rows=await c.env.DB.prepare('SELECT n.id,n.kind,n.message,n.created_at,n.is_read,p.slug FROM notifications n LEFT JOIN proposals p ON p.id=n.proposal_id WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 50').bind(actor.id).all();
  const count=await c.env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND is_read=0').bind(actor.id).first<{n:number}>();
  return c.json({notifications:rows.results??[],unread:count?.n??0});
});
app.post('/api/me/notifications/read',async c=>{
  const actor=await getActor(c);
  if(!actor) return c.json({error:'No active participation session.'},401);
  await c.env.DB.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').bind(actor.id).run();
  return c.json({success:true});
});
app.post('/api/reports',async c=>{
  const actor=await getActor(c,true);
  if(!actor) return c.json({error:'Could not establish a session.'},500);
  const input=await body(c);
  const targetType=safeString(input,'targetType');
  const targetId=safeString(input,'targetId');
  const reason=safeString(input,'reason');
  const details=safeString(input,'details');
  if(!['proposal','comment'].includes(targetType)||!reasons.includes(reason)||!targetId||details.length>1000) return c.json({error:'Choose a report target, reason and optional details.'},400);
  const exists=targetType==='proposal'
    ?await c.env.DB.prepare("SELECT id FROM proposals WHERE id=? AND visibility='visible'").bind(targetId).first()
    :await c.env.DB.prepare("SELECT id FROM comments WHERE id=? AND visibility='visible'").bind(targetId).first();
  if(!exists) return c.json({error:'That content is not available.'},404);
  const count=await c.env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter_id=? AND created_at>?')
    .bind(actor.id,new Date(Date.now()-86400000).toISOString()).first<{n:number}>();
  if((count?.n??0)>=8) return c.json({error:'Daily reporting limit reached.'},429);
  try{
    await c.env.DB.prepare('INSERT INTO reports(id,reporter_id,target_type,target_id,reason,details) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),actor.id,targetType,targetId,reason,details).run();
  }catch{return c.json({error:'You have already reported this content.'},409);}
  return c.json({reported:true,notice:'Your report will be reviewed.'},201);
});
app.get('/api/moderation/queue',async c=>{
  const actor=await getActor(c);
  if(!await isModerator(c,actor)) return c.json({error:'Moderator authorization required.'},403);
  const [reports,locations]=await Promise.all([
    c.env.DB.prepare("SELECT id,target_type,target_id,reason,details,created_at FROM reports WHERE status='open' ORDER BY created_at DESC LIMIT 100").all(),
    c.env.DB.prepare("SELECT lv.user_id,lv.locality,lv.region,lv.postal_code,lv.requested_at,ve.email FROM location_verifications lv JOIN verified_emails ve ON ve.user_id=lv.user_id WHERE lv.status='pending' ORDER BY lv.requested_at DESC LIMIT 100").all()
  ]);
  return c.json({reports:reports.results??[],locations:locations.results??[]});
});
app.post('/api/moderation/reports/:id',async c=>{
  const actor=await getActor(c);
  if(!await isModerator(c,actor)||!actor) return c.json({error:'Moderator authorization required.'},403);
  const input=await body(c);
  const action=safeString(input,'action');
  if(!['dismiss','hide'].includes(action)) return c.json({error:'Choose dismiss or hide.'},400);
  const report=await c.env.DB.prepare("SELECT target_type,target_id,status FROM reports WHERE id=?").bind(c.req.param('id')).first<{target_type:string;target_id:string;status:string}>();
  if(!report||report.status!=='open') return c.json({error:'Report not found or already reviewed.'},404);
  if(action==='hide') {
    const table=report.target_type==='proposal'?'proposals':'comments';
    await c.env.DB.prepare("UPDATE "+table+" SET visibility='hidden' WHERE id=?").bind(report.target_id).run();
  }
  await c.env.DB.prepare('UPDATE reports SET status=?,reviewed_by=?,reviewed_at=? WHERE id=?')
    .bind(action==='hide'?'actioned':'dismissed',actor.id,new Date().toISOString(),c.req.param('id')).run();
  return c.json({resolved:true,status:action==='hide'?'actioned':'dismissed'});
});
app.post('/api/moderation/locations/:id',async c=>{
  const actor=await getActor(c);
  if(!await isModerator(c,actor)||!actor) return c.json({error:'Moderator authorization required.'},403);
  const input=await body(c);
  const action=safeString(input,'action');
  if(!['verify','reject'].includes(action)) return c.json({error:'Choose verify or reject.'},400);
  const method=safeString(input,'method');
  const reference=safeString(input,'evidenceReference');
  if(action==='verify'&&(!['manual-address-review','trusted-provider','mailed-code'].includes(method)||reference.length<8||reference.length>200)) return c.json({error:'Approval requires a documented independent verification method and an audit reference.'},400);
  const request=await c.env.DB.prepare("SELECT user_id FROM location_verifications WHERE user_id=? AND status='pending'").bind(c.req.param('id')).first<{user_id:string}>();
  if(!request) return c.json({error:'Pending request not found.'},404);
  await c.env.DB.prepare('UPDATE location_verifications SET status=?,verification_method=?,evidence_reference=?,moderator_id=?,reviewed_at=? WHERE user_id=?')
    .bind(action==='verify'?'verified':'rejected',action==='verify'?method:'',action==='verify'?reference:'',actor.id,new Date().toISOString(),request.user_id).run();
  return c.json({status:action==='verify'?'verified':'rejected'});
});

app.notFound((c) => c.json({ error: 'API endpoint not found.' }, 404));
app.onError((error, c) => {
  console.error('My Petition API error:', error);
  return c.json({ error: 'An unexpected server error occurred.' }, 500);
});
export default app;
