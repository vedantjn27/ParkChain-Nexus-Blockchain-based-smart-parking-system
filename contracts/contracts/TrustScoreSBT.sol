// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract TrustScoreSBT {
    string public constant name = "TrustScore SBT";
    string public constant symbol = "TSBT";

    address public owner;
    uint256 public nextTokenId = 1;

    mapping(address => uint256) public tokenOf;
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public scoreOf;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event TrustScoreAdjusted(address indexed driver, int256 delta, string reasonCode);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function mintInitialScore(address driver) external onlyOwner {
        require(driver != address(0), "Invalid driver");
        require(tokenOf[driver] == 0, "Already minted");
        uint256 tokenId = nextTokenId++;
        tokenOf[driver] = tokenId;
        ownerOf[tokenId] = driver;
        scoreOf[driver] = 700;
        emit Transfer(address(0), driver, tokenId);
    }

    function adjustScore(address driver, int256 delta, string calldata reasonCode) external onlyOwner {
        require(tokenOf[driver] != 0, "Score not minted");
        int256 nextScore = int256(scoreOf[driver]) + delta;
        if (nextScore < 0) {
            nextScore = 0;
        }
        if (nextScore > 1000) {
            nextScore = 1000;
        }
        scoreOf[driver] = uint256(nextScore);
        emit TrustScoreAdjusted(driver, delta, reasonCode);
    }

    function getScore(address driver) external view returns (uint256) {
        return scoreOf[driver];
    }

    function transferFrom(address, address, uint256) external pure {
        revert("Soulbound: non-transferable");
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert("Soulbound: non-transferable");
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert("Soulbound: non-transferable");
    }
}
