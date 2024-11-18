const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SupplyLimitModule with ModularCompliance Integration", function () {
  let supplyLimitModule, modularCompliance, securityToken, identityStorage;
  let owner, compliance, addr1, addr2;

  beforeEach(async function () {
    [owner, compliance, addr1, addr2] = await ethers.getSigners();

    const IdentityStorageMock = await ethers.getContractFactory(
      "IdentityStorage"
    );
    identityStorage = await IdentityStorageMock.deploy();
    await identityStorage.initialize();

    const SupplyLimitModule = await ethers.getContractFactory(
      "SupplyLimitModule"
    );
    supplyLimitModule = await SupplyLimitModule.deploy();
    await supplyLimitModule.initialize();

    const ModularCompliance = await ethers.getContractFactory(
      "ModularCompliance"
    );
    modularCompliance = await ModularCompliance.deploy();
    await modularCompliance.init();

    const SecurityToken = await ethers.getContractFactory("SecurityToken");
    securityToken = await SecurityToken.deploy();

    await securityToken
      .connect(owner)
      .init(
        identityStorage,
        modularCompliance,
        "TestToken",
        "TTK",
        18,
        ethers.parseEther("1000000")
      );

    // Bind SecurityToken to ModularCompliance
    await modularCompliance.bindToken(securityToken);

    // Add SupplyLimitModule to ModularCompliance
    await modularCompliance.addModule(supplyLimitModule);
  });

  it("should revert if SupplyLimitModule is initialized again", async function () {
    await expect(supplyLimitModule.initialize()).to.be.revertedWithCustomError(
      supplyLimitModule,
      "InvalidInitialization"
    );
  });

  it("should set and retrieve the supply limit correctly", async function () {
    const supplyLimit = ethers.parseEther("2000000");

    // ABI encode call to setSupplyLimit
    const moduleInterface = new ethers.Interface([
      "function setSupplyLimit(uint256 _limit)",
    ]);
    const setSupplyLimitData = moduleInterface.encodeFunctionData(
      "setSupplyLimit",
      [supplyLimit]
    );

    // Call the function through compliance
    const tx = await modularCompliance
      .connect(owner)
      .callModuleFunction(setSupplyLimitData, supplyLimitModule.target);
    await tx.wait();

    // Retrieve and verify the supply limit
    const retrievedLimit = await supplyLimitModule.getSupplyLimit(
      modularCompliance
    );
    expect(retrievedLimit).to.equal(supplyLimit);
  });

  it("should enforce supply limit during minting", async function () {
    await identityStorage.connect(owner).registerUsers([addr1.address]);

    const supplyLimit = ethers.parseEther("2000");

    // Set the supply limit
    const moduleInterface = new ethers.Interface([
      "function setSupplyLimit(uint256 _limit)",
    ]);
    const setSupplyLimitData = moduleInterface.encodeFunctionData(
      "setSupplyLimit",
      [supplyLimit]
    );
    await modularCompliance
      .connect(owner)
      .callModuleFunction(setSupplyLimitData, supplyLimitModule);

    // Attempt to mint tokens within the limit (should succeed)
    const mintAmount = ethers.parseEther("1000");
    await securityToken.connect(owner).mint(addr1, mintAmount);
    expect(await securityToken.totalSupply()).to.equal(mintAmount);

    // Attempt to mint tokens exceeding the limit (should revert)
    const excessiveMint = ethers.parseEther("1500");
    await expect(
      securityToken.connect(owner).mint(addr1, excessiveMint)
    ).to.be.revertedWith("Compliance not followed");
  });

  it("should allow updating the supply limit", async function () {
    const initialLimit = ethers.parseEther("1000");
    const updatedLimit = ethers.parseEther("2000");

    // Set the initial supply limit
    const moduleInterface = new ethers.Interface([
      "function setSupplyLimit(uint256 _limit)",
    ]);
    const initialSetData = moduleInterface.encodeFunctionData(
      "setSupplyLimit",
      [initialLimit]
    );
    await modularCompliance
      .connect(owner)
      .callModuleFunction(initialSetData, supplyLimitModule);

    // Update the supply limit
    const updatedSetData = moduleInterface.encodeFunctionData(
      "setSupplyLimit",
      [updatedLimit]
    );
    await modularCompliance
      .connect(owner)
      .callModuleFunction(updatedSetData, supplyLimitModule);

    // Verify the updated limit
    const retrievedLimit = await supplyLimitModule.getSupplyLimit(
      modularCompliance
    );
    expect(retrievedLimit).to.equal(updatedLimit);
  });

  it("should revert if non-owner attempts to set supply limit", async function () {
    const supplyLimit = ethers.parseEther("1000");

    // Non-owner tries to set supply limit
    const moduleInterface = new ethers.Interface([
      "function setSupplyLimit(uint256 _limit)",
    ]);
    const setSupplyLimitData = moduleInterface.encodeFunctionData(
      "setSupplyLimit",
      [supplyLimit]
    );

    await expect(
      modularCompliance
        .connect(addr1)
        .callModuleFunction(setSupplyLimitData, supplyLimitModule)
    )
      .to.be.revertedWithCustomError(
        modularCompliance,
        "OwnableUnauthorizedAccount"
      )
      .withArgs(addr1.address);
  });

  it("should allow minting if no supply limit is set", async function () {
    await identityStorage.connect(owner).registerUsers([addr1.address]);

    const mintAmount = ethers.parseEther("500");

    // Check the current supply limit
    const currentLimit = await supplyLimitModule.getSupplyLimit(
      modularCompliance
    );
    console.log("Current Supply Limit:", currentLimit.toString());

    await modularCompliance.removeModule(supplyLimitModule);

    // Ensure compliance module returns true for this operation
    const isCompliant = await modularCompliance.canTransfer(
      ethers.ZeroAddress,
      addr1.address,
      mintAmount
    );
    console.log("Is Compliant:", isCompliant);
    expect(isCompliant).to.be.true;

    // Attempt minting
    await securityToken.connect(owner).mint(addr1.address, mintAmount);
    expect(await securityToken.balanceOf(addr1.address)).to.equal(mintAmount);
  });

  it("should allow minting tokens up to the supply limit", async function () {
    await identityStorage.connect(owner).registerUsers([addr1.address]);

    const supplyLimit = ethers.parseEther("1000");

    // Set the supply limit
    const moduleInterface = new ethers.Interface([
      "function setSupplyLimit(uint256 _limit)",
    ]);
    const setSupplyLimitData = moduleInterface.encodeFunctionData(
      "setSupplyLimit",
      [supplyLimit]
    );
    await modularCompliance
      .connect(owner)
      .callModuleFunction(setSupplyLimitData, supplyLimitModule);

    // Mint tokens up to the supply limit
    await securityToken.connect(owner).mint(addr1.address, supplyLimit);
    expect(await securityToken.balanceOf(addr1.address)).to.equal(supplyLimit);
  });

  it("should revert minting tokens that exceed the supply limit by a small margin", async function () {
    await identityStorage.connect(owner).registerUsers([addr1.address]);

    const supplyLimit = ethers.parseEther("1000");
    const excessiveMint = ethers.parseEther("1001");

    // Set the supply limit
    const moduleInterface = new ethers.Interface([
      "function setSupplyLimit(uint256 _limit)",
    ]);
    const setSupplyLimitData = moduleInterface.encodeFunctionData(
      "setSupplyLimit",
      [supplyLimit]
    );
    await modularCompliance
      .connect(owner)
      .callModuleFunction(setSupplyLimitData, supplyLimitModule);

    // Attempt to mint tokens exceeding the limit
    await expect(
      securityToken.connect(owner).mint(addr1.address, excessiveMint)
    ).to.be.revertedWith("Compliance not followed");
  });

  it("should restrict minting if supply limit is set below current total supply", async function () {
    await identityStorage.connect(owner).registerUsers([addr1.address]);

    const initialMint = ethers.parseEther("1000");
    const lowerLimit = ethers.parseEther("500");

    await modularCompliance.removeModule(supplyLimitModule);

    // Mint tokens to set an initial total supply
    await securityToken.connect(owner).mint(addr1.address, initialMint);

    await modularCompliance.addModule(supplyLimitModule);

    // Set supply limit below current total supply
    const moduleInterface = new ethers.Interface([
      "function setSupplyLimit(uint256 _limit)",
    ]);
    const setSupplyLimitData = moduleInterface.encodeFunctionData(
      "setSupplyLimit",
      [lowerLimit]
    );

    await modularCompliance
      .connect(owner)
      .callModuleFunction(setSupplyLimitData, supplyLimitModule.target);

    // Attempt to mint more tokens, which should fail
    const additionalMint = ethers.parseEther("100");
    await expect(
      securityToken.connect(owner).mint(addr1.address, additionalMint)
    ).to.be.revertedWith("Compliance not followed");
  });

  it("should disable supply limit checks after module removal", async function () {
    await identityStorage.connect(owner).registerUsers([addr1.address]);

    const supplyLimit = ethers.parseEther("1000");

    // Set the supply limit
    const moduleInterface = new ethers.Interface([
      "function setSupplyLimit(uint256 _limit)",
    ]);
    const setSupplyLimitData = moduleInterface.encodeFunctionData(
      "setSupplyLimit",
      [supplyLimit]
    );
    await modularCompliance
      .connect(owner)
      .callModuleFunction(setSupplyLimitData, supplyLimitModule);

    // Remove the module
    await modularCompliance.connect(owner).removeModule(supplyLimitModule);

    // Mint tokens exceeding the previously set limit
    const excessiveMint = ethers.parseEther("1500");
    await securityToken.connect(owner).mint(addr1.address, excessiveMint);

    expect(await securityToken.balanceOf(addr1.address)).to.equal(
      excessiveMint
    );
  });
});
