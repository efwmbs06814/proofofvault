// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";

import {AgentStaking} from "../../src/AgentStaking.sol";
import {CommitteeRegistry} from "../../src/CommitteeRegistry.sol";
import {CompensationPool} from "../../src/CompensationPool.sol";
import {FeeManager} from "../../src/FeeManager.sol";
import {ResolutionRegistry} from "../../src/ResolutionRegistry.sol";
import {RewardPool} from "../../src/RewardPool.sol";
import {VaultEscrow} from "../../src/VaultEscrow.sol";
import {VaultFactoryLite} from "../../src/VaultFactoryLite.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {ProofOfVaultTypes} from "../../src/libraries/ProofOfVaultTypes.sol";

contract VaultFactoryLiteTest is Test {
    uint16 internal constant CREATION_FEE_BPS = 200;
    uint16 internal constant SETTLEMENT_FEE_BPS = 100;
    uint256 internal constant PROOF_FEE = 5 ether;
    uint64 internal constant WITHDRAWAL_COOLDOWN = 7 days;
    uint256 internal constant COLLATERAL_AMOUNT = 1_000 ether;
    uint256 internal constant AGENT_STAKE = 100 ether;
    uint256 internal constant SETUP_DEPOSIT_MINIMUM = 0.00001 ether;
    uint256 internal constant SETUP_DEPOSIT = 50 ether;
    uint256 internal constant RESOLUTION_REWARD_DEPOSIT = 100 ether;
    uint256 internal constant CHALLENGE_BOND = 10 ether;
    uint256 internal constant RULE_MAKER_BOND = 25 ether;
    uint256 internal constant RULE_VERIFIER_BOND = 20 ether;
    uint256 internal constant RESOLUTION_VALIDATOR_BOND = 30 ether;
    uint256 internal constant RESOLUTION_AUDITOR_BOND = 20 ether;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal burn = address(0x000000000000000000000000000000000000dEaD);
    address internal setter = makeAddr("setter");

    address internal makerOne = makeAddr("makerOne");
    address internal verifierOne = makeAddr("verifierOne");
    address internal validatorOne = makeAddr("validatorOne");
    address internal validatorTwo = makeAddr("validatorTwo");
    address internal auditorOne = makeAddr("auditorOne");

    MockERC20 internal collateralToken;
    MockERC20 internal stakingToken;
    FeeManager internal feeManager;
    AgentStaking internal agentStaking;
    CommitteeRegistry internal committeeRegistry;
    RewardPool internal rewardPool;
    CompensationPool internal compensationPool;
    ResolutionRegistry internal resolutionRegistry;
    VaultEscrow internal vaultEscrow;
    VaultFactoryLite internal vaultFactory;

    function setUp() public {
        collateralToken = new MockERC20("Collateral", "COL", 18);
        stakingToken = new MockERC20("Stake", "STK", 18);

        collateralToken.mint(setter, 10_000 ether);
        stakingToken.mint(setter, 10_000 ether);
        vm.deal(setter, 1_000 ether);

        address[5] memory agents = [makerOne, verifierOne, validatorOne, validatorTwo, auditorOne];
        for (uint256 i = 0; i < agents.length; ++i) {
            stakingToken.mint(agents[i], 10_000 ether);
        }

        vm.startPrank(owner);
        feeManager = new FeeManager(
            owner, treasury, burn, address(stakingToken), CREATION_FEE_BPS, SETTLEMENT_FEE_BPS, PROOF_FEE
        );
        agentStaking = new AgentStaking(owner, address(stakingToken), WITHDRAWAL_COOLDOWN);
        committeeRegistry = new CommitteeRegistry(owner);
        rewardPool = new RewardPool(owner, address(stakingToken), treasury);
        compensationPool = new CompensationPool(owner);
        resolutionRegistry = new ResolutionRegistry(owner);
        vaultEscrow = new VaultEscrow(owner);
        vaultFactory = new VaultFactoryLite(
            owner,
            address(resolutionRegistry),
            address(vaultEscrow),
            address(agentStaking),
            address(feeManager),
            address(committeeRegistry),
            address(rewardPool),
            address(compensationPool)
        );

        feeManager.setCollector(address(vaultFactory), true);
        feeManager.setV2DepositConfig(SETUP_DEPOSIT_MINIMUM, RESOLUTION_REWARD_DEPOSIT, CHALLENGE_BOND);
        feeManager.setV2BondConfig(
            RULE_MAKER_BOND, RULE_VERIFIER_BOND, RESOLUTION_VALIDATOR_BOND, RESOLUTION_AUDITOR_BOND
        );
        feeManager.setV2RewardConfig(
            8 ether, 4 ether, 6 ether, 4 ether, 6 ether, 2 ether, 4 ether, 6 ether, 5 ether, 2_500
        );
        feeManager.setRuleVerifierRewards(2 ether, 4 ether, 6 ether, 8 ether);

        agentStaking.setAuthorizedController(address(vaultFactory), true);
        agentStaking.setAuthorizedController(address(rewardPool), true);
        committeeRegistry.setAuthorizedController(address(vaultFactory), true);
        rewardPool.setAuthorizedController(address(vaultFactory), true);
        rewardPool.setRewardStakeSink(address(agentStaking), true);
        resolutionRegistry.setAuthorizedOrchestrator(address(vaultFactory), true);
        vaultEscrow.setAuthorizedController(address(vaultFactory), true);
        compensationPool.setAuthorizedNotifier(address(vaultEscrow), true);
        vm.stopPrank();

        vm.startPrank(setter);
        collateralToken.approve(address(vaultFactory), type(uint256).max);
        stakingToken.approve(address(rewardPool), type(uint256).max);
        vm.stopPrank();

        for (uint256 i = 0; i < agents.length; ++i) {
            vm.startPrank(agents[i]);
            stakingToken.approve(address(agentStaking), type(uint256).max);
            stakingToken.approve(address(feeManager), type(uint256).max);
            stakingToken.approve(address(rewardPool), type(uint256).max);
            vm.stopPrank();
        }

        _stakeAgents(_addressArray(makerOne, verifierOne, validatorOne, validatorTwo, auditorOne));
    }

    function test_revealRequiresCommitWindowToClose() public {
        uint256 vaultId = _createAndActivateVault();
        vm.warp(vaultFactory.getVault(vaultId).settlementTime + 1);

        _registerResolutionCommittee(vaultId, _addressArray(validatorOne), _addressArray(auditorOne), 1);

        bytes32 salt = keccak256("early-reveal-salt");
        bytes32 proofHash = keccak256("early-reveal-proof");
        _commit(vaultId, validatorOne, ProofOfVaultTypes.ResolutionOutcome.True, proofHash, salt);

        vm.prank(validatorOne);
        vm.expectRevert(VaultFactoryLite.NotReady.selector);
        vaultFactory.revealResolution(
            vaultId, ProofOfVaultTypes.ResolutionOutcome.True, proofHash, salt, "ipfs://early"
        );
    }

    function test_createVaultRequest_acceptsUserSelectedSetupDepositAboveMinimum() public {
        vm.prank(setter);
        vm.expectRevert(
            abi.encodeWithSelector(VaultFactoryLite.InvalidNativeDeposit.selector, 0, SETUP_DEPOSIT_MINIMUM)
        );
        vaultFactory.createVaultRequest(
            address(collateralToken), COLLATERAL_AMOUNT, uint64(block.timestamp + 7 days), "ipfs://request-no-okb"
        );

        vm.prank(setter);
        uint256 vaultId = vaultFactory.createVaultRequest{value: SETUP_DEPOSIT + 1}(
            address(collateralToken), COLLATERAL_AMOUNT, uint64(block.timestamp + 7 days), "ipfs://request-more-okb"
        );
        ProofOfVaultTypes.VaultRecord memory vault = vaultFactory.getVault(vaultId);
        assertEq(vault.setupDepositAmount, SETUP_DEPOSIT + 1);
        assertEq(rewardPool.vaultBalanceOf(vaultId).setupDepositBalance, SETUP_DEPOSIT + 1);
    }

    function test_finalizeRequiresChallengeWindowToClose() public {
        uint256 vaultId = _createAndActivateVault();
        vm.warp(vaultFactory.getVault(vaultId).settlementTime + 1);

        _registerResolutionCommittee(vaultId, _addressArray(validatorOne), _addressArray(auditorOne), 1);

        bytes32 salt = keccak256("finalize-window-salt");
        bytes32 proofHash = keccak256("finalize-window-proof");
        _commit(vaultId, validatorOne, ProofOfVaultTypes.ResolutionOutcome.True, proofHash, salt);

        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        vm.warp(config.commitDeadline + 1);
        _reveal(vaultId, validatorOne, ProofOfVaultTypes.ResolutionOutcome.True, proofHash, salt, "ipfs://reveal");

        vm.warp(config.revealDeadline + 1);
        _submitAudit(
            vaultId, auditorOne, validatorOne, ProofOfVaultTypes.AuditVerdict.Valid, keccak256("audit"), "ipfs://audit"
        );

        vm.prank(owner);
        vm.expectRevert(VaultFactoryLite.NotReady.selector);
        vaultFactory.finalizeV2Vault(vaultId);
    }

    function test_successfulChallengeExcludesValidatorFromFinalTally() public {
        uint256 vaultId = _createAndActivateVault();
        vm.warp(vaultFactory.getVault(vaultId).settlementTime + 1);

        _registerResolutionCommittee(vaultId, _addressArray(validatorOne, validatorTwo), _addressArray(auditorOne), 2);

        bytes32 saltOne = keccak256("challenge-salt-one");
        bytes32 saltTwo = keccak256("challenge-salt-two");
        bytes32 proofOne = keccak256("challenge-proof-one");
        bytes32 proofTwo = keccak256("challenge-proof-two");
        _commit(vaultId, validatorOne, ProofOfVaultTypes.ResolutionOutcome.True, proofOne, saltOne);
        _commit(vaultId, validatorTwo, ProofOfVaultTypes.ResolutionOutcome.True, proofTwo, saltTwo);

        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        vm.warp(config.commitDeadline + 1);
        _reveal(vaultId, validatorOne, ProofOfVaultTypes.ResolutionOutcome.True, proofOne, saltOne, "ipfs://reveal-1");
        _reveal(vaultId, validatorTwo, ProofOfVaultTypes.ResolutionOutcome.True, proofTwo, saltTwo, "ipfs://reveal-2");

        vm.warp(config.revealDeadline + 1);
        _submitAudit(
            vaultId,
            auditorOne,
            validatorOne,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("audit-1"),
            "ipfs://audit-1"
        );
        _submitAudit(
            vaultId,
            auditorOne,
            validatorTwo,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("audit-2"),
            "ipfs://audit-2"
        );

        vm.warp(config.auditDeadline + 1);
        vm.prank(setter);
        uint256 challengeId = vaultFactory.openPublicChallenge(
            vaultId, validatorOne, keccak256("challenge-success"), "ipfs://challenge-success"
        );

        vm.prank(owner);
        vaultFactory.resolveChallenge(
            vaultId,
            challengeId,
            true,
            ProofOfVaultTypes.CommitteeRole.ResolutionValidator,
            ProofOfVaultTypes.SlashReasonCode.InvalidProof,
            0
        );

        vm.warp(config.challengeDeadline + 1);
        vm.prank(owner);
        vaultFactory.finalizeV2Vault(vaultId);

        ProofOfVaultTypes.VaultRecord memory vault = vaultFactory.getVault(vaultId);
        assertEq(uint8(vault.status), uint8(ProofOfVaultTypes.VaultStatus.ResolvedInvalid));
    }

    function _createAndActivateVault() internal returns (uint256 vaultId) {
        vm.prank(setter);
        vaultId = vaultFactory.createVaultRequest{value: SETUP_DEPOSIT}(
            address(collateralToken), COLLATERAL_AMOUNT, uint64(block.timestamp + 7 days), "ipfs://request"
        );

        vm.prank(owner);
        vaultFactory.registerRuleCommittee(
            vaultId,
            _addressArray(makerOne),
            _addressArray(verifierOne),
            uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 2 hours)
        );

        vm.prank(makerOne);
        vaultFactory.submitRuleDraft(vaultId, keccak256("draft"), "ipfs://draft");

        vm.prank(verifierOne);
        vaultFactory.submitRuleIssue(vaultId, ProofOfVaultTypes.IssueSeverity.High, keccak256("issue"), "ipfs://issue");

        vm.warp(block.timestamp + 2 hours + 1);
        vm.prank(owner);
        vaultFactory.finalizeRuleSet(
            vaultId,
            keccak256("criteria"),
            "ipfs://criteria",
            _emptyAddressArray(),
            _emptyAddressArray(),
            _emptyAddressArray(),
            _emptyAddressArray()
        );

        vm.prank(setter);
        vaultFactory.acceptRuleSetAndFund(vaultId);
    }

    function _registerResolutionCommittee(
        uint256 vaultId,
        address[] memory validators,
        address[] memory auditors,
        uint8 minValidCount
    ) internal {
        vm.prank(owner);
        vaultFactory.registerResolutionCommittee(
            vaultId,
            validators,
            auditors,
            uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 2 hours),
            uint64(block.timestamp + 3 hours),
            uint64(block.timestamp + 4 hours),
            minValidCount
        );
    }

    function _commit(
        uint256 vaultId,
        address validator,
        ProofOfVaultTypes.ResolutionOutcome outcome,
        bytes32 proofHash,
        bytes32 salt
    ) internal {
        bytes32 commitHash = keccak256(abi.encode(vaultId, validator, outcome, proofHash, salt));
        vm.prank(validator);
        vaultFactory.commitResolution(vaultId, commitHash);
    }

    function _reveal(
        uint256 vaultId,
        address validator,
        ProofOfVaultTypes.ResolutionOutcome outcome,
        bytes32 proofHash,
        bytes32 salt,
        string memory payloadURI
    ) internal {
        vm.prank(validator);
        vaultFactory.revealResolution(vaultId, outcome, proofHash, salt, payloadURI);
    }

    function _submitAudit(
        uint256 vaultId,
        address auditor,
        address validator,
        ProofOfVaultTypes.AuditVerdict verdict,
        bytes32 verdictHash,
        string memory payloadURI
    ) internal {
        vm.prank(auditor);
        vaultFactory.submitAuditVerdict(vaultId, validator, verdict, verdictHash, payloadURI);
    }

    function _stakeAgents(address[] memory agents) internal {
        for (uint256 i = 0; i < agents.length; ++i) {
            vm.prank(agents[i]);
            agentStaking.stakeForAgent(AGENT_STAKE);
        }
    }

    function _addressArray(address accountOne) internal pure returns (address[] memory accounts) {
        accounts = new address[](1);
        accounts[0] = accountOne;
    }

    function _addressArray(address accountOne, address accountTwo) internal pure returns (address[] memory accounts) {
        accounts = new address[](2);
        accounts[0] = accountOne;
        accounts[1] = accountTwo;
    }

    function _addressArray(address accountOne, address accountTwo, address accountThree)
        internal
        pure
        returns (address[] memory accounts)
    {
        accounts = new address[](3);
        accounts[0] = accountOne;
        accounts[1] = accountTwo;
        accounts[2] = accountThree;
    }

    function _addressArray(
        address accountOne,
        address accountTwo,
        address accountThree,
        address accountFour,
        address accountFive
    ) internal pure returns (address[] memory accounts) {
        accounts = new address[](5);
        accounts[0] = accountOne;
        accounts[1] = accountTwo;
        accounts[2] = accountThree;
        accounts[3] = accountFour;
        accounts[4] = accountFive;
    }

    function _emptyAddressArray() internal pure returns (address[] memory accounts) {
        accounts = new address[](0);
    }
}
