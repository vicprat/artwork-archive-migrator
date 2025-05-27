export type ArtworkArchiveRecord = {
  'Piece Id': string;
  'Name': string;
  'Artist(s)': string;
  'Type': string;
  'Medium': string;
  'Height': string;
  'Width': string;
  'Depth': string;
  'Price': string;
  'Description': string;
  'Status': string;
  'Primary Image Url': string;
  'Creation Date': string;
  'Tags': string;
  'Current Location Name': string;
  [key: string]: string;
}

export type WooProduct = {
  ID: number;
  post_title: string;
  post_content: string;
  post_status: string;
  sku: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: string;
  weight: string;
  categories: string;
  tags: string;
  image_url: string;
  gallery_images: string;
  thumbnail_id?: string;
  gallery_ids?: string;
}

export type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}


export type DuplicateMatch = {
  title: string;
  artworkSKU: string;
  wooSKU: string;
  artworkPrice: string;
  wooPrice: string;
  artworkStatus: string;
  wooStatus: string;
  artworkArtist: string;
  wooArtist: string;
  dimensions: {
    artwork: string;
    woo: string;
  };
  matchType: string;
  similarity: number;
}


export type DuplicateDetectionConfig = {
  matchingStrategy: 'exactTitle' | 'normalizedTitle' | 'advanced' | 'fuzzy';
  similarityThreshold?: number;
}

export type DuplicateResolutionConfig = {
  strategy: 'keepBoth' | 'preferArtwork' | 'preferWoo' | 'ask';
  onManualChoice?: (duplicate: DuplicateMatch) => Promise<'artwork' | 'woo' | 'both'>;
}

export type ImageProcessorConfig = {
  supabaseUrl: string;
  supabaseKey: string;
  bucketName: string;
  tempDir: string;
  webpOptions: {
    quality: number;
    effort: number;
  };
  retryCount: number;
  timeout: number;
}

export type ProcessedImage = {
  originalUrl: string;
  supabaseUrl: string;
  supabasePath: string;
  width?: number;
  height?: number;
  fileSize?: number;
  success: boolean;
  error?: string;
}