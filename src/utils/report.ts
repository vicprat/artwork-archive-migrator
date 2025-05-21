export const generateHtmlReport = (reportData: any): string => {
    const { summary, duplicates, genericTitleStats, stats } = reportData;
    
    const tableRows = duplicates.map((dupe: any, index: number) => {
      const isGenericTitle = dupe.normalizedTitle === 'untitled';
      const hasPriceDiff = parseFloat(dupe.priceDifference) > 100;
      const hasArtistMismatch = !dupe.sameArtist;
      
      let rowClass = '';
      if (isGenericTitle) rowClass = 'generic-title';
      else if (hasPriceDiff) rowClass = 'price-diff-row';
      else if (hasArtistMismatch) rowClass = 'artist-mismatch';
      
      return `
      <tr class="${rowClass}">
        <td>${index + 1}</td>
        <td>${dupe.title}</td>
        <td>${dupe.artworkArtist || 'N/A'}</td>
        <td>${dupe.wooArtist || 'N/A'}</td>
        <td>${dupe.artworkSKU}</td>
        <td>${dupe.wooSKU}</td>
        <td>$${dupe.artworkPrice}</td>
        <td>$${dupe.wooPrice}</td>
        <td class="${parseFloat(dupe.priceDifference) > 100 ? 'price-diff' : ''}" data-value="${dupe.priceDifference}">
          $${dupe.priceDifference} (${dupe.percentPriceDifference}%)
        </td>
        <td>${dupe.artworkStatus}</td>
        <td>${dupe.wooStatus}</td>
        <td>${dupe.dimensions?.artwork || 'N/A'}</td>
        <td>${dupe.dimensions?.woo || 'N/A'}</td>
        <td>${dupe.matchType || 'title'}</td>
        <td>${dupe.similarity ? (dupe.similarity * 100).toFixed(1) + '%' : 'N/A'}</td>
        <td>${dupe.sameArtist ? '✓' : '✗'}</td>
        <td>${dupe.sameDimensions ? '✓' : '✗'}</td>
        <td>${dupe.resolution}</td>
      </tr>
    `}).join('');
    
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reporte de Productos Duplicados</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          margin: 0;
          padding: 20px;
          color: #333;
        }
        h1, h2, h3 {
          color: #2c3e50;
        }
        .container {
          max-width: 1400px;
          margin: 0 auto;
        }
        .summary {
          background-color: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
          margin-bottom: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 0.9em;
        }
        th, td {
          padding: 8px;
          border: 1px solid #ddd;
          text-align: left;
        }
        th {
          background-color: #f2f2f2;
          position: sticky;
          top: 0;
        }
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        tr:hover {
          background-color: #f1f1f1;
        }
        .generic-title {
          background-color: #fffde7 !important;
        }
        .price-diff-row {
          background-color: #ffebee !important;
        }
        .artist-mismatch {
          background-color: #e3f2fd !important;
        }
        .price-diff {
          font-weight: bold;
          color: #e53935;
        }
        .stats {
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 20px;
          margin-bottom: 20px;
        }
        .stat-card {
          background-color: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
          flex: 1;
          min-width: 200px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .filters {
          margin-bottom: 20px;
          padding: 15px;
          background-color: #f8f9fa;
          border-radius: 5px;
          display: flex;
          flex-wrap: wrap;
          gap: 15px;
        }
        .filter-group {
          margin-right: 20px;
        }
        .legend {
          margin-top: 20px;
          font-size: 0.9em;
          color: #666;
        }
        .badge {
          display: inline-block;
          padding: 3px 7px;
          border-radius: 3px;
          font-size: 0.8em;
          margin-right: 5px;
        }
        .badge-generic {
          background-color: #fffde7;
          color: #212529;
          border: 1px solid #ffd600;
        }
        .badge-price {
          background-color: #ffebee;
          color: #212529;
          border: 1px solid #f44336;
        }
        .badge-artist {
          background-color: #e3f2fd;
          color: #212529;
          border: 1px solid #2196f3;
        }
        .checkbox-container {
          display: flex;
          align-items: center;
          margin-right: 10px;
        }
        .checkbox-container label {
          margin-left: 5px;
        }
        .match-type-select {
          padding: 5px;
          margin-left: 5px;
        }
        .stats-title {
          font-weight: bold;
          margin-bottom: 5px;
          border-bottom: 1px solid #ddd;
          padding-bottom: 3px;
        }
        .sort-controls {
          margin-bottom: 10px;
        }
        .csv-export {
          margin-top: 20px;
          padding: 10px;
          background-color: #e8f5e9;
          border-radius: 5px;
          border: 1px solid #66bb6a;
        }
        @media print {
          body {
            font-size: 12pt;
          }
          .no-print {
            display: none;
          }
          .container {
            width: 100%;
            max-width: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Reporte de Productos Duplicados</h1>
        
        <div class="summary">
          <h2>Resumen</h2>
          <p>Reporte generado el: ${new Date(summary.date).toLocaleString()}</p>
          <p>Total de productos duplicados encontrados: <strong>${summary.totalDuplicates}</strong></p>
          <p>Estrategia de detección utilizada: <strong>${summary.matchingStrategy}</strong>${summary.similarityThreshold !== 'N/A' ? ` (umbral: ${summary.similarityThreshold})` : ''}</p>
          <p>Estrategia de resolución utilizada: <strong>${summary.resolutionStrategy}</strong></p>
        </div>
        
        <div class="stats">
          <div class="stat-card">
            <div class="stats-title">Estadísticas de Fuentes</div>
            <p>Total de productos de Artwork Archive: <strong>${summary.artworkProductsCount}</strong></p>
            <p>Total de productos de WooCommerce: <strong>${summary.wooProductsCount}</strong></p>
            <p>Porcentaje de duplicados: <strong>${((summary.totalDuplicates / (summary.artworkProductsCount + summary.wooProductsCount)) * 100).toFixed(2)}%</strong></p>
          </div>
          
          <div class="stat-card">
            <div class="stats-title">Títulos Genéricos</div>
            <p>Instancias de "Sin Título/Sin Titulo": <strong>${genericTitleStats.sinTitulo}</strong></p>
            <p>Instancias de "S/T": <strong>${genericTitleStats.st}</strong></p>
            <p>Todas las obras sin título: <strong>${stats.genericTitles.count}</strong> (${stats.genericTitles.percentage}%)</p>
          </div>
          
          <div class="stat-card">
            <div class="stats-title">Diferencias de Precio</div>
            <p>Diferencias significativas de precio (>$100): <strong>${stats.priceDifferences.significantCount}</strong> (${stats.priceDifferences.significantPercentage}%)</p>
            <p>Diferencia de precio promedio: <strong>$${stats.priceDifferences.averageDifference}</strong></p>
            <p>Diferencia de precio máxima: <strong>$${stats.priceDifferences.maxDifference}</strong></p>
          </div>
          
          <div class="stat-card">
            <div class="stats-title">Discrepancias en Artistas</div>
            <p>Productos con diferencias en nombre de artista: <strong>${stats.artistMismatches.count}</strong> (${stats.artistMismatches.percentage}%)</p>
          </div>
        </div>
        
        <div class="filters no-print">
          <div class="filter-group">
            <h3>Resaltar</h3>
            <div class="checkbox-container">
              <input type="checkbox" id="genericFilter" checked> 
              <label for="genericFilter">
                <span class="badge badge-generic">Títulos genéricos</span>
              </label>
            </div>
            <div class="checkbox-container">
              <input type="checkbox" id="priceDiffFilter" checked> 
              <label for="priceDiffFilter">
                <span class="badge badge-price">Diferencias de precio >$100</span>
              </label>
            </div>
            <div class="checkbox-container">
              <input type="checkbox" id="artistMismatchFilter" checked> 
              <label for="artistMismatchFilter">
                <span class="badge badge-artist">Discrepancias en artistas</span>
              </label>
            </div>
          </div>
          
          <div class="filter-group">
            <h3>Filtrar por tipo de coincidencia</h3>
            <select id="matchTypeFilter" class="match-type-select">
              <option value="all">Todos los tipos</option>
              <option value="title">Solo título</option>
              <option value="title+artist">Título + Artista</option>
              <option value="fuzzy">Coincidencias aproximadas</option>
            </select>
          </div>
          
          <div class="filter-group">
            <h3>Ordenar por</h3>
            <div class="sort-controls">
              <select id="sortField" class="match-type-select">
                <option value="title">Título</option>
                <option value="priceDiff">Diferencia de precio</option>
                <option value="similarity">Similitud</option>
              </select>
              <select id="sortOrder" class="match-type-select">
                <option value="asc">Ascendente</option>
                <option value="desc">Descendente</option>
              </select>
              <button id="sortBtn">Ordenar</button>
            </div>
          </div>
        </div>
        
        <div class="csv-export no-print">
          <h3>Exportar Datos</h3>
          <button id="exportButton">Exportar a CSV</button>
        </div>
        
        <h2>Productos Duplicados (${summary.totalDuplicates})</h2>
        
        <table id="duplicatesTable">
          <thead>
            <tr>
              <th>#</th>
              <th>Título</th>
              <th>Artista AA</th>
              <th>Artista Woo</th>
              <th>SKU AA</th>
              <th>SKU Woo</th>
              <th>Precio AA</th>
              <th>Precio Woo</th>
              <th>Dif. Precio</th>
              <th>Estado AA</th>
              <th>Estado Woo</th>
              <th>Dim. AA</th>
              <th>Dim. Woo</th>
              <th>Tipo Coincidencia</th>
              <th>Similitud</th>
              <th>Mismo Artista</th>
              <th>Mismas Dim.</th>
              <th>Resolución</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        
        <div class="legend">
          <h3>Leyenda</h3>
          <p><span class="badge badge-generic">Título Genérico</span> Productos con títulos genéricos como "Sin Título" o "S/T".</p>
          <p><span class="badge badge-price">Diferencia de Precio</span> Productos con diferencias significativas de precio entre las dos fuentes (>$100).</p>
          <p><span class="badge badge-artist">Discrepancia de Artista</span> Productos donde los nombres de los artistas no coinciden entre las fuentes.</p>
        </div>
      </div>
      
      <script>
        document.addEventListener('DOMContentLoaded', function() {
          // Filtros
          const genericFilter = document.getElementById('genericFilter');
          const priceDiffFilter = document.getElementById('priceDiffFilter');
          const artistMismatchFilter = document.getElementById('artistMismatchFilter');
          const matchTypeFilter = document.getElementById('matchTypeFilter');
          const table = document.getElementById('duplicatesTable');
          const rows = table.querySelectorAll('tbody tr');
          
          // Función para aplicar filtros
          function applyFilters() {
            rows.forEach(row => {
              // Comenzar con visible
              let shouldShow = true;
              
              // Filtro por tipo de coincidencia
              if (matchTypeFilter.value !== 'all') {
                const matchTypeCell = row.cells[13].textContent.trim();
                if (!matchTypeCell.includes(matchTypeFilter.value)) {
                  shouldShow = false;
                }
              }
              
              // Resaltado (no oculta)
              row.classList.toggle('generic-title', genericFilter.checked && row.classList.contains('generic-title'));
              row.classList.toggle('price-diff-row', priceDiffFilter.checked && row.classList.contains('price-diff-row'));
              row.classList.toggle('artist-mismatch', artistMismatchFilter.checked && row.classList.contains('artist-mismatch'));
              
              // Establecer visibilidad
              row.style.display = shouldShow ? '' : 'none';
            });
          }
          
          // Inicializar filtros
          genericFilter.addEventListener('change', applyFilters);
          priceDiffFilter.addEventListener('change', applyFilters);
          artistMismatchFilter.addEventListener('change', applyFilters);
          matchTypeFilter.addEventListener('change', applyFilters);
          
          // Ordenación
          const sortField = document.getElementById('sortField');
          const sortOrder = document.getElementById('sortOrder');
          const sortBtn = document.getElementById('sortBtn');
          
          sortBtn.addEventListener('click', function() {
            const tbody = table.querySelector('tbody');
            const rowsArray = Array.from(rows);
            
            rowsArray.sort((a, b) => {
              let valA, valB;
              
              if (sortField.value === 'title') {
                valA = a.cells[1].textContent.trim().toLowerCase();
                valB = b.cells[1].textContent.trim().toLowerCase();
              } else if (sortField.value === 'priceDiff') {
                valA = parseFloat(a.cells[8].getAttribute('data-value'));
                valB = parseFloat(b.cells[8].getAttribute('data-value'));
              } else if (sortField.value === 'similarity') {
                // Extraer números de la columna de similitud
                const numA = parseFloat(a.cells[14].textContent.replace('%', ''));
                const numB = parseFloat(b.cells[14].textContent.replace('%', ''));
                valA = isNaN(numA) ? 0 : numA;
                valB = isNaN(numB) ? 0 : numB;
              }
              
              if (sortOrder.value === 'asc') {
                return valA > valB ? 1 : -1;
              } else {
                return valA < valB ? 1 : -1;
              }
            });
            
            // Eliminar todas las filas
            while (tbody.firstChild) {
              tbody.removeChild(tbody.firstChild);
            }
            
            // Agregar filas ordenadas
            rowsArray.forEach(row => tbody.appendChild(row));
            
            // Reaplicar filtros
            applyFilters();
          });
          
          // Exportación a CSV
          document.getElementById('exportButton').addEventListener('click', function() {
            const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
            
            let csvContent = headers.join(',') + '\\n';
            
            // Obtener filas visibles
            const visibleRows = Array.from(rows).filter(row => row.style.display !== 'none');
            
            visibleRows.forEach(row => {
              const rowData = Array.from(row.cells).map(cell => {
                // Limpiar datos de celda para CSV (escapar comillas, eliminar signos $)
                let data = cell.textContent.trim().replace(/\\$/g, '').replace(/"/g, '""');
                // Envolver en comillas si contiene comas
                return data.includes(',') ? '"' + data + '"' : data;
              });
              csvContent += rowData.join(',') + '\\n';
            });
            
            // Crear enlace de descarga
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('hidden', '');
            a.setAttribute('href', url);
            a.setAttribute('download', 'productos_duplicados.csv');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          });
          
          // Aplicación inicial de filtros
          applyFilters();
        });
      </script>
    </body>
    </html>
    `;
  };

  
 export const extractDimensions = (html: string): string => {
    if (!html) return '';
    
    const dimensionsRegex = /<strong>Dimensions:<\/strong>\s*([^<]+)/i;
    const match = html.match(dimensionsRegex);
    
    if (match && match[1]) {
      return match[1].trim();
    }
    
    const heightRegex = /(\d+(\.\d+)?)\s*h/i;
    const widthRegex = /(\d+(\.\d+)?)\s*w/i;
    const depthRegex = /(\d+(\.\d+)?)\s*d/i;
    
    const heightMatch = html.match(heightRegex);
    const widthMatch = html.match(widthRegex);
    const depthMatch = html.match(depthRegex);
    
    if (heightMatch || widthMatch || depthMatch) {
      const dimensions = [];
      if (heightMatch) dimensions.push(`${heightMatch[1]}h`);
      if (widthMatch) dimensions.push(`${widthMatch[1]}w`);
      if (depthMatch) dimensions.push(`${depthMatch[1]}d`);
      
      return dimensions.join(' x ');
    }
    
    return '';
  }