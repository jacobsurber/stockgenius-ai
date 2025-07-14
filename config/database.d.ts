export function initDatabase(): Promise<import("sqlite").Database<sqlite3.Database, sqlite3.Statement>>;
export function getDatabase(): any;
export function closeDatabase(): Promise<void>;
export namespace dbUtils {
    function cleanExpiredCache(): Promise<any>;
    function getPortfolioSummary(): Promise<any>;
    function getRecentAIAnalysis(limit?: number): Promise<any>;
    function getAPIUsageStats(timeframe?: string): Promise<any>;
}
declare namespace _default {
    export { initDatabase };
    export { getDatabase };
    export { closeDatabase };
    export { dbUtils };
}
export default _default;
import sqlite3 from 'sqlite3';
//# sourceMappingURL=database.d.ts.map