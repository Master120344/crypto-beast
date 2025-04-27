const ccxt = require('ccxt');
require('dotenv').config();

async function withdrawBNB() {
    try {
        const kraken = new ccxt.kraken({
            apiKey: process.env.KRAKEN_API_KEY,
            secret: process.env.KRAKEN_API_SECRET,
        });

        const amount = parseFloat(process.env.WITHDRAW_AMOUNT || 0.00316); // Default amount if not in .env
        const address = process.env.WALLET_ADDRESS || '0xA8f5C1b1eB26e5bF93D6dC7f637a34dC2F452a9';
        const tag = null; // BNB Chain doesn't require a tag
        const currency = 'BNB';
        const network = 'BSC'; // BNB Chain (BEP-20)

        if (!amount || !address) {
            throw new Error('Invalid amount or address. Please check your configuration.');
        }

        console.log(`Withdrawing ${amount} BNB to ${address} on ${network}...`);
        const response = await kraken.withdraw(currency, amount, address, tag, { network });
        console.log('Withdrawal response:', response);
    } catch (e) {
        console.error('Withdrawal error:', e.message);
    }
}

withdrawBNB();