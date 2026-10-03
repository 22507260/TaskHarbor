import { useState } from 'react';
import { Upload, Check, ArrowLeft } from 'lucide-react';
import Dialog from './Dialog';
import { api } from '../api';
import type { Workflow } from '../types';

type Portable = {
  format: 'taskharbor.workflow';
  formatVersion: 1;
  workflow: Omit<Workflow, 'id' | 'version'>;
};
const limit = 65536;
export default function WorkflowImport({
  close,
  created,
}: {
  close: () => void;
  created: (workflow: Workflow) => void;
}) {
  const [text, setText] = useState(''),
    [preview, setPreview] = useState<Portable | null>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function readFile(file?: File) {
    if (!file) return;
    setError('');
    setPreview(null);
    setBusy(true);
    try {
      if (file.size > limit) throw new Error('Choose a JSON file no larger than 64 KiB.');
      setText(await file.text());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function validate() {
    setBusy(true);
    setError('');
    try {
      if (new TextEncoder().encode(text).length > limit)
        throw new Error('The document must be no larger than 64 KiB.');
      setPreview(
        await api<Portable>('/workflow-imports/preview', JSON.parse(text.replace(/^\uFEFF/, ''))),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      created(await api<Workflow>('/workflow-imports', preview));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Import workflow"
      close={() => {
        if (!busy) close();
      }}
    >
      <p className="muted">
        Bring a TaskHarbor workflow into this workspace. Review its definition before creating a new
        copy. Importing does not start an execution.
      </p>
      {!preview ? (
        <>
          <label className="import-file">
            <Upload size={22} />
            <strong>Choose a workflow JSON file</strong>
            <span>Version 1 format · up to 64 KiB</span>
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => {
                void readFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <label className="field">
            Or paste a workflow document
            <textarea
              className="code-input"
              rows={9}
              value={text}
              disabled={busy}
              onChange={(e) => {
                setText(e.target.value);
                setError('');
              }}
              placeholder={
                '{ "format": "taskharbor.workflow", "formatVersion": 1, "workflow": { ... } }'
              }
            />
          </label>
        </>
      ) : (
        <>
          <div className="import-valid">
            <Check size={17} /> Definition validated · {preview.workflow.steps.length} steps
          </div>
          <label className="field">
            Imported workflow name
            <input
              maxLength={80}
              value={preview.workflow.name}
              disabled={busy}
              onChange={(e) =>
                setPreview({ ...preview, workflow: { ...preview.workflow, name: e.target.value } })
              }
            />
          </label>
          <p className="muted">{preview.workflow.description || 'No description provided.'}</p>
          <ol className="import-step-list">
            {preview.workflow.steps.map((s) => (
              <li key={s.id}>
                <strong>{s.name}</strong>
                <code>{s.type}</code>
                <small>
                  {s.dependsOn.length ? 'After ' + s.dependsOn.join(', ') : 'Entry step'} ·{' '}
                  {s.maxAttempts} attempts
                </small>
              </li>
            ))}
          </ol>
          <p className="muted">
            A new workflow ID and revision 1 will be created. Existing workflows and execution
            history are not included in this file.
          </p>
        </>
      )}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="dialog-actions">
        {preview && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              setPreview(null);
              setError('');
            }}
          >
            <ArrowLeft size={14} /> Back to document
          </button>
        )}
        <button className="secondary" disabled={busy} onClick={close}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={busy || (preview ? !preview.workflow.name.trim() : !text.trim())}
          onClick={() => void (preview ? save() : validate())}
        >
          {busy ? 'Working…' : preview ? 'Create imported workflow' : 'Validate and preview'}
        </button>
      </div>
    </Dialog>
  );
}
