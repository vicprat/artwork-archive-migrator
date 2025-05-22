import chalk from "chalk";
import { ShopifyProduct } from "../models/ShopifyProduct";
import { DuplicateMatch } from "../types";

export interface DuplicateResolutionConfig {
  strategy: 'keepBoth' | 'preferArtwork' | 'preferWoo' | 'ask';
  onManualChoice?: (duplicate: DuplicateMatch) => Promise<'artwork' | 'woo' | 'both'>;
}

export class DuplicateResolutionService {
  constructor(private logger: any) {}

  async resolveDuplicates(
    duplicates: DuplicateMatch[],
    artworkProducts: ShopifyProduct[],
    wooProducts: ShopifyProduct[],
    config: DuplicateResolutionConfig
  ): Promise<{ artworkProducts: ShopifyProduct[], wooProducts: ShopifyProduct[] }> {
    if (duplicates.length === 0) {
      return { artworkProducts, wooProducts };
    }

    this.logger.warning(`Found ${duplicates.length} duplicate products`);
    this.logDuplicates(duplicates);

    switch (config.strategy) {
      case 'keepBoth':
        return this.keepBothVersions(duplicates, artworkProducts, wooProducts);
      
      case 'preferArtwork':
        return this.preferArtworkVersions(duplicates, artworkProducts, wooProducts);
      
      case 'preferWoo':
        return this.preferWooVersions(duplicates, artworkProducts, wooProducts);
      
      case 'ask':
        if (!config.onManualChoice) {
          throw new Error('Manual choice handler is required for "ask" strategy');
        }
        return this.askForEachDuplicate(duplicates, artworkProducts, wooProducts, config.onManualChoice);
      
      default:
        throw new Error(`Unknown duplicate resolution strategy: ${config.strategy}`);
    }
  }

  private logDuplicates(duplicates: DuplicateMatch[]): void {
    console.log('\n' + chalk.yellow.bold('Duplicate Products:'));
    console.log(chalk.yellow.bold('==================='));
    
    duplicates.forEach((dupe, index) => {
      console.log(chalk.cyan(`\n${index + 1}. ${dupe.title}`));
      console.log(`   Artwork Archive: SKU: ${dupe.artworkSKU}, Price: ${dupe.artworkPrice}, Artist: ${dupe.artworkArtist}, Status: ${dupe.artworkStatus}`);
      console.log(`   WooCommerce:     SKU: ${dupe.wooSKU}, Price: ${dupe.wooPrice}, Artist: ${dupe.wooArtist}, Status: ${dupe.wooStatus}`);
      console.log(`   Match type:      ${dupe.matchType}`);
    });
  }

  private keepBothVersions(
    duplicates: DuplicateMatch[],
    artworkProducts: ShopifyProduct[],
    wooProducts: ShopifyProduct[]
  ): { artworkProducts: ShopifyProduct[], wooProducts: ShopifyProduct[] } {
    this.logger.info('Keeping both versions of duplicate products (adding suffix to WooCommerce products)');
    
    const duplicateWooSKUs = new Set(duplicates.map(d => d.wooSKU));
    
    for (const wooProduct of wooProducts) {
      if (wooProduct.getTitle() !== '' && duplicateWooSKUs.has(wooProduct.getSKU())) {
        const oldTitle = wooProduct.getTitle();
        const oldHandle = wooProduct.getHandle();
        
        wooProduct.setTitle(`${oldTitle} (WooCommerce)`);
        wooProduct.setHandle(`${oldHandle}-woo`);
        
        // Actualizar filas de imágenes relacionadas
        this.updateRelatedImageRows(wooProducts, oldTitle, wooProduct.getHandle());
        
        this.logger.info(`Renamed "${oldTitle}" to "${wooProduct.getTitle()}"`);
      }
    }
    
    return { artworkProducts, wooProducts };
  }

  private preferArtworkVersions(
    duplicates: DuplicateMatch[],
    artworkProducts: ShopifyProduct[],
    wooProducts: ShopifyProduct[]
  ): { artworkProducts: ShopifyProduct[], wooProducts: ShopifyProduct[] } {
    this.logger.info('Using Artwork Archive version for duplicate products');
    
    const duplicateWooSKUs = new Set(duplicates.map(d => d.wooSKU));
    const filteredWooProducts = wooProducts.filter(p => {
      if (!p.getSKU()) return true; // Mantener filas sin SKU (como imágenes)
      return !duplicateWooSKUs.has(p.getSKU());
    });
    
    this.logger.info(`Removed ${wooProducts.length - filteredWooProducts.length} duplicate WooCommerce products`);
    return { artworkProducts, wooProducts: filteredWooProducts };
  }

  private preferWooVersions(
    duplicates: DuplicateMatch[],
    artworkProducts: ShopifyProduct[],
    wooProducts: ShopifyProduct[]
  ): { artworkProducts: ShopifyProduct[], wooProducts: ShopifyProduct[] } {
    this.logger.info('Using WooCommerce version for duplicate products');
    
    const duplicateArtworkSKUs = new Set(duplicates.map(d => d.artworkSKU));
    const filteredArtworkProducts = artworkProducts.filter(p => {
      if (!p.getSKU()) return true; // Mantener filas sin SKU
      return !duplicateArtworkSKUs.has(p.getSKU());
    });
    
    this.logger.info(`Removed ${artworkProducts.length - filteredArtworkProducts.length} duplicate Artwork Archive products`);
    return { artworkProducts: filteredArtworkProducts, wooProducts };
  }

  private async askForEachDuplicate(
    duplicates: DuplicateMatch[],
    artworkProducts: ShopifyProduct[],
    wooProducts: ShopifyProduct[],
    onManualChoice: (duplicate: DuplicateMatch) => Promise<'artwork' | 'woo' | 'both'>
  ): Promise<{ artworkProducts: ShopifyProduct[], wooProducts: ShopifyProduct[] }> {
    this.logger.info('Asking for each duplicate product...');
    
    const toRemoveFromWoo = new Set<string>();
    const toRemoveFromArtwork = new Set<string>();
    const toRenameWoo = new Set<string>();
    
    for (const dupe of duplicates) {
      const choice = await onManualChoice(dupe);
      
      if (choice === 'artwork') {
        toRemoveFromWoo.add(dupe.wooSKU);
      } else if (choice === 'woo') {
        toRemoveFromArtwork.add(dupe.artworkSKU);
      } else if (choice === 'both') {
        toRenameWoo.add(dupe.wooSKU);
      }
    }
    
    // Procesar eliminaciones y renombres
    let filteredArtworkProducts = artworkProducts;
    let filteredWooProducts = wooProducts;
    
    if (toRemoveFromWoo.size > 0) {
      filteredWooProducts = wooProducts.filter(p => {
        if (!p.getSKU()) return true;
        return !toRemoveFromWoo.has(p.getSKU());
      });
      this.logger.info(`Removed ${toRemoveFromWoo.size} WooCommerce products based on your choices`);
    }
    
    if (toRemoveFromArtwork.size > 0) {
      filteredArtworkProducts = artworkProducts.filter(p => {
        if (!p.getSKU()) return true;
        return !toRemoveFromArtwork.has(p.getSKU());
      });
      this.logger.info(`Removed ${toRemoveFromArtwork.size} Artwork Archive products based on your choices`);
    }
    
    if (toRenameWoo.size > 0) {
      for (const wooProduct of filteredWooProducts) {
        if (wooProduct.getTitle() !== '' && toRenameWoo.has(wooProduct.getSKU())) {
          const oldTitle = wooProduct.getTitle();
          const oldHandle = wooProduct.getHandle();
          
          wooProduct.setTitle(`${oldTitle} (WooCommerce)`);
          wooProduct.setHandle(`${oldHandle}-woo`);
          
          // Actualizar filas de imágenes relacionadas
          this.updateRelatedImageRows(filteredWooProducts, oldTitle, wooProduct.getHandle());
          
          this.logger.info(`Renamed "${oldTitle}" to "${wooProduct.getTitle()}"`);
        }
      }
    }
    
    return { artworkProducts: filteredArtworkProducts, wooProducts: filteredWooProducts };
  }

  private updateRelatedImageRows(products: ShopifyProduct[], oldTitle: string, newHandle: string): void {
    const oldHandle = oldTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    const relatedImages = products.filter(p => 
      p.getTitle() === '' && 
      p.getHandle() === oldHandle
    );
    
    relatedImages.forEach(img => {
      img.setHandle(newHandle);
    });
  }
}