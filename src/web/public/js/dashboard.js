/**
 * StockGenius Dashboard JavaScript
 * Dynamic interactions for trade cards and analysis controls
 */

class StockGeniusDashboard {
    constructor() {
        this.init();
        this.setupEventListeners();
        this.startPolling();
    }

    init() {
        console.log('StockGenius Dashboard initialized');
        this.updateTimestamp();
    }

    setupEventListeners() {
        // Enhanced analysis controls
        const updateBtn = document.getElementById('updateAnalysis');
        if (updateBtn) {
            updateBtn.addEventListener('click', () => this.updateAnalysisPreferences());
        }

        const refreshBtn = document.getElementById('refreshData');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshData());
        }

        // Manual analysis trigger
        const triggerBtn = document.getElementById('trigger-analysis');
        if (triggerBtn) {
            triggerBtn.addEventListener('click', () => this.triggerAnalysis());
        }

        // Auto-refresh toggle
        const refreshToggle = document.getElementById('auto-refresh');
        if (refreshToggle) {
            refreshToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.startPolling();
                } else {
                    this.stopPolling();
                }
            });
        }

        // Trade card interactions
        document.querySelectorAll('.trade-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('view-details-btn') && 
                    !e.target.classList.contains('view-reasoning-btn')) {
                    const cardId = card.dataset.cardId;
                    this.highlightCard(card);
                }
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'r':
                        e.preventDefault();
                        this.refreshData();
                        break;
                    case 'a':
                        e.preventDefault();
                        this.triggerAnalysis();
                        break;
                }
            }
        });
    }

    async triggerAnalysis() {
        const button = document.getElementById('trigger-analysis');
        const buttonText = button.querySelector('.button-text');
        const spinner = button.querySelector('.loading-spinner');
        
        try {
            // Show loading state
            button.disabled = true;
            buttonText.style.display = 'none';
            spinner.style.display = 'inline';

            const response = await fetch('/api/analysis/trigger', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    priority: 'normal'
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.showNotification('Analysis started successfully', 'success');
                this.startAnalysisPolling();
            } else {
                throw new Error(result.error || 'Failed to start analysis');
            }
        } catch (error) {
            console.error('Analysis trigger error:', error);
            this.showNotification(error.message, 'error');
        } finally {
            // Reset button state
            setTimeout(() => {
                button.disabled = false;
                buttonText.style.display = 'inline';
                spinner.style.display = 'none';
            }, 2000);
        }
    }

    async updateAnalysisPreferences() {
        const btn = document.getElementById('updateAnalysis');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Updating...';
        }

        try {
            // Collect user preferences
            const sectors = Array.from(document.getElementById('sectors').selectedOptions)
                .map(option => option.value);
            const riskTolerance = document.getElementById('riskTolerance').value;
            const timeHorizon = document.getElementById('timeHorizon').value;
            const analysisDepth = document.getElementById('analysisDepth').value;
            const maxCards = document.getElementById('maxCards').value;

            // Build query parameters
            const params = new URLSearchParams({
                sectors: sectors.join(','),
                risk: riskTolerance,
                timeframe: timeHorizon,
                depth: analysisDepth,
                maxCards: maxCards
            });

            // Redirect to update dashboard with new preferences
            window.location.href = `/dashboard?${params.toString()}`;
        } catch (error) {
            console.error('Failed to update preferences:', error);
            this.showNotification('Failed to update analysis preferences', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Update Analysis';
            }
        }
    }

    async refreshData() {
        try {
            this.showNotification('Refreshing data...', 'info');
            
            const [tradeCardsResponse, metricsResponse] = await Promise.all([
                fetch('/api/trade-cards'),
                fetch('/api/performance/metrics')
            ]);

            if (tradeCardsResponse.ok) {
                const tradeCards = await tradeCardsResponse.json();
                this.updateTradeCards(tradeCards);
            }

            if (metricsResponse.ok) {
                const metrics = await metricsResponse.json();
                this.updateMetrics(metrics);
            }

            this.updateTimestamp();
            this.showNotification('Data refreshed', 'success');
        } catch (error) {
            console.error('Refresh error:', error);
            this.showNotification('Failed to refresh data', 'error');
        }
    }

    updateTradeCards(tradeCards) {
        const grid = document.querySelector('.trade-cards-grid');
        if (!grid || !tradeCards.json) return;

        // Update summary
        const summary = document.querySelector('.cards-summary');
        if (summary) {
            summary.textContent = `${tradeCards.json.summary.totalCards} cards | ${tradeCards.json.summary.highConfidenceCards} high confidence | Avg: ${tradeCards.json.summary.averageConfidence}%`;
        }

        // Update cards (simplified - in real implementation would update existing cards)
        console.log('Trade cards updated:', tradeCards.json.summary);
    }

    updateMetrics(metrics) {
        // Update performance metrics in the overview section
        const metricCards = document.querySelectorAll('.metric-card');
        
        if (metrics.daily) {
            // Update daily metrics if available
            console.log('Metrics updated:', metrics);
        }
    }

    highlightCard(cardElement) {
        // Remove highlight from all cards
        document.querySelectorAll('.trade-card').forEach(card => {
            card.classList.remove('highlighted');
        });
        
        // Add highlight to clicked card
        cardElement.classList.add('highlighted');
        
        // Add highlight style if not already in CSS
        if (!document.querySelector('#highlight-style')) {
            const style = document.createElement('style');
            style.id = 'highlight-style';
            style.textContent = `
                .trade-card.highlighted {
                    border-color: #00d4aa !important;
                    box-shadow: 0 0 20px rgba(0, 212, 170, 0.3) !important;
                    transform: translateY(-4px) !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    startPolling() {
        this.stopPolling(); // Clear any existing interval
        this.pollingInterval = setInterval(() => {
            this.refreshData();
        }, 30000); // Refresh every 30 seconds
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    startAnalysisPolling() {
        this.stopAnalysisPolling();
        this.analysisPollingInterval = setInterval(async () => {
            try {
                const response = await fetch('/api/analysis/status');
                const status = await response.json();
                
                if (!status.isRunning) {
                    this.stopAnalysisPolling();
                    this.showNotification('Analysis completed', 'success');
                    this.refreshData();
                } else {
                    this.updateAnalysisStatus(status.currentExecution);
                }
            } catch (error) {
                console.error('Analysis polling error:', error);
                this.stopAnalysisPolling();
            }
        }, 5000); // Check every 5 seconds during analysis
    }

    stopAnalysisPolling() {
        if (this.analysisPollingInterval) {
            clearInterval(this.analysisPollingInterval);
            this.analysisPollingInterval = null;
        }
    }

    updateAnalysisStatus(execution) {
        const statusIndicator = document.querySelector('.analysis-status .status-indicator');
        if (statusIndicator && execution) {
            statusIndicator.textContent = `Running: ${execution.phase}`;
            statusIndicator.className = 'status-indicator running';
        }
    }

    updateTimestamp() {
        const timestampElements = document.querySelectorAll('[data-timestamp]');
        const now = new Date().toLocaleTimeString();
        
        timestampElements.forEach(el => {
            el.textContent = `Last updated: ${now}`;
        });
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
}

// Global functions for trade card interactions
window.viewTradeDetails = async function(cardId) {
    try {
        const response = await fetch(`/api/trade-cards/${cardId}/details`);
        const details = await response.json();
        
        if (response.ok) {
            showTradeDetailsModal(details);
        } else {
            throw new Error(details.error || 'Failed to load trade details');
        }
    } catch (error) {
        console.error('Error loading trade details:', error);
        dashboard.showNotification('Failed to load trade details', 'error');
    }
};

window.viewAIReasoning = async function(cardId) {
    try {
        const response = await fetch(`/api/trade-cards/${cardId}/details`);
        const details = await response.json();
        
        if (response.ok) {
            showAIReasoningModal(details);
        } else {
            throw new Error(details.error || 'Failed to load AI reasoning');
        }
    } catch (error) {
        console.error('Error loading AI reasoning:', error);
        dashboard.showNotification('Failed to load AI reasoning', 'error');
    }
};

function showTradeDetailsModal(details) {
    const modal = document.getElementById('details-modal');
    const modalBody = document.getElementById('modal-body');
    
    modalBody.innerHTML = `
        <h2>Trade Details - ${details.id}</h2>
        <div class="signal-strength-section">
            <h3>Signal Strength</h3>
            <div class="signal-indicators">
                ${Object.entries(details.signalStrength || {}).map(([signal, strength]) => `
                    <div class="signal-indicator">
                        <span class="signal-name">${signal.charAt(0).toUpperCase() + signal.slice(1)}</span>
                        <div class="signal-bar">
                            <div class="signal-fill" style="width: ${strength}%; background: ${getSignalColor(strength)}"></div>
                        </div>
                        <span class="signal-value">${strength}%</span>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="confidence-section">
            <h3>Overall Confidence: ${details.confidence}%</h3>
            <div class="confidence-visualization">
                <div class="confidence-meter">
                    <div class="confidence-meter-fill" style="width: ${details.confidence}%"></div>
                </div>
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
}

function showAIReasoningModal(details) {
    const modal = document.getElementById('details-modal');
    const modalBody = document.getElementById('modal-body');
    
    modalBody.innerHTML = `
        <h2>AI Reasoning - ${details.id}</h2>
        <div class="ai-reasoning-sections">
            ${Object.entries(details.aiReasoning || {}).map(([module, reasoning]) => `
                <div class="reasoning-section">
                    <h3>${module.charAt(0).toUpperCase() + module.slice(1)} Analysis</h3>
                    <p>${reasoning}</p>
                </div>
            `).join('')}
        </div>
    `;
    
    modal.style.display = 'block';
}

function getSignalColor(strength) {
    if (strength >= 80) return '#10b981';
    if (strength >= 60) return '#f59e0b';
    if (strength >= 40) return '#ef4444';
    return '#64748b';
}

window.closeModal = function() {
    const modal = document.getElementById('details-modal');
    modal.style.display = 'none';
};

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('details-modal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};

// Initialize dashboard when DOM is loaded
let dashboard;
document.addEventListener('DOMContentLoaded', function() {
    dashboard = new StockGeniusDashboard();
});