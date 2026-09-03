import { defineConfig, mergeConfig } from "vitest/config";

import browserConfig from "./vitest.browser.config";

export default mergeConfig(
  browserConfig,
  defineConfig({
    test: {
      testNamePattern: /^(?!.*\[geometry:linux\])/,
      // Browser suites share one page and some legacy fixture-backed suites
      // deliberately mutate their transport state between assertions.
      sequence: { concurrent: false },
      browser: {
        fileParallelism: false,
      },
    },
  }),
);
