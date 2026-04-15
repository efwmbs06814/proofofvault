// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";

import {AgentStaking} from "../src/AgentStaking.sol";
import {CommitteeRegistry} from "../src/CommitteeRegistry.sol";
import {CompensationPool} from "../src/CompensationPool.sol";
import {FeeManager} from "../src/FeeManager.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {ProofOfVaultToken} from "../src/ProofOfVaultToken.sol";
import {ResolutionRegistry} from "../src/ResolutionRegistry.sol";
import {RewardPool} from "../src/RewardPool.sol";
import {TokenLockbox} from "../src/TokenLockbox.sol";
import {VaultEscrow} from "../src/VaultEscrow.sol";
import {VaultFactory} from "../src/VaultFactory.sol";

contract DeployProofOfVault is Script {
    struct DeployConfig {
        address owner;
        address treasury;
        address burnAddress;
        address stakeToken;
        bool deployPovToken;
        uint256 povInitialSupply;
        bool lockPovSupply;
        uint64 povUnlockAt;
        uint256 povLockedBps;
        address slasher;
        address orchestrator;
        address finalizer;
        address safetyCouncil;
        address wokb;
        address usdce;
        uint256 wokbCap;
        uint256 usdceCap;
        bool freezeCollateralPolicy;
        uint16 creationFeeBps;
        uint16 settlementFeeBps;
        uint256 proofSubmissionFee;
        uint256 setupDepositAmount;
        uint256 resolutionRewardDepositAmount;
        uint256 challengeBondAmount;
        uint64 withdrawalCooldown;
        uint64 disputeWindow;
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
            VaultFactory vaultFactory
        )
    {
        DeployConfig memory config = _loadConfig();
        if (config.lockPovSupply) {
            require(config.povLockedBps == 9_900, "beta requires 99% POV lock");
        }

        vm.startBroadcast();

        if (config.deployPovToken) {
            address initialTokenHolder = config.lockPovSupply ? config.owner : config.treasury;
            ProofOfVaultToken povToken = new ProofOfVaultToken(initialTokenHolder, config.povInitialSupply);
            config.stakeToken = address(povToken);
            if (config.lockPovSupply) {
                uint256 lockedAmount = (config.povInitialSupply * config.povLockedBps) / 10_000;
                TokenLockbox lockbox =
                    new TokenLockbox(config.owner, config.stakeToken, config.treasury, config.povUnlockAt);
                require(IERC20(config.stakeToken).transfer(address(lockbox), lockedAmount), "lock transfer failed");

                uint256 treasurySeedAmount = config.povInitialSupply - lockedAmount;
                if (treasurySeedAmount > 0 && config.treasury != config.owner) {
                    require(
                        IERC20(config.stakeToken).transfer(config.treasury, treasurySeedAmount),
                        "treasury transfer failed"
                    );
                }
            }
        }

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
        vaultFactory = new VaultFactory(
            config.owner,
            address(resolutionRegistry),
            address(vaultEscrow),
            address(agentStaking),
            address(feeManager),
            address(committeeRegistry),
            address(rewardPool),
            address(compensationPool),
            config.disputeWindow
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
        if (config.wokb != address(0)) {
            vaultFactory.setCollateralPolicy(config.wokb, true, config.wokbCap);
        }
        if (config.usdce != address(0)) {
            vaultFactory.setCollateralPolicy(config.usdce, true, config.usdceCap);
        }
        if (config.freezeCollateralPolicy) {
            require(config.wokb != address(0) || config.usdce != address(0), "freeze requires configured collateral");
            vaultFactory.freezeCollateralPolicy();
        }

        vm.stopBroadcast();
    }

    function _loadConfig() internal view returns (DeployConfig memory config) {
        config.owner = vm.envAddress("OWNER_ADDRESS");
        config.treasury = vm.envAddress("TREASURY_ADDRESS");
        config.burnAddress = vm.envAddress("BURN_ADDRESS");
        config.deployPovToken = vm.envOr("DEPLOY_POV_TOKEN", false);
        config.povInitialSupply = vm.envOr("POV_INITIAL_SUPPLY", uint256(1_000_000_000 ether));
        config.lockPovSupply = vm.envOr("LOCK_POV_SUPPLY", true);
        config.povUnlockAt = uint64(vm.envOr("POV_UNLOCK_AT", uint256(block.timestamp + 365 days)));
        config.povLockedBps = vm.envOr("POV_LOCKED_BPS", uint256(9_900));
        config.stakeToken = config.deployPovToken ? address(0) : vm.envAddress("STAKE_TOKEN_ADDRESS");
        config.slasher = vm.envAddress("SLASHER_ADDRESS");
        config.orchestrator = vm.envAddress("ORCHESTRATOR_ADDRESS");
        config.finalizer = vm.envAddress("FINALIZER_ADDRESS");
        config.safetyCouncil = vm.envAddress("SAFETY_COUNCIL_ADDRESS");
        config.wokb = vm.envOr("WOKB_ADDRESS", address(0));
        config.usdce = vm.envOr("USDCE_ADDRESS", address(0));
        config.wokbCap = vm.envOr("WOKB_CAP", uint256(10 ether));
        config.usdceCap = vm.envOr("USDCE_CAP", uint256(1_000_000_000));
        config.freezeCollateralPolicy = vm.envOr("FREEZE_COLLATERAL_POLICY", true);
        config.creationFeeBps = uint16(vm.envUint("CREATION_FEE_BPS"));
        config.settlementFeeBps = uint16(vm.envUint("SETTLEMENT_FEE_BPS"));
        config.proofSubmissionFee = vm.envUint("PROOF_SUBMISSION_FEE");
        config.setupDepositAmount = vm.envOr("SETUP_DEPOSIT_AMOUNT", uint256(0.00001 ether));
        config.resolutionRewardDepositAmount = vm.envOr("RESOLUTION_REWARD_DEPOSIT_AMOUNT", uint256(100 ether));
        config.challengeBondAmount = vm.envOr("CHALLENGE_BOND_AMOUNT", uint256(10 ether));
        config.withdrawalCooldown = uint64(vm.envUint("WITHDRAWAL_COOLDOWN"));
        config.disputeWindow = uint64(vm.envUint("DEFAULT_DISPUTE_WINDOW"));
    }
}
