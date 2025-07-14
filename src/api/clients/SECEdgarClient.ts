/**
 * SEC EDGAR API client for filing data
 */

import { BaseClient, BaseClientConfig } from '../BaseClient.js';
import { loggerUtils } from '../../config/logger.js';
import { load } from 'cheerio';

export interface SECFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  acceptanceDateTime: string;
  act: string;
  form: string;
  fileNumber: string;
  filmNumber: string;
  items: string;
  size: number;
  isXBRL: number;
  isInlineXBRL: number;
  primaryDocument: string;
  primaryDocumentDescription: string;
}

export interface ParsedFiling {
  accessionNumber: string;
  form: string;
  filingDate: string;
  reportDate: string;
  businessSummary?: string;
  riskFactors?: string[];
  financialData?: any;
  managementDiscussion?: string;
  documentText?: string;
  url: string;
}

export class SECEdgarClient extends BaseClient {
  private readonly companyTickersUrl = '/files/company_tickers.json';
  private readonly submissionsBaseUrl = '/submissions';
  private readonly archivesBaseUrl = '/Archives/edgar/data';

  constructor(config: BaseClientConfig) {
    super(config);
  }

  /**
   * Get company CIK (Central Index Key) from ticker symbol
   */
  async getCIKFromTicker(ticker: string): Promise<string | null> {
    try {
      const tickers = await this.get(this.companyTickersUrl, {}, {
        cacheTTL: 86400 * 7, // Cache for 7 days
      });

      const tickerUpper = ticker.toUpperCase();
      
      // Search through the tickers data
      for (const [key, company] of Object.entries(tickers)) {
        const companyData = company as any;
        if (companyData.ticker === tickerUpper) {
          // CIK needs to be padded with zeros to 10 digits
          return companyData.cik_str.toString().padStart(10, '0');
        }
      }

      return null;
    } catch (error) {
      loggerUtils.apiLogger.error('Error fetching CIK for ticker', {
        ticker,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Get company filings
   */
  async getCompanyFilings(
    ticker: string,
    formTypes: string[] = ['10-K', '10-Q', '8-K'],
    limit: number = 20
  ): Promise<SECFiling[]> {
    try {
      const cik = await this.getCIKFromTicker(ticker);
      if (!cik) {
        throw new Error(`CIK not found for ticker: ${ticker}`);
      }

      const submissionsData = await this.get(`${this.submissionsBaseUrl}/CIK${cik}.json`, {}, {
        cacheTTL: 3600, // 1 hour cache
      });

      const filings = submissionsData.filings?.recent;
      if (!filings) {
        return [];
      }

      const results: SECFiling[] = [];
      const maxLength = Math.min(filings.accessionNumber?.length || 0, limit);

      for (let i = 0; i < maxLength; i++) {
        const form = filings.form[i];
        
        if (formTypes.includes(form)) {
          results.push({
            accessionNumber: filings.accessionNumber[i],
            filingDate: filings.filingDate[i],
            reportDate: filings.reportDate[i],
            acceptanceDateTime: filings.acceptanceDateTime[i],
            act: filings.act[i],
            form: form,
            fileNumber: filings.fileNumber[i],
            filmNumber: filings.filmNumber[i],
            items: filings.items[i] || '',
            size: filings.size[i],
            isXBRL: filings.isXBRL[i],
            isInlineXBRL: filings.isInlineXBRL[i],
            primaryDocument: filings.primaryDocument[i],
            primaryDocumentDescription: filings.primaryDocumentDescription[i],
          });
        }
      }

      return results.slice(0, limit);
    } catch (error) {
      loggerUtils.apiLogger.error('Error fetching company filings', {
        ticker,
        formTypes,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Parse and extract content from a specific filing
   */
  async parseFiling(ticker: string, accessionNumber: string): Promise<ParsedFiling | null> {
    try {
      const cik = await this.getCIKFromTicker(ticker);
      if (!cik) {
        throw new Error(`CIK not found for ticker: ${ticker}`);
      }

      // Remove dashes from accession number for URL
      const accessionNumberClean = accessionNumber.replace(/-/g, '');
      
      // Try to get the filing document
      const filingUrl = `${this.archivesBaseUrl}/${cik}/${accessionNumberClean}/${accessionNumber}.txt`;
      
      let documentText: string;
      try {
        documentText = await this.getFilingDocument(filingUrl);
      } catch (error) {
        // Try alternative URL format
        const alternativeUrl = `${this.archivesBaseUrl}/${cik}/${accessionNumberClean}/${accessionNumber}-index.html`;
        documentText = await this.getFilingDocument(alternativeUrl);
      }

      // Determine form type from accession number or document content
      const formType = this.extractFormType(documentText);
      
      const parsed: ParsedFiling = {
        accessionNumber,
        form: formType,
        filingDate: this.extractFilingDate(documentText),
        reportDate: this.extractReportDate(documentText),
        url: filingUrl,
        documentText: documentText.substring(0, 50000), // Limit size
      };

      // Extract specific content based on form type
      if (formType === '10-K' || formType === '10-Q') {
        parsed.businessSummary = this.extractBusinessSummary(documentText);
        parsed.riskFactors = this.extractRiskFactors(documentText);
        parsed.managementDiscussion = this.extractManagementDiscussion(documentText);
        parsed.financialData = this.extractFinancialData(documentText);
      } else if (formType === '8-K') {
        parsed.businessSummary = this.extractEightKContent(documentText);
      }

      return parsed;
    } catch (error) {
      loggerUtils.apiLogger.error('Error parsing filing', {
        ticker,
        accessionNumber,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Get insider transactions from SEC filings
   */
  async getInsiderTransactions(ticker: string): Promise<any[]> {
    try {
      const filings = await this.getCompanyFilings(ticker, ['4'], 50);
      
      const transactions = [];
      
      // Parse up to 10 recent Form 4 filings
      for (const filing of filings.slice(0, 10)) {
        try {
          const parsed = await this.parseFiling(ticker, filing.accessionNumber);
          if (parsed) {
            const transaction = this.extractInsiderTransaction(parsed.documentText || '');
            if (transaction) {
              transactions.push({
                ...transaction,
                filingDate: filing.filingDate,
                accessionNumber: filing.accessionNumber,
              });
            }
          }
        } catch (error) {
          // Continue with next filing if one fails
          continue;
        }
      }

      return transactions;
    } catch (error) {
      loggerUtils.apiLogger.error('Error fetching insider transactions', {
        ticker,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get the actual filing document content
   */
  private async getFilingDocument(url: string): Promise<string> {
    try {
      const response = await this.client.get(url, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 30000,
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch filing document: ${error.message}`);
    }
  }

  /**
   * Extract form type from document content
   */
  private extractFormType(content: string): string {
    const formMatch = content.match(/FORM TYPE:\s*([^\r\n]+)/i) || 
                     content.match(/<TYPE>([^<]+)/i) ||
                     content.match(/FORM\s+([0-9A-Z-]+)/i);
    
    return formMatch ? formMatch[1].trim() : 'UNKNOWN';
  }

  /**
   * Extract filing date from document
   */
  private extractFilingDate(content: string): string {
    const dateMatch = content.match(/FILED AS OF DATE:\s*([^\r\n]+)/i) ||
                     content.match(/ACCEPTANCE-DATETIME:\s*([^\r\n]+)/i);
    
    if (dateMatch) {
      const dateStr = dateMatch[1].trim();
      // Convert YYYYMMDD format to YYYY-MM-DD
      if (dateStr.match(/^\d{8}$/)) {
        return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      }
      return dateStr;
    }
    
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Extract report date from document
   */
  private extractReportDate(content: string): string {
    const dateMatch = content.match(/PERIOD OF REPORT:\s*([^\r\n]+)/i) ||
                     content.match(/REPORT DATE:\s*([^\r\n]+)/i);
    
    if (dateMatch) {
      const dateStr = dateMatch[1].trim();
      if (dateStr.match(/^\d{8}$/)) {
        return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      }
      return dateStr;
    }
    
    return this.extractFilingDate(content);
  }

  /**
   * Extract business summary from 10-K/10-Q filings
   */
  private extractBusinessSummary(content: string): string {
    // Look for Item 1 - Business section
    const businessMatch = content.match(/ITEM\s+1\.\s*BUSINESS[^]*?(?=ITEM\s+[12]|$)/i);
    if (businessMatch) {
      return this.cleanText(businessMatch[0]).substring(0, 5000);
    }

    // Alternative patterns
    const altMatch = content.match(/BUSINESS[^]*?(?=RISK\s+FACTORS|ITEM\s+[12]|$)/i);
    if (altMatch) {
      return this.cleanText(altMatch[0]).substring(0, 5000);
    }

    return '';
  }

  /**
   * Extract risk factors from 10-K/10-Q filings
   */
  private extractRiskFactors(content: string): string[] {
    const riskMatch = content.match(/ITEM\s+1A\.\s*RISK\s+FACTORS[^]*?(?=ITEM\s+[12]|$)/i);
    if (!riskMatch) return [];

    const riskText = this.cleanText(riskMatch[0]);
    
    // Split into individual risk factors
    const risks = riskText.split(/(?:\n|^)\s*[•·▪▫]\s*|\n\s*\d+\.\s*/)
      .filter(risk => risk.trim().length > 50)
      .map(risk => risk.trim())
      .slice(0, 20); // Limit to 20 risks

    return risks;
  }

  /**
   * Extract management discussion and analysis
   */
  private extractManagementDiscussion(content: string): string {
    const mdaMatch = content.match(/ITEM\s+[27]\.\s*MANAGEMENT[^]*?(?=ITEM\s+[38]|$)/i);
    if (mdaMatch) {
      return this.cleanText(mdaMatch[0]).substring(0, 5000);
    }
    return '';
  }

  /**
   * Extract financial data from filing
   */
  private extractFinancialData(content: string): any {
    const financial: any = {};

    // Look for common financial metrics
    const revenueMatch = content.match(/(?:Total\s+)?(?:Net\s+)?Revenue[^]*?(\$?[\d,]+(?:\.\d+)?)/i);
    if (revenueMatch) {
      financial.revenue = this.parseNumber(revenueMatch[1]);
    }

    const netIncomeMatch = content.match(/Net\s+Income[^]*?(\$?[\d,]+(?:\.\d+)?)/i);
    if (netIncomeMatch) {
      financial.netIncome = this.parseNumber(netIncomeMatch[1]);
    }

    const assetsMatch = content.match(/Total\s+Assets[^]*?(\$?[\d,]+(?:\.\d+)?)/i);
    if (assetsMatch) {
      financial.totalAssets = this.parseNumber(assetsMatch[1]);
    }

    return financial;
  }

  /**
   * Extract content from 8-K filings
   */
  private extractEightKContent(content: string): string {
    // Look for Item sections in 8-K
    const itemMatch = content.match(/ITEM\s+\d+\.[^]*?(?=ITEM\s+\d+|SIGNATURES|$)/i);
    if (itemMatch) {
      return this.cleanText(itemMatch[0]).substring(0, 3000);
    }
    return '';
  }

  /**
   * Extract insider transaction details from Form 4
   */
  private extractInsiderTransaction(content: string): any | null {
    try {
      // This is a simplified parser - Form 4 parsing can be complex
      const nameMatch = content.match(/REPORTING\s+OWNER[^]*?NAME[^]*?([A-Z][A-Z\s,]+)/i);
      const transactionMatch = content.match(/TRANSACTION[^]*?(\d+)[^]*?(BUY|SELL|ACQUIRED|DISPOSED)/i);
      
      if (nameMatch && transactionMatch) {
        return {
          reporterName: nameMatch[1].trim(),
          shares: parseInt(transactionMatch[1]),
          transactionType: transactionMatch[2].toLowerCase(),
        };
      }
    } catch (error) {
      // Return null if parsing fails
    }
    
    return null;
  }

  /**
   * Clean and normalize text content
   */
  private cleanText(text: string): string {
    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&[a-zA-Z0-9#]+;/g, ' ') // Remove HTML entities
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/_{3,}/g, '') // Remove underlines
      .replace(/[^\w\s\.\,\!\?\;\:\-\(\)\$\%]/g, '') // Remove special characters
      .trim();
  }

  /**
   * Parse number from text (handles commas, dollar signs, etc.)
   */
  private parseNumber(text: string): number | null {
    const cleanText = text.replace(/[\$,\s]/g, '');
    const number = parseFloat(cleanText);
    return isNaN(number) ? null : number;
  }

  /**
   * Search for companies by name or ticker
   */
  async searchCompanies(query: string): Promise<any[]> {
    try {
      const tickers = await this.get(this.companyTickersUrl, {}, {
        cacheTTL: 86400 * 7, // Cache for 7 days
      });

      const queryLower = query.toLowerCase();
      const results = [];

      for (const [key, company] of Object.entries(tickers)) {
        const companyData = company as any;
        
        if (companyData.ticker.toLowerCase().includes(queryLower) ||
            companyData.title.toLowerCase().includes(queryLower)) {
          results.push({
            cik: companyData.cik_str.toString().padStart(10, '0'),
            ticker: companyData.ticker,
            title: companyData.title,
          });
        }

        if (results.length >= 20) break; // Limit results
      }

      return results;
    } catch (error) {
      loggerUtils.apiLogger.error('Error searching companies', {
        query,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Validate connection by checking if we can access the tickers file
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.get(this.companyTickersUrl, {}, { 
        skipCache: true,
        timeout: 10000,
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default SECEdgarClient;