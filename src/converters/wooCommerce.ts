import mysql from 'mysql2/promise';
import { DbConfig, WooProduct } from '../types';
import { ShopifyProduct } from '../models/ShopifyProduct';
import { Logger } from '../utils/logger';

export class WooCommerceToShopifyConverter {
  static async getWooCommerceProducts(config: DbConfig): Promise<WooProduct[]> {
    let connection;
    try {
      Logger.info('Connecting to MySQL database...');
      connection = await mysql.createConnection(config);
      Logger.success('Connected to MySQL database');

      const query = `
        SELECT 
          p.ID,
          p.post_title,
          p.post_content,
          p.post_status,
          MAX(CASE WHEN pm_sku.meta_key = '_sku' THEN pm_sku.meta_value END) as sku,
          MAX(CASE WHEN pm_price.meta_key = '_regular_price' THEN pm_price.meta_value END) as regular_price,
          MAX(CASE WHEN pm_sale.meta_key = '_sale_price' THEN pm_sale.meta_value END) as sale_price,
          MAX(CASE WHEN pm_stock.meta_key = '_stock' THEN pm_stock.meta_value END) as stock_quantity,
          MAX(CASE WHEN pm_weight.meta_key = '_weight' THEN pm_weight.meta_value END) as weight,
          GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ', ') as categories,
          GROUP_CONCAT(DISTINCT tag.name ORDER BY tag.name SEPARATOR ', ') as tags,
          MAX(CASE WHEN pm_thumb.meta_key = '_thumbnail_id' THEN pm_thumb.meta_value END) as thumbnail_id,
          MAX(CASE WHEN pm_gallery.meta_key = '_product_image_gallery' THEN pm_gallery.meta_value END) as gallery_ids
        FROM wp_posts p
        LEFT JOIN wp_postmeta pm_sku ON p.ID = pm_sku.post_id AND pm_sku.meta_key = '_sku'
        LEFT JOIN wp_postmeta pm_price ON p.ID = pm_price.post_id AND pm_price.meta_key = '_regular_price'
        LEFT JOIN wp_postmeta pm_sale ON p.ID = pm_sale.post_id AND pm_sale.meta_key = '_sale_price'
        LEFT JOIN wp_postmeta pm_stock ON p.ID = pm_stock.post_id AND pm_stock.meta_key = '_stock'
        LEFT JOIN wp_postmeta pm_weight ON p.ID = pm_weight.post_id AND pm_weight.meta_key = '_weight'
        LEFT JOIN wp_postmeta pm_thumb ON p.ID = pm_thumb.post_id AND pm_thumb.meta_key = '_thumbnail_id'
        LEFT JOIN wp_postmeta pm_gallery ON p.ID = pm_gallery.post_id AND pm_gallery.meta_key = '_product_image_gallery'
        
        -- Categorías
        LEFT JOIN wp_term_relationships tr ON p.ID = tr.object_id
        LEFT JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id AND tt.taxonomy = 'product_cat'
        LEFT JOIN wp_terms t ON tt.term_id = t.term_id
        
        -- Tags
        LEFT JOIN wp_term_relationships tr_tag ON p.ID = tr_tag.object_id
        LEFT JOIN wp_term_taxonomy tt_tag ON tr_tag.term_taxonomy_id = tt_tag.term_taxonomy_id AND tt_tag.taxonomy = 'product_tag'
        LEFT JOIN wp_terms tag ON tt_tag.term_id = tag.term_id
        
        WHERE p.post_type = 'product'
        AND p.post_status IN ('publish', 'draft')
        GROUP BY p.ID, p.post_title, p.post_content, p.post_status
      `;

      Logger.info('Extracting products from WooCommerce...');
      const [rows] = await connection.execute(query);
      const products = rows as any[];
      
      Logger.info(`Found ${products.length} products in WooCommerce`);

      // Obtener URLs de imágenes
      for (const product of products) {
        if (product.thumbnail_id) {
          const [imageRows] = await connection.execute(
            'SELECT guid FROM wp_posts WHERE ID = ?',
            [product.thumbnail_id]
          );
          if (imageRows && (imageRows as any[]).length > 0) {
            product.image_url = (imageRows as any[])[0].guid;
          }
        }

        if (product.gallery_ids) {
          const galleryIds = product.gallery_ids.split(',');
          const galleryUrls = [];
          for (const id of galleryIds) {
            const [imageRows] = await connection.execute(
              'SELECT guid FROM wp_posts WHERE ID = ?',
              [id.trim()]
            );
            if (imageRows && (imageRows as any[]).length > 0) {
              galleryUrls.push((imageRows as any[])[0].guid);
            }
          }
          product.gallery_images = galleryUrls.join(', ');
        }
      }

      return products;
    } catch (error: any) {
      Logger.error(`Error extracting WooCommerce products: ${error.message}`);
      throw error;
    } finally {
      if (connection) {
        Logger.info('Closing database connection');
        await connection.end();
      }
    }
  }

  static convertToShopify(products: WooProduct[]): ShopifyProduct[] {
    Logger.info('Converting WooCommerce products to Shopify format...');
    const shopifyProducts: ShopifyProduct[] = [];

    products.forEach((wooProduct, index) => {
      const mainProduct = this.convertSingleWooProduct(wooProduct);
      shopifyProducts.push(mainProduct);

      // Agregar filas de imágenes adicionales si existen
      if (wooProduct.gallery_images) {
        const additionalImages = this.createAdditionalImageRows(wooProduct, mainProduct);
        shopifyProducts.push(...additionalImages);
      }
    });

    Logger.success(`Successfully converted ${products.length} WooCommerce products to Shopify format`);
    return shopifyProducts;
  }

  private static convertSingleWooProduct(wooProduct: WooProduct): ShopifyProduct {
    const product = new ShopifyProduct();
    
    const status = wooProduct.post_status === 'publish' ? 'active' : 'draft';
    const weight = wooProduct.weight ? (parseFloat(wooProduct.weight) * 1000).toString() : '1000';
    
    product
      .setTitle(wooProduct.post_title)
      .setHandle(wooProduct.post_title)
      .setBodyHTML(wooProduct.post_content)
      .setVendor('Impulso Galeria')
      .setType(wooProduct.categories ? wooProduct.categories.split(',')[0].trim() : 'Artwork')
      .setTags(wooProduct.tags || '')
      .setVariantSKU(wooProduct.sku || `WOO-${wooProduct.ID}`)
      .setVariantPrice(wooProduct.regular_price || '0.00')
      .setVariantInventoryQty(wooProduct.stock_quantity || '0')
      .setImageSrc(wooProduct.image_url || '')
      .setStatus(status);

    // Configurar campos específicos de WooCommerce
    if (wooProduct.sale_price) {
      product.setVariantCompareAtPrice(wooProduct.sale_price);
    }

    // Actualizar categoría de producto si existe
    if (wooProduct.categories) {
      const productRecord = product.toRecord();
      productRecord['Product Category'] = wooProduct.categories;
      // Nota: Necesitarías un método setter para esto en ShopifyProduct
    }

    // Configurar peso
    const productRecord = product.toRecord();
    productRecord['Variant Grams'] = weight;

    return product;
  }

  private static createAdditionalImageRows(wooProduct: WooProduct, mainProduct: ShopifyProduct): ShopifyProduct[] {
    const imageRows: ShopifyProduct[] = [];
    const galleryUrls = wooProduct.gallery_images.split(', ');
    
    galleryUrls.forEach((url, imgIndex) => {
      if (url.trim()) {
        const imageRow = mainProduct.createImageRow(
          url.trim(),
          imgIndex + 2, // +2 porque la imagen principal es posición 1
          wooProduct.post_title
        );
        imageRows.push(imageRow);
      }
    });
    
    return imageRows;
  }
}