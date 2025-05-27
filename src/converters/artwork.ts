import { ArtworkArchiveRecord } from '../types';
import { ShopifyProduct } from '../models/ShopifyProduct';
import { Logger } from '../utils/logger';
import { ImageProcessorService } from '../services/ImageProcessorService';

export class ArtworkToShopifyConverter {
  private static imageProcessor: ImageProcessorService;

  static async initialize(): Promise<void> {
    try {
      this.imageProcessor = ImageProcessorService.createDefault();
      await this.imageProcessor.initialize();
      Logger.success('ArtworkToShopifyConverter inicializado con procesamiento de imágenes');
    } catch (error: any) {
      Logger.error(`Error inicializando ArtworkToShopifyConverter: ${error.message}`);
      throw error;
    }
  }

  static async convertArtworkToShopify(artworks: ArtworkArchiveRecord[]): Promise<ShopifyProduct[]> {
    // Verificar que el servicio esté inicializado
    if (!this.imageProcessor) {
      await this.initialize();
    }

    Logger.info('Starting conversion from Artwork Archive to Shopify format...');
    
    const shopifyProducts: ShopifyProduct[] = [];
    let convertedCount = 0;
    let draftCount = 0;

    for (const [index, artwork] of artworks.entries()) {
      try {
        Logger.info(`Processing record ${index + 1}: ${artwork.Name || 'Unnamed'}`);
        
        const product = await this.convertSingleArtwork(artwork, index);
        
        if (product.getStatus() === 'draft') {
          draftCount++;
        }
        
        shopifyProducts.push(product);
        convertedCount++;
        
        const statusMsg = product.getStatus() === 'draft' ? ' (DRAFT)' : ' (ACTIVE)';
        Logger.success(`Successfully converted: ${product.getTitle() || 'Unnamed'}${statusMsg}`);
      } catch (error: any) {
        Logger.error(`Failed to convert artwork at index ${index + 1}: ${error.message}`);
      }
    }

    Logger.success(`Conversion complete! Total converted: ${convertedCount}`);
    Logger.info(`Active products: ${convertedCount - draftCount}`);
    Logger.info(`Draft products: ${draftCount}`);
    
    return shopifyProducts;
  }

  private static async convertSingleArtwork(artwork: ArtworkArchiveRecord, index: number): Promise<ShopifyProduct> {
    const product = new ShopifyProduct();
    
    // Validaciones y determinación del estado
    const validationResult = this.validateArtwork(artwork, index);
    
    // Configurar campos básicos
    const name = artwork.Name || `record-${index + 1}`;
    product
      .setTitle(name)
      .setHandle(name)
      .setBodyHTML(this.generateDescription(artwork))
      .setVendor(this.getVendor(artwork))
      .setType(this.mapArtworkType(artwork.Type || artwork.Medium))
      .setTags(this.generateTags(artwork))
      .setVariantSKU(artwork['Piece Id'] || `ART-${Date.now()}-${index}`)
      .setVariantPrice(artwork.Price || '0')
      .setVariantInventoryQty(artwork.Status?.toLowerCase() === 'available' ? '1' : '0');

    // Procesar imagen si existe
    let finalImageUrl = '';
    if (artwork['Primary Image Url']) {
      Logger.info(`Procesando imagen para ${name}: ${artwork['Primary Image Url']}`);
      
      try {
        const processedImage = await this.imageProcessor.processImage(artwork['Primary Image Url']);
        
        if (processedImage.success) {
          finalImageUrl = processedImage.supabaseUrl;
          Logger.success(`Imagen procesada exitosamente para ${name}`);
        } else {
          Logger.warning(`Error procesando imagen para ${name}: ${processedImage.error}`);
          // Mantener la URL original como fallback
          finalImageUrl = artwork['Primary Image Url'];
        }
      } catch (error: any) {
        Logger.error(`Error procesando imagen para ${name}: ${error.message}`);
        // Mantener la URL original como fallback
        finalImageUrl = artwork['Primary Image Url'];
      }
    }

    product.setImageSrc(finalImageUrl);

    // Configurar estado basado en validaciones
    if (validationResult.isDraft || artwork.Status?.toLowerCase() !== 'available') {
      product.setStatus('draft');
      if (validationResult.isDraft) {
        Logger.info(`Setting to draft: ${name} - Reasons: ${validationResult.reasons.join(', ')}`);
      }
    }

    return product;
  }

  private static validateArtwork(artwork: ArtworkArchiveRecord, index: number): {
    isDraft: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];
    let isDraft = false;
    
    const name = artwork.Name || '';
    
    if (!name || name.trim() === '') {
      isDraft = true;
      reasons.push('Missing name');
      Logger.warning(`No name for record ${index + 1}, marking as draft for manual review`);
    } else if (name.length === 1) {
      isDraft = true;
      reasons.push('Name is only one character');
      Logger.warning(`Single character name for record ${index + 1}: "${name}", marking as draft`);
    }

    const price = artwork.Price;
    if (!price || price.trim() === '') {
      isDraft = true;
      reasons.push('Missing price');
      Logger.warning(`No price for record ${index + 1} (${name}), setting to 0 and marking as draft`);
    }

    return { isDraft, reasons };
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

  private static getVendor(artwork: ArtworkArchiveRecord): string {
    return artwork['Artist(s)'] || 'Unknown Artist';
  }

  static async cleanup(): Promise<void> {
    if (this.imageProcessor) {
      await this.imageProcessor.cleanup();
    }
  }
}