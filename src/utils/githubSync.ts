export const DEFAULT_GITHUB_REPO = 'IT-SCCB/my-triton';
export const DEFAULT_GITHUB_BRANCH = 'main';
export const GITHUB_SYNC_CACHE_TTL_MS = 5 * 60 * 1000;
const SESSION_CACHE_KEY = 'ouanpee_github_sync_cache_v1';

export type GitHubSyncState =
  | 'loading'
  | 'synced'
  | 'syncing'
  | 'behind'
  | 'preview'
  | 'error';

export interface GitHubSyncSnapshot {
  repo: string;
  branch: string;
  repoUrl: string;
  lastPushAt: string | null;
  latestCommitSha: string | null;
  latestCommitMessage: string | null;
  latestCommitUrl: string | null;
  workflowStatus: string | null;
  workflowConclusion: string | null;
  workflowUrl: string | null;
  runningCommitSha: string | null;
  checkedAt: string;
}

export interface GitHubSyncDerivedStatus {
  state: GitHubSyncState;
  label: string;
  detail: string;
}

interface CachedEntry {
  cachedAtMs: number;
  snapshot: GitHubSyncSnapshot;
}

let memoryCache: CachedEntry | null = null;

export function getRunningCommitSha(): string | null {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_COMMIT_SHA
      ? String(import.meta.env.VITE_APP_COMMIT_SHA).trim()
      : '';
  return raw.length > 0 ? raw : null;
}

export function normalizeShortSha(sha: string | null | undefined): string | null {
  if (!sha) return null;
  const clean = sha.trim();
  return clean ? clean.slice(0, 7) : null;
}

export function commitsMatch(
  shaA: string | null | undefined,
  shaB: string | null | undefined
): boolean {
  if (!shaA || !shaB) return false;
  const a = shaA.trim().toLowerCase();
  const b = shaB.trim().toLowerCase();
  if (a.length < 7 || b.length < 7) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

export function deriveGitHubSyncStatus(
  snapshot: GitHubSyncSnapshot
): GitHubSyncDerivedStatus {
  const shortLatest = normalizeShortSha(snapshot.latestCommitSha);
  const shortRunning = normalizeShortSha(snapshot.runningCommitSha);

  if (
    snapshot.workflowStatus === 'in_progress' ||
    snapshot.workflowStatus === 'queued' ||
    snapshot.workflowStatus === 'waiting'
  ) {
    return {
      state: 'syncing',
      label: 'กำลังอัปเดต GitHub Pages',
      detail: shortLatest
        ? `กำลัง build คอมมิต ${shortLatest} บน GitHub Actions`
        : 'กำลัง build และ deploy บน GitHub Actions',
    };
  }

  if (
    snapshot.workflowConclusion === 'failure' ||
    snapshot.workflowConclusion === 'cancelled' ||
    snapshot.workflowConclusion === 'timed_out'
  ) {
    return {
      state: 'error',
      label: 'Deploy GitHub ไม่สำเร็จ',
      detail: shortLatest
        ? `Workflow รอบคอมมิต ${shortLatest} จบด้วยสถานะ ${snapshot.workflowConclusion}`
        : `Workflow ล่าสุดจบด้วยสถานะ ${snapshot.workflowConclusion}`,
    };
  }

  if (snapshot.runningCommitSha && snapshot.latestCommitSha) {
    if (commitsMatch(snapshot.runningCommitSha, snapshot.latestCommitSha)) {
      return {
        state: 'synced',
        label: 'ซิงค์ตรงกับ GitHub แล้ว',
        detail: `หน้าเว็บนี้ตรงกับ branch ${snapshot.branch} (${shortRunning})`,
      };
    }
    return {
      state: 'behind',
      label: 'มีโค้ดใหม่บน GitHub',
      detail: `เวอร์ชันนี้ ${shortRunning} · บน ${snapshot.branch} ล่าสุด ${shortLatest}`,
    };
  }

  return {
    state: 'preview',
    label: 'GitHub Push ล่าสุด',
    detail: shortLatest
      ? `อ้างอิง branch ${snapshot.branch} (${shortLatest}) · พรีวิวนี้ไม่ได้ push อัตโนมัติ`
      : `อ้างอิง branch ${snapshot.branch} บน GitHub`,
  };
}

export function formatGitHubPushTimestamp(isoDate: string | null): string {
  if (!isoDate) return 'ไม่พบเวลา Push';
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return 'ไม่พบเวลา Push';

  try {
    const datePart = new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(parsed);
    const timePart = new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(parsed);
    return `${datePart} ${timePart} น.`;
  } catch {
    return parsed.toISOString();
  }
}

function readCachedSnapshot(
  repo: string,
  branch: string,
  nowMs: number
): GitHubSyncSnapshot | null {
  if (
    memoryCache &&
    nowMs - memoryCache.cachedAtMs < GITHUB_SYNC_CACHE_TTL_MS &&
    memoryCache.snapshot.repo === repo &&
    memoryCache.snapshot.branch === branch
  ) {
    return memoryCache.snapshot;
  }

  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (
      parsed?.snapshot &&
      typeof parsed.cachedAtMs === 'number' &&
      nowMs - parsed.cachedAtMs < GITHUB_SYNC_CACHE_TTL_MS &&
      parsed.snapshot.repo === repo &&
      parsed.snapshot.branch === branch
    ) {
      memoryCache = parsed;
      return parsed.snapshot;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

function writeCachedSnapshot(snapshot: GitHubSyncSnapshot, nowMs: number): void {
  const entry: CachedEntry = { cachedAtMs: nowMs, snapshot };
  memoryCache = entry;
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore storage errors
  }
}

interface GitHubRepoApiResponse {
  html_url?: string;
  default_branch?: string;
  pushed_at?: string;
}

interface GitHubCommitApiResponse {
  sha?: string;
  html_url?: string;
  commit?: {
    message?: string;
    committer?: { date?: string };
    author?: { date?: string };
  };
}

interface GitHubActionsRunsResponse {
  workflow_runs?: Array<{
    status?: string;
    conclusion?: string | null;
    html_url?: string;
  }>;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (res.status === 403 || res.status === 429) {
      throw new Error('เกินขีดจำกัดการเรียก GitHub API ชั่วคราว กรุณาลองใหม่ภายหลัง');
    }
    if (!res.ok) {
      throw new Error(`เรียกข้อมูล GitHub ไม่สำเร็จ (HTTP ${res.status})`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('หมดเวลาเชื่อมต่อ GitHub API');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGitHubSyncSnapshot(options?: {
  repo?: string;
  branch?: string;
  forceRefresh?: boolean;
  runningCommitSha?: string | null;
}): Promise<GitHubSyncSnapshot> {
  const repo = options?.repo ?? DEFAULT_GITHUB_REPO;
  const branch = options?.branch ?? DEFAULT_GITHUB_BRANCH;
  const runningCommitSha =
    options?.runningCommitSha !== undefined
      ? options.runningCommitSha
      : getRunningCommitSha();
  const nowMs = Date.now();

  if (!options?.forceRefresh) {
    const cached = readCachedSnapshot(repo, branch, nowMs);
    if (cached) {
      return {
        ...cached,
        runningCommitSha,
      };
    }
  }

  const baseUrl = `https://api.github.com/repos/${repo}`;
  const [repoRes, commitRes, actionsRes] = await Promise.allSettled([
    fetchJsonWithTimeout<GitHubRepoApiResponse>(baseUrl, 10000),
    fetchJsonWithTimeout<GitHubCommitApiResponse>(
      `${baseUrl}/commits/${encodeURIComponent(branch)}`,
      10000
    ),
    fetchJsonWithTimeout<GitHubActionsRunsResponse>(
      `${baseUrl}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1`,
      10000
    ),
  ]);

  if (repoRes.status === 'rejected' && commitRes.status === 'rejected') {
    throw repoRes.reason instanceof Error
      ? repoRes.reason
      : new Error('ไม่สามารถตรวจสอบสถานะ GitHub Repository ได้');
  }

  const repoData = repoRes.status === 'fulfilled' ? repoRes.value : null;
  const commitData = commitRes.status === 'fulfilled' ? commitRes.value : null;
  const actionsData = actionsRes.status === 'fulfilled' ? actionsRes.value : null;
  const latestRun = actionsData?.workflow_runs?.[0] ?? null;

  const lastPushAt =
    repoData?.pushed_at ??
    commitData?.commit?.committer?.date ??
    commitData?.commit?.author?.date ??
    null;

  const rawMessage = commitData?.commit?.message ?? null;
  const firstLineMessage = rawMessage ? rawMessage.split('\n')[0].trim() : null;

  const snapshot: GitHubSyncSnapshot = {
    repo,
    branch,
    repoUrl: repoData?.html_url ?? `https://github.com/${repo}`,
    lastPushAt,
    latestCommitSha: commitData?.sha ?? null,
    latestCommitMessage: firstLineMessage,
    latestCommitUrl: commitData?.html_url ?? null,
    workflowStatus: latestRun?.status ?? null,
    workflowConclusion: latestRun?.conclusion ?? null,
    workflowUrl: latestRun?.html_url ?? null,
    runningCommitSha,
    checkedAt: new Date(nowMs).toISOString(),
  };

  writeCachedSnapshot(snapshot, nowMs);
  return snapshot;
}
