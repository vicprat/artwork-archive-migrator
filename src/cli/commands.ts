
import * as path from 'path';
import * as fs from 'fs';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { Logger } from '../utils/logger';
import { CsvHandler } from '../utils/csvHandler';
import { ArtworkToShopifyConverter } from '../converters/artwork';
import { WooCommerceToShopifyConverter } from '../converters/wooCommerce';
import { ShopifyProduct } from '../models/ShopifyProduct';
import { 
  DuplicateDetectionService,
} from '../services/DuplicateDetectionService';
import { 
  DuplicateResolutionService,
  DuplicateResolutionConfig
} from '../services/DuplicateResolutionService';
import { ArtworkArchiveRecord, DbConfig, 
  DuplicateDetectionConfig,
  DuplicateMatch } from '../types';
import { extractDimensions, generateHtmlReport } from '../utils/report';
import { generateComparisonKeys, NormalizeUtils } from '../utils/normalizeFields';

export class Commands {
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
      console.log('\n' + chalk.blue('Note: All records will be migrated. Products with issues will be marked as DRAFT.'));

    } catch (error: any) {
      Logger.error(`Analysis failed: ${error.message}`);
    }
  }

  static async migrate(): Promise<void> {
    Logger.header('Unified Migration Tool: Artwork Archive + WooCommerce to Shopify');

    try {
      // 1. Recopilar configuración del usuario
      const config = await Commands.getMigrationConfig();
      
      // 2. Procesar productos de Artwork Archive
      const artworkProducts = await Commands.processArtworkArchive(config.artworkFile);
      
      // 3. Procesar productos de WooCommerce (si está habilitado)
      const wooProducts = await Commands.processWooCommerce(config);
      
      // 4. Detectar y resolver duplicados (si está habilitado)
      const { finalArtworkProducts, finalWooProducts } = await Commands.handleDuplicates(
        artworkProducts, 
        wooProducts, 
        config
      );
      
      // 5. Combinar y guardar resultados
      await Commands.saveResults(finalArtworkProducts, finalWooProducts, config.outputFile);
      
      // 6. Generar reportes finales
      Commands.generateFinalReport(finalArtworkProducts, finalWooProducts, config);
      
    } catch (error: any) {
      Logger.error(`Unified migration failed: ${error.message}`);
      console.error(error);
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
        type: 'input',
        name: 'outputFile',
        message: 'Enter the output filename for Shopify CSV:',
        default: 'data/output/shopify_products.csv'
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

  private static async processArtworkArchive(artworkFile: string): Promise<ShopifyProduct[]> {
    Logger.info('Reading Artwork Archive CSV...');
    const artworks = await CsvHandler.readCsv<ArtworkArchiveRecord>(artworkFile);
    
    Logger.info('Converting Artwork Archive data to Shopify format...');
    const artworkProducts = ArtworkToShopifyConverter.convertArtworkToShopify(artworks);
    
    Logger.success(`Successfully converted ${artworkProducts.length} Artwork Archive products`);
    return artworkProducts;
  }

  private static async processWooCommerce(config: any): Promise<ShopifyProduct[]> {
    if (!config.includeWooCommerce) {
      return [];
    }

    try {
      Logger.info(`Connecting to MySQL database (${config.dbConfig.host}:${config.dbConfig.port}, DB: ${config.dbConfig.database})...`);
      
      const wooCommerceData = await WooCommerceToShopifyConverter.getWooCommerceProducts(config.dbConfig);
      
      if (wooCommerceData.length === 0) {
        Logger.warning('No products were found in WooCommerce, continuing with only Artwork Archive products.');
        return [];
      }

      Logger.info('Converting WooCommerce data to Shopify format...');
      const wooProducts = WooCommerceToShopifyConverter.convertToShopify(wooCommerceData);
      Logger.success(`Successfully converted ${wooProducts.length} WooCommerce products`);
      
      return wooProducts;
    } catch (wooError: any) {
      Logger.error(`Error processing WooCommerce data: ${wooError.message}`);
      Logger.warning('Continuing with only Artwork Archive products');
      return [];
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

    // Generar reporte de duplicados
    await Commands.generateDuplicateReport(duplicates, config, {
      finalArtworkProducts: result.artworkProducts,
      finalWooProducts: result.wooProducts
    });

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

  private static async generateDuplicateReport(
    duplicates: DuplicateMatch[], 
    config: any, 
    result: { finalArtworkProducts: ShopifyProduct[], finalWooProducts: ShopifyProduct[] }
  ): Promise<void> {
    if (duplicates.length === 0) return;

    // Recopilar insights sobre los duplicados
    const genericTitleCount = duplicates.filter(d => 
      NormalizeUtils.normalizeTitle(d.title) === 'untitled'
    ).length;
    
    const priceDifferences = duplicates.map(d => {
      const price1 = parseFloat(d.artworkPrice);
      const price2 = parseFloat(d.wooPrice);
      return {
        title: d.title,
        difference: Math.abs(price1 - price2),
        percentDifference: Math.abs((price1 - price2) / ((price1 + price2) / 2)) * 100
      };
    });
    
    const bigPriceDiffs = priceDifferences.filter(d => d.difference > 100);
    const artistMismatches = duplicates.filter(d => 
      NormalizeUtils.normalizeArtist(d.artworkArtist) !== NormalizeUtils.normalizeArtist(d.wooArtist)
    );
    
    const reportData = {
      summary: {
        totalDuplicates: duplicates.length,
        resolutionStrategy: config.duplicateStrategy,
        matchingStrategy: config.matchingStrategy,
        date: new Date().toISOString(),
        artworkProductsCount: result.finalArtworkProducts.filter(p => p.getStatus() !== undefined).length,
        wooProductsCount: result.finalWooProducts.filter(p => p.getTitle() !== '').length,
        similarityThreshold: config.similarityThreshold || 'N/A'
      },

      duplicates: duplicates.map(dupe => ({
        ...dupe,
        normalizedTitle: NormalizeUtils.normalizeTitle(dupe.title),
        normalizedArtworkArtist: NormalizeUtils.normalizeArtist(dupe.artworkArtist),
        normalizedWooArtist: NormalizeUtils.normalizeArtist(dupe.wooArtist),
        priceDifference: Math.abs(parseFloat(dupe.artworkPrice) - parseFloat(dupe.wooPrice)).toFixed(2),
        percentPriceDifference: (Math.abs(parseFloat(dupe.artworkPrice) - parseFloat(dupe.wooPrice)) / 
          ((parseFloat(dupe.artworkPrice) + parseFloat(dupe.wooPrice)) / 2) * 100).toFixed(1),
        sameArtist: NormalizeUtils.normalizeArtist(dupe.artworkArtist) === 
          NormalizeUtils.normalizeArtist(dupe.wooArtist),
        sameDimensions: NormalizeUtils.normalizeDimensions(dupe.dimensions.artwork) === 
          NormalizeUtils.normalizeDimensions(dupe.dimensions.woo) && 
          dupe.dimensions.artwork !== '',
        resolution: config.duplicateStrategy === 'ask' ? 'manual' : config.duplicateStrategy
      })),

      stats: {
        genericTitles: {
          count: genericTitleCount,
          percentage: (genericTitleCount / duplicates.length * 100).toFixed(1)
        },
        priceDifferences: {
          significantCount: bigPriceDiffs.length,
          significantPercentage: (bigPriceDiffs.length / duplicates.length * 100).toFixed(1),
          averageDifference: (priceDifferences.reduce((sum, d) => sum + d.difference, 0) / 
            priceDifferences.length).toFixed(2),
          maxDifference: Math.max(...priceDifferences.map(d => d.difference)).toFixed(2)
        },
        artistMismatches: {
          count: artistMismatches.length,
          percentage: (artistMismatches.length / duplicates.length * 100).toFixed(1)
        }
      }
    };
    
    // Guardar reporte JSON
    const duplicatesReportPath = path.resolve(path.dirname(config.outputFile), 'duplicate_products_report.json');
    fs.writeFileSync(duplicatesReportPath, JSON.stringify(reportData, null, 2));
    Logger.info(`Detailed duplicate products report saved to: ${duplicatesReportPath}`);
    
    // Guardar reporte HTML
    const htmlReportPath = path.resolve(path.dirname(config.outputFile), 'duplicate_products_report.html');
    const htmlContent = generateHtmlReport({
      ...reportData,
      genericTitleStats: {
        sinTitulo: duplicates.filter(d => 
          d.title.toLowerCase().trim() === 'sin título' || 
          d.title.toLowerCase().trim() === 'sin titulo'
        ).length,
        st: duplicates.filter(d => 
          d.title.toLowerCase().trim() === 's/t'
        ).length
      }
    });
    fs.writeFileSync(htmlReportPath, htmlContent);
    Logger.info(`HTML duplicate products report saved to: ${htmlReportPath}`);
  }

  private static async saveResults(
    artworkProducts: ShopifyProduct[], 
    wooProducts: ShopifyProduct[], 
    outputFile: string
  ): Promise<void> {
    const allShopifyProducts = [...artworkProducts, ...wooProducts];

    if (allShopifyProducts.length === 0) {
      Logger.warning('No products were converted. Please check your input sources.');
      return;
    }

    // Convertir ShopifyProduct objetos a records
    const productRecords = allShopifyProducts.map(product => product.toRecord());

    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.resolve(outputFile);
    await CsvHandler.writeCsv(outputPath, productRecords, ShopifyProduct.getHeaders());

    Logger.success(`Migration complete! Output saved to: ${outputPath}`);
    Logger.info(`Total products migrated: ${allShopifyProducts.length}`);
  }

  private static generateFinalReport(
    artworkProducts: ShopifyProduct[], 
    wooProducts: ShopifyProduct[], 
    config: any
  ): void {
    const mainArtworkProducts = artworkProducts.filter(p => p.getStatus() !== undefined);
    const mainWooProducts = wooProducts.filter(p => p.getTitle() !== '');
    const activeArtworkProducts = mainArtworkProducts.filter(p => p.getStatus() === 'active');
    const draftArtworkProducts = mainArtworkProducts.filter(p => p.getStatus() === 'draft');
    const activeWooProducts = mainWooProducts.filter(p => p.getStatus() === 'active');
    const draftWooProducts = mainWooProducts.filter(p => p.getStatus() === 'draft');
    const wooImagesCount = config.includeWooCommerce ? (wooProducts.length - mainWooProducts.length) : 0;
    const allProducts = [...artworkProducts, ...wooProducts];
    const priceZeroProducts = allProducts.filter(p => p.getPrice() === '0.00');

    console.log('\n' + chalk.bold('Migration Summary:'));
    console.log(chalk.bold('=================='));
    console.log(chalk.cyan('Artwork Archive products:'));
    console.log(`  - Total: ${mainArtworkProducts.length}`);
    console.log(chalk.green(`  - Active: ${activeArtworkProducts.length}`));
    console.log(chalk.yellow(`  - Draft: ${draftArtworkProducts.length}`));
    
    if (config.includeWooCommerce) {
      console.log(chalk.cyan('\nWooCommerce products:'));
      console.log(`  - Total: ${mainWooProducts.length}`);
      console.log(chalk.green(`  - Active: ${activeWooProducts.length}`));
      console.log(chalk.yellow(`  - Draft: ${draftWooProducts.length}`));
      console.log(chalk.blue(`  - Additional product images: ${wooImagesCount}`));
    }
    
    console.log(chalk.cyan('\nCombined totals:'));
    console.log(`  - Total main products: ${mainArtworkProducts.length + mainWooProducts.length}`);
    console.log(chalk.green(`  - Total active products: ${activeArtworkProducts.length + activeWooProducts.length}`));
    console.log(chalk.yellow(`  - Total draft products: ${draftArtworkProducts.length + draftWooProducts.length}`));
    
    if (priceZeroProducts.length > 0) {
      console.log(chalk.blue(`\nProducts with price $0 (price on request): ${priceZeroProducts.length}`));
    }
    
    console.log('\n' + chalk.cyan('Next steps:'));
    console.log('1. Review the unified Shopify CSV file before importing');
    console.log('2. Update any missing information (names, prices, etc.)');
    console.log('3. Import the CSV file in your Shopify admin');
    console.log('4. Check product details and images after import');
    console.log('5. Publish draft products when ready');
  }
}