require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.BSCSCAN_API_KEY;
const WALLET_1 = '0xA8f5C1b1eB26e5bF93D6dC7f637a34dC2F452A9';
const WALLET_2 = '0x6dc528264b4570996370248DFF9CaBDf01BB92D0';

async function checkBalance(walletAddress) {
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
        try {
            const response = await axios.get('https://api.bscscan.com/api', {
                params: {
                    module: 'account',
                    action: 'balance',
                    address: walletAddress,
                    tag: 'latest',
                    apikey: API_KEY
                }
            });
            if (response.data.status === '1') {
                const balanceWei = response.data.result;
                const balanceBNB = balanceWei / 1e18; // Convert Wei to BNB
                console.log(`Balance of ${walletAddress}: ${balanceBNB} BNB`);
                return; // Exit on success
            } else {
                console.error(`Error for ${walletAddress}:`, response.data.message);
                return;
            }
        } catch (error) {
            attempts++;
            console.error(`Attempt ${attempts} for ${walletAddress} failed:`, error.message);
            if (attempts === maxAttempts) {
                console.error(`Max attempts reached for ${walletAddress}. Could not fetch balance.`);
            } else {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
            }
        }
    }
}

async function checkBalances() {
    await checkBalance(WALLET_1);
    await checkBalance(WALLET_2);
}

checkBalances();
