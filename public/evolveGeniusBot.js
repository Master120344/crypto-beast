// File: evolveGeniusBot.js
// EvolveGeniusBot: Elite self-optimization bot for analyzing trade performance and adjusting strategies
// Connects to PriceSentryBot's WebSocket server to receive trade data from TradeMasterBot, optimizes system parameters
// Designed to link with PriceSentryBot, SpreadEagleBot, TradeMasterBot, DecoyKrakenBot, and DecoyCoinbaseBot

const WebSocket = require('ws');

// Configuration
const WEBSOCKET_SERVER_URL = 'ws://localhost:8081'; // WebSocket server hosted by PriceSentryBot
const OPTIMIZATION_INTERVAL = 60000; // Analyze performance every 60 seconds (in milliseconds)
const TRADE_ANALYSIS_LIMIT = 10; // Number of recent trades to analyze for performance metrics
const SUCCESS_RATE_THRESHOLD = 0.5; // Minimum success rate (50%) before adjusting strategy
const SPREAD_THRESHOLD_INCREMENT = 10; // Increase spread threshold by $10 if success rate is below threshold
const PERFORMANCE_HISTORY_LIMIT = 200; // Maximum number of performance history entries to store in memory

// Trade history received from TradeMasterBot
let tradeHistory = [];

// Performance history for analysis and dashboard
let performanceHistory = [];

// Current spread threshold (can be adjusted dynamically)
let currentSpreadThreshold = 100; // Initial threshold from SpreadEagleBot

// Bot monitoring states for latency and updates
let monitoringData = {
    evolveGenius: { latency: 0, lastUpdate: 0 }
};

// Initialize WebSocket client to connect to PriceSentryBot's server
const wsClient = new WebSocket(WEBSOCKET_SERVER_URL);

// Handle WebSocket connection events
wsClient.on('open', () => {
    log('Connected to PriceSentryBot WebSocket server');
});

wsClient.on('message', (message) => {
    try {
        const data = JSON.parse(message);
        if (data.type === 'trade') {
            const trade = data.message;
            tradeHistory.push(trade);
            log(`Received trade from TradeMasterBot: Spread: $${trade.spread}, Buy on ${trade.buyExchange}, Sell on ${sellExchange}`);
        }
    } catch (e) {
        log(`WebSocket message error: ${e.message}`);
    }
});

wsClient.on('error', (error) => {
    log(`WebSocket error: ${error.message}`);
});

wsClient.on('close', () => {
    log('Disconnected from PriceSentryBot WebSocket server. Attempting to reconnect...');
    setTimeout(() => {
        wsClient = new WebSocket(WEBSOCKET_SERVER_URL); // Reconnect after 5 seconds
    }, 5000);
});

// Log messages with timestamp for debugging and monitoring
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - EvolveGeniusBot: ${message}`);
    // Broadcast log to PriceSentryBot's WebSocket server for dashboard visibility
    if (wsClient.readyState === WebSocket.OPEN) {
        const data = JSON.stringify({ type: 'log', message, timestamp });
        wsClient.send(data);
    }
}

// Broadcast performance metrics to PriceSentryBot's WebSocket server for dashboard
function broadcastPerformance(metrics) {
    const timestamp = new Date().toISOString();
    const data = JSON.stringify({ type: 'performance', message: metrics, timestamp });
    if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(data);
    }
}

// Broadcast updated spread threshold to SpreadEagleBot
function broadcastThresholdUpdate(newThreshold) {
    const timestamp = new Date().toISOString();
    const data = JSON.stringify({ type: 'thresholdUpdate', message: { newThreshold }, timestamp });
    if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(data);
    }
}

// Broadcast monitoring data (latency, last update) to dashboard
function broadcastMonitoring(exchange, data) {
    const timestamp = new Date().toISOString();
    const dataPayload = JSON.stringify({ type: 'monitoring', message: { exchange, data }, timestamp });
    if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(dataPayload);
    }
}

// Analyze trade performance and adjust strategies
async function optimizeSystem() {
    while (true) {
        const startTime = Date.now();
        try {
            if (tradeHistory.length < TRADE_ANALYSIS_LIMIT) {
                log(`Waiting for more trades to analyze... (${tradeHistory.length}/${TRADE_ANALYSIS_LIMIT})`);
                await new Promise(resolve => setTimeout(resolve, OPTIMIZATION_INTERVAL));
                continue;
            }

            // Analyze recent trades (last 10)
            const recentTrades = tradeHistory.slice(-TRADE_ANALYSIS_LIMIT);
            const avgSpread = recentTrades.reduce((sum, trade) => sum + trade.spread, 0) / TRADE_ANALYSIS_LIMIT;
            const successRate = recentTrades.filter(t => t.spread > currentSpreadThreshold).length / TRADE_ANALYSIS_LIMIT;

            // Log and broadcast performance metrics
            const metrics = {
                avgSpread,
                successRate: successRate * 100, // Convert to percentage
                currentThreshold: currentSpreadThreshold,
                timestamp: startTime
            };
            log(`Performance Metrics - Avg Spread: $${avgSpread}, Success Rate: ${metrics.successRate}%, Current Threshold: $${currentSpreadThreshold}`);
            performanceHistory.push(metrics);
            broadcastPerformance(metrics);

            // Adjust strategy if success rate is below threshold
            if (successRate < SUCCESS_RATE_THRESHOLD) {
                currentSpreadThreshold += SPREAD_THRESHOLD_INCREMENT;
                log(`Success rate below ${SUCCESS_RATE_THRESHOLD * 100}% - Increasing spread threshold to $${currentSpreadThreshold}`);
                broadcastThresholdUpdate(currentSpreadThreshold);
            }

            // Optimize memory by limiting performance history
            if (performanceHistory.length > PERFORMANCE_HISTORY_LIMIT) {
                performanceHistory = performanceHistory.slice(-PERFORMANCE_HISTORY_LIMIT / 2);
            }

            // Optimize memory by limiting trade history
            if (tradeHistory.length > PERFORMANCE_HISTORY_LIMIT) {
                tradeHistory = tradeHistory.slice(-PERFORMANCE_HISTORY_LIMIT / 2);
            }

            // Update monitoring data
            monitoringData.evolveGenius.lastUpdate = startTime;
            monitoringData.evolveGenius.latency = Date.now() - startTime;
            broadcastMonitoring('EvolveGenius', monitoringData.evolveGenius);
        } catch (e) {
            log(`Optimization error: ${e.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, OPTIMIZATION_INTERVAL));
    }
}

// Start EvolveGeniusBot
async function startEvolveGeniusBot() {
    log('EvolveGeniusBot starting...');
    log('Waiting for trade data from TradeMasterBot to optimize system...');
    optimizeSystem();
}

// Execute the bot
startEvolveGeniusBot();