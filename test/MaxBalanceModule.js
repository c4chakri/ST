const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MaxBalanceModule with ModularCompliance Integration", function () {
  let maxBalanceModule, modularCompliance, securityToken, identityStorage;
  let owner, compliance, addr1, addr2;

  beforeEach(async function () {
    [owner, compliance, addr1, addr2] = await ethers.getSigners();

    // Deploy IdentityStorage Mock
    const IdentityStorageMock = await ethers.getContractFactory("IdentityStorage");
    identityStorage = await IdentityStorageMock.deploy();
    await identityStorage.initialize();

    // Deploy MaxBalanceModule
    const MaxBalanceModule = await ethers.getContractFactory("MaxBalanceModule");
    maxBalanceModule = await MaxBalanceModule.deploy();
    await maxBalanceModule.initialize();

    // Deploy ModularCompliance
    const ModularCompliance = await ethers.getContractFactory("ModularCompliance");
    modularCompliance = await ModularCompliance.deploy();
    await modularCompliance.connect(owner).init();

    // Deploy SecurityToken
    const SecurityToken = await ethers.getContractFactory("SecurityToken");
    securityToken = await SecurityToken.deploy();

    // Initialize SecurityToken
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

    // Add MaxBalanceModule to ModularCompliance
    await modularCompliance.addModule(maxBalanceModule);
  });

  it("should revert if trying to reinitialize the module", async function () {
    await expect(maxBalanceModule.connect(owner).initialize()).to.be.revertedWithCustomError(
        maxBalanceModule,
        "InvalidInitialization"
      );
  }); 
  
  it("should revert if non-owner tries to pre-set balance", async function () {
    const balance = ethers.parseEther("500");
  
    await expect(
      maxBalanceModule.connect(addr1).preSetModuleState(
        modularCompliance.target,
        addr1,
        balance
      )
    ).to.be.revertedWithCustomError(maxBalanceModule, "OnlyComplianceOwnerCanCall");
  });
  
  it("should revert if a non-compliant address tries to set max balance", async function () {
    const maxBalance = ethers.parseEther("1000");
  
    await expect(
      maxBalanceModule.connect(addr1).setMaxBalance(maxBalance)
    ).to.be.revertedWith("only bound compliance can call");
  });
  
  it("should set the maximum balance for a compliance contract", async function () {
    // await identityStorage.connect(owner).registerUsers([addr1.address]);

    const maxBalance = ethers.parseEther("1000");
  
    // Encode the setMaxBalance function call
    const moduleInterface = new ethers.Interface([
      "function setMaxBalance(uint256 _max)",
    ]);
    const setMaxBalanceData = moduleInterface.encodeFunctionData(
      "setMaxBalance",
      [maxBalance]
    );
    // Call the module function through modularCompliance
    const tx = await modularCompliance
      .connect(owner)
      .callModuleFunction(setMaxBalanceData, maxBalanceModule);

    await expect(tx)
      .to.emit(maxBalanceModule, "MaxBalanceSet")
      .withArgs(modularCompliance, maxBalance);
  
    // Verify the max balance has been set
    const currentMaxBalance = await maxBalanceModule.getIDBalance(
      modularCompliance,
      addr1
    );
    expect(currentMaxBalance).to.equal(0); // Initial balance should still be 0
  });
  

  it("should pre-set balance for an investor", async function () {
    const balance = ethers.parseEther("500");

    console.log("modularCompliance address:", modularCompliance.target);

    // Encode the preSetModuleState function call
    const moduleInterface = new ethers.Interface([
      "function preSetModuleState(address _compliance, address _id, uint256 _balance)",
    ]);
    const preSetData = moduleInterface.encodeFunctionData("preSetModuleState", [
      modularCompliance.target,
      addr1.address,
      balance,
    ]);
  
    // Call the module function through modularCompliance
    const tx = await modularCompliance.connect(owner).callModuleFunction(preSetData, maxBalanceModule);
  
    await expect(tx)
      .to.emit(maxBalanceModule, "IDBalancePreSet")
      .withArgs(modularCompliance.address, addr1.address, balance);
  
    // Verify the balance has been set
    const investorBalance = await maxBalanceModule.getIDBalance(
      modularCompliance.address,
      addr1
    );
    expect(investorBalance).to.equal(balance);
  });
  
  it("should revert if a non-owner tries to pre-set balance for an investor", async function () {
    const balance = ethers.parseEther("500");
  
    // Encode the preSetModuleState function call
    const moduleInterface = new ethers.Interface([
      "function preSetModuleState(address _compliance, address _id, uint256 _balance)",
    ]);
    const preSetData = moduleInterface.encodeFunctionData("preSetModuleState", [
      modularCompliance.target,
      addr1,
      balance,
    ]);
  
    await expect(
      modularCompliance
        .connect(addr2)
        .callModuleFunction(preSetData, maxBalanceModule)
    )
      .to.be.revertedWithCustomError(maxBalanceModule, "OnlyComplianceOwnerCanCall")
      .withArgs(modularCompliance);
  });

  it("should revert if max balance is exceeded during minting", async function () {
    await identityStorage.connect(owner).registerUsers([addr1.address]);

    const maxBalance = ethers.parseEther("1000");
  
    // Encode and call the setMaxBalance function through modularCompliance
    const moduleInterface = new ethers.Interface([
      "function setMaxBalance(uint256 _max)",
    ]);
    const setMaxBalanceData = moduleInterface.encodeFunctionData("setMaxBalance", [
      maxBalance,
    ]);
  
    // Set the maximum balance using modularCompliance
    await modularCompliance
      .connect(owner)
      .callModuleFunction(setMaxBalanceData, maxBalanceModule.target);

      const isCompliant = await maxBalanceModule.moduleCheck(
        ethers.ZeroAddress,
        addr1,
        maxBalance,
        modularCompliance
      );
      expect(isCompliant).to.be.true;
  
    // Attempt to mint tokens exceeding the max balance
    await expect(
      securityToken.connect(owner).mint(addr1.address, ethers.parseEther("1100"))
    )
      .to.be.revertedWith("Compliance not followed");

  });

it("should revert if batch pre-set has mismatched ids and balances", async function () {
    const ids = [addr1.address];
    const balances = [ethers.parseEther("500"), ethers.parseEther("300")];
  
    const moduleInterface = new ethers.Interface([
      "function batchPreSetModuleState(address _compliance, address[] calldata _id, uint256[] calldata _balance)"
    ]);
    const batchPreSetData = moduleInterface.encodeFunctionData("batchPreSetModuleState", [
      modularCompliance.target,
      ids,
      balances,
    ]);
  
    await expect(
      modularCompliance.connect(owner).callModuleFunction(batchPreSetData, maxBalanceModule.target)
    ).to.be.revertedWithCustomError(maxBalanceModule, "InvalidPresetValues");
  });
  

  it("should correctly handle module checks during transfers", async function () {
    await identityStorage.connect(owner).registerUsers([addr1.address]);
    await identityStorage.connect(owner).registerUsers([addr2.address]);

    const maxBalance = ethers.parseEther("1000");
    const transferAmount = ethers.parseEther("500");
  
    // Encode and call the setMaxBalance function through modularCompliance
    const moduleInterface = new ethers.Interface([
      "function setMaxBalance(uint256 _max)",
    ]);
    const setMaxBalanceData = moduleInterface.encodeFunctionData("setMaxBalance", [
      maxBalance,
    ]);
  
    // Set max balance using modularCompliance
    await modularCompliance
      .connect(owner)
      .callModuleFunction(setMaxBalanceData, maxBalanceModule.target);
  
    // Mint tokens to addr1 within limits
    await securityToken.connect(owner).mint(addr1.address, transferAmount);

    await securityToken.unpause();
    // const balance1 = await securityToken.balanceOf(addr1.address);

  
    // Transfer tokens from addr1 to addr2 within limits
    await securityToken.connect(addr1).transfer(addr2.address, transferAmount);
  
    // Check balances after the transfer
    const balance1 = await securityToken.balanceOf(addr1.address);
    const balance2 = await securityToken.balanceOf(addr2.address);
    expect(balance1).to.equal(0);
    expect(balance2).to.equal(transferAmount);
  
    // Attempt a transfer from addr2 to addr1 that exceeds max balance
    await expect(
      securityToken.connect(addr2).transfer(addr1.address, ethers.parseEther("1001"))
    )
      .to.be.revertedWith("Insufficient Balance");
  });  

  it("should batch pre-set balances for multiple investors", async function () {
    await identityStorage.connect(owner).registerUsers([addr1.address, addr2.address]);

    const balances = [ethers.parseEther("200"), ethers.parseEther("300")];
    const ids = [addr1.address, addr2.address];
  
    // Encode and call the batchPreSetModuleState function through modularCompliance
    const moduleInterface = new ethers.Interface([
      "function batchPreSetModuleState(address _compliance, address[] calldata _id, uint256[] calldata _balance)"
    ]);
    const batchPreSetData = moduleInterface.encodeFunctionData("batchPreSetModuleState", [
      modularCompliance.target,
      ids,
      balances,
    ]);

    console.log("modularCompliance address:", modularCompliance.target);

    // Execute batch pre-set of balances
    await maxBalanceModule 
      .connect(modularCompliance.target)
      .callModuleFunction(batchPreSetData, maxBalanceModule.target);

    console.log("modularCompliance address:", modularCompliance.target);

    // Verify emitted events for each investor
    await expect
      .to.emit(maxBalanceModule, "IDBalancePreSet")
      .withArgs(modularCompliance.target, addr1.address, balances[0])
      .and.to.emit(maxBalanceModule, "IDBalancePreSet")
      .withArgs(modularCompliance.target, addr2.address, balances[1]);
  
    // Verify stored balances for each investor
    const balance1 = await maxBalanceModule.getIDBalance(modularCompliance.target, addr1.address);
    const balance2 = await maxBalanceModule.getIDBalance(modularCompliance.target, addr2.address);
  
    expect(balance1).to.equal(balances[0]);
    expect(balance2).to.equal(balances[1]);
  });

it("should correctly handle moduleCheck function logic", async function () {

    await identityStorage.connect(owner).registerUsers([addr1.address, addr2.address]);

    const maxBalance = ethers.parseEther("1000");
    const mintAmount = ethers.parseEther("500");
  
    // Set max balance
    const moduleInterface = new ethers.Interface([
      "function setMaxBalance(uint256 _max)"
    ]);
    const setMaxBalanceData = moduleInterface.encodeFunctionData("setMaxBalance", [maxBalance]);
    await modularCompliance.connect(owner).callModuleFunction(setMaxBalanceData, maxBalanceModule.target);
  
    // Mint tokens and verify compliance
    await securityToken.connect(owner).mint(addr1.address, mintAmount);
  
    // Verify moduleCheck returns true for a compliant transfer
    const complianceCheck = await maxBalanceModule.moduleCheck(
      ethers.ZeroAddress,
      addr1.address,
      mintAmount,
      modularCompliance.target
    );
    expect(complianceCheck).to.be.true;
  
    // Verify moduleCheck returns false for an exceeding transfer
    const nonCompliantCheck = await maxBalanceModule.moduleCheck(
      ethers.ZeroAddress,
      addr1.address,
      ethers.parseEther("1100"),
      modularCompliance.target
    );
    expect(nonCompliantCheck).to.be.false;
  });
});
