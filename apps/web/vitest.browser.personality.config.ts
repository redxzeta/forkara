import { defineConfig, mergeConfig } from "vitest/config";

import browserConfig from "./vitest.browser.config";

const PERSONALITY_SMOKE_FILES = [
  "src/components/KeybindingsToast.browser.tsx",
  "src/components/settings/NoForksGivenModeSetting.browser.tsx",
  "src/components/settings/ResetDepartmentSettingsPanel.browser.tsx",
  "src/components/pullRequest/MergeFlexComposerParodyDialog.browser.tsx",
  "src/components/chat/environment/PersonalityWorkflows.browser.tsx",
];

const mergedConfig = mergeConfig(
  browserConfig,
  defineConfig({
    test: {
      testNamePattern: /\[personality-smoke\]/,
      browser: {
        fileParallelism: false,
      },
    },
  }),
);

export default defineConfig({
  ...mergedConfig,
  test: {
    ...mergedConfig.test,
    include: PERSONALITY_SMOKE_FILES,
  },
});
