import type {
  DependencyCleanupInput,
  DependencyCleanupPreview,
  DependencyCleanupResult,
  HardResetConfirmationInput,
  HardResetImpactInput,
  HardResetImpactSnapshot,
  HardResetResult,
  HardResetStashInput,
  HardResetStashResult,
  ResetDepartmentError,
} from "@forkara/contracts";
import { ServiceMap, type Effect } from "effect";

export interface ResetDepartmentServiceShape {
  readonly previewDependencyCleanup: (
    input: DependencyCleanupInput,
  ) => Effect.Effect<DependencyCleanupPreview, ResetDepartmentError>;
  readonly executeDependencyCleanup: (
    input: DependencyCleanupInput,
  ) => Effect.Effect<DependencyCleanupResult, ResetDepartmentError>;
  readonly inspectHardResetImpact: (
    input: HardResetImpactInput,
  ) => Effect.Effect<HardResetImpactSnapshot, ResetDepartmentError>;
  readonly stashHardResetChanges: (
    input: HardResetStashInput,
  ) => Effect.Effect<HardResetStashResult, ResetDepartmentError>;
  readonly executeHardReset: (
    input: HardResetConfirmationInput,
  ) => Effect.Effect<HardResetResult, ResetDepartmentError>;
}

export class ResetDepartmentService extends ServiceMap.Service<
  ResetDepartmentService,
  ResetDepartmentServiceShape
>()("forkara/resetDepartment/Services/ResetDepartmentService") {}
