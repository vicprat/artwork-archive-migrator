import * as path from 'path';
import * as fs from 'fs';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { Logger } from '../utils/logger';
import { CsvHandler } from '../utils/csvHandler';
import { ArtworkToShopifyConverter } from '../converters/artworkToShopify';
import { ArtworkArchiveRecord } from '../itypes';

export class Commands {
  static async migrate(): Promise<void> {
    Logger.header('Artwork Archive to Shopify Migration Tool');

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
        type: 'input',
        name: 'outputFile',
        message: 'Enter the output filename for Shopify CSV:',
        default: 'data/output/shopify_products.csv'
      }
    ]);

    try {
      Logger.info('Reading Artwork Archive CSV...');
      const artworks = await CsvHandler.readCsv<ArtworkArchiveRecord>(answers.inputFile);

      Logger.info('Converting to Shopify format...');
      const shopifyProducts = ArtworkToShopifyConverter.convertArtworkToShopify(artworks);

      if (shopifyProducts.length === 0) {
        Logger.warning('No products were converted. Please check your input file.');
        return;
      }

      // Get all headers from Shopify template
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

      const outputPath = path.resolve(answers.outputFile);
      await CsvHandler.writeCsv(outputPath, shopifyProducts, shopifyHeaders);

      Logger.success(`Migration complete! Output saved to: ${outputPath}`);
      Logger.info(`Total products migrated: ${shopifyProducts.length}`);
    } catch (error: any) {
      Logger.error(`Migration failed: ${error.message}`);
    }
  }

  static async preview(): Promise<void> {
    Logger.header('Preview Artwork Archive Data');

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'inputFile',
        message: 'Enter the path to your Artwork Archive CSV file:',
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
}
