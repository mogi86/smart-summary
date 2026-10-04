import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// オニオンアーキテクチャの依存方向（外側 → 内側のみ）を強制する
const restrictImports = (...layers) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: layers.map((layer) => ({
        group: [`**/${layer}/**`, `**/${layer}`],
        message: `この層から ${layer} 層には依存できません`,
      })),
    },
  ],
});

export default tseslint.config(
  { ignores: ['**/node_modules/', '**/dist/', '**/cdk.out/', '.playwright-mcp/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['app/src/domain/**'],
    rules: restrictImports('application', 'infrastructure', 'presentation'),
  },
  {
    files: ['app/src/application/**'],
    rules: restrictImports('infrastructure', 'presentation'),
  },
  {
    files: ['app/src/infrastructure/**'],
    rules: restrictImports('presentation'),
  },
  prettier,
);
