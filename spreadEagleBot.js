// File: spreadEagleBot.js
// SpreadEagleBot: Detects arbitrage opportunities by calculating price spreads between Kraken and PancakeSwap
// Connects to PriceSentryBot's WebSocket server to receive price data

require('dotenv').config();
const WebSocket = require('ws');

// Configuration
const WEBSOCKET_SERVER_URL = 'ws://localhost:8081'; // PriceSentryBot's WebSocket server
const WEBSOCKET_PORT = 8082; // Local WebSocket server port for TradeMasterBot
const SPREAD_CALCULATION_INTERVAL = 5000; // Calculate spread every 5 seconds
const SPREAD_THRESHOLD = 10; // Minimum spread in USD for arbitrage (for testing)

// Price tracking
let prices = {
    kraken: { btc_usd: 0, bnb_usd: 0 },
    pancakeswap: { btc_bnb: 0 }
};

// WebSocket setup
let wsClient;
const wsServer = new WebSocket.Server({ port: WEBSOCKET_PORT });

// Log function
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - SpreadEagleBot: ${message}`);
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({ type: 'log', message, timestamp }));
    }
}

// WebSocket client setup
function setupWebSocket() {
    wsClient = new WebSocket(WEBSOCKET_SERVER_URL);
    wsClient.on('open', () => log('Connected to PriceSentryBot WebSocket server'));
    wsClient.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'price') {
                const { exchange, price } = data.message;
                if (exchange.toLowerCase() === 'kraken') {
                    prices.kraken.btc_usd = price;
                    log(`Updated Kraken BTC/USD Price: $${price}`);
                } else if (exchange.toLowerCase() === 'kraken_bnb') {
                    prices.kraken.bnb_usd = price;
                    log(`Updated Kraken BNB/USD Price: $${price}`);
                } else if (exchange.toLowerCase() === 'pancakeswap') {
                    prices.pancakeswap.btc_bnb = price;
                    log(`Updated PancakeSwap BTC/BNB Price: ${price} BNB`);
                }
            }
        } catch (e) {
            log(`WebSocket message error: ${e.message}`);
        }
    });
    wsClient.on('error', (error) => log(`WebSocket error: ${error.message}`));
    wsClient.on('close', () => {
        log('Disconnected from PriceSentryBot WebSocket server. Reconnecting...');
        setTimeout(setupWebSocket, 5000);
    });
}

// Broadcast arbitrage opportunities
function broadcastArbitrageOpportunity(spread, opportunity) {
    const timestamp = new Date().toISOString();
    const data = JSON.stringify({ type: 'arbitrage', message: { spread, opportunity }, timestamp });
    wsServer.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(data);
    });
}

// Calculate spread (Fixed version)
function calculateSpread() {
    const startTime = Date.now();
    try {
        // Check for valid prices
        if (prices.kraken.btc_usd <= 0 || prices.kraken.bnb_usd <= 0 || prices.pancakeswap.btc_bnb <= 0) {
            log(`Cannot calculate spread: Kraken BTC/USD=${prices.kraken.btc_usd}, Kraken BNB/USD=${prices.kraken.bnb_usd}, PancakeSwap BTC/BNB=${prices.pancakeswap.btc_bnb}`);
            return;
        }

        // Calculate spread
        const pancakeswapBtcUsd = prices.pancakeswap.btc_bnb * prices.kraken.bnb_usd;
        const spread = prices.kraken.btc_usd - pancakeswapBtcUsd;

        log(`Prices: Kraken BTC/USD=${prices.kraken.btc_usd}, PancakeSwap BTC/BNB=${prices.pancakeswap.btc_bnb}, Kraken BNB/USD=${prices.kraken.bnb_usd}`);
        log(`Calculated spread: $${spread}`);

        // Check for arbitrage
        if (Math.abs(spread) > SPREAD_THRESHOLD) {
            const opportunity = spread > 0 ? 'Buy on PancakeSwap, Sell on Kraken' : 'Buy on Kraken, Sell on PancakeSwap';
            log(`Arbitrage opportunity detected: Spread $${spread}, Action: ${opportunity}`);
            broadcastArbitrageOpportunity(spread, opportunity);
        }
    } catch (e) {
        log(`Spread calculation error: ${e.message}`);
    }
}

// Start the bot
function startSpreadEagleBot() {
    log('SpreadEagleBot starting...');
    setupWebSocket();
    wsServer.on('connection', (ws) => log('WebSocket client connected (TradeMasterBot)'));
    setInterval(calculateSpread, SPREAD_CALCULATION_INTERVAL);
}

startSpreadEagleBot();
