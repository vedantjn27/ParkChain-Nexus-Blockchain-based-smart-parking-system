require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "../backend/.env" });

const privateKey = process.env.RELAYER_PRIVATE_KEY || "";

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {},
    amoy: {
      url: process.env.RPC_URL_AMOY || "https://rpc-amoy.polygon.technology",
      accounts: privateKey ? [privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`] : []
    }
  }
};
