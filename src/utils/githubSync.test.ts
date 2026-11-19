import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commitsMatch,
  deriveGitHubSyncStatus,
  formatGitHubPushTimestamp,
  normalizeShortSha,
  type GitHubSyncSnapshot,
} from './githubSync';

const BASE_SNAPSHOT: GitHubSyncSnapshot = {
  repo: 'IT-SCCB/my-triton',
  branch: 'main',
  repoUrl: 'https://github.com/IT-SCCB/my-triton',
  lastPushAt: '2026-11-19T09:05:04Z',
  latestCommitSha: '4be5a5baaf39d56ce1f90789ebb28ff4fbcf1aff',
  latestCommitMessage: 'feat: add support for coordinate-based trip presets',
  latestCommitUrl:
    'https://github.com/IT-SCCB/my-triton/commit/4be5a5baaf39d56ce1f90789ebb28ff4fbcf1aff',
  workflowStatus: 'completed',
  workflowConclusion: 'success',
  workflowUrl: 'https://github.com/IT-SCCB/my-triton/actions/runs/44493156069',
  runningCommitSha: '4be5a5baaf39d56ce1f90789ebb28ff4fbcf1aff',
  checkedAt: '2026-11-19T09:10:00Z',
};

test('deriveGitHubSyncStatus identifies synced, behind, syncing, error, and preview states', () => {
  const synced = deriveGitHubSyncStatus(BASE_SNAPSHOT);
  assert.equal(synced.state, 'synced');

  const behind = deriveGitHubSyncStatus({
    ...BASE_SNAPSHOT,
    runningCommitSha: '1234567890abcdef1234567890abcdef12345678',
  });
  assert.equal(behind.state, 'behind');

  const syncing = deriveGitHubSyncStatus({
    ...BASE_SNAPSHOT,
    workflowStatus: 'in_progress',
    workflowConclusion: null,
  });
  assert.equal(syncing.state, 'syncing');

  const failed = deriveGitHubSyncStatus({
    ...BASE_SNAPSHOT,
    workflowStatus: 'completed',
    workflowConclusion: 'failure',
  });
  assert.equal(failed.state, 'error');

  const preview = deriveGitHubSyncStatus({
    ...BASE_SNAPSHOT,
    runningCommitSha: null,
  });
  assert.equal(preview.state, 'preview');
});

test('commitsMatch compares full and short SHAs accurately', () => {
  assert.equal(
    commitsMatch('4be5a5b', '4be5a5baaf39d56ce1f90789ebb28ff4fbcf1aff'),
    true
  );
  assert.equal(commitsMatch('4be5a5b', '9999999'), false);
  assert.equal(normalizeShortSha('4be5a5baaf39'), '4be5a5b');
});

test('formatGitHubPushTimestamp formats ISO timestamps in Thai Bangkok time cleanly', () => {
  const formatted = formatGitHubPushTimestamp('2026-11-19T09:05:04Z');
  assert.ok(formatted.includes('16:05'));
  assert.ok(formatted.includes('2569'));
  assert.equal(formatGitHubPushTimestamp(null), 'ไม่พบเวลา Push');
  assert.equal(formatGitHubPushTimestamp('invalid-date'), 'ไม่พบเวลา Push');
});
