export class WorkflowEntrypoint<Env, Params> {
  protected readonly env: Env;

  constructor(ctx: { env: Env }) {
    this.env = ctx.env;
  }

  run(_event: WorkflowEvent<Params>, _step: WorkflowStep): Promise<unknown> {
    if (this.env) {
      throw new Error("WorkflowEntrypoint shim should not be executed in tests");
    }

    throw new Error("WorkflowEntrypoint shim should not be executed in tests");
  }
}

export interface WorkflowEvent<Params> {
  payload: Params;
}

export interface WorkflowStep {
  do<T>(name: string, fn: () => Promise<T>): Promise<T>;
}
