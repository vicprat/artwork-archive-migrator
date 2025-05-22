import { ShopifyProduct } from "../models/ShopifyProduct";
import { DuplicateDetectionConfig, DuplicateMatch } from "../types";


export class DuplicateDetectionService {
  constructor(
    private config: DuplicateDetectionConfig,
    private extractDimensions: (html: string) => string,
    private generateComparisonKeys: (title: string, vendor: string, dimensions: string, strategy: string) => string[],
    private normalizeUtils: any // Inyección de dependencia para NormalizeUtils
  ) {}

  detectDuplicates(
    artworkProducts: ShopifyProduct[],
    wooProducts: ShopifyProduct[]
  ): DuplicateMatch[] {
    const duplicates: DuplicateMatch[] = [];
    
    // Crear mapa de productos de Artwork Archive
    const artworkProductMap = this.createProductMap(artworkProducts);
    
    // Buscar duplicados en productos de WooCommerce
    const mainWooProducts = wooProducts.filter(p => p.getTitle() !== '');
    
    for (const wooProduct of mainWooProducts) {
      const matches = this.findMatches(wooProduct, artworkProductMap);
      duplicates.push(...matches);
    }

    return this.removeDuplicateMatches(duplicates);
  }

  private createProductMap(products: ShopifyProduct[]): Map<string, ShopifyProduct[]> {
    const productMap = new Map<string, ShopifyProduct[]>();
    const mainProducts = products.filter(p => p.getStatus() !== undefined);
    
    mainProducts.forEach(product => {
      if (product.getTitle()) {
        const keys = this.generateComparisonKeys(
          product.getTitle(),
          product.getVendor(),
          this.extractDimensions(product.getBodyHTML()),
          this.config.matchingStrategy
        );
        
        keys.forEach(key => {
          if (!productMap.has(key)) {
            productMap.set(key, []);
          }
          productMap.get(key)!.push(product);
        });
      }
    });
    
    return productMap;
  }

  private findMatches(wooProduct: ShopifyProduct, artworkProductMap: Map<string, ShopifyProduct[]>): DuplicateMatch[] {
    const matches: DuplicateMatch[] = [];
    
    if (!wooProduct.getTitle()) return matches;
    
    const keys = this.generateComparisonKeys(
      wooProduct.getTitle(),
      wooProduct.getVendor(),
      this.extractDimensions(wooProduct.getBodyHTML()),
      this.config.matchingStrategy
    );
    
    for (const key of keys) {
      if (artworkProductMap.has(key)) {
        const artworkMatches = artworkProductMap.get(key)!;
        
        for (const artworkProduct of artworkMatches) {
          const match = this.createDuplicateMatch(wooProduct, artworkProduct);
          if (match) {
            matches.push(match);
            
            // Para estrategias no-fuzzy, solo queremos el primer match
            if (this.config.matchingStrategy !== 'fuzzy') {
              return matches;
            }
          }
        }
      }
    }
    
    return matches;
  }

  private createDuplicateMatch(wooProduct: ShopifyProduct, artworkProduct: ShopifyProduct): DuplicateMatch | null {
    let matchType = 'title';
    let similarity = 1.0;
    
    // Para fuzzy matching, calcular similaridad actual
    if (this.config.matchingStrategy === 'fuzzy') {
      similarity = this.normalizeUtils.getSimilarity(
        wooProduct.getTitle(),
        artworkProduct.getTitle()
      );
      
      // Saltar si está por debajo del umbral
      if (similarity < (this.config.similarityThreshold || 0.8)) {
        return null;
      }
      
      matchType = `fuzzy (${Math.round(similarity * 100)}%)`;
    } else if (this.config.matchingStrategy === 'advanced') {
      // Verificar coincidencia avanzada
      const titleMatch = this.normalizeUtils.normalizeTitle(wooProduct.getTitle()) === 
        this.normalizeUtils.normalizeTitle(artworkProduct.getTitle());
      const artistMatch = this.normalizeUtils.normalizeArtist(wooProduct.getVendor()) === 
        this.normalizeUtils.normalizeArtist(artworkProduct.getVendor());
      
      if (titleMatch && artistMatch) {
        matchType = 'title+artist';
      } else if (titleMatch) {
        matchType = 'title only';
      } else {
        return null; // No es una coincidencia real
      }
    }
    
    return {
      title: wooProduct.getTitle(),
      artworkSKU: artworkProduct.getSKU(),
      wooSKU: wooProduct.getSKU(),
      artworkPrice: artworkProduct.getPrice(),
      wooPrice: wooProduct.getPrice(),
      artworkStatus: artworkProduct.getStatus(),
      wooStatus: wooProduct.getStatus(),
      artworkArtist: artworkProduct.getVendor() || 'N/A',
      wooArtist: wooProduct.getVendor() || 'N/A',
      dimensions: {
        artwork: this.extractDimensions(artworkProduct.getBodyHTML()),
        woo: this.extractDimensions(wooProduct.getBodyHTML())
      },
      matchType,
      similarity
    };
  }

  private removeDuplicateMatches(duplicates: DuplicateMatch[]): DuplicateMatch[] {
    if (this.config.matchingStrategy !== 'fuzzy') {
      return duplicates;
    }
    
    // Agrupar duplicados por SKU de WooCommerce
    const duplicatesBySKU = new Map<string, DuplicateMatch[]>();
    for (const dupe of duplicates) {
      if (!duplicatesBySKU.has(dupe.wooSKU)) {
        duplicatesBySKU.set(dupe.wooSKU, []);
      }
      duplicatesBySKU.get(dupe.wooSKU)!.push(dupe);
    }
    
    // Para cada producto de WooCommerce, mantener solo la mejor coincidencia
    const filteredDuplicates: DuplicateMatch[] = [];
    for (const [_, matches] of duplicatesBySKU.entries()) {
      if (matches.length > 1) {
        // Ordenar por similaridad (mayor primero)
        matches.sort((a, b) => b.similarity - a.similarity);
        filteredDuplicates.push(matches[0]);
      } else {
        filteredDuplicates.push(matches[0]);
      }
    }
    
    return filteredDuplicates;
  }
}
