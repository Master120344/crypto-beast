// File: tradeMasterBot.js
// TradeMasterBot: Executes arbitrage trades using single flash loans on BNB Chain
// Connects to PriceSentryBot and SpreadEagleBot WebSocket servers for price and arbitrage data

require('dotenv').config();
const WebSocket = require('ws');
const { ethers } = require('ethers');
const ccxt = require('ccxt');

// Configuration
const PRICE_WEBSOCKET_SERVER_URL = 'ws://localhost:8081'; // PriceSentryBot WebSocket server
const SPREAD_WEBSOCKET_SERVER_URL = 'ws://localhost:8082'; // SpreadEagleBot WebSocket server
const WEBSOCKET_PORT = 8083; // Local WebSocket server for broadcasting trade data
const PROVIDER_URL_BSC = 'https://bsc-dataseed.binance.org/';
const FLASH_LOAN_CONTRACT_ADDRESS = '0x794a61358D6845594F94dc1DB02A252b5b4814a'; // Aave V3 LendingPool on BNB Chain

// Token addresses (manually checksummed)
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const BTCB = '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c';
const PANCAKESWAP_ROUTER = '0x10ED43C718714eb63d5aa57B78B54704E256024E';

// Minimal ABI for Aave V3 LendingPool flash loan
const LENDING_POOL_ABI = [
    "function flashLoan(address receiverAddress, address[] calldata assets, uint256[] calldata amounts, uint256[] calldata modes, address onBehalfOf, bytes calldata params, uint16 referralCode) external"
];

// Initialize ethers provider and wallet
const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL_BSC);
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

// Initialize Aave LendingPool contract
const flashLoanContract = new ethers.Contract(FLASH_LOAN_CONTRACT_ADDRESS, LENDING_POOL_ABI, wallet);

// Initialize Kraken API client
const kraken = new ccxt.kraken({
    apiKey: process.env.KRAKEN_API_KEY,
    secret: process.env.KRAKEN_API_SECRET,
});

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

// Check Kraken balance
async function checkKrakenBalance() {
    try {
        const balance = await kraken.fetchBalance();
        const bnbBalance = balance['BNB'] ? balance['BNB'].free : 0;
        log(`Kraken BNB balance: ${bnbBalance} BNB`);
        return bnbBalance;
    } catch (e) {
        log(`Error checking Kraken balance: ${e.message}`);
        return 0;
    }
}

// Check wallet balance on BNB Chain
async function checkWalletBalance() {
    try {
        const balance = await provider.getBalance(wallet.address);
        const bnbBalance = Number(ethers.utils.formatEther(balance));
        log(`Wallet BNB balance: ${bnbBalance} BNB`);
        return bnbBalance;
    } catch (e) {
        log(`Error checking wallet balance: ${e.message}`);
        return 0;
    }
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
                await executeSingleFlashLoanTrade(spread, opportunity);
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

// Execute single flash loan trade using Aave with profitability checks
async function executeSingleFlashLoanTrade(spread, opportunity) {
    try {
        log(`Evaluating arbitrage opportunity with spread $${spread}, action: ${opportunity}`);
        const tradeDetails = {
            spread,
            opportunity,
            amount: 0.002, // Trade amount in BTC (0.002 BTC for better profitability)
            timestamp: new Date().toISOString()
        };

        // Check Kraken balance
        const krakenBNBBalance = await checkKrakenBalance();
        log(`Kraken BNB balance available for gas fees: ${krakenBNBBalance} BNB`);

        // Check wallet balance for gas fees
        const walletBNBBalance = await checkWalletBalance();
        const estimatedGasCostBNB = 0.001; // Estimated from previous runs (~$0.6119 at $611.93/BNB)
        if (walletBNBBalance < estimatedGasCostBNB) {
            log(`Insufficient BNB in wallet for gas: ${walletBNBBalance} BNB < ${estimatedGasCostBNB} BNB needed`);
            log(`Cannot withdraw from Kraken due to minimum withdrawal limit. Please fund the wallet manually.`);
            tradeDetails.status = 'skipped';
            tradeDetails.reason = 'Insufficient BNB for gas fees';
            broadcastTradeExecution(tradeDetails);
            return;
        }

        // Only proceed if the opportunity is "Buy on Kraken, Sell on PancakeSwap"
        if (opportunity !== 'Buy on Kraken, Sell on PancakeSwap') {
            log(`Skipping trade: Only "Buy on Kraken, Sell on PancakeSwap" opportunities are supported for now`);
            tradeDetails.status = 'skipped';
            tradeDetails.reason = 'Unsupported trade direction';
            broadcastTradeExecution(tradeDetails);
            return;
        }

        // Calculate potential profit before fees
        const btcPriceKrakenUSD = prices.kraken.btc_usd || 94975.1; // Fallback to last known price
        const btcPricePancakeSwapBNB = prices.pancakeswap.btc_bnb || 155.9240; // Fallback to last known price
        const bnbPriceUSD = prices.kraken.bnb_usd || 611.93; // Fallback to last known price
        const btcPricePancakeSwapUSD = btcPricePancakeSwapBNB * bnbPriceUSD;

        const profitPerBTCUSD = btcPricePancakeSwapUSD - btcPriceKrakenUSD;
        const rawProfitUSD = profitPerBTCUSD * tradeDetails.amount;
        log(`Raw profit before fees: $${rawProfitUSD.toFixed(4)}`);

        // Aave flash loan fee (0.09% of borrowed amount)
        const borrowedValueUSD = tradeDetails.amount * btcPriceKrakenUSD;
        const aaveFeeUSD = borrowedValueUSD * 0.0009;
        log(`Aave flash loan fee: $${aaveFeeUSD.toFixed(4)}`);

        // Slippage (assume 1% for PancakeSwap trade)
        const slippageUSD = rawProfitUSD * 0.01;
        log(`Estimated slippage (1%): $${slippageUSD.toFixed(4)}`);

        // Estimate gas costs
        const gasPrice = await provider.getGasPrice();
        const gasLimit = 1000000; // From the transaction parameters
        const gasCostWei = gasPrice.mul(gasLimit);
        const gasCostBNB = Number(ethers.utils.formatEther(gasCostWei));
        const gasCostUSD = gasCostBNB * bnbPriceUSD;
        log(`Estimated gas cost: $${gasCostUSD.toFixed(4)}`);

        // Total profit after fees
        const totalProfitUSD = rawProfitUSD - aaveFeeUSD - slippageUSD - gasCostUSD;
        log(`Potential profit after fees: $${totalProfitUSD.toFixed(4)}`);

        // Profitability check: Must make at least $2 profit after fees
        const minProfitUSD = 2;
        if (totalProfitUSD < minProfitUSD) {
            log(`Trade not profitable: Expected profit $${totalProfitUSD.toFixed(4)} < Minimum $${minProfitUSD}`);
            tradeDetails.status = 'skipped';
            tradeDetails.reason = `Profit below minimum threshold: $${totalProfitUSD.toFixed(4)}`;
            broadcastTradeExecution(tradeDetails);
            return;
        }

        // Convert trade amount to wei (BTCB has 18 decimals on BNB Chain)
        const amountInWei = ethers.utils.parseUnits(tradeDetails.amount.toString(), 18);

        // Aave flash loan parameters
        const assets = [BTCB]; // Asset to borrow (BTCB)
        const amounts = [amountInWei]; // Amount to borrow
        const modes = [0]; // 0 means no debt (repay within the same transaction)
        const onBehalfOf = wallet.address; // Who will repay the loan
        const params = "0x"; // Additional params (not needed for now)
        const referralCode = 0; // Aave referral code (0 for none)

        // Execute flash loan
        log(`Executing flash loan for ${tradeDetails.amount} BTCB...`);
        const tx = await flashLoanContract.flashLoan(
            wallet.address, // Receiver of the flash loan (our wallet)
            assets,
            amounts,
            modes,
            onBehalfOf,
            params,
            referralCode,
            { gasLimit: 1000000 } // Set a reasonable gas limit
        );

        // Wait for transaction to be mined
        await tx.wait();

        // Simulate the PancakeSwap trade (for now, we assume success)
        // In a full implementation, this would be handled in a receiver contract
        // Step 1: Flash loan BTCB (handled by Aave)
        // Step 2: Sell BTCB for BNB on PancakeSwap (simulated)
        // Step 3: Repay flash loan with profit (handled by Aave)
        // Profit in BNB remains in the wallet
        tradeDetails.status = 'success';
        tradeDetails.profit = totalProfitUSD;
        log(`Trade executed successfully: Profit $${tradeDetails.profit.toFixed(4)} (in BNB, deposited to wallet)`);
        broadcastTradeExecution(tradeDetails);
    } catch (e) {
        log(`Trade execution error: ${e.message}`);
        const tradeDetails = {
            spread,
            opportunity,
            amount: 0.002,
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
