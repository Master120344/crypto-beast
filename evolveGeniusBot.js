// File: evolveGeniusBot.js
// EvolveGeniusBot: Adaptive bot for system optimization and evolution
// Analyzes trade data from TradeMasterBot, adjusts system parameters for better performance
// Designed to link with PriceSentryBot, SpreadEagleBot, TradeMasterBot, DecoyKrakenBot, and DecoyCoinbaseBot

require('dotenv').config();
const WebSocket = require('ws');

// Configuration
const WEBSOCKET_SERVER_URL = 'ws://localhost:8081'; // WebSocket server hosted by PriceSentryBot
const TRADE_ANALYSIS_THRESHOLD = 10; // Number of trades required before optimization
const OPTIMIZATION_INTERVAL = 60000; // Optimize every 60 seconds

// Trade history for analysis
let tradeHistory = [];

// Bot monitoring states for latency and updates
let monitoringData = {
    evolveGenius: { latency: 0, lastUpdate: 0 }
};

// Initialize WebSocket client to connect to PriceSentryBot's server
let wsClient = new WebSocket(WEBSOCKET_SERVER_URL);

// Handle WebSocket connection events
wsClient.on('open', () => {
    log('Connected to PriceSentryBot WebSocket server');
});

wsClient.on('message', async (message) => {
    try {
        const data = JSON.parse(message);
        if (data.type === 'trade') {
            tradeHistory.push(data.message);
            log(`Received trade data from TradeMasterBot: ${JSON.stringify(data.message)}`);
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
    if (wsClient.readyState === WebSocket.OPEN) {
        const data = JSON.stringify({ type: 'log', message, timestamp });
        wsClient.send(data);
    }
}

// Broadcast optimization suggestion to other bots
function broadcastOptimization(suggestion) {
    const timestamp = new Date().toISOString();
    const data = JSON.stringify({ type: 'optimization', message: suggestion, timestamp });
    if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(data);
    }
}

// Optimize system based on trade history
function optimizeSystem() {
    const startTime = Date.now();
    try {
        if (tradeHistory.length < TRADE_ANALYSIS_THRESHOLD) {
            log(`Waiting for more trades to analyze... (${tradeHistory.length}/${TRADE_ANALYSIS_THRESHOLD})`);
            return;
        }

        // Simple optimization: Adjust spread threshold based on average profit
        const totalProfit = tradeHistory.reduce((sum, trade) => sum + trade.netProfit, 0);
        const avgProfit = totalProfit / tradeHistory.length;
        const newSpreadThreshold = avgProfit * 1.2; // Increase threshold by 20% of average profit

        log(`Optimizing system: New spread threshold: $${newSpreadThreshold}`);
        broadcastOptimization({ newSpreadThreshold });

        // Update monitoring data
        monitoringData.evolveGenius.lastUpdate = startTime;
        monitoringData.evolveGenius.latency = Date.now() - startTime;
    } catch (e) {
        log(`Optimization error: ${e.message}`);
    }
}

// Start EvolveGeniusBot
function startEvolveGeniusBot() {
    log('EvolveGeniusBot starting...');
    log('Waiting for trade data from TradeMasterBot to optimize system...');

    // Optimize system at regular intervals
    setInterval(optimizeSystem, OPTIMIZATION_INTERVAL);
}

// Execute the bot
startEvolveGeniusBot();
