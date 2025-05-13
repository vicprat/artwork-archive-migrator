import { ArtworkArchiveRecord, ShopifyProductRecord } from '../types';
import { Logger } from '../utils/logger';

export class ArtworkToShopifyConverter {
  static convertArtworkToShopify(artworks: ArtworkArchiveRecord[]): ShopifyProductRecord[] {
    Logger.info('Starting conversion from Artwork Archive to Shopify format...');
    
    const shopifyProducts: ShopifyProductRecord[] = [];
    let convertedCount = 0;
    let draftCount = 0;

    for (const [index, artwork] of artworks.entries()) {
      try {
        Logger.info(`Processing record ${index + 1}: ${artwork.Name || 'Unnamed'}`);
        
        let isDraft = false;
        let draftReasons: string[] = [];
        
        let name = artwork.Name || '';
        
        if (!name || name.trim() === '') {
          isDraft = true;
          draftReasons.push('Missing name');
          Logger.warning(`No name for record ${index + 1}, marking as draft for manual review`);
        } else if (name.length === 1) {
          isDraft = true;
          draftReasons.push('Name is only one character');
          Logger.warning(`Single character name for record ${index + 1}: "${name}", marking as draft`);
        }

        let price = artwork.Price;
        if (!price || price.trim() === '') {
          isDraft = true;
          draftReasons.push('Missing price');
          price = '0';
          Logger.warning(`No price for record ${index + 1} (${name}), setting to 0 and marking as draft`);
        }

        const handle = this.generateHandle(name || `record-${index + 1}`);
        const title = name; 
        const description = this.generateDescription(artwork);
        const type = this.mapArtworkType(artwork.Type || artwork.Medium);
        const tags = this.generateTags(artwork);
        const cleanedPrice = this.cleanPrice(price);
        const vendor = this.getVendor(artwork);

        let status = 'active';
        let published = 'TRUE';
        
        if (isDraft || artwork.Status?.toLowerCase() !== 'available') {
          status = 'draft';
          published = 'FALSE';
          if (isDraft) {
            draftCount++;
            Logger.info(`Setting to draft: ${title} - Reasons: ${draftReasons.join(', ')}`);
          }
        }

        const shopifyProduct: ShopifyProductRecord = {
          Handle: handle,
          Title: title,
          'Body (HTML)': description,
          Vendor: vendor,
          'Product Category': 'Art & Collectibles > Artwork',
          Type: type,
          Tags: tags,
          Published: published,
          'Option1 Name': 'Type',
          'Option1 Value': 'Original',
          'Option2 Name': '',
          'Option2 Value': '',
          'Option3 Name': '',
          'Option3 Value': '',
          'Variant SKU': artwork['Piece Id'] || `ART-${Date.now()}-${index}`,
          'Variant Price': cleanedPrice,
          'Variant Inventory Qty': artwork.Status?.toLowerCase() === 'available' ? '1' : '0',
          'Image Src': artwork['Primary Image Url'] || '',
          'Image Position': '1',
          'Image Alt Text': title || `Artwork ${index + 1}`,
          Status: status,
          'Variant Inventory Policy': 'deny',
          'Variant Fulfillment Service': 'manual',
          'Variant Requires Shipping': 'TRUE',
          'Variant Taxable': 'TRUE',
          'Variant Grams': '1000',
          'Variant Inventory Tracker': 'shopify',
          'Gift Card': 'FALSE',
          'SEO Title': title || `Artwork ${index + 1}`,
          'SEO Description': description.replace(/<[^>]*>/g, '').substring(0, 160)
        };

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
        
        const statusMsg = status === 'draft' ? ' (DRAFT)' : ' (ACTIVE)';
        Logger.success(`Successfully converted: ${title || 'Unnamed'}${statusMsg}`);
      } catch (error: any) {
        Logger.error(`Failed to convert artwork at index ${index + 1}: ${error.message}`);
      }
    }

    Logger.success(`Conversion complete! Total converted: ${convertedCount}`);
    Logger.info(`Active products: ${convertedCount - draftCount}`);
    Logger.info(`Draft products: ${draftCount}`);
    return shopifyProducts;
  }

  private static generateHandle(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 255);
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