// services/HandleGeneratorService.ts
export class HandleGeneratorService {
  private static usedHandles = new Set<string>();

  /**
   * Genera un handle único para el producto
   */
  static generateUniqueHandle(title: string, sku?: string, sourceType?: string): string {
    // 1. Normalizar el título
    let baseHandle = this.normalizeTitle(title);
    
    // 2. Si el handle está vacío o es inválido, usar fallback
    if (!baseHandle || baseHandle.length < 2) {
      baseHandle = this.createFallbackHandle(title, sku, sourceType);
    }
    
    // 3. Hacer único si ya existe
    const uniqueHandle = this.makeUnique(baseHandle);
    
    // 4. Registrar como usado
    this.usedHandles.add(uniqueHandle);
    
    return uniqueHandle;
  }

  /**
   * Normaliza un título para convertirlo en handle válido
   */
  private static normalizeTitle(title: string): string {
    if (!title || typeof title !== 'string') {
      return '';
    }

    return title
      .trim()
      .toLowerCase()
      // Reemplazar caracteres especiales y acentos
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Reemplazar caracteres no alfanuméricos con guiones
      .replace(/[^a-z0-9\s-]/g, '')
      // Reemplazar espacios múltiples con uno solo
      .replace(/\s+/g, ' ')
      // Reemplazar espacios con guiones
      .replace(/\s/g, '-')
      // Remover guiones múltiples
      .replace(/-+/g, '-')
      // Remover guiones al inicio y final
      .replace(/^-+|-+$/g, '')
      // Limitar longitud
      .substring(0, 50);
  }

  /**
   * Crea un handle de respaldo cuando el título es problemático
   */
  private static createFallbackHandle(title: string, sku?: string, sourceType?: string): string {
    const timestamp = Date.now().toString();
    
    // Intentar usar SKU si está disponible
    if (sku) {
      const normalizedSku = sku.toLowerCase().replace(/[^a-z0-9]/g, '-');
      return `${normalizedSku}-${timestamp.slice(-6)}`;
    }
    
    // Usar tipo de fuente + timestamp
    const source = sourceType?.toLowerCase() || 'product';
    return `${source}-${timestamp.slice(-8)}`;
  }

  /**
   * Hace único un handle agregando sufijo numérico si es necesario
   */
  private static makeUnique(baseHandle: string): string {
    let handle = baseHandle;
    let counter = 1;
    
    while (this.usedHandles.has(handle)) {
      handle = `${baseHandle}-${counter}`;
      counter++;
    }
    
    return handle;
  }

  /**
   * Limpia el registro de handles usados (para testing o reset)
   */
  static clearUsedHandles(): void {
    this.usedHandles.clear();
  }

  /**
   * Pre-carga handles existentes desde la base de datos
   */
  static async loadExistingHandles(prisma: any): Promise<void> {
    try {
      const existingProducts = await prisma.product.findMany({
        select: { handle: true }
      });
      
      existingProducts.forEach((product: any) => {
        if (product.handle) {
          this.usedHandles.add(product.handle);
        }
      });
      
      console.log(`Loaded ${this.usedHandles.size} existing handles`);
    } catch (error) {
      console.warn('Could not load existing handles:', error);
    }
  }
}