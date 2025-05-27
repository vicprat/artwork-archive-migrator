import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { Logger } from '../utils/logger';

export interface ImageProcessorConfig {
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

export interface ProcessedImage {
  originalUrl: string;
  supabaseUrl: string;
  supabasePath: string;
  width?: number;
  height?: number;
  fileSize?: number;
  success: boolean;
  error?: string;
}

export class ImageProcessorService {
  private supabase: SupabaseClient;
  private config: ImageProcessorConfig;

  constructor(config: ImageProcessorConfig) {
    this.config = config;
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  async initialize(): Promise<void> {
    try {
      // Crear directorio temporal si no existe
      await fs.mkdir(this.config.tempDir, { recursive: true });

      // Verificar o crear bucket de Supabase
      await this.ensureBucketExists();

      Logger.success('ImageProcessorService inicializado correctamente');
    } catch (error: any) {
      Logger.error(`Error inicializando ImageProcessorService: ${error.message}`);
      throw error;
    }
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      // Intentar listar buckets primero
      const { data: buckets, error: listError } = await this.supabase.storage.listBuckets();
      
      if (!listError && buckets) {
        const bucketExists = buckets.some(bucket => bucket.name === this.config.bucketName);
        
        if (bucketExists) {
          Logger.success(`Bucket ${this.config.bucketName} ya existe y está disponible`);
          return;
        }
      } else {
        Logger.warning(`No se pudo listar buckets: ${listError?.message}. Verificando con prueba directa...`);
      }

      // Si no pudimos listar buckets o no existe, intentar crear
      Logger.info(`Intentando crear bucket ${this.config.bucketName}...`);
      const { error: createError } = await this.supabase.storage.createBucket(this.config.bucketName, {
        public: true,
        allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png']
      });
      
      if (createError) {
        // Si el bucket ya existe, es OK
        if (createError.message.includes('already exists') || 
            createError.message.includes('resource already exists')) {
          Logger.success(`Bucket ${this.config.bucketName} ya existía`);
          return;
        }
        
        // Si es un error de permisos, dar instrucciones específicas
        if (createError.message.includes('row-level security policy') || 
            createError.message.includes('RLS') ||
            createError.message.includes('permission denied')) {
          Logger.error(`Error de permisos. El bucket debe crearse manualmente.`);
          Logger.info(`Ve a Supabase Dashboard → Storage → Create bucket: "${this.config.bucketName}"`);
          throw createError;
        }
        
        // Cualquier otro error
        throw createError;
      }
      
      Logger.success(`Bucket ${this.config.bucketName} creado exitosamente`);
    } catch (error: any) {
      // Si el error es que ya existe, tratarlo como éxito
      if (error.message?.includes('already exists') || 
          error.message?.includes('resource already exists')) {
        Logger.success(`Bucket ${this.config.bucketName} confirmado (ya existía)`);
        return;
      }
      
      Logger.error(`Error verificando/creando bucket: ${error.message}`);
      throw error;
    }
  }

  async processImage(imageUrl: string): Promise<ProcessedImage> {
    if (!imageUrl || typeof imageUrl !== 'string') {
      return {
        originalUrl: imageUrl,
        supabaseUrl: '',
        supabasePath: '',
        success: false,
        error: 'URL de imagen inválida'
      };
    }

    try {
      Logger.info(`Procesando imagen: ${imageUrl}`);

      // 1. Descargar imagen
      const downloadResult = await this.downloadImage(imageUrl);
      if (!downloadResult.success || !downloadResult.filepath) {
        return {
          originalUrl: imageUrl,
          supabaseUrl: '',
          supabasePath: '',
          success: false,
          error: downloadResult.error || 'Error descargando imagen'
        };
      }

      // 2. Convertir a WebP y obtener metadata
      const conversionResult = await this.convertToWebP(downloadResult.filepath);
      if (!conversionResult.success || !conversionResult.webpPath) {
        // Limpiar archivo temporal
        await this.cleanupFile(downloadResult.filepath);
        return {
          originalUrl: imageUrl,
          supabaseUrl: '',
          supabasePath: '',
          success: false,
          error: conversionResult.error || 'Error convirtiendo a WebP'
        };
      }

      // 3. Subir a Supabase
      const uploadResult = await this.uploadToSupabase(conversionResult.webpPath);
      if (!uploadResult.success || !uploadResult.publicUrl) {
        // Limpiar archivos temporales
        await this.cleanupFile(downloadResult.filepath);
        await this.cleanupFile(conversionResult.webpPath);
        return {
          originalUrl: imageUrl,
          supabaseUrl: '',
          supabasePath: '',
          success: false,
          error: uploadResult.error || 'Error subiendo a Supabase'
        };
      }

      // 4. Limpiar archivos temporales
      await this.cleanupFile(downloadResult.filepath);
      await this.cleanupFile(conversionResult.webpPath);

      Logger.success(`Imagen procesada exitosamente: ${imageUrl} -> ${uploadResult.publicUrl}`);

      return {
        originalUrl: imageUrl,
        supabaseUrl: uploadResult.publicUrl,
        supabasePath: uploadResult.path ?? '',
        width: conversionResult.width,
        height: conversionResult.height,
        fileSize: conversionResult.fileSize,
        success: true
      };

    } catch (error: any) {
      Logger.error(`Error procesando imagen ${imageUrl}: ${error.message}`);
      return {
        originalUrl: imageUrl,
        supabaseUrl: '',
        supabasePath: '',
        success: false,
        error: error.message
      };
    }
  }

  private async downloadImage(url: string, retryCount = 0): Promise<{
    success: boolean;
    filepath?: string;
    error?: string;
  }> {
    try {
      // Limpiar y validar URL
      url = url.trim();
      
      // Convertir HTTP a HTTPS para dominios conocidos
      if (url.startsWith('http://impulsogaleria.com')) {
        url = url.replace('http://', 'https://');
      }

      // Crear hash único para el nombre de archivo
      const hash = crypto.createHash('md5').update(url).digest('hex');
      const filename = `${hash}.tmp`;
      const filepath = path.join(this.config.tempDir, filename);

      // Headers que simulan un navegador
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
        'Referer': 'https://impulsogaleria.com/',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      };

      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'arraybuffer',
        timeout: this.config.timeout,
        maxRedirects: 5,
        headers: headers,
        validateStatus: status => status < 400
      });

      // Verificar que la respuesta sea una imagen
      const contentType = response.headers['content-type'] || '';
      if (!contentType.startsWith('image/')) {
        throw new Error(`El contenido no es una imagen: ${contentType}`);
      }

      // Guardar archivo temporal
      await fs.writeFile(filepath, response.data);
      
      return { success: true, filepath };

    } catch (error: any) {
      if (retryCount < this.config.retryCount) {
        const waitTime = 2000 * (retryCount + 1);
        Logger.warning(`Error descargando ${url}, reintentando (${retryCount + 1}/${this.config.retryCount}) después de ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.downloadImage(url, retryCount + 1);
      }

      Logger.error(`Error al descargar imagen ${url}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private async convertToWebP(filepath: string): Promise<{
    success: boolean;
    webpPath?: string;
    width?: number;
    height?: number;
    fileSize?: number;
    error?: string;
  }> {
    try {
      const webpFilename = `${path.basename(filepath, path.extname(filepath))}.webp`;
      const webpPath = path.join(this.config.tempDir, webpFilename);

      // Obtener metadata de la imagen original
      const metadata = await sharp(filepath).metadata();

      // Convertir a WebP
      const info = await sharp(filepath)
        .webp(this.config.webpOptions)
        .toFile(webpPath);

      return {
        success: true,
        webpPath,
        width: metadata.width,
        height: metadata.height,
        fileSize: info.size
      };

    } catch (error: any) {
      Logger.error(`Error convirtiendo imagen a WebP ${filepath}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private async uploadToSupabase(filepath: string): Promise<{
    success: boolean;
    publicUrl?: string;
    path?: string;
    error?: string;
  }> {
    try {
      // Generar nombre único para la imagen
      const filename = `products/${uuidv4()}.webp`;
      
      // Leer archivo
      const fileData = await fs.readFile(filepath);

      // Subir a Supabase
      const { data, error } = await this.supabase.storage
        .from(this.config.bucketName)
        .upload(filename, fileData, {
          contentType: 'image/webp',
          upsert: true
        });

      if (error) throw error;

      // Obtener URL pública
      const { data: urlData } = this.supabase.storage
        .from(this.config.bucketName)
        .getPublicUrl(filename);

      return {
        success: true,
        publicUrl: urlData.publicUrl,
        path: filename
      };

    } catch (error: any) {
      Logger.error(`Error subiendo imagen a Supabase ${filepath}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private async cleanupFile(filepath: string): Promise<void> {
    try {
      if (fsSync.existsSync(filepath)) {
        await fs.unlink(filepath);
      }
    } catch (error) {
      // Ignorar errores de limpieza
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (fsSync.existsSync(this.config.tempDir)) {
        await fs.rm(this.config.tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      Logger.warning('Error durante la limpieza de archivos temporales');
    }
  }

  // Método estático para crear una instancia con configuración por defecto
  static createDefault(): ImageProcessorService {
    const config: ImageProcessorConfig = {
      supabaseUrl: process.env.SUPABASE_URL!,
      supabaseKey: process.env.SUPABASE_KEY!,
      bucketName: 'impulso-shop-images',
      tempDir: './temp-images',
      webpOptions: {
        quality: 85,
        effort: 4
      },
      retryCount: 3,
      timeout: 30000
    };

    // Validación ya se hace en index.ts, pero por seguridad
    if (!config.supabaseUrl || !config.supabaseKey) {
      throw new Error(`Variables de entorno de Supabase no configuradas correctamente:
        SUPABASE_URL: ${config.supabaseUrl ? 'OK' : 'MISSING'}
        SUPABASE_KEY: ${config.supabaseKey ? 'OK' : 'MISSING'}`);
    }

    return new ImageProcessorService(config);
  }
}