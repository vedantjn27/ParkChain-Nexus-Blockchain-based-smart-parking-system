const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying from: ${deployer.address}`);

  const ParkCoin = await hre.ethers.getContractFactory("ParkCoin");
  const parkCoin = await ParkCoin.deploy();
  await parkCoin.waitForDeployment();
  console.log(`PARK_COIN_ADDRESS=${await parkCoin.getAddress()}`);

  const ParkingSessionManager = await hre.ethers.getContractFactory("ParkingSessionManager");
  const parkingSessionManager = await ParkingSessionManager.deploy(deployer.address);
  await parkingSessionManager.waitForDeployment();
  console.log(`PARKING_SESSION_MANAGER_ADDRESS=${await parkingSessionManager.getAddress()}`);

  const TrustScoreSBT = await hre.ethers.getContractFactory("TrustScoreSBT");
  const trustScoreSBT = await TrustScoreSBT.deploy();
  await trustScoreSBT.waitForDeployment();
  console.log(`TRUST_SCORE_SBT_ADDRESS=${await trustScoreSBT.getAddress()}`);

  const EscrowSettlement = await hre.ethers.getContractFactory("EscrowSettlement");
  const escrowSettlement = await EscrowSettlement.deploy(
    await parkCoin.getAddress(),
    deployer.address,
    Number(process.env.DISPUTE_WINDOW_SECONDS || 120)
  );
  await escrowSettlement.waitForDeployment();
  console.log(`ESCROW_SETTLEMENT_ADDRESS=${await escrowSettlement.getAddress()}`);

  const GreenCreditToken = await hre.ethers.getContractFactory("GreenCreditToken");
  const greenCreditToken = await GreenCreditToken.deploy();
  await greenCreditToken.waitForDeployment();
  console.log(`GREEN_CREDIT_TOKEN_ADDRESS=${await greenCreditToken.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
