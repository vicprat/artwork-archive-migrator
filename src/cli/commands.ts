import * as path from 'path';
import * as fs from 'fs';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { Logger } from '../utils/logger';
import { CsvHandler } from '../utils/csvHandler';
import { ArtworkToShopifyConverter } from '../converters/artwork';
import { WooCommerceToShopifyConverter } from '../converters/wooCommerce';
import { ArtworkArchiveRecord, DbConfig } from '../types';

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
      }
    ]);

    try {
      let allShopifyProducts: any[] = [];
      let artworkProducts: any[] = [];
      let wooProducts: any[] = [];
      let duplicateProducts: any[] = [];

      Logger.info('Reading Artwork Archive CSV...');
      const artworks = await CsvHandler.readCsv<ArtworkArchiveRecord>(answers.artworkFile);
      
      Logger.info('Converting Artwork Archive data to Shopify format...');
      artworkProducts = ArtworkToShopifyConverter.convertArtworkToShopify(artworks);
      
      Logger.success(`Successfully converted ${artworkProducts.length} Artwork Archive products`);

      if (answers.includeWooCommerce) {
        Logger.info(`Connecting to MySQL database (${dbConfig.host}:${dbConfig.port}, DB: ${dbConfig.database})...`);
        
        try {
          const wooCommerceData = await WooCommerceToShopifyConverter.getWooCommerceProducts(dbConfig);
          
          if (wooCommerceData.length === 0) {
            Logger.warning('No products were found in WooCommerce, continuing with only Artwork Archive products.');
          } else {
            Logger.info('Converting WooCommerce data to Shopify format...');
            wooProducts = WooCommerceToShopifyConverter.convertToShopify(wooCommerceData);
            Logger.success(`Successfully converted ${wooProducts.length} WooCommerce products`);
            
            if (answers.checkDuplicates) {
              Logger.info('Checking for duplicate products between Artwork Archive and WooCommerce...');
              
              const artworkProductMap = new Map();
              const mainArtworkProducts = artworkProducts.filter(p => p.Status !== undefined);
              
              mainArtworkProducts.forEach(product => {
                if (product.Title) {
                  const normalizedTitle = product.Title.toLowerCase().trim();
                  artworkProductMap.set(normalizedTitle, product);
                }
              });
              
               const mainWooProducts = wooProducts.filter(p => p.Title !== '');
              let duplicatesCount = 0;
              
              for (const wooProduct of mainWooProducts) {
                if (wooProduct.Title) {
                  const normalizedTitle = wooProduct.Title.toLowerCase().trim();
                  
                  if (artworkProductMap.has(normalizedTitle)) {
                    duplicatesCount++;
                    const artworkProduct = artworkProductMap.get(normalizedTitle);
                    
                    duplicateProducts.push({
                      title: wooProduct.Title,
                      artworkSKU: artworkProduct['Variant SKU'],
                      wooSKU: wooProduct['Variant SKU'],
                      artworkPrice: artworkProduct['Variant Price'],
                      wooPrice: wooProduct['Variant Price'],
                      artworkStatus: artworkProduct.Status,
                      wooStatus: wooProduct.Status,
                      artworkArtist: artworkProduct.Vendor || 'N/A',
                      wooArtist: wooProduct.Vendor || 'N/A',
                      dimensions: {
                        artwork: Commands.extractDimensions(artworkProduct['Body (HTML)'] || ''),
                        woo: Commands.extractDimensions(wooProduct['Body (HTML)'] || '')
                      },
                      matchType: 'title'
                    });
                  }
                }
              }
              
              if (duplicatesCount > 0) {
                Logger.warning(`Found ${duplicatesCount} duplicate products between Artwork Archive and WooCommerce`);
                
                console.log('\n' + chalk.yellow.bold('Duplicate Products:'));
                console.log(chalk.yellow.bold('==================='));
                
                duplicateProducts.forEach((dupe, index) => {
                  console.log(chalk.cyan(`\n${index + 1}. ${dupe.title}`));
                  console.log(`   Artwork Archive: SKU: ${dupe.artworkSKU}, Price: ${dupe.artworkPrice}, Status: ${dupe.artworkStatus}`);
                  console.log(`   WooCommerce:     SKU: ${dupe.wooSKU}, Price: ${dupe.wooPrice}, Status: ${dupe.wooStatus}`);
                });
                
                if (answers.duplicateStrategy === 'keepBoth') {
                  Logger.info('Keeping both versions of duplicate products (adding suffix to WooCommerce products)');
                  
                  for (const wooProduct of mainWooProducts) {
                    if (wooProduct.Title) {
                      const normalizedTitle = wooProduct.Title.toLowerCase().trim();
                      
                      if (artworkProductMap.has(normalizedTitle)) {
                        const oldTitle = wooProduct.Title;
                        wooProduct.Title = `${wooProduct.Title} (WooCommerce)`;
                        wooProduct.Handle = `${wooProduct.Handle}-woo`;
                        
                        const relatedImages = wooProducts.filter(p => 
                          p.Title === '' && 
                          p.Handle === oldTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
                        );
                        
                        relatedImages.forEach(img => {
                          img.Handle = wooProduct.Handle;
                        });
                        
                        Logger.info(`Renamed "${oldTitle}" to "${wooProduct.Title}"`);
                      }
                    }
                  }
                } else if (answers.duplicateStrategy === 'preferArtwork') {
                  Logger.info('Using Artwork Archive version for duplicate products');
                  
                   const filteredWooProducts = wooProducts.filter(p => {
                    if (!p.Title) return true; 
                    const normalizedTitle = p.Title.toLowerCase().trim();
                    return !artworkProductMap.has(normalizedTitle);
                  });
                  
                  Logger.info(`Removed ${wooProducts.length - filteredWooProducts.length} duplicate WooCommerce products`);
                  wooProducts = filteredWooProducts;
                } else if (answers.duplicateStrategy === 'preferWoo') {
                  Logger.info('Using WooCommerce version for duplicate products');
                  
                  const wooProductMap = new Map();
                  mainWooProducts.forEach(product => {
                    if (product.Title) {
                      const normalizedTitle = product.Title.toLowerCase().trim();
                      wooProductMap.set(normalizedTitle, product);
                    }
                  });
                  
                   const filteredArtworkProducts = artworkProducts.filter(p => {
                    if (!p.Title) return true;
                    
                    const normalizedTitle = p.Title.toLowerCase().trim();
                    return !wooProductMap.has(normalizedTitle);
                  });
                  
                  Logger.info(`Removed ${artworkProducts.length - filteredArtworkProducts.length} duplicate Artwork Archive products`);
                  artworkProducts = filteredArtworkProducts;
                } else if (answers.duplicateStrategy === 'ask') {
                  Logger.info('Asking for each duplicate product...');
                  
                   const toRemoveFromWoo = new Set();
                  const toRemoveFromArtwork = new Set();
                  
                  for (const dupe of duplicateProducts) {
                    const dupeChoice = await inquirer.prompt([
                      {
                        type: 'list',
                        name: 'preference',
                        message: `Choose which version to keep for "${dupe.title}":`,
                        choices: [
                          { name: `Artwork Archive (SKU: ${dupe.artworkSKU}, Price: ${dupe.artworkPrice})`, value: 'artwork' },
                          { name: `WooCommerce (SKU: ${dupe.wooSKU}, Price: ${dupe.wooPrice})`, value: 'woo' },
                          { name: 'Keep both versions', value: 'both' }
                        ]
                      }
                    ]);
                    
                    if (dupeChoice.preference === 'artwork') {
                      toRemoveFromWoo.add(dupe.title.toLowerCase().trim());
                    } else if (dupeChoice.preference === 'woo') {
                      toRemoveFromArtwork.add(dupe.title.toLowerCase().trim());
                    } else if (dupeChoice.preference === 'both') {
                       for (const wooProduct of mainWooProducts) {
                        if (wooProduct.Title && wooProduct.Title.toLowerCase().trim() === dupe.title.toLowerCase().trim()) {
                          const oldTitle = wooProduct.Title;
                          wooProduct.Title = `${wooProduct.Title} (WooCommerce)`;
                          wooProduct.Handle = `${wooProduct.Handle}-woo`;
                    
                          const relatedImages = wooProducts.filter(p => 
                            p.Title === '' && 
                            p.Handle === oldTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
                          );
                          
                          relatedImages.forEach(img => {
                            img.Handle = wooProduct.Handle;
                          });
                          
                          Logger.info(`Renamed "${oldTitle}" to "${wooProduct.Title}"`);
                          break;
                        }
                      }
                    }
                  }
                  
                  if (toRemoveFromWoo.size > 0) {
                    wooProducts = wooProducts.filter(p => {
                      if (!p.Title) return true;
                      return !toRemoveFromWoo.has(p.Title.toLowerCase().trim());
                    });
                    Logger.info(`Removed ${toRemoveFromWoo.size} WooCommerce products based on your choices`);
                  }
                  
                  if (toRemoveFromArtwork.size > 0) {
                    artworkProducts = artworkProducts.filter(p => {
                      if (!p.Title) return true;
                      return !toRemoveFromArtwork.has(p.Title.toLowerCase().trim());
                    });
                    Logger.info(`Removed ${toRemoveFromArtwork.size} Artwork Archive products based on your choices`);
                  }
                }
              } else {
                Logger.success('No duplicate products found between Artwork Archive and WooCommerce.');
              }
            }
          }
        } catch (wooError: any) {
          Logger.error(`Error processing WooCommerce data: ${wooError.message}`);
          Logger.warning('Continuing with only Artwork Archive products');
        }
      }
      
      allShopifyProducts = [...artworkProducts, ...wooProducts];

      if (allShopifyProducts.length === 0) {
        Logger.warning('No products were converted. Please check your input sources.');
        return;
      }

      const shopifyHeaders = [
        'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags', 
        'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 
        'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Grams', 
        'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy', 
        'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price', 
        'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode', 'Image Src', 
        'Image Position', 'Image Alt Text', 'Gift Card', 'SEO Title', 'SEO Description', 
        'Google Shopping / Google Product Category', 'Google Shopping / Gender', 
        'Google Shopping / Age Group', 'Google Shopping / MPN', 'Google Shopping / Condition', 
        'Google Shopping / Custom Product', 'Variant Image', 'Variant Weight Unit', 
        'Variant Tax Code', 'Cost per item', 'Included / United States', 
        'Price / United States', 'Compare At Price / United States', 
        'Included / International', 'Price / International', 
        'Compare At Price / International', 'Status'
      ];

      const outputDir = path.dirname(answers.outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = path.resolve(answers.outputFile);
      await CsvHandler.writeCsv(outputPath, allShopifyProducts, shopifyHeaders);

      Logger.success(`Migration complete! Output saved to: ${outputPath}`);
      Logger.info(`Total products migrated: ${allShopifyProducts.length}`);
      
      const mainArtworkProducts = artworkProducts.filter(p => p.Status !== undefined);
      const mainWooProducts = wooProducts.filter(p => p.Title !== '');
      const activeArtworkProducts = mainArtworkProducts.filter(p => p.Status === 'active');
      const draftArtworkProducts = mainArtworkProducts.filter(p => p.Status === 'draft');
      const activeWooProducts = mainWooProducts.filter(p => p.Status === 'active');
      const draftWooProducts = mainWooProducts.filter(p => p.Status === 'draft');
      const wooImagesCount = answers.includeWooCommerce ? (wooProducts.length - mainWooProducts.length) : 0;
      const priceZeroProducts = allShopifyProducts.filter(p => p['Variant Price'] === '0.00');

      console.log('\n' + chalk.bold('Migration Summary:'));
      console.log(chalk.bold('=================='));
      console.log(chalk.cyan('Artwork Archive products:'));
      console.log(`  - Total: ${mainArtworkProducts.length}`);
      console.log(chalk.green(`  - Active: ${activeArtworkProducts.length}`));
      console.log(chalk.yellow(`  - Draft: ${draftArtworkProducts.length}`));
      
      if (answers.includeWooCommerce) {
        console.log(chalk.cyan('\nWooCommerce products:'));
        console.log(`  - Total: ${mainWooProducts.length}`);
        console.log(chalk.green(`  - Active: ${activeWooProducts.length}`));
        console.log(chalk.yellow(`  - Draft: ${draftWooProducts.length}`));
        console.log(chalk.blue(`  - Additional product images: ${wooImagesCount}`));
        
        if (answers.checkDuplicates && duplicateProducts.length > 0) {
          console.log(chalk.magenta(`\nDuplicate products detected: ${duplicateProducts.length}`));
          console.log(chalk.magenta(`  - Resolution strategy: ${answers.duplicateStrategy}`));
        }
      }
      
      console.log(chalk.cyan('\nCombined totals:'));
      console.log(`  - Total main products: ${mainArtworkProducts.length + mainWooProducts.length}`);
      console.log(chalk.green(`  - Total active products: ${activeArtworkProducts.length + activeWooProducts.length}`));
      console.log(chalk.yellow(`  - Total draft products: ${draftArtworkProducts.length + draftWooProducts.length}`));
      
      if (priceZeroProducts.length > 0) {
        console.log(chalk.blue(`\nProducts with price $0 (price on request): ${priceZeroProducts.length}`));
      }
      
      if (answers.checkDuplicates && duplicateProducts.length > 0) {
        const reportData = {
          summary: {
            totalDuplicates: duplicateProducts.length,
            resolutionStrategy: answers.duplicateStrategy,
            date: new Date().toISOString(),
            artworkProductsCount: mainArtworkProducts.length,
            wooProductsCount: mainWooProducts.length
          },
          duplicates: duplicateProducts.map(dupe => ({
            ...dupe,
            priceDifference: Math.abs(parseFloat(dupe.artworkPrice) - parseFloat(dupe.wooPrice)).toFixed(2),
            sameArtist: (dupe.artworkArtist && dupe.wooArtist) ? 
              dupe.artworkArtist.toLowerCase().trim() === dupe.wooArtist.toLowerCase().trim() : false,
            sameDimensions: dupe.dimensions.artwork === dupe.dimensions.woo && dupe.dimensions.artwork !== '',
            resolution: answers.duplicateStrategy === 'ask' ? 'manual' : answers.duplicateStrategy
          })),
          genericTitleStats: {
            sinTitulo: duplicateProducts.filter(d => 
              d.title.toLowerCase().trim() === 'sin título' || 
              d.title.toLowerCase().trim() === 'sin titulo'
            ).length,
            st: duplicateProducts.filter(d => 
              d.title.toLowerCase().trim() === 's/t'
            ).length
          }
        };
        
        const duplicatesReportPath = path.resolve(path.dirname(answers.outputFile), 'duplicate_products_report.json');
        fs.writeFileSync(duplicatesReportPath, JSON.stringify(reportData, null, 2));
        Logger.info(`Detailed duplicate products report saved to: ${duplicatesReportPath}`);
        
        const htmlReportPath = path.resolve(path.dirname(answers.outputFile), 'duplicate_products_report.html');
       const htmlContent = Commands.generateHtmlReport(reportData);
        fs.writeFileSync(htmlReportPath, htmlContent);
        Logger.info(`HTML duplicate products report saved to: ${htmlReportPath}`);
      }
      
      console.log('\n' + chalk.cyan('Next steps:'));
      console.log('1. Review the unified Shopify CSV file before importing');
      console.log('2. Update any missing information (names, prices, etc.)');
      console.log('3. Import the CSV file in your Shopify admin');
      console.log('4. Check product details and images after import');
      console.log('5. Publish draft products when ready');
    } catch (error: any) {
      Logger.error(`Unified migration failed: ${error.message}`);
      console.error(error);
    }
  }

private static generateHtmlReport(reportData: any): string {
  const { summary, duplicates, genericTitleStats } = reportData;
  
  const tableRows = duplicates.map((dupe: any, index: number) => `
    <tr${dupe.matchType === 'title+artist' ? ' class="generic-title"' : ''}>
      <td>${index + 1}</td>
      <td>${dupe.title}</td>
      <td>${dupe.artworkArtist || 'N/A'}</td>
      <td>${dupe.wooArtist || 'N/A'}</td>
      <td>${dupe.artworkSKU}</td>
      <td>${dupe.wooSKU}</td>
      <td>$${dupe.artworkPrice}</td>
      <td>$${dupe.wooPrice}</td>
      <td>$${dupe.priceDifference}</td>
      <td>${dupe.artworkStatus}</td>
      <td>${dupe.wooStatus}</td>
      <td>${dupe.dimensions?.artwork || 'N/A'}</td>
      <td>${dupe.dimensions?.woo || 'N/A'}</td>
      <td>${dupe.matchType || 'title'}</td>
    </tr>
  `).join('');
  
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Duplicate Products Report</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        line-height: 1.6;
        margin: 0;
        padding: 20px;
        color: #333;
      }
      h1, h2, h3 {
        color: #2c3e50;
      }
      .container {
        max-width: 1200px;
        margin: 0 auto;
      }
      .summary {
        background-color: #f8f9fa;
        padding: 15px;
        border-radius: 5px;
        margin-bottom: 20px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
      }
      th, td {
        padding: 10px;
        border: 1px solid #ddd;
        text-align: left;
      }
      th {
        background-color: #f2f2f2;
        position: sticky;
        top: 0;
      }
      tr:nth-child(even) {
        background-color: #f9f9f9;
      }
      tr:hover {
        background-color: #f1f1f1;
      }
      .generic-title {
        background-color: #fffde7;
      }
      .price-diff {
        font-weight: bold;
        color: #e53935;
      }
      .stats {
        display: flex;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 20px;
        margin-bottom: 20px;
      }
      .stat-card {
        background-color: #f8f9fa;
        padding: 15px;
        border-radius: 5px;
        flex: 1;
        min-width: 200px;
      }
      .filters {
        margin-bottom: 20px;
      }
      .legend {
        margin-top: 20px;
        font-size: 0.9em;
        color: #666;
      }
      .badge {
        display: inline-block;
        padding: 3px 7px;
        border-radius: 3px;
        font-size: 0.8em;
        margin-right: 5px;
      }
      .badge-primary {
        background-color: #007bff;
        color: white;
      }
      .badge-warning {
        background-color: #ffc107;
        color: #212529;
      }
      @media print {
        body {
          font-size: 12pt;
        }
        .no-print {
          display: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Duplicate Products Report</h1>
      
      <div class="summary">
        <h2>Summary</h2>
        <p>Report generated on ${new Date(summary.date).toLocaleString()}</p>
        <p>Total duplicate products found: <strong>${summary.totalDuplicates}</strong></p>
        <p>Resolution strategy used: <strong>${summary.resolutionStrategy}</strong></p>
      </div>
      
      <div class="stats">
        <div class="stat-card">
          <h3>Source Statistics</h3>
          <p>Total Artwork Archive products: <strong>${summary.artworkProductsCount}</strong></p>
          <p>Total WooCommerce products: <strong>${summary.wooProductsCount}</strong></p>
          <p>Duplicates percentage: <strong>${((summary.totalDuplicates / (summary.artworkProductsCount + summary.wooProductsCount)) * 100).toFixed(2)}%</strong></p>
        </div>
        
        <div class="stat-card">
          <h3>Generic Titles</h3>
          <p>"Sin Título/Sin Titulo" instances: <strong>${genericTitleStats.sinTitulo}</strong></p>
          <p>"S/T" instances: <strong>${genericTitleStats.st}</strong></p>
          <p>Percentage of generic titles: <strong>${((genericTitleStats.sinTitulo + genericTitleStats.st) / summary.totalDuplicates * 100).toFixed(2)}%</strong></p>
        </div>
      </div>
      
      <div class="filters no-print">
        <h3>Filters</h3>
        <label>
          <input type="checkbox" id="genericFilter" checked> 
          <span class="badge badge-warning">Show generic titles</span>
        </label>
        <label>
          <input type="checkbox" id="priceDiffFilter"> 
          <span class="badge badge-primary">Highlight price differences > 1000</span>
        </label>
      </div>
      
      <h2>Duplicate Products (${summary.totalDuplicates})</h2>
      
      <table id="duplicatesTable">
        <thead>
          <tr>
            <th>#</th>
            <th>Title</th>
            <th>Artwork Artist</th>
            <th>Woo Artist</th>
            <th>Artwork SKU</th>
            <th>Woo SKU</th>
            <th>Artwork Price</th>
            <th>Woo Price</th>
            <th>Price Diff.</th>
            <th>Artwork Status</th>
            <th>Woo Status</th>
            <th>Artwork Dimensions</th>
            <th>Woo Dimensions</th>
            <th>Match Type</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      
      <div class="legend">
        <h3>Legend</h3>
        <p><span class="badge badge-warning">Generic Title</span> Products with generic titles like "Sin Título" or "S/T" that were matched using both title and artist name.</p>
        <p><span class="badge badge-primary">Price Difference</span> Highlights significant price differences between the two sources.</p>
      </div>
    </div>
    
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        // Filtros
        const genericFilter = document.getElementById('genericFilter');
        const priceDiffFilter = document.getElementById('priceDiffFilter');
        const table = document.getElementById('duplicatesTable');
        const rows = table.querySelectorAll('tbody tr');
        
        genericFilter.addEventListener('change', function() {
          rows.forEach(row => {
            if (row.classList.contains('generic-title')) {
              row.style.display = this.checked ? '' : 'none';
            }
          });
        });
        
        priceDiffFilter.addEventListener('change', function() {
          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            const priceDiff = parseFloat(cells[8].textContent.replace('$', ''));
            
            if (priceDiff > 1000) {
              cells[8].classList.toggle('price-diff', this.checked);
              if (this.checked) {
                row.style.backgroundColor = '#fee';
              } else {
                row.style.backgroundColor = '';
              }
            }
          });
        });
      });
    </script>
  </body>
  </html>
  `;
}


private static extractDimensions(html: string): string {
  if (!html) return '';
  
  const dimensionsRegex = /<strong>Dimensions:<\/strong>\s*([^<]+)/i;
  const match = html.match(dimensionsRegex);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  const heightRegex = /(\d+(\.\d+)?)\s*h/i;
  const widthRegex = /(\d+(\.\d+)?)\s*w/i;
  const depthRegex = /(\d+(\.\d+)?)\s*d/i;
  
  const heightMatch = html.match(heightRegex);
  const widthMatch = html.match(widthRegex);
  const depthMatch = html.match(depthRegex);
  
  if (heightMatch || widthMatch || depthMatch) {
    const dimensions = [];
    if (heightMatch) dimensions.push(`${heightMatch[1]}h`);
    if (widthMatch) dimensions.push(`${widthMatch[1]}w`);
    if (depthMatch) dimensions.push(`${depthMatch[1]}d`);
    
    return dimensions.join(' x ');
  }
  
  return '';
}


}




