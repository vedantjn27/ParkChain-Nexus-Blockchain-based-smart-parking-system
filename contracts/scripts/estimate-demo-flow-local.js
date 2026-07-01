const hre = require("hardhat");
require("dotenv").config({ path: "../backend/.env" });

async function record(label, txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  console.log(`${label}: gas=${receipt.gasUsed.toString()}`);
  return receipt.gasUsed;
}

async function main() {
  const [deployer, driver] = await hre.ethers.getSigners();
  const amoyProvider = new hre.ethers.JsonRpcProvider(process.env.RPC_URL_AMOY);
  const feeData = await amoyProvider.getFeeData();
  const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;

  const ParkCoin = await hre.ethers.getContractFactory("ParkCoin");
  const parkCoin = await ParkCoin.deploy();
  await parkCoin.waitForDeployment();

  const Escrow = await hre.ethers.getContractFactory("EscrowSettlement");
  const escrow = await Escrow.deploy(await parkCoin.getAddress(), deployer.address, 0);
  await escrow.waitForDeployment();

  const Manager = await hre.ethers.getContractFactory("ParkingSessionManager");
  const manager = await Manager.deploy(deployer.address);
  await manager.waitForDeployment();

  const Trust = await hre.ethers.getContractFactory("TrustScoreSBT");
  const trust = await Trust.deploy();
  await trust.waitForDeployment();

  const Green = await hre.ethers.getContractFactory("GreenCreditToken");
  const green = await Green.deploy();
  await green.waitForDeployment();

  const inputs = {
    occupancyBps: 5000,
    timeOfDay: 18,
    dayOfWeek: 2,
    demandFactorBps: 125,
    basePriceCents: 250,
    weatherFlag: "clear",
    nonce: "demo-flow"
  };
  const commitHash = await manager.hashPricingInputs(inputs);

  let total = 0n;
  total += await record("reserveSlot", manager.connect(driver).reserveSlot(1, 1));
  total += await record("confirmEntry", manager.confirmEntry(1, hre.ethers.ZeroHash));
  total += await record("commitAIPricing", manager.commitAIPricing(1, commitHash, 0));
  total += await record("revealPricing", manager.revealPricing(1, inputs, 325));
  total += await record("confirmExit", manager.confirmExit(1));
  total += await record("mintParkCoin", parkCoin.mint(driver.address, 10n ** 18n));
  total += await record("approveEscrow", parkCoin.connect(driver).approve(await escrow.getAddress(), 10n ** 18n));
  total += await record("depositEscrow", escrow.connect(driver).depositEscrow(1, deployer.address, 10n ** 18n));
  total += await record("markEscrowExitConfirmed", escrow.markExitConfirmed(1));
  total += await record("releaseEscrow", escrow.releaseEscrow(1));
  total += await record("raiseDispute", manager.raiseDispute(1, "demo dispute"));
  total += await record("resolveDispute", manager.resolveDispute(1, false));
  total += await record("mintInitialScore", trust.mintInitialScore(driver.address));
  total += await record("adjustScore", trust.adjustScore(driver.address, 5, "clean-session"));
  total += await record("mintGreenCredit", green.mintCredit(driver.address, 10n ** 18n, "ev-session"));
  total += await record("redeemGreenCredit", green.redeemCredit(driver.address, 10n ** 17n));

  const totalCost = total * gasPrice;
  const paddedCost = (totalCost * 150n) / 100n;

  console.log(`TOTAL_GAS=${total.toString()}`);
  console.log(`CURRENT_AMOY_GAS_PRICE=${hre.ethers.formatUnits(gasPrice, "gwei")} gwei`);
  console.log(`ESTIMATED_DEMO_TOTAL=${hre.ethers.formatEther(totalCost)} POL`);
  console.log(`RECOMMENDED_WITH_50_PERCENT_BUFFER=${hre.ethers.formatEther(paddedCost)} POL`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
