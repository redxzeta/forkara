// FILE: CreateProjectForm.tsx
// Purpose: Shared Add Project controller and form used by modal and docked shells.
// Layer: Web UI form/controller
// Exports: CreateProjectForm, CreateProjectFormHandle, CreateProjectSubmitValue

import {
  GitHubProjectProvisionError,
  type GitHubProjectProvisionOperation,
  type GitHubProjectProvisionProgressEvent,
  type SpaceId,
} from "@forkara/contracts";
import { parseGitHubRepositoryInput } from "@forkara/shared/githubRepository";
import { normalizeProjectDirectoryName } from "@forkara/shared/projectDirectoryName";
import { recordAchievementEvent } from "../achievements/engine";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { isElectron } from "../env";
import {
  isDroppedComposerDirectory,
  resolveDroppedFileAbsolutePath,
} from "../lib/composerDropPaths";
import { VOID_SPACE_KEY, spaceKey, toSpaceIconName } from "../lib/spaceGrouping";
import { createSpace } from "../lib/spaces";
import { readNativeApi } from "../nativeApi";
import { randomUUID } from "../lib/utils";
import { joinProjectPath } from "../lib/projectPaths";
import {
  coalesceProvisioningFailure,
  isGitHubProjectProvisionError,
  type ProvisioningFailureOccurrence,
} from "../lib/githubProjectProvisioningError";
import type { Space } from "../types";
import { useVoidSpace } from "../voidSpaceStore";
import { cn } from "~/lib/utils";

import { FolderClosed } from "./FolderClosed";
import {
  CreateGitHubProjectFields,
  PROJECT_DIALOG_FIELD_CONTROL_CLASS_NAME,
} from "./CreateGitHubProjectFields";
import { ProjectSourceSegmentedPicker } from "./ProjectSourceSegmentedPicker";
import { describeAddProjectError } from "./Sidebar.logic";
import { SpaceEditorDialog, SpaceEditorFields, type SpaceEditorValue } from "./SpaceEditorDialog";
import { SpaceIcon } from "./SpaceIcon";
import { Button } from "./ui/button";
import { DialogFooter, DialogPanel, dialogFieldLabelClassName } from "./ui/dialog";
import { ComposerPickerSelectPopup } from "./chat/ComposerPickerMenuPopup";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group";
import { Select, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { CentralIcon } from "~/lib/central-icons";
import { InlineOperationError } from "./focus/InlineOperationError";
import { DisclosureRegion } from "./ui/DisclosureRegion";

// Inputs share one fixed height + radius so every control in the dialog reads
// as the same size (mirrors EditProfileDialog's field styling).
function isFileDrag(event: globalThis.DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

type DroppedFolderResult = { readonly path: string } | { readonly error: string };

function resolveDroppedFolder(dataTransfer: DataTransfer): DroppedFolderResult | null {
  const item = Array.from(dataTransfer.items).find((entry) => entry.kind === "file");
  const file = item?.getAsFile() ?? dataTransfer.files[0] ?? null;
  if (!item || !file) return null;
  if (!isDroppedComposerDirectory(item)) {
    return { error: "Drop a folder, not a file." };
  }
  const absolutePath = resolveDroppedFileAbsolutePath(file);
  if (!absolutePath) {
    return { error: "Could not read the folder's path. Use browse or type it instead." };
  }
  return { path: absolutePath };
}

interface CreateLocalProjectSubmitValue {
  readonly source: "local";
  readonly workspaceRoot: string;
  /** Destination Space; `null` is Void (unassigned). */
  readonly spaceId: SpaceId | null;
  /** True when the path was typed/edited by hand, so a missing folder may be created. */
  readonly createIfMissing: boolean;
}

interface CreateGitHubProjectSubmitValue {
  readonly source: "github";
  readonly operationId: string;
  readonly operation: GitHubProjectProvisionOperation;
  readonly forkDestinationOwner: string | null;
  readonly repository: string;
  readonly destinationParent: string;
  readonly directoryName: string;
  readonly spaceId: SpaceId | null;
}

export type CreateProjectSubmitValue =
  | CreateLocalProjectSubmitValue
  | CreateGitHubProjectSubmitValue;

export interface CreateProjectSubmitOptions {
  readonly signal: AbortSignal;
}

export interface CreateProjectFormHandle {
  readonly requestClose: () => void;
}

export interface CreateProjectFormProps {
  open: boolean;
  presentation: "dialog" | "dock";
  githubProvisioningAvailable: boolean;
  spaces: ReadonlyArray<Space>;
  activeSpaceId: SpaceId | null;
  defaultCloneParent: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: CreateProjectSubmitValue, options: CreateProjectSubmitOptions) => Promise<void>;
  onSuccess?: (value: CreateProjectSubmitValue) => void;
}

export const CreateProjectForm = forwardRef<CreateProjectFormHandle, CreateProjectFormProps>(
  function CreateProjectForm(props, forwardedRef) {
    const [source, setSource] = useState<"local" | "github">("local");
    const [path, setPath] = useState("");
    const [repositoryInput, setRepositoryInput] = useState("");
    const [githubOperation, setGitHubOperation] =
      useState<GitHubProjectProvisionOperation>("clone");
    const [forkDestinationOwner, setForkDestinationOwner] = useState("");
    const [destinationParent, setDestinationParent] = useState("");
    const [directoryName, setDirectoryName] = useState("");
    const [directoryNameEdited, setDirectoryNameEdited] = useState(false);
    const [provisionProgress, setProvisionProgress] = useState<string | null>(null);
    /**
     * The last path delivered verbatim by the native picker or an OS drop. Those
     * folders exist by construction, so only hand-typed (or hand-edited) paths
     * opt into create-if-missing — the same split the old Browse/Type-path pair had.
     */
    const [pickedPath, setPickedPath] = useState<string | null>(null);
    const [selectedSpaceKey, setSelectedSpaceKey] = useState<string>(VOID_SPACE_KEY);
    const [spaceEditorOpen, setSpaceEditorOpen] = useState(false);
    /**
     * A space created from this dialog, kept locally until the refreshed shell
     * snapshot delivers it through `props.spaces` — otherwise submitting right
     * after creating would not find the id and silently fall back to Void.
     */
    const [createdSpace, setCreatedSpace] = useState<Space | null>(null);
    const [isPickingFolder, setIsPickingFolder] = useState(false);
    const [isDropTarget, setIsDropTarget] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [provisionFailure, setProvisionFailure] = useState<ProvisioningFailureOccurrence | null>(
      null,
    );
    const openedRef = useRef(false);
    const submitAbortRef = useRef<AbortController | null>(null);
    const activeOperationIdRef = useRef<string | null>(null);
    const submissionGenerationRef = useRef(0);
    const fieldId = useId();
    const pathInputId = `${fieldId}-path`;
    const repositoryInputId = `${fieldId}-repository`;
    const githubOperationLegendId = `${fieldId}-github-operation`;
    const forkDestinationOwnerInputId = `${fieldId}-fork-destination-owner`;
    const destinationParentInputId = `${fieldId}-destination-parent`;
    const directoryNameInputId = `${fieldId}-directory-name`;
    const submitButtonId = `${fieldId}-submit`;
    const sourceFolderLabelId = `${fieldId}-source-folder`;
    const spaceLabelId = `${fieldId}-space`;
    const errorId = `${fieldId}-error`;

    useEffect(() => {
      // Seed on the closed -> open transition only, mirroring SpaceEditorDialog.
      if (props.open === openedRef.current) return;
      openedRef.current = props.open;
      if (!props.open) return;
      setSource("local");
      setPath("");
      setRepositoryInput("");
      setGitHubOperation("clone");
      setForkDestinationOwner("");
      setDestinationParent(props.defaultCloneParent);
      setDirectoryName("");
      setDirectoryNameEdited(false);
      setProvisionProgress(null);
      submitAbortRef.current = null;
      activeOperationIdRef.current = null;
      setPickedPath(null);
      setSelectedSpaceKey(spaceKey(props.activeSpaceId));
      setSpaceEditorOpen(false);
      setCreatedSpace(null);
      setIsPickingFolder(false);
      setIsDropTarget(false);
      setSubmitting(false);
      setFormError(null);
      setProvisionFailure(null);
      // Deferred a frame: the dialog moves focus itself on open, so focusing the
      // path field has to happen after that lands or it is immediately undone.
      const frame = requestAnimationFrame(() => document.getElementById(pathInputId)?.focus());
      return () => cancelAnimationFrame(frame);
    }, [pathInputId, props.activeSpaceId, props.defaultCloneParent, props.open]);

    const cancelActiveSubmission = useCallback(() => {
      submissionGenerationRef.current += 1;
      activeOperationIdRef.current = null;
      const abortController = submitAbortRef.current;
      submitAbortRef.current = null;
      abortController?.abort();
      setProvisionProgress(null);
      setSubmitting(false);
    }, []);

    useEffect(() => {
      if (!props.open) cancelActiveSubmission();
      return cancelActiveSubmission;
    }, [cancelActiveSubmission, props.open]);

    useEffect(() => {
      if (!props.githubProvisioningAvailable && source === "github") {
        setSource("local");
      }
    }, [props.githubProvisioningAvailable, source]);

    const trimmedPath = path.trim();
    const parsedRepository = parseGitHubRepositoryInput(repositoryInput);
    const trimmedDestinationParent = destinationParent.trim();
    const trimmedDirectoryName = directoryName.trim();
    const normalizedDirectoryName = normalizeProjectDirectoryName(directoryName);
    const formErrorMeaning = formError ? describeAddProjectError(formError) : null;
    const spaces =
      createdSpace && !props.spaces.some((space) => space.id === createdSpace.id)
        ? [...props.spaces, createdSpace]
        : props.spaces;
    const voidSpace = useVoidSpace();

    const clearFailure = useCallback(() => {
      setFormError(null);
      setProvisionFailure(null);
    }, []);

    const setLocalFailure = useCallback((message: string) => {
      setProvisionFailure(null);
      setFormError(message);
    }, []);

    useEffect(() => {
      if (!props.open) return;
      const api = readNativeApi();
      if (!api) return;
      return api.projects.onProvisionProgress((event: GitHubProjectProvisionProgressEvent) => {
        if (event.operationId !== activeOperationIdRef.current) return;
        if (event.kind === "completed") {
          if (event.result.forkCreated) {
            recordAchievementEvent({ type: "fork.created" });
          }
          setProvisionProgress("Project added");
          return;
        }
        setProvisionProgress(event.message);
      });
    }, [props.open]);

    const applyPickedFolder = useCallback(
      (picked: string) => {
        setPath(picked);
        setPickedPath(picked);
        clearFailure();
        // Land focus on the confirm button so a plain Enter finishes the flow.
        requestAnimationFrame(() => document.getElementById(submitButtonId)?.focus());
      },
      [clearFailure, submitButtonId],
    );

    const applyDestinationParent = useCallback(
      (picked: string) => {
        setDestinationParent(picked);
        clearFailure();
        requestAnimationFrame(() => document.getElementById(directoryNameInputId)?.focus());
      },
      [clearFailure, directoryNameInputId],
    );

    const handleBrowse = async () => {
      if (isPickingFolder || submitting) return;
      const api = readNativeApi();
      if (!api) {
        setLocalFailure("The app server is unavailable.");
        return;
      }
      setIsPickingFolder(true);
      // No try/finally: the React Compiler skips optimizing components that use it.
      try {
        const picked = await api.dialogs.pickFolder();
        if (picked) {
          if (source === "github") applyDestinationParent(picked);
          else applyPickedFolder(picked);
        }
      } catch (error) {
        setLocalFailure(
          error instanceof Error ? error.message : "Unable to open the folder picker.",
        );
      }
      setIsPickingFolder(false);
    };

    // While the dialog is open it is the only interactive surface, so accept a
    // folder drop anywhere in the window (capture phase). A tiny drop zone is
    // easy to miss and a stray drop outside it would otherwise vanish silently.
    useEffect(() => {
      if (!props.open || !isElectron || source !== "local") return;
      let dragDepth = 0;
      const handleDragEnter = (event: globalThis.DragEvent) => {
        if (!isFileDrag(event)) return;
        dragDepth += 1;
        setIsDropTarget(true);
      };
      const handleDragOver = (event: globalThis.DragEvent) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      };
      const handleDragLeave = (event: globalThis.DragEvent) => {
        if (!isFileDrag(event)) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) setIsDropTarget(false);
      };
      const handleDrop = (event: globalThis.DragEvent) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        dragDepth = 0;
        setIsDropTarget(false);
        const dropped = event.dataTransfer ? resolveDroppedFolder(event.dataTransfer) : null;
        if (!dropped) return;
        if ("error" in dropped) {
          setLocalFailure(dropped.error);
          return;
        }
        applyPickedFolder(dropped.path);
      };
      window.addEventListener("dragenter", handleDragEnter, true);
      window.addEventListener("dragover", handleDragOver, true);
      window.addEventListener("dragleave", handleDragLeave, true);
      window.addEventListener("drop", handleDrop, true);
      return () => {
        window.removeEventListener("dragenter", handleDragEnter, true);
        window.removeEventListener("dragover", handleDragOver, true);
        window.removeEventListener("dragleave", handleDragLeave, true);
        window.removeEventListener("drop", handleDrop, true);
      };
    }, [applyPickedFolder, props.open, setLocalFailure, source]);

    const submit = async () => {
      if (submitting) return;
      // The confirm button stays enabled (and white) like the reference dialog;
      // an empty submit explains what is missing instead of being unclickable.
      if (source === "local" && trimmedPath.length === 0) {
        setLocalFailure("Type a folder path, or drop a folder above.");
        return;
      }
      if (source === "github" && !parsedRepository) {
        setLocalFailure(
          "Enter a GitHub repository as owner/repository or a GitHub.com repository URL.",
        );
        return;
      }
      if (source === "github" && !props.githubProvisioningAvailable) {
        setLocalFailure("Update the Synara server before adding a project from GitHub.");
        return;
      }
      if (source === "github" && trimmedDestinationParent.length === 0) {
        setLocalFailure("Choose the parent folder where the repository should be cloned.");
        return;
      }
      if (source === "github" && !normalizedDirectoryName) {
        setLocalFailure(
          "Choose a valid folder name without slashes, reserved device names, or a trailing dot.",
        );
        return;
      }
      setSubmitting(true);
      // Keep an actionable typed failure mounted while retrying so a repeated
      // terminal event for the same operation can coalesce instead of flashing a
      // second surface. Editing any field still clears it through `clearFailure`.
      setFormError(null);
      setProvisionProgress(source === "github" ? "Validating repository" : null);
      const abortController = new AbortController();
      const submissionGeneration = submissionGenerationRef.current + 1;
      submissionGenerationRef.current = submissionGeneration;
      submitAbortRef.current = abortController;
      let submittedValue: CreateProjectSubmitValue;
      try {
        const spaceId = spaces.find((space) => space.id === selectedSpaceKey)?.id ?? null;
        if (source === "github") {
          const operationId = randomUUID();
          activeOperationIdRef.current = operationId;
          submittedValue = {
            source: "github",
            operationId,
            operation: githubOperation,
            forkDestinationOwner:
              githubOperation === "fork-and-clone" ? forkDestinationOwner.trim() || null : null,
            repository: parsedRepository ?? repositoryInput.trim(),
            destinationParent: trimmedDestinationParent,
            directoryName: normalizedDirectoryName ?? trimmedDirectoryName,
            spaceId,
          };
        } else {
          submittedValue = {
            source: "local",
            workspaceRoot: trimmedPath,
            spaceId,
            createIfMissing: trimmedPath !== pickedPath,
          };
        }
        await props.onSubmit(submittedValue, { signal: abortController.signal });
        if (
          submissionGenerationRef.current !== submissionGeneration ||
          abortController.signal.aborted ||
          !props.open
        ) {
          return;
        }
        submitAbortRef.current = null;
        activeOperationIdRef.current = null;
        props.onSuccess?.(submittedValue);
        props.onOpenChange(false);
      } catch (error) {
        if (submissionGenerationRef.current !== submissionGeneration || !props.open) {
          return;
        }
        submitAbortRef.current = null;
        const failedOperationId = activeOperationIdRef.current;
        activeOperationIdRef.current = null;
        const typedFailure = isGitHubProjectProvisionError(error)
          ? error
          : abortController.signal.aborted && source === "github" && failedOperationId
            ? new GitHubProjectProvisionError({
                operationId: failedOperationId,
                stage: "cancellation",
                code: "CANCELLED",
                summary: "GitHub project provisioning was cancelled.",
                correctiveAction:
                  "Retry when you are ready. Any interrupted checkout was recovered safely.",
                technicalDetails: null,
                retryable: true,
              })
            : null;
        if (typedFailure) {
          setFormError(null);
          setProvisionFailure((current) => coalesceProvisioningFailure(current, typedFailure));
        } else {
          setLocalFailure(
            abortController.signal.aborted
              ? "Project creation cancelled."
              : error instanceof Error
                ? error.message
                : "An error occurred while adding the project.",
          );
        }
        setProvisionProgress(null);
        setSubmitting(false);
      }
    };

    const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void submit();
    };

    const handleOpenChange = useCallback(
      (open: boolean) => {
        if (!open) cancelActiveSubmission();
        props.onOpenChange(open);
      },
      [cancelActiveSubmission, props.onOpenChange],
    );

    useImperativeHandle(
      forwardedRef,
      () => ({
        requestClose: () => handleOpenChange(false),
      }),
      [handleOpenChange],
    );

    // The space is created right away (same command the sidebar uses) and picked
    // as the destination, so one Create click ships the project into it.
    const handleCreateSpace = async (value: SpaceEditorValue) => {
      const api = readNativeApi();
      if (!api) throw new Error("The app server is unavailable.");
      const icon = toSpaceIconName(value.icon);
      const { spaceId } = await createSpace({ api, name: value.name, icon });
      const createdAt = new Date().toISOString();
      setCreatedSpace({
        id: spaceId,
        name: value.name,
        icon,
        sortOrder: Number.MAX_SAFE_INTEGER,
        createdAt,
        updatedAt: createdAt,
      });
      setSelectedSpaceKey(spaceId);
    };

    const selectedSpace = spaces.find((space) => space.id === selectedSpaceKey) ?? null;
    // Only echo the drop/browse result while the path field still matches it;
    // hand-editing the path afterwards puts the box back in its idle state.
    const pickedFolderName =
      pickedPath !== null && trimmedPath === pickedPath
        ? (pickedPath.split(/[/\\]/).filter(Boolean).at(-1) ?? pickedPath)
        : null;
    const finalClonePath = joinProjectPath(trimmedDestinationParent, trimmedDirectoryName);

    const fields = (
      <>
        <ProjectSourceSegmentedPicker
          {...(props.presentation === "dialog" ? { className: "mt-4" } : {})}
          value={source}
          disabled={submitting}
          githubAvailable={props.githubProvisioningAvailable}
          onValueChange={(nextSource) => {
            setSource(nextSource);
            clearFailure();
            setProvisionProgress(null);
            requestAnimationFrame(() =>
              document
                .getElementById(nextSource === "local" ? pathInputId : repositoryInputId)
                ?.focus(),
            );
          }}
        />

        {source === "local" ? (
          <>
            <InputGroup className={PROJECT_DIALOG_FIELD_CONTROL_CLASS_NAME}>
              <InputGroupAddon className="w-10 self-stretch border-e border-foreground/12 ps-0">
                <FolderClosed className="size-4 text-muted-foreground/70" aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                id={pathInputId}
                value={path}
                aria-label="Project folder path"
                aria-invalid={formError ? true : undefined}
                {...(formError ? { "aria-describedby": errorId } : {})}
                placeholder="/path/to/project"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                onChange={(event) => {
                  setPath(event.target.value);
                  clearFailure();
                }}
                onKeyDown={submitOnEnter}
              />
            </InputGroup>

            {isElectron ? (
              <div className="space-y-2">
                <span
                  id={sourceFolderLabelId}
                  className={cn(
                    "block",
                    dialogFieldLabelClassName,
                    "text-[length:var(--app-font-size-ui,12px)] text-foreground",
                  )}
                >
                  Source folder
                </span>
                <button
                  type="button"
                  aria-labelledby={sourceFolderLabelId}
                  disabled={isPickingFolder || submitting}
                  className={cn(
                    "flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-xl border border-foreground/12 px-3.5 text-start text-[length:var(--app-font-size-ui,12px)] text-[var(--color-text-foreground)] transition-colors outline-none hover:bg-foreground/4 focus-visible:border-foreground/30 disabled:opacity-50",
                    isDropTarget &&
                      "border-[color:var(--color-border-focus)] bg-foreground/6 text-[var(--color-text-foreground)]",
                  )}
                  onClick={() => void handleBrowse()}
                >
                  <CentralIcon name="folder-add-left" className="size-4.5" aria-hidden="true" />
                  {isPickingFolder ? (
                    "Opening the folder picker…"
                  ) : pickedFolderName ? (
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{pickedFolderName}</span>
                      <span className="truncate text-[length:var(--app-font-size-ui-xs,10px)] text-muted-foreground/70">
                        {pickedPath}
                      </span>
                    </span>
                  ) : (
                    "Drop a folder here, or browse"
                  )}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <CreateGitHubProjectFields
            repositoryInputId={repositoryInputId}
            operationLegendId={githubOperationLegendId}
            forkDestinationOwnerInputId={forkDestinationOwnerInputId}
            destinationParentInputId={destinationParentInputId}
            directoryNameInputId={directoryNameInputId}
            errorId={errorId}
            repositoryInput={repositoryInput}
            operation={githubOperation}
            forkDestinationOwner={forkDestinationOwner}
            destinationParent={destinationParent}
            directoryName={directoryName}
            finalClonePath={finalClonePath}
            formError={formError}
            provisionProgress={provisionProgress}
            isElectron={isElectron}
            isPickingFolder={isPickingFolder}
            submitting={submitting}
            onRepositoryChange={(nextInput) => {
              setRepositoryInput(nextInput);
              const nextRepository = parseGitHubRepositoryInput(nextInput);
              if (nextRepository && !directoryNameEdited) {
                setDirectoryName(nextRepository.split("/").at(-1) ?? "");
              }
              clearFailure();
            }}
            onOperationChange={(nextOperation) => {
              setGitHubOperation(nextOperation);
              clearFailure();
            }}
            onForkDestinationOwnerChange={(nextOwner) => {
              setForkDestinationOwner(nextOwner);
              clearFailure();
            }}
            onDestinationParentChange={(nextParent) => {
              setDestinationParent(nextParent);
              clearFailure();
            }}
            onDirectoryNameChange={(nextName) => {
              setDirectoryName(nextName);
              setDirectoryNameEdited(true);
              clearFailure();
            }}
            onBrowse={() => void handleBrowse()}
            onSubmitKeyDown={submitOnEnter}
          />
        )}

        <div className="space-y-2">
          <span
            id={spaceLabelId}
            className={cn(
              "block",
              dialogFieldLabelClassName,
              "text-[length:var(--app-font-size-ui,12px)] text-foreground",
            )}
          >
            Space
          </span>
          <div className="flex items-center gap-2">
            <Select
              value={selectedSpaceKey}
              onValueChange={(next) => {
                if (typeof next === "string") setSelectedSpaceKey(next);
              }}
            >
              <SelectTrigger
                aria-labelledby={spaceLabelId}
                className={cn(PROJECT_DIALOG_FIELD_CONTROL_CLASS_NAME, "min-w-0 flex-1")}
              >
                <SelectValue>
                  <span className="flex items-center gap-2">
                    <SpaceIcon icon={selectedSpace?.icon ?? voidSpace.icon} className="size-3.5" />
                    {selectedSpace?.name ?? voidSpace.name}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <ComposerPickerSelectPopup align="start">
                <SelectItem value={VOID_SPACE_KEY}>
                  <span className="flex items-center gap-2">
                    <SpaceIcon icon={voidSpace.icon} className="size-3.5" />
                    {voidSpace.name}
                  </span>
                </SelectItem>
                {spaces.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    <span className="flex items-center gap-2">
                      <SpaceIcon icon={space.icon} className="size-3.5" />
                      {space.name}
                    </span>
                  </SelectItem>
                ))}
              </ComposerPickerSelectPopup>
            </Select>
            <Button
              variant="outline"
              size="icon"
              aria-label="New space"
              disabled={submitting}
              className={cn(PROJECT_DIALOG_FIELD_CONTROL_CLASS_NAME, "w-9 shrink-0 sm:h-9")}
              onClick={() => setSpaceEditorOpen(true)}
            >
              <CentralIcon name="plus-medium" className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {formError ? (
          <div id={errorId} role="alert" className="space-y-1">
            <p className="text-[length:var(--app-font-size-ui-xs,10px)] text-destructive">
              {formError}
            </p>
            {formErrorMeaning ? (
              <p className="text-[length:var(--app-font-size-ui-xs,10px)] text-muted-foreground/70">
                {formErrorMeaning}
              </p>
            ) : null}
          </div>
        ) : null}
        {provisionFailure ? (
          <InlineOperationError
            summary={provisionFailure.error.summary}
            correctiveAction={provisionFailure.error.correctiveAction}
            technicalDetails={provisionFailure.error.technicalDetails ?? undefined}
            occurrenceCount={provisionFailure.occurrenceCount}
            onRetry={provisionFailure.error.retryable ? () => void submit() : undefined}
            onDismiss={() => setProvisionFailure(null)}
          />
        ) : null}
      </>
    );

    const footer = (
      <>
        <Button
          variant="ghost"
          shape="capsule"
          className="px-4 text-[length:var(--app-font-size-ui-lg,13px)] sm:text-[length:var(--app-font-size-ui-lg,13px)]"
          onClick={() => handleOpenChange(false)}
        >
          {submitting && source === "github" ? "Cancel clone" : "Cancel"}
        </Button>
        <Button
          id={submitButtonId}
          variant="prominent"
          className="px-4 text-[length:var(--app-font-size-ui-lg,13px)] transition-opacity hover:scale-100 sm:text-[length:var(--app-font-size-ui-lg,13px)]"
          onClick={() => void submit()}
          disabled={submitting}
        >
          {submitting
            ? source === "github"
              ? githubOperation === "fork-and-clone"
                ? "Forking and cloning…"
                : "Cloning…"
              : "Creating…"
            : source === "github"
              ? githubOperation === "fork-and-clone"
                ? "Fork and add"
                : "Clone and add"
              : "Create project"}
        </Button>
      </>
    );

    return (
      <>
        {props.presentation === "dialog" ? (
          <DialogPanel className="space-y-4 px-5">{fields}</DialogPanel>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{fields}</div>
        )}
        {props.presentation === "dialog" ? (
          <DialogFooter className="px-5 pb-5">{footer}</DialogFooter>
        ) : (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/70 px-5 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
        {props.presentation === "dialog" ? (
          <SpaceEditorDialog
            open={spaceEditorOpen}
            mode="create"
            existingNames={[...spaces.map((space) => space.name), voidSpace.name]}
            onOpenChange={setSpaceEditorOpen}
            onSubmit={handleCreateSpace}
          />
        ) : (
          <DisclosureRegion open={spaceEditorOpen} className="shrink-0 border-t border-border/70">
            <section aria-label="New space" className="space-y-4 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold">New space</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Group projects into a focused work context.
                </p>
              </div>
              <SpaceEditorFields
                open={spaceEditorOpen}
                mode="create"
                presentation="inline"
                existingNames={[...spaces.map((space) => space.name), voidSpace.name]}
                onOpenChange={setSpaceEditorOpen}
                onSubmit={handleCreateSpace}
              />
            </section>
          </DisclosureRegion>
        )}
      </>
    );
  },
);
