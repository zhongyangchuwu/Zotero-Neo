import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const node = process.execPath;
const commands = [
  [npm, ['run', 'format:check']],
  [npm, ['run', 'typecheck']],
  [npm, ['test']],
  [npm, ['run', 'build']],
  [node, ['tools/check-package.mjs']],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
