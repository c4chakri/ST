const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SecurityToken Contract", function () {
    let securityToken, identityStorage, owner, agent, user1, user2;

    beforeEach(async function () {
        [owner, agent, user1, user2] = await ethers.getSigners();

        const IdentityStorageMock = await ethers.getContractFactory("IdentityStorage");
        identityStorage = await IdentityStorageMock.deploy();
        await identityStorage.initialize();

        const SecurityToken = await ethers.getContractFactory("SecurityToken");
        securityToken = await SecurityToken.deploy();

        console.log("SecurityToken deployed to:", SecurityToken.target);


        await securityToken.connect(owner).init(
            identityStorage,
            "MyToken",
            "MTK",
            18,
            ethers.parseEther("1000000")
        );

        // await securityToken.setCompliance(owner.address);
    });

    describe("Initialization", function () {
        it("Should initialize with correct values", async function () {
            expect(await securityToken.name()).to.equal("MyToken");
            expect(await securityToken.symbol()).to.equal("MTK");
            expect(await securityToken.decimals()).to.equal(18);
            expect(await securityToken.totalSupply()).to.equal(0);
        });

        it("Should fail to initialize twice", async function () {
            await expect(securityToken.init(
                identityStorage,
                "MyToken",
                "MTK",
                18,
                ethers.parseEther("1000000")
            )).to.be.revertedWithCustomError(securityToken, "InvalidInitialization");
        });
    });

    describe("Ownership and Agent Roles", function () {
        it("Only owner or agent can call functions with onlyOwnerOrAgent modifier", async function () {
            await identityStorage.connect(owner).registerUsers([user1.address, user2.address]);
            await securityToken.mint(user1.address, ethers.parseEther("1000"));
            await expect(securityToken.connect(user1).freezePartialTokens(user1.address, 1000)).to.be.revertedWith("Caller is not owner or agent");
            await securityToken.addAgent(agent.address);
            await securityToken.connect(agent).freezePartialTokens(user1.address, 1000);
            expect(await securityToken.getFrozenTokens(user1.address)).to.equal(1000);
        });
    });

    describe("Minting and Burning", function () {
        beforeEach(async function () {
            await identityStorage.connect(owner).registerUsers([user1.address, user2.address]);
        });
    
        it("Should mint tokens for a valid investor", async function () {
            await securityToken.connect(owner).mint(user1.address, ethers.parseEther("1000"));
            expect(await securityToken.balanceOf(user1.address)).to.equal(ethers.parseEther("1000"));
        });
    
        it("Should not mint tokens above maxTotalSupply", async function () {
            await expect(
                securityToken.connect(owner).mint(user1.address, ethers.parseEther("1000001"))
            ).to.be.revertedWith("Minting exceeds total supply limit");
        });
    
        it("Should burn tokens from user address", async function () {
            await securityToken.connect(owner).mint(user1.address, ethers.parseEther("1000"));
            await securityToken.connect(owner).burn(user1.address, ethers.parseEther("500"));
            expect(await securityToken.balanceOf(user1.address)).to.equal(ethers.parseEther("500"));
        });
    });
    

    describe("Transfers", function () {
        beforeEach(async function () {
            await identityStorage.connect(owner).registerUsers([user1.address, user2.address]);
            await securityToken.mint(user1.address, ethers.parseEther("1000"));
        });

        it("Should transfer tokens between users", async function () {
            await securityToken.unpause();
            await securityToken.connect(user1).transfer(user2.address, ethers.parseEther("500"));
            expect(await securityToken.balanceOf(user2.address)).to.equal(ethers.parseEther("500"));
        });

        it("Should not transfer tokens if paused", async function () {
            expect(securityToken.connect(user1).transfer(user2.address, ethers.parseEther("500"))).to.be.revertedWith("Pausable: paused");
        });

        it("Should prevent transfers from frozen addresses", async function () {
            await securityToken.unpause();
            await securityToken.setAddressFrozen(user1.address, true);
            await expect(securityToken.connect(user1).transfer(user2.address, ethers.parseEther("500"))).to.be.revertedWith("wallet is frozen");
        });
    });

    describe("Batch Operations", function () {
        it("Should perform batch minting", async function () {
            await identityStorage.connect(owner).registerUsers([user1.address, user2.address]);
            await securityToken.batchMint([user1.address, user2.address], [ethers.parseEther("100"), ethers.parseEther("200")]);
            expect(await securityToken.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
            expect(await securityToken.balanceOf(user2.address)).to.equal(ethers.parseEther("200"));
        });

        it("Should perform batch transfer", async function () {
            await identityStorage.connect(owner).registerUsers([user1.address, user2.address]);
            await securityToken.mint(user1.address, ethers.parseEther("500"));
            await securityToken.unpause();
            await securityToken.connect(user1).batchTransfer([user2.address], [ethers.parseEther("200")]);
            expect(await securityToken.balanceOf(user2.address)).to.equal(ethers.parseEther("200"));
        });
    });

    describe("Pausing and Unpausing", function () {
        it("Only owner can pause and unpause the contract", async function () {
            await expect(securityToken.connect(user1).pause()).to.be.revertedWithCustomError(securityToken, "OwnableUnauthorizedAccount").withArgs(user1.address);
            await expect(securityToken.connect(user1).unpause()).to.be.revertedWithCustomError(securityToken, "OwnableUnauthorizedAccount").withArgs(user1.address);
        });
    });
});
