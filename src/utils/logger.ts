import chalk from 'chalk';

export class Logger {
  static info(message: string): void {
    console.log(chalk.blue(`ℹ️  ${message}`));
  }

  static success(message: string): void {
    console.log(chalk.green(`✅ ${message}`));
  }

  static error(message: string): void {
    console.log(chalk.red(`❌ ${message}`));
  }

  static warning(message: string): void {
    console.log(chalk.yellow(`⚠️  ${message}`));
  }

  static header(message: string): void {
    console.log(chalk.bold.magenta(`\n${message}\n${'='.repeat(message.length)}`));
  }
}