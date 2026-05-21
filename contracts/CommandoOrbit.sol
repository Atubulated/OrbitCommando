// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CommandoOrbit {
    struct ScoreRecord {
        address player;
        string opId;
        uint256 score;
    }

    ScoreRecord[10] public globalLeaderboard;
    mapping(address => uint256) public personalBests;
    uint256 public totalPlayers;
    
    event GlobalScoreBeaten(address indexed player, string opId, uint256 score, uint256 rank);
    event PersonalBestUpdated(address indexed player, uint256 score);

    function submitGlobalScore(string calldata _opId, uint256 _score) external {
        require(bytes(_opId).length > 0 && bytes(_opId).length <= 5, "Invalid Operator ID length");

        // If the score isn't higher than their PR, we don't even need to touch the leaderboard
        if (_score <= personalBests[msg.sender]) {
            return;
        }

        if (personalBests[msg.sender] == 0) {
            totalPlayers++;
        }
        personalBests[msg.sender] = _score;
        emit PersonalBestUpdated(msg.sender, _score);

        // 1. Find if the player is already on the board
        int playerIndex = -1;
        for (uint i = 0; i < 10; i++) {
            if (globalLeaderboard[i].player == msg.sender) {
                playerIndex = int(i);
                break;
            }
        }

        // 2. If they are on the board, temporarily remove their old score and shift everything up
        if (playerIndex != -1) {
            for (uint i = uint(playerIndex); i < 9; i++) {
                globalLeaderboard[i] = globalLeaderboard[i + 1];
            }
            // Clear the 10th spot since we shrunk the list
            globalLeaderboard[9] = ScoreRecord(address(0), "", 0);
        }

        // 3. Insert the new score if it belongs in the Top 10
        if (_score > globalLeaderboard[9].score) {
            for (uint i = 0; i < 10; i++) {
                if (_score > globalLeaderboard[i].score) {
                    // Shift lower scores down to make room
                    for (uint j = 9; j > i; j--) {
                        globalLeaderboard[j] = globalLeaderboard[j - 1];
                    }
                    // Drop in the new record
                    globalLeaderboard[i] = ScoreRecord({
                        player: msg.sender,
                        opId: _opId,
                        score: _score
                    });
                    emit GlobalScoreBeaten(msg.sender, _opId, _score, i + 1);
                    break;
                }
            }
        }
    }

    function getGlobalLeaderboard() external view returns (ScoreRecord[10] memory) {
        return globalLeaderboard;
    }

    function getPersonalBest(address _player) external view returns (uint256) {
        return personalBests[_player];
    }
}