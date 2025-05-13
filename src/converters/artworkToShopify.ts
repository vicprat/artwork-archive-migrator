
import { ArtworkArchiveRecord, ShopifyProductRecord } from '../itypes';
import { Logger } from '../utils/logger';

export class ArtworkToShopifyConverter {
  static convertArtworkToShopify(artworks: ArtworkArchiveRecord[]): ShopifyProductRecord[] {
    Logger.info('Starting conversion from Artwork Archive to Shopify format...');
    
    const shopifyProducts: ShopifyProductRecord[] = [];
    let convertedCount = 0;
    let skippedCount = 0;

    for (const artwork of artworks) {
      try {
        // Skip if no name or price
        if (!artwork.Name || artwork.Name === '*' || !artwork.Price) {
          skippedCount++;
          continue;
        }

        const handle = this.generateHandle(artwork.Name);
        const title = this.cleanTitle(artwork.Name);
        const description = this.generateDescription(artwork);
        const type = this.mapArtworkType(artwork.Type || artwork.Medium);
        const tags = this.generateTags(artwork);
        const price = this.cleanPrice(artwork.Price);
        const vendor = this.getVendor(artwork);

        const shopifyProduct: ShopifyProductRecord = {
          Handle: handle,
          Title: title,
          'Body (HTML)': description,
          Vendor: vendor,
          'Product Category': 'Art & Collectibles > Artwork',
          Type: type,
          Tags: tags,
          Published: artwork.Status?.toLowerCase() === 'available' ? 'TRUE' : 'FALSE',
          'Option1 Name': 'Type',
          'Option1 Value': 'Original',
          'Option2 Name': '',
          'Option2 Value': '',
          'Option3 Name': '',
          'Option3 Value': '',
          'Variant SKU': artwork['Piece Id'] || `ART-${Date.now()}`,
          'Variant Price': price,
          'Variant Inventory Qty': artwork.Status?.toLowerCase() === 'available' ? '1' : '0',
          'Image Src': artwork['Primary Image Url'] || '',
          'Image Position': '1',
          'Image Alt Text': title,
          Status: artwork.Status?.toLowerCase() === 'available' ? 'active' : 'draft',
          'Variant Inventory Policy': 'deny',
          'Variant Fulfillment Service': 'manual',
          'Variant Requires Shipping': 'TRUE',
          'Variant Taxable': 'TRUE',
          'Variant Grams': '1000',
          'Variant Inventory Tracker': 'shopify',
          'Gift Card': 'FALSE',
          'SEO Title': title,
          'SEO Description': description.replace(/<[^>]*>/g, '').substring(0, 160)
        };

        // Fill empty fields to maintain CSV structure
        const emptyFields = [
          'Variant Barcode', 'Variant Compare At Price', 'Variant Weight Unit', 
          'Variant Tax Code', 'Cost per item', 'Included / United States',
          'Price / United States', 'Compare At Price / United States',
          'Included / International', 'Price / International',
          'Compare At Price / International'
        ];

        emptyFields.forEach(field => {
          shopifyProduct[field] = '';
        });

        shopifyProducts.push(shopifyProduct);
        convertedCount++;
      } catch (error: any) {
        Logger.warning(`Failed to convert artwork: ${artwork.Name} - ${error.message}`);
        skippedCount++;
      }
    }

    Logger.success(`Conversion complete! Converted: ${convertedCount}, Skipped: ${skippedCount}`);
    return shopifyProducts;
  }

  private static generateHandle(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 255);
  }

  private static cleanTitle(name: string): string {
    return name
      .replace(/\*/g, '')
      .replace(/\"/g, '')
      .trim();
  }

  private static generateDescription(artwork: ArtworkArchiveRecord): string {
    const parts: string[] = [];

    if (artwork.Description) {
      parts.push(`<p>${artwork.Description}</p>`);
    }

    const details: string[] = [];
    if (artwork['Artist(s)']) details.push(`<strong>Artist:</strong> ${artwork['Artist(s)']}`);
    if (artwork.Medium) details.push(`<strong>Medium:</strong> ${artwork.Medium}`);
    if (artwork.Type) details.push(`<strong>Type:</strong> ${artwork.Type}`);
    
    const dimensions = this.formatDimensions(artwork);
    if (dimensions) details.push(`<strong>Dimensions:</strong> ${dimensions}`);
    
    if (artwork['Creation Date']) details.push(`<strong>Year:</strong> ${artwork['Creation Date']}`);

    if (details.length > 0) {
      parts.push(`<ul>${details.map(d => `<li>${d}</li>`).join('')}</ul>`);
    }

    return parts.join('\n');
  }

  private static formatDimensions(artwork: ArtworkArchiveRecord): string {
    const dimensions: string[] = [];
    if (artwork.Height) dimensions.push(`${artwork.Height}h`);
    if (artwork.Width) dimensions.push(`${artwork.Width}w`);
    if (artwork.Depth) dimensions.push(`${artwork.Depth}d`);
    
    return dimensions.join(' x ');
  }

  private static mapArtworkType(type: string): string {
    const typeMap: Record<string, string> = {
      'acrylic on canvas': 'Painting',
      'óleo sobre lienzo': 'Painting',
      'óleo sobre tela': 'Painting',
      'mixta': 'Mixed Media',
      'mixed media': 'Mixed Media',
      'sculpture': 'Sculpture',
      'print': 'Print',
      'photography': 'Photography'
    };

    const normalized = type?.toLowerCase() || '';
    return typeMap[normalized] || 'Artwork';
  }

  private static generateTags(artwork: ArtworkArchiveRecord): string {
    const tags: string[] = [];
    
    if (artwork.Tags) tags.push(...artwork.Tags.split(',').map(t => t.trim()));
    if (artwork['Artist(s)']) tags.push(artwork['Artist(s)']);
    if (artwork.Type) tags.push(artwork.Type);
    if (artwork.Medium) tags.push(artwork.Medium);
    tags.push('Original Art', 'Gallery', 'Impulso Galeria');
    
    return [...new Set(tags)].filter(t => t).join(', ');
  }

  private static cleanPrice(price: string): string {
    const cleaned = price.replace(/[^0-9.]/g, '');
    const numPrice = parseFloat(cleaned);
    return isNaN(numPrice) ? '0' : numPrice.toFixed(2);
  }

  private static getVendor(artwork: ArtworkArchiveRecord): string {
    return artwork['Artist(s)'] || 'Unknown Artist';
  }
}