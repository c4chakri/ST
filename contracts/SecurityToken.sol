// SPDX-License-Identifier: MIT

pragma solidity ^0.8.21;

import "./IIdentityStorage.sol";
import "./ISecurityToken.sol";
import "./TokenStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./AgentRoleUpgradeable.sol";

contract SecurityToken is TokenStorage, AgentRoleUpgradeable, ISecurityToken {

    IIdentityStorage public identityStorage;
    address private _complianceAddress;

    uint256 public maxTotalSupply;

    /// @dev Modifier to make a function callable only when the contract is not paused.
    modifier whenNotPaused() {
        require(!_tokenPaused, "Pausable: paused");
        _;
    }

    /// @dev Modifier to make a function callable only when the contract is paused.
    modifier whenPaused() {
        require(_tokenPaused, "Pausable: not paused");
        _;
    }

    modifier onlyOwnerOrAgent() {
        require(owner() == msg.sender || isAgent(msg.sender), "Caller is not owner or agent");
        _;
    }

        // Constructor
        function init(
            address _identityStorage,
            address _compliance,
            string memory _name,
            string memory _symbol,
            uint8 _decimals,
            uint256 _initialSupply
        ) external initializer {
            require(owner() == address(0), "already initialized");
            require(
            _identityStorage != address(0)
            && _compliance != address(0)
        , "invalid argument - zero address");  
            require(
                keccak256(abi.encode(_name)) != keccak256(abi.encode("")) &&
                keccak256(abi.encode(_symbol)) != keccak256(abi.encode("")),
                "invalid argument - empty string"
            );
            require(0 <= _decimals && _decimals <= 18, "decimals between 0 and 18");

            __Ownable_init(msg.sender);
            _tokenName = _name;
            _tokenSymbol = _symbol;
            _tokenDecimals = _decimals;
            _tokenPaused = true;

            maxTotalSupply = _initialSupply;
            setIdentityStorage(_identityStorage);
            setCompliance(_compliance);

        }

    // Setters
    function setName(string calldata _name) external onlyOwner {
        require(keccak256(abi.encode(_name)) != keccak256(abi.encode("")), "invalid argument - empty string");
        _tokenName = _name;
    }

    function setSymbol(string calldata _symbol) external onlyOwner {
        require(keccak256(abi.encode(_symbol)) != keccak256(abi.encode("")), "invalid argument - empty string");
        _tokenSymbol = _symbol;
    }

    function setIdentityStorage(address _identityStorage) public onlyOwner {
        require(_identityStorage != address(0), "invalid argument - zero address");
        identityStorage = IIdentityStorage(_identityStorage);
    }

    function setCompliance(address _compliance) public override onlyOwner {
        if (address(_tokenCompliance) != address(0)) {
            _tokenCompliance.unbindToken(address(this));
        }
        _tokenCompliance = IModularCompliance(_compliance);
        _tokenCompliance.bindToken(address(this));
        emit ComplianceAdded(_compliance);
    }

    function increaseMaxSupply(uint256 _newMaxSupply) external onlyOwner {
        require(_newMaxSupply > maxTotalSupply, "New max supply must be greater than current max supply");
        require(_totalSupply == maxTotalSupply, "Total supply has not yet reached the maximum limit");
    
        maxTotalSupply = _newMaxSupply;
        emit MaxSupplyIncreased(maxTotalSupply);
    }

    // Pause functions
    function pause() external onlyOwner whenNotPaused {
        _tokenPaused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner whenPaused {
        _tokenPaused = false;
        emit Unpaused(msg.sender);
    }

    function approve(address spender, uint256 value) external override returns (bool) {
        _allowances[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    // Transfer functions
    function transfer(address _to, uint256 _amount) public whenNotPaused returns (bool) {
        require(!_frozen[_to] && !_frozen[msg.sender], "wallet is frozen");
        require(_amount <= balanceOf(msg.sender) - _frozenTokens[msg.sender], "Insufficient Balance");
        
        if (identityStorage.isValidInvestor(_to) && _tokenCompliance.canTransfer(msg.sender, _to, _amount)) {
            _transfer(msg.sender, _to, _amount);
            _tokenCompliance.transferred(msg.sender, _to, _amount);
            return true;
        }
        revert("Transfer not possible");
    }

     function transferFrom(
        address _from,
        address _to,
        uint256 _amount
    ) external whenNotPaused returns (bool) {
        require(!_frozen[_to] && !_frozen[_from], "wallet is frozen");
        require(_amount <= balanceOf(_from) - (_frozenTokens[_from]), "Insufficient Balance");
        if(identityStorage.isValidInvestor(_to) && _tokenCompliance.canTransfer(msg.sender, _to, _amount)) {
            _approve(_from, msg.sender, _allowances[_from][msg.sender] - (_amount));
            _transfer(_from, _to, _amount);
            _tokenCompliance.transferred(_from, _to, _amount);
            return true;
        }
        revert("Transfer not possible");
    }

    function batchForcedTransfer(
        address[] calldata _fromList,
        address[] calldata _toList,
        uint256[] calldata _amounts
    ) external override {
        for (uint256 i = 0; i < _fromList.length; i++) {
            forcedTransfer(_fromList[i], _toList[i], _amounts[i]);
        }
    }

    function forcedTransfer(
        address _from,
        address _to,
        uint256 _amount
    ) public override onlyOwnerOrAgent returns (bool) {
        require(balanceOf(_from) >= _amount, "sender balance too low");
        uint256 freeBalance = balanceOf(_from) - (_frozenTokens[_from]);
        if (_amount > freeBalance) {
            uint256 tokensToUnfreeze = _amount - (freeBalance);
            _frozenTokens[_from] = _frozenTokens[_from] - (tokensToUnfreeze);
            emit TokensUnfrozen(_from, tokensToUnfreeze);
        }
        if (identityStorage.isValidInvestor(_to)) {
            _transfer(_from, _to, _amount);
            _tokenCompliance.transferred(_from, _to, _amount);
            return true;
        }
        revert("Transfer not possible");
    }

    // Internal functions
    function _transfer(address _from, address _to, uint256 _amount) internal {
        require(_from != address(0), "ERC20: transfer from the zero address");
        require(_to != address(0), "ERC20: transfer to the zero address");
        require(_balances[_from] >= _amount, "ERC20: transfer amount exceeds balance");

        _balances[_from] -= _amount;
        _balances[_to] += _amount;
        emit Transfer(_from, _to, _amount);
    }

    function _mint(address _userAddress, uint256 _amount) internal {
        require(_userAddress != address(0), "ERC20: mint to the zero address");
        require(_totalSupply + _amount <= maxTotalSupply, "Minting exceeds total supply limit");  // Check supply limit
        _totalSupply += _amount;
        _balances[_userAddress] += _amount;
        emit Transfer(address(0), _userAddress, _amount);
    }

    function _burn(address _userAddress, uint256 _amount) internal {
        require(_userAddress != address(0), "ERC20: burn from the zero address");
        require(_balances[_userAddress] >= _amount, "ERC20: burn amount exceeds balance");
        
        _balances[_userAddress] -= _amount;
        _totalSupply -= _amount;
        emit Transfer(_userAddress, address(0), _amount);
    }

    function _approve(address _owner, address _spender, uint256 _amount) internal {
        require(_owner != address(0), "ERC20: approve from the zero address");
        require(_spender != address(0), "ERC20: approve to the zero address");

        _allowances[_owner][_spender] = _amount;
        emit Approval(_owner, _spender, _amount);
    }

    // Freeze functions
    function freezePartialTokens(address _userAddress, uint256 _amount) public onlyOwnerOrAgent {
        require(_balances[_userAddress] >= _amount, "insufficient balance");
        _frozenTokens[_userAddress] += _amount;
        emit TokensFrozen(_userAddress, _amount);
    }

    function unfreezePartialTokens(address _userAddress, uint256 _amount) public onlyOwnerOrAgent {
        require(_frozenTokens[_userAddress] >= _amount, "Amount should be less than or equal to frozen tokens");
        _frozenTokens[_userAddress] -= _amount;
        emit TokensUnfrozen(_userAddress, _amount);
    }

    function setAddressFrozen(address _userAddress, bool _freeze) public onlyOwnerOrAgent {
        _frozen[_userAddress] = _freeze;
        emit AddressFrozen(_userAddress, _freeze, msg.sender);
    }

    // Mint and Burn functions
    function mint(address _to, uint256 _amount) public onlyOwnerOrAgent {
        require(identityStorage.isValidInvestor(_to), "Identity is not verified.");
        require(_tokenCompliance.canTransfer(address(0), _to, _amount), "Compliance not followed");

        _mint(_to, _amount);
        _tokenCompliance.created(_to, _amount);

    }

    function burn(address _userAddress, uint256 _amount) external onlyOwnerOrAgent {
        require(balanceOf(_userAddress) >= _amount, "cannot burn more than balance");
        uint256 freeBalance = balanceOf(_userAddress) - _frozenTokens[_userAddress];
        if (_amount > freeBalance) {
            uint256 tokensToUnfreeze = _amount - (freeBalance);
            _frozenTokens[_userAddress] = _frozenTokens[_userAddress] - (tokensToUnfreeze);
            emit TokensUnfrozen(_userAddress, tokensToUnfreeze);
        }
        _burn(_userAddress, _amount);
        _tokenCompliance.destroyed(_userAddress, _amount);

    }

    // Batch operations
    function batchMint(address[] calldata _toList, uint256[] calldata _amounts) external override onlyOwnerOrAgent {
        for (uint256 i = 0; i < _toList.length; i++) {
            mint(_toList[i], _amounts[i]);
        }
    }

    function batchTransfer(address[] calldata _toList, uint256[] calldata _amounts) external {
        require(_toList.length == _amounts.length, "arrays must be of equal length");
        for (uint256 i = 0; i < _toList.length; i++) {
            transfer(_toList[i], _amounts[i]);
        }
    }

    function batchBurn(address[] calldata _userAddresses, uint256[] calldata _amounts) external onlyOwnerOrAgent {
        for (uint256 i = 0; i < _userAddresses.length; i++) {
            _burn(_userAddresses[i], _amounts[i]);
        }
    }

    function batchSetAddressFrozen(address[] calldata _userAddresses, bool[] calldata _freeze) external onlyOwnerOrAgent {
        for (uint256 i = 0; i < _userAddresses.length; i++) {
            setAddressFrozen(_userAddresses[i], _freeze[i]);
        }
    }

    function batchFreezePartialTokens(address[] calldata _userAddresses, uint256[] calldata _amounts) external {
        for (uint256 i = 0; i < _userAddresses.length; i++) {
            freezePartialTokens(_userAddresses[i], _amounts[i]);
        }
    }
    
    function batchUnfreezePartialTokens(address[] calldata _userAddresses, uint256[] calldata _amounts) external override {
        for (uint256 i = 0; i < _userAddresses.length; i++) {
            unfreezePartialTokens(_userAddresses[i], _amounts[i]);
        }
    }

    // View functions
    function balanceOf(address _userAddress) public view returns (uint256) {
        return _balances[_userAddress];
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function isFrozen(address _userAddress) external view returns (bool) {
        return _frozen[_userAddress];
    }

    function decimals() external view returns (uint8) {
        return _tokenDecimals;
    }

    function name() external view returns (string memory) {
        return _tokenName;
    }

    function symbol() external view returns (string memory) {
        return _tokenSymbol;
    }

    function getFrozenTokens(address _userAddress) external view override returns (uint256) {
        return _frozenTokens[_userAddress];
    }

    function compliance() external view returns (IModularCompliance) {
        return _tokenCompliance;
    }

    function remainingMintableTokens() external view returns (uint256) {
    if (_totalSupply >= maxTotalSupply) {
        return 0;
    }
    return maxTotalSupply - _totalSupply;
    }

}


