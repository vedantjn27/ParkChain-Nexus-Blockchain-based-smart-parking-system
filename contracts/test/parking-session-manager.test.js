const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ParkingSessionManager", function () {
  async function deployFixture() {
    const [owner, driver, relayer] = await ethers.getSigners();
    const Manager = await ethers.getContractFactory("ParkingSessionManager");
    const manager = await Manager.deploy(relayer.address);
    await manager.waitForDeployment();
    return { owner, driver, relayer, manager };
  }

  it("prevents double booking for an active slot", async function () {
    const { driver, manager } = await deployFixture();

    await manager.connect(driver).reserveSlot(1, 7);
    await expect(manager.connect(driver).reserveSlot(1, 7)).to.be.revertedWith("Slot already active");
  });

  it("allows the same slot after exit", async function () {
    const { driver, manager } = await deployFixture();

    await manager.connect(driver).reserveSlot(1, 7);
    await manager.connect(driver).confirmEntry(1, ethers.ZeroHash);
    await manager.connect(driver).confirmExit(1);

    await expect(manager.connect(driver).reserveSlot(1, 7)).to.emit(manager, "SlotReserved");
  });

  it("verifies commit reveal pricing inputs", async function () {
    const { driver, relayer, manager } = await deployFixture();
    const inputs = {
      occupancyBps: 5000,
      timeOfDay: 18,
      dayOfWeek: 2,
      demandFactorBps: 125,
      basePriceCents: 250,
      weatherFlag: "clear",
      nonce: "demo-nonce"
    };
    const commitHash = await manager.hashPricingInputs(inputs);

    await manager.connect(driver).reserveSlot(2, 3);
    await manager.connect(relayer).commitAIPricing(1, commitHash, 0);
    await expect(manager.connect(relayer).revealPricing(1, inputs, 325)).to.emit(manager, "PricingRevealed");

    const session = await manager.getSession(1);
    expect(session.finalPricePerMinute).to.equal(325);
  });

  it("rejects a reveal with changed inputs", async function () {
    const { driver, relayer, manager } = await deployFixture();
    const inputs = {
      occupancyBps: 5000,
      timeOfDay: 18,
      dayOfWeek: 2,
      demandFactorBps: 125,
      basePriceCents: 250,
      weatherFlag: "clear",
      nonce: "demo-nonce"
    };
    const changedInputs = { ...inputs, weatherFlag: "rain" };

    await manager.connect(driver).reserveSlot(2, 3);
    await manager.connect(relayer).commitAIPricing(1, await manager.hashPricingInputs(inputs), 0);

    await expect(manager.connect(relayer).revealPricing(1, changedInputs, 325)).to.be.revertedWith("Commit mismatch");
  });
});
