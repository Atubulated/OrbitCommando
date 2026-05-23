// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CommandoOrbitSecure {
    
    // The wallet address of your Vercel Backend API
    address public backendSigner; 
    
    // The owner of the contract (You)
    address public owner;

    struct PlayerRecord {
        string opId;
        uint256 score;
    }

    mapping(address => PlayerRecord) public leaderboards;
    address[] public playerAddresses;

    event ScoreSubmitted(address indexed player, string opId, uint256 score);

    constructor(address _backendSigner) {
        owner = msg.sender;
        backendSigner = _backendSigner;
    }

    // You can update the backend wallet later if it ever gets compromised
    function setBackendSigner(address _newSigner) external {
        require(msg.sender == owner, "Only owner can change signer");
        backendSigner = _newSigner;
    }

    // THE VAULT DOOR: Now requires a cryptographic signature
    function submitGlobalScore(string memory _opId, uint256 _score, bytes memory _signature) public {
        
        // 1. Recreate the exact message the backend supposedly signed
        // We hash the player's address and their score together
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, _score));
        
        // 2. Add the standard Ethereum prefix to the hash
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        
        // 3. Recover the wallet address that actually signed this message
        address recoveredSigner = recoverSigner(ethSignedMessageHash, _signature);
        
        // 4. THE BOUNCER: Did the backend server sign this?
        require(recoveredSigner == backendSigner, "SECURITY ALERT: Invalid signature from backend API");

        // 5. If the signature is valid, proceed as normal!
        if (bytes(leaderboards[msg.sender].opId).length == 0) {
            playerAddresses.push(msg.sender);
        }

        if (_score > leaderboards[msg.sender].score) {
            leaderboards[msg.sender] = PlayerRecord(_opId, _score);
            emit ScoreSubmitted(msg.sender, _opId, _score);
        }
    }

    function getPersonalBest(address _player) public view returns (uint256) {
        return leaderboards[_player].score;
    }

    // --- INTERNAL CRYPTOGRAPHY HELPER ---
    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature) internal pure returns (address) {
        require(_signature.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(_signature, 32))
            s := mload(add(_signature, 64))
            v := byte(0, mload(add(_signature, 96)))
        }

        return ecrecover(_ethSignedMessageHash, v, r, s);
    }
}