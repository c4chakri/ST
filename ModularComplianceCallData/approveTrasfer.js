const {ethers} = require("hardhat");


function approveTransfer(from, to, amount) {
    const functionAbi = new ethers.Interface([
        "function approveTransfer(address, address, uint256)",
      ]);
      const approveTransferData = functionAbi.encodeFunctionData(
        "approveTransfer",
        [from, to, amount]
      );
      return approveTransferData;
}

function unApproveTransfer(from, to, amount) {
  const functionAbi = new ethers.Interface([
    "function unApproveTransfer(address, address, uint256)",
  ]);
  const unApproveTransferData = functionAbi.encodeFunctionData(
    "unApproveTransfer",
    [from, to, amount]
  );
  return unApproveTransferData;
}

const amount = ethers.parseEther("100");
const from = "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4";
const to = "0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2";
const amt = ethers.parseEther("100");
console.table({from, to, amt});
const approveTransferData = approveTransfer(from, to, amount);
const unApproveTransferData = unApproveTransfer(from, to, amount);

console.log("approveTransferData:", approveTransferData);
console.log("\n unApproveTransferData:", unApproveTransferData);

module.exports = {
    approveTransfer,
    unApproveTransfer
}