const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying GreenCreditToken from: ${deployer.address}`);

  const GreenCreditToken = await hre.ethers.getContractFactory("GreenCreditToken");
  const greenCreditToken = await GreenCreditToken.deploy();
  await greenCreditToken.waitForDeployment();

  console.log(`GREEN_CREDIT_TOKEN_ADDRESS=${await greenCreditToken.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
