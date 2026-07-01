// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ParkingSessionManager {
    enum SessionState {
        Reserved,
        EntryConfirmed,
        PriceCommitted,
        Active,
        ExitConfirmed,
        Settled,
        Disputed,
        Resolved
    }

    struct PricingInputs {
        uint256 occupancyBps;
        uint256 timeOfDay;
        uint256 dayOfWeek;
        uint256 demandFactorBps;
        uint256 basePriceCents;
        string weatherFlag;
        string nonce;
    }

    struct Session {
        uint256 sessionId;
        address driver;
        uint256 lotId;
        uint256 slotId;
        SessionState state;
        bytes32 aiPricingCommitHash;
        uint256 finalPricePerMinute;
        uint256 entryTimestamp;
        uint256 exitTimestamp;
        uint256 amountEscrowed;
        bool disputeRaised;
    }

    address public owner;
    address public relayer;
    uint256 public nextSessionId = 1;

    mapping(uint256 => Session) public sessions;
    mapping(uint256 => mapping(uint256 => uint256)) public activeSessionBySlot;
    mapping(uint256 => uint256[]) private activeSessionsForLot;

    event SlotReserved(uint256 indexed sessionId, address indexed driver, uint256 lotId, uint256 slotId, uint256 timestamp);
    event EntryConfirmed(uint256 indexed sessionId, uint256 timestamp);
    event PricingCommitted(uint256 indexed sessionId, bytes32 commitHash, uint256 pricePerMinute);
    event PricingRevealed(uint256 indexed sessionId, bytes32 commitHash, uint256 pricePerMinute);
    event ExitConfirmed(uint256 indexed sessionId, uint256 timestamp, uint256 totalAmount);
    event DisputeRaised(uint256 indexed sessionId, string reason);
    event DisputeResolved(uint256 indexed sessionId, bool refunded);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyRelayerOrDriver(uint256 sessionId) {
        require(msg.sender == relayer || msg.sender == sessions[sessionId].driver, "Not authorized");
        _;
    }

    constructor(address initialRelayer) {
        owner = msg.sender;
        relayer = initialRelayer == address(0) ? msg.sender : initialRelayer;
    }

    function setRelayer(address nextRelayer) external onlyOwner {
        require(nextRelayer != address(0), "Invalid relayer");
        relayer = nextRelayer;
    }

    function reserveSlot(uint256 lotId, uint256 slotId) external returns (uint256) {
        require(activeSessionBySlot[lotId][slotId] == 0, "Slot already active");
        uint256 sessionId = nextSessionId++;
        sessions[sessionId] = Session({
            sessionId: sessionId,
            driver: msg.sender,
            lotId: lotId,
            slotId: slotId,
            state: SessionState.Reserved,
            aiPricingCommitHash: bytes32(0),
            finalPricePerMinute: 0,
            entryTimestamp: 0,
            exitTimestamp: 0,
            amountEscrowed: 0,
            disputeRaised: false
        });
        activeSessionBySlot[lotId][slotId] = sessionId;
        activeSessionsForLot[lotId].push(sessionId);
        emit SlotReserved(sessionId, msg.sender, lotId, slotId, block.timestamp);
        return sessionId;
    }

    function confirmEntry(uint256 sessionId, bytes32) external onlyRelayerOrDriver(sessionId) {
        Session storage parkingSession = sessions[sessionId];
        require(parkingSession.state == SessionState.Reserved, "Invalid state");
        parkingSession.state = SessionState.EntryConfirmed;
        parkingSession.entryTimestamp = block.timestamp;
        emit EntryConfirmed(sessionId, block.timestamp);
    }

    function commitAIPricing(uint256 sessionId, bytes32 commitHash, uint256 pricePerMinute) external onlyRelayerOrDriver(sessionId) {
        Session storage parkingSession = sessions[sessionId];
        require(
            parkingSession.state == SessionState.Reserved || parkingSession.state == SessionState.EntryConfirmed,
            "Invalid state"
        );
        require(commitHash != bytes32(0), "Invalid commit");
        parkingSession.state = SessionState.PriceCommitted;
        parkingSession.aiPricingCommitHash = commitHash;
        parkingSession.finalPricePerMinute = pricePerMinute;
        emit PricingCommitted(sessionId, commitHash, pricePerMinute);
    }

    function revealPricing(uint256 sessionId, PricingInputs calldata inputs, uint256 finalPrice) external onlyRelayerOrDriver(sessionId) {
        Session storage parkingSession = sessions[sessionId];
        require(parkingSession.state == SessionState.PriceCommitted, "Invalid state");
        bytes32 recomputed = hashPricingInputs(inputs);
        require(recomputed == parkingSession.aiPricingCommitHash, "Commit mismatch");
        parkingSession.state = SessionState.Active;
        parkingSession.finalPricePerMinute = finalPrice;
        emit PricingRevealed(sessionId, recomputed, finalPrice);
    }

    function confirmExit(uint256 sessionId) external onlyRelayerOrDriver(sessionId) {
        Session storage parkingSession = sessions[sessionId];
        require(
            parkingSession.state == SessionState.EntryConfirmed ||
                parkingSession.state == SessionState.PriceCommitted ||
                parkingSession.state == SessionState.Active,
            "Invalid state"
        );
        parkingSession.state = SessionState.ExitConfirmed;
        parkingSession.exitTimestamp = block.timestamp;
        activeSessionBySlot[parkingSession.lotId][parkingSession.slotId] = 0;

        uint256 totalAmount = 0;
        if (parkingSession.entryTimestamp != 0 && parkingSession.finalPricePerMinute != 0) {
            uint256 durationMinutes = ((parkingSession.exitTimestamp - parkingSession.entryTimestamp) / 60) + 1;
            totalAmount = durationMinutes * parkingSession.finalPricePerMinute;
        }
        emit ExitConfirmed(sessionId, block.timestamp, totalAmount);
    }

    function raiseDispute(uint256 sessionId, string calldata reason) external onlyRelayerOrDriver(sessionId) {
        Session storage parkingSession = sessions[sessionId];
        require(
            parkingSession.state == SessionState.ExitConfirmed || parkingSession.state == SessionState.Settled,
            "Invalid state"
        );
        parkingSession.state = SessionState.Disputed;
        parkingSession.disputeRaised = true;
        emit DisputeRaised(sessionId, reason);
    }

    function resolveDispute(uint256 sessionId, bool refundDriver) external onlyOwner {
        Session storage parkingSession = sessions[sessionId];
        require(parkingSession.state == SessionState.Disputed, "Invalid state");
        parkingSession.state = SessionState.Resolved;
        emit DisputeResolved(sessionId, refundDriver);
    }

    function getSession(uint256 sessionId) external view returns (Session memory) {
        return sessions[sessionId];
    }

    function getLotOccupancy(uint256 lotId) external view returns (uint256) {
        uint256[] storage lotSessions = activeSessionsForLot[lotId];
        uint256 activeCount = 0;
        for (uint256 i = 0; i < lotSessions.length; i++) {
            Session storage parkingSession = sessions[lotSessions[i]];
            if (activeSessionBySlot[lotId][parkingSession.slotId] == lotSessions[i]) {
                activeCount++;
            }
        }
        return activeCount;
    }

    function getActiveSessionsForLot(uint256 lotId) external view returns (uint256[] memory) {
        uint256[] storage lotSessions = activeSessionsForLot[lotId];
        uint256 activeCount = 0;
        for (uint256 i = 0; i < lotSessions.length; i++) {
            Session storage parkingSession = sessions[lotSessions[i]];
            if (activeSessionBySlot[lotId][parkingSession.slotId] == lotSessions[i]) {
                activeCount++;
            }
        }

        uint256[] memory activeSessions = new uint256[](activeCount);
        uint256 cursor = 0;
        for (uint256 i = 0; i < lotSessions.length; i++) {
            Session storage parkingSession = sessions[lotSessions[i]];
            if (activeSessionBySlot[lotId][parkingSession.slotId] == lotSessions[i]) {
                activeSessions[cursor++] = lotSessions[i];
            }
        }
        return activeSessions;
    }

    function hashPricingInputs(PricingInputs calldata inputs) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                inputs.occupancyBps,
                inputs.timeOfDay,
                inputs.dayOfWeek,
                inputs.demandFactorBps,
                inputs.basePriceCents,
                inputs.weatherFlag,
                inputs.nonce
            )
        );
    }
}
