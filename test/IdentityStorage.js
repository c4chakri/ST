const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IdentityStorage Contract", function () {
  let IdentityStorage;
  let identityStorage;
  let owner, user1, user2, user3, randomUser;
  
  before(async function () {
    // Get contract and signers
    IdentityStorage = await ethers.getContractFactory("IdentityStorage");
    [owner, user1, user2, user3, randomUser] = await ethers.getSigners();
  });

  beforeEach(async function () {
    // Deploy a new instance before each test
    identityStorage = await IdentityStorage.deploy();

    // Initialize the contract
    await identityStorage.initialize();

    // console.log("identityStorage deployed to:", identityStorage.target);

  });

  describe("Initialization", function () {
    it("should initialize correctly with owner address", async function () {

      const ownerAddress = await identityStorage.owner();
      expect(ownerAddress).to.equal(owner.address);
    });
  });

  describe("Register Users", function () {
    it("should allow the owner to register new users", async function () {
      await identityStorage.connect(owner).registerUsers([user1.address, user2.address]);
      
      const totalUsers = await identityStorage.totalUsers();
      expect(totalUsers).to.equal(2);

      const user1Id = await identityStorage.getIdByAddress(user1.address);
      expect(user1Id).to.equal(1);

      const user2Id = await identityStorage.getIdByAddress(user2.address);
      expect(user2Id).to.equal(2);
    });

    it("should not allow non-owner to register users", async function () {
      await expect(
        identityStorage.connect(randomUser).registerUsers([user1.address])
      ).to.be.revertedWithCustomError(identityStorage, "OwnableUnauthorizedAccount").withArgs(randomUser.address);
    });
    

    it("should not allow contract addresses to register as users", async function () {
      const TestContract = await ethers.getContractFactory("IdentityStorage");
      const testContract = await TestContract.deploy();
      console.log("testContract deployed to:", testContract.target);


      await expect(
        identityStorage.connect(owner).registerUsers([testContract])
      ).to.be.revertedWith("Cannot be a contract");
    });

    it("should revert if user is already registered", async function () {
      await identityStorage.connect(owner).registerUsers([user1.address]);
      
      await expect(
        identityStorage.connect(owner).registerUsers([user1.address])
      ).to.be.revertedWith("Already registered");
    });
  });

  describe("User Validations", function () {
    beforeEach(async function () {
      await identityStorage.connect(owner).registerUsers([user1.address, user2.address]);
    });

    it("should return true for valid investors", async function () {
      const isValid = await identityStorage.isValidInvestor(user1.address);
      expect(isValid).to.be.true;
    });

    it("should return false for invalid investors", async function () {
      const isValid = await identityStorage.isValidInvestor(randomUser.address);
      expect(isValid).to.be.false;
    });

    it("should get the correct ID by address", async function () {
      const user1Id = await identityStorage.getIdByAddress(user1.address);
      expect(user1Id).to.equal(1);
    });

    it("should get the correct address by ID", async function () {
      const user2Address = await identityStorage.getAddressById(2);
      expect(user2Address).to.equal(user2.address);
    });
  });

  describe("Pause and Unpause", function () {
    it("should allow the owner to pause the contract", async function () {
      await identityStorage.connect(owner).pause();
      const paused = await identityStorage.paused();
      expect(paused).to.be.true;
    });

    it("should allow the owner to unpause the contract", async function () {
      await identityStorage.connect(owner).pause();
      await identityStorage.connect(owner).unpause();
      const paused = await identityStorage.paused();
      expect(paused).to.be.false;
    });

    it("should revert registerUsers while paused", async function () {
      await identityStorage.connect(owner).pause();

      await expect(
        identityStorage.connect(owner).registerUsers([user1.address])
      ).to.be.revertedWithCustomError(identityStorage, "EnforcedPause()");
    });
  });

  it("should handle large batch registration correctly", async function () {
    const MAX_BATCH_SIZE = 100;
    const addresses = [];
    for (let i = 0; i < MAX_BATCH_SIZE; i++) {
        addresses.push(ethers.Wallet.createRandom().address);
    }
    const tx = await identityStorage.registerUsers(addresses);

    const receipt = await tx.wait();
    console.log("Gas Used:", receipt.gasUsed.toString());
    expect(await identityStorage.totalUsers()).to.equal(MAX_BATCH_SIZE);
  });

});
