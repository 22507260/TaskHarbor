import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { api, ApiError } from '../api';
import type { Workflow, Step } from '../types';
import Dialog from './Dialog';
export default function Builder({
  close,
  created,
  initial,
  copy,
}: {
  close: () => void;
  created: () => Promise<void>;
  initial: Workflow | null;
  copy?: { definition: Omit<Workflow, 'id' | 'version'>; version: number } | null;
}) {
  const [original, setOriginal] = useState(initial);
  const [conflict, setConflict] = useState(false);
  const [name, setName] = useState(initial?.name ?? copy?.definition.name ?? ''),
    [description, setDescription] = useState(
      initial?.description ?? copy?.definition.description ?? '',
    ),
    [steps, setSteps] = useState<Step[]>(
      initial?.steps ??
        copy?.definition.steps ?? [
          {
            id: 'step_1',
            name: 'Prepare data',
            type: 'transform',
            dependsOn: [],
            config: { fields: { prepared: true } },
            maxAttempts: 3,
          },
        ],
    );
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const update = (index: number, patch: Partial<Step>) => {
    setError('');
    setSteps(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };
  async function save() {
    setBusy(true);
    setError('');
    try {
      const definition = steps.map((s) => {
        if (s.type !== 'transform') return s;
        const fields = JSON.parse(fieldDrafts[s.id] ?? JSON.stringify(s.config.fields ?? {}));
        if (!fields || Array.isArray(fields) || typeof fields !== 'object')
          throw new Error('Fields must be a JSON object.');
        return { ...s, config: { fields } };
      });
      await api(
        original ? '/workflows/' + original.id : '/workflows',
        {
          name,
          description,
          steps: definition,
          ...(original ? { expectedVersion: original.version } : {}),
        },
        original ? 'PUT' : 'POST',
      );
      await created();
    } catch (e) {
      setError((e as Error).message);
      setConflict(e instanceof ApiError && e.status === 409);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={original ? 'Edit workflow' : 'Create workflow'} close={close}>
      <div className="builder-intro">
        {original
          ? `Editing version ${original.version}. Changes create a new version; existing runs keep their snapshots.`
          : copy
            ? `Copying version ${copy.version} into a new workflow. Review and rename the draft before creating it. The source remains unchanged.`
            : 'Compose a dependency graph from safe, built-in tasks.'}
      </div>
      <label className="field">
        Name
        <input
          value={name}
          placeholder="e.g. Customer onboarding"
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
        />
      </label>
      <label className="field">
        Description
        <input
          value={description}
          placeholder="What does this workflow accomplish?"
          maxLength={400}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="builder-steps">
        {steps.map((s, i) => (
          <div className="builder-step" key={s.id}>
            <div className="builder-step-heading">
              <strong>Step {i + 1}</strong>
              <code>{s.id}</code>
              {steps.length > 1 && (
                <button
                  className="icon-button"
                  aria-label={'Remove ' + s.id}
                  onClick={() =>
                    setSteps(
                      steps
                        .filter((x) => x.id !== s.id)
                        .map((x) => ({ ...x, dependsOn: x.dependsOn.filter((d) => d !== s.id) })),
                    )
                  }
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <div className="form-row">
              <label className="field">
                Label
                <input value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
              </label>
              <label className="field">
                Task
                <select
                  value={s.type}
                  onChange={(e) =>
                    update(i, {
                      type: e.target.value as Step['type'],
                      config:
                        e.target.value === 'transform'
                          ? { fields: {} }
                          : { delayMs: 1000, failUntilAttempt: 0 },
                    })
                  }
                >
                  <option value="transform">JSON transform</option>
                  <option value="delay">Delay</option>
                  <option value="checkpoint">Retry checkpoint</option>
                </select>
              </label>
            </div>
            {s.type === 'transform' ? (
              <label className="field">
                Fields to merge (JSON object)
                <input
                  value={fieldDrafts[s.id] ?? JSON.stringify(s.config.fields ?? {})}
                  onChange={(e) => {
                    setFieldDrafts({ ...fieldDrafts, [s.id]: e.target.value });
                    setError('');
                  }}
                />
              </label>
            ) : (
              <div className="form-row">
                <label className="field">
                  Delay (milliseconds)
                  <input
                    type="number"
                    min="0"
                    max="15000"
                    value={s.config.delayMs}
                    onChange={(e) =>
                      update(i, { config: { ...s.config, delayMs: Number(e.target.value) } })
                    }
                  />
                </label>
                {s.type === 'checkpoint' && (
                  <label className="field">
                    Fail first N attempts
                    <input
                      type="number"
                      min="0"
                      max="5"
                      value={s.config.failUntilAttempt}
                      onChange={(e) =>
                        update(i, {
                          config: { ...s.config, failUntilAttempt: Number(e.target.value) },
                        })
                      }
                    />
                  </label>
                )}
              </div>
            )}
            <label className="field">
              Maximum attempts
              <input
                type="number"
                min="1"
                max="5"
                value={s.maxAttempts}
                onChange={(e) => update(i, { maxAttempts: Number(e.target.value) })}
              />
            </label>
            {steps.length > 1 && (
              <fieldset>
                <legend>Depends on</legend>
                {steps
                  .filter((parent) => parent.id !== s.id)
                  .map((parent) => (
                    <label className="checkbox" key={parent.id}>
                      <input
                        type="checkbox"
                        checked={s.dependsOn.includes(parent.id)}
                        onChange={(e) =>
                          update(i, {
                            dependsOn: e.target.checked
                              ? [...s.dependsOn, parent.id]
                              : s.dependsOn.filter((x) => x !== parent.id),
                          })
                        }
                      />
                      {parent.name}
                    </label>
                  ))}
              </fieldset>
            )}
          </div>
        ))}
      </div>
      <button
        className="secondary"
        disabled={steps.length >= 20}
        onClick={() => {
          let suffix = 1;
          while (
            steps.some((s) => s.id === 'step_' + suffix) ||
            fieldDrafts['step_' + suffix] !== undefined
          )
            suffix++;
          const id = 'step_' + suffix;
          setSteps([
            ...steps,
            {
              id,
              name: 'New step',
              type: 'delay',
              dependsOn: [steps[steps.length - 1].id],
              config: { delayMs: 1000 },
              maxAttempts: 3,
            },
          ]);
        }}
      >
        <Plus size={15} /> Add step
      </button>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {conflict && (
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            if (!original) return;
            setBusy(true);
            try {
              const latest = await api<Workflow>('/workflows/' + original.id);
              setOriginal(latest);
              setName(latest.name);
              setDescription(latest.description);
              setSteps(latest.steps);
              setFieldDrafts({});
              setError('');
              setConflict(false);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Discard draft and reload latest
        </button>
      )}
      <div className="dialog-actions">
        <button className="secondary" onClick={close}>
          Cancel
        </button>
        <button className="primary" disabled={busy || !name.trim()} onClick={save}>
          {busy ? 'Saving…' : original ? 'Save version' : 'Create workflow'}
        </button>
      </div>
    </Dialog>
  );
}
