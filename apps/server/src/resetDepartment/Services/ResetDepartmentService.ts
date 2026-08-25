import type {
  DependencyCleanupInput,
  DependencyCleanupPreview,
  DependencyCleanupResult,
  HardResetImpactInput,
  HardResetImpactSnapshot,
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
}

export class ResetDepartmentService extends ServiceMap.Service<
  ResetDepartmentService,
  ResetDepartmentServiceShape
>()("forkara/resetDepartment/Services/ResetDepartmentService") {}
