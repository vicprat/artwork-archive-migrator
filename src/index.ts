import { Command } from 'commander';
import { Commands } from './cli/commands';
import { Logger } from './utils/logger';

const program = new Command();

program
  .name('migrate-to-shopify')
  .description('CLI tool to migrate Artwork Archive and WooCommerce data to Shopify CSV format')
  .version('1.0.0');

program
  .command('migrate')
  .description('Migrate both Artwork Archive and WooCommerce data to a unified Shopify CSV')
  .action(Commands.migrate);


program
  .command('preview')
  .description('Preview data from Artwork Archive CSV')
  .action(Commands.preview);

program
  .command('analyze')
  .description('Analyze Artwork Archive CSV for potential issues')
  .action(Commands.analyze);

program.on('--help', () => {
  Logger.info('\nExamples:');
  Logger.info('  $ npm run dev migrate         # Unified migration from both sources');
  Logger.info('  $ npm run dev migrate-artwork # Migrate only from Artwork Archive');
  Logger.info('  $ npm run dev migrate-woo     # Migrate only from WooCommerce');
  Logger.info('  $ npm run dev preview');
  Logger.info('  $ npm run dev analyze');
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}