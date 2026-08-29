// FILE: CreateProjectDock.tsx
// Purpose: Portal-free, in-layout Add Project shell for No Forks Given Mode.
// Layer: Focus-mode web UI
// Exports: CreateProjectDock

import { useRef } from "react";

import {
  CreateProjectForm,
  type CreateProjectFormHandle,
  type CreateProjectFormProps,
} from "./CreateProjectForm";
import { Button } from "./ui/button";
import { XIcon } from "~/lib/icons";
import { disclosureWidthClassName } from "~/lib/disclosureMotion";

export function CreateProjectDock(props: Omit<CreateProjectFormProps, "presentation">) {
  const formRef = useRef<CreateProjectFormHandle>(null);

  return (
    <aside
      aria-hidden={props.open ? undefined : true}
      aria-label="Create project"
      className={disclosureWidthClassName(
        props.open,
        "w-full md:w-[420px]",
        "relative z-10 h-svh min-h-0 shrink-0 border-r border-border/70 bg-background text-foreground",
      )}
      data-slot="create-project-dock"
      inert={!props.open}
    >
      <section className="flex h-full w-full min-w-0 flex-col md:w-[420px]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Create project</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add a local folder or provision one from GitHub.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close create project"
            onClick={() => formRef.current?.requestClose()}
          >
            <XIcon />
          </Button>
        </header>
        <CreateProjectForm ref={formRef} {...props} presentation="dock" />
      </section>
    </aside>
  );
}
