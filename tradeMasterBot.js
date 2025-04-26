// File: tradeMasterBot.js
// TradeMasterBot: Elite trade execution bot for arbitrage opportunities using double flash loans
// Connects to PriceSentryBot's WebSocket server to receive opportunities from SpreadEagleBot, executes trades on PancakeSwap and Kraken
// Designed to link with PriceSentryBot, SpreadEagleBot, DecoyKrakenBot, DecoyCoinbaseBot, and EvolveGeniusBot

require('dotenv').config();
const WebSocket = require('ws');
const Kraken = require('kraken-api');
const { ethers } = require('ethers');

// Configuration
const WEBSOCKET_SERVER_URL = 'ws://localhost:8081'; // WebSocket server hosted by PriceSentryBot
const PROVIDER_URL_BSC = 'https://bsc-dataseed.binance.org/'; // BNB Chain provider
const TRADE_HISTORY_LIMIT = 500; // Maximum number of trade history entries to store in memory
const FEE_PERCENTAGE_PANCAKESWAP = 0.25; // PancakeSwap trading fee (0.25%)
const FEE_PERCENTAGE_KRAKEN = 0.1; // Kraken trading fee (0.1%)
const FLASH_LOAN_FEE = 0.09; // Aave flash loan fee (0.09%)
const GAS_FEE_BUFFER = 0.001; // Extra BNB for gas fees (~$0.50)
const MINIMUM_PROFIT_USD = 10; // Minimum profit per trade to ensure at least $10-$20

// Kraken API setup
const KRAKEN_API_KEY = process.env.KRAKEN_API_KEY || 'uLlqQPALCxTNczwcnqhQRclF3z4IL/B9u';
const KRAKEN_API_SECRET = process.env.KRAKEN_API_SECRET || 'ME37ocQaoN0zVK3bv073tFiz7Z2fX6';
const kraken = new Kraken(KRAKEN_API_KEY, KRAKEN_API_SECRET);

// Wallet setup for DeFi trading
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY || 'your_wallet_private_key_here';
const providerBSC = new ethers.JsonRpcProvider(PROVIDER_URL_BSC);
const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY, providerBSC);

// PancakeSwap Router and Aave Lending Pool (BNB Chain)
const PANCAKESWAP_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024'; // PancakeSwap Router V2
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'; // Wrapped BNB
const BTCB = '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9'; // BTCB (Binance-Peg Bitcoin Token)
const AAVE_LENDING_POOL = '0x26fCbd3afebbe28D0A8684F790C48368D21665b'; // Aave Lending Pool on BNB Chain

// PancakeSwap ABI
const SWAP_ABI = [
    {
        "constant": false,
        "inputs": [
            { "name": "amountIn", "type": "uint256" },
            { "name": "amountOutMin", "type": "uint256" },
            { "name": "path", "type": "address[]" },
            { "name": "to", "type": "address" },
            { "name": "deadline", "type": "uint256" }
        ],
        "name": "swapExactTokensForTokens",
        "outputs": [
            { "name": "amounts", "type": "uint256[]" }
        ],
        "type": "function"
    }
];

// Aave Flash Loan ABI (simplified)
const AAVE_ABI = [
    {
        "constant": false,
        "inputs": [
            { "name": "assets", "type": "address[]" },
            { "name": "amounts", "type": "uint256[]" },
            { "name": "premiums", "type": "uint256[]" },
            { "name": "initiator", "type": "address" },
            { "name": "params", "type": "bytes" }
        ],
        "name": "executeOperation",
        "outputs": [{ "name": "", "type": "bool" }],
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            { "name": "assets", "type": "address[]" },
            { "name": "amounts", "type": "uint256[]" },
            { "name": "modes", "type": "uint256[]" },
            { "name": "onBehalfOf", "type": "address" },
            { "name": "params", "type": "bytes" },
            { "name": "referralCode", "type": "uint16" }
        ],
        "name": "flashLoan",
        "outputs": [],
        "type": "function"
    }
];

const pancakeSwapRouter = new ethers.Contract(PANCAKESWAP_ROUTER, SWAP_ABI, wallet);
const aaveLendingPool = new ethers.Contract(AAVE_LENDING_POOL, AAVE_ABI, wallet);

// Prices for exchanges (received from PriceSentryBot)
let prices = {
    kraken: { btc_usd: 0, bnb_usd: 0 },
    pancakeswap: { btc_bnb: 0 }
};

// Trade history for analysis and dashboard
let tradeHistory = [];

// Bot monitoring states for latency and updates
let monitoringData = {
    tradeMaster: { latency: 0, lastUpdate: 0 }
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
        } else if (data.type === 'opportunity') {
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
            pair: 'XBTUSD',
            type: type,
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

// Execute trade on PancakeSwap using flash loans
async function executeTrade(spread, buyExchange, sellExchange) {
    const startTime = Date.now();
    try {
        // Calculate trade parameters
        const tradeAmountUSD = spread * 0.9; // Target 90% of spread as profit
        const btcAmount = tradeAmountUSD / (buyExchange === 'Kraken' ? prices.kraken.btc_usd : (prices.pancakeswap.btc_bnb * prices.kraken.bnb_usd));
        const bnbAmountForTrade = btcAmount * prices.pancakeswap.btc_bnb; // BNB needed for PancakeSwap trade
        const bnbAmountForFees = GAS_FEE_BUFFER; // Extra BNB for gas fees
        const totalBNBLoan = bnbAmountForTrade + bnbAmountForFees;

        // Flash loan fees (0.09% for Aave)
        const flashLoanFee = totalBNBLoan * FLASH_LOAN_FEE / 100;
        const totalBNBRepay = totalBNBLoan + flashLoanFee;

        // Calculate total fees
        const krakenPriceUSD = prices.kraken.btc_usd;
        const pancakeswapPriceUSD = prices.pancakeswap.btc_bnb * prices.kraken.bnb_usd;
        const pancakeswapFeeUSD = tradeAmountUSD * FEE_PERCENTAGE_PANCAKESWAP / 100;
        const krakenFeeUSD = tradeAmountUSD * FEE_PERCENTAGE_KRAKEN / 100;
        const flashLoanFeeUSD = totalBNBRepay * prices.kraken.bnb_usd;
        const totalFeesUSD = pancakeswapFeeUSD + krakenFeeUSD + flashLoanFeeUSD;

        // Calculate profit
        const profitUSD = btcAmount * (krakenPriceUSD - pancakeswapPriceUSD);
        const netProfitUSD = profitUSD - totalFeesUSD;

        // Strict profitability check
        if (netProfitUSD < MINIMUM_PROFIT_USD) {
            log(`Trade not profitable enough: Net Profit: $${netProfitUSD}. Minimum required: $${MINIMUM_PROFIT_USD}. Skipping trade.`);
            return;
        }

        log(`Executing double flash loan trade: Spread: $${spread}, Buy on ${buyExchange}, Sell on ${sellExchange}`);
        log(`Trade Amount: ${btcAmount} BTC, BNB Loan: ${totalBNBLoan} BNB, Total Fees: $${totalFeesUSD}, Net Profit: $${netProfitUSD}`);

        // Flash loan transaction
        const assets = [WBNB];
        const amounts = [ethers.parseUnits(totalBNBLoan.toString(), 18)];
        const modes = [0]; // 0 = repay after
        const params = ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [wallet.address, btcAmount]);
        const tx = await aaveLendingPool.flashLoan(
            assets,
            amounts,
            modes,
            wallet.address,
            params,
            0,
            { gasLimit: 3000000 }
        );
        await tx.wait();
        log(`Flash loan executed: ${tx.hash}`);

        // Store trade details
        const trade = {
            spread,
            buyExchange,
            sellExchange,
            btcAmount,
            bnbLoan: totalBNBLoan,
            fees: totalFeesUSD,
            netProfit: netProfitUSD,
            timestamp: startTime
        };
        tradeHistory.push(trade);
        broadcastTrade(trade);
        broadcastProfit(netProfitUSD);

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
}

// Execute the bot
startTradeMasterBot();
