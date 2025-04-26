// File: tradeMasterBot.js
// TradeMasterBot: Elite trade execution bot for arbitrage opportunities
// Connects to PriceSentryBot's WebSocket server to receive opportunities from SpreadEagleBot, executes real trades on Kraken and Coinbase
// Designed to link with PriceSentryBot, SpreadEagleBot, DecoyKrakenBot, DecoyCoinbaseBot, and EvolveGeniusBot

require('dotenv').config();
const WebSocket = require('ws');
const Kraken = require('kraken-api'); // Kraken API client (install via: npm install kraken-api)
const axios = require('axios'); // For Coinbase API calls

// Configuration
const WEBSOCKET_SERVER_URL = 'ws://localhost:8081'; // WebSocket server hosted by PriceSentryBot
const TRADE_EXECUTION_INTERVAL = 5000; // Check for opportunities every 5 seconds (in milliseconds)
const TRADE_HISTORY_LIMIT = 500; // Maximum number of trade history entries to store in memory
const FEE_PERCENTAGE = 0.1; // Estimated trading fee percentage (0.1% per trade, adjust based on exchange)
const PROFIT_MULTIPLIER = 0.9; // Assume 90% of spread as profit after fees (to be adjusted later)

// Kraken API setup (using existing keys, assuming trading permissions)
const KRAKEN_API_KEY = process.env.KRAKEN_API_KEY || 'uLlqQPALCxTNczwcnqhQRclF3z4IL/B9u';
const KRAKEN_API_SECRET = process.env.KRAKEN_API_SECRET || 'ME37ocQaoN0zVK3bv073tFiz7Z2fX6';
const kraken = new Kraken(KRAKEN_API_KEY, KRAKEN_API_SECRET);

// Coinbase API setup (placeholder for keys)
const COINBASE_API_KEY = process.env.COINBASE_API_KEY || 'your_coinbase_api_key_here';
const COINBASE_API_SECRET = process.env.COINBASE_API_SECRET || 'your_coinbase_api_secret_here';
const COINBASE_API_URL = 'https://api.coinbase.com/v2/'; // Base URL for Coinbase API

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

// Execute trade on Kraken (real order placement)
async function placeKrakenOrder(type, price, amount) {
    try {
        const orderDetails = {
            pair: 'XBTUSD', // Kraken pair for BTC/USD
            type: type, // 'buy' or 'sell'
            ordertype: 'limit',
            price: price,
            volume: amount
        };
        const response = await kraken.api('AddOrder', orderDetails);
        log(`Kraken ${type} order placed: ${JSON.stringify(response.result)}`);
        return response.result;
    } catch (e) {
        log(`Kraken order error: ${e.message}`);
        throw e;
    }
}

// Execute trade on Coinbase (real order placement, placeholder for API keys)
async function placeCoinbaseOrder(type, price, amount) {
    try {
        const orderDetails = {
            type: 'limit',
            side: type, // 'buy' or 'sell'
            product_id: 'BTC-USD',
            price: price,
            size: amount
        };
        const response = await axios.post(
            `${COINBASE_API_URL}orders`,
            orderDetails,
            {
                headers: {
                    'CB-ACCESS-KEY': COINBASE_API_KEY,
                    'CB-ACCESS-SIGN': 'TBD', // Requires Coinbase API signing, placeholder for now
                    'CB-ACCESS-TIMESTAMP': Math.floor(Date.now() / 1000),
                    'Content-Type': 'application/json'
                }
            }
        );
        log(`Coinbase ${type} order placed: ${JSON.stringify(response.data)}`);
        return response.data;
    } catch (e) {
        log(`Coinbase order error: ${e.message}`);
        throw e;
    }
}

// Execute trade based on arbitrage opportunity
async function executeTrade(spread, buyExchange, sellExchange) {
    const startTime = Date.now();
    try {
        // Calculate trade amount and profit
        const tradeAmount = spread * PROFIT_MULTIPLIER; // Assume 90% of spread as profit after fees
        const fees = spread * FEE_PERCENTAGE / 100; // Estimated fees per trade
        const netProfit = tradeAmount - fees;
        const btcAmount = tradeAmount / (buyExchange === 'Kraken' ? prices.kraken.btc_usd : prices.coinbase.btc_usd);

        log(`Executing trade: Spread: $${spread}, Buy on ${buyExchange}, Sell on ${sellExchange}`);
        log(`Trade Amount: $${tradeAmount}, BTC Amount: ${btcAmount}, Estimated Fees: $${fees}, Net Profit: $${netProfit}`);

        // Placeholder: Real trade execution requires API keys with trading permissions
        log('Trade execution requires trading API keys and wallet setup. Logging intended orders...');

        // Intended buy order
        const buyPrice = buyExchange === 'Kraken' ? prices.kraken.btc_usd : prices.coinbase.btc_usd;
        if (buyExchange === 'Kraken') {
            await placeKrakenOrder('buy', buyPrice, btcAmount);
        } else {
            await placeCoinbaseOrder('buy', buyPrice, btcAmount);
        }

        // Intended sell order
        const sellPrice = sellExchange === 'Kraken' ? prices.kraken.btc_usd : prices.coinbase.btc_usd;
        if (sellExchange === 'Kraken') {
            await placeKrakenOrder('sell', sellPrice, btcAmount);
        } else {
            await placeCoinbaseOrder('sell', sellPrice, btcAmount);
        }

        // Store trade details
        const trade = {
            spread,
            buyExchange,
            sellExchange,
            tradeAmount,
            btcAmount,
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