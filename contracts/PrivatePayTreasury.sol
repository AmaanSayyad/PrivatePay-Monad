// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title PrivatePayTreasury
 * @notice Treasury + meta-address registry + stealth payment bookkeeping + DarkPool-style commitment pool.
 *         - Receive MON (simple flow and stealth deposits).
 *         - Relayer withdraws to users (after off-chain balance/approval).
 *         - Meta addresses (spendPub, viewPub) for BIP 0352 / EIP 5564 style stealth; derivation is off-chain.
 *         - Stealth payments keyed by (recipientId, ephemeralPub); relayer releases to destination.
 *         - Pool: deposit with commitment; withdraw with nullifier + relayer signature (ZK proof can be added later).
 */
contract PrivatePayTreasury {
    address public owner;
    address public relayer;

    // ----- Meta address registry (infinite stealth addresses: one meta per user, many ephemerals off-chain) -----
    struct MetaAddress {
        bytes spendPub;  // compressed secp256k1 pubkey (33 bytes)
        bytes viewPub;   // compressed secp256k1 pubkey (33 bytes)
    }
    mapping(bytes32 => MetaAddress) public metaAddressOf;

    // ----- Stealth payment balance: (recipientId, ephemeralPub) => wei -----
    mapping(bytes32 => mapping(bytes32 => uint256)) public pendingStealth;

    // ----- DarkPool-style pool: commitment => total wei deposited (same commitment can be topped up) -----
    mapping(bytes32 => uint256) public poolBalance;
    mapping(bytes32 => bool) public nullifierUsed;

    event Received(address indexed from_, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event RelayerUpdated(address indexed previousRelayer, address indexed newRelayer);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    event MetaAddressSet(bytes32 indexed userId, bytes spendPub, bytes viewPub);
    event StealthDeposit(bytes32 indexed recipientId, bytes32 indexed ephemeralPub, uint256 amount);
    event StealthWithdraw(bytes32 indexed recipientId, bytes32 indexed ephemeralPub, address indexed to, uint256 amount);
    event PoolDeposit(bytes32 indexed commitment, uint256 amount);
    event PoolWithdraw(bytes32 indexed nullifier, address indexed to, uint256 amount);

    error OnlyOwner();
    error OnlyRelayer();
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance();
    error InvalidMetaAddress();
    error NullifierAlreadyUsed();
    error InvalidSignature();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer && msg.sender != owner) revert OnlyRelayer();
        _;
    }

    constructor(address relayer_) {
        if (relayer_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        relayer = relayer_;
    }

    // ========== Treasury (simple flow) ==========

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    function withdraw(address to, uint256 amount) external onlyRelayer {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (address(this).balance < amount) revert InsufficientBalance();
        (bool ok,) = to.call{value: amount}("");
        require(ok, "Transfer failed");
        emit Withdrawn(to, amount);
    }

    function withdrawBatch(address[] calldata tos, uint256[] calldata amounts) external onlyRelayer {
        if (tos.length != amounts.length) revert();
        for (uint256 i = 0; i < tos.length; i++) {
            if (tos[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) revert ZeroAmount();
            if (address(this).balance < amounts[i]) revert InsufficientBalance();
            (bool ok,) = tos[i].call{value: amounts[i]}("");
            require(ok, "Transfer failed");
            emit Withdrawn(tos[i], amounts[i]);
        }
    }

    // ========== Meta address registry (for stealth: spendPub + viewPub per user) ==========

    /// @dev Set meta address for a user id (e.g. keccak256(username)). Used so senders can derive stealth addresses off-chain.
    function setMetaAddress(bytes32 userId, bytes calldata spendPub, bytes calldata viewPub) external onlyRelayer {
        if (spendPub.length != 33 && spendPub.length != 65) revert InvalidMetaAddress();
        if (viewPub.length != 33 && viewPub.length != 65) revert InvalidMetaAddress();
        metaAddressOf[userId] = MetaAddress({ spendPub: spendPub, viewPub: viewPub });
        emit MetaAddressSet(userId, spendPub, viewPub);
    }

    function getMetaAddress(bytes32 userId) external view returns (bytes memory spendPub, bytes memory viewPub) {
        MetaAddress storage m = metaAddressOf[userId];
        return (m.spendPub, m.viewPub);
    }

    // ========== Stealth payments (infinite one-time addresses: keyed by recipientId + ephemeralPub) ==========

    /// @dev Sender pays to a stealth recipient. Off-chain: sender computes stealth address from meta + ephemeral; here we record by (recipientId, ephemeralPub) so relayer can release to the right wallet after off-chain proof.
    function depositToStealth(bytes32 recipientId, bytes32 ephemeralPub) external payable {
        if (msg.value == 0) revert ZeroAmount();
        pendingStealth[recipientId][ephemeralPub] += msg.value;
        emit StealthDeposit(recipientId, ephemeralPub, msg.value);
    }

    /// @dev Relayer releases stealth balance to destination (after verifying recipient off-chain).
    function withdrawStealth(bytes32 recipientId, bytes32 ephemeralPub, address to, uint256 amount) external onlyRelayer {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 bal = pendingStealth[recipientId][ephemeralPub];
        if (bal < amount) revert InsufficientBalance();
        pendingStealth[recipientId][ephemeralPub] = bal - amount;
        if (address(this).balance < amount) revert InsufficientBalance();
        (bool ok,) = to.call{value: amount}("");
        require(ok, "Transfer failed");
        emit StealthWithdraw(recipientId, ephemeralPub, to, amount);
    }

    // ========== DarkPool-style commitment pool (mixer) ==========

    /// @dev Deposit into pool under a commitment (e.g. hash(secret)). Withdraw later with nullifier + relayer approval (or ZK proof when verifier is added).
    function depositToPool(bytes32 commitment) external payable {
        if (msg.value == 0) revert ZeroAmount();
        poolBalance[commitment] += msg.value;
        emit PoolDeposit(commitment, msg.value);
    }

    /// @dev Withdraw from pool using a nullifier and relayer signature. Relayer signs (nullifier, amount, to, chainid) so contract trusts relayer approved this withdrawal (ZK proof can replace relayer later).
    function withdrawFromPoolWithApproval(
        bytes32 nullifier,
        uint256 amount,
        address to,
        bytes calldata signature
    ) external {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (nullifierUsed[nullifier]) revert NullifierAlreadyUsed();
        bytes32 message = keccak256(abi.encodePacked(nullifier, amount, to, block.chainid));
        bytes32 ethSigned = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message));
        address signer = _recover(ethSigned, signature);
        if (signer != relayer && signer != owner) revert InvalidSignature();
        nullifierUsed[nullifier] = true;
        if (address(this).balance < amount) revert InsufficientBalance();
        (bool ok,) = to.call{value: amount}("");
        require(ok, "Transfer failed");
        emit PoolWithdraw(nullifier, to, amount);
    }

    function _recover(bytes32 hash, bytes memory signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        if (v < 27) v += 27;
        return ecrecover(hash, v, r, s);
    }

    // ========== Admin ==========

    function setRelayer(address newRelayer) external onlyOwner {
        if (newRelayer == address(0)) revert ZeroAddress();
        address old = relayer;
        relayer = newRelayer;
        emit RelayerUpdated(old, newRelayer);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address old = owner;
        owner = newOwner;
        emit OwnershipTransferred(old, newOwner);
    }
}
