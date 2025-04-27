require('dotenv').config();

module.exports = {
  solidity: "0.8.0",
  networks: {
    bsc: {
      url: "https://bsc-dataseed.binance.org/",
      accounts: [process.env.WALLET_PRIVATE_KEY]
    }
  }
};
