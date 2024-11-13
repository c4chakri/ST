const { expect, assert } = require("chai");
const { ethers } = require("hardhat");

describe("SecurityToken Mint with Compliance Check via ModularCompliance", function () {
  let securityToken,
    modularCompliance,
    conditionalTransferModule,
    identityStorage,
    user1
    
  let owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2, user1, user2, user3] = await ethers.getSigners();

    const IdentityStorageMock = await ethers.getContractFactory(
      "IdentityStorage"
    );
    identityStorage = await IdentityStorageMock.deploy();
    await identityStorage.initialize();

    const ModularCompliance = await ethers.getContractFactory(
      "ModularCompliance"
    );
    modularCompliance = await ModularCompliance.deploy();
    await modularCompliance.init();

    const ConditionalTransferModule = await ethers.getContractFactory(
      "ConditionalTransferModule"
    );
    conditionalTransferModule = await ConditionalTransferModule.deploy();
    await conditionalTransferModule.initialize();

    // Add ConditionalTransferModule to ModularCompliance
    await modularCompliance.addModule(conditionalTransferModule);

    const SecurityToken = await ethers.getContractFactory("SecurityToken");
    securityToken = await SecurityToken.deploy();

    console.log("SecurityToken deployed to:", securityToken.target);

    await securityToken
      .connect(owner)
      .init(
        identityStorage,
        modularCompliance,
        "MyToken",
        "MTK",
        18,
        ethers.parseEther("1000000")
      );

    // Bind SecurityToken to ModularCompliance
    await modularCompliance.bindToken(securityToken);
  });

  describe("Binding and Unbinding Tokens", function () {
    it("should only allow initialize to be called once", async () => {
      await expect(
        conditionalTransferModule.initialize()
      ).to.be.revertedWithCustomError(
        conditionalTransferModule,
        "InvalidInitialization"
      );
    });

    it("should bind a token to the ModularCompliance contract", async function () {
      const boundToken = await modularCompliance.getTokenBound();
      expect(boundToken).to.equal(securityToken);
    });

    it("should allow only the owner to bind a token", async function () {
      await expect(
        modularCompliance.connect(addr1).bindToken(securityToken)
      ).to.be.revertedWith("only owner or token can call");
    });

    it("should unbind a token from the ModularCompliance contract", async function () {
      await modularCompliance.connect(owner).unbindToken(securityToken);
      const boundToken = await modularCompliance.getTokenBound();
      expect(boundToken).to.equal(ethers.ZeroAddress);
    });

    it("should allow only the owner to unbind a token", async function () {
      await expect(
        modularCompliance.connect(addr1).unbindToken(securityToken)
      ).to.be.revertedWith("only owner or token can call");
    });
  });

  describe("Module Management", function () {
    it("should allow the owner to add a module", async function () {
      const modules = await modularCompliance.getModules();
      console.log("Modules after adding module:", modules);
    });

    it("should revert if trying to add a module by non-owner", async function () {
      await expect(
        modularCompliance.connect(addr1).addModule(conditionalTransferModule)
      )
        .to.be.revertedWithCustomError(
          modularCompliance,
          "OwnableUnauthorizedAccount"
        )
        .withArgs(addr1.address);
    });

    it("should revert if trying to add an already bound module", async function () {
      await expect(
        modularCompliance.connect(owner).addModule(conditionalTransferModule)
      ).to.be.revertedWith("module already bound");
    });

    it("should allow the owner to remove a module", async function () {
      await modularCompliance
        .connect(owner)
        .removeModule(conditionalTransferModule);
      const modules = await modularCompliance.getModules();
      expect(modules).to.not.include(conditionalTransferModule);
    });

    it("should revert if trying to remove a module by non-owner", async function () {
      await expect(
        modularCompliance.connect(addr1).removeModule(conditionalTransferModule)
      )
        .to.be.revertedWithCustomError(
          modularCompliance,
          "OwnableUnauthorizedAccount"
        )
        .withArgs(addr1.address);
    });

    it("should revert if trying to remove a non-bound module", async function () {
      await expect(
        modularCompliance.connect(owner).removeModule(user1)
      ).to.be.revertedWith("module not bound");
    });
  });

  describe("Compliance Checks", function () {
    it("should pass canTransfer if all modules approve", async function () {
      // register the user address
      await identityStorage
        .connect(owner)
        .registerUsers([addr1.address, addr2.address]);

      const amount = ethers.parseEther("100");

      // Encode the call to approveTransfer function
      const functionAbi = new ethers.Interface([
        "function approveTransfer(address, address, uint256)",
      ]);
      const approveTransferData = functionAbi.encodeFunctionData(
        "approveTransfer",
        [addr1.address, addr2.address, amount]
      );

      const tx = await modularCompliance
        .connect(owner)
        .callModuleFunction(approveTransferData, conditionalTransferModule);

      await tx.wait();
      const result = await modularCompliance.canTransfer(
        addr1.address,
        addr2.address,
        amount
      );
      expect(result).to.be.true;
    });

    it("should fail canTransfer if any module disapproves", async function () {
      await identityStorage
        .connect(owner)
        .registerUsers([addr1.address, addr2.address]);

      const amount = ethers.parseEther("100");
      // Encode the call to approveTransfer function
      const functionAbi = new ethers.Interface([
        "function approveTransfer(address, address, uint256)",
      ]);
      const approveTransferData = functionAbi.encodeFunctionData(
        "approveTransfer",
        [addr1.address, addr2.address, amount]
      );

      const tx = await modularCompliance
        .connect(owner)
        .callModuleFunction(approveTransferData, conditionalTransferModule);

      await tx.wait();
      const result = await modularCompliance.canTransfer(
        addr1.address,
        addr2.address,
        amount
      );
      expect(result).to.be.true;

      // Encode the call to unApproveTransfer function
      const functionAbi2 = new ethers.Interface([
        "function unApproveTransfer(address, address, uint256)",
      ]);
      const unapproveTransferData = functionAbi2.encodeFunctionData(
        "unApproveTransfer",
        [addr1.address, addr2.address, amount]
      );

      const tx1 = await modularCompliance
        .connect(owner)
        .callModuleFunction(unapproveTransferData, conditionalTransferModule);

      await tx1.wait();
      const result2 = await modularCompliance.canTransfer(
        addr1.address,
        addr2.address,
        ethers.parseEther("100")
      );
      expect(result2).to.be.false;
    });
  });

  describe("Mint Compliance Check", function () {
    it("should mint tokens if moduleCheck in ConditionalTransferModule returns true", async function () {
      // register the user address
      await identityStorage.connect(owner).registerUsers([addr1.address]);

      const amount = ethers.parseEther("100");

      // Encode the call to approveTransfer function
      const functionAbi = new ethers.Interface([
        "function approveTransfer(address, address, uint256)",
      ]);
      const approveTransferData = functionAbi.encodeFunctionData(
        "approveTransfer",
        [ethers.ZeroAddress, addr1.address, amount]
      );

      const tx = await modularCompliance
        .connect(owner)
        .callModuleFunction(approveTransferData, conditionalTransferModule);

      await tx.wait();

      // Verify moduleCheck for compliance
      const isCompliant = await conditionalTransferModule.moduleCheck(
        ethers.ZeroAddress,
        addr1,
        amount,
        modularCompliance
      );
      expect(isCompliant).to.be.true;

      // Mint tokens; should succeed if compliance is met
      await expect(securityToken.mint(addr1.address, amount))
        .to.emit(securityToken, "Transfer")
        .withArgs(ethers.ZeroAddress, addr1.address, amount);

      expect(await securityToken.balanceOf(addr1.address)).to.equal(amount);
    });

    it("should allow minting after the module is removed", async function () {
      await identityStorage.connect(owner).registerUsers([owner.address]);

      const mintAmount = ethers.parseUnits("100");
      await expect(
        securityToken.connect(owner).mint(owner.address, mintAmount)
      ).to.be.revertedWith("Compliance not followed");

      await modularCompliance.removeModule(conditionalTransferModule);

      // Mint tokens again - should succeed because the module is removed
      await expect(securityToken.connect(owner).mint(owner.address, mintAmount))
        .to.emit(securityToken, "Transfer")
        .withArgs(ethers.ZeroAddress, owner.address, mintAmount);

      // Confirm the minting
      const balance = await securityToken.balanceOf(owner.address);
      expect(balance).to.equal(mintAmount);
    });

    it("should revert mint if moduleCheck returns false", async function () {
      await identityStorage.connect(owner).registerUsers([addr1.address]);

      const amount = ethers.parseEther("100");

      // Attempt to mint tokens; should revert due to compliance failure
      await expect(
        securityToken.mint(addr1.address, amount)
      ).to.be.revertedWith("Compliance not followed");
    });

    it("should allow single and batch approval and update transfersApproved correctly", async () => {
      await identityStorage
        .connect(owner)
        .registerUsers([addr1.address, addr2.address]);

      const amount = ethers.parseEther("100");
      // Encode the call to approveTransfer function
      const functionAbi = new ethers.Interface([
        "function approveTransfer(address, address, uint256)",
      ]);
      const approveTransferData = functionAbi.encodeFunctionData(
        "approveTransfer",
        [addr1.address, addr2.address, amount]
      );

      const tx = await modularCompliance
        .connect(owner)
        .callModuleFunction(approveTransferData, conditionalTransferModule);

      await tx.wait();
      const transferHash =
        await conditionalTransferModule.calculateTransferHash(
          addr1,
          addr2,
          amount,
          securityToken
        );
      const isApproved = await conditionalTransferModule.isTransferApproved(
        modularCompliance,
        transferHash
      );
      assert.isTrue(isApproved, "Transfer should be approved");
    });
  });
});
