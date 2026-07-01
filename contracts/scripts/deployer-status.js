const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const nonce = await hre.ethers.provider.getTransactionCount(deployer.address);

  console.log(`DEPLOYER=${deployer.address}`);
  console.log(`BALANCE=${hre.ethers.formatEther(balance)} POL`);
  console.log(`NONCE=${nonce}`);

  for (let i = 0; i < nonce; i++) {
    console.log(`CREATE_ADDRESS_NONCE_${i}=${hre.ethers.getCreateAddress({ from: deployer.address, nonce: i })}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
