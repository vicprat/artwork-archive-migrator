// src/config/index.ts
export const config = {
  database: {
    url: process.env.DATABASE_URL!
  },
  supabase: {
    url: process.env.SUPABASE_URL!,
    key: process.env.SUPABASE_KEY!
  },
  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || ''
  },
  images: {
    bucketName: 'impulso-shop-images',
    tempDir: './temp-images',
    webpOptions: {
      quality: 85,
      effort: 4
    },
    retryCount: 3,
    timeout: 30000
  }
};

// Función para validar configuración
export function validateConfig(): void {
  const requiredVars = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_KEY'];
  const missingVars = requiredVars.filter(envVar => !process.env[envVar]);
  
  if (missingVars.length > 0) {
    throw new Error(`Variables de entorno requeridas no encontradas: ${missingVars.join(', ')}`);
  }
}