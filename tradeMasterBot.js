// File: tradeMasterBot.js
// TradeMasterBot: Executes arbitrage trades using double flash loans on BNB Chain
// Connects to PriceSentryBot's WebSocket server to receive price data and SpreadEagleBot's WebSocket server to receive arbitrage opportunities
// Designed to link with PriceSentryBot, SpreadEagleBot, DecoyKrakenBot, DecoyCoinbaseBot, and EvolveGeniusBot

require('dotenv').config();
const WebSocket = require('ws');
const { ethers } = require('ethers');

// Configuration
const WEBSOCKET_SERVER_URL = 'ws://localhost:8081'; // WebSocket server hosted by PriceSentryBot
const SPREAD_EAGLE_WEBSOCKET_URL = 'ws://localhost:8082'; // WebSocket server hosted by SpreadEagleBot
const PROVIDER_URL_BSC = 'https://bsc-dataseed.binance.org/';
const FLASH_LOAN_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000'; // Dummy address
const FLASH_LOAN_AMOUNT = ethers.utils.parseEther('1'); // 1 BNB for flash loan (adjust as needed)
const WBNB = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c'; // Wrapped BNB (lowercase)
const BTCB = '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9'; // BTCB (Binance-Peg Bitcoin Token, lowercase)

// Flash Loan ABI (simplified)
const FLASH_LOAN_ABI = [
    {
        "name": "executeFlashLoan",
        "inputs": [
            { "name": "amount", "type": "uint256" },
            { "name": "tokenA", "type": "address" },
            { "name": "tokenB", "type": "address" }
        ],
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

// Initialize ethers provider
const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL_BSC);
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);
const flashLoanContract = new ethers.Contract(FLASH_LOAN_CONTRACT_ADDRESS, FLASH_LOAN_ABI, wallet);

// Price tracking for Kraken and PancakeSwap (received from PriceSentryBot)
let prices = {
    kraken: { btc_usd: 0, bnb_usd: 0 },
    pancakeswap: { btc_bnb: 0 }
};

// Bot monitoring states for latency and updates
let monitoringData = {
    tradeMaster: { latency: 0, lastUpdate: 0 }
};

// Initialize WebSocket clients
let priceSentryWsClient;
let spreadEagleWsClient;

// Function to set up PriceSentryBot WebSocket client and event handlers
function setupPriceSentryWebSocket() {
    priceSentryWsClient = new WebSocket(WEBSOCKET_SERVER_URL);

    priceSentryWsClient.on('open', () => {
        log('Connected to PriceSentryBot WebSocket server');
    });

    priceSentryWsClient.on('message', async (message) => {
        try {
            if (priceSentryWsClient.readyState !== WebSocket.OPEN) {
                log('Received message but client is not fully open, ignoring...');
                return;
            }

            log(`Received PriceSentryBot WebSocket message: ${message}`);
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
            log(`PriceSentryBot WebSocket message error: ${e.message}`);
        }
    });

    priceSentryWsClient.on('error', (error) => {
        log(`PriceSentryBot WebSocket error: ${error.message}`);
    });

    priceSentryWsClient.on('close', () => {
        log('Disconnected from PriceSentryBot WebSocket server. Attempting to reconnect...');
        setTimeout(setupPriceSentryWebSocket, 5000); // Reconnect after 5 seconds
    });
}

// Function to set up SpreadEagleBot WebSocket client and event handlers
function setupSpreadEagleWebSocket() {
    spreadEagleWsClient = new WebSocket(SPREAD_EAGLE_WEBSOCKET_URL);

    spreadEagleWsClient.on('open', () => {
        log('Connected to SpreadEagleBot WebSocket server');
    });

    spreadEagleWsClient.on('message', async (message) => {
        try {
            if (spreadEagleWsClient.readyState !== WebSocket.OPEN) {
                log('Received SpreadEagleBot message but client is not fully open, ignoring...');
                return;
            }

            log(`Received SpreadEagleBot WebSocket message: ${message}`);
            const data = JSON.parse(message.toString());
            if (data.type === 'arbitrage') {
                const { spread, opportunity } = data.message;
                log(`Received arbitrage opportunity: Spread $${spread}, Action: ${opportunity}`);
                await executeDoubleFlashLoanTrade(spread, opportunity);
            }
        } catch (e) {
            log(`SpreadEagleBot WebSocket message error: ${e.message}`);
        }
    });

    spreadEagleWsClient.on('error', (error) => {
        log(`SpreadEagleBot WebSocket error: ${error.message}`);
    });

    spreadEagleWsClient.on('close', () => {
        log('Disconnected from SpreadEagleBot WebSocket server. Attempting to reconnect...');
        setTimeout(setupSpreadEagleWebSocket, 5000); // Reconnect after 5 seconds
    });
}

// Log messages with timestamp for debugging and monitoring
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - TradeMasterBot: ${message}`);
    if (priceSentryWsClient && priceSentryWsClient.readyState === WebSocket.OPEN) {
        const data = JSON.stringify({ type: 'log', message, timestamp });
        priceSentryWsClient.send(data);
    }
}

// Broadcast trade data to PriceSentryBot's WebSocket server for dashboard
function broadcastTrade(trade) {
    const timestamp = new Date().toISOString();
    const data = JSON.stringify({ type: 'trade', message: trade, timestamp });
    if (priceSentryWsClient && priceSentryWsClient.readyState === WebSocket.OPEN) {
        priceSentryWsClient.send(data);
    }
}

// Execute double flash loan trade on BNB Chain
async function executeDoubleFlashLoanTrade(spread, opportunity) {
    const startTime = Date.now();
    try {
        log(`Executing double flash loan trade with spread $${spread}, opportunity: ${opportunity}`);
        const tokenA = WBNB;
        const tokenB = BTCB;

        const tx = await flashLoanContract.executeFlashLoan(
            FLASH_LOAN_AMOUNT,
            tokenA,
            tokenB,
            {
                gasLimit: 1000000,
                gasPrice: ethers.utils.parseUnits('5', 'gwei')
            }
        );

        const receipt = await tx.wait();
        log(`Trade executed successfully: ${receipt.transactionHash}`);
        broadcastTrade({ spread, opportunity, txHash: receipt.transactionHash });

        // Update monitoring data
        monitoringData.tradeMaster.lastUpdate = startTime;
        monitoringData.tradeMaster.latency = Date.now() - startTime;
    } catch (e) {
        log(`Trade execution error: ${e.message}`);
    }
}

// Start TradeMasterBot
function startTradeMasterBot() {
    log('TradeMasterBot starting...');
    log('Waiting for arbitrage opportunities from SpreadEagleBot...');

    // Set up WebSocket connections
    setupPriceSentryWebSocket();
    setupSpreadEagleWebSocket();
}

// Execute the bot
startTradeMasterBot();
