import * as path from 'path';
import * as fs from 'fs';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { Logger } from '../utils/logger';
import { CsvHandler } from '../utils/csvHandler';
import { ArtworkToShopifyConverter } from '../converters/artwork';
import { WooCommerceToShopifyConverter } from '../converters/wooCommerce';
import { ShopifyProduct } from '../models/ShopifyProduct';
import { PrismaProductService } from '../services/PrismaProductService';
import { ImageProcessorService } from '../services/ImageProcessorService';
import {
  DuplicateDetectionService,
} from '../services/DuplicateDetectionService';
import {
  DuplicateResolutionService,
  DuplicateResolutionConfig
} from '../services/DuplicateResolutionService';
import { ArtworkArchiveRecord, DbConfig,
  DuplicateDetectionConfig,
  DuplicateMatch, ProcessedImage } from '../types';
import { extractDimensions, generateHtmlReport } from '../utils/report';
import { generateComparisonKeys, NormalizeUtils } from '../utils/normalizeFields';

export class Commands {
  private static prismaService: PrismaProductService;
  private static imageProcessor: ImageProcessorService;

  static async preview(): Promise<void> {
    Logger.header('Preview Artwork Archive Data');

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'inputFile',
        message: 'Enter the path to your Artwork Archive CSV file:',
        default: 'data/input/PiecesExport.csv',
        validate: (input) => {
          if (!fs.existsSync(input)) {
            return 'File not found. Please enter a valid file path.';
          }
          return true;
        }
      },
      {
        type: 'number',
        name: 'limit',
        message: 'How many records to preview?',
        default: 5
      }
    ]);

    try {
      const artworks = await CsvHandler.readCsv<ArtworkArchiveRecord>(answers.inputFile);
      const preview = artworks.slice(0, answers.limit);

      Logger.info(`Showing ${preview.length} of ${artworks.length} records:\n`);

      preview.forEach((artwork, index) => {
        console.log(chalk.cyan(`\nRecord ${index + 1}:`));
        console.log(`  Name: ${artwork.Name}`);
        console.log(`  Artist: ${artwork['Artist(s)']}`);
        console.log(`  Price: ${artwork.Price}`);
        console.log(`  Status: ${artwork.Status}`);
        console.log(`  Medium: ${artwork.Medium}`);
        console.log(`  Dimensions: ${artwork.Height} x ${artwork.Width} x ${artwork.Depth}`);
      });
    } catch (error: any) {
      Logger.error(`Preview failed: ${error.message}`);
    }
  }

  static async analyze(): Promise<void> {
    Logger.header('Analyze Artwork Archive Data');

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'inputFile',
        message: 'Enter the path to your Artwork Archive CSV file:',
        default: 'data/input/PiecesExport.csv',
        validate: (input) => {
          if (!fs.existsSync(input)) {
            return 'File not found. Please enter a valid file path.';
          }
          return true;
        }
      }
    ]);

    try {
      const artworks = await CsvHandler.readCsv<ArtworkArchiveRecord>(answers.inputFile);
     
      Logger.info(`Total records found: ${artworks.length}\n`);

      let activeCount = 0;
      let draftCount = 0;
      let noNameCount = 0;
      let noPriceCount = 0;
      let singleCharNameCount = 0;
      let notAvailableCount = 0;

      console.log(chalk.bold('Record Analysis:'));
      console.log(chalk.bold('================\n'));

      artworks.forEach((artwork, index) => {
        const issues: string[] = [];
        let willBeDraft = false;
       
        if (!artwork.Name || artwork.Name.trim() === '') {
          issues.push('Missing name');
          noNameCount++;
          willBeDraft = true;
        } else if (artwork.Name.length === 1) {
          issues.push(`Single character name: "${artwork.Name}"`);
          singleCharNameCount++;
          willBeDraft = true;
        }
       
        if (!artwork.Price || artwork.Price.trim() === '') {
          issues.push('Missing price');
          noPriceCount++;
          willBeDraft = true;
        }
       
        if (artwork.Status?.toLowerCase() !== 'available') {
          issues.push(`Status: ${artwork.Status || 'not set'}`);
          notAvailableCount++;
          willBeDraft = true;
        }

        if (willBeDraft) {
          draftCount++;
          console.log(chalk.yellow(`⚠ Record ${index + 1}: ${artwork.Name || 'NO NAME'} - Will be DRAFT: ${issues.join(', ')}`));
        } else {
          activeCount++;
          console.log(chalk.green(`✓ Record ${index + 1}: ${artwork.Name} - Will be ACTIVE`));
        }
      });

      console.log('\n' + chalk.bold('Migration Summary:'));
      console.log(chalk.bold('=================='));
      console.log(chalk.green(`Products that will be ACTIVE: ${activeCount}`));
      console.log(chalk.yellow(`Products that will be DRAFT: ${draftCount}`));
      console.log('\n' + chalk.bold('Issues breakdown:'));
      console.log(chalk.yellow(`  - Missing name: ${noNameCount}`));
      console.log(chalk.yellow(`  - Single character name: ${singleCharNameCount}`));
      console.log(chalk.yellow(`  - Missing price: ${noPriceCount}`));
      console.log(chalk.yellow(`  - Not available status: ${notAvailableCount}`));
      console.log('\n' + chalk.blue('Note: All records will be migrated to database. Products with issues will be marked as DRAFT.'));

    } catch (error: any) {
      Logger.error(`Analysis failed: ${error.message}`);
    }
  }

  static async migrate(): Promise<void> {
    Logger.header('Unified Migration Tool: Artwork Archive + WooCommerce to Database');

    try {
      // 1. Inicializar servicios
      await Commands.initializeServices();

      // 2. Recopilar configuración del usuario
      const config = await Commands.getMigrationConfig();
     
      // 3. Procesar productos de Artwork Archive
      const { artworkProducts, artworkRecords, artworkImages } = await Commands.processArtworkArchive(config.artworkFile);
     
      // 4. Procesar productos de WooCommerce (si está habilitado)
      const { wooProducts, wooRecords, wooImages } = await Commands.processWooCommerce(config);
     
      // 5. Detectar y resolver duplicados (si está habilitado)
      const { finalArtworkProducts, finalWooProducts } = await Commands.handleDuplicates(
        artworkProducts,
        wooProducts,
        config
      );
     
      // 6. Guardar en base de datos
      await Commands.saveToDatabase(
        artworkRecords, 
        finalArtworkProducts, 
        wooRecords, 
        finalWooProducts,
        artworkImages,
        wooImages
      );
     
      // 7. Generar reportes finales
      await Commands.generateFinalReport(config);
     
    } catch (error: any) {
      Logger.error(`Unified migration failed: ${error.message}`);
      console.error(error);
    } finally {
      await Commands.cleanup();
    }
  }

  static async exportCsv(): Promise<void> {
    Logger.header('Export Products to Shopify CSV');

    try {
      // Inicializar servicios
      await Commands.initializeServices();

      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'outputFile',
          message: 'Enter the output filename for Shopify CSV:',
          default: 'data/output/shopify_products_from_db.csv'
        }
      ]);

      Logger.info('Obteniendo productos de la base de datos...');
      const shopifyExportData = await Commands.prismaService.getProductsForShopifyExport();

      if (shopifyExportData.length === 0) {
        Logger.warning('No se encontraron productos en la base de datos.');
        return;
      }

      const outputDir = path.dirname(answers.outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = path.resolve(answers.outputFile);
      await CsvHandler.writeCsv(outputPath, shopifyExportData, ShopifyProduct.getHeaders());

      Logger.success(`CSV exportado exitosamente: ${outputPath}`);
      Logger.info(`Total productos exportados: ${shopifyExportData.length}`);

    } catch (error: any) {
      Logger.error(`Export failed: ${error.message}`);
    } finally {
      await Commands.cleanup();
    }
  }

  private static async initializeServices(): Promise<void> {
    try {
      // Inicializar servicio de base de datos
      Commands.prismaService = new PrismaProductService();
      await Commands.prismaService.initialize();

      // Inicializar procesador de imágenes
      Commands.imageProcessor = ImageProcessorService.createDefault();
      await Commands.imageProcessor.initialize();

      // Inicializar converters
      await ArtworkToShopifyConverter.initialize();
      await WooCommerceToShopifyConverter.initialize();

      Logger.success('Todos los servicios inicializados correctamente');
    } catch (error: any) {
      Logger.error(`Error inicializando servicios: ${error.message}`);
      throw error;
    }
  }

  private static async getMigrationConfig() {
    const dbConfig: DbConfig = {
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'root123',
      database: 'impulsog_store'
    };

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'artworkFile',
        message: 'Enter the path to your Artwork Archive CSV file:',
        default: 'data/input/PiecesExport.csv',
        validate: (input) => {
          if (!fs.existsSync(input)) {
            return 'File not found. Please enter a valid file path.';
          }
          return true;
        }
      },
      {
        type: 'confirm',
        name: 'includeWooCommerce',
        message: 'Do you want to include WooCommerce products?',
        default: true
      },
      {
        type: 'confirm',
        name: 'checkDuplicates',
        message: 'Do you want to check for duplicate products between sources?',
        default: true,
        when: (answers) => answers.includeWooCommerce
      },
      {
        type: 'list',
        name: 'duplicateStrategy',
        message: 'How do you want to handle duplicate products?',
        choices: [
          { name: 'Keep both versions (add suffix to WooCommerce products)', value: 'keepBoth' },
          { name: 'Prefer Artwork Archive version', value: 'preferArtwork' },
          { name: 'Prefer WooCommerce version', value: 'preferWoo' },
          { name: 'Ask for each duplicate', value: 'ask' }
        ],
        default: 'keepBoth',
        when: (answers) => answers.includeWooCommerce && answers.checkDuplicates
      },
      {
        type: 'list',
        name: 'matchingStrategy',
        message: 'Which duplicate detection strategy do you want to use?',
        choices: [
          { name: 'Exact title match (basic)', value: 'exactTitle' },
          { name: 'Normalized title match (handles special chars & case)', value: 'normalizedTitle' },
          { name: 'Advanced match (title + artist similarity)', value: 'advanced' },
          { name: 'Fuzzy match (detects similar titles)', value: 'fuzzy' }
        ],
        default: 'normalizedTitle',
        when: (answers) => answers.includeWooCommerce && answers.checkDuplicates
      },
      {
        type: 'number',
        name: 'similarityThreshold',
        message: 'For fuzzy matching, set similarity threshold (0.8 = 80% similar):',
        default: 0.8,
        when: (answers) => answers.matchingStrategy === 'fuzzy'
      }
    ]);

    return { ...answers, dbConfig };
  }

  private static async processArtworkArchive(artworkFile: string): Promise<{
    artworkProducts: ShopifyProduct[];
    artworkRecords: ArtworkArchiveRecord[];
    artworkImages: Map<string, ProcessedImage>;
  }> {
    Logger.info('Reading Artwork Archive CSV...');
    const artworks = await CsvHandler.readCsv<ArtworkArchiveRecord>(artworkFile);
   
    Logger.info('Converting Artwork Archive data to Shopify format with image processing...');
    const artworkProducts = await ArtworkToShopifyConverter.convertArtworkToShopify(artworks);
   
    // Crear mapa de imágenes procesadas (esto se maneja dentro del converter ahora)
    const artworkImages = new Map<string, ProcessedImage>();
   
    Logger.success(`Successfully converted ${artworkProducts.length} Artwork Archive products`);
    return { artworkProducts, artworkRecords: artworks, artworkImages };
  }

  private static async processWooCommerce(config: any): Promise<{
    wooProducts: ShopifyProduct[];
    wooRecords: any[];
    wooImages: Map<string, ProcessedImage>;
  }> {
    if (!config.includeWooCommerce) {
      return { wooProducts: [], wooRecords: [], wooImages: new Map() };
    }

    try {
      Logger.info(`Connecting to MySQL database (${config.dbConfig.host}:${config.dbConfig.port}, DB: ${config.dbConfig.database})...`);
     
      const wooCommerceData = await WooCommerceToShopifyConverter.getWooCommerceProducts(config.dbConfig);
     
      if (wooCommerceData.length === 0) {
        Logger.warning('No products were found in WooCommerce, continuing with only Artwork Archive products.');
        return { wooProducts: [], wooRecords: [], wooImages: new Map() };
      }

      Logger.info('Converting WooCommerce data to Shopify format with image processing...');
      const wooProducts = await WooCommerceToShopifyConverter.convertToShopify(wooCommerceData);
      Logger.success(`Successfully converted ${wooProducts.length} WooCommerce products`);
     
      // Crear mapa de imágenes procesadas (esto se maneja dentro del converter ahora)
      const wooImages = new Map<string, ProcessedImage>();
      
      return { wooProducts, wooRecords: wooCommerceData, wooImages };
    } catch (wooError: any) {
      Logger.error(`Error processing WooCommerce data: ${wooError.message}`);
      Logger.warning('Continuing with only Artwork Archive products');
      return { wooProducts: [], wooRecords: [], wooImages: new Map() };
    }
  }

  private static async handleDuplicates(
    artworkProducts: ShopifyProduct[],
    wooProducts: ShopifyProduct[],
    config: any
  ): Promise<{ finalArtworkProducts: ShopifyProduct[], finalWooProducts: ShopifyProduct[] }> {
   
    if (!config.includeWooCommerce || !config.checkDuplicates || wooProducts.length === 0) {
      return { finalArtworkProducts: artworkProducts, finalWooProducts: wooProducts };
    }

    Logger.info('Checking for duplicate products between Artwork Archive and WooCommerce...');
   
    // Configurar el servicio de detección de duplicados
    const detectionConfig: DuplicateDetectionConfig = {
      matchingStrategy: config.matchingStrategy,
      similarityThreshold: config.similarityThreshold
    };

    const detectionService = new DuplicateDetectionService(
      detectionConfig,
      extractDimensions,
      generateComparisonKeys,
      NormalizeUtils
    );

    // Detectar duplicados
    const duplicates = detectionService.detectDuplicates(artworkProducts, wooProducts);

    if (duplicates.length === 0) {
      Logger.success('No duplicate products found between Artwork Archive and WooCommerce.');
      return { finalArtworkProducts: artworkProducts, finalWooProducts: wooProducts };
    }

    // Configurar el servicio de resolución de duplicados
    const resolutionConfig: DuplicateResolutionConfig = {
      strategy: config.duplicateStrategy,
      onManualChoice: config.duplicateStrategy === 'ask' ? this.createManualChoiceHandler() : undefined
    };

    const resolutionService = new DuplicateResolutionService(Logger);

    // Resolver duplicados
    const result = await resolutionService.resolveDuplicates(
      duplicates,
      artworkProducts,
      wooProducts,
      resolutionConfig
    );

    // Los duplicados se guardarán en la base de datos más adelante
    Logger.info(`Duplicates resolved using strategy: ${config.duplicateStrategy}`);

    return {
      finalArtworkProducts: result.artworkProducts,
      finalWooProducts: result.wooProducts
    };
  }

  private static createManualChoiceHandler() {
    return async (duplicate: DuplicateMatch): Promise<'artwork' | 'woo' | 'both'> => {
      const dupeChoice = await inquirer.prompt([
        {
          type: 'list',
          name: 'preference',
          message: `Choose which version to keep for "${duplicate.title}" (${duplicate.matchType}):`,
          choices: [
            {
              name: `Artwork Archive (SKU: ${duplicate.artworkSKU}, Price: ${duplicate.artworkPrice}, Artist: ${duplicate.artworkArtist})`,
              value: 'artwork'
            },
            {
              name: `WooCommerce (SKU: ${duplicate.wooSKU}, Price: ${duplicate.wooPrice}, Artist: ${duplicate.wooArtist})`,
              value: 'woo'
            },
            {
              name: 'Keep both versions',
              value: 'both'
            }
          ]
        }
      ]);
     
      return dupeChoice.preference;
    };
  }

  private static async saveToDatabase(
    artworkRecords: ArtworkArchiveRecord[],
    artworkProducts: ShopifyProduct[],
    wooRecords: any[],
    wooProducts: ShopifyProduct[],
    artworkImages: Map<string, ProcessedImage>,
    wooImages: Map<string, ProcessedImage>
  ): Promise<void> {
    Logger.info('Saving products to database...');

    try {
      // Guardar productos de Artwork Archive
      if (artworkRecords.length > 0) {
        Logger.info(`Saving ${artworkRecords.length} Artwork Archive products...`);
        await Commands.prismaService.saveArtworkProducts(artworkRecords, artworkProducts, artworkImages);
        Logger.success('Artwork Archive products saved to database');
      }

      // Guardar productos de WooCommerce
      if (wooRecords.length > 0) {
        Logger.info(`Saving ${wooRecords.length} WooCommerce products...`);
        await Commands.prismaService.saveWooCommerceProducts(wooRecords, wooProducts, wooImages);
        Logger.success('WooCommerce products saved to database');
      }

      Logger.success('All products successfully saved to database');
    } catch (error: any) {
      Logger.error(`Error saving to database: ${error.message}`);
      throw error;
    }
  }

  private static async generateFinalReport(config: any): Promise<void> {
    try {
      Logger.info('Generating final migration report...');
      
      const allProducts = await Commands.prismaService.getAllProducts();
      
      const artworkProducts = allProducts.filter(p => p.sourceType === 'ARTWORK_ARCHIVE');
      const wooProducts = allProducts.filter(p => p.sourceType === 'WOOCOMMERCE');
      
      const activeArtworkProducts = artworkProducts.filter(p => p.status === 'ACTIVE');
      const draftArtworkProducts = artworkProducts.filter(p => p.status === 'DRAFT');
      const activeWooProducts = wooProducts.filter(p => p.status === 'ACTIVE');
      const draftWooProducts = wooProducts.filter(p => p.status === 'DRAFT');
      
      const totalImages = allProducts.reduce((sum, product) => {
        if (Array.isArray((product as any).images)) {
          return sum + (product as any).images.length;
        }
        return sum;
      }, 0);
      
      console.log('\n' + chalk.bold('Migration Summary:'));
      console.log(chalk.bold('=================='));
      console.log(chalk.cyan('Artwork Archive products:'));
      console.log(`  - Total: ${artworkProducts.length}`);
      console.log(chalk.green(`  - Active: ${activeArtworkProducts.length}`));
      console.log(chalk.yellow(`  - Draft: ${draftArtworkProducts.length}`));
     
      if (config.includeWooCommerce) {
        console.log(chalk.cyan('\nWooCommerce products:'));
        console.log(`  - Total: ${wooProducts.length}`);
        console.log(chalk.green(`  - Active: ${activeWooProducts.length}`));
        console.log(chalk.yellow(`  - Draft: ${draftWooProducts.length}`));
      }
     
      console.log(chalk.cyan('\nCombined totals:'));
      console.log(`  - Total products: ${allProducts.length}`);
      console.log(chalk.green(`  - Total active products: ${activeArtworkProducts.length + activeWooProducts.length}`));
      console.log(chalk.yellow(`  - Total draft products: ${draftArtworkProducts.length + draftWooProducts.length}`));
      console.log(chalk.blue(`  - Total processed images: ${totalImages}`));
     
      console.log('\n' + chalk.cyan('Next steps:'));
      console.log('1. Run "npm run export-csv" to generate Shopify CSV from database');
      console.log('2. Review the CSV file before importing to Shopify');
      console.log('3. Import the CSV file in your Shopify admin');
      console.log('4. Check product details and images after import');
      console.log('5. Publish draft products when ready');
      
      Logger.success('Migration completed successfully!');
      
    } catch (error: any) {
      Logger.error(`Error generating final report: ${error.message}`);
    }
  }

  private static async cleanup(): Promise<void> {
    try {
      if (Commands.prismaService) {
        await Commands.prismaService.disconnect();
      }
      
      if (Commands.imageProcessor) {
        await Commands.imageProcessor.cleanup();
      }
      
      await ArtworkToShopifyConverter.cleanup();
      await WooCommerceToShopifyConverter.cleanup();
      
      Logger.info('Cleanup completed');
    } catch (error: any) {
      Logger.warning('Error during cleanup');
    }
  }
}