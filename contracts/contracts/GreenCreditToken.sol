// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract GreenCreditToken {
    string public constant name = "GreenCredit";
    string public constant symbol = "GRC";
    uint8 public constant decimals = 18;

    address public owner;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event GreenCreditMinted(address indexed driver, uint256 amount);
    event GreenCreditRedeemed(address indexed driver, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function mintCredit(address driver, uint256 amount, string calldata) external onlyOwner {
        require(driver != address(0), "Invalid driver");
        totalSupply += amount;
        balanceOf[driver] += amount;
        emit Transfer(address(0), driver, amount);
        emit GreenCreditMinted(driver, amount);
    }

    function redeemCredit(address driver, uint256 amount) external onlyOwner {
        require(balanceOf[driver] >= amount, "Insufficient credits");
        balanceOf[driver] -= amount;
        totalSupply -= amount;
        emit Transfer(driver, address(0), amount);
        emit GreenCreditRedeemed(driver, amount);
    }
}
