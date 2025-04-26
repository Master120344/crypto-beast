// File: tradeMasterBot.js
// TradeMasterBot: Elite trade execution bot for arbitrage opportunities
// Connects to PriceSentryBot's WebSocket server to receive opportunities from SpreadEagleBot, executes trades, and broadcasts profits
// Designed to link with PriceSentryBot, SpreadEagleBot, DecoyKrakenBot, DecoyCoinbaseBot, and EvolveGeniusBot

const WebSocket = require('ws');

// Configuration
const WEBSOCKET_SERVER_URL = 'ws://localhost:8081'; // WebSocket server hosted by PriceSentryBot
const TRADE_EXECUTION_INTERVAL = 5000; // Check for opportunities every 5 seconds (in milliseconds)
const TRADE_HISTORY_LIMIT = 500; // Maximum number of trade history entries to store in memory
const FEE_PERCENTAGE = 0.1; // Estimated trading fee percentage (0.1% per trade, adjust based on exchange)
const PROFIT_MULTIPLIER = 0.9; // Assume 90% of spread as profit after fees (to be adjusted later)

// Trade history for analysis and dashboard
let tradeHistory = [];

// Bot monitoring states for latency and updates
let monitoringData = {
    tradeMaster: { latency: 0, lastUpdate: 0 }
};

// Initialize WebSocket client to connect to PriceSentryBot's server
const wsClient = new WebSocket(WEBSOCKET_SERVER_URL);

// Handle WebSocket connection events
wsClient.on('open', () => {
    log('Connected to PriceSentryBot WebSocket server');
});

wsClient.on('message', async (message) => {
    try {
        const data = JSON.parse(message);
        if (data.type === 'opportunity') {
            const { pair, spread, buyExchange, sellExchange } = data.message;
            log(`Received arbitrage opportunity from SpreadEagleBot: ${pair}, Spread: $${spread}, Buy on ${buyExchange}, Sell on ${sellExchange}`);
            await executeTrade(spread, buyExchange, sellExchange);
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
    console.log(`${timestamp} - TradeMasterBot: ${message}`);
    // Broadcast log to PriceSentryBot's WebSocket server for dashboard visibility
    if (wsClient.readyState === WebSocket.OPEN) {
        const data = JSON.stringify({ type: 'log', message, timestamp });
        wsClient.send(data);
    }
}

// Broadcast trade data to PriceSentryBot's WebSocket server for dashboard
function broadcastTrade(trade) {
    const timestamp = new Date().toISOString();
    const data = JSON.stringify({ type: 'trade', message: trade, timestamp });
    if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(data);
    }
}

// Broadcast profit data to PriceSentryBot's WebSocket server for dashboard
function broadcastProfit(amount) {
    const timestamp = new Date().toISOString();
    const data = JSON.stringify({ type: 'profit', message: { amount }, timestamp });
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

// Execute trade based on arbitrage opportunity
async function executeTrade(spread, buyExchange, sellExchange) {
    const startTime = Date.now();
    try {
        // Calculate trade amount and profit (simulated for now)
        const tradeAmount = spread * PROFIT_MULTIPLIER; // Assume 90% of spread as profit after fees
        const fees = spread * FEE_PERCENTAGE / 100; // Estimated fees per trade
        const netProfit = tradeAmount - fees;

        // Simulate trade execution (since wallet isn't set up yet)
        log(`Simulating trade: Spread: $${spread}, Buy on ${buyExchange}, Sell on ${sellExchange}`);
        log(`Trade Amount: $${tradeAmount}, Estimated Fees: $${fees}, Net Profit: $${netProfit}`);

        // Store trade details
        const trade = {
            spread,
            buyExchange,
            sellExchange,
            tradeAmount,
            fees,
            netProfit,
            timestamp: startTime
        };
        tradeHistory.push(trade);
        broadcastTrade(trade);
        broadcastProfit(netProfit);

        // Optimize memory by limiting trade history
        if (tradeHistory.length > TRADE_HISTORY_LIMIT) {
            tradeHistory = tradeHistory.slice(-TRADE_HISTORY_LIMIT / 2);
        }

        // Update monitoring data
        monitoringData.tradeMaster.lastUpdate = startTime;
        monitoringData.tradeMaster.latency = Date.now() - startTime;
        broadcastMonitoring('TradeMaster', monitoringData.tradeMaster);
    } catch (e) {
        log(`Trade execution error: ${e.message}`);
    }
}

// Start TradeMasterBot
async function startTradeMasterBot() {
    log('TradeMasterBot starting...');
    log('Waiting for arbitrage opportunities from SpreadEagleBot...');
    // No loop needed; trades are executed on-demand via WebSocket messages
}

// Execute the bot
startTradeMasterBot();