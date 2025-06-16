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

// ===== COMANDOS DE EXPORTACIÓN =====

program
  .command('export-shopify')
  .description('Export products to Shopify CSV with Supabase image URLs (recommended)')
  .action(async () => {
    try {
      await Commands.exportShopifyCsv();
    } catch (error: any) {
      Logger.error(`Export failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('export-csv')
  .description('Export products from database to Shopify CSV format (legacy)')
  .action(async () => {
    try {
      await Commands.exportCsv();
    } catch (error: any) {
      Logger.error(`Export failed: ${error.message}`);
      process.exit(1);
    }
  });

// ===== COMANDOS DE GESTIÓN DE IMÁGENES =====

program
  .command('check-images')
  .description('Check image processing status and statistics')
  .action(async () => {
    try {
      await Commands.checkImageStatus();
    } catch (error: any) {
      Logger.error(`Image check failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('retry-images')
  .description('Retry processing failed images')
  .action(async () => {
    try {
      await Commands.retryFailedImages();
    } catch (error: any) {
      Logger.error(`Image retry failed: ${error.message}`);
      process.exit(1);
    }
  });

// ===== COMANDOS DE ANÁLISIS =====

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

  program
  .command('export-shopify-test')
  .description('Export limited test products to Shopify CSV (for development/testing)')
  .action(async () => {
    try {
      await Commands.exportShopifyTest();
    } catch (error: any) {
      Logger.error(`Test export failed: ${error.message}`);
      process.exit(1);
    }
  });

// ===== AYUDA PERSONALIZADA =====

program.on('--help', () => {
  console.log('');
  Logger.info('📋 Available Commands:');
  console.log('');
  
  console.log('🔄 Migration:');
  Logger.info('  migrate          # Full migration pipeline (Artwork + WooCommerce → DB)');
  console.log('');
  
  console.log('📤 Export to Shopify:');
  Logger.info('  export-shopify   # Export CSV with Supabase images (recommended)');
  Logger.info('  export-csv       # Export CSV with original logic (legacy)');
  console.log('');
  
  console.log('🖼️  Image Management:');
  Logger.info('  check-images     # Check image processing status');
  Logger.info('  retry-images     # Retry failed image processing');
  console.log('');
  
  console.log('🔍 Data Analysis:');
  Logger.info('  preview          # Preview Artwork Archive CSV');
  Logger.info('  analyze          # Analyze data for potential issues');
  console.log('');
  
  Logger.info('📝 Usage Examples:');
  Logger.info('  $ npm run dev migrate           # Complete migration workflow');
  Logger.info('  $ npm run dev export-shopify    # Export optimized CSV for Shopify');
  Logger.info('  $ npm run dev check-images      # Check image processing status');
  Logger.info('  $ npm run dev retry-images      # Fix failed image processing');
  Logger.info('  $ npm run dev preview           # Quick data preview');
  Logger.info('  $ npm run dev analyze           # Analyze data quality');
  console.log('');
  
  Logger.info('🔧 Environment Variables Required:');
  Logger.info('  DATABASE_URL    - PostgreSQL connection string (Supabase)');
  Logger.info('  SUPABASE_URL    - Supabase project URL');
  Logger.info('  SUPABASE_KEY    - Supabase anon/public key');
  console.log('');
  
  Logger.info('💡 Recommended Workflow:');
  Logger.info('  1. npm run dev analyze          # Check your data quality');
  Logger.info('  2. npm run dev migrate          # Run the migration');
  Logger.info('  3. npm run dev check-images     # Verify image processing');
  Logger.info('  4. npm run dev export-shopify   # Generate Shopify CSV');
  Logger.info('  5. Import the CSV into Shopify  # Final step');
});

program.parse(process.argv);

// Mostrar ayuda si no se proporciona ningún comando
if (!process.argv.slice(2).length) {
  program.outputHelp();
}