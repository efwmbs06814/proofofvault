// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";

import {AgentStaking} from "../src/AgentStaking.sol";
import {CommitteeRegistry} from "../src/CommitteeRegistry.sol";
import {CompensationPool} from "../src/CompensationPool.sol";
import {FeeManager} from "../src/FeeManager.sol";
import {ResolutionRegistry} from "../src/ResolutionRegistry.sol";
import {RewardPool} from "../src/RewardPool.sol";
import {VaultEscrow} from "../src/VaultEscrow.sol";
import {VaultFactoryLite} from "../src/VaultFactoryLite.sol";

contract DeployProofOfVaultLite is Script {
    struct DeployConfig {
        address owner;
        address treasury;
        address burnAddress;
        address stakeToken;
        address slasher;
        address orchestrator;
        address finalizer;
        address safetyCouncil;
        uint16 creationFeeBps;
        uint16 settlementFeeBps;
        uint256 proofSubmissionFee;
        uint256 setupDepositAmount;
        uint256 resolutionRewardDepositAmount;
        uint256 challengeBondAmount;
        uint64 withdrawalCooldown;
    }

    function run()
        external
        returns (
            FeeManager feeManager,
            AgentStaking agentStaking,
            CommitteeRegistry committeeRegistry,
            RewardPool rewardPool,
            CompensationPool compensationPool,
            ResolutionRegistry resolutionRegistry,
            VaultEscrow vaultEscrow,
            VaultFactoryLite vaultFactory
        )
    {
        DeployConfig memory config = _loadConfig();

        vm.startBroadcast();

        feeManager = new FeeManager(
            config.owner,
            config.treasury,
            config.burnAddress,
            config.stakeToken,
            config.creationFeeBps,
            config.settlementFeeBps,
            config.proofSubmissionFee
        );
        agentStaking = new AgentStaking(config.owner, config.stakeToken, config.withdrawalCooldown);
        committeeRegistry = new CommitteeRegistry(config.owner);
        rewardPool = new RewardPool(config.owner, config.stakeToken, config.treasury);
        compensationPool = new CompensationPool(config.owner);
        resolutionRegistry = new ResolutionRegistry(config.owner);
        vaultEscrow = new VaultEscrow(config.owner);
        vaultFactory = new VaultFactoryLite(
            config.owner,
            address(resolutionRegistry),
            address(vaultEscrow),
            address(agentStaking),
            address(feeManager),
            address(committeeRegistry),
            address(rewardPool),
            address(compensationPool)
        );

        feeManager.setCollector(address(vaultFactory), true);
        feeManager.setV2DepositConfig(
            config.setupDepositAmount, config.resolutionRewardDepositAmount, config.challengeBondAmount
        );
        feeManager.setV2BondConfig(25 ether, 20 ether, 30 ether, 20 ether);
        feeManager.setV2RewardConfig(
            8 ether, 4 ether, 6 ether, 4 ether, 6 ether, 2 ether, 4 ether, 6 ether, 5 ether, 2_500
        );
        feeManager.setRuleVerifierRewards(2 ether, 4 ether, 6 ether, 8 ether);
        agentStaking.setAuthorizedSlasher(config.slasher, true);
        agentStaking.setAuthorizedController(address(vaultFactory), true);
        agentStaking.setAuthorizedController(address(rewardPool), true);
        committeeRegistry.setAuthorizedController(address(vaultFactory), true);
        rewardPool.setAuthorizedController(address(vaultFactory), true);
        rewardPool.setRewardStakeSink(address(agentStaking), true);
        resolutionRegistry.setAuthorizedOrchestrator(address(vaultFactory), true);
        vaultEscrow.setAuthorizedController(address(vaultFactory), true);
        compensationPool.setAuthorizedNotifier(address(vaultEscrow), true);
        vaultFactory.setAuthorizedFinalizer(config.finalizer, true);
        vaultFactory.setSafetyCouncil(config.safetyCouncil, true);
        vaultFactory.setAuthorizedOrchestrator(config.orchestrator, true);

        vm.stopBroadcast();
    }

    function _loadConfig() internal view returns (DeployConfig memory config) {
        config.owner = vm.envAddress("OWNER_ADDRESS");
        config.treasury = vm.envAddress("TREASURY_ADDRESS");
        config.burnAddress = vm.envAddress("BURN_ADDRESS");
        config.stakeToken = vm.envAddress("STAKE_TOKEN_ADDRESS");
        config.slasher = vm.envAddress("SLASHER_ADDRESS");
        config.orchestrator = vm.envAddress("ORCHESTRATOR_ADDRESS");
        config.finalizer = vm.envAddress("FINALIZER_ADDRESS");
        config.safetyCouncil = vm.envAddress("SAFETY_COUNCIL_ADDRESS");
        config.creationFeeBps = uint16(vm.envUint("CREATION_FEE_BPS"));
        config.settlementFeeBps = uint16(vm.envUint("SETTLEMENT_FEE_BPS"));
        config.proofSubmissionFee = vm.envUint("PROOF_SUBMISSION_FEE");
        config.setupDepositAmount = vm.envOr("SETUP_DEPOSIT_AMOUNT", uint256(0.00001 ether));
        config.resolutionRewardDepositAmount = vm.envOr("RESOLUTION_REWARD_DEPOSIT_AMOUNT", uint256(100 ether));
        config.challengeBondAmount = vm.envOr("CHALLENGE_BOND_AMOUNT", uint256(10 ether));
        config.withdrawalCooldown = uint64(vm.envUint("WITHDRAWAL_COOLDOWN"));
    }
}
