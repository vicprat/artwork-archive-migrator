import { Command } from 'commander';
import { Commands } from './cli/commands';
import { Logger } from './utils/logger';

const program = new Command();

program
  .name('artwork-to-shopify')
  .description('CLI tool to migrate Artwork Archive data to Shopify CSV format')
  .version('1.0.0');

program
  .command('migrate')
  .description('Migrate Artwork Archive CSV to Shopify format')
  .action(Commands.migrate);

program
  .command('preview')
  .description('Preview data from Artwork Archive CSV')
  .action(Commands.preview);

program.on('--help', () => {
  Logger.info('\nExamples:');
  Logger.info('  $ npm run dev migrate');
  Logger.info('  $ npm run dev preview');
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
