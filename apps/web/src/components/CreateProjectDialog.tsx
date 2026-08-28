// FILE: CreateProjectDialog.tsx
// Purpose: Default-mode modal shell for the shared Add Project form/controller.
// Layer: Web UI dialog shell
// Exports: CreateProjectDialog plus the shared submit types for compatibility

import { useRef } from "react";

import {
  CreateProjectForm,
  type CreateProjectFormHandle,
  type CreateProjectFormProps,
} from "./CreateProjectForm";
import { Dialog, DialogHeader, DialogPopup, DialogTitle } from "./ui/dialog";

export type { CreateProjectSubmitOptions, CreateProjectSubmitValue } from "./CreateProjectForm";

export function CreateProjectDialog(
  props: Omit<CreateProjectFormProps, "presentation" | "onSuccess">,
) {
  const formRef = useRef<CreateProjectFormHandle>(null);

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (open) {
          props.onOpenChange(true);
          return;
        }
        formRef.current?.requestClose();
      }}
    >
      <DialogPopup>
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>Create project</DialogTitle>
        </DialogHeader>
        <CreateProjectForm ref={formRef} {...props} presentation="dialog" />
      </DialogPopup>
    </Dialog>
  );
}
