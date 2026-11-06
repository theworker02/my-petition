import { Hono, type Context } from 'hono';

type Bindings = {
  DB: D1Database;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
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
};

const app = new Hono<AppEnv>();
const encoder = new TextEncoder();
const cookieName = 'mp_session';
const categories = ['Community', 'Environment', 'Infrastructure', 'Education', 'Technology', 'Healthcare', 'Other'];
const selectProposal = [
  'SELECT p.*, u.display_name AS author_name,',
  "(SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id AND v.stance = 'support') AS support_count,",
  "(SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id AND v.stance = 'oppose') AS oppose_count,",
  '(SELECT COUNT(*) FROM comments x WHERE x.proposal_id = p.id) AS comment_count',
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
  return { ...publicProposal, support_count: Number(p.support_count), oppose_count: Number(p.oppose_count), comment_count: Number(p.comment_count), is_open: openForVoting(p) };
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
  return c.env.DB.prepare(selectProposal + ' WHERE p.slug=?').bind(slug).first<ProposalRow>();
}

app.use('/api/*', async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    const target = new URL(c.req.url);
    let allowed = origin === target.origin;
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
app.get('/api/session', async (c) => c.json({ user: await currentUser(c) }));

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
  const [myVote, participantRows, commentRows] = await Promise.all([
    user ? c.env.DB.prepare('SELECT stance,show_name FROM votes WHERE proposal_id=? AND user_id=?').bind(p.id, user.id).first<{ stance: string; show_name: number }>() : Promise.resolve(null),
    c.env.DB.prepare('SELECT v.stance, CASE WHEN v.show_name=1 THEN u.display_name ELSE NULL END AS display_name FROM votes v JOIN users u ON u.id=v.user_id WHERE v.proposal_id=? ORDER BY v.updated_at DESC LIMIT 14')
      .bind(p.id).all<{ stance: string; display_name: string | null }>(),
    c.env.DB.prepare('SELECT x.id,x.body,x.created_at,u.display_name FROM comments x JOIN users u ON u.id=x.user_id WHERE x.proposal_id=? ORDER BY x.created_at DESC LIMIT 40')
      .bind(p.id).all<{ id: string; body: string; created_at: string; display_name: string }>()
  ]);
  return c.json({ proposal: formatProposal(p), myVote: myVote ?? null, participants: participantRows.results ?? [], comments: commentRows.results ?? [] });
});

app.post('/api/proposals', async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'Sign in to create a proposal.' }, 401);
  const payload = await body(c);
  const title = safeString(payload, 'title');
  const description = safeString(payload, 'description');
  const category = safeString(payload, 'category');
  const location = safeString(payload, 'location');
  const kind = safeString(payload, 'kind');
  const closesInput = safeString(payload, 'closesAt');
  if (title.length < 12 || title.length > 140) return c.json({ error: 'Title must be 12–140 characters.' }, 400);
  if (description.length < 60 || description.length > 10000) return c.json({ error: 'Description must be 60–10,000 characters.' }, 400);
  if (!categories.includes(category)) return c.json({ error: 'Choose a category.' }, 400);
  if (location.length > 100) return c.json({ error: 'Location must be under 100 characters.' }, 400);
  if (kind !== 'petition' && kind !== 'poll') return c.json({ error: 'Choose a proposal type.' }, 400);
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
  await c.env.DB.prepare('INSERT INTO proposals (id,slug,author_id,title,description,category,location,kind,closes_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), slug, user.id, title, description, category, location, kind, closesAt).run();
  return c.json({ slug }, 201);
});

app.post('/api/proposals/:slug/vote', async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'Sign in to participate.' }, 401);
  const p = await fetchProposal(c, c.req.param('slug'));
  if (!p) return c.json({ error: 'Proposal not found.' }, 404);
  if (!openForVoting(p)) return c.json({ error: 'Voting has closed.' }, 409);
  const payload = await body(c);
  const stance = safeString(payload, 'stance');
  if (!['support', 'oppose'].includes(stance) || typeof payload.showName !== 'boolean') return c.json({ error: 'Choose a position and name visibility.' }, 400);
  const previous = await c.env.DB.prepare('SELECT updated_at FROM votes WHERE proposal_id=? AND user_id=?')
    .bind(p.id, user.id).first<{ updated_at: string }>();
  if (previous && Date.now() - new Date(previous.updated_at).getTime() < 2000) return c.json({ error: 'Please wait a moment before changing your vote.' }, 429);
  await c.env.DB.prepare(
    "INSERT INTO votes(proposal_id,user_id,stance,show_name) VALUES (?,?,?,?) ON CONFLICT(proposal_id,user_id) DO UPDATE SET stance=excluded.stance,show_name=excluded.show_name,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ).bind(p.id, user.id, stance, payload.showName ? 1 : 0).run();
  return c.json({ success: true });
});

app.post('/api/proposals/:slug/comments', async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'Sign in to join the discussion.' }, 401);
  const p = await fetchProposal(c, c.req.param('slug'));
  if (!p) return c.json({ error: 'Proposal not found.' }, 404);
  const payload = await body(c);
  const comment = safeString(payload, 'body');
  if (comment.length < 3 || comment.length > 1000) return c.json({ error: 'Comment must be 3–1,000 characters.' }, 400);
  const last = await c.env.DB.prepare('SELECT created_at FROM comments WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(user.id).first<{created_at:string}>();
  if (last && Date.now() - new Date(last.created_at).getTime() < 20000) return c.json({ error: 'Please wait 20 seconds between comments.' }, 429);
  await c.env.DB.prepare('INSERT INTO comments (id,proposal_id,user_id,body) VALUES (?,?,?,?)').bind(crypto.randomUUID(), p.id, user.id, comment).run();
  return c.json({ success: true }, 201);
});

app.post('/api/proposals/:slug/close', async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'Sign in first.' }, 401);
  const p = await fetchProposal(c, c.req.param('slug'));
  if (!p) return c.json({ error: 'Proposal not found.' }, 404);
  if (p.author_id !== user.id) return c.json({ error: 'Only the creator can close this proposal.' }, 403);
  await c.env.DB.prepare("UPDATE proposals SET status='closed' WHERE id=?").bind(p.id).run();
  return c.json({ success: true });
});

app.get('/api/me/activity', async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'Sign in first.' }, 401);
  const [created, voted] = await Promise.all([
    c.env.DB.prepare(selectProposal + ' WHERE p.author_id=? ORDER BY p.created_at DESC LIMIT 50').bind(user.id).all<ProposalRow>(),
    c.env.DB.prepare(selectProposal + ' JOIN votes myv ON myv.proposal_id=p.id WHERE myv.user_id=? ORDER BY myv.updated_at DESC LIMIT 50').bind(user.id).all<ProposalRow>()
  ]);
  return c.json({ created: (created.results ?? []).map(formatProposal), voted: (voted.results ?? []).map(formatProposal) });
});

app.notFound((c) => c.json({ error: 'API endpoint not found.' }, 404));
app.onError((error, c) => {
  console.error('My Petition API error:', error);
  return c.json({ error: 'An unexpected server error occurred.' }, 500);
});
export default app;
