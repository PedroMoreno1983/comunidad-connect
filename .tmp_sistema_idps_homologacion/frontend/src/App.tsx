import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';

type Page<T> = { items: T[]; total: number; page: number; pageSize: number; pages: number };
type Item = { id: string; canonicalId?: string; originalId?: string; statement: string; difficulty?: number; status: string };
type BankOverview = { canonicalItems: number; variants: number; occurrences: number; results: number; pendingReviews: number; generatedItems: number };
type BankItem = { canonicalId: string; canonicalText: string; status: string; actorName?: string; actorCode?: string; dimensionName?: string; dimensionCode?: string; subdimensionName?: string; firstYear?: number; lastYear?: number; years: number[]; methods: string[]; totalVariants: number; totalOccurrences: number; totalResults: number };
type BankVariant = { variantId: string; variantNumber: number; text: string; variantType: string; approvalStatus: string; changeSummary?: string };
type BankOccurrence = { occurrenceId: string; yearApplied: number; actorLabel?: string; gradeLabel?: string; formLabel?: string; questionCode?: string; promptText?: string; originalText: string; decisionTaxonomy: string; processingStatus: string };
type BankResult = { resultId: string; occurrenceId: string; yearAnalysis: number; estimationMethod: string; methodologicalContext?: string; meanValue?: number; stdDev?: number; kurtosis?: number; cit?: number; missingPct?: number; irtA?: number; irtB?: number; irtC?: number; irtInformation?: number; metrics: Record<string, unknown> };
type BankRevision = { id: string; occurrenceOriginId: string; automaticDecision: string; humanStatus: string; confidenceScore?: number; combinedScore?: number; requiresHumanReview: boolean; reviewNotes?: string; createdAt?: string; canonicalText?: string };
type BankItemDetail = { item: BankItem; variants: BankVariant[]; occurrences: BankOccurrence[]; results: BankResult[]; revisions: BankRevision[] };
type Homologation = { id: string; sourceItemId: string; candidateItemId?: string; exactMatchScore?: number; fuzzyMatchScore?: number; semanticMatchScore?: number; confidence?: string; decision?: string };
type Revision = { id: string; revisionType: string; priority: number; status: string; notes?: string; createdAt: string };
type ResultRow = { id: string; year: number; calculationMethod: string; questionCode?: string; indicatorCode?: string; dimensionLabel?: string; subdimensionLabel?: string; promptText?: string; itemText?: string; metrics: Record<string, unknown> };
type Proposal = { id: string; requestId: string; statement: string; dimensionSuggested: string; subdimensionSuggested?: string; proposalType: string; status: string; confidenceScore: number; classificationJustification?: string; similarItems: Array<Record<string, unknown>>; reviewedBy?: string; createdAt: string };
type Actor = { id: string; code: string; name: string; type: string; isActive: boolean };
type Evaluation = { id: string; code: string; name: string; type: string; yearStart: number; yearEnd?: number };
type ProposalForm = { actor: string; dimension: string; subdimension?: string; purpose: string; educationLevel: string; indicator?: string; constraints?: string; requestedBy?: string; numProposals: number };

const apiBase = (() => {
  const raw = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api/v1';
  const trimmed = raw.replace(/\/$/, '');
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
})();

const toCamel = (value: string) => value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const toSnake = (value: string) => value.replace(/([A-Z])/g, '_$1').toLowerCase();
const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof FormData);
const mapKeys = <T,>(value: unknown, mapper: (key: string) => string): T => {
  if (Array.isArray(value)) return value.map((entry) => mapKeys(entry, mapper)) as T;
  if (!isPlainObject(value)) return value as T;
  return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, entry]) => {
    acc[mapper(key)] = mapKeys(entry, mapper);
    return acc;
  }, {}) as T;
};
const fmt = (value?: string) => (value ? new Date(value).toLocaleString('es-CL') : '-');
const short = (value?: string, max = 140) => (!value ? '-' : value.length > max ? `${value.slice(0, max).trim()}...` : value);
const metricSummary = (metrics: Record<string, unknown>) =>
  Object.entries(metrics || {}).slice(0, 4).map(([key, value]) => `${key}: ${typeof value === 'number' ? value.toFixed(3) : String(value)}`).join(' | ') || 'Sin metricas';
const initialProposal = (): ProposalForm => ({
  actor: 'Estudiante',
  dimension: 'Autoestima academica y motivacion escolar',
  subdimension: '',
  purpose: 'reflexionar sobre la convivencia, el bienestar y la participacion escolar',
  educationLevel: '2M',
  indicator: '',
  constraints: '',
  requestedBy: '',
  numProposals: 3,
});

class ApiClient {
  token?: string;

  setToken(token?: string) {
    this.token = token;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = { ...((options.headers as Record<string, string>) || {}) };
    const isFormData = options.body instanceof FormData;
    if (!isFormData && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let body = options.body;
    if (!isFormData && typeof body === 'string') {
      try { body = JSON.stringify(mapKeys(JSON.parse(body), toSnake)); } catch {}
    }
    const response = await fetch(`${apiBase}${endpoint}`, { ...options, headers, body });
    const isJson = response.headers.get('content-type')?.includes('application/json');
    if (!response.ok) {
      const error = isJson ? mapKeys<{ detail?: string; error?: string }>(await response.json().catch(() => ({})), toCamel) : {};
      throw new Error(error.detail || error.error || `HTTP ${response.status}`);
    }
    if (response.status === 204 || !isJson) return undefined as T;
    return mapKeys<T>(await response.json(), toCamel);
  }

  login(username: string, password: string) { return this.request<{ accessToken: string; username: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }); }
  me() { return this.request<{ username: string }>('/auth/me'); }
  bankOverview() { return this.request<BankOverview>('/bank/overview'); }
  bankItems(params: { skip?: number; limit?: number; q?: string; year?: string; actor?: string; dimension?: string; subdimension?: string; method?: string; status?: string }) { const p = new URLSearchParams({ skip: String(params.skip || 0), limit: String(params.limit || 20) }); if (params.q) p.append('q', params.q); if (params.year) p.append('year', params.year); if (params.actor) p.append('actor', params.actor); if (params.dimension) p.append('dimension', params.dimension); if (params.subdimension) p.append('subdimension', params.subdimension); if (params.method) p.append('method', params.method); if (params.status) p.append('status', params.status); return this.request<Page<BankItem>>(`/bank/items?${p}`); }
  bankItemDetail(canonicalId: string) { return this.request<BankItemDetail>(`/bank/items/${encodeURIComponent(canonicalId)}`); }
  bankRevisions(skip = 0, limit = 20, status = '') { const p = new URLSearchParams({ skip: String(skip), limit: String(limit) }); if (status) p.append('status', status); return this.request<Page<BankRevision>>(`/bank/revisions?${p}`); }
  items(skip = 0, limit = 20) { return this.request<Page<Item>>(`/items?skip=${skip}&limit=${limit}`); }
  searchItems(query: string) { return this.request<Item[]>(`/items/search?q=${encodeURIComponent(query)}&limit=10`); }
  homologations() { return this.request<Homologation[]>('/homologation/pending?skip=0&limit=100'); }
  results(skip = 0, limit = 20, year = '', method = '') { const p = new URLSearchParams({ skip: String(skip), limit: String(limit) }); if (year) p.append('year', year); if (method) p.append('calculation_method', method); return this.request<Page<ResultRow>>(`/results?${p}`); }
  proposals(skip = 0, limit = 12, status = '') { const p = new URLSearchParams({ skip: String(skip), limit: String(limit) }); if (status) p.append('status', status); return this.request<Page<Proposal>>(`/generated-items?${p}`); }
  generate(payload: ProposalForm) { return this.request<Proposal[]>('/generated-items/generate', { method: 'POST', body: JSON.stringify(payload) }); }
  reviewProposal(id: string, status: string) { return this.request<Proposal>(`/generated-items/${id}/review`, { method: 'POST', body: JSON.stringify({ status, reviewNotes: `Actualizado desde interfaz: ${status}` }) }); }
  revisions(skip = 0, limit = 20, status = '') { const p = new URLSearchParams({ skip: String(skip), limit: String(limit) }); if (status) p.append('status', status); return this.request<Page<Revision>>(`/revisions?${p}`); }
  completeRevision(id: string) { return this.request<Revision>(`/revisions/${id}/complete`, { method: 'POST', body: JSON.stringify({ result: { completedFrom: 'ui' }, notes: 'Cierre manual desde la interfaz' }) }); }
  evaluations(skip = 0, limit = 20) { return this.request<Page<Evaluation>>(`/evaluations?skip=${skip}&limit=${limit}`); }
  actors(skip = 0, limit = 20) { return this.request<Page<Actor>>(`/actors?skip=${skip}&limit=${limit}`); }
  async upload(file: File) { const body = new FormData(); body.append('file', file); return fetch(`${apiBase}/auth/upload`, { method: 'POST', body, headers: this.token ? { Authorization: `Bearer ${this.token}` } : {} }).then(async (response) => { if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`); return mapKeys<{ filename: string; path: string }>(await response.json(), toCamel); }); }
}

const api = new ApiClient();

function usePage<T>(fetcher: (skip: number, limit: number) => Promise<Page<T>>, deps: unknown[] = [], pageSize = 20) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; }, [fetcher]);
  const load = useCallback(async (pageNumber: number) => {
    setLoading(true); setError(null);
    try {
      const response = await fetcherRef.current((pageNumber - 1) * pageSize, pageSize);
      setItems(response.items); setPage(pageNumber); setPages(Math.max(1, response.pages || Math.ceil(response.total / pageSize) || 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }, [pageSize]);
  useEffect(() => { load(1); }, [load, ...deps]);
  return { items, page, pages, loading, error, load };
}

function useSearch<T>(searcher: (query: string) => Promise<T[]>) {
  const [query, setQuery] = useState(''); const [results, setResults] = useState<T[]>([]); const [loading, setLoading] = useState(false); const timeoutRef = useRef<ReturnType<typeof setTimeout>>(); const searcherRef = useRef(searcher);
  useEffect(() => { searcherRef.current = searcher; }, [searcher]);
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (query.length < 2) { setResults([]); return; }
    setLoading(true);
    timeoutRef.current = setTimeout(async () => { try { setResults(await searcherRef.current(query)); } finally { setLoading(false); } }, 300);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [query]);
  return { query, setQuery, results, loading };
}

const Loading = () => <div className="flex items-center justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700" /></div>;
const ErrorBox = ({ message }: { message: string }) => <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{message}</div>;
const Pager = ({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) => pages <= 1 ? null : <div className="mt-4 flex items-center justify-center gap-2"><button onClick={() => onChange(page - 1)} disabled={page === 1} className="rounded-full border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Anterior</button><span className="text-sm text-slate-600">Pagina {page} de {pages}</span><button onClick={() => onChange(page + 1)} disabled={page === pages} className="rounded-full border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Siguiente</button></div>;
const SearchBar = ({ onSearch, loading }: { onSearch: (query: string) => void; loading: boolean }) => { const [value, setValue] = useState(''); return <form onSubmit={(e) => { e.preventDefault(); onSearch(value); }} className="relative"><input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Buscar items por texto..." className="w-full rounded-2xl border border-slate-300 px-4 py-3 pr-12 focus:border-slate-500 focus:outline-none" /><button className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">{loading ? '...' : 'Ir'}</button></form>; };

const navItems = [['Dashboard', '/'], ['Banco', '/items'], ['Homologaciones', '/homologations'], ['Resultados', '/results'], ['Propuestas', '/generated-items'], ['Revisiones', '/revisions'], ['Evaluaciones', '/evaluations'], ['Actores', '/actors']] as const;

const Layout = ({ username, onLogout, children }: { username: string; onLogout: () => void; children: React.ReactNode }) => (
  <div className="min-h-screen bg-slate-100">
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Banco IDPS</div>
            <div className="text-xl font-bold text-slate-900">Homologacion longitudinal</div>
          </div>
          <div className="flex flex-wrap gap-2 lg:ml-8">
            {navItems.map(([label, path]) => (
              <NavLink key={path} to={path} className={({ isActive }) => ['rounded-full px-3 py-2 text-sm font-medium', isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'].join(' ')}>
                {label}
              </NavLink>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span className="rounded-full bg-slate-100 px-3 py-2">{username}</span>
          <button onClick={onLogout} className="rounded-full border border-slate-300 px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">Cerrar sesion</button>
        </div>
      </div>
    </nav>
    <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
  </div>
);

const LoginPage = ({ onLogin, error }: { onLogin: (username: string, password: string) => Promise<void>; error?: string | null }) => {
  const [username, setUsername] = useState('idps');
  const [password, setPassword] = useState('idps-interno');
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl shadow-slate-200">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Entorno interno</div>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Sistema IDPS</h1>
        </div>
        <form onSubmit={async (event) => { event.preventDefault(); setLoading(true); try { await onLogin(username, password); } finally { setLoading(false); } }} className="space-y-4">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Usuario" className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Clave" className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none" />
          {error && <ErrorBox message={error} />}
          <button disabled={loading} className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{loading ? 'Ingresando...' : 'Ingresar'}</button>
        </form>
      </div>
    </div>
  );
};

const DashboardPage = () => {
  const [stats, setStats] = useState<(BankOverview & { totalEvaluations: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.bankOverview(), api.homologations(), api.evaluations(0, 1)]).then(([overview, homologations, evaluations]) => {
      if (!cancelled) setStats({ ...overview, pendingReviews: overview.pendingReviews + homologations.length, totalEvaluations: evaluations.total });
    }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Error inesperado'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const cards = [['Items canonicos', stats?.canonicalItems || 0], ['Variantes registradas', stats?.variants || 0], ['Ocurrencias historicas', stats?.occurrences || 0], ['Resultados longitudinales', stats?.results || 0], ['Revisiones pendientes', stats?.pendingReviews || 0], ['Evaluaciones activas', stats?.totalEvaluations || 0], ['Items generados', stats?.generatedItems || 0]];
  return <div className="space-y-8"><div><h1 className="text-3xl font-bold text-slate-900">Dashboard</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">Vista consolidada del banco canonico: homologacion, ocurrencias historicas, resultados metodologicos y propuestas en revision.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-2xl bg-white p-6 shadow-sm shadow-slate-200"><div className="text-sm font-medium text-slate-500">{label}</div><div className="mt-3 text-4xl font-bold text-slate-900">{value}</div></div>)}</div><div className="rounded-2xl bg-white p-6 shadow-sm shadow-slate-200"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-lg font-semibold text-slate-900">Ingreso de matrices y resultados</h2><p className="mt-1 text-sm text-slate-600">Carga un archivo para la ruta de importacion interna y deja trazabilidad para el pipeline longitudinal.</p></div><label className="inline-flex cursor-pointer items-center rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">Seleccionar archivo<input type="file" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const response = await api.upload(file); setUploadMessage(`Archivo cargado: ${response.filename}`); e.target.value = ''; }} /></label></div>{uploadMessage && <p className="mt-4 text-sm text-emerald-600">{uploadMessage}</p>}</div></div>;
};

const ItemsPage = () => {
  const [filters, setFilters] = useState({ q: '', year: '', actor: '', dimension: '', subdimension: '', method: '', status: '' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BankItemDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const page = usePage((skip, limit) => api.bankItems({ skip, limit, ...filters }), [filters.q, filters.year, filters.actor, filters.dimension, filters.subdimension, filters.method, filters.status]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true); setDetailError(null);
    api.bankItemDetail(selectedId).then((response) => { if (!cancelled) setDetail(response); }).catch((err) => { if (!cancelled) setDetailError(err instanceof Error ? err.message : 'Error inesperado'); }).finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  return <div className="space-y-6"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold text-slate-900">Banco canonico</h1><p className="mt-1 text-sm text-slate-600">Consulta por texto, actor, dimension, subdimension, años, variantes y resultados longitudinales.</p></div><button onClick={() => page.load(page.page)} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Recargar</button></div><div className="grid gap-4 rounded-2xl bg-white p-4 shadow-sm shadow-slate-200 md:grid-cols-2 xl:grid-cols-4"><input value={filters.q} onChange={(e) => setFilters((current) => ({ ...current, q: e.target.value }))} placeholder="Buscar texto o ID canonico" className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none" /><input value={filters.actor} onChange={(e) => setFilters((current) => ({ ...current, actor: e.target.value }))} placeholder="Actor" className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none" /><input value={filters.dimension} onChange={(e) => setFilters((current) => ({ ...current, dimension: e.target.value }))} placeholder="Dimension" className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none" /><input value={filters.subdimension} onChange={(e) => setFilters((current) => ({ ...current, subdimension: e.target.value }))} placeholder="Subdimension" className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none" /><input value={filters.year} onChange={(e) => setFilters((current) => ({ ...current, year: e.target.value }))} placeholder="Ano" className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none" /><select value={filters.method} onChange={(e) => setFilters((current) => ({ ...current, method: e.target.value }))} className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none"><option value="">Metodo</option><option value="CLASICA">Clasica</option><option value="IRT">IRT</option></select><select value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))} className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none"><option value="">Estado</option><option value="ACTIVO">Activo</option><option value="EN_REVISION">En revision</option><option value="DEPRECADO">Deprecado</option></select><button onClick={() => { setFilters({ q: '', year: '', actor: '', dimension: '', subdimension: '', method: '', status: '' }); setSelectedId(null); }} className="rounded-full border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">Limpiar filtros</button></div>{page.loading && <Loading />}{page.error && <ErrorBox message={page.error} />}<div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]"><div className="overflow-x-auto rounded-2xl bg-white shadow-sm shadow-slate-200"><table className="min-w-full divide-y divide-slate-200"><thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">ID</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Item canonico</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Clasificacion</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Cobertura</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Metodos</th></tr></thead><tbody className="divide-y divide-slate-100">{page.items.map((item) => <tr key={item.canonicalId} onClick={() => setSelectedId(item.canonicalId)} className={['cursor-pointer hover:bg-slate-50', selectedId === item.canonicalId ? 'bg-slate-50' : ''].join(' ')}><td className="px-4 py-4 text-sm font-medium text-slate-900">{item.canonicalId}</td><td className="px-4 py-4 text-sm text-slate-600"><div className="font-medium text-slate-900">{short(item.canonicalText, 140)}</div><div className="mt-1 text-xs text-slate-500">{item.status}</div></td><td className="px-4 py-4 text-sm text-slate-600">{item.actorName || '-'}<div className="mt-1 text-xs text-slate-500">{item.dimensionName || '-'}{item.subdimensionName ? ` / ${item.subdimensionName}` : ''}</div></td><td className="px-4 py-4 text-sm text-slate-600"><div>{item.firstYear || '-'}{item.lastYear && item.lastYear !== item.firstYear ? ` - ${item.lastYear}` : ''}</div><div className="mt-1 text-xs text-slate-500">{item.totalVariants} variantes · {item.totalOccurrences} ocurrencias · {item.totalResults} resultados</div></td><td className="px-4 py-4 text-sm text-slate-600">{item.methods.length ? item.methods.join(', ') : '-'}</td></tr>)}</tbody></table>{page.items.length === 0 && <div className="py-10 text-center text-sm text-slate-500">No hay items para estos filtros.</div>}<div className="p-4"><Pager page={page.page} pages={page.pages} onChange={page.load} /></div></div><div className="rounded-2xl bg-white p-5 shadow-sm shadow-slate-200">{!selectedId && <div className="py-10 text-sm text-slate-500">Selecciona un item canonico para ver su ficha longitudinal.</div>}{detailLoading && <Loading />}{detailError && <ErrorBox message={detailError} />}{detail && !detailLoading && <div className="space-y-5"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{detail.item.status}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{detail.item.actorName || '-'}</span></div><h2 className="mt-3 text-xl font-bold text-slate-900">{detail.item.canonicalText}</h2><p className="mt-2 text-sm text-slate-600">{detail.item.dimensionName || '-'}{detail.item.subdimensionName ? ` / ${detail.item.subdimensionName}` : ''}</p><p className="mt-1 text-xs text-slate-500">Años: {detail.item.years.length ? detail.item.years.join(', ') : 'Sin apariciones registradas'}</p></div><div><h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Variantes</h3><div className="mt-3 space-y-3">{detail.variants.map((variant) => <div key={variant.variantId} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><div className="text-sm font-medium text-slate-900">{variant.variantId}</div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{variant.variantType}</span></div><p className="mt-2 text-sm text-slate-600">{short(variant.text, 180)}</p><p className="mt-1 text-xs text-slate-500">{variant.approvalStatus}{variant.changeSummary ? ` · ${short(variant.changeSummary, 80)}` : ''}</p></div>)}</div></div><div><h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Ocurrencias historicas</h3><div className="mt-3 space-y-3">{detail.occurrences.slice(0, 8).map((occurrence) => <div key={occurrence.occurrenceId} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><div className="text-sm font-medium text-slate-900">{occurrence.yearApplied} · {occurrence.formLabel || occurrence.gradeLabel || 'Sin formulario'}</div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{occurrence.decisionTaxonomy}</span></div><p className="mt-2 text-sm text-slate-600">{short(occurrence.originalText, 150)}</p><p className="mt-1 text-xs text-slate-500">{occurrence.processingStatus}{occurrence.questionCode ? ` · ${occurrence.questionCode}` : ''}</p></div>)}</div>{detail.occurrences.length > 8 && <p className="mt-2 text-xs text-slate-500">Mostrando 8 de {detail.occurrences.length} ocurrencias.</p>}</div><div><h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Resultados</h3><div className="mt-3 space-y-3">{detail.results.slice(0, 6).map((result) => <div key={result.resultId} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><div className="text-sm font-medium text-slate-900">{result.yearAnalysis} · {result.estimationMethod}</div><div className="text-xs text-slate-500">{result.methodologicalContext || '-'}</div></div><p className="mt-2 text-xs text-slate-500">{metricSummary(result.metrics)}</p></div>)}</div>{detail.results.length === 0 && <p className="mt-3 text-sm text-slate-500">No hay resultados asociados.</p>}</div><div><h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Revisiones</h3><div className="mt-3 space-y-3">{detail.revisions.length ? detail.revisions.map((revision) => <div key={revision.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><div className="text-sm font-medium text-slate-900">{revision.automaticDecision}</div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{revision.humanStatus}</span></div><p className="mt-2 text-xs text-slate-500">Confianza {revision.confidenceScore ? `${Math.round(revision.confidenceScore * 100)}%` : '-'} · {fmt(revision.createdAt)}</p>{revision.reviewNotes && <p className="mt-2 text-sm text-slate-600">{revision.reviewNotes}</p>}</div>) : <p className="text-sm text-slate-500">Sin revisiones registradas para este item.</p>}</div></div></div>}</div></div></div>;
};

const HomologationsPage = () => {
  const [items, setItems] = useState<Homologation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.homologations().then(setItems).catch((err) => setError(err instanceof Error ? err.message : 'Error inesperado')).finally(() => setLoading(false)); }, []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold text-slate-900">Homologaciones pendientes</h1><p className="mt-1 text-sm text-slate-600">Casos que requieren decision humana para evitar falsos emparejamientos.</p></div><div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">{items.map((attempt) => <div key={attempt.id} className="rounded-2xl bg-white p-5 shadow-sm shadow-slate-200"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Caso pendiente</h3><p className="mt-2 text-sm text-slate-600">Fuente: {attempt.sourceItemId}</p><p className="text-sm text-slate-600">Candidato: {attempt.candidateItemId || 'Sin candidato'}</p></div><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{attempt.confidence || 'SIN_CONF'}</span></div><div className="mt-4 space-y-2 text-sm text-slate-600"><div>Exacto: {Math.round((attempt.exactMatchScore || 0) * 100)}%</div><div>Fuzzy: {Math.round((attempt.fuzzyMatchScore || 0) * 100)}%</div><div>Semantico: {Math.round((attempt.semanticMatchScore || 0) * 100)}%</div><div>Decision provisional: {attempt.decision || 'Pendiente'}</div></div></div>)}</div>{items.length === 0 && <div className="rounded-2xl bg-white py-12 text-center text-slate-500 shadow-sm shadow-slate-200">No hay homologaciones pendientes.</div>}</div>;
};

const ResultsPage = () => {
  const [year, setYear] = useState(''); const [method, setMethod] = useState('');
  const page = usePage((skip, limit) => api.results(skip, limit, year, method), [year, method]);
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold text-slate-900">Resultados longitudinales</h1><p className="mt-1 text-sm text-slate-600">Descriptivos historicos con contexto metodologico clasico o IRT.</p></div><div className="rounded-2xl bg-white p-4 shadow-sm shadow-slate-200"><div className="grid gap-4 md:grid-cols-3"><input value={year} onChange={(e) => setYear(e.target.value)} placeholder="Ano" className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none" /><select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none"><option value="">Todos los metodos</option><option value="CLASICA">Clasica</option><option value="IRT">IRT</option></select><button onClick={() => page.load(page.page)} className="rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">Actualizar</button></div></div>{page.loading && <Loading />}{page.error && <ErrorBox message={page.error} />}<div className="overflow-x-auto rounded-2xl bg-white shadow-sm shadow-slate-200"><table className="min-w-full divide-y divide-slate-200"><thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Ano</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Metodo</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Codigo</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Dimension</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Item</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Metricas</th></tr></thead><tbody className="divide-y divide-slate-100">{page.items.map((result) => <tr key={result.id} className="hover:bg-slate-50"><td className="px-4 py-4 text-sm text-slate-700">{result.year}</td><td className="px-4 py-4 text-sm font-semibold text-slate-900">{result.calculationMethod}</td><td className="px-4 py-4 text-sm text-slate-600">{result.questionCode || result.indicatorCode || '-'}</td><td className="px-4 py-4 text-sm text-slate-600">{result.dimensionLabel || '-'}{result.subdimensionLabel ? ` / ${result.subdimensionLabel}` : ''}</td><td className="px-4 py-4 text-sm text-slate-600">{short(result.itemText || result.promptText)}</td><td className="px-4 py-4 text-sm text-slate-600">{metricSummary(result.metrics)}</td></tr>)}</tbody></table>{page.items.length === 0 && <div className="py-10 text-center text-sm text-slate-500">No hay resultados para los filtros seleccionados.</div>}<div className="p-4"><Pager page={page.page} pages={page.pages} onChange={page.load} /></div></div></div>;
};

const GeneratedItemsPage = () => {
  const [status, setStatus] = useState(''); const [form, setForm] = useState<ProposalForm>(initialProposal()); const [message, setMessage] = useState<string | null>(null); const [pageError, setPageError] = useState<string | null>(null);
  const page = usePage((skip, limit) => api.proposals(skip, limit, status), [status], 12);
  const updateField = <K extends keyof ProposalForm>(key: K, value: ProposalForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold text-slate-900">Agente generador y clasificador</h1><p className="mt-1 text-sm text-slate-600">Genera borradores, propone ubicacion taxonomica y deja trazabilidad para revision humana.</p></div><div className="grid gap-6 xl:grid-cols-[1.05fr_1.4fr]"><form onSubmit={async (event) => { event.preventDefault(); setMessage(null); setPageError(null); try { const created = await api.generate(form); setMessage(`Se registraron ${created.length} propuestas en borrador.`); setForm(initialProposal()); page.load(page.page); } catch (err) { setPageError(err instanceof Error ? err.message : 'Error inesperado'); } }} className="rounded-2xl bg-white p-6 shadow-sm shadow-slate-200"><h2 className="text-lg font-semibold text-slate-900">Nueva propuesta</h2><div className="mt-4 grid gap-4"><input value={form.actor} onChange={(e) => updateField('actor', e.target.value)} placeholder="Actor" className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none" /><input value={form.dimension} onChange={(e) => updateField('dimension', e.target.value)} placeholder="Dimension" className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none" /><input value={form.subdimension || ''} onChange={(e) => updateField('subdimension', e.target.value)} placeholder="Subdimension" className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none" /><textarea value={form.purpose} onChange={(e) => updateField('purpose', e.target.value)} rows={4} placeholder="Proposito del nuevo item" className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none" /><div className="grid gap-4 md:grid-cols-2"><input value={form.educationLevel} onChange={(e) => updateField('educationLevel', e.target.value)} placeholder="Nivel educativo" className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none" /><input type="number" min={1} max={5} value={form.numProposals} onChange={(e) => updateField('numProposals', Number(e.target.value))} className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none" /></div><input value={form.indicator || ''} onChange={(e) => updateField('indicator', e.target.value)} placeholder="Indicador" className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none" /><textarea value={form.constraints || ''} onChange={(e) => updateField('constraints', e.target.value)} rows={3} placeholder="Restricciones" className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none" /></div>{message && <p className="mt-4 text-sm text-emerald-600">{message}</p>}{pageError && <p className="mt-4 text-sm text-rose-600">{pageError}</p>}<button className="mt-6 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">Generar propuestas</button></form><div className="space-y-4"><div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm shadow-slate-200 md:flex-row md:items-end md:justify-between"><select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-xs rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none"><option value="">Todos los estados</option><option value="BORRADOR">Borrador</option><option value="EN_REVISION">En revision</option><option value="APROBADO">Aprobado</option><option value="RECHAZADO">Rechazado</option></select><button onClick={() => page.load(page.page)} className="rounded-full border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">Recargar</button></div>{page.loading && <Loading />}{(page.error || pageError) && <ErrorBox message={page.error || pageError || 'Error'} />}{!page.error && !pageError && <><div className="grid gap-4">{page.items.map((proposal) => <div key={proposal.id} className="rounded-2xl bg-white p-5 shadow-sm shadow-slate-200"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{proposal.status}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{proposal.proposalType}</span><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Confianza {Math.round(proposal.confidenceScore * 100)}%</span></div><h3 className="mt-3 text-lg font-semibold text-slate-900">{proposal.statement}</h3><p className="mt-2 text-sm text-slate-600">{proposal.dimensionSuggested}{proposal.subdimensionSuggested ? ` / ${proposal.subdimensionSuggested}` : ''}</p><p className="mt-2 text-sm text-slate-500">{proposal.classificationJustification || 'Sin justificacion disponible'}</p></div><div className="text-sm text-slate-500"><div>Solicitud: {proposal.requestId}</div><div>Creado: {fmt(proposal.createdAt)}</div><div>Revisor: {proposal.reviewedBy || '-'}</div></div></div><div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><div className="font-semibold text-slate-800">Items similares</div><div className="mt-2 space-y-2">{proposal.similarItems.slice(0, 3).map((entry, index) => <div key={`${proposal.id}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3"><div className="font-medium text-slate-800">{String(entry.statement || '-')}</div><div className="mt-1 text-xs text-slate-500">Score: {String(entry.score || '-')}</div></div>)}{!proposal.similarItems.length && <div>No se detectaron items cercanos.</div>}</div></div><div className="mt-4 flex flex-wrap gap-3">{['EN_REVISION', 'APROBADO', 'RECHAZADO'].map((nextStatus) => <button key={nextStatus} onClick={async () => { await api.reviewProposal(proposal.id, nextStatus); setMessage(`Propuesta ${nextStatus.toLowerCase()} correctamente.`); page.load(page.page); }} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">{nextStatus === 'EN_REVISION' ? 'Marcar en revision' : nextStatus === 'APROBADO' ? 'Aprobar' : 'Rechazar'}</button>)}</div></div>)}</div>{page.items.length === 0 && <div className="rounded-2xl bg-white py-12 text-center text-slate-500 shadow-sm shadow-slate-200">No hay propuestas para el estado seleccionado.</div>}<Pager page={page.page} pages={page.pages} onChange={page.load} /></>}</div></div></div>;
};

const RevisionsPage = () => {
  const [status, setStatus] = useState('');
  const page = usePage((skip, limit) => api.bankRevisions(skip, limit, status), [status]);
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold text-slate-900">Revisiones</h1><p className="mt-1 text-sm text-slate-600">Cola de revision humana del banco canonico para homologaciones ambiguas.</p></div><div className="rounded-2xl bg-white p-4 shadow-sm shadow-slate-200"><div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-xs rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-500 focus:outline-none"><option value="">Todos los estados</option><option value="PENDIENTE">Pendiente</option><option value="EN_REVISION">En revision</option><option value="APROBADA">Aprobada</option><option value="RECHAZADA">Rechazada</option><option value="ESCALADA">Escalada</option></select><button onClick={() => page.load(page.page)} className="rounded-full border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">Recargar</button></div></div>{page.loading && <Loading />}{page.error && <ErrorBox message={page.error} />}<div className="overflow-x-auto rounded-2xl bg-white shadow-sm shadow-slate-200"><table className="min-w-full divide-y divide-slate-200"><thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Decision auto</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Estado humano</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Confianza</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Item</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Creada</th></tr></thead><tbody className="divide-y divide-slate-100">{page.items.map((revision) => <tr key={revision.id} className="hover:bg-slate-50"><td className="px-4 py-4 text-sm font-medium text-slate-900">{revision.automaticDecision}</td><td className="px-4 py-4 text-sm text-slate-600">{revision.humanStatus}</td><td className="px-4 py-4 text-sm text-slate-600">{revision.confidenceScore ? `${Math.round(revision.confidenceScore * 100)}%` : '-'}</td><td className="px-4 py-4 text-sm text-slate-600">{short(revision.canonicalText, 120)}</td><td className="px-4 py-4 text-sm text-slate-600">{fmt(revision.createdAt)}</td></tr>)}</tbody></table>{page.items.length === 0 && <div className="py-10 text-center text-sm text-slate-500">No hay revisiones para este filtro.</div>}<div className="p-4"><Pager page={page.page} pages={page.pages} onChange={page.load} /></div></div></div>;
};

function TablePage<T extends { id: string }>({
  title,
  subtitle,
  headers,
  page,
  render,
}: {
  title: string;
  subtitle: string;
  headers: string[];
  page: {
    items: T[];
    page: number;
    pages: number;
    loading: boolean;
    error: string | null;
    load: (page: number) => void;
  };
  render: (row: T) => React.ReactNode;
}) {
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold text-slate-900">{title}</h1><p className="mt-1 text-sm text-slate-600">{subtitle}</p></div>{page.loading && <Loading />}{page.error && <ErrorBox message={page.error} />}<div className="overflow-x-auto rounded-2xl bg-white shadow-sm shadow-slate-200"><table className="min-w-full divide-y divide-slate-200"><thead className="bg-slate-50"><tr>{headers.map((header) => <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{page.items.map(render)}</tbody></table>{page.items.length === 0 && <div className="py-10 text-center text-sm text-slate-500">No hay registros.</div>}<div className="p-4"><Pager page={page.page} pages={page.pages} onChange={page.load} /></div></div></div>;
}

const EvaluationsPage = () => { const page = usePage((skip, limit) => api.evaluations(skip, limit)); return <TablePage title="Evaluaciones" subtitle="Catalogo de evaluaciones y horizonte longitudinal." headers={['Codigo', 'Nombre', 'Tipo', 'Periodo']} page={page} render={(row: Evaluation) => <tr key={row.id} className="hover:bg-slate-50"><td className="px-4 py-4 text-sm font-medium text-slate-900">{row.code}</td><td className="px-4 py-4 text-sm text-slate-600">{row.name}</td><td className="px-4 py-4 text-sm text-slate-600">{row.type}</td><td className="px-4 py-4 text-sm text-slate-600">{row.yearStart}{row.yearEnd ? ` - ${row.yearEnd}` : ''}</td></tr>} />; };
const ActorsPage = () => { const page = usePage((skip, limit) => api.actors(skip, limit)); return <TablePage title="Actores" subtitle="Listado de actores institucionales y su trazabilidad." headers={['Codigo', 'Nombre', 'Tipo', 'Estado']} page={page} render={(row: Actor) => <tr key={row.id} className="hover:bg-slate-50"><td className="px-4 py-4 text-sm font-medium text-slate-900">{row.code}</td><td className="px-4 py-4 text-sm text-slate-600">{row.name}</td><td className="px-4 py-4 text-sm text-slate-600">{row.type}</td><td className="px-4 py-4 text-sm text-slate-600">{row.isActive ? 'Activo' : 'Inactivo'}</td></tr>} />; };

const TOKEN_STORAGE_KEY = 'idps_auth_token';
const USER_STORAGE_KEY = 'idps_auth_user';

const App = () => {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) || '');
  const [username, setUsername] = useState(() => localStorage.getItem(USER_STORAGE_KEY) || '');
  const [authError, setAuthError] = useState<string | null>(null);
  useEffect(() => { api.setToken(token || undefined); }, [token]);
  useEffect(() => { if (!token) return; let cancelled = false; api.me().then((session) => { if (!cancelled) { setUsername(session.username); localStorage.setItem(USER_STORAGE_KEY, session.username); } }).catch(() => { if (!cancelled) { setToken(''); setUsername(''); setAuthError('La sesion ya no es valida. Ingresa nuevamente.'); localStorage.removeItem(TOKEN_STORAGE_KEY); localStorage.removeItem(USER_STORAGE_KEY); } }); return () => { cancelled = true; }; }, [token]);
  const login = async (user: string, password: string) => { const response = await api.login(user, password); setToken(response.accessToken); setUsername(response.username); setAuthError(null); localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken); localStorage.setItem(USER_STORAGE_KEY, response.username); };
  const logout = () => { setToken(''); setUsername(''); setAuthError(null); api.setToken(undefined); localStorage.removeItem(TOKEN_STORAGE_KEY); localStorage.removeItem(USER_STORAGE_KEY); };
  if (!token) return <LoginPage onLogin={login} error={authError} />;
  return <Layout username={username} onLogout={logout}><Routes><Route path="/" element={<DashboardPage />} /><Route path="/items" element={<ItemsPage />} /><Route path="/homologations" element={<HomologationsPage />} /><Route path="/results" element={<ResultsPage />} /><Route path="/generated-items" element={<GeneratedItemsPage />} /><Route path="/revisions" element={<RevisionsPage />} /><Route path="/evaluations" element={<EvaluationsPage />} /><Route path="/actors" element={<ActorsPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Layout>;
};

export default App;
