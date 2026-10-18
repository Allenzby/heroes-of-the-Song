// 升版本号 + 自动写更新日志，一条命令搞定。
//
//   npm run bump 1.2.3 "改了什么" "又改了什么"
//   npm run bump patch "改了什么"          # 小修：2.4.0 -> 2.4.1
//   npm run bump minor "改了什么"          # 新功能：2.4.0 -> 2.5.0
//
// 会同时改两处，并保持一致：
//   1. package.json        -> version
//   2. src/data/changelog.json -> 最前面插一条新记录
//
// 关于页显示的「版本 x.y.z」读的就是 changelog.json，所以不用碰 HTML。
//
// 约定（见 README）：加功能 -> 版本号 +1；只修 bug -> 版本号不动。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(root, 'package.json');
const logPath = join(root, 'src/data/changelog.json');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('用法: npm run bump <版本号|major|minor|patch> "<改动1>" ["<改动2>" ...]');
  console.log('例子: npm run bump 2.5.0 "新增无尽模式"');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const log = JSON.parse(readFileSync(logPath, 'utf8'));
const current = pkg.version;

function bump(kind) {
  const [maj, min, pat] = current.split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  return kind; // 显式版本号
}

const next = bump(args[0]);
const items = args.slice(1);

// 版本号没变就没必要写日志（只修 bug 的情况）
if (next === current) {
  console.log(`版本号没变（${current}），跳过日志。只修 bug 时本就该这样。`);
  process.exit(0);
}

if (log.entries.some((e) => e.version === next)) {
  console.error(`changelog.json 里已经存在 v${next} 了，先检查一下。`);
  process.exit(1);
}

const today = new Date();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

// 插到最前面：日志按时间倒序，新的在上
log.entries.unshift({ version: next, date, items });

pkg.version = next;

writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
writeFileSync(logPath, `${JSON.stringify(log, null, 2)}\n`);

console.log(`\n版本 ${current} -> ${next}`);
console.log(`已写入 ${logPath}`);
console.log('\n记得跑一次 npx vite build 验证。');
