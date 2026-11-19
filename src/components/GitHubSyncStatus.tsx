import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  DEFAULT_GITHUB_REPO,
  deriveGitHubSyncStatus,
  fetchGitHubSyncSnapshot,
  formatGitHubPushTimestamp,
  normalizeShortSha,
  type GitHubSyncSnapshot,
  type GitHubSyncState,
} from '../utils/githubSync';

interface GitHubSyncStatusProps {
  repo?: string;
  branch?: string;
}

export function GitHubSyncStatus({
  repo = DEFAULT_GITHUB_REPO,
  branch = 'main',
}: GitHubSyncStatusProps) {
  const [snapshot, setSnapshot] = useState<GitHubSyncSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStatus = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await fetchGitHubSyncSnapshot({
          repo,
          branch,
          forceRefresh,
        });
        setSnapshot(result);
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'ไม่สามารถตรวจสอบสถานะ GitHub ได้'
        );
      } finally {
        setLoading(false);
      }
    },
    [repo, branch]
  );

  useEffect(() => {
    void loadStatus(false);
  }, [loadStatus]);

  const derived = snapshot ? deriveGitHubSyncStatus(snapshot) : null;
  const effectiveState: GitHubSyncState = loading
    ? 'loading'
    : errorMessage && !snapshot
      ? 'error'
      : derived?.state ?? 'preview';

  const statusLabel = loading
    ? 'กำลังเช็กสถานะ GitHub...'
    : errorMessage && !snapshot
      ? 'เชื่อมต่อ GitHub ไม่ได้'
      : derived?.label ?? 'GitHub Sync';

  const shortSha = normalizeShortSha(snapshot?.latestCommitSha);
  const pushTimeText = snapshot?.lastPushAt
    ? formatGitHubPushTimestamp(snapshot.lastPushAt)
    : null;

  const badgeColors: Record<GitHubSyncState, string> = {
    loading:
      'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300',
    synced:
      'border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300',
    syncing:
      'border-blue-200 dark:border-blue-800/70 bg-blue-50/70 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300',
    behind:
      'border-amber-200 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300',
    preview:
      'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200',
    error:
      'border-red-200 dark:border-red-800/70 bg-red-50/80 dark:bg-red-950/40 text-red-800 dark:text-red-300',
  };

  const renderIcon = () => {
    switch (effectiveState) {
      case 'loading':
      case 'syncing':
        return <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />;
      case 'synced':
        return <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
      case 'behind':
        return <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
      case 'error':
        return <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
      case 'preview':
      default:
        return <GitBranch className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
    }
  };

  const tooltipTitle = [
    derived?.detail ?? errorMessage ?? '',
    snapshot?.latestCommitMessage ? `Commit: ${snapshot.latestCommitMessage}` : '',
    snapshot?.lastPushAt ? `Last push (ISO): ${snapshot.lastPushAt}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div
      data-testid="github-sync-status"
      title={tooltipTitle || undefined}
      className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${badgeColors[effectiveState]}`}
    >
      <span className="inline-flex items-center gap-1.5 font-medium">
        {renderIcon()}
        <span>{statusLabel}</span>
      </span>

      {pushTimeText && (
        <>
          <span className="opacity-40" aria-hidden="true">·</span>
          <span
            data-testid="github-last-push-time"
            className="font-mono tabular-nums opacity-90"
          >
            Push ล่าสุด {pushTimeText}
          </span>
        </>
      )}

      {shortSha && (
        <>
          <span className="opacity-40" aria-hidden="true">·</span>
          <a
            href={snapshot?.latestCommitUrl ?? snapshot?.repoUrl ?? `https://github.com/${repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-mono tabular-nums hover:underline opacity-90"
          >
            <span>#{shortSha}</span>
            <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
          </a>
        </>
      )}

      {errorMessage && !snapshot && (
        <span className="opacity-80 truncate max-w-[200px]">{errorMessage}</span>
      )}

      <button
        type="button"
        onClick={() => void loadStatus(true)}
        disabled={loading}
        aria-label="รีเฟรชสถานะ GitHub"
        data-testid="github-sync-refresh-btn"
        className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 cursor-pointer transition-colors"
      >
        <RefreshCw
          className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
