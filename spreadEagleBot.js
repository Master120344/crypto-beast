// File: spreadEagleBot.js
// SpreadEagleBot: Detects arbitrage opportunities by calculating price spreads between Kraken and PancakeSwap
// Connects to PriceSentryBot's WebSocket server to receive price data
// Designed to link with PriceSentryBot, TradeMasterBot, DecoyKrakenBot, DecoyCoinbaseBot, and EvolveGeniusBot

require('dotenv').config();
const WebSocket = require('ws');

// Configuration
const WEBSOCKET_SERVER_URL = 'ws://localhost:8081'; // WebSocket server hosted by PriceSentryBot
const WEBSOCKET_PORT = 8082; // Local WebSocket server port for broadcasting arbitrage opportunities
const SPREAD_CALCULATION_INTERVAL = 5000; // Calculate spread every 5 seconds
const SPREAD_THRESHOLD = 500; // Minimum spread in USD to consider an arbitrage opportunity

// Price tracking for Kraken and PancakeSwap (received from PriceSentryBot)
let prices = {
    kraken: { btc_usd: 0, bnb_usd: 0 },
    pancakeswap: { btc_bnb: 0 }
};

// Bot monitoring states for latency and updates
let monitoringData = {
    spreadEagle: { latency: 0, lastUpdate: 0 }
};

// Initialize WebSocket client to connect to PriceSentryBot's server
let wsClient;

// WebSocket server to broadcast arbitrage opportunities to TradeMasterBot
const wsServer = new WebSocket.Server({ port: WEBSOCKET_PORT });

// Function to set up WebSocket client and event handlers
function setupWebSocket() {
    wsClient = new WebSocket(WEBSOCKET_SERVER_URL);

    wsClient.on('open', () => {
        log('Connected to PriceSentryBot WebSocket server');
    });

    wsClient.on('message', async (message) => {
        try {
            if (wsClient.readyState !== WebSocket.OPEN) {
                log('Received message but client is not fully open, ignoring...');
                return;
            }

            log(`Received WebSocket message: ${message}`);
            const data = JSON.parse(message.toString());
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
        setTimeout(setupWebSocket, 5000); // Reconnect after 5 seconds
    });
}

// Log messages with timestamp for debugging and monitoring
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - SpreadEagleBot: ${message}`);
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        const data = JSON.stringify({ type: 'log', message, timestamp });
        wsClient.send(data);
    }
}

// Broadcast arbitrage opportunities to TradeMasterBot
function broadcastArbitrageOpportunity(spread, opportunity) {
    const timestamp = new Date().toISOString();
    const data = JSON.stringify({ type: 'arbitrage', message: { spread, opportunity }, timestamp });
    wsServer.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Calculate spread between Kraken and PancakeSwap prices
function calculateSpread() {
    const startTime = Date.now();
    try {
        // Ensure both prices are available before calculating spread
        if (prices.kraken.btc_usd <= 0 || prices.kraken.bnb_usd <= 0 || prices.pancakeswap.btc_bnb <= 0) {
            log(`Cannot calculate spread: Kraken BTC/USD=${prices.kraken.btc_usd}, Kraken BNB/USD=${prices.kraken.bnb_usd}, PancakeSwap BTC/BNB=${prices.pancakeswap.btc_bnb}`);
            return;
        }

        // Calculate PancakeSwap BTC price in USD
        const pancakeswapBtcUsd = prices.pancakeswap.btc_bnb * prices.kraken.bnb_usd;
        const spread = prices.kraken.btc_usd - pancakeswapBtcUsd;

        log(`Prices used for spread calculation: Kraken BTC/USD=${prices.kraken.btc_usd}, PancakeSwap BTC/BNB=${prices.pancakeswap.btc_bnb}, Kraken BNB/USD=${prices.kraken.bnb_usd}`);
        log(`Calculated spread: Kraken-PancakeSwap Spread: $${spread}`);

        // Detect arbitrage opportunity
        if (Math.abs(spread) > SPREAD_THRESHOLD) {
            const opportunity = spread > 0 ? 'Buy on PancakeSwap, Sell on Kraken' : 'Buy on Kraken, Sell on PancakeSwap';
            log(`Arbitrage opportunity detected: Spread $${spread}, Action: ${opportunity}`);
            broadcastArbitrageOpportunity(spread, opportunity);
        }

        // Update monitoring data
        monitoringData.spreadEagle.lastUpdate = startTime;
        monitoringData.spreadEagle.latency = Date.now() - startTime;
    } catch (e) {
        log(`Spread calculation error: ${e.message}`);
    }
}

// Start SpreadEagleBot
function startSpreadEagleBot() {
    log('SpreadEagleBot starting...');
    log('Waiting for price data from PriceSentryBot...');

    // Set up WebSocket connection to PriceSentryBot
    setupWebSocket();

    // Start WebSocket server for broadcasting to TradeMasterBot
    wsServer.on('connection', (ws) => {
        log('WebSocket client connected (TradeMasterBot)');
        ws.on('error', (error) => log(`WebSocket server error: ${error.message}`));
    });

    // Calculate spread at regular intervals
    setInterval(calculateSpread, SPREAD_CALCULATION_INTERVAL);
}

// Execute the bot
startSpreadEagleBot();
