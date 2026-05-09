import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const sharedGlobals = {
  console: "readonly"
};

const browserGlobals = {
  Blob: "readonly",
  URL: "readonly",
  document: "readonly",
  HTMLElement: "readonly",
  window: "readonly"
};

const nodeGlobals = {
  process: "readonly"
};

export default [
  {
    ignores: [
      "node_modules/",
      "dist/",
      ".wrangler/",
      "reports/",
      "coverage/",
      "apps/web/dist/"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    languageOptions: {
      globals: sharedGlobals
    }
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_"
        }
      ]
    }
  },
  {
    files: ["apps/web/**/*.{ts,tsx}", "packages/ui/**/*.{tsx}"],
    languageOptions: {
      globals: browserGlobals
    }
  },
  {
    files: ["cli/**/*.mjs", "scripts/**/*.mjs", "eslint.config.js", "vitest.config.ts"],
    languageOptions: {
      globals: nodeGlobals
    }
  },
  {
    files: ["**/*.tsx"],
    plugins: {
      "react-hooks": reactHooks
    },
    rules: reactHooks.configs.recommended.rules
  }
];
