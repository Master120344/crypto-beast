// File: spreadEagleBot.js
// SpreadEagleBot: Elite arbitrage spread calculator bot for identifying trading opportunities
// Connects to PriceSentryBot via WebSocket to receive price data, calculates spreads, and broadcasts opportunities
// Designed to link with PriceSentryBot, TradeMasterBot, DecoyKrakenBot, DecoyCoinbaseBot, and EvolveGeniusBot

const WebSocket = require('ws');

// Configuration
const WEBSOCKET_SERVER_URL = 'ws://localhost:8081'; // WebSocket server hosted by PriceSentryBot
const SPREAD_CALC_INTERVAL = 10000; // Calculate spreads every 10 seconds (in milliseconds)
const SPREAD_THRESHOLD = 100; // Minimum spread to consider an arbitrage opportunity (in USD)
const SPREAD_HISTORY_LIMIT = 500; // Maximum number of spread history entries to store in memory

// Price tracking for exchanges (received from PriceSentryBot)
let prices = {
    kraken: { btc_usd: 0 },
    coinbase: { btc_usd: 0 }
};

// Spread history for analysis and dashboard
let spreadHistory = [];

// Bot monitoring states for latency and updates
let monitoringData = {
    spreadEagle: { latency: 0, lastUpdate: 0 }
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
        if (data.type === 'price') {
            const { exchange, price } = data.message;
            prices[exchange.toLowerCase()].btc_usd = price;
            log(`Received ${exchange} BTC/USD Price: $${price}`);
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
    console.log(`${timestamp} - SpreadEagleBot: ${message}`);
    // Broadcast log to PriceSentryBot's WebSocket server for dashboard visibility
    if (wsClient.readyState === WebSocket.OPEN) {
        const data = JSON.stringify({ type: 'log', message, timestamp });
        wsClient.send(data);
    }
}

// Broadcast spread data to PriceSentryBot's WebSocket server for dashboard and other bots
function broadcastSpread(pair, spread) {
    const timestamp = new Date().toISOString();
    const data = JSON.stringify({ type: 'spread', message: { pair, spread }, timestamp });
    if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(data);
    }
}

// Broadcast arbitrage opportunity to TradeMasterBot and dashboard
function broadcastOpportunity(pair, spread, buyExchange, sellExchange) {
    const timestamp = new Date().toISOString();
    const data = JSON.stringify({ type: 'opportunity', message: { pair, spread, buyExchange, sellExchange }, timestamp });
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

// Calculate arbitrage spreads and identify opportunities
async function calculateSpreads() {
    while (true) {
        const startTime = Date.now();
        try {
            const krakenPrice = prices.kraken.btc_usd;
            const coinbasePrice = prices.coinbase.btc_usd;

            // Calculate spread between Kraken and Coinbase
            const spread = Math.abs(krakenPrice - coinbasePrice);
            const pair = 'Kraken-Coinbase';

            // Log and broadcast the spread
            log(`${pair} Spread: $${spread}`);
            spreadHistory.push({ pair, spread, timestamp: startTime });
            broadcastSpread(pair, spread);

            // Optimize memory by limiting spread history
            if (spreadHistory.length > SPREAD_HISTORY_LIMIT) {
                spreadHistory = spreadHistory.slice(-SPREAD_HISTORY_LIMIT / 2);
            }

            // Check for arbitrage opportunity
            if (spread > SPREAD_THRESHOLD) {
                const buyExchange = coinbasePrice < krakenPrice ? 'Coinbase' : 'Kraken';
                const sellExchange = coinbasePrice < krakenPrice ? 'Kraken' : 'Coinbase';
                log(`Arbitrage opportunity detected on ${pair}! Spread: $${spread}, Buy on ${buyExchange}, Sell on ${sellExchange}`);
                broadcastOpportunity(pair, spread, buyExchange, sellExchange);
            }

            // Update monitoring data
            monitoringData.spreadEagle.lastUpdate = startTime;
            monitoringData.spreadEagle.latency = Date.now() - startTime;
            broadcastMonitoring('SpreadEagle', monitoringData.spreadEagle);
        } catch (e) {
            log(`Spread calculation error: ${e.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, SPREAD_CALC_INTERVAL));
    }
}

// Start SpreadEagleBot
async function startSpreadEagleBot() {
    log('SpreadEagleBot starting...');
    log('Waiting for price data from PriceSentryBot...');
    calculateSpreads();
}

// Execute the bot
startSpreadEagleBot();