// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IParkCoin {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract EscrowSettlement {
    struct Escrow {
        address driver;
        address lotOwner;
        uint256 amount;
        uint256 exitTimestamp;
        bool disputed;
        bool released;
    }

    IParkCoin public parkCoin;
    address public owner;
    address public protocolTreasury;
    uint256 public disputeWindowSeconds;

    mapping(uint256 => Escrow) public escrows;

    event EscrowDeposited(uint256 indexed sessionId, address indexed driver, uint256 amount);
    event EscrowReleased(uint256 indexed sessionId, uint256 ownerAmount, uint256 protocolFee);
    event DisputeFlagged(uint256 indexed sessionId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address parkCoinAddress, address treasury, uint256 initialDisputeWindowSeconds) {
        require(parkCoinAddress != address(0), "Invalid token");
        owner = msg.sender;
        parkCoin = IParkCoin(parkCoinAddress);
        protocolTreasury = treasury == address(0) ? msg.sender : treasury;
        disputeWindowSeconds = initialDisputeWindowSeconds;
    }

    function depositEscrow(uint256 sessionId, address lotOwner, uint256 amount) external {
        require(escrows[sessionId].amount == 0, "Escrow exists");
        require(amount > 0, "Amount required");
        require(parkCoin.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        escrows[sessionId] = Escrow({
            driver: msg.sender,
            lotOwner: lotOwner,
            amount: amount,
            exitTimestamp: 0,
            disputed: false,
            released: false
        });
        emit EscrowDeposited(sessionId, msg.sender, amount);
    }

    function markExitConfirmed(uint256 sessionId) external onlyOwner {
        Escrow storage escrow = escrows[sessionId];
        require(escrow.amount > 0, "Missing escrow");
        escrow.exitTimestamp = block.timestamp;
    }

    function flagDispute(uint256 sessionId) external onlyOwner {
        escrows[sessionId].disputed = true;
        emit DisputeFlagged(sessionId);
    }

    function releaseEscrow(uint256 sessionId) external {
        Escrow storage escrow = escrows[sessionId];
        require(escrow.amount > 0, "Missing escrow");
        require(escrow.exitTimestamp > 0, "Exit not confirmed");
        require(!escrow.disputed, "Escrow disputed");
        require(!escrow.released, "Already released");
        require(block.timestamp >= escrow.exitTimestamp + disputeWindowSeconds, "Dispute window active");

        escrow.released = true;
        uint256 protocolFee = escrow.amount / 20;
        uint256 ownerAmount = escrow.amount - protocolFee;
        require(parkCoin.transfer(escrow.lotOwner, ownerAmount), "Owner transfer failed");
        require(parkCoin.transfer(protocolTreasury, protocolFee), "Fee transfer failed");
        emit EscrowReleased(sessionId, ownerAmount, protocolFee);
    }
}
