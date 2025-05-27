// src/index.ts
import dotenv from 'dotenv';
import path from 'path';
import { Command } from 'commander';
import { Commands } from './cli/commands';
import { Logger } from './utils/logger';

// Cargar variables de entorno ANTES que cualquier otra cosa
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Validar variables requeridas
const requiredEnvVars = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_KEY'
];

const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingVars.length > 0) {
  Logger.error(`Variables de entorno requeridas no encontradas: ${missingVars.join(', ')}`);
  Logger.info('Por favor, crea un archivo .env con las siguientes variables:');
  Logger.info('DATABASE_URL="postgresql://postgres.project:password@host:port/postgres"');
  Logger.info('SUPABASE_URL="https://your-project.supabase.co"');
  Logger.info('SUPABASE_KEY="your-anon-key"');
  process.exit(1);
}

const program = new Command();

program
  .name('migrate-to-shopify')
  .description('CLI tool to migrate Artwork Archive and WooCommerce data to Shopify CSV format')
  .version('1.0.0');

program
  .command('migrate')
  .description('Migrate both Artwork Archive and WooCommerce data to database with image processing')
  .action(async () => {
    try {
      await Commands.migrate();
    } catch (error: any) {
      Logger.error(`Migration failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('export-csv')
  .description('Export products from database to Shopify CSV format')
  .action(async () => {
    try {
      await Commands.exportCsv();
    } catch (error: any) {
      Logger.error(`Export failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('preview')
  .description('Preview data from Artwork Archive CSV')
  .action(async () => {
    try {
      await Commands.preview();
    } catch (error: any) {
      Logger.error(`Preview failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('analyze')
  .description('Analyze Artwork Archive CSV for potential issues')
  .action(async () => {
    try {
      await Commands.analyze();
    } catch (error: any) {
      Logger.error(`Analysis failed: ${error.message}`);
      process.exit(1);
    }
  });

program.on('--help', () => {
  Logger.info('\nExamples:');
  Logger.info('  $ npm run dev migrate     # Unified migration to database with image processing');
  Logger.info('  $ npm run dev export-csv  # Export Shopify CSV from database');
  Logger.info('  $ npm run dev preview     # Preview Artwork Archive data');
  Logger.info('  $ npm run dev analyze     # Analyze data for issues');
  Logger.info('\nEnvironment Variables Required:');
  Logger.info('  DATABASE_URL    - PostgreSQL connection string (Supabase)');
  Logger.info('  SUPABASE_URL    - Supabase project URL');
  Logger.info('  SUPABASE_KEY    - Supabase anon/public key');
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}