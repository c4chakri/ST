// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;
pragma abicoder v2;

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol';

contract IdentityStorage is Initializable, UUPSUpgradeable, OwnableUpgradeable, PausableUpgradeable {

    // User Structure
    struct USER {
        uint id; // Unique ID for a user
    }
    mapping(address => USER) public users;
    mapping(uint => address) public idToAddress;
    uint256 public constant MAX_BATCH_SIZE = 100;
    uint public totalUsers;


    // Events
    event RegisterUser(address userAddress, uint user_id);
    
    function initialize() public initializer {

        OwnableUpgradeable.__Ownable_init(_msgSender());
    }

    /**  
      * @dev Upgradable Logic
      */
    function _authorizeUpgrade(address) internal view override {
        require(owner() == _msgSender(), "#ERR: Only owner can upgrade implementation");
    }

    /**  
      * @dev Register multiple users into the project (Free to register)
      * @param _userAddresses Array of user addresses to be registered
      */
    function registerUsers(address[] calldata _userAddresses) external onlyOwner whenNotPaused {
        require(_userAddresses.length <= MAX_BATCH_SIZE, "Batch size too large");

        for (uint i = 0; i < _userAddresses.length; i++) {
            address userAddress = _userAddresses[i];
            require(!isUserExists(userAddress), "Already registered");
            
            // Creator cannot be a contract
            // Check if the address is an externally owned accounts (EOA) and not a contract
            uint32 size;
            assembly {
                size := extcodesize(userAddress)
            }
            require(size == 0, "Cannot be a contract");

            _createNewUser(userAddress);
        }
    }

    // Create new user
    function _createNewUser(address userAddress) private {
        
        // Create new user in struct
        totalUsers++;
        users[userAddress].id = totalUsers;
        idToAddress[totalUsers] = userAddress;

        emit RegisterUser(userAddress, users[userAddress].id);
    }

    /**  
      * @dev Check if an address is a valid investor
      * @param _userAddress Address of the user to check
      * @return bool indicating if the user is a valid investor
      */
    function isValidInvestor(address _userAddress) public view returns (bool) {
        return isUserExists(_userAddress);
    }
    
    /**  
      * @dev Checks if a user exists
      * @param _userAddress Address of the user to check
      */
    function isUserExists(address _userAddress) internal view returns (bool) {
        return (users[_userAddress].id != 0);
    }

    /**  
      * @dev Gets a unique ID of the user from their address.
      * @param _userAddress Address of the user to check
      */
    function getIdByAddress(address _userAddress) public view returns (uint) {
        return users[_userAddress].id;
    }

    /**  
      * @dev Gets an address of the user from their ID
      * @param _id ID of the user to check
      */
    function getAddressById(uint _id) public view returns (address) {
        return idToAddress[_id];
    }

    /** 
    * @dev Pause the Contract
    */
    function pause() external onlyOwner virtual whenNotPaused {
        _pause();
        emit Paused(msg.sender);
    }

    /** 
    * @dev Unpause the Contract
    */
    function unpause() external onlyOwner virtual whenPaused {
        _unpause();
        emit Unpaused(msg.sender);
    }

}