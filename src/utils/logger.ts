import chalk from 'chalk';
import ora, { Ora } from 'ora';

let quiet = false;
export function setQuiet(v: boolean): void {
  quiet = v;
}

export const c = chalk;

export function spinner(text: string): Ora {
  if (quiet) {
    // A no-op spinner so callers can always call .succeed()/.stop().
    return {
      start: () => stub,
      succeed: () => stub,
      fail: () => stub,
      stop: () => stub,
      set text(_v: string) {},
    } as unknown as Ora;
  }
  return ora({ text, spinner: 'dots' }).start();
}
const stub = {} as Ora;

export function heading(text: string): void {
  if (quiet) return;
  const bar = '─'.repeat(Math.max(text.length, 30));
  console.log('\n' + chalk.dim(bar));
  console.log(chalk.bold(text));
  console.log(chalk.dim(bar));
}

export function line(text = ''): void {
  if (!quiet) console.log(text);
}

export function kv(label: string, value: string | number): void {
  if (quiet) return;
  console.log(`${chalk.dim(label.padEnd(24))} ${value}`);
}
