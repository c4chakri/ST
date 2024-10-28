// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

interface IIdentityStorage {
    /**
     * @dev Checks if a user is a valid investor.
     * @param _userAddress Address of the user to check.
     * @return bool indicating if the user is a valid investor.
     */
    function isValidInvestor(address _userAddress) external view returns (bool);
}