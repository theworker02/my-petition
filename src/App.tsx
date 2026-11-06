import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Check, CheckCircle2,
  ChevronDown, CircleHelp, Compass, Eye, Globe2, Heart, HeartHandshake, Landmark, Leaf,
  LockKeyhole, LogOut, MapPin, Menu, MessageCircle, Plus, Search, Send, ShieldCheck,
  Sparkles, ThumbsDown, ThumbsUp, UserCircle2, Users, Vote, X
} from 'lucide-react';
import { api, categories, number, percentage, relativeDate, type Activity, type Category, type ListResponse, type Position, type Proposal, type ProposalDetail, type Stats, type User } from './api';

type AuthContextValue = { user: User | null; loading: boolean; openAuth: () => void; logout: () => Promise<void> };
const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, openAuth: () => {}, logout: async () => {} });
const useAuth = () => useContext(AuthContext);
const icons = { Community: HeartHandshake, Environment: Leaf, Infrastructure: Landmark, Education: Globe2, Technology: Sparkles, Healthcare: Heart, Other: Compass };
const colors: Record<Category, string> = { Community: 'lilac', Environment: 'mint', Infrastructure: 'blue', Education: 'peach', Technology: 'lavender', Healthcare: 'rose', Other: 'yellow' };

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void }) => string;
      remove: (id: string) => void;
    };
  }
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  return null;
}
function Brand() {
  return <Link to="/" className="brand" aria-label="My Petition home">
    <span className="brand-symbol" aria-hidden="true"><span></span><span></span><span></span></span>
    <span>my<span className="brand-accent">petition</span><span className="brand-dot">.</span></span>
  </Link>;
}
function Header() {
  const { user, openAuth, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const nav = [
    { to: '/', label: 'Home' },
    { to: '/explore', label: 'Explore petitions' },
    { to: '/activity', label: 'My activity' }
  ];
  return <header className="site-header">
    <div className="container header-inner">
      <Brand />
      <nav className={'nav-links' + (menuOpen ? ' nav-open' : '')} aria-label="Main navigation">
        {nav.map(item => <NavLink key={item.to} end={item.to === '/'} to={item.to} onClick={() => setMenuOpen(false)} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>{item.label}</NavLink>)}
        <Link className="mobile-nav-create" onClick={() => setMenuOpen(false)} to="/create"><Plus size={17} /> Start a petition</Link>
      </nav>
      <div className="header-actions">
        {user ? <button className="user-menu" onClick={() => { navigate('/activity'); setMenuOpen(false); }} title="My account"><span className="avatar tiny">{user.display_name.charAt(0).toUpperCase()}</span><span className="user-label">{user.display_name.split(' ')[0]}</span></button> :
          <button className="text-button header-signin" onClick={openAuth}>Log in</button>}
        <Link className="button button-primary header-create" to="/create"><Plus size={17} strokeWidth={2.5} /> Create petition</Link>
        {user && <button className="icon-button logout-button" title="Log out" onClick={() => { void logout(); }}><LogOut size={18} /></button>}
        <button className="icon-button menu-button" aria-label="Toggle menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={23} /> : <Menu size={23} />}</button>
      </div>
    </div>
  </header>;
}
function Footer() {
  return <footer className="footer">
    <div className="container footer-inner">
      <div><Brand /><p>Make space for every voice.</p></div>
      <div className="footer-links"><Link to="/explore">Explore</Link><Link to="/create">Create</Link><Link to="/about">How it works</Link></div>
      <small>© {new Date().getFullYear()} My Petition. Public participation is not a legally binding election.</small>
    </div>
  </footer>;
}
function Count({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = previous.current;
    const to = value;
    previous.current = to;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) { setShown(to); return; }
    const start = performance.now();
    let frame = 0;
    const tick = (time: number) => {
      const progress = Math.min((time - start) / 650, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(from + (to - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{number(shown)}</>;
}
function CategoryIcon({ category, size = 19 }: { category: Category; size?: number }) {
  const Icon = icons[category] ?? Compass;
  return <Icon size={size} strokeWidth={1.9} />;
}
function ResultsBar({ proposal, labels = false }: { proposal: Proposal; labels?: boolean }) {
  const total = proposal.support_count + proposal.oppose_count;
  const percent = percentage(proposal.support_count, proposal.oppose_count);
  return <div className="results">
    {labels && <div className="results-head"><span><i className="result-dot supporting" /> Support <b>{number(proposal.support_count)}</b></span><span><i className="result-dot opposing" /> Oppose <b>{number(proposal.oppose_count)}</b></span></div>}
    <div className={'results-track' + (!total ? ' results-empty' : '')} role="img" aria-label={total ? percent + '% support, ' + (100 - percent) + '% oppose' : 'No votes yet'}>
      {total > 0 && <div className="results-support" style={{ width: percent + '%' }} />}
    </div>
    {labels && <div className="results-foot"><span>{total ? percent + '% support' : 'Awaiting first vote'}</span><span>{total ? (100 - percent) + '% oppose' : ''}</span></div>}
  </div>;
}
function ProposalCard({ proposal, index = 0 }: { proposal: Proposal; index?: number }) {
  const total = proposal.support_count + proposal.oppose_count;
  return <Link to={'/proposal/' + proposal.slug} className="proposal-card" style={{ animationDelay: Math.min(index, 7) * 65 + 'ms' }}>
    <div className={'card-art art-' + colors[proposal.category]}>
      <div className="art-orbit art-orbit-one" /><div className="art-orbit art-orbit-two" />
      <div className="art-big-icon"><CategoryIcon category={proposal.category} size={39} /></div>
      <span className="card-type">{proposal.kind === 'petition' ? 'PETITION' : 'PUBLIC POLL'}</span>
    </div>
    <div className="card-content">
      <div className="card-meta"><span><CategoryIcon category={proposal.category} size={15} /> {proposal.category}</span><span className={'status-chip ' + (proposal.is_open ? '' : 'closed')}>{proposal.is_open ? 'Active' : 'Closed'}</span></div>
      <h3>{proposal.title}</h3>
      <p>{proposal.description}</p>
      <div className="card-location"><MapPin size={14} /> {proposal.location || 'Open to everyone'}</div>
      <ResultsBar proposal={proposal} />
      <div className="card-bottom"><span className="card-count"><Users size={17} /><strong>{number(total)}</strong> {total === 1 ? 'voice' : 'voices'}</span><span className="card-arrow"><ArrowUpRight size={20} /></span></div>
    </div>
  </Link>;
}
function EmptyState({ filtered = false }: { filtered?: boolean }) {
  return <div className="empty-state">
    <div className="empty-illustration"><Vote size={36} /><span className="empty-spark"><Sparkles size={19} /></span></div>
    <h3>{filtered ? 'No matches found' : 'Every movement starts somewhere.'}</h3>
    <p>{filtered ? 'Try a different search or category to find proposals.' : 'No proposals have been published yet. Be the first to bring an idea to your community.'}</p>
    {!filtered && <Link className="button button-primary" to="/create"><Plus size={17} /> Create the first petition</Link>}
  </div>;
}
function SectionTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="section-title"><div><div className="eyebrow"><span className="eyebrow-line" /> {eyebrow}</div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}
function Home() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    Promise.all([api<Stats>('/stats'), api<ListResponse>('/proposals?sort=popular')])
      .then(([s, p]) => { if (alive) { setStats(s); setProposals(p.proposals.slice(0, 6)); } })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return <main>
    <section className="hero-section">
      <div className="container">
        <div className="hero">
          <div className="hero-stars" aria-hidden="true"><span>✳</span><span>✦</span><span>✳</span></div>
          <div className="hero-main">
            <div className="hero-pill"><span className="pulse-dot" /> A platform for collective change <ArrowUpRight size={14} /></div>
            <h1>Your voice.<br /><span>Your impact.</span></h1>
            <p>Big changes begin with a simple question. Start a petition, take a stand, and discover what your community really thinks.</p>
            <div className="hero-buttons"><Link to="/create" className="button hero-cta">Start a petition <ArrowRight size={20} /></Link><Link to="/explore" className="button hero-secondary">Explore proposals <ArrowUpRight size={17} /></Link></div>
            <div className="hero-trust"><span className="trust-icon"><ShieldCheck size={17} /></span> Your choice. Your voice. Your name stays private unless you share it.</div>
          </div>
          <div className="hero-decoration" aria-hidden="true">
            <div className="hero-halo halo-one" /><div className="hero-halo halo-two" /><div className="hero-halo halo-three" />
            <div className="hero-float-card float-card-top"><span className="float-icon float-green"><Check size={19} /></span><span><b>Have your say</b><small>Make it count</small></span></div>
            <div className="hero-main-orb"><span className="orb-small" /><div className="orb-thumb"><ThumbsUp size={62} strokeWidth={1.5} /></div><span className="orb-shine" /></div>
            <div className="hero-float-card float-card-bottom"><span className="float-icon float-orange"><Users size={21} /></span><span><b>Better together</b><small>Every perspective matters</small></span></div>
          </div>
          <div className="hero-statstrip">
            <div><strong><Count value={stats?.proposals ?? 0} /></strong><span>Proposals created</span></div>
            <div className="stat-divider" />
            <div><strong><Count value={stats?.votes ?? 0} /></strong><span>Votes submitted</span></div>
            <div className="stat-divider" />
            <div><strong><Count value={stats?.participants ?? 0} /></strong><span>People participating</span></div>
            <div className="stat-side"><span className="stat-spark">✳</span> Ideas become action here.</div>
          </div>
        </div>
      </div>
    </section>
    <section className="container categories-section">
      <SectionTitle eyebrow="FIND YOUR CAUSE" title="What matters to you?" description="Explore the conversations shaping our communities." />
      <div className="categories-row">
        {categories.map(c => <Link to={'/explore?category=' + encodeURIComponent(c)} key={c} className={'category-pill category-' + colors[c]}><span><CategoryIcon category={c} /></span>{c}<ArrowUpRight size={15} /></Link>)}
      </div>
    </section>
    <section className="container featured-section">
      <SectionTitle eyebrow="COMMUNITY PULSE" title="Explore the conversation" description="See where people are taking a stand, with results updated from real votes." action={<Link className="section-action" to="/explore">View all proposals <ArrowUpRight size={17} /></Link>} />
      {loading ? <div className="card-grid">{[0, 1, 2].map(n => <div className="card-skeleton" key={n} />)}</div> :
        proposals.length ? <div className="card-grid">{proposals.map((p, i) => <ProposalCard proposal={p} index={i} key={p.id} />)}</div> : <EmptyState />}
    </section>
    <section className="container how-section">
      <div className="how-panel">
        <div className="how-intro"><div className="eyebrow"><span className="eyebrow-line" /> SIMPLE BY DESIGN</div><h2>Change starts<br />with <em>you.</em></h2><p>Whether you have a bold idea or just want to make your opinion heard, there's a place for you here.</p><Link to="/about" className="text-link">See how it works <ArrowRight size={17} /></Link></div>
        <div className="steps">
          <div className="step"><span className="step-number">01</span><div className="step-icon"><Search size={22} /></div><div><h3>Find something that matters</h3><p>Discover proposals about topics you care about, locally or everywhere.</p></div></div>
          <div className="step"><span className="step-number">02</span><div className="step-icon"><Vote size={22} /></div><div><h3>Make your voice heard</h3><p>Support or oppose, and choose whether to show your name.</p></div></div>
          <div className="step"><span className="step-number">03</span><div className="step-icon"><BarChart3 size={22} /></div><div><h3>Watch the conversation grow</h3><p>Follow transparent results and engage in thoughtful discussion.</p></div></div>
        </div>
      </div>
    </section>
    <section className="container last-cta"><span className="cta-glow" /><Sparkles size={30} /><h2>Have something on your mind?</h2><p>Your next idea could start an important conversation.</p><Link to="/create" className="button button-white">Create your petition <ArrowUpRight size={18} /></Link></section>
  </main>;
}
function Explore() {
  const location = useLocation();
  const initial = new URLSearchParams(location.search).get('category') ?? 'All';
  const [category, setCategory] = useState(initial);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'popular' | 'recent'>('popular');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { setCategory(new URLSearchParams(location.search).get('category') ?? 'All'); setPage(1); }, [location.search]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({ sort, page: String(page) });
    if (category !== 'All') params.set('category', category);
    if (search.trim()) params.set('q', search.trim());
    api<ListResponse>('/proposals?' + params.toString()).then(r => { if (alive) { setData(r); setError(''); } }).catch(e => { if (alive) { setError(e.message); setData(null); } }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [category, search, sort, page]);
  return <main className="container page-container">
    <div className="page-heading"><div className="eyebrow"><span className="eyebrow-line" /> DISCOVER WHAT MATTERS</div><h1>Explore <span>petitions.</span></h1><p>Find causes worth talking about. There are two sides to every story — make yours heard.</p></div>
    <div className="explore-tools"><label className="search-box"><Search size={20} /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search proposals, topics, places..." aria-label="Search proposals" /></label><label className="sort-box">Sort by <select value={sort} onChange={e => { setSort(e.target.value as 'popular' | 'recent'); setPage(1); }}><option value="popular">Most popular</option><option value="recent">Newest first</option></select><ChevronDown size={15} /></label></div>
    <div className="filter-pills">{['All', ...categories].map(c => <button key={c} className={'filter-pill' + (category === c ? ' selected' : '')} onClick={() => { setCategory(c); setPage(1); }}>{c}</button>)}</div>
    <div className="list-header"><h2>{category === 'All' ? 'All proposals' : category + ' proposals'}</h2><span>{loading ? 'Loading...' : data?.proposals.length ? 'Showing ' + data.proposals.length + ' proposals' : 'No results'}</span></div>
    {error ? <ErrorBox message={error} /> : loading ? <div className="card-grid">{[0, 1, 2].map(n => <div className="card-skeleton" key={n} />)}</div> :
      data?.proposals.length ? <><div className="card-grid">{data.proposals.map((p, i) => <ProposalCard key={p.id} index={i} proposal={p} />)}</div><div className="pagination">{page > 1 && <button className="button button-outline" onClick={() => { setPage(page - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><ArrowLeft size={16} /> Previous</button>}{data.hasMore && <button className="button button-primary" onClick={() => { setPage(page + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Next page <ArrowRight size={16} /></button>}</div></> : <EmptyState filtered={Boolean(search.trim() || category !== 'All')} />}
  </main>;
}
function ErrorBox({ message }: { message: string }) { return <div className="error-box" role="alert"><CircleHelp size={19} /> {message}</div>; }

function ProposalPage() {
  const { slug } = useParams();
  const { user, openAuth } = useAuth();
  const [data, setData] = useState<ProposalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stance, setStance] = useState<Position | null>(null);
  const [showName, setShowName] = useState(false);
  const [voting, setVoting] = useState(false);
  const [voted, setVoted] = useState(false);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [message, setMessage] = useState('');
  const reload = async () => { const next = await api<ProposalDetail>('/proposals/' + encodeURIComponent(slug || '')); setData(next); return next; };
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<ProposalDetail>('/proposals/' + encodeURIComponent(slug || '')).then(next => {
      if (alive) { setData(next); setStance(next.myVote?.stance ?? null); setShowName(Boolean(next.myVote?.show_name)); setError(''); setVoted(false); }
    }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug, user]);
  const submitVote = async () => {
    if (!stance || !slug) return;
    if (!user) { openAuth(); return; }
    setVoting(true); setMessage('');
    try { await api('/proposals/' + encodeURIComponent(slug) + '/vote', { stance, showName }); await reload(); setVoted(true); }
    catch (e) { setMessage((e as Error).message); }
    finally { setVoting(false); }
  };
  const submitComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) { openAuth(); return; }
    if (!comment.trim() || !slug) return;
    setPosting(true); setMessage('');
    try { await api('/proposals/' + encodeURIComponent(slug) + '/comments', { body: comment }); setComment(''); await reload(); }
    catch (e) { setMessage((e as Error).message); }
    finally { setPosting(false); }
  };
  const close = async () => {
    if (!slug || !window.confirm('Close voting on this proposal? This cannot be undone.')) return;
    try { await api('/proposals/' + encodeURIComponent(slug) + '/close', {}); await reload(); }
    catch (e) { setMessage((e as Error).message); }
  };
  if (loading) return <main className="container page-container"><div className="detail-skeleton" /></main>;
  if (error || !data) return <main className="container page-container"><ErrorBox message={error || 'Proposal not found.'} /><Link to="/explore" className="text-link">Back to explore</Link></main>;
  const p = data.proposal;
  const total = p.support_count + p.oppose_count;
  const mineUnchanged = !!data.myVote && data.myVote.stance === stance && Boolean(data.myVote.show_name) === showName;
  return <main className="container page-container proposal-page">
    <Link className="back-link" to="/explore"><ArrowLeft size={18} /> All proposals</Link>
    <div className="proposal-layout">
      <div className="proposal-main">
        <div className={'detail-banner art-' + colors[p.category]}><div className="banner-orbit" /><span className="banner-icon"><CategoryIcon category={p.category} size={55} /></span><span className="banner-badge">{p.kind === 'petition' ? 'PETITION' : 'PUBLIC POLL'}</span></div>
        <div className="detail-meta"><span className="detail-category"><CategoryIcon category={p.category} size={17} /> {p.category}</span><span className={'status-chip ' + (p.is_open ? '' : 'closed')}>{p.is_open ? 'Open for voting' : 'Voting closed'}</span><span className="detail-date">Created {relativeDate(p.created_at)}</span></div>
        <h1 className="detail-title">{p.title}</h1>
        <div className="creator-row"><span className="avatar">{p.author_name.charAt(0).toUpperCase()}</span><span>Started by <strong>{p.author_name}</strong><small>{p.location ? <><MapPin size={13} /> {p.location}</> : 'Open to everyone'}</small></span></div>
        <div className="detail-body"><h2>About this proposal</h2>{p.description.split(/\n+/).filter(Boolean).map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>
        <div className="discussion"><div className="discussion-heading"><div><h2>Community discussion</h2><p>Share your perspective. Disagree respectfully.</p></div><span><MessageCircle size={18} /> {p.comment_count}</span></div>
          {message && <ErrorBox message={message} />}
          <form className="comment-form" onSubmit={e => { void submitComment(e); }}>
            <span className="avatar">{user?.display_name.charAt(0).toUpperCase() ?? '?'}</span>
            <div className="comment-fields"><textarea aria-label="Write a public comment" placeholder={user ? 'Add to the conversation...' : 'Log in to share your perspective...'} value={comment} maxLength={1000} onChange={e => setComment(e.target.value)} onFocus={() => { if (!user) openAuth(); }} rows={3} /><div className="comment-actions"><small>Comments display your chosen account name publicly.</small><button disabled={posting || (Boolean(user) && comment.trim().length < 3)} className="button button-primary" type="submit">{posting ? 'Posting...' : 'Post comment'} <Send size={16} /></button></div></div>
          </form>
          <div className="comment-list">{data.comments.length ? data.comments.map(c => <article className="comment" key={c.id}><span className="avatar">{c.display_name.charAt(0).toUpperCase()}</span><div><div className="comment-author"><strong>{c.display_name}</strong><time>{relativeDate(c.created_at)}</time></div><p>{c.body}</p></div></article>) : <div className="no-comments">No comments yet. You can start the conversation.</div>}</div>
        </div>
      </div>
      <aside className="proposal-sidebar">
        <div className="vote-panel">
          <div className="vote-panel-head"><span className="live-indicator"><span className="pulse-dot" /> LIVE RESULTS</span><span className="vote-panel-icon"><Vote size={21} /></span></div>
          <div className="vote-total"><Count value={total} /><span>{total === 1 ? 'voice so far' : 'voices so far'}</span></div>
          <ResultsBar proposal={p} labels />
          <div className="vote-divider" />
          <h3>{data.myVote ? 'Your voice is counted.' : 'Where do you stand?'}</h3>
          <p className="vote-intro">{data.myVote ? 'You can update your position or name visibility at any time while voting is open.' : 'Every perspective matters. Choose the position you believe in.'}</p>
          {p.is_open ? <>
            <div className="vote-choices"><button className={'vote-choice support-choice' + (stance === 'support' ? ' selected' : '')} onClick={() => setStance('support')} aria-pressed={stance === 'support'}><span><ThumbsUp size={22} /> I support this</span><span className="choice-check">{stance === 'support' && <Check size={17} />}</span></button><button className={'vote-choice oppose-choice' + (stance === 'oppose' ? ' selected' : '')} onClick={() => setStance('oppose')} aria-pressed={stance === 'oppose'}><span><ThumbsDown size={22} /> I oppose this</span><span className="choice-check">{stance === 'oppose' && <Check size={17} />}</span></button></div>
            <label className="name-choice"><input type="checkbox" checked={showName} onChange={e => setShowName(e.target.checked)} /><span><Eye size={17} /> Show my display name publicly <small>{showName ? 'Your account display name will be visible on this proposal.' : 'Your name will be hidden from other participants.'}</small></span></label>
            <button disabled={!stance || voting || mineUnchanged} className="button button-primary button-block vote-submit" onClick={() => { void submitVote(); }}>{voting ? 'Submitting...' : !user ? 'Log in to submit' : data.myVote ? 'Update my vote' : 'Submit my vote'} <ArrowRight size={18} /></button>
            {voted && <div className="success-note" role="status"><CheckCircle2 size={18} /> Your vote has been recorded.</div>}
          </> : <div className="closed-note"><LockKeyhole size={18} /> This proposal is no longer accepting votes.</div>}
          <div className="privacy-caption"><ShieldCheck size={17} /><span>Your identity is never published with an anonymous-display vote. Your account is still used to prevent duplicate votes.</span></div>
          {user && data.isAuthor && p.is_open && <button className="close-action" onClick={() => { void close(); }}>Close this proposal</button>}
        </div>
        <div className="participants-panel"><div className="participants-head"><h3>Recent participants</h3><span className="participant-count">{total}</span></div>
          {data.participants.length ? <div className="participant-list">{data.participants.map((part, i) => <div className="participant-row" key={i}><span className={'avatar participant-avatar' + (!part.display_name ? ' anonymous-avatar' : '')}>{part.display_name ? part.display_name.charAt(0).toUpperCase() : <LockKeyhole size={15} />}</span><span className="participant-name">{part.display_name || 'Anonymous participant'}</span><span className={'participant-stance ' + part.stance}>{part.stance === 'support' ? 'Supports' : 'Opposes'}</span></div>)}</div> : <div className="participants-empty">Be the first to participate.</div>}
        </div>
        <div className="sidebar-disclaimer"><CircleHelp size={18} /><span>These are voluntary online responses, not a scientific poll or an official government vote.</span></div>
      </aside>
    </div>
  </main>;
}
function Create() {
  const { user, openAuth } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', description: '', category: 'Community', location: '', kind: 'petition', closesAt: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const update = (key: keyof typeof form, value: string) => setForm(f => ({ ...f, [key]: value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) { openAuth(); return; }
    setSaving(true); setError('');
    try {
      const response = await api<{ slug: string }>('/proposals', { ...form, closesAt: form.closesAt ? new Date(form.closesAt).toISOString() : '' });
      navigate('/proposal/' + response.slug);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  return <main className="container page-container create-page">
    <Link className="back-link" to="/explore"><ArrowLeft size={18} /> Back to explore</Link>
    <div className="page-heading create-heading"><div className="eyebrow"><span className="eyebrow-line" /> YOUR IDEA STARTS HERE</div><h1>Start something <span>meaningful.</span></h1><p>Give your idea a voice. Bring people together around a clear, constructive proposal.</p></div>
    <div className="create-layout">
      <form className="create-form" onSubmit={e => { void submit(e); }}>
        <div className="form-section"><div className="form-number">01</div><div className="form-section-body"><h2>What's your idea?</h2><p>Start with a specific question or change you'd like people to consider.</p>
          <label className="field-label" htmlFor="proposal-title">Proposal title <span>*</span></label>
          <input id="proposal-title" className="field-input" value={form.title} minLength={12} maxLength={140} required placeholder="e.g. Should our town add more public recycling bins?" onChange={e => update('title', e.target.value)} />
          <div className="field-help">{form.title.length}/140 characters · Make it clear and neutral.</div>
          <label className="field-label" htmlFor="proposal-description">Explain your proposal <span>*</span></label>
          <textarea id="proposal-description" className="field-input field-textarea" value={form.description} minLength={60} maxLength={10000} required placeholder="Describe the issue, explain what could change, and give people the context they need to make an informed decision..." onChange={e => update('description', e.target.value)} rows={8} />
          <div className="field-help">{form.description.length}/10,000 characters · At least 60 characters.</div>
        </div></div>
        <div className="form-section"><div className="form-number">02</div><div className="form-section-body"><h2>Set the details</h2><p>Help people discover your proposal.</p>
          <label className="field-label" htmlFor="proposal-kind">What are you creating? <span>*</span></label>
          <div className="kind-selector"><label className={'kind-option' + (form.kind === 'petition' ? ' selected' : '')}><input type="radio" name="kind" value="petition" checked={form.kind === 'petition'} onChange={e => update('kind', e.target.value)} /><HeartHandshake size={24} /><strong>Petition</strong><small>Gather support or opposition for a proposed change.</small></label><label className={'kind-option' + (form.kind === 'poll' ? ' selected' : '')}><input type="radio" name="kind" value="poll" checked={form.kind === 'poll'} onChange={e => update('kind', e.target.value)} /><BarChart3 size={24} /><strong>Public poll</strong><small>Ask a question and see how people respond.</small></label></div>
          <label className="field-label" htmlFor="proposal-category">Category <span>*</span></label>
          <select id="proposal-category" className="field-input" value={form.category} onChange={e => update('category', e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select>
          <label className="field-label" htmlFor="proposal-location">Location <span className="optional">(optional)</span></label>
          <input id="proposal-location" className="field-input" value={form.location} maxLength={100} placeholder="e.g. East Haven, Connecticut" onChange={e => update('location', e.target.value)} />
          <label className="field-label" htmlFor="proposal-closes">Closing date <span className="optional">(optional)</span></label>
          <input id="proposal-closes" type="datetime-local" className="field-input" value={form.closesAt} onChange={e => update('closesAt', e.target.value)} />
          <div className="field-help">Leave blank to keep voting open until you close it.</div>
        </div></div>
        {error && <ErrorBox message={error} />}
        <div className="submit-section"><div><ShieldCheck size={19} /><span>You'll be listed as the creator. You can close your proposal when you're ready.</span></div><button className="button button-primary" disabled={saving} type="submit">{saving ? 'Publishing...' : user ? 'Publish proposal' : 'Log in to publish'} <ArrowRight size={18} /></button></div>
      </form>
      <aside className="create-sidebar"><div className="preview-card"><span className="preview-tag"><Eye size={15} /> LIVE PREVIEW</span><div className={'preview-art art-' + colors[form.category as Category]}><CategoryIcon category={form.category as Category} size={45} /></div><div className="preview-body"><span className="preview-category">{form.category} · {form.kind === 'petition' ? 'Petition' : 'Public poll'}</span><h3>{form.title || 'Your inspiring idea goes here'}</h3><p>{form.description || 'Your proposal description will appear here as you write it.'}</p><div className="preview-footer"><Users size={17} /> 0 voices <ArrowUpRight size={17} /></div></div></div>
        <div className="tips-card"><Sparkles size={23} /><h3>Tips for a great proposal</h3><ul><li>Ask one clear question.</li><li>Give context from different perspectives.</li><li>Focus on concrete, achievable changes.</li><li>Invite honest participation — not just agreement.</li></ul></div>
      </aside>
    </div>
  </main>;
}
function ActivityPage() {
  const { user, loading, openAuth } = useAuth();
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (user) api<Activity>('/me/activity').then(setData).catch(e => setError(e.message)); else setData(null); }, [user]);
  if (loading) return <main className="container page-container"><div className="detail-skeleton" /></main>;
  if (!user) return <main className="container page-container"><div className="auth-required"><UserCircle2 size={42} /><h1>Your activity, all in one place.</h1><p>Log in to see the proposals you created and the conversations you've joined.</p><button className="button button-primary" onClick={openAuth}>Log in or create an account <ArrowRight size={17} /></button></div></main>;
  return <main className="container page-container activity-page"><div className="page-heading"><div className="eyebrow"><span className="eyebrow-line" /> YOUR SPACE</div><h1>My <span>activity.</span></h1><p>Follow your ideas and the voices you've added to the conversation.</p></div><div className="profile-strip"><div className="avatar profile-avatar">{user.display_name.charAt(0).toUpperCase()}</div><div><strong>{user.display_name}</strong><span>{user.email}</span></div><span className="profile-badge"><ShieldCheck size={15} /> Signed in</span></div>
    {error ? <ErrorBox message={error} /> : !data ? <div className="detail-skeleton" /> : <><div className="activity-section"><SectionTitle eyebrow="MADE BY YOU" title="Your proposals" action={<Link className="section-action" to="/create">Create a new one <Plus size={17} /></Link>} />{data.created.length ? <div className="card-grid">{data.created.map((p, i) => <ProposalCard key={p.id} proposal={p} index={i} />)}</div> : <EmptyState />}</div><div className="activity-section"><SectionTitle eyebrow="YOUR PARTICIPATION" title="Where you've voted" />{data.voted.length ? <div className="card-grid">{data.voted.map((p, i) => <ProposalCard key={p.id} proposal={p} index={i} />)}</div> : <div className="empty-state compact"><Vote size={29} /><h3>No votes yet</h3><p>Explore proposals and share your perspective.</p><Link to="/explore" className="button button-outline">Explore proposals <ArrowRight size={16} /></Link></div>}</div></>}
  </main>;
}
function About() {
  return <main className="container page-container about-page"><div className="page-heading"><div className="eyebrow"><span className="eyebrow-line" /> ABOUT MY PETITION</div><h1>Better ideas start with <span>every voice.</span></h1><p>My Petition is a public participation platform where people can start proposals, share perspectives, and understand the conversation around them.</p></div><div className="about-grid"><div><HeartHandshake size={30} /><h2>Create a petition or poll</h2><p>Introduce a proposal with a clear question and enough context for an informed decision.</p></div><div><Vote size={30} /><h2>Choose your position</h2><p>Support or oppose a proposal. One logged-in account can have one active response per proposal, and can update that response.</p></div><div><LockKeyhole size={30} /><h2>Decide what to share</h2><p>Show your account display name on a vote or keep it hidden. My Petition still associates your vote with your account to limit duplicate participation. Public comments always show your display name.</p></div><div><BarChart3 size={30} /><h2>Understand the results</h2><p>See up-to-date counts and the balance of opinions. Results reflect only people who participated online: they do not represent a scientific sample, legal petition signature verification, or an official election.</p></div></div><div className="about-cta"><h2>Ready to make your voice count?</h2><Link className="button button-primary" to="/explore">Explore proposals <ArrowRight size={18} /></Link></div></main>;
}

function TurnstileChallenge({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widget: string | null = null;
    let cancelled = false;
    let polling: number | undefined;
    function render() {
      if (cancelled || !ref.current || !window.turnstile) return;
      widget = window.turnstile.render(ref.current, { sitekey: siteKey, callback: onToken, 'expired-callback': () => onToken('') });
    }
    if (!window.turnstile) {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      document.head.appendChild(script);
      polling = window.setInterval(() => { if (window.turnstile) { window.clearInterval(polling); render(); } }, 150);
    } else render();
    return () => { cancelled = true; if (polling) clearInterval(polling); if (widget) window.turnstile?.remove(widget); };
  }, [siteKey, onToken]);
  return <div ref={ref} className="turnstile-slot" />;
}
function AuthDialog({ onClose, onLogin }: { onClose: () => void; onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { api<{ turnstileSiteKey: string }>('/config').then(c => setTurnstileSiteKey(c.turnstileSiteKey)).catch(() => {}); }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setError('');
    try {
      const result = await api<{ user: User }>(mode === 'login' ? '/auth/login' : '/auth/register', mode === 'login' ? { email, password } : { email, password, displayName, turnstileToken: token });
      onLogin(result.user);
    } catch (e) { setError((e as Error).message); }
    finally { setSubmitting(false); }
  };
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog"><X size={21} /></button><div className="dialog-logo"><span className="brand-symbol"><span></span><span></span><span></span></span></div><div className="eyebrow dialog-eyebrow">MY PETITION</div><h2 id="auth-title">{mode === 'login' ? 'Welcome back.' : 'Join the conversation.'}</h2><p>{mode === 'login' ? 'Sign in and keep making your voice count.' : 'Create an account to publish proposals and participate.'}</p><div className="auth-tabs"><button type="button" onClick={() => { setMode('login'); setError(''); }} className={mode === 'login' ? 'selected' : ''}>Log in</button><button type="button" onClick={() => { setMode('register'); setError(''); }} className={mode === 'register' ? 'selected' : ''}>Sign up</button></div><form onSubmit={e => { void submit(e); }}>{mode === 'register' && <><label className="field-label" htmlFor="auth-name">Display name</label><input id="auth-name" className="field-input" autoComplete="nickname" required minLength={2} maxLength={60} placeholder="How should people see you?" value={displayName} onChange={e => setDisplayName(e.target.value)} /></>}<label className="field-label" htmlFor="auth-email">Email address</label><input id="auth-email" className="field-input" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} /><label className="field-label" htmlFor="auth-password">Password</label><input id="auth-password" className="field-input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 12 : undefined} required placeholder={mode === 'register' ? 'At least 12 characters' : 'Enter your password'} value={password} onChange={e => setPassword(e.target.value)} />{mode === 'register' && turnstileSiteKey && <TurnstileChallenge siteKey={turnstileSiteKey} onToken={setToken} />}{error && <ErrorBox message={error} />}<button type="submit" disabled={submitting || (mode === 'register' && Boolean(turnstileSiteKey) && !token)} className="button button-primary button-block auth-submit">{submitting ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'} <ArrowRight size={17} /></button></form><div className="dialog-privacy"><LockKeyhole size={15} /> Your email is never displayed publicly. Display names may be pseudonyms; accounts are not verified identities.</div></div></div>;
}
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  useEffect(() => { let active = true; api<{ user: User | null }>('/session').then(result => { if (active) setUser(result.user); }).catch(() => {}).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const logout = async () => { try { await api('/auth/logout', {}); setUser(null); } catch { setUser(null); } };
  return <AuthContext.Provider value={{ user, loading, openAuth: () => setAuthOpen(true), logout }}>
    <BrowserRouter><ScrollToTop /><div className="app-shell"><Header /><Routes><Route path="/" element={<Home />} /><Route path="/explore" element={<Explore />} /><Route path="/proposal/:slug" element={<ProposalPage />} /><Route path="/create" element={<Create />} /><Route path="/activity" element={<ActivityPage />} /><Route path="/about" element={<About />} /><Route path="*" element={<main className="container page-container"><EmptyState filtered /></main>} /></Routes><Footer /></div></BrowserRouter>
    {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} onLogin={next => { setUser(next); setAuthOpen(false); }} />}
  </AuthContext.Provider>;
}
