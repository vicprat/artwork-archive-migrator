export class ShopifyProduct {
  private data: Record<string, string> = {};

  // Campos obligatorios de Shopify
  private static readonly REQUIRED_HEADERS = [
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

  constructor() {
    // Inicializar todos los campos con valores vacíos
    ShopifyProduct.REQUIRED_HEADERS.forEach(header => {
      this.data[header] = '';
    });

    // Valores por defecto
    this.setDefaults();
  }

  private setDefaults(): void {
    this.data['Product Category'] = 'Art & Collectibles > Artwork';
    this.data['Option1 Name'] = 'Type';
    this.data['Option1 Value'] = 'Original';
    this.data['Variant Grams'] = '1000';
    this.data['Variant Inventory Tracker'] = 'shopify';
    this.data['Variant Inventory Policy'] = 'deny';
    this.data['Variant Fulfillment Service'] = 'manual';
    this.data['Variant Requires Shipping'] = 'TRUE';
    this.data['Variant Taxable'] = 'TRUE';
    this.data['Gift Card'] = 'FALSE';
    this.data['Image Position'] = '1';
    this.data['Published'] = 'TRUE';
    this.data['Status'] = 'active';
  }

  // Métodos setter para campos principales
  setHandle(title: string): this {
    this.data['Handle'] = this.generateHandle(title);
    return this;
  }

  setTitle(title: string): this {
    this.data['Title'] = title;
    this.data['SEO Title'] = title;
    this.data['Image Alt Text'] = title;
    return this;
  }

  setBodyHTML(html: string): this {
    this.data['Body (HTML)'] = html;
    this.data['SEO Description'] = html.replace(/<[^>]*>/g, '').substring(0, 160);
    return this;
  }

  setVendor(vendor: string): this {
    this.data['Vendor'] = vendor;
    return this;
  }

  setType(type: string): this {
    this.data['Type'] = type;
    return this;
  }

  setTags(tags: string): this {
    this.data['Tags'] = tags;
    return this;
  }

  setVariantSKU(sku: string): this {
    this.data['Variant SKU'] = sku;
    return this;
  }

  setVariantPrice(price: string): this {
    this.data['Variant Price'] = this.cleanPrice(price);
    return this;
  }

  setVariantInventoryQty(qty: string): this {
    this.data['Variant Inventory Qty'] = qty;
    return this;
  }

  setImageSrc(url: string): this {
    this.data['Image Src'] = url;
    return this;
  }

  setImagePosition(position: string): this {
    this.data['Image Position'] = position;
    return this;
  }

  setStatus(status: 'active' | 'draft'): this {
    this.data['Status'] = status;
    this.data['Published'] = status === 'active' ? 'TRUE' : 'FALSE';
    return this;
  }

  setVariantCompareAtPrice(price: string): this {
    this.data['Variant Compare At Price'] = price;
    return this;
  }

  // Método para crear una fila de imagen adicional
  createImageRow(imageUrl: string, position: number, altText?: string): ShopifyProduct {
    const imageRow = new ShopifyProduct();
    imageRow.data['Handle'] = this.data['Handle'];
    imageRow.data['Image Src'] = imageUrl;
    imageRow.data['Image Position'] = position.toString();
    imageRow.data['Image Alt Text'] = altText || this.data['Title'];
    
    // Limpiar todos los otros campos para fila de imagen
    const fieldsToKeep = ['Handle', 'Image Src', 'Image Position', 'Image Alt Text'];
    Object.keys(imageRow.data).forEach(key => {
      if (!fieldsToKeep.includes(key)) {
        imageRow.data[key] = '';
      }
    });
    
    return imageRow;
  }

  // Métodos utilitarios
  private generateHandle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 255);
  }

  private cleanPrice(price: string): string {
    const cleaned = price.replace(/[^0-9.]/g, '');
    const numPrice = parseFloat(cleaned);
    return isNaN(numPrice) ? '0.00' : numPrice.toFixed(2);
  }

  // Obtener los datos como objeto plano
  toRecord(): Record<string, string> {
    return { ...this.data };
  }

  // Obtener headers estáticos
  static getHeaders(): string[] {
    return [...this.REQUIRED_HEADERS];
  }

  // Métodos de acceso para comparaciones
  getTitle(): string {
    return this.data['Title'];
  }

  getVendor(): string {
    return this.data['Vendor'];
  }

  getSKU(): string {
    return this.data['Variant SKU'];
  }

  getPrice(): string {
    return this.data['Variant Price'];
  }

  getStatus(): string {
    return this.data['Status'];
  }

  getHandle(): string {
    return this.data['Handle'];
  }

  getBodyHTML(): string {
    return this.data['Body (HTML)'];
  }
}