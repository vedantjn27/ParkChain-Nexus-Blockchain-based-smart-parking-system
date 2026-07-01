const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const labels = [
    "PARK_COIN_ADDRESS",
    "PARKING_SESSION_MANAGER_ADDRESS",
    "TRUST_SCORE_SBT_ADDRESS",
    "ESCROW_SETTLEMENT_ADDRESS"
  ];

  for (let nonce = 0; nonce < labels.length; nonce++) {
    const address = hre.ethers.getCreateAddress({ from: deployer.address, nonce });
    const code = await hre.ethers.provider.getCode(address);
    console.log(`${labels[nonce]}=${address} CODE_BYTES=${(code.length - 2) / 2}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
