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
        console.log('🚀 StockGenius Dashboard v2.0 - Data Quality Monitoring Enabled (Build: CACHE_BUST_1753048400000)');
        // Force browser to show current build
        document.title = 'StockGenius - Build: CACHE_BUST_1753048400000';
        this.updateTimestamp();
        this.initializeDataQualityMonitor();
    }

    initializeDataQualityMonitor() {
        // Add data quality tooltips
        this.addDataQualityTooltips();
        
        // Check for any quality warnings and highlight them
        const warnings = document.querySelectorAll('.quality-warning');
        warnings.forEach(warning => {
            warning.style.animation = 'pulse 2s infinite';
        });
    }

    addDataQualityTooltips() {
        const indicators = document.querySelectorAll('.data-quality-indicator');
        indicators.forEach(indicator => {
            const className = indicator.className;
            let tooltip = '';
            
            if (className.includes('data-quality-live')) {
                tooltip = 'Live market data - Current and reliable';
            } else if (className.includes('data-quality-cached')) {
                tooltip = 'Cached data - Recently fetched but not real-time';
            } else if (className.includes('data-quality-fallback')) {
                tooltip = 'Fallback data - Using backup sources due to API issues';
            } else if (className.includes('data-quality-generated')) {
                tooltip = 'Simulated data - For demonstration purposes only, not actual market data';
            } else if (className.includes('data-quality-poor')) {
                tooltip = 'Poor quality data - Results may be unreliable';
            }
            
            if (tooltip) {
                indicator.title = tooltip;
                indicator.style.cursor = 'help';
            }
        });
    }

    setupEventListeners() {
        // Manual analysis trigger
        const triggerBtn = document.getElementById('trigger-analysis');
        console.log('🔍 Button setup - triggerBtn found:', !!triggerBtn);
        if (triggerBtn) {
            triggerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('🎯 Analysis button clicked - triggering new OpenAI analysis');
                console.log('🔍 Event details:', { target: e.target, disabled: triggerBtn.disabled });
                this.triggerAnalysis();
            });
            console.log('✅ Event listener attached to analysis button');
        } else {
            console.error('❌ trigger-analysis button not found in DOM');
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
        console.log('🚀 triggerAnalysis called');
        const button = document.getElementById('trigger-analysis');
        console.log('🔍 Button elements check:', {
            button: !!button,
            sectors: !!document.getElementById('sectors'),
            riskTolerance: !!document.getElementById('riskTolerance'),
            analysisDepth: !!document.getElementById('analysisDepth')
        });
        
        if (!button) {
            console.error('❌ Cannot find trigger-analysis button');
            return;
        }
        
        const buttonText = button.querySelector('.button-text');
        const spinner = button.querySelector('.loading-spinner');
        
        try {
            // Show loading state
            button.disabled = true;
            buttonText.style.display = 'none';
            spinner.style.display = 'inline';

            // Collect user preferences
            const selectedSector = document.getElementById('sectors').value;
            const sectors = selectedSector ? [selectedSector] : [];
            const riskTolerance = document.getElementById('riskTolerance').value;
            const analysisDepth = document.getElementById('analysisDepth').value;
            
            console.log('Sending analysis request with:', { sectors, riskTolerance, analysisDepth });

            const response = await fetch('/api/analysis/trigger', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    priority: 'normal',
                    sectors: sectors,
                    preferences: {
                        riskTolerance: riskTolerance,
                        analysisDepth: analysisDepth
                    }
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.showNotification('Analysis started successfully', 'success');
                sessionStorage.setItem('analysisAttempted', 'true');
                console.log('🎬 Real backend progress tracking enabled - check server logs');
                // Disabled fake progress: this.startAnalysisProgress();
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

        // Clear existing cards
        grid.innerHTML = '';

        // Check if there are no cards
        if (tradeCards.json.cards.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            
            // Check if analysis was recently attempted
            const isAnalysisExpected = sessionStorage.getItem('analysisAttempted') === 'true';
            
            if (isAnalysisExpected) {
                emptyState.innerHTML = `
                    <div class="empty-state-content">
                        <div class="empty-state-icon">⚠️</div>
                        <h3>Analysis Failed to Generate Results</h3>
                        <p>The analysis completed but did not generate any trade recommendations. This could be due to insufficient data, market conditions, or configuration issues. Try selecting a different sector or adjusting your settings.</p>
                    </div>
                `;
            } else {
                emptyState.innerHTML = `
                    <div class="empty-state-content">
                        <div class="empty-state-icon">📊</div>
                        <h3>No Trade Cards Available</h3>
                        <p>Configure your analysis preferences above and click "Run Analysis" to generate trade recommendations.</p>
                    </div>
                `;
            }
            
            grid.appendChild(emptyState);
            
            // Add empty state styles
            if (!document.querySelector('#empty-state-style')) {
                const style = document.createElement('style');
                style.id = 'empty-state-style';
                style.textContent = `
                    .empty-state {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 300px;
                        grid-column: 1 / -1;
                        text-align: center;
                        color: #6b7280;
                    }
                    .empty-state-content {
                        max-width: 400px;
                        padding: 2rem;
                    }
                    .empty-state-icon {
                        font-size: 3rem;
                        margin-bottom: 1rem;
                    }
                    .empty-state h3 {
                        color: #374151;
                        margin-bottom: 0.5rem;
                        font-size: 1.25rem;
                    }
                    .empty-state p {
                        color: #6b7280;
                        line-height: 1.5;
                    }
                `;
                document.head.appendChild(style);
            }
        } else {
            // Clear analysis attempted flag on successful card generation
            sessionStorage.removeItem('analysisAttempted');
            
            // Render new cards
            tradeCards.json.cards.forEach(card => {
                const cardElement = this.createTradeCardElement(card);
                grid.appendChild(cardElement);
            });
        }

        console.log('Trade cards updated:', tradeCards.json.summary);
    }

    createTradeCardElement(card) {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'trade-card';
        cardDiv.setAttribute('data-card-id', card.id);

        cardDiv.innerHTML = `
            <div class="card-header">
                <div class="card-category ${card.category}">
                    ${card.category.replace('_', ' ').toUpperCase()}
                </div>
                <div class="card-confidence">
                    <div class="confidence-bar">
                        <div class="confidence-fill" style="width: ${card.confidence}%"></div>
                    </div>
                    <span class="confidence-text">${card.confidence}%</span>
                </div>
            </div>
            <div class="card-content">
                <div class="card-symbol">
                    <span class="symbol">${card.symbol}</span>
                    <span class="strategy">${card.strategyType}</span>
                </div>
                <div class="card-prices">
                    <div class="price-item">
                        <span class="price-label">Entry:</span>
                        <span class="price-value">$${card.entry.price}</span>
                    </div>
                    <div class="price-item">
                        <span class="price-label">Target:</span>
                        <span class="price-value">$${card.exits.primary.price}</span>
                    </div>
                    <div class="price-item">
                        <span class="price-label">Stop:</span>
                        <span class="price-value">$${card.exits.stop.price}</span>
                    </div>
                </div>
                <div class="card-thesis">
                    <div class="thesis-title">Why This Trade:</div>
                    <div class="thesis-content">${card.whyThisTrade.mainThesis}</div>
                </div>
            </div>
        `;

        return cardDiv;
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
                    this.completeAnalysisProgress();
                    this.showNotification('Analysis completed', 'success');
                    // Refresh data with show=true to display new cards
                    await this.refreshData();
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

    startAnalysisProgress() {
        console.log('🎬 startAnalysisProgress called');
        const progressSteps = document.getElementById('progressSteps');
        const progressFill = document.getElementById('progressFill');
        console.log('🎬 Progress elements found:', { progressSteps: !!progressSteps, progressFill: !!progressFill });
        
        if (!progressSteps || !progressFill) return;
        
        // Reset progress
        progressFill.style.width = '0%';
        
        // Define analysis steps with OpenAI reasoning visibility
        const steps = [
            { id: 'init', icon: '🔄', text: 'Initializing analysis pipeline...' },
            { id: 'data', icon: '📊', text: 'Collecting market data from multiple sources...' },
            { id: 'technical', icon: '📈', text: 'AI analyzing technical indicators...' },
            { id: 'sentiment', icon: '💭', text: 'AI processing sentiment data...' },
            { id: 'risk', icon: '⚠️', text: 'AI assessing risk factors...' },
            { id: 'sector', icon: '🏢', text: 'AI analyzing sector dynamics...' },
            { id: 'fusion', icon: '🧠', text: 'AI synthesizing insights into trade opportunities...' },
            { id: 'validation', icon: '✅', text: 'Validating AI-generated trade strategies...' },
            { id: 'complete', icon: '🎉', text: 'Analysis complete!' }
        ];
        
        // Clear existing steps
        progressSteps.innerHTML = '';
        
        // Add all steps with OpenAI reasoning space
        steps.forEach((step, index) => {
            const stepElement = document.createElement('div');
            stepElement.className = 'step-item idle';
            stepElement.id = `step-${step.id}`;
            stepElement.innerHTML = `
                <div class="step-icon">${step.icon}</div>
                <div class="step-content">
                    <div class="step-text">${step.text}</div>
                    <div class="step-reasoning" id="reasoning-${step.id}" style="display: none;"></div>
                </div>
            `;
            progressSteps.appendChild(stepElement);
        });
        
        // Start progress simulation
        this.currentStep = 0;
        this.progressSteps = steps;
        this.simulateProgress();
    }

    simulateProgress() {
        if (this.currentStep >= this.progressSteps.length) return;
        
        const step = this.progressSteps[this.currentStep];
        const stepElement = document.getElementById(`step-${step.id}`);
        const progressFill = document.getElementById('progressFill');
        
        if (stepElement) {
            // Mark current step as active
            stepElement.className = 'step-item active';
            
            // Show OpenAI reasoning for this step
            this.showStepReasoning(step.id);
            
            // Update progress bar
            const progress = ((this.currentStep + 1) / this.progressSteps.length) * 100;
            if (progressFill) {
                progressFill.style.width = `${progress}%`;
            }
            
            // Complete previous step
            if (this.currentStep > 0) {
                const prevStep = this.progressSteps[this.currentStep - 1];
                const prevStepElement = document.getElementById(`step-${prevStep.id}`);
                if (prevStepElement) {
                    prevStepElement.className = 'step-item completed';
                }
            }
        }
        
        this.currentStep++;
        
        // Continue to next step after delay (longer to show reasoning)
        if (this.currentStep < this.progressSteps.length) {
            setTimeout(() => this.simulateProgress(), 2500 + Math.random() * 2000);
        }
    }

    async showStepReasoning(stepId) {
        const reasoningElement = document.getElementById(`reasoning-${stepId}`);
        if (!reasoningElement) return;

        // Get real or fallback reasoning for this analysis step
        const reasoningText = await this.getReasoningForStep(stepId);
        
        // Show reasoning with typing effect
        setTimeout(() => {
            reasoningElement.style.display = 'block';
            this.typeText(reasoningElement, reasoningText, 25); // 25ms per character
        }, 800);
    }

    async getReasoningForStep(stepId) {
        const sector = document.getElementById('sectors').value || 'healthcare';
        
        // Try to get real reasoning from the analysis status endpoint
        try {
            const response = await fetch('/api/analysis/status');
            const status = await response.json();
            
            if (status.currentExecution && status.currentExecution.currentStep) {
                const step = status.currentExecution.currentStep;
                if (step.reasoning) {
                    return `🤖 ${step.reasoning}`;
                }
            }
        } catch (error) {
            console.log('Could not fetch real-time reasoning, using fallback');
        }
        
        // Fallback to generic messages (not fake data)
        const fallbackMap = {
            'init': `Initializing analysis pipeline for ${sector} sector...`,
            'data': `Collecting market data from multiple sources...`,
            'technical': `Running technical analysis on selected symbols...`,
            'sentiment': `Processing sentiment data and news analysis...`,
            'risk': `Evaluating risk factors and position sizing...`,
            'sector': `Analyzing ${sector} sector dynamics...`,
            'fusion': `Synthesizing insights from all analysis modules...`,
            'validation': `Validating generated trade strategies...`
        };

        return fallbackMap[stepId] || `Processing ${stepId} analysis...`;
    }

    typeText(element, text, speed = 30) {
        element.textContent = '';
        let i = 0;
        const timer = setInterval(() => {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
            } else {
                clearInterval(timer);
            }
        }, speed);
    }

    completeAnalysisProgress() {
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            progressFill.style.width = '100%';
        }
        
        // Mark all steps as completed
        document.querySelectorAll('.step-item').forEach(step => {
            step.className = 'step-item completed';
        });
        
        // Add final completed step
        const progressSteps = document.getElementById('progressSteps');
        if (progressSteps) {
            const finalStep = document.createElement('div');
            finalStep.className = 'step-item completed';
            finalStep.innerHTML = `
                <div class="step-icon">✅</div>
                <div class="step-text">Trade cards generated successfully!</div>
            `;
            progressSteps.appendChild(finalStep);
        }
        
        // Don't auto-reset - keep progress visible until next analysis
        // User requested to keep progress visible for debugging
    }

    resetAnalysisProgress() {
        const progressSteps = document.getElementById('progressSteps');
        const progressFill = document.getElementById('progressFill');
        
        if (progressSteps) {
            progressSteps.innerHTML = `
                <div class="step-item idle">
                    <div class="step-icon">⏳</div>
                    <div class="step-text">Ready to start analysis</div>
                </div>
            `;
        }
        
        if (progressFill) {
            progressFill.style.width = '0%';
        }
        
        this.currentStep = 0;
        this.progressSteps = [];
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
console.log('📜 Dashboard script loaded');

document.addEventListener('DOMContentLoaded', function() {
    console.log('🎬 DOM ready - initializing StockGenius Dashboard');
    try {
        dashboard = new StockGeniusDashboard();
        console.log('✅ Dashboard initialized successfully');
    } catch (error) {
        console.error('❌ Dashboard initialization failed:', error);
    }
});

// Fallback initialization if DOMContentLoaded already fired
if (document.readyState === 'loading') {
    console.log('📜 Document still loading, waiting for DOMContentLoaded');
} else {
    console.log('📜 Document already loaded, initializing immediately');
    setTimeout(() => {
        if (!dashboard) {
            console.log('🔄 Fallback initialization');
            try {
                dashboard = new StockGeniusDashboard();
                console.log('✅ Fallback dashboard initialized successfully');
            } catch (error) {
                console.error('❌ Fallback dashboard initialization failed:', error);
            }
        }
    }, 100);
}