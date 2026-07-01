const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TrustScoreSBT", function () {
  it("mints an initial score and clamps adjustments", async function () {
    const [, driver] = await ethers.getSigners();
    const TrustScoreSBT = await ethers.getContractFactory("TrustScoreSBT");
    const trustScore = await TrustScoreSBT.deploy();
    await trustScore.waitForDeployment();

    await trustScore.mintInitialScore(driver.address);
    expect(await trustScore.getScore(driver.address)).to.equal(700);

    await trustScore.adjustScore(driver.address, 500, "clean-streak");
    expect(await trustScore.getScore(driver.address)).to.equal(1000);

    await trustScore.adjustScore(driver.address, -1500, "fraud");
    expect(await trustScore.getScore(driver.address)).to.equal(0);
  });

  it("rejects transfers", async function () {
    const [, driver, recipient] = await ethers.getSigners();
    const TrustScoreSBT = await ethers.getContractFactory("TrustScoreSBT");
    const trustScore = await TrustScoreSBT.deploy();
    await trustScore.waitForDeployment();

    await trustScore.mintInitialScore(driver.address);
    await expect(trustScore.connect(driver).transferFrom(driver.address, recipient.address, 1)).to.be.revertedWith(
      "Soulbound: non-transferable"
    );
  });
});
