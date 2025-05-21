import * as path from 'path';
import * as fs from 'fs';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { Logger } from '../utils/logger';
import { CsvHandler } from '../utils/csvHandler';
import { ArtworkToShopifyConverter } from '../converters/artwork';
import { WooCommerceToShopifyConverter } from '../converters/wooCommerce';
import { ArtworkArchiveRecord, DbConfig } from '../types';
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
              
              // Create maps for both product sets with normalized keys
              const artworkProductMap = new Map();
              const mainArtworkProducts = artworkProducts.filter(p => p.Status !== undefined);
              
              // Prepare normalized values for Artwork products
              mainArtworkProducts.forEach(product => {
                if (product.Title) {
                  // Generate the comparison key based on selected strategy
                  const keys = generateComparisonKeys(
                    product.Title, 
                    product.Vendor, 
                    extractDimensions(product['Body (HTML)'] || ''),
                    answers.matchingStrategy
                  );
                  
                  // Store under all applicable keys
                  keys.forEach(key => {
                    if (!artworkProductMap.has(key)) {
                      artworkProductMap.set(key, []);
                    }
                    artworkProductMap.get(key).push(product);
                  });
                }
              });
              
              const mainWooProducts = wooProducts.filter(p => p.Title !== '');
              let duplicatesCount = 0;
              
              for (const wooProduct of mainWooProducts) {
                if (wooProduct.Title) {
                  // Generate comparison keys for WooCommerce product
                  const keys = generateComparisonKeys(
                    wooProduct.Title, 
                    wooProduct.Vendor, 
                    extractDimensions(wooProduct['Body (HTML)'] || ''),
                    answers.matchingStrategy
                  );
                  
                  // Check each key for potential matches
                  let foundDuplicate = false;
                  
                  for (const key of keys) {
                    if (artworkProductMap.has(key)) {
                      // Found at least one potential match
                      const artworkMatches = artworkProductMap.get(key);
                      
                      for (const artworkProduct of artworkMatches) {
                        let matchType = 'title';
                        let similarity = 1.0;
                        
                        // For fuzzy matching, calculate actual similarity
                        if (answers.matchingStrategy === 'fuzzy') {
                          similarity = NormalizeUtils.getSimilarity(
                            wooProduct.Title,
                            artworkProduct.Title
                          );
                          
                          // Skip if below threshold
                          if (similarity < answers.similarityThreshold) {
                            continue;
                          }
                          
                          matchType = `fuzzy (${Math.round(similarity * 100)}%)`;
                        } else if (answers.matchingStrategy === 'advanced') {
                          // For advanced matching, check if title+artist matched
                          if (
                            NormalizeUtils.normalizeTitle(wooProduct.Title) === 
                            NormalizeUtils.normalizeTitle(artworkProduct.Title) &&
                            NormalizeUtils.normalizeArtist(wooProduct.Vendor) === 
                            NormalizeUtils.normalizeArtist(artworkProduct.Vendor)
                          ) {
                            matchType = 'title+artist';
                          } else if (
                            NormalizeUtils.normalizeTitle(wooProduct.Title) === 
                            NormalizeUtils.normalizeTitle(artworkProduct.Title)
                          ) {
                            matchType = 'title only';
                          } else {
                            continue; // Not a real match
                          }
                        }
                        
                        duplicatesCount++;
                        foundDuplicate = true;
                        
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
                            artwork: extractDimensions(artworkProduct['Body (HTML)'] || ''),
                            woo: extractDimensions(wooProduct['Body (HTML)'] || '')
                          },
                          matchType: matchType,
                          similarity: similarity
                        });
                        
                        // For non-fuzzy matches, we only want the first match
                        if (answers.matchingStrategy !== 'fuzzy') {
                          break;
                        }
                      }
                      
                      if (foundDuplicate && answers.matchingStrategy !== 'fuzzy') {
                        break;
                      }
                    }
                  }
                }
              }
              
              // Remove duplicates if we have multiple matches for the same WooCommerce product
              if (answers.matchingStrategy === 'fuzzy') {
                // Group duplicates by wooSKU
                const duplicatesBySKU = new Map();
                for (const dupe of duplicateProducts) {
                  if (!duplicatesBySKU.has(dupe.wooSKU)) {
                    duplicatesBySKU.set(dupe.wooSKU, []);
                  }
                  duplicatesBySKU.get(dupe.wooSKU).push(dupe);
                }
                
                // For each WooCommerce product, keep only the best match
                const filteredDuplicates = [];
                for (const [_, matches] of duplicatesBySKU.entries()) {
                  if (matches.length > 1) {
                    // Sort by similarity (highest first)
                    matches.sort((a: any, b: any) => b.similarity - a.similarity);
                    filteredDuplicates.push(matches[0]);
                  } else {
                    filteredDuplicates.push(matches[0]);
                  }
                }
                
                duplicateProducts = filteredDuplicates;
                duplicatesCount = duplicateProducts.length;
              }
              
              if (duplicatesCount > 0) {
                Logger.warning(`Found ${duplicatesCount} duplicate products between Artwork Archive and WooCommerce using ${answers.matchingStrategy} matching`);
                
                console.log('\n' + chalk.yellow.bold('Duplicate Products:'));
                console.log(chalk.yellow.bold('==================='));
                
                duplicateProducts.forEach((dupe, index) => {
                  console.log(chalk.cyan(`\n${index + 1}. ${dupe.title}`));
                  console.log(`   Artwork Archive: SKU: ${dupe.artworkSKU}, Price: ${dupe.artworkPrice}, Artist: ${dupe.artworkArtist}, Status: ${dupe.artworkStatus}`);
                  console.log(`   WooCommerce:     SKU: ${dupe.wooSKU}, Price: ${dupe.wooPrice}, Artist: ${dupe.wooArtist}, Status: ${dupe.wooStatus}`);
                  console.log(`   Match type:      ${dupe.matchType}`);
                });
                
                if (answers.duplicateStrategy === 'keepBoth') {
                  Logger.info('Keeping both versions of duplicate products (adding suffix to WooCommerce products)');
                  
                  // Create a set of WooCommerce SKUs that are duplicates
                  const duplicateWooSKUs = new Set(duplicateProducts.map(d => d.wooSKU));
                  
                  for (const wooProduct of mainWooProducts) {
                    // Check if this WooCommerce product is a duplicate
                    const isProductDuplicate = wooProduct['Variant SKU'] && 
                      duplicateWooSKUs.has(wooProduct['Variant SKU']);
                    
                    if (isProductDuplicate) {
                      const oldTitle = wooProduct.Title;
                      wooProduct.Title = `${wooProduct.Title} (WooCommerce)`;
                      wooProduct.Handle = `${wooProduct.Handle}-woo`;
                      
                      // Update related image rows
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
                } else if (answers.duplicateStrategy === 'preferArtwork') {
                  Logger.info('Using Artwork Archive version for duplicate products');
                  
                  // Create a set of WooCommerce SKUs that are duplicates
                  const duplicateWooSKUs = new Set(duplicateProducts.map(d => d.wooSKU));
                  
                  // Filter out WooCommerce products that are duplicates
                  const filteredWooProducts = wooProducts.filter(p => {
                    if (!p['Variant SKU']) return true; // Keep rows without SKUs (like images)
                    return !duplicateWooSKUs.has(p['Variant SKU']);
                  });
                  
                  Logger.info(`Removed ${wooProducts.length - filteredWooProducts.length} duplicate WooCommerce products`);
                  wooProducts = filteredWooProducts;
                } else if (answers.duplicateStrategy === 'preferWoo') {
                  Logger.info('Using WooCommerce version for duplicate products');
                  
                  // Create a set of Artwork SKUs that are duplicates
                  const duplicateArtworkSKUs = new Set(duplicateProducts.map(d => d.artworkSKU));
                  
                  // Filter out Artwork products that are duplicates
                  const filteredArtworkProducts = artworkProducts.filter(p => {
                    if (!p['Variant SKU']) return true; // Keep rows without SKUs
                    return !duplicateArtworkSKUs.has(p['Variant SKU']);
                  });
                  
                  Logger.info(`Removed ${artworkProducts.length - filteredArtworkProducts.length} duplicate Artwork Archive products`);
                  artworkProducts = filteredArtworkProducts;
                } else if (answers.duplicateStrategy === 'ask') {
                  Logger.info('Asking for each duplicate product...');
                  
                  const toRemoveFromWoo = new Set();
                  const toRemoveFromArtwork = new Set();
                  const toRenameWoo = new Set();
                  
                  for (const dupe of duplicateProducts) {
                    const dupeChoice = await inquirer.prompt([
                      {
                        type: 'list',
                        name: 'preference',
                        message: `Choose which version to keep for "${dupe.title}" (${dupe.matchType}):`,
                        choices: [
                          { name: `Artwork Archive (SKU: ${dupe.artworkSKU}, Price: ${dupe.artworkPrice}, Artist: ${dupe.artworkArtist})`, value: 'artwork' },
                          { name: `WooCommerce (SKU: ${dupe.wooSKU}, Price: ${dupe.wooPrice}, Artist: ${dupe.wooArtist})`, value: 'woo' },
                          { name: 'Keep both versions', value: 'both' }
                        ]
                      }
                    ]);
                    
                    if (dupeChoice.preference === 'artwork') {
                      toRemoveFromWoo.add(dupe.wooSKU);
                    } else if (dupeChoice.preference === 'woo') {
                      toRemoveFromArtwork.add(dupe.artworkSKU);
                    } else if (dupeChoice.preference === 'both') {
                      toRenameWoo.add(dupe.wooSKU);
                    }
                  }
                  
                  // Process removals and renames
                  if (toRemoveFromWoo.size > 0) {
                    wooProducts = wooProducts.filter(p => {
                      if (!p['Variant SKU']) return true;
                      return !toRemoveFromWoo.has(p['Variant SKU']);
                    });
                    Logger.info(`Removed ${toRemoveFromWoo.size} WooCommerce products based on your choices`);
                  }
                  
                  if (toRemoveFromArtwork.size > 0) {
                    artworkProducts = artworkProducts.filter(p => {
                      if (!p['Variant SKU']) return true;
                      return !toRemoveFromArtwork.has(p['Variant SKU']);
                    });
                    Logger.info(`Removed ${toRemoveFromArtwork.size} Artwork Archive products based on your choices`);
                  }
                  
                  if (toRenameWoo.size > 0) {
                    for (const wooProduct of mainWooProducts) {
                      if (wooProduct['Variant SKU'] && toRenameWoo.has(wooProduct['Variant SKU'])) {
                        const oldTitle = wooProduct.Title;
                        wooProduct.Title = `${wooProduct.Title} (WooCommerce)`;
                        wooProduct.Handle = `${wooProduct.Handle}-woo`;
                        
                        // Update related image rows
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
          console.log(chalk.magenta(`  - Detection strategy: ${answers.matchingStrategy}`));
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
        // Collect insights about the duplicates for the report
        const genericTitleCount = duplicateProducts.filter(d => 
          NormalizeUtils.normalizeTitle(d.title) === 'untitled'
        ).length;
        
        const priceDifferences = duplicateProducts.map(d => {
          const price1 = parseFloat(d.artworkPrice);
          const price2 = parseFloat(d.wooPrice);
          return {
            title: d.title,
            difference: Math.abs(price1 - price2),
            percentDifference: Math.abs((price1 - price2) / ((price1 + price2) / 2)) * 100
          };
        });
        
        const bigPriceDiffs = priceDifferences.filter(d => d.difference > 100);
        const artistMismatches = duplicateProducts.filter(d => 
          NormalizeUtils.normalizeArtist(d.artworkArtist) !== NormalizeUtils.normalizeArtist(d.wooArtist)
        );
        
        const reportData = {
          summary: {
            totalDuplicates: duplicateProducts.length,
            resolutionStrategy: answers.duplicateStrategy,
            matchingStrategy: answers.matchingStrategy,
            date: new Date().toISOString(),
            artworkProductsCount: mainArtworkProducts.length,
            wooProductsCount: mainWooProducts.length,
            similarityThreshold: answers.similarityThreshold || 'N/A'
          },

          duplicates: duplicateProducts.map(dupe => ({
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
            resolution: answers.duplicateStrategy === 'ask' ? 'manual' : answers.duplicateStrategy
          })),
          stats: {
            genericTitles: {
              count: genericTitleCount,
              percentage: (genericTitleCount / duplicateProducts.length * 100).toFixed(1)
            },
            priceDifferences: {
              significantCount: bigPriceDiffs.length,
              significantPercentage: (bigPriceDiffs.length / duplicateProducts.length * 100).toFixed(1),
              averageDifference: (priceDifferences.reduce((sum, d) => sum + d.difference, 0) / 
                priceDifferences.length).toFixed(2),
              maxDifference: Math.max(...priceDifferences.map(d => d.difference)).toFixed(2)
            },
            artistMismatches: {
              count: artistMismatches.length,
              percentage: (artistMismatches.length / duplicateProducts.length * 100).toFixed(1)
            }
          }
        };
        
        const duplicatesReportPath = path.resolve(path.dirname(answers.outputFile), 'duplicate_products_report.json');
        fs.writeFileSync(duplicatesReportPath, JSON.stringify(reportData, null, 2));
        Logger.info(`Detailed duplicate products report saved to: ${duplicatesReportPath}`);
        
        const htmlReportPath = path.resolve(path.dirname(answers.outputFile), 'duplicate_products_report.html');
        const htmlContent = generateHtmlReport({
          ...reportData,
          genericTitleStats: {
            sinTitulo: duplicateProducts.filter(d => 
              d.title.toLowerCase().trim() === 'sin título' || 
              d.title.toLowerCase().trim() === 'sin titulo'
            ).length,
            st: duplicateProducts.filter(d => 
              d.title.toLowerCase().trim() === 's/t'
            ).length
          }
        });
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

  
 
}