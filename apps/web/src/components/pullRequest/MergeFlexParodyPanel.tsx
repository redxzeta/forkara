import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { CheckIcon, CopyIcon } from "~/lib/icons";
import {
  makeMergeFlexMockAgentPrompt,
  MERGE_FLEX_PARODY_COUNT_MAX,
  MERGE_FLEX_PARODY_PRESETS,
  MERGE_FLEX_PARODY_TEMPLATES,
  type MergeFlexParodyTemplateId,
} from "~/lib/mergeFlexComposer";
import { cn } from "~/lib/utils";

import {
  PR_FINE_TEXT_CLASS_NAME,
  PR_META_TEXT_CLASS_NAME,
  PR_QUIET_INK_CLASS_NAME,
} from "./pullRequestText";

export function MergeFlexParodyPanel(props: {
  readonly count: number;
  readonly countInput: string;
  readonly countValid: boolean;
  readonly date: string;
  readonly disabled: boolean;
  readonly templateId: MergeFlexParodyTemplateId;
  readonly onCountInputChange: (value: string) => void;
  readonly onPreset: (count: number) => void;
  readonly onTemplateChange: (templateId: MergeFlexParodyTemplateId) => void;
}) {
  const [copyError, setCopyError] = useState<string | null>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    onCopy: () => setCopyError(null),
    onError: (error) => setCopyError(error.message),
  });
  const agentPrompt = props.countValid
    ? makeMergeFlexMockAgentPrompt({ count: props.count, date: props.date })
    : null;

  return (
    <section className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <div>
        <p className={cn(PR_META_TEXT_CLASS_NAME, "font-medium")}>PR Inflation Department</p>
        <p className={cn(PR_FINE_TEXT_CLASS_NAME, PR_QUIET_INK_CLASS_NAME)}>
          Alleged counts never create pull requests, commits, branches, or GitHub activity.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="merge-flex-alleged-count"
          className={cn(PR_META_TEXT_CLASS_NAME, "font-medium")}
        >
          Alleged PRs merged today
        </label>
        <Input
          id="merge-flex-alleged-count"
          type="number"
          nativeInput
          inputMode="numeric"
          min={0}
          max={MERGE_FLEX_PARODY_COUNT_MAX}
          step={1}
          value={props.countInput}
          disabled={props.disabled}
          aria-invalid={!props.countValid}
          aria-describedby="merge-flex-alleged-count-note"
          onChange={(event) => props.onCountInputChange(event.target.value)}
        />
        <p
          id="merge-flex-alleged-count-note"
          className={cn(
            PR_FINE_TEXT_CLASS_NAME,
            props.countValid ? PR_QUIET_INK_CLASS_NAME : "text-destructive",
          )}
          role={props.countValid ? undefined : "alert"}
        >
          {props.countValid
            ? `Choose an integer from 0 through ${MERGE_FLEX_PARODY_COUNT_MAX.toLocaleString()}.`
            : `Enter a whole number from 0 through ${MERGE_FLEX_PARODY_COUNT_MAX.toLocaleString()}.`}
        </p>
      </div>

      <fieldset className="space-y-2" disabled={props.disabled}>
        <legend className={cn(PR_META_TEXT_CLASS_NAME, "font-medium")}>Quick presets</legend>
        <div className="flex flex-wrap gap-2">
          {MERGE_FLEX_PARODY_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={props.countValid && props.count === preset.count ? "secondary" : "outline"}
              aria-pressed={props.countValid && props.count === preset.count}
              onClick={() => props.onPreset(preset.count)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2" disabled={props.disabled || !props.countValid}>
        <legend className={cn(PR_META_TEXT_CLASS_NAME, "font-medium")}>Department template</legend>
        <div className="flex flex-wrap gap-2">
          {MERGE_FLEX_PARODY_TEMPLATES.map((template) => (
            <Button
              key={template.id}
              type="button"
              size="sm"
              variant={props.templateId === template.id ? "secondary" : "outline"}
              aria-pressed={props.templateId === template.id}
              onClick={() => props.onTemplateChange(template.id)}
            >
              {template.label}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2 rounded-lg border border-border/60 bg-background/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className={cn(PR_META_TEXT_CLASS_NAME, "font-medium")}>
              Generate mock PRs with an agent
            </p>
            <p className={cn(PR_FINE_TEXT_CLASS_NAME, PR_QUIET_INK_CLASS_NAME)}>
              Review and copy a development-only agent prompt. Forkara does not dispatch it.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={props.disabled || !props.countValid}
            onClick={() => {
              if (agentPrompt) copyToClipboard(agentPrompt, undefined);
            }}
          >
            {isCopied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
            {isCopied ? "Copied prompt" : "Copy agent prompt"}
          </Button>
        </div>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/35 p-2 text-[10px] leading-relaxed text-muted-foreground">
          {agentPrompt ?? "Enter a valid alleged count to prepare the agent prompt."}
        </pre>
        {copyError ? (
          <p role="alert" className={cn(PR_FINE_TEXT_CLASS_NAME, "text-destructive")}>
            {copyError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
