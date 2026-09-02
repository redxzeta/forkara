/**
 * Public contracts for the Forkara agent-control gateway.
 *
 * New gateway tools decode these schemas before doing any work. Keeping the
 * limits here ensures the MCP surface, server implementation, and tests share
 * the same definition of an exact creation/wait plan.
 */
import { Schema } from "effect";

import { ProjectId, ThreadId, TurnId } from "./baseSchemas";
import { ModelSelection, ProviderKind } from "./orchestration";
import { ProviderModelDescriptor } from "./providerDiscovery";
import { ServerProviderAuthStatus } from "./server";

export const FORKARA_GATEWAY_MAX_THREADS_PER_OPERATION = 20;
export const FORKARA_GATEWAY_MAX_REQUEST_ID_LENGTH = 256;
export const FORKARA_GATEWAY_MAX_WAIT_MS = 60_000;

export const ForkaraGatewayErrorCode = Schema.Literals([
  "caller_session_inactive",
  "caller_turn_inactive",
  "capability_denied",
  "provider_unavailable",
  "model_unavailable",
  "model_option_unavailable",
  "idempotency_conflict",
  "creation_plan_locked",
  "creation_limit_exceeded",
  "thread_not_found",
  "wait_timed_out",
  "operation_failed",
]);
export type ForkaraGatewayErrorCode = typeof ForkaraGatewayErrorCode.Type;

export const ForkaraGatewayError = Schema.Struct({
  code: ForkaraGatewayErrorCode,
  message: Schema.String,
  details: Schema.optional(Schema.Unknown),
});
export type ForkaraGatewayError = typeof ForkaraGatewayError.Type;

export const ForkaraGatewayErrorResult = Schema.Struct({
  error: ForkaraGatewayError,
});
export type ForkaraGatewayErrorResult = typeof ForkaraGatewayErrorResult.Type;

export const ForkaraContextResult = Schema.Struct({
  harness: Schema.Struct({
    name: Schema.Literal("Forkara"),
    policyVersion: Schema.String,
  }),
  caller: Schema.Struct({
    threadId: ThreadId,
    turnId: Schema.NullOr(TurnId),
    provider: ProviderKind,
    projectId: ProjectId,
  }),
  capabilities: Schema.Struct({
    threadRead: Schema.Boolean,
    threadCreate: Schema.Boolean,
    threadWait: Schema.Boolean,
    automations: Schema.Boolean,
  }),
});
export type ForkaraContextResult = typeof ForkaraContextResult.Type;

export const ForkaraCreateThreadSpec = Schema.Struct({
  prompt: Schema.String.check(Schema.isNonEmpty()),
  title: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  target: ModelSelection,
  projectId: Schema.optional(ProjectId),
  environment: Schema.optional(Schema.Literals(["local", "worktree"])),
  baseRef: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  // Legacy inputs remain decodable for replay/backward compatibility, but the
  // MCP catalog no longer advertises branch-backed worktree creation.
  baseBranch: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  branchName: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  runtimeMode: Schema.optional(Schema.Literals(["approval-required", "full-access"])),
});
export type ForkaraCreateThreadSpec = typeof ForkaraCreateThreadSpec.Type;

const ForkaraGatewayRequestId = Schema.String.check(Schema.isNonEmpty()).check(
  Schema.isMaxLength(FORKARA_GATEWAY_MAX_REQUEST_ID_LENGTH),
);

export const ForkaraCreateThreadsInput = Schema.Struct({
  requestId: ForkaraGatewayRequestId,
  threads: Schema.Array(ForkaraCreateThreadSpec)
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(FORKARA_GATEWAY_MAX_THREADS_PER_OPERATION)),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type ForkaraCreateThreadsInput = typeof ForkaraCreateThreadsInput.Type;

export const ForkaraProviderCatalog = Schema.Struct({
  provider: ProviderKind,
  defaultModel: Schema.NullOr(Schema.String),
  models: Schema.Array(ProviderModelDescriptor),
  enabled: Schema.Boolean,
  available: Schema.Boolean,
  authStatus: Schema.optional(ServerProviderAuthStatus),
  source: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
});
export type ForkaraProviderCatalog = typeof ForkaraProviderCatalog.Type;

export const ForkaraGatewayTargetOptionValue = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
]);
export type ForkaraGatewayTargetOptionValue = typeof ForkaraGatewayTargetOptionValue.Type;

export const ForkaraGatewayTargetOptionRule = Schema.Struct({
  key: Schema.String,
  valueType: Schema.Literals(["string", "number", "boolean"]),
  allowedValues: Schema.Array(ForkaraGatewayTargetOptionValue),
  allowedValuesSource: Schema.Literals(["provider-contract", "model-discovery"]),
});
export type ForkaraGatewayTargetOptionRule = typeof ForkaraGatewayTargetOptionRule.Type;

export const ForkaraGatewayTargetConstruction = Schema.Struct({
  modelValueSource: Schema.Literal("providers[].models[].slug"),
  primaryOptionKey: Schema.String,
  alternativeOptionKeys: Schema.Array(Schema.String),
  optionSelectionRule: Schema.String,
  providerOptions: Schema.Array(ForkaraGatewayTargetOptionRule),
  optionsByModel: Schema.Record(Schema.String, Schema.Array(ForkaraGatewayTargetOptionRule)),
  exampleTarget: Schema.NullOr(ModelSelection),
});
export type ForkaraGatewayTargetConstruction = typeof ForkaraGatewayTargetConstruction.Type;

export const ForkaraCapabilitiesResult = Schema.Struct({
  targetConstruction: Schema.Record(Schema.String, ForkaraGatewayTargetConstruction),
  providers: Schema.Array(ForkaraProviderCatalog),
  limits: Schema.Struct({
    maxThreadsPerOperation: Schema.Int,
    maxWaitMs: Schema.Int,
    oneCreationPlanPerActiveTurn: Schema.Boolean,
  }),
});
export type ForkaraCapabilitiesResult = typeof ForkaraCapabilitiesResult.Type;

export const ForkaraCreatedThreadResult = Schema.Struct({
  index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  threadId: ThreadId,
  projectId: ProjectId,
  title: Schema.String,
  target: ModelSelection,
  provider: ProviderKind,
  model: Schema.String,
  runtimeMode: Schema.Literals(["approval-required", "full-access"]),
  environment: Schema.Literals(["local", "worktree"]),
  branch: Schema.NullOr(Schema.String),
  worktreePath: Schema.NullOr(Schema.String),
  status: Schema.Literal("task_dispatched"),
});
export type ForkaraCreatedThreadResult = typeof ForkaraCreatedThreadResult.Type;

export const ForkaraCreateThreadsResult = Schema.Struct({
  operationId: Schema.String,
  requestId: ForkaraGatewayRequestId,
  requestedCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  createdCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  threadIds: Schema.Array(ThreadId),
  threads: Schema.Array(ForkaraCreatedThreadResult),
});
export type ForkaraCreateThreadsResult = typeof ForkaraCreateThreadsResult.Type;

export const ForkaraWaitForThreadsInput = Schema.Struct({
  threadIds: Schema.Array(ThreadId)
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(FORKARA_GATEWAY_MAX_THREADS_PER_OPERATION)),
  runIds: Schema.optional(
    Schema.Array(Schema.NullOr(TurnId)).check(
      Schema.isMaxLength(FORKARA_GATEWAY_MAX_THREADS_PER_OPERATION),
    ),
  ),
  timeoutMs: Schema.optional(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).check(
      Schema.isLessThanOrEqualTo(FORKARA_GATEWAY_MAX_WAIT_MS),
    ),
  ),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type ForkaraWaitForThreadsInput = typeof ForkaraWaitForThreadsInput.Type;

export const ForkaraWaitedThreadResult = Schema.Struct({
  threadId: ThreadId,
  runId: Schema.NullOr(TurnId),
  state: Schema.Literals(["idle", "pending", "running", "completed", "error", "interrupted"]),
  terminal: Schema.Boolean,
  timedOut: Schema.Boolean,
  summary: Schema.NullOr(Schema.String),
  summaryTruncated: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
  readThread: Schema.Struct({
    tool: Schema.Literal("forkara_read_thread"),
    arguments: Schema.Struct({ threadId: ThreadId }),
  }),
});
export type ForkaraWaitedThreadResult = typeof ForkaraWaitedThreadResult.Type;

export const ForkaraWaitForThreadsResult = Schema.Struct({
  callerThreadId: ThreadId,
  runIds: Schema.Array(Schema.NullOr(TurnId)),
  allTerminal: Schema.Boolean,
  timedOut: Schema.Boolean,
  threads: Schema.Array(ForkaraWaitedThreadResult),
});
export type ForkaraWaitForThreadsResult = typeof ForkaraWaitForThreadsResult.Type;
