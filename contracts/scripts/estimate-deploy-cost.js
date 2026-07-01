const hre = require("hardhat");

async function estimateDeployment(factoryName, args = []) {
  const Factory = await hre.ethers.getContractFactory(factoryName);
  const deployTx = await Factory.getDeployTransaction(...args);
  const gas = await hre.ethers.provider.estimateGas(deployTx);
  return gas;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;

  const estimates = [
    ["ParkCoin", []],
    ["ParkingSessionManager", [deployer.address]],
    ["TrustScoreSBT", []],
    ["EscrowSettlement", [deployer.address, deployer.address, Number(process.env.DISPUTE_WINDOW_SECONDS || 120)]],
    ["GreenCreditToken", []]
  ];

  let totalGas = 0n;
  for (const [name, args] of estimates) {
    const gas = await estimateDeployment(name, args);
    totalGas += gas;
    const cost = gas * gasPrice;
    console.log(`${name}: gas=${gas.toString()} cost=${hre.ethers.formatEther(cost)} POL`);
  }

  const totalCost = totalGas * gasPrice;
  const paddedCost = (totalCost * 125n) / 100n;

  console.log(`TOTAL_GAS=${totalGas.toString()}`);
  console.log(`CURRENT_GAS_PRICE=${hre.ethers.formatUnits(gasPrice, "gwei")} gwei`);
  console.log(`TOTAL_COST=${hre.ethers.formatEther(totalCost)} POL`);
  console.log(`RECOMMENDED_WITH_25_PERCENT_BUFFER=${hre.ethers.formatEther(paddedCost)} POL`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
