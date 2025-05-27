import { PrismaClient, Product, ProductImage, SourceType, ProductStatus } from '@prisma/client';
import { ShopifyProduct } from '../models/ShopifyProduct';
import { ArtworkArchiveRecord, ProcessedImage, WooProduct } from '../types';
import { Logger } from '../utils/logger';

export class PrismaProductService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async initialize(): Promise<void> {
    try {
      await this.prisma.$connect();
      Logger.success('PrismaProductService conectado a la base de datos');
    } catch (error: any) {
      Logger.error(`Error conectando a la base de datos: ${error.message}`);
      throw error;
    }
  }

  async saveArtworkProducts(
    artworks: ArtworkArchiveRecord[], 
    shopifyProducts: ShopifyProduct[],
    processedImages: Map<string, ProcessedImage> = new Map()
  ): Promise<Product[]> {
    const savedProducts: Product[] = [];

    for (let i = 0; i < artworks.length; i++) {
      const artwork = artworks[i];
      const shopifyProduct = shopifyProducts[i];
      
      try {
        const product = await this.createProductFromArtwork(artwork, shopifyProduct, processedImages);
        savedProducts.push(product);
        Logger.success(`Producto Artwork guardado: ${product.title}`);
      } catch (error: any) {
        Logger.error(`Error guardando producto Artwork ${artwork.Name}: ${error.message}`);
      }
    }

    return savedProducts;
  }

  async saveWooCommerceProducts(
    wooProducts: WooProduct[], 
    shopifyProducts: ShopifyProduct[],
    processedImages: Map<string, ProcessedImage> = new Map()
  ): Promise<Product[]> {
    const savedProducts: Product[] = [];
    let productIndex = 0;

    for (const wooProduct of wooProducts) {
      try {
        // Encontrar el producto principal (no las filas de imágenes adicionales)
        const mainShopifyProduct = shopifyProducts.find(sp => 
          sp.getTitle() === wooProduct.post_title && sp.getSKU().includes(wooProduct.ID.toString())
        );

        if (!mainShopifyProduct) {
          Logger.warning(`No se encontró ShopifyProduct correspondiente para WooCommerce product: ${wooProduct.post_title}`);
          continue;
        }

        const product = await this.createProductFromWooCommerce(wooProduct, mainShopifyProduct, processedImages);
        savedProducts.push(product);

        // Buscar y guardar imágenes adicionales
        const additionalImageProducts = shopifyProducts.filter(sp => 
          sp.getHandle() === mainShopifyProduct.getHandle() && 
          sp.getTitle() === '' && 
          sp.toRecord()['Image Src']
        );

        if (additionalImageProducts.length > 0) {
          await this.saveAdditionalImages(product.id, additionalImageProducts, processedImages);
        }

        Logger.success(`Producto WooCommerce guardado: ${product.title}`);
      } catch (error: any) {
        Logger.error(`Error guardando producto WooCommerce ${wooProduct.post_title}: ${error.message}`);
      }
    }

    return savedProducts;
  }

  private async createProductFromArtwork(
    artwork: ArtworkArchiveRecord, 
    shopifyProduct: ShopifyProduct,
    processedImages: Map<string, ProcessedImage>
  ): Promise<Product> {
    const productData = shopifyProduct.toRecord();
    
    const product = await this.prisma.product.create({
      data: {
        handle: shopifyProduct.getHandle(),
        title: shopifyProduct.getTitle(),
        bodyHtml: shopifyProduct.getBodyHTML(),
        vendor: shopifyProduct.getVendor(),
        productCategory: productData['Product Category'],
        type: productData['Type'],
        tags: productData['Tags'],
        published: productData['Published'] === 'TRUE',
        status: shopifyProduct.getStatus() === 'active' ? ProductStatus.ACTIVE : ProductStatus.DRAFT,
        seoTitle: productData['SEO Title'],
        seoDescription: productData['SEO Description'],
        
        // Variant data
        variantSku: shopifyProduct.getSKU(),
        variantPrice: parseFloat(shopifyProduct.getPrice()),
        variantCompareAtPrice: productData['Variant Compare At Price'] ? 
          parseFloat(productData['Variant Compare At Price']) : null,
        variantGrams: parseInt(productData['Variant Grams']) || 1000,
        variantInventoryTracker: productData['Variant Inventory Tracker'],
        variantInventoryQty: parseInt(productData['Variant Inventory Qty']) || 0,
        variantInventoryPolicy: productData['Variant Inventory Policy'],
        variantFulfillmentService: productData['Variant Fulfillment Service'],
        variantRequiresShipping: productData['Variant Requires Shipping'] === 'TRUE',
        variantTaxable: productData['Variant Taxable'] === 'TRUE',
        variantBarcode: productData['Variant Barcode'],
        variantWeightUnit: productData['Variant Weight Unit'],
        variantTaxCode: productData['Variant Tax Code'],
        costPerItem: productData['Cost per item'] ? parseFloat(productData['Cost per item']) : null,
        
        // Options
        option1Name: productData['Option1 Name'],
        option1Value: productData['Option1 Value'],
        option2Name: productData['Option2 Name'],
        option2Value: productData['Option2 Value'],
        option3Name: productData['Option3 Name'],
        option3Value: productData['Option3 Value'],
        
        // Google Shopping
        googleProductCategory: productData['Google Shopping / Google Product Category'],
        googleGender: productData['Google Shopping / Gender'],
        googleAgeGroup: productData['Google Shopping / Age Group'],
        googleMPN: productData['Google Shopping / MPN'],
        googleCondition: productData['Google Shopping / Condition'],
        googleCustomProduct: productData['Google Shopping / Custom Product'],
        
        // Gift Card
        giftCard: productData['Gift Card'] === 'TRUE',
        
        // Pricing por región
        includedUS: productData['Included / United States'] === 'TRUE',
        priceUS: productData['Price / United States'] ? parseFloat(productData['Price / United States']) : null,
        compareAtPriceUS: productData['Compare At Price / United States'] ? 
          parseFloat(productData['Compare At Price / United States']) : null,
        includedIntl: productData['Included / International'] === 'TRUE',
        priceIntl: productData['Price / International'] ? parseFloat(productData['Price / International']) : null,
        compareAtPriceIntl: productData['Compare At Price / International'] ? 
          parseFloat(productData['Compare At Price / International']) : null,
        
        // Source tracking
        sourceType: SourceType.ARTWORK_ARCHIVE,
        sourceId: artwork['Piece Id'],
        
        // Artwork specific fields
        artworkArtist: artwork['Artist(s)'],
        artworkMedium: artwork.Medium,
        artworkHeight: artwork.Height,
        artworkWidth: artwork.Width,
        artworkDepth: artwork.Depth,
        artworkYear: artwork['Creation Date'],
        artworkStatus: artwork.Status
      }
    });

    // Crear imagen si existe
    if (productData['Image Src']) {
      await this.createProductImage(
        product.id, 
        productData['Image Src'], 
        artwork['Primary Image Url'], 
        1, 
        productData['Image Alt Text'],
        processedImages
      );
    }

    return product;
  }

  private async createProductFromWooCommerce(
    wooProduct: WooProduct, 
    shopifyProduct: ShopifyProduct,
    processedImages: Map<string, ProcessedImage>
  ): Promise<Product> {
    const productData = shopifyProduct.toRecord();
    
    const product = await this.prisma.product.create({
      data: {
        handle: shopifyProduct.getHandle(),
        title: shopifyProduct.getTitle(),
        bodyHtml: shopifyProduct.getBodyHTML(),
        vendor: shopifyProduct.getVendor(),
        productCategory: productData['Product Category'],
        type: productData['Type'],
        tags: productData['Tags'],
        published: productData['Published'] === 'TRUE',
        status: shopifyProduct.getStatus() === 'active' ? ProductStatus.ACTIVE : ProductStatus.DRAFT,
        seoTitle: productData['SEO Title'],
        seoDescription: productData['SEO Description'],
        
        // Variant data
        variantSku: shopifyProduct.getSKU(),
        variantPrice: parseFloat(shopifyProduct.getPrice()),
        variantCompareAtPrice: productData['Variant Compare At Price'] ? 
          parseFloat(productData['Variant Compare At Price']) : null,
        variantGrams: parseInt(productData['Variant Grams']) || 1000,
        variantInventoryTracker: productData['Variant Inventory Tracker'],
        variantInventoryQty: parseInt(productData['Variant Inventory Qty']) || 0,
        variantInventoryPolicy: productData['Variant Inventory Policy'],
        variantFulfillmentService: productData['Variant Fulfillment Service'],
        variantRequiresShipping: productData['Variant Requires Shipping'] === 'TRUE',
        variantTaxable: productData['Variant Taxable'] === 'TRUE',
        variantBarcode: productData['Variant Barcode'],
        variantWeightUnit: productData['Variant Weight Unit'],
        variantTaxCode: productData['Variant Tax Code'],
        costPerItem: productData['Cost per item'] ? parseFloat(productData['Cost per item']) : null,
        
        // Options
        option1Name: productData['Option1 Name'],
        option1Value: productData['Option1 Value'],
        option2Name: productData['Option2 Name'],
        option2Value: productData['Option2 Value'],
        option3Name: productData['Option3 Name'],
        option3Value: productData['Option3 Value'],
        
        // Google Shopping
        googleProductCategory: productData['Google Shopping / Google Product Category'],
        googleGender: productData['Google Shopping / Gender'],
        googleAgeGroup: productData['Google Shopping / Age Group'],
        googleMPN: productData['Google Shopping / MPN'],
        googleCondition: productData['Google Shopping / Condition'],
        googleCustomProduct: productData['Google Shopping / Custom Product'],
        
        // Gift Card
        giftCard: productData['Gift Card'] === 'TRUE',
        
        // Pricing por región
        includedUS: productData['Included / United States'] === 'TRUE',
        priceUS: productData['Price / United States'] ? parseFloat(productData['Price / United States']) : null,
        compareAtPriceUS: productData['Compare At Price / United States'] ? 
          parseFloat(productData['Compare At Price / United States']) : null,
        includedIntl: productData['Included / International'] === 'TRUE',
        priceIntl: productData['Price / International'] ? parseFloat(productData['Price / International']) : null,
        compareAtPriceIntl: productData['Compare At Price / International'] ? 
          parseFloat(productData['Compare At Price / International']) : null,
        
        // Source tracking
        sourceType: SourceType.WOOCOMMERCE,
        sourceId: wooProduct.ID.toString()
      }
    });

    // Crear imagen principal si existe
    if (productData['Image Src']) {
      await this.createProductImage(
        product.id, 
        productData['Image Src'], 
        wooProduct.image_url, 
        1, 
        productData['Image Alt Text'],
        processedImages
      );
    }

    return product;
  }

  private async saveAdditionalImages(
    productId: string, 
    additionalImageProducts: ShopifyProduct[],
    processedImages: Map<string, ProcessedImage>
  ): Promise<void> {
    for (const imageProduct of additionalImageProducts) {
      const productData = imageProduct.toRecord();
      const position = parseInt(productData['Image Position']) || 1;
      
      await this.createProductImage(
        productId,
        productData['Image Src'],
        productData['Image Src'], // En este caso, es la misma URL
        position,
        productData['Image Alt Text'],
        processedImages
      );
    }
  }

  private async createProductImage(
    productId: string,
    finalImageUrl: string,
    originalImageUrl: string,
    position: number,
    altText: string,
    processedImages: Map<string, ProcessedImage>
  ): Promise<ProductImage> {
    const processedImage = processedImages.get(originalImageUrl);
    
    return await this.prisma.productImage.create({
      data: {
        productId: productId,
        originalUrl: originalImageUrl,
        supabaseUrl: finalImageUrl,
        supabasePath: processedImage?.supabasePath || '',
        position: position,
        altText: altText,
        width: processedImage?.width,
        height: processedImage?.height,
        fileSize: processedImage?.fileSize,
        format: 'webp',
        processed: processedImage?.success || false,
        processedAt: processedImage?.success ? new Date() : null
      }
    });
  }

  async getAllProducts(): Promise<Product[]> {
    return await this.prisma.product.findMany({
      include: {
        images: true
      }
    });
  }

  async getProductsForShopifyExport(): Promise<any[]> {
    const products = await this.prisma.product.findMany({
      include: {
        images: {
          orderBy: {
            position: 'asc'
          }
        }
      }
    });

    const shopifyExportData: any[] = [];

    for (const product of products) {
      // Crear entrada principal del producto
      const mainEntry = this.convertProductToShopifyExport(product);
      
      // Usar la primera imagen como imagen principal
      if (product.images.length > 0) {
        mainEntry['Image Src'] = product.images[0].supabaseUrl;
        mainEntry['Image Position'] = '1';
        mainEntry['Image Alt Text'] = product.images[0].altText;
      }
      
      shopifyExportData.push(mainEntry);

      // Crear entradas adicionales para imágenes extra
      if (product.images.length > 1) {
        for (let i = 1; i < product.images.length; i++) {
          const image = product.images[i];
          const imageEntry = { ...mainEntry };
          
          // Limpiar campos del producto para entradas de imagen
          imageEntry['Title'] = '';
          imageEntry['Body (HTML)'] = '';
          imageEntry['Vendor'] = '';
          imageEntry['Type'] = '';
          imageEntry['Tags'] = '';
          imageEntry['Variant SKU'] = '';
          imageEntry['Variant Price'] = '';
          imageEntry['Variant Inventory Qty'] = '';
          // ... limpiar otros campos necesarios
          
          // Configurar datos de imagen
          imageEntry['Image Src'] = image.supabaseUrl;
          imageEntry['Image Position'] = image.position.toString();
          imageEntry['Image Alt Text'] = image.altText;
          
          shopifyExportData.push(imageEntry);
        }
      }
    }

    return shopifyExportData;
  }

  private convertProductToShopifyExport(product: Product): any {
    return {
      'Handle': product.handle,
      'Title': product.title,
      'Body (HTML)': product.bodyHtml || '',
      'Vendor': product.vendor || '',
      'Product Category': product.productCategory || '',
      'Type': product.type || '',
      'Tags': product.tags || '',
      'Published': product.published ? 'TRUE' : 'FALSE',
      'Option1 Name': product.option1Name || '',
      'Option1 Value': product.option1Value || '',
      'Option2 Name': product.option2Name || '',
      'Option2 Value': product.option2Value || '',
      'Option3 Name': product.option3Name || '',
      'Option3 Value': product.option3Value || '',
      'Variant SKU': product.variantSku || '',
      'Variant Grams': product.variantGrams?.toString() || '1000',
      'Variant Inventory Tracker': product.variantInventoryTracker || '',
      'Variant Inventory Qty': product.variantInventoryQty?.toString() || '0',
      'Variant Inventory Policy': product.variantInventoryPolicy || '',
      'Variant Fulfillment Service': product.variantFulfillmentService || '',
      'Variant Price': product.variantPrice.toString(),
      'Variant Compare At Price': product.variantCompareAtPrice?.toString() || '',
      'Variant Requires Shipping': product.variantRequiresShipping ? 'TRUE' : 'FALSE',
      'Variant Taxable': product.variantTaxable ? 'TRUE' : 'FALSE',
      'Variant Barcode': product.variantBarcode || '',
      'Image Src': '', // Se llenará por imagen
      'Image Position': '', // Se llenará por imagen
      'Image Alt Text': '', // Se llenará por imagen
      'Gift Card': product.giftCard ? 'TRUE' : 'FALSE',
      'SEO Title': product.seoTitle || '',
      'SEO Description': product.seoDescription || '',
      'Google Shopping / Google Product Category': product.googleProductCategory || '',
      'Google Shopping / Gender': product.googleGender || '',
      'Google Shopping / Age Group': product.googleAgeGroup || '',
      'Google Shopping / MPN': product.googleMPN || '',
      'Google Shopping / Condition': product.googleCondition || '',
      'Google Shopping / Custom Product': product.googleCustomProduct || '',
      'Variant Image': '',
      'Variant Weight Unit': product.variantWeightUnit || '',
      'Variant Tax Code': product.variantTaxCode || '',
      'Cost per item': product.costPerItem?.toString() || '',
      'Included / United States': product.includedUS ? 'TRUE' : 'FALSE',
      'Price / United States': product.priceUS?.toString() || '',
      'Compare At Price / United States': product.compareAtPriceUS?.toString() || '',
      'Included / International': product.includedIntl ? 'TRUE' : 'FALSE',
      'Price / International': product.priceIntl?.toString() || '',
      'Compare At Price / International': product.compareAtPriceIntl?.toString() || '',
      'Status': product.status.toLowerCase()
    };
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}