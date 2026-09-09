import { spawnSync } from 'node:child_process';

const node = process.execPath;

const npmRunner = process.env.npm_execpath
  ? [node, [process.env.npm_execpath, 'run']]
  : [process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run']];
const commands = [
  [npmRunner[0], [...npmRunner[1], 'format:check']],
  [npmRunner[0], [...npmRunner[1], 'typecheck']],
  [npmRunner[0], [...npmRunner[1], 'test']],
  [npmRunner[0], [...npmRunner[1], 'build']],
  [node, ['tools/check-package.mjs']],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
