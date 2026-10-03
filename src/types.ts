export type Step = {
  id: string;
  name: string;
  type: 'transform' | 'delay' | 'checkpoint';
  dependsOn: string[];
  config: { delayMs?: number; failUntilAttempt?: number; fields?: Record<string, unknown> };
  maxAttempts?: number;
};
export type Workflow = {
  id: string;
  version: number;
  name: string;
  description: string;
  steps: Step[];
};
export type Revision = {
  version: number;
  created_at: number;
  definition: Omit<Workflow, 'id' | 'version'>;
};
export type Job = Step & {
  step_id: string;
  status: string;
  attempt: number;
  output: unknown;
  error: string | null;
  worker: string | null;
  available_at: number;
};
export type Run = {
  id: string;
  workflow_id: string;
  workflow_version: number;
  parent_run_id: string | null;
  status: string;
  created_at: number;
  finished_at: number | null;
  definition: Workflow;
  input: unknown;
  jobs: Job[];
  events: {
    id: number;
    type: string;
    message: string;
    step_id: string | null;
    created_at: number;
  }[];
};
export type Worker = { id: string; online: boolean; seen_at: number };
export type RunSummary = Pick<
  Run,
  | 'id'
  | 'workflow_id'
  | 'workflow_version'
  | 'parent_run_id'
  | 'status'
  | 'created_at'
  | 'finished_at'
> & {
  workflow_name: string;
  step_count: number;
  completed_steps: number;
};
export type HistoryPage = {
  items: RunSummary[];
  total: number;
  snapshot: number;
  nextCursor: string | null;
};
export type Overview = {
  total: number;
  active: number;
  succeeded: number;
  completed: number;
  latestByWorkflow: { workflow_id: string; status: string }[];
};
