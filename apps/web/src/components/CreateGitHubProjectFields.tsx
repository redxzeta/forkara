import type { GitHubProjectProvisionOperation } from "@forkara/contracts";
import type { KeyboardEvent, ReactNode } from "react";

import { GitHubIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

import { FolderClosed } from "./FolderClosed";
import { Button } from "./ui/button";
import { dialogFieldLabelClassName } from "./ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group";

export const PROJECT_DIALOG_FIELD_CONTROL_CLASS_NAME = "h-9 rounded-lg border-foreground/12";

export function CreateGitHubProjectFields(props: {
  readonly repositoryInputId: string;
  readonly operationLegendId: string;
  readonly forkDestinationOwnerInputId: string;
  readonly destinationParentInputId: string;
  readonly directoryNameInputId: string;
  readonly errorId: string;
  readonly repositoryInput: string;
  readonly operation: GitHubProjectProvisionOperation;
  readonly forkDestinationOwner: string;
  readonly destinationParent: string;
  readonly directoryName: string;
  readonly finalClonePath: string;
  readonly formError: string | null;
  readonly provisionProgress: string | null;
  readonly isElectron: boolean;
  readonly isPickingFolder: boolean;
  readonly submitting: boolean;
  readonly onRepositoryChange: (value: string) => void;
  readonly onOperationChange: (value: GitHubProjectProvisionOperation) => void;
  readonly onForkDestinationOwnerChange: (value: string) => void;
  readonly onDestinationParentChange: (value: string) => void;
  readonly onDirectoryNameChange: (value: string) => void;
  readonly onBrowse: () => void;
  readonly onSubmitKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-foreground/10 bg-foreground/[0.025] px-3.5 py-3">
        <p className="text-[length:var(--app-font-size-ui,12px)] font-medium text-foreground">
          What you need
        </p>
        <ol className="mt-2.5 space-y-2">
          <GitHubRequirement index={1} title="Repository">
            Paste an <span className="font-medium text-foreground">owner/repository</span> name or
            its GitHub URL.
          </GitHubRequirement>
          <GitHubRequirement index={2} title="Destination">
            Choose the parent folder where Synara should create the checkout.
          </GitHubRequirement>
          <GitHubRequirement index={3} title="Private access">
            Public repositories work immediately. For private repositories, run{" "}
            <code className="font-mono text-foreground">gh auth login</code> or configure Git
            credentials.
          </GitHubRequirement>
        </ol>
      </div>

      <fieldset className="space-y-2" aria-labelledby={props.operationLegendId}>
        <legend
          id={props.operationLegendId}
          className={cn(
            "block",
            dialogFieldLabelClassName,
            "text-[length:var(--app-font-size-ui,12px)] text-foreground",
          )}
        >
          GitHub operation
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <GitHubOperationChoice
            name={props.operationLegendId}
            checked={props.operation === "clone"}
            value="clone"
            title="Clone directly"
            description="Use the requested source directly. No fork or upstream remote is created."
            disabled={props.submitting}
            onChange={props.onOperationChange}
          />
          <GitHubOperationChoice
            name={props.operationLegendId}
            checked={props.operation === "fork-and-clone"}
            value="fork-and-clone"
            title="Fork and clone"
            description="Create or reuse your fork, clone it, and configure the source as upstream."
            disabled={props.submitting}
            onChange={props.onOperationChange}
          />
        </div>
      </fieldset>

      {props.operation === "fork-and-clone" ? (
        <div className="space-y-2">
          <label
            htmlFor={props.forkDestinationOwnerInputId}
            className={cn(
              "block",
              dialogFieldLabelClassName,
              "text-[length:var(--app-font-size-ui,12px)] text-foreground",
            )}
          >
            Fork destination <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <InputGroup className={PROJECT_DIALOG_FIELD_CONTROL_CLASS_NAME}>
            <GitHubIcon className="ms-3 size-4 text-muted-foreground/70" aria-hidden="true" />
            <InputGroupInput
              id={props.forkDestinationOwnerInputId}
              value={props.forkDestinationOwner}
              placeholder="Your account or organization"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              onChange={(event) => props.onForkDestinationOwnerChange(event.target.value)}
              onKeyDown={props.onSubmitKeyDown}
            />
          </InputGroup>
          <p className="text-[length:var(--app-font-size-ui-xs,10px)] text-muted-foreground/70">
            Leave empty to use the account authenticated with GitHub CLI.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <label
          htmlFor={props.repositoryInputId}
          className={cn(
            "block",
            dialogFieldLabelClassName,
            "text-[length:var(--app-font-size-ui,12px)] text-foreground",
          )}
        >
          Repository
        </label>
        <InputGroup className={PROJECT_DIALOG_FIELD_CONTROL_CLASS_NAME}>
          <InputGroupAddon className="w-10 self-stretch border-e border-foreground/12 ps-0">
            <GitHubIcon className="size-4 text-muted-foreground/70" aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            id={props.repositoryInputId}
            value={props.repositoryInput}
            aria-invalid={props.formError ? true : undefined}
            {...(props.formError ? { "aria-describedby": props.errorId } : {})}
            placeholder="owner/repository or GitHub URL"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            onChange={(event) => props.onRepositoryChange(event.target.value)}
            onKeyDown={props.onSubmitKeyDown}
          />
        </InputGroup>
      </div>

      <div className="space-y-2">
        <label
          htmlFor={props.destinationParentInputId}
          className={cn(
            "block",
            dialogFieldLabelClassName,
            "text-[length:var(--app-font-size-ui,12px)] text-foreground",
          )}
        >
          Clone into
        </label>
        <div className="flex items-center gap-2">
          <InputGroup className={cn(PROJECT_DIALOG_FIELD_CONTROL_CLASS_NAME, "min-w-0 flex-1")}>
            <InputGroupAddon className="w-10 self-stretch border-e border-foreground/12 ps-0">
              <FolderClosed className="size-4 text-muted-foreground/70" aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              id={props.destinationParentInputId}
              value={props.destinationParent}
              placeholder="/parent/folder"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              onChange={(event) => props.onDestinationParentChange(event.target.value)}
              onKeyDown={props.onSubmitKeyDown}
            />
          </InputGroup>
          {props.isElectron ? (
            <Button
              type="button"
              variant="outline"
              className={cn(PROJECT_DIALOG_FIELD_CONTROL_CLASS_NAME, "shrink-0 px-3")}
              disabled={props.isPickingFolder || props.submitting}
              onClick={props.onBrowse}
            >
              Browse
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <label
          htmlFor={props.directoryNameInputId}
          className={cn(
            "block",
            dialogFieldLabelClassName,
            "text-[length:var(--app-font-size-ui,12px)] text-foreground",
          )}
        >
          Folder name
        </label>
        <InputGroup className={PROJECT_DIALOG_FIELD_CONTROL_CLASS_NAME}>
          <InputGroupInput
            id={props.directoryNameInputId}
            value={props.directoryName}
            placeholder="repository"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            onChange={(event) => props.onDirectoryNameChange(event.target.value)}
            onKeyDown={props.onSubmitKeyDown}
          />
        </InputGroup>
        {props.finalClonePath ? (
          <p className="truncate text-[length:var(--app-font-size-ui-xs,10px)] text-muted-foreground/70">
            Final location: {props.finalClonePath}
          </p>
        ) : null}
      </div>

      {props.provisionProgress ? (
        <p
          role="status"
          className="text-[length:var(--app-font-size-ui-xs,10px)] text-muted-foreground"
        >
          {props.provisionProgress}
        </p>
      ) : null}
    </div>
  );
}

function GitHubOperationChoice(props: {
  readonly name: string;
  readonly checked: boolean;
  readonly value: GitHubProjectProvisionOperation;
  readonly title: string;
  readonly description: string;
  readonly disabled: boolean;
  readonly onChange: (value: GitHubProjectProvisionOperation) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-2.5 rounded-xl border px-3 py-2.5 outline-none transition-colors has-focus-visible:border-foreground/40",
        props.checked
          ? "border-foreground/30 bg-foreground/[0.055]"
          : "border-foreground/10 hover:bg-foreground/[0.025]",
        props.disabled && "cursor-default opacity-50",
      )}
    >
      <input
        type="radio"
        name={props.name}
        value={props.value}
        checked={props.checked}
        disabled={props.disabled}
        className="mt-0.5 size-3.5 accent-foreground"
        onChange={() => props.onChange(props.value)}
      />
      <span className="min-w-0">
        <span className="block text-[length:var(--app-font-size-ui,12px)] font-medium text-foreground">
          {props.title}
        </span>
        <span className="mt-0.5 block text-[length:var(--app-font-size-ui-xs,10px)] leading-4 text-muted-foreground">
          {props.description}
        </span>
      </span>
    </label>
  );
}

function GitHubRequirement(props: {
  readonly index: number;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2 text-[length:var(--app-font-size-ui-xs,10px)] leading-4 text-muted-foreground">
      <span
        aria-hidden
        className="mt-px flex size-4 items-center justify-center rounded-full bg-foreground/7 text-[9px] font-semibold text-foreground/70"
      >
        {props.index}
      </span>
      <span>
        <span className="font-medium text-foreground">{props.title}.</span> {props.children}
      </span>
    </li>
  );
}
