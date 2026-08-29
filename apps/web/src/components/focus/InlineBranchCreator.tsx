// FILE: InlineBranchCreator.tsx
// Purpose: Shared popup-free branch-name editor for focus-mode Git surfaces.
// Layer: Focus-mode UI

import { Button } from "~/components/ui/button";
import { DisclosureRegion } from "~/components/ui/DisclosureRegion";
import { Input } from "~/components/ui/input";

export function InlineBranchCreator(props: {
  readonly open: boolean;
  readonly fieldId: string;
  readonly description: string;
  readonly value: string;
  readonly conflict: boolean;
  readonly submitLabel: string;
  readonly onChange: (value: string) => void;
  readonly onCancel: () => void;
  readonly onSubmit: (value: string) => void;
}) {
  const trimmed = props.value.trim();
  return (
    <DisclosureRegion open={props.open}>
      {props.open ? (
        <section
          aria-label="Create branch"
          className="mt-3 rounded-xl border border-border bg-[var(--color-background-elevated-primary-opaque)] p-4"
          data-slot="inline-branch-creator"
        >
          <h3 className="font-medium">Create Branch</h3>
          <p className="mt-1 text-muted-foreground text-sm">{props.description}</p>
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!trimmed || props.conflict) return;
              props.onSubmit(trimmed);
            }}
          >
            <label className="block font-medium text-sm" htmlFor={props.fieldId}>
              Branch name
            </label>
            <Input
              id={props.fieldId}
              placeholder="feature/my-change"
              value={props.value}
              onChange={(event) => props.onChange(event.target.value)}
            />
            {props.conflict ? (
              <p className="text-destructive text-sm">A branch with this name already exists.</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={!trimmed || props.conflict}>
                {props.submitLabel}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={props.onCancel}>
                Cancel
              </Button>
            </div>
          </form>
        </section>
      ) : null}
    </DisclosureRegion>
  );
}
