const hre = require("hardhat");
require("dotenv").config({ path: "../backend/.env" });

async function estimate(label, txRequest) {
  const gas = await hre.ethers.provider.estimateGas(txRequest);
  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;
  const cost = gas * gasPrice;
  console.log(`${label}: gas=${gas.toString()} cost=${hre.ethers.formatEther(cost)} POL`);
  return cost;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const manager = await hre.ethers.getContractAt("ParkingSessionManager", process.env.PARKING_SESSION_MANAGER_ADDRESS);
  const trust = await hre.ethers.getContractAt("TrustScoreSBT", process.env.TRUST_SCORE_SBT_ADDRESS);
  const green = await hre.ethers.getContractAt("GreenCreditToken", process.env.GREEN_CREDIT_TOKEN_ADDRESS);

  const inputs = {
    occupancyBps: 5000,
    timeOfDay: 18,
    dayOfWeek: 2,
    demandFactorBps: 125,
    basePriceCents: 250,
    weatherFlag: "clear",
    nonce: `estimate-${Date.now()}`
  };
  const commitHash = await manager.hashPricingInputs(inputs);
  const demoSessionId = Number(await manager.nextSessionId());
  const uniqueLot = 900000 + demoSessionId;
  const uniqueSlot = 1;

  let total = 0n;
  total += await estimate("reserveSlot", await manager.reserveSlot.populateTransaction(uniqueLot, uniqueSlot));
  total += await estimate("confirmEntry", await manager.confirmEntry.populateTransaction(demoSessionId, hre.ethers.ZeroHash));
  total += await estimate("commitAIPricing", await manager.commitAIPricing.populateTransaction(demoSessionId, commitHash, 0));
  total += await estimate("revealPricing", await manager.revealPricing.populateTransaction(demoSessionId, inputs, 325));
  total += await estimate("confirmExit", await manager.confirmExit.populateTransaction(demoSessionId));
  total += await estimate("raiseDispute", await manager.raiseDispute.populateTransaction(demoSessionId, "demo dispute"));
  total += await estimate("resolveDispute", await manager.resolveDispute.populateTransaction(demoSessionId, false));

  const score = await trust.getScore(deployer.address);
  if (score === 0n) {
    total += await estimate("mintInitialScore", await trust.mintInitialScore.populateTransaction(deployer.address));
  }
  total += await estimate("adjustScore", await trust.adjustScore.populateTransaction(deployer.address, 5, "clean-session"));
  total += await estimate("mintGreenCredit", await green.mintCredit.populateTransaction(deployer.address, 10n ** 18n, "ev-session"));
  total += await estimate("redeemGreenCredit", await green.redeemCredit.populateTransaction(deployer.address, 10n ** 17n));

  const padded = (total * 150n) / 100n;
  console.log(`DEPLOYER=${deployer.address}`);
  console.log(`BALANCE=${hre.ethers.formatEther(balance)} POL`);
  console.log(`ESTIMATED_DEMO_TOTAL=${hre.ethers.formatEther(total)} POL`);
  console.log(`RECOMMENDED_WITH_50_PERCENT_BUFFER=${hre.ethers.formatEther(padded)} POL`);
  if (balance < padded) {
    console.log(`SHORTFALL_WITH_BUFFER=${hre.ethers.formatEther(padded - balance)} POL`);
  } else {
    console.log("SHORTFALL_WITH_BUFFER=0 POL");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
