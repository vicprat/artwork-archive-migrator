import { Command } from 'commander';
import { Commands } from './cli/commands';
import { Logger } from './utils/logger';

const program = new Command();

program
  .name('artwork-to-shopify')
  .description('CLI tool to migrate Artwork Archive and WooCommerce data to Shopify CSV format')
  .version('1.0.0');

program
  .command('migrate')
  .description('Migrate Artwork Archive CSV to Shopify format')
  .action(Commands.migrate);

program
  .command('preview')
  .description('Preview data from Artwork Archive CSV')
  .action(Commands.preview);

program
  .command('analyze')
  .description('Analyze Artwork Archive CSV for potential issues')
  .action(Commands.analyze);

program
  .command('migrate-woo')
  .description('Migrate WooCommerce products from MySQL database to Shopify format')
  .action(Commands.migrateWooCommerce);

program.on('--help', () => {
  Logger.info('\nExamples:');
  Logger.info('  $ npm run dev migrate');
  Logger.info('  $ npm run dev preview');
  Logger.info('  $ npm run dev analyze');
  Logger.info('  $ npm run dev migrate-woo');
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}