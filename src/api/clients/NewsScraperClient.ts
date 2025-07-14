/**
 * News scraper client for financial news aggregation
 */

import { BaseClient, BaseClientConfig } from '../BaseClient.js';
import { loggerUtils } from '../../config/logger.js';
import { load } from 'cheerio';

export interface NewsArticle {
  title: string;
  url: string;
  description: string;
  publishedAt: string;
  source: string;
  author?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  symbols?: string[];
  category?: string;
}

export class NewsScraperClient extends BaseClient {
  private readonly sources = {
    seekingAlpha: 'https://seekingalpha.com',
    marketWatch: 'https://www.marketwatch.com',
    yahoo: 'https://finance.yahoo.com',
    cnbc: 'https://www.cnbc.com',
    reuters: 'https://www.reuters.com',
    bloomberg: 'https://www.bloomberg.com',
  };

  constructor(config: BaseClientConfig) {
    super(config);
    
    // Set user agent to avoid blocking
    this.client.interceptors.request.use((config) => {
      config.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
      config.headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
      config.headers['Accept-Language'] = 'en-US,en;q=0.5';
      config.headers['Accept-Encoding'] = 'gzip, deflate';
      config.headers['DNT'] = '1';
      config.headers['Connection'] = 'keep-alive';
      config.headers['Upgrade-Insecure-Requests'] = '1';
      return config;
    });
  }

  /**
   * Get news articles for a specific symbol
   */
  async getNewsForSymbol(symbol: string, limit: number = 20): Promise<NewsArticle[]> {
    try {
      const allArticles: NewsArticle[] = [];
      
      // Fetch from multiple sources in parallel
      const sources = [
        this.scrapeSeekingAlpha(symbol, Math.ceil(limit / 4)),
        this.scrapeYahooFinance(symbol, Math.ceil(limit / 4)),
        this.scrapeMarketWatch(symbol, Math.ceil(limit / 4)),
        this.scrapeCNBC(symbol, Math.ceil(limit / 4)),
      ];

      const results = await Promise.allSettled(sources);
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          allArticles.push(...result.value);
        } else {
          loggerUtils.apiLogger.warn('News source failed', {
            source: ['SeekingAlpha', 'Yahoo', 'MarketWatch', 'CNBC'][index],
            error: result.reason?.message,
          });
        }
      });

      // Remove duplicates and sort by date
      const uniqueArticles = this.removeDuplicates(allArticles);
      return uniqueArticles
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
        .slice(0, limit);

    } catch (error) {
      loggerUtils.apiLogger.error('Error fetching news for symbol', {
        symbol,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get general market news
   */
  async getMarketNews(limit: number = 30): Promise<NewsArticle[]> {
    try {
      const allArticles: NewsArticle[] = [];
      
      const sources = [
        this.scrapeGeneralNews('marketwatch', limit / 6),
        this.scrapeGeneralNews('cnbc', limit / 6),
        this.scrapeGeneralNews('yahoo', limit / 6),
        this.scrapeGeneralNews('reuters', limit / 6),
        this.scrapeGeneralNews('bloomberg', limit / 6),
        this.scrapeGeneralNews('seekingalpha', limit / 6),
      ];

      const results = await Promise.allSettled(sources);
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          allArticles.push(...result.value);
        }
      });

      const uniqueArticles = this.removeDuplicates(allArticles);
      return uniqueArticles
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
        .slice(0, limit);

    } catch (error) {
      loggerUtils.apiLogger.error('Error fetching market news', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Scrape Seeking Alpha for symbol-specific news
   */
  private async scrapeSeekingAlpha(symbol: string, limit: number): Promise<NewsArticle[]> {
    try {
      const url = `${this.sources.seekingAlpha}/symbol/${symbol.toUpperCase()}/news`;
      const response = await this.get(url, {}, {
        cacheTTL: 1800, // 30 minutes cache
        parseHtml: true,
      });

      const $ = load(response);
      const articles: NewsArticle[] = [];

      $('article[data-test-id="post-list-item"], .mc_list_item').each((index, element) => {
        if (index >= limit) return false;

        const $el = $(element);
        const title = $el.find('h3 a, .mc_title a').text().trim();
        const url = $el.find('h3 a, .mc_title a').attr('href');
        const description = $el.find('.mc_summary, [data-test-id="post-summary"]').text().trim();
        const dateEl = $el.find('time, .mc_date');
        const author = $el.find('.mc_author, [data-test-id="post-author"]').text().trim();

        if (title && url) {
          articles.push({
            title,
            url: url.startsWith('http') ? url : `${this.sources.seekingAlpha}${url}`,
            description: description || title,
            publishedAt: dateEl.attr('datetime') || dateEl.text() || new Date().toISOString(),
            source: 'Seeking Alpha',
            author: author || undefined,
            symbols: [symbol.toUpperCase()],
            category: 'stock-analysis',
          });
        }
      });

      return articles;
    } catch (error) {
      loggerUtils.apiLogger.warn('SeekingAlpha scraping failed', {
        symbol,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Scrape Yahoo Finance for symbol-specific news
   */
  private async scrapeYahooFinance(symbol: string, limit: number): Promise<NewsArticle[]> {
    try {
      const url = `${this.sources.yahoo}/quote/${symbol.toUpperCase()}/news`;
      const response = await this.get(url, {}, {
        cacheTTL: 1800, // 30 minutes cache
        parseHtml: true,
      });

      const $ = load(response);
      const articles: NewsArticle[] = [];

      $('li[class*="js-stream-content"], .Ov\\(h\\) .Pend\\(44px\\)').each((index, element) => {
        if (index >= limit) return false;

        const $el = $(element);
        const title = $el.find('h3 a, .C\\(\\$c-link\\)').text().trim();
        const url = $el.find('h3 a, .C\\(\\$c-link\\)').attr('href');
        const description = $el.find('p, .C\\(\\$c-fuji-grey-j\\)').first().text().trim();
        const source = $el.find('.C\\(\\$c-fuji-grey-h\\), [data-test-locator="clamped-content"]').text().trim();
        const timeText = $el.find('time, .C\\(\\$c-fuji-grey-h\\)').last().text().trim();

        if (title && url) {
          articles.push({
            title,
            url: url.startsWith('http') ? url : `https://finance.yahoo.com${url}`,
            description: description || title,
            publishedAt: this.parseRelativeTime(timeText),
            source: source || 'Yahoo Finance',
            symbols: [symbol.toUpperCase()],
            category: 'financial-news',
          });
        }
      });

      return articles;
    } catch (error) {
      loggerUtils.apiLogger.warn('Yahoo Finance scraping failed', {
        symbol,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Scrape MarketWatch for symbol-specific news
   */
  private async scrapeMarketWatch(symbol: string, limit: number): Promise<NewsArticle[]> {
    try {
      const url = `${this.sources.marketWatch}/investing/stock/${symbol.toLowerCase()}/news`;
      const response = await this.get(url, {}, {
        cacheTTL: 1800, // 30 minutes cache
        parseHtml: true,
      });

      const $ = load(response);
      const articles: NewsArticle[] = [];

      $('.article__content, .headline').each((index, element) => {
        if (index >= limit) return false;

        const $el = $(element);
        const title = $el.find('h3 a, .headline__link').text().trim();
        const url = $el.find('h3 a, .headline__link').attr('href');
        const description = $el.find('.article__summary, .summary').text().trim();
        const timeText = $el.find('.article__timestamp, .timestamp').text().trim();
        const author = $el.find('.article__author, .author').text().trim();

        if (title && url) {
          articles.push({
            title,
            url: url.startsWith('http') ? url : `${this.sources.marketWatch}${url}`,
            description: description || title,
            publishedAt: this.parseRelativeTime(timeText),
            source: 'MarketWatch',
            author: author || undefined,
            symbols: [symbol.toUpperCase()],
            category: 'market-news',
          });
        }
      });

      return articles;
    } catch (error) {
      loggerUtils.apiLogger.warn('MarketWatch scraping failed', {
        symbol,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Scrape CNBC for symbol-specific news
   */
  private async scrapeCNBC(symbol: string, limit: number): Promise<NewsArticle[]> {
    try {
      // CNBC doesn't have direct symbol pages, so we search
      const searchUrl = `${this.sources.cnbc}/search/?query=${symbol.toUpperCase()}`;
      const response = await this.get(searchUrl, {}, {
        cacheTTL: 1800, // 30 minutes cache
        parseHtml: true,
      });

      const $ = load(response);
      const articles: NewsArticle[] = [];

      $('.SearchResult-searchResult, .Card-titleContainer').each((index, element) => {
        if (index >= limit) return false;

        const $el = $(element);
        const title = $el.find('a .SearchResult-title, .Card-title').text().trim();
        const url = $el.find('a').attr('href');
        const description = $el.find('.SearchResult-summary, .Card-summary').text().trim();
        const timeText = $el.find('.SearchResult-publishedDate, .Card-time').text().trim();

        if (title && url) {
          articles.push({
            title,
            url: url.startsWith('http') ? url : `${this.sources.cnbc}${url}`,
            description: description || title,
            publishedAt: this.parseRelativeTime(timeText),
            source: 'CNBC',
            symbols: [symbol.toUpperCase()],
            category: 'financial-news',
          });
        }
      });

      return articles;
    } catch (error) {
      loggerUtils.apiLogger.warn('CNBC scraping failed', {
        symbol,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Scrape general financial news from various sources
   */
  private async scrapeGeneralNews(source: string, limit: number): Promise<NewsArticle[]> {
    try {
      let url: string;
      
      switch (source) {
        case 'marketwatch':
          url = `${this.sources.marketWatch}/latest-news`;
          break;
        case 'cnbc':
          url = `${this.sources.cnbc}/markets/`;
          break;
        case 'yahoo':
          url = `${this.sources.yahoo}/news/`;
          break;
        case 'reuters':
          url = `${this.sources.reuters}/business/finance/`;
          break;
        case 'bloomberg':
          url = `${this.sources.bloomberg}/markets`;
          break;
        case 'seekingalpha':
          url = `${this.sources.seekingAlpha}/market-news`;
          break;
        default:
          return [];
      }

      const response = await this.get(url, {}, {
        cacheTTL: 1800, // 30 minutes cache
        parseHtml: true,
      });

      const $ = load(response);
      const articles: NewsArticle[] = [];

      // Generic selectors that work across most financial news sites
      const selectors = [
        'article',
        '.article',
        '.story',
        '.news-item',
        '.headline',
        '.story-item',
        '[data-module="LatestNews"]',
        '.js-stream-content'
      ];

      selectors.forEach(selector => {
        $(selector).each((index, element) => {
          if (articles.length >= limit) return false;

          const $el = $(element);
          const title = $el.find('h1, h2, h3, h4, .headline, .title, a').first().text().trim();
          const url = $el.find('a').first().attr('href');
          const description = $el.find('p, .summary, .description').first().text().trim();
          const timeEl = $el.find('time, .timestamp, .date, .time').first();
          const timeText = timeEl.attr('datetime') || timeEl.text().trim();

          if (title && url && title.length > 10) {
            articles.push({
              title,
              url: url.startsWith('http') ? url : `${this.sources[source as keyof typeof this.sources]}${url}`,
              description: description || title,
              publishedAt: this.parseRelativeTime(timeText),
              source: this.capitalizeSource(source),
              category: 'market-news',
            });
          }
        });
      });

      return articles.slice(0, limit);
    } catch (error) {
      loggerUtils.apiLogger.warn('General news scraping failed', {
        source,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Remove duplicate articles based on title similarity
   */
  private removeDuplicates(articles: NewsArticle[]): NewsArticle[] {
    const seen = new Set<string>();
    return articles.filter(article => {
      const key = article.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Parse relative time strings to ISO date
   */
  private parseRelativeTime(timeText: string): string {
    if (!timeText) return new Date().toISOString();

    const now = new Date();
    
    // Handle ISO dates
    if (timeText.includes('T') || timeText.match(/^\d{4}-\d{2}-\d{2}/)) {
      return new Date(timeText).toISOString();
    }

    // Handle relative times
    const minutesMatch = timeText.match(/(\d+)\s*(?:minute|min)s?\s*ago/i);
    if (minutesMatch) {
      now.setMinutes(now.getMinutes() - parseInt(minutesMatch[1]));
      return now.toISOString();
    }

    const hoursMatch = timeText.match(/(\d+)\s*(?:hour|hr)s?\s*ago/i);
    if (hoursMatch) {
      now.setHours(now.getHours() - parseInt(hoursMatch[1]));
      return now.toISOString();
    }

    const daysMatch = timeText.match(/(\d+)\s*days?\s*ago/i);
    if (daysMatch) {
      now.setDate(now.getDate() - parseInt(daysMatch[1]));
      return now.toISOString();
    }

    // Handle "today", "yesterday"
    if (timeText.toLowerCase().includes('today')) {
      return now.toISOString();
    }
    
    if (timeText.toLowerCase().includes('yesterday')) {
      now.setDate(now.getDate() - 1);
      return now.toISOString();
    }

    // Try to parse as regular date
    try {
      return new Date(timeText).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  /**
   * Capitalize source name
   */
  private capitalizeSource(source: string): string {
    const mapping: { [key: string]: string } = {
      marketwatch: 'MarketWatch',
      cnbc: 'CNBC',
      yahoo: 'Yahoo Finance',
      reuters: 'Reuters',
      bloomberg: 'Bloomberg',
      seekingalpha: 'Seeking Alpha',
    };
    
    return mapping[source] || source;
  }

  /**
   * Get trending news (most popular articles)
   */
  async getTrendingNews(limit: number = 20): Promise<NewsArticle[]> {
    try {
      // Get news from all sources and find most recent/popular
      const allNews = await this.getMarketNews(limit * 2);
      
      // Sort by recency and source reliability
      const sourceWeights: { [key: string]: number } = {
        'Reuters': 1.0,
        'Bloomberg': 0.9,
        'CNBC': 0.8,
        'MarketWatch': 0.7,
        'Yahoo Finance': 0.6,
        'Seeking Alpha': 0.5,
      };

      return allNews
        .map(article => ({
          ...article,
          score: (sourceWeights[article.source] || 0.3) * 
                 (1 / (Date.now() - new Date(article.publishedAt).getTime() + 1))
        }))
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, limit)
        .map(({ score, ...article }) => article);

    } catch (error) {
      loggerUtils.apiLogger.error('Error fetching trending news', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Search news by keywords
   */
  async searchNews(keywords: string, limit: number = 20): Promise<NewsArticle[]> {
    try {
      const allNews = await this.getMarketNews(limit * 3);
      
      const keywordLower = keywords.toLowerCase();
      const filtered = allNews.filter(article => 
        article.title.toLowerCase().includes(keywordLower) ||
        article.description.toLowerCase().includes(keywordLower)
      );

      return filtered.slice(0, limit);
    } catch (error) {
      loggerUtils.apiLogger.error('Error searching news', {
        keywords,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Validate connection by testing one of the news sources
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.scrapeGeneralNews('yahoo', 1);
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default NewsScraperClient;