// File: spreadEagleBot.js
// SpreadEagleBot: Elite spread analysis bot for arbitrage opportunities
// Analyzes price spreads between Kraken and PancakeSwap, broadcasts opportunities to TradeMasterBot
// Designed to link with PriceSentryBot, TradeMasterBot, DecoyKrakenBot, DecoyCoinbaseBot, and EvolveGeniusBot

require('dotenv').config();
const WebSocket = require('ws');

// Configuration
const WEBSOCKET_SERVER_URL = 'ws://localhost:8081'; // WebSocket server hosted by PriceSentryBot
const SPREAD_THRESHOLD = 100; // Minimum spread in USD to trigger an arbitrage opportunity
const SPREAD_CHECK_INTERVAL = 5000; // Check spreads every 5 seconds

// Prices for exchanges (received from PriceSentryBot)
let prices = {
    kraken: { btc_usd: 0, bnb_usd: 0 },
    pancakeswap: { btc_bnb: 0 }
};

// Spread history for analysis
let spreadHistory = [];

// Bot monitoring states for latency and updates
let monitoringData = {
    spreadEagle: { latency: 0, lastUpdate: 0 }
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
        if (data.type === 'price') {
            const { exchange, price } = data.message;
            if (exchange.toLowerCase() === 'kraken') {
                prices.kraken.btc_usd = price;
                log(`Received Kraken BTC/USD Price: $${price}`);
            } else if (exchange.toLowerCase() === 'kraken_bnb') {
                prices.kraken.bnb_usd = price;
                log(`Received Kraken BNB/USD Price: $${price}`);
            } else if (exchange.toLowerCase() === 'pancakeswap') {
                prices.pancakeswap.btc_bnb = price;
                log(`Received PancakeSwap BTC/BNB Price: ${price} BNB`);
            }
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
    if (wsClient.readyState === WebSocket.OPEN) {
        const data = JSON.stringify({ type: 'log', message, timestamp });
        wsClient.send(data);
    }
}

// Broadcast arbitrage opportunity to TradeMasterBot
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

// Calculate spreads and detect arbitrage opportunities
function calculateSpreads() {
    const startTime = Date.now();
    try {
        // Calculate Kraken-PancakeSwap spread
        const krakenPriceUSD = prices.kraken.btc_usd;
        const pancakeswapPriceUSD = prices.pancakeswap.btc_bnb * prices.kraken.bnb_usd;
        const spread = Math.abs(krakenPriceUSD - pancakeswapPriceUSD);

        log(`Kraken-PancakeSwap Spread: $${spread}`);

        // Store spread history for analysis
        spreadHistory.push({ spread, timestamp: startTime });

        // Detect arbitrage opportunities
        if (spread >= SPREAD_THRESHOLD && krakenPriceUSD > 0 && pancakeswapPriceUSD > 0) {
            const buyExchange = krakenPriceUSD < pancakeswapPriceUSD ? 'Kraken' : 'PancakeSwap';
            const sellExchange = krakenPriceUSD < pancakeswapPriceUSD ? 'PancakeSwap' : 'Kraken';
            log(`Arbitrage opportunity detected: Spread: $${spread}, Buy on ${buyExchange}, Sell on ${sellExchange}`);
            broadcastOpportunity('BTC/USD', spread, buyExchange, sellExchange);
        }

        // Update monitoring data
        monitoringData.spreadEagle.lastUpdate = startTime;
        monitoringData.spreadEagle.latency = Date.now() - startTime;
        broadcastMonitoring('SpreadEagle', monitoringData.spreadEagle);
    } catch (e) {
        log(`Spread calculation error: ${e.message}`);
    }
}

// Start SpreadEagleBot
function startSpreadEagleBot() {
    log('SpreadEagleBot starting...');
    log('Waiting for price data from PriceSentryBot...');

    // Check spreads at regular intervals
    setInterval(calculateSpreads, SPREAD_CHECK_INTERVAL);
}

// Execute the bot
startSpreadEagleBot();
