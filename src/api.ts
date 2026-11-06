export type User = { id: string; email: string; display_name: string };
export type Category = 'Community' | 'Environment' | 'Infrastructure' | 'Education' | 'Technology' | 'Healthcare' | 'Other';
export const categories: Category[] = ['Community', 'Environment', 'Infrastructure', 'Education', 'Technology', 'Healthcare', 'Other'];
export type Proposal = {
  id: string; slug: string; title: string; description: string; category: Category;
  location: string; kind: 'petition' | 'poll'; status: 'open' | 'closed';
  author_name: string; closes_at: string | null; created_at: string; is_open: boolean;
  support_count: number; oppose_count: number; comment_count: number;
  signature_count: number;verified_local_count:number;local_only:number;locality:string;region:string;

};
export type Position = 'support' | 'oppose';
export type ProposalDetail = {
  proposal: Proposal;
  isAuthor:boolean;mySignature:boolean;emailVerified:boolean;verifiedEmail:string|null;saved:boolean;
  locationVerification: {locality:string;region:string;postal_code:string;status:'pending'|'verified'|'rejected'}|null;
  myVote: {stance:Position;show_name:number;public_name:string|null}|null;
  participants: Array<{ stance: Position; display_name: string | null }>;
  comments: Array<{ id: string; body: string; created_at: string; display_name: string }>;
};
export type Stats = { proposals: number; votes: number; participants: number };
export type ListResponse = { proposals: Proposal[]; page: number; hasMore: boolean };
export type Activity = {created:Proposal[];voted:Proposal[];saved:Proposal[];notifications:Array<{id:string;kind:string;message:string;is_read:number;created_at:string;slug:string|null}>};

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
export async function api<T>(path: string, data?: unknown, method?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api' + path, {
      method: method ?? (data === undefined ? 'GET' : 'POST'),
      credentials: 'same-origin',
      headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new ApiError(body.error || 'Something went wrong. Try again.', response.status);
  return body as T;
}
export const number = (n: number) => Intl.NumberFormat('en-US').format(n);
export const relativeDate = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const percentage = (support: number, oppose: number) => support + oppose ? Math.round(support / (support + oppose) * 100) : 50;
