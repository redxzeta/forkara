import { Schema } from "effect";

import { CommandId, IsoDateTime, ProjectId, SpaceId, TrimmedNonEmptyString } from "./baseSchemas";
import { ModelSelection } from "./orchestration";

const BoundedRepositoryInput = TrimmedNonEmptyString.check(Schema.isMaxLength(512));
const BoundedPath = TrimmedNonEmptyString.check(Schema.isMaxLength(4_096));
const BoundedDirectoryName = TrimmedNonEmptyString.check(Schema.isMaxLength(255));
const BoundedGitHubOwner = TrimmedNonEmptyString.check(Schema.isMaxLength(39));
const BoundedProvisioningSummary = TrimmedNonEmptyString.check(Schema.isMaxLength(320));
const BoundedCorrectiveAction = TrimmedNonEmptyString.check(Schema.isMaxLength(640));
const BoundedTechnicalDetails = Schema.String.check(Schema.isMaxLength(4_096));

export const GitHubProjectProvisionOperation = Schema.Literals(["clone", "fork-and-clone"]);
export type GitHubProjectProvisionOperation = typeof GitHubProjectProvisionOperation.Type;

export const GitHubProjectProvisionErrorStage = Schema.Literals([
  "validation",
  "access",
  "fork",
  "clone",
  "destination",
  "filesystem",
  "registration",
  "cancellation",
  "internal",
]);
export type GitHubProjectProvisionErrorStage = typeof GitHubProjectProvisionErrorStage.Type;

export const GitHubProjectProvisionErrorCode = Schema.Literals([
  "REPOSITORY_INVALID",
  "REPOSITORY_NOT_FOUND",
  "GITHUB_AUTH_REQUIRED",
  "GITHUB_AUTH_INVALID",
  "FORK_DESTINATION_INVALID",
  "FORK_FAILED",
  "CLONE_TRANSPORT_FAILED",
  "CLONE_CREDENTIAL_FAILED",
  "CLONE_TIMEOUT",
  "CLONE_VERIFICATION_FAILED",
  "DESTINATION_INVALID",
  "DESTINATION_MISSING",
  "DESTINATION_UNWRITABLE",
  "DESTINATION_CONFLICT",
  "FILESYSTEM_FAILED",
  "DISK_FULL",
  "REGISTRATION_FAILED",
  "CANCELLED",
  "INTERNAL",
]);
export type GitHubProjectProvisionErrorCode = typeof GitHubProjectProvisionErrorCode.Type;

/**
 * Safe, actionable failure transported by the provisioning RPC stream.
 * `technicalDetails` is nullable so callers never substitute an unredacted cause.
 */
export class GitHubProjectProvisionError extends Schema.TaggedErrorClass<GitHubProjectProvisionError>()(
  "GitHubProjectProvisionError",
  {
    operationId: TrimmedNonEmptyString.check(Schema.isMaxLength(128)),
    stage: GitHubProjectProvisionErrorStage,
    code: GitHubProjectProvisionErrorCode,
    summary: BoundedProvisioningSummary,
    correctiveAction: BoundedCorrectiveAction,
    technicalDetails: Schema.NullOr(BoundedTechnicalDetails),
    retryable: Schema.Boolean,
  },
) {}

const GitHubProjectProvisionInputBase = {
  operationId: TrimmedNonEmptyString.check(Schema.isMaxLength(128)),
  repository: BoundedRepositoryInput,
  destinationParent: BoundedPath,
  directoryName: BoundedDirectoryName,
  commandId: CommandId,
  projectId: ProjectId,
  /** Destination for a newly registered project; reusing an existing project preserves its Space. */
  newProjectSpaceId: Schema.NullOr(SpaceId),
  defaultModelSelection: ModelSelection,
  createdAt: IsoDateTime,
} as const;

/**
 * One server-owned GitHub checkout + project-registration operation.
 *
 * `destinationParent` is deliberately a parent directory. The server derives and
 * validates the final workspace root from it and `directoryName`, so the UI never
 * presents a parent path while the server interprets it as the clone target.
 */
export const GitHubProjectProvisionInput = Schema.Struct({
  ...GitHubProjectProvisionInputBase,
  // Older clients omitted intent. Decode that input as the safe, direct-clone path.
  operation: GitHubProjectProvisionOperation.pipe(Schema.withDecodingDefaultKey(() => "clone")),
  forkDestinationOwner: Schema.NullOr(BoundedGitHubOwner).pipe(
    Schema.withDecodingDefaultKey(() => null),
  ),
});
export type GitHubProjectProvisionInput = typeof GitHubProjectProvisionInput.Type;

export const GitHubProjectProvisionResult = Schema.Struct({
  operationId: TrimmedNonEmptyString,
  repository: TrimmedNonEmptyString,
  workspaceRoot: TrimmedNonEmptyString,
  projectId: ProjectId,
  checkout: Schema.Literals(["created", "reused"]),
  /** True only when this operation successfully created the GitHub fork itself. */
  forkCreated: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(() => false)),
});
export type GitHubProjectProvisionResult = typeof GitHubProjectProvisionResult.Type;

export const GitHubProjectProvisionPhase = Schema.Literals([
  "validating",
  "resolving-access",
  "forking",
  "cloning",
  "verifying",
  "registering",
]);
export type GitHubProjectProvisionPhase = typeof GitHubProjectProvisionPhase.Type;

const GitHubProjectProvisionProgressBase = Schema.Struct({
  operationId: TrimmedNonEmptyString,
});

export const GitHubProjectProvisionProgressEvent = Schema.Union([
  Schema.Struct({
    ...GitHubProjectProvisionProgressBase.fields,
    kind: Schema.Literal("phase"),
    phase: GitHubProjectProvisionPhase,
    message: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    ...GitHubProjectProvisionProgressBase.fields,
    kind: Schema.Literal("clone-progress"),
    phase: Schema.Literal("cloning"),
    message: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    ...GitHubProjectProvisionProgressBase.fields,
    kind: Schema.Literal("completed"),
    result: GitHubProjectProvisionResult,
  }),
]);
export type GitHubProjectProvisionProgressEvent = typeof GitHubProjectProvisionProgressEvent.Type;
