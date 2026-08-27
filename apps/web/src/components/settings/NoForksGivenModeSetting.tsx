// FILE: NoForksGivenModeSetting.tsx
// Purpose: Immediate local preference control for the non-modal focus workflow.
// Layer: Settings UI component
// Exports: NoForksGivenModeSetting

import { SettingResetButton } from "./SettingControls";
import { SettingsRow } from "./SettingsPanelPrimitives";
import { Switch } from "../ui/switch";

export function NoForksGivenModeSetting(props: {
  readonly checked: boolean;
  readonly defaultChecked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <SettingsRow
      title="No Forks Given Mode"
      description="Keep migrated developer-loop feedback and confirmations in the workspace instead of popups. Safeguards, permissions, and explicit confirmation requirements remain unchanged."
      resetAction={
        props.checked !== props.defaultChecked ? (
          <SettingResetButton
            label="No Forks Given Mode"
            onClick={() => props.onCheckedChange(props.defaultChecked)}
          />
        ) : null
      }
      control={
        <Switch
          checked={props.checked}
          onCheckedChange={(checked) => props.onCheckedChange(Boolean(checked))}
          aria-label="Enable No Forks Given Mode"
        />
      }
    />
  );
}
