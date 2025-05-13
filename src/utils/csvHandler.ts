import * as fs from 'fs';
import csvParser from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import { Logger } from './logger';

export class CsvHandler {
  static async readCsv<T extends Record<string, any>>(filePath: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const results: T[] = [];
      
      if (!fs.existsSync(filePath)) {
        reject(new Error(`File not found: ${filePath}`));
        return;
      }

      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (data: T) => results.push(data))
        .on('end', () => {
          Logger.success(`Successfully read ${results.length} records from ${filePath}`);
          resolve(results);
        })
        .on('error', (error: Error) => {
          Logger.error(`Error reading CSV file: ${error.message}`);
          reject(error);
        });
    });
  }

  static async writeCsv(filePath: string, data: any[], headers: string[]): Promise<void> {
    try {
      const csvWriter = createObjectCsvWriter({
        path: filePath,
        header: headers.map(h => ({ id: h, title: h }))
      });

      await csvWriter.writeRecords(data);
      Logger.success(`Successfully wrote ${data.length} records to ${filePath}`);
    } catch (error: any) {
      Logger.error(`Error writing CSV file: ${error.message}`);
      throw error;
    }
  }
}