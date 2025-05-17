import mysql from 'mysql2/promise';
import { DbConfig, ShopifyProductRecord, WooProduct } from '../types';
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

  static convertToShopify(products: WooProduct[]): ShopifyProductRecord[] {
    Logger.info('Converting WooCommerce products to Shopify format...');
    const shopifyProducts: ShopifyProductRecord[] = [];

    products.forEach((product, index) => {
      const handle = this.generateHandle(product.post_title);
      
      const shopifyProduct: ShopifyProductRecord = {
        Handle: handle,
        Title: product.post_title,
        'Body (HTML)': product.post_content,
        Vendor: 'Impulso Galeria',
        'Product Category': product.categories || 'Art & Collectibles > Artwork',
        Type: product.categories ? product.categories.split(',')[0].trim() : 'Artwork',
        Tags: product.tags || '',
        Published: product.post_status === 'publish' ? 'TRUE' : 'FALSE',
        'Option1 Name': 'Type',
        'Option1 Value': 'Original',
        'Option2 Name': '',
        'Option2 Value': '',
        'Option3 Name': '',
        'Option3 Value': '',
        'Variant SKU': product.sku || `WOO-${product.ID}`,
        'Variant Grams': product.weight ? (parseFloat(product.weight) * 1000).toString() : '1000',
        'Variant Inventory Tracker': 'shopify',
        'Variant Inventory Qty': product.stock_quantity || '0',
        'Variant Inventory Policy': 'deny',
        'Variant Fulfillment Service': 'manual',
        'Variant Price': product.regular_price || '0.00',
        'Variant Compare At Price': product.sale_price || '',
        'Variant Requires Shipping': 'TRUE',
        'Variant Taxable': 'TRUE',
        'Variant Barcode': '',
        'Image Src': product.image_url || '',
        'Image Position': '1',
        'Image Alt Text': product.post_title,
        'Gift Card': 'FALSE',
        'SEO Title': product.post_title,
        'SEO Description': product.post_content 
          ? product.post_content.substring(0, 160).replace(/<[^>]*>/g, '')
          : '',
        Status: product.post_status === 'publish' ? 'active' : 'draft'
      };

      const emptyFields = [
        'Google Shopping / Google Product Category', 'Google Shopping / Gender',
        'Google Shopping / Age Group', 'Google Shopping / MPN', 
        'Google Shopping / Condition', 'Google Shopping / Custom Product',
        'Variant Image', 'Variant Weight Unit', 'Variant Tax Code', 'Cost per item',
        'Included / United States', 'Price / United States', 'Compare At Price / United States',
        'Included / International', 'Price / International', 'Compare At Price / International'
      ];

      emptyFields.forEach(field => {
        shopifyProduct[field] = '';
      });

      shopifyProducts.push(shopifyProduct);

       if (product.gallery_images) {
        const galleryUrls = product.gallery_images.split(', ');
        galleryUrls.forEach((url, imgIndex) => {
          if (url.trim()) {
            const imageRow: ShopifyProductRecord = {
              Handle: handle,
              Title: '',
              'Body (HTML)': '',
              Vendor: '',
              'Product Category': '',
              Type: '',
              Tags: '',
              Published: '',
              'Option1 Name': '',
              'Option1 Value': '',
              'Option2 Name': '',
              'Option2 Value': '',
              'Option3 Name': '',
              'Option3 Value': '',
              'Variant SKU': '',
              'Variant Grams': '',
              'Variant Inventory Tracker': '',
              'Variant Inventory Qty': '',
              'Variant Inventory Policy': '',
              'Variant Fulfillment Service': '',
              'Variant Price': '',
              'Variant Compare At Price': '',
              'Variant Requires Shipping': '',
              'Variant Taxable': '',
              'Variant Barcode': '',
              'Image Src': url.trim(),
              'Image Position': (imgIndex + 2).toString(),
              'Image Alt Text': product.post_title,
              'Gift Card': '',
              'SEO Title': '',
              'SEO Description': '',
              Status: ''
            };
            
            for (const [key, value] of Object.entries(shopifyProduct)) {
              if (!(key in imageRow)) {
                imageRow[key] = '';
              }
            }
            
            shopifyProducts.push(imageRow);
          }
        });
      }
    });

    Logger.success(`Successfully converted ${products.length} WooCommerce products to Shopify format`);
    return shopifyProducts;
  }

  private static generateHandle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 255);
  }
}