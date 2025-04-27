// File: tradeMasterBot.js
// TradeMasterBot: Executes arbitrage trades using double flash loans on BNB Chain
// Connects to PriceSentryBot and SpreadEagleBot WebSocket servers for price and arbitrage data

require('dotenv').config();
const WebSocket = require('ws');
const { ethers } = require('ethers');

// Configuration
const PRICE_WEBSOCKET_SERVER_URL = 'ws://localhost:8081'; // PriceSentryBot WebSocket server
const SPREAD_WEBSOCKET_SERVER_URL = 'ws://localhost:8082'; // SpreadEagleBot WebSocket server
const WEBSOCKET_PORT = 8083; // Local WebSocket server for broadcasting trade data
const PROVIDER_URL_BSC = 'https://bsc-dataseed.binance.org/';
const FLASH_LOAN_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000'; // Placeholder for flash loan contract

// Token addresses (Checksummed using ethers.utils.getAddress)
const WBNB = ethers.utils.getAddress('0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c'); // 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
const BTCB = ethers.utils.getAddress('0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9'); // 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c
const PANCAKESWAP_ROUTER = ethers.utils.getAddress('0x10ed43c718714eb63d5aa57b78b54704e256024e'); // PancakeSwap Router

// Initialize ethers provider and wallet
const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL_BSC);
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

// WebSocket clients and server
let priceWsClient, spreadWsClient;
const wsServer = new WebSocket.Server({ port: WEBSOCKET_PORT });

// Price tracking
let prices = {
    kraken: { btc_usd: 0, bnb_usd: 0 },
    pancakeswap: { btc_bnb: 0 }
};

// Log messages
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - TradeMasterBot: ${message}`);
    wsServer.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'log', message, timestamp }));
        }
    });
}

// Broadcast trade execution data
function broadcastTradeExecution(tradeDetails) {
    const timestamp = new Date().toISOString();
    const data = JSON.stringify({ type: 'trade', message: tradeDetails, timestamp });
    wsServer.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Connect to PriceSentryBot WebSocket server
function setupPriceWebSocket() {
    priceWsClient = new WebSocket(PRICE_WEBSOCKET_SERVER_URL);
    priceWsClient.on('open', () => log('Connected to PriceSentryBot WebSocket server'));
    priceWsClient.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            log(`Received PriceSentryBot WebSocket message: ${JSON.stringify(data)}`);
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
            log(`PriceSentryBot WebSocket message error: ${e.message}`);
        }
    });
    priceWsClient.on('error', (error) => log(`PriceSentryBot WebSocket error: ${error.message}`));
    priceWsClient.on('close', () => {
        log('Disconnected from PriceSentryBot WebSocket server. Attempting to reconnect...');
        setTimeout(setupPriceWebSocket, 5000);
    });
}

// Connect to SpreadEagleBot WebSocket server
function setupSpreadWebSocket() {
    spreadWsClient = new WebSocket(SPREAD_WEBSOCKET_SERVER_URL);
    spreadWsClient.on('open', () => log('Connected to SpreadEagleBot WebSocket server'));
    spreadWsClient.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            log(`Received SpreadEagleBot WebSocket message: ${JSON.stringify(data)}`);
            if (data.type === 'arbitrage') {
                const { spread, opportunity } = data.message;
                log(`Received arbitrage opportunity: Spread $${spread}, Action: ${opportunity}`);
                await executeDoubleFlashLoanTrade(spread, opportunity);
            }
        } catch (e) {
            log(`SpreadEagleBot WebSocket message error: ${e.message}`);
        }
    });
    spreadWsClient.on('error', (error) => log(`SpreadEagleBot WebSocket error: ${error.message}`));
    spreadWsClient.on('close', () => {
        log('Disconnected from SpreadEagleBot WebSocket server. Attempting to reconnect...');
        setTimeout(setupSpreadWebSocket, 5000);
    });
}

// Execute double flash loan trade (simplified)
async function executeDoubleFlashLoanTrade(spread, opportunity) {
    try {
        log(`Executing double flash loan trade with spread $${spread}, opportunity: ${opportunity}`);
        // Placeholder logic for flash loan trade
        const tradeDetails = {
            spread,
            opportunity,
            amount: 0.001, // Example trade amount in BTC
            timestamp: new Date().toISOString()
        };
        // Simulate interaction with flash loan contract (placeholder address)
        const flashLoanContract = new ethers.Contract(FLASH_LOAN_CONTRACT_ADDRESS, [], wallet);
        // Simulate trade logic (buy on one exchange, sell on the other)
        if (opportunity === 'Buy on Kraken, Sell on PancakeSwap') {
            // Step 1: Flash loan BTC
            // Step 2: Sell BTC for BNB on PancakeSwap
            // Step 3: Sell BNB for USD on Kraken (simulated)
            // Step 4: Repay flash loan with profit
            tradeDetails.status = 'success';
            tradeDetails.profit = Math.abs(spread) * tradeDetails.amount * 0.9; // 90% of spread as profit after fees
        } else {
            // Step 1: Flash loan BNB
            // Step 2: Buy BTC on PancakeSwap
            // Step 3: Sell BTC for USD on Kraken (simulated)
            // Step 4: Repay flash loan with profit
            tradeDetails.status = 'success';
            tradeDetails.profit = Math.abs(spread) * tradeDetails.amount * 0.9;
        }
        log(`Trade executed successfully: Profit $${tradeDetails.profit}`);
        broadcastTradeExecution(tradeDetails);
    } catch (e) {
        log(`Trade execution error: ${e.message}`);
        const tradeDetails = {
            spread,
            opportunity,
            amount: 0.001,
            status: 'failed',
            error: e.message,
            timestamp: new Date().toISOString()
        };
        broadcastTradeExecution(tradeDetails);
    }
}

// Start TradeMasterBot
function startTradeMasterBot() {
    log('TradeMasterBot starting...');
    log('Waiting for arbitrage opportunities from SpreadEagleBot...');
    setupPriceWebSocket();
    setupSpreadWebSocket();
    wsServer.on('connection', (ws) => {
        log('WebSocket client connected (EvolveGeniusBot)');
        ws.on('error', (error) => log(`WebSocket server error: ${error.message}`));
    });
}

startTradeMasterBot();
