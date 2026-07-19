/**
 * lib/marketing-studio/execution/execution-errors.ts
 *
 * MS-13 — Execution Runtime: Typed error classes
 */

export class ExecutionJobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`ExecutionJob not found: ${jobId}`);
    this.name = "ExecutionJobNotFoundError";
  }
}

export class ExecutionDuplicateJobError extends Error {
  readonly existingJobId: string;
  constructor(idempotencyKey: string, existingJobId: string) {
    super(`Duplicate job for idempotencyKey: ${idempotencyKey} (existing: ${existingJobId})`);
    this.name = "ExecutionDuplicateJobError";
    this.existingJobId = existingJobId;
  }
}

export class ExecutionJobNotRetryableError extends Error {
  constructor(jobId: string, reason: string) {
    super(`Job ${jobId} cannot be retried: ${reason}`);
    this.name = "ExecutionJobNotRetryableError";
  }
}

export class ExecutionHandlerNotFoundError extends Error {
  readonly jobType: string;
  constructor(jobType: string) {
    super(`No handler registered for job type: ${jobType}`);
    this.name = "ExecutionHandlerNotFoundError";
    this.jobType = jobType;
  }
}

export class ExecutionConnectionMissingError extends Error {
  constructor(jobId: string, destination: string) {
    super(`Job ${jobId} requires an active connection for destination: ${destination}`);
    this.name = "ExecutionConnectionMissingError";
  }
}

export class ExecutionJobInWrongStateError extends Error {
  constructor(jobId: string, currentStatus: string) {
    super(`Job ${jobId} is in non-executable state: ${currentStatus}`);
    this.name = "ExecutionJobInWrongStateError";
  }
}
