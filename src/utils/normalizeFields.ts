export class NormalizeUtils {

  static normalizeString(str: string | undefined | null): string {
    if (!str) return '';
    
    return str
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Elimina acentos/diacríticos
      .replace(/[^\w\s-]/g, ' ') // Reemplaza caracteres especiales con espacios
      .replace(/\s+/g, ' ') // Reemplaza múltiples espacios con un solo espacio
      .trim();
  }


  static normalizeTitle(title: string | undefined | null): string {
    if (!title) return '';
    
    let normalized = this.normalizeString(title);
    
    if (
      normalized === 'sin titulo' || 
      normalized === 'sin título' || 
      normalized === 'sin titulos' || 
      normalized === 's t' || 
      normalized === 's/t'
    ) {
      return 'untitled';
    }
    
    normalized = normalized
      .replace(/^(obra|pieza|serie|composicion|composición)\s+/i, '')
      .replace(/\s+(edicion|edición|reproduccion|reproducción)$/i, '');
    
    return normalized;
  }


  static normalizeArtist(artist: string | undefined | null): string {
    if (!artist) return '';
    
    let normalized = this.normalizeString(artist);
    
    // Elimina títulos y sufijos comunes
    normalized = normalized
      .replace(/^(sr|sra|dr|dra|prof|ing)\s+/i, '')
      .replace(/\s+(jr|sr|ii|iii|iv)$/i, '');
    
    return normalized;
  }

  static normalizeDimensions(dimensions: string | undefined | null): string {
    if (!dimensions) return '';
    
    let normalized = dimensions.toLowerCase()
      .replace(/[^\d\.hwdxcmin\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    return normalized;
  }

  static getSimilarity(str1: string, str2: string): number {
    if (!str1 && !str2) return 1;
    if (!str1 || !str2) return 0;
    
    const norm1 = this.normalizeString(str1);
    const norm2 = this.normalizeString(str2);
    
    if (norm1 === norm2) return 1;
    
    const len1 = norm1.length;
    const len2 = norm2.length;
    const maxLen = Math.max(len1, len2);
    
    if (maxLen === 0) return 1;
    
    const distance = this.levenshteinDistance(norm1, norm2);
    return 1 - distance / maxLen;
  }
  
  
  private static levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    

    const d: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(null));
    
    for (let i = 0; i <= m; i++) d[i][0] = i;
    for (let j = 0; j <= n; j++) d[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,     
          d[i][j - 1] + 1,      
          d[i - 1][j - 1] + cost 
        );
      }
    }
    
    return d[m][n];
  }
}


export const generateComparisonKeys = (
    title: string, 
    artist: string, 
    dimensions: string,
    matchingStrategy: string
  ): string[] => {
    const keys: string[] = [];
    
    switch (matchingStrategy) {
      case 'exactTitle':
        keys.push(title.toLowerCase().trim());
        break;
        
      case 'normalizedTitle':
        keys.push(NormalizeUtils.normalizeTitle(title));
        break;
        
      case 'advanced':
        keys.push(`${NormalizeUtils.normalizeTitle(title)}|${NormalizeUtils.normalizeArtist(artist)}`);
        keys.push(NormalizeUtils.normalizeTitle(title));
        break;
        
      case 'fuzzy':
        keys.push(NormalizeUtils.normalizeTitle(title));
        break;
    }
    
    return keys;
  }