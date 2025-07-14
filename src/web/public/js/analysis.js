/**
 * StockGenius Analysis Page JavaScript
 * Controls for manual analysis triggers and real-time status monitoring
 */

class AnalysisController {
    constructor() {
        this.init();
        this.setupEventListeners();
        this.startStatusPolling();
    }

    init() {
        console.log('Analysis Controller initialized');
        this.addLogEntry('Analysis system ready', 'info');
    }

    setupEventListeners() {
        // Quick analysis button
        const quickBtn = document.getElementById('quick-analysis-btn');
        if (quickBtn) {
            quickBtn.addEventListener('click', () => this.runQuickAnalysis());
        }

        // Full analysis button
        const fullBtn = document.getElementById('full-analysis-btn');
        if (fullBtn) {
            fullBtn.addEventListener('click', () => this.runFullAnalysis());
        }

        // Module checkboxes
        document.querySelectorAll('input[name="modules"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateModuleSelection());
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'q':
                        e.preventDefault();
                        this.runQuickAnalysis();
                        break;
                    case 'f':
                        e.preventDefault();
                        this.runFullAnalysis();
                        break;
                }
            }
        });
    }

    async runQuickAnalysis() {
        const symbols = this.getQuickSymbols();
        const priority = document.getElementById('quick-priority').value;

        await this.triggerAnalysis({
            symbols: symbols,
            modules: ['technical', 'fusion'],
            priority: priority,
            type: 'quick'
        });
    }

    async runFullAnalysis() {
        const selectedModules = this.getSelectedModules();
        const symbols = this.getQuickSymbols(); // Use same symbols for now

        await this.triggerAnalysis({
            symbols: symbols,
            modules: selectedModules,
            priority: 'normal',
            type: 'full'
        });
    }

    async triggerAnalysis(config) {
        const button = config.type === 'quick' ? 
            document.getElementById('quick-analysis-btn') : 
            document.getElementById('full-analysis-btn');

        try {
            // Update button state
            this.setButtonLoading(button, true);
            this.addLogEntry(`Starting ${config.type} analysis for ${config.symbols.length} symbols`, 'info');

            const response = await fetch('/api/analysis/trigger', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    symbols: config.symbols,
                    modules: config.modules,
                    priority: config.priority
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.addLogEntry(`Analysis started: ${result.executionId}`, 'success');
                this.showProgressModal();
                this.startProgressPolling();
            } else {
                throw new Error(result.error || 'Failed to start analysis');
            }
        } catch (error) {
            console.error('Analysis trigger error:', error);
            this.addLogEntry(`Analysis failed: ${error.message}`, 'error');
            this.showNotification(error.message, 'error');
        } finally {
            setTimeout(() => this.setButtonLoading(button, false), 2000);
        }
    }

    getQuickSymbols() {
        const symbolsInput = document.getElementById('quick-symbols');
        const symbolsText = symbolsInput.value.trim();
        return symbolsText.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    getSelectedModules() {
        const checkboxes = document.querySelectorAll('input[name="modules"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    updateModuleSelection() {
        const selectedModules = this.getSelectedModules();
        this.addLogEntry(`Module selection updated: ${selectedModules.join(', ')}`, 'info');
    }

    setButtonLoading(button, loading) {
        if (loading) {
            button.disabled = true;
            button.style.opacity = '0.6';
            const originalText = button.textContent;
            button.dataset.originalText = originalText;
            button.textContent = 'Running...';
        } else {
            button.disabled = false;
            button.style.opacity = '1';
            button.textContent = button.dataset.originalText || button.textContent;
        }
    }

    showProgressModal() {
        const modal = document.getElementById('progress-modal');
        modal.style.display = 'block';
        this.updateProgress(0, 'Initializing analysis pipeline...');
    }

    hideProgressModal() {
        const modal = document.getElementById('progress-modal');
        modal.style.display = 'none';
    }

    updateProgress(percentage, message, details = '') {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        const progressDetails = document.getElementById('progress-details');

        if (progressFill) progressFill.style.width = `${percentage}%`;
        if (progressText) progressText.textContent = message;
        if (progressDetails) progressDetails.textContent = details;
    }

    startProgressPolling() {
        this.stopProgressPolling();
        this.progressInterval = setInterval(async () => {
            try {
                const response = await fetch('/api/analysis/status');
                const status = await response.json();

                if (!status.isRunning) {
                    this.stopProgressPolling();
                    this.hideProgressModal();
                    this.addLogEntry('Analysis completed', 'success');
                    this.updateStatusDisplay(status);
                } else {
                    this.updateProgressFromStatus(status.currentExecution);
                    this.updateStatusDisplay(status);
                }
            } catch (error) {
                console.error('Progress polling error:', error);
                this.stopProgressPolling();
                this.hideProgressModal();
                this.addLogEntry('Progress polling failed', 'error');
            }
        }, 2000);
    }

    stopProgressPolling() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    updateProgressFromStatus(execution) {
        if (!execution) return;

        const phasePercentages = {
            'data_collection': 20,
            'preprocessing': 40,
            'ai_analysis': 70,
            'trade_generation': 90,
            'notification': 95,
            'completed': 100
        };

        const percentage = phasePercentages[execution.phase] || 0;
        const message = `${execution.phase.replace('_', ' ').toUpperCase()}`;
        const details = `Processed ${execution.metrics.symbolsProcessed} symbols, ${execution.metrics.errorsCount} errors`;

        this.updateProgress(percentage, message, details);
    }

    startStatusPolling() {
        this.statusInterval = setInterval(async () => {
            try {
                const response = await fetch('/api/analysis/status');
                const status = await response.json();
                this.updateStatusDisplay(status);
            } catch (error) {
                console.error('Status polling error:', error);
            }
        }, 10000); // Check every 10 seconds
    }

    updateStatusDisplay(status) {
        const statusDisplay = document.getElementById('status-display');
        if (!statusDisplay || !status.currentExecution) return;

        const execution = status.currentExecution;
        const statusCard = statusDisplay.querySelector('.status-card');
        
        if (statusCard) {
            // Update status badge
            const badge = statusCard.querySelector('.status-badge');
            if (badge) {
                badge.textContent = status.isRunning ? 'RUNNING' : execution.phase.toUpperCase();
                badge.className = `status-badge ${status.isRunning ? 'running' : execution.success ? 'success' : 'error'}`;
            }

            // Update metrics
            const metrics = statusCard.querySelectorAll('.metric .value');
            if (metrics.length >= 4) {
                metrics[0].textContent = execution.metrics.symbolsProcessed;
                metrics[1].textContent = `${Math.round(execution.metrics.processingTimeMs / 1000)}s`;
                metrics[2].textContent = execution.metrics.tradesGenerated;
                metrics[3].textContent = execution.metrics.errorsCount;
                metrics[3].className = `value ${execution.metrics.errorsCount > 0 ? 'error' : 'success'}`;
            }
        }
    }

    addLogEntry(message, type = 'info') {
        const logContainer = document.getElementById('analysis-log');
        if (!logContainer) return;

        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.innerHTML = `
            <span class="timestamp">[${timestamp}]</span>
            <span class="message">${message}</span>
        `;

        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;

        // Keep only last 50 entries
        const entries = logContainer.querySelectorAll('.log-entry');
        if (entries.length > 50) {
            entries[0].remove();
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Add notification styles if not present
        if (!document.querySelector('#notification-style')) {
            const style = document.createElement('style');
            style.id = 'notification-style';
            style.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 12px 20px;
                    border-radius: 8px;
                    color: white;
                    font-weight: 500;
                    z-index: 1000;
                    transform: translateX(400px);
                    transition: all 0.3s ease;
                }
                .notification.show {
                    transform: translateX(0);
                }
                .notification-success {
                    background: #10b981;
                }
                .notification-error {
                    background: #ef4444;
                }
                .notification-info {
                    background: #3b82f6;
                }
                .status-badge.running {
                    background: #3b82f6;
                    color: white;
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Hide and remove notification
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    cleanup() {
        this.stopProgressPolling();
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }
    }
}

// Initialize analysis controller when DOM is loaded
let analysisController;
document.addEventListener('DOMContentLoaded', function() {
    analysisController = new AnalysisController();
});

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (analysisController) {
        analysisController.cleanup();
    }
});