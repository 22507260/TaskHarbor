import { useEffect, useRef, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../api';
import type { Run, Workflow } from '../types';
import Dialog from './Dialog';

export default function RerunDialog({
  source,
  close,
  started,
}: {
  source: Run;
  close: () => void;
  started: (run: Run) => void;
}) {
  const [mode, setMode] = useState<'source' | 'latest'>('source'),
    [input, setInput] = useState(JSON.stringify(source.input, null, 2));
  const [latest, setLatest] = useState<Workflow | null>(null),
    [loadError, setLoadError] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false);
  const request = useRef({ fingerprint: '', id: crypto.randomUUID() });
  async function reloadLatest(signal?: AbortSignal) {
    try {
      const workflow = await api<Workflow>(
        '/workflows/' + source.workflow_id,
        undefined,
        'GET',
        signal,
      );
      if (!signal?.aborted) {
        setLatest(workflow);
        setLoadError('');
        setConflict(false);
        setError('');
      }
    } catch (e) {
      if (!signal?.aborted) setLoadError((e as Error).message);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void reloadLatest(controller.signal);
    return () => controller.abort();
  }, [source.workflow_id]);
  async function submit() {
    setError('');
    setBusy(true);
    setConflict(false);
    try {
      const parsed = JSON.parse(input);
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object')
        throw new Error('Input must be a JSON object.');
      if (mode === 'latest' && !latest)
        throw new Error('Load the latest workflow before starting.');
      const body = {
        mode,
        input: parsed,
        ...(mode === 'latest' ? { expectedVersion: latest!.version } : {}),
      };
      const fingerprint = JSON.stringify(body);
      if (request.current.fingerprint !== fingerprint)
        request.current = { fingerprint, id: crypto.randomUUID() };
      started(
        await api<Run>('/runs/' + source.id + '/rerun', { ...body, requestId: request.current.id }),
      );
    } catch (e) {
      setError((e as Error).message);
      setConflict(e instanceof ApiError && e.status === 409);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Rerun execution"
      close={() => {
        if (!busy) close();
      }}
    >
      <p className="muted">
        Create a new execution from <code>{source.id.slice(0, 8)}</code>. The source run and its
        results stay unchanged. Every step starts with a fresh attempt budget.
      </p>
      <fieldset className="rerun-options">
        <legend>Workflow definition</legend>
        <label className="rerun-option">
          <input
            type="radio"
            name="rerun-mode"
            checked={mode === 'source'}
            disabled={busy}
            onChange={() => {
              setMode('source');
              setError('');
            }}
          />
          <span>
            <strong>Source snapshot · v{source.workflow_version}</strong>
            <small>{source.definition.name} — reproduce the same task definition.</small>
          </span>
        </label>
        <label className="rerun-option">
          <input
            type="radio"
            name="rerun-mode"
            checked={mode === 'latest'}
            disabled={busy || !latest}
            onChange={() => {
              setMode('latest');
              setError('');
            }}
          />
          <span>
            <strong>Latest workflow{latest ? ' · v' + latest.version : ' · loading…'}</strong>
            <small>
              {latest?.name ?? 'Fetching the current definition'} — try current workflow changes.
            </small>
          </span>
        </label>
      </fieldset>
      {loadError && (
        <div className="alert" role="alert">
          Latest workflow could not be loaded: {loadError}
        </div>
      )}
      <label className="field">
        Rerun input payload
        <textarea
          className="code-input"
          rows={8}
          value={input}
          disabled={busy}
          onChange={(e) => {
            setInput(e.target.value);
            setError('');
          }}
        />
      </label>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {(conflict || loadError) && (
        <button className="secondary" disabled={busy} onClick={() => void reloadLatest()}>
          <RefreshCw size={14} /> Reload latest version
        </button>
      )}
      <div className="dialog-actions">
        <button className="secondary" disabled={busy} onClick={close}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={busy || (mode === 'latest' && !latest)}
          onClick={() => void submit()}
        >
          <Play size={15} />
          {busy ? 'Starting…' : 'Start rerun'}
        </button>
      </div>
    </Dialog>
  );
}
