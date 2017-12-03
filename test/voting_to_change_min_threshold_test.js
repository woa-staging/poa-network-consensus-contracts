let PoaNetworkConsensusMock = artifacts.require('./PoaNetworkConsensusMock');
let KeysManagerMock = artifacts.require('./KeysManagerMock');
let Voting = artifacts.require('./VotingToChangeMinThresholdMock');
let VotingForKeys = artifacts.require('./VotingToChangeKeysMock');
let BallotsStorage = artifacts.require('./BallotsStorageMock');
const ERROR_MSG = 'VM Exception while processing transaction: revert';
const moment = require('moment');

const choice = {
  accept: 1,
  reject: 2
}
require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(web3.BigNumber))
  .should();

let keysManager, poaNetworkConsensusMock, ballotsStorage, voting;
let votingKey, votingKey2, votingKey3;
contract('VotingToChangeMinThreshold [all features]', function (accounts) {
  votingKey = accounts[2];
  beforeEach(async () => {
    poaNetworkConsensusMock = await PoaNetworkConsensusMock.new(accounts[0]);
    keysManager = await KeysManagerMock.new(accounts[0], accounts[0], poaNetworkConsensusMock.address);
    ballotsStorage = await BallotsStorage.new(accounts[0]);
    voting = await Voting.new(keysManager.address, ballotsStorage.address);
    await poaNetworkConsensusMock.setKeysManagerMock(keysManager.address);
    await ballotsStorage.setVotingToChangeThresholdMock(voting.address);
  })
  describe('#createBallotToChangeThreshold', async () => {
    let VOTING_START_DATE, VOTING_END_DATE, id;
    beforeEach(async () => {
      await keysManager.setVotingContractMock(accounts[0]);
      await keysManager.addMiningKey(accounts[1]).should.be.fulfilled;
      await keysManager.addVotingKey(votingKey, accounts[1]).should.be.fulfilled;
      VOTING_START_DATE = moment.utc().add(2, 'seconds').unix();
      VOTING_END_DATE = moment.utc().add(30, 'years').unix();
      id = await voting.nextBallotId();
    })
    it('happy path', async () => {
      const {logs} = await voting.createBallotToChangeThreshold(VOTING_START_DATE, VOTING_END_DATE, 4, {from: votingKey});
      const startTime = await voting.getStartTime(id.toNumber());
      const endTime = await voting.getEndTime(id.toNumber());
      const keysManagerFromContract = await voting.keysManager();

      startTime.should.be.bignumber.equal(VOTING_START_DATE);
      endTime.should.be.bignumber.equal(VOTING_END_DATE);
      keysManagerFromContract.should.be.equal(keysManager.address);
      logs[0].event.should.be.equal("BallotCreated");
      logs[0].args.id.should.be.bignumber.equal(0);
      logs[0].args.creator.should.be.equal(votingKey);
    })
    it('proposed value should be more than or equal to 3', async () => {
      await voting.createBallotToChangeThreshold(VOTING_START_DATE, VOTING_END_DATE, 2, {from: votingKey}).should.be.fulfilled.rejectedWith(ERROR_MSG);
    })
    it('proposed value should not be equal to the same value', async () => {
      await voting.createBallotToChangeThreshold(VOTING_START_DATE, VOTING_END_DATE, 3, {from: votingKey}).should.be.fulfilled.rejectedWith(ERROR_MSG);
    })
  })

  describe('#vote', async() => {
    let VOTING_START_DATE, VOTING_END_DATE;
    let id;
    beforeEach(async ()=> {
      VOTING_START_DATE = moment.utc().add(2, 'seconds').unix();
      VOTING_END_DATE = moment.utc().add(30, 'years').unix();
      await keysManager.setVotingContractMock(accounts[0]);
      await keysManager.addMiningKey(accounts[1]).should.be.fulfilled;
      await keysManager.addVotingKey(votingKey, accounts[1]).should.be.fulfilled;
      id = await voting.nextBallotId();
      await voting.createBallotToChangeThreshold(VOTING_START_DATE, VOTING_END_DATE, 5, {from: votingKey});
    })

    it('should let a validator to vote', async () => {
      await voting.setTime(VOTING_START_DATE);
      const {logs} = await voting.vote(id, choice.accept, {from: votingKey}).should.be.fulfilled;
      let progress = await voting.getProgress(id);
      progress.should.be.bignumber.equal(1);
      let totalVoters = await voting.getTotalVoters(id);
      totalVoters.should.be.bignumber.equal(1);
      logs[0].event.should.be.equal('Vote');
      logs[0].args.decision.should.be.bignumber.equal(1);
      logs[0].args.voter.should.be.equal(votingKey);
      logs[0].args.time.should.be.bignumber.equal(VOTING_START_DATE);
    })
    it('reject vote should be accepted', async () => {
      await voting.setTime(VOTING_START_DATE);
      const {logs} = await voting.vote(id, choice.reject, {from: votingKey}).should.be.fulfilled;
      let progress = await voting.getProgress(id);
      progress.should.be.bignumber.equal(-1);
      let totalVoters = await voting.getTotalVoters(id);
      totalVoters.should.be.bignumber.equal(1);
      logs[0].event.should.be.equal('Vote');
      logs[0].args.decision.should.be.bignumber.equal(2);
      logs[0].args.voter.should.be.equal(votingKey);
      logs[0].args.time.should.be.bignumber.equal(VOTING_START_DATE);
    })

    it('should allow multiple voters to vote', async () => {
      await voting.setTime(VOTING_START_DATE);
      await voting.vote(id, choice.reject, {from: votingKey}).should.be.fulfilled;
      await keysManager.addVotingKey(accounts[3], accounts[1]).should.be.fulfilled;
      await voting.vote(id, choice.reject, {from: accounts[3]}).should.be.rejectedWith(ERROR_MSG);

      // add new voter
      await keysManager.addMiningKey(accounts[2]).should.be.fulfilled;
      await keysManager.addVotingKey(accounts[4], accounts[2]).should.be.fulfilled;
      await voting.vote(id, choice.reject, {from: accounts[4]}).should.be.fulfilled;

      let progress = await voting.getProgress(id);
      progress.should.be.bignumber.equal(-2);

      let totalVoters = await voting.getTotalVoters(id);
      totalVoters.should.be.bignumber.equal(2);

      await keysManager.addMiningKey(accounts[3]).should.be.fulfilled;
      await keysManager.addVotingKey(accounts[5], accounts[3]).should.be.fulfilled;
      await voting.vote(id, choice.accept, {from: accounts[5]}).should.be.fulfilled;

      progress = await voting.getProgress(id);
      progress.should.be.bignumber.equal(-1);

      totalVoters = await voting.getTotalVoters(id);
      totalVoters.should.be.bignumber.equal(3);
    })
    it('should not let vote nonVoting key', async () => {
      await voting.setTime(VOTING_START_DATE);
      await voting.vote(id, choice.reject, {from: accounts[0]}).should.be.rejectedWith(ERROR_MSG);
    })
    it('should not let vote before startTime key', async () => {
      await voting.setTime(VOTING_START_DATE - 1);
      await voting.vote(id, choice.reject, {from: votingKey}).should.be.rejectedWith(ERROR_MSG);
    })
    it('should not let vote after endTime key', async () => {
      await voting.setTime(VOTING_END_DATE + 1);
      await voting.vote(id, choice.reject, {from: votingKey}).should.be.rejectedWith(ERROR_MSG);
    })
    it('should not let vote with already voted key', async () => {
      await voting.setTime(VOTING_END_DATE);
      await voting.vote(id, choice.reject, {from: votingKey}).should.be.fulfilled;
      await voting.vote(id, choice.reject, {from: votingKey}).should.be.rejectedWith(ERROR_MSG);
    })
    it('should not let vote with invalid choice', async () => {
      await voting.setTime(VOTING_END_DATE);
      await voting.vote(id, 0, {from: votingKey}).should.be.rejectedWith(ERROR_MSG);
      await voting.vote(id, 3, {from: votingKey}).should.be.rejectedWith(ERROR_MSG);
    })
    it('should not let vote with invalid id', async () => {
      await voting.setTime(VOTING_END_DATE);
      await voting.vote(99, 1, {from: votingKey}).should.be.rejectedWith(ERROR_MSG);
      await voting.vote(-3, 1, {from: votingKey}).should.be.rejectedWith(ERROR_MSG);
    })
  })

  describe('#finalize', async() => {
    let votingId;
    votingKey  = accounts[2];
    votingKey2 = accounts[3];
    votingKey3 = accounts[5];
    let payoutKeyToAdd = accounts[0];
    beforeEach(async () => {
      VOTING_START_DATE = moment.utc().add(2, 'seconds').unix();
      VOTING_END_DATE = moment.utc().add(30, 'years').unix();
      await keysManager.setVotingContractMock(accounts[0]);
      await keysManager.addMiningKey(accounts[1]).should.be.fulfilled;
      await keysManager.addVotingKey(votingKey, accounts[1]).should.be.fulfilled;

      await keysManager.addMiningKey(accounts[2]).should.be.fulfilled;
      await keysManager.addVotingKey(votingKey2, accounts[2]).should.be.fulfilled;

      await keysManager.addMiningKey(accounts[4]).should.be.fulfilled;
      await keysManager.addVotingKey(votingKey3, accounts[4]).should.be.fulfilled;
      await keysManager.setVotingContractMock(voting.address);
      
    })
    it('doesnot change if it did not pass minimum threshold', async () => {
      let proposedValue = 5;
      votingId = await voting.nextBallotId();
      await voting.createBallotToChangeThreshold(VOTING_START_DATE, VOTING_END_DATE, proposedValue, {from: votingKey});
      await voting.setTime(VOTING_START_DATE);
      await voting.vote(votingId, choice.accept, {from: votingKey}).should.be.fulfilled;
      // await voting.vote(votingId, choice.accept, {from: votingKey2}).should.be.fulfilled;
      await voting.setTime(VOTING_END_DATE + 1);
      const {logs} = await voting.finalize(votingId, {from: votingKey}).should.be.fulfilled;
      activeBallotsLength = await voting.activeBallotsLength();
      activeBallotsLength.should.be.bignumber.equal(0);
      true.should.be.equal(await voting.getIsFinalized(votingId));
      // Finalized(msg.sender);
      logs[0].event.should.be.equal("BallotFinalized");
      logs[0].args.voter.should.be.equal(votingKey);

      const votingState = await voting.votingState(votingId);
      
      votingState.should.be.deep.equal(
        [
          new web3.BigNumber(VOTING_START_DATE), //uint256 startTime;
          new web3.BigNumber(VOTING_END_DATE), //uint256 endTime
          new web3.BigNumber(1),  //uint256 totalVoters
          new web3.BigNumber(1), //int progress
          true,                   //bool isFinalized
          new web3.BigNumber(3),  //uint8 quorumState
          new web3.BigNumber(0),  //uint256 index
          new web3.BigNumber(3),   //uint256 minThresholdOfVoters
          new web3.BigNumber(proposedValue) // uint256 proposedValue

        ]
      )
      true.should.be.equal(
        await voting.hasAlreadyVoted(votingId, votingKey)
      );

      const minThresholdOfVoters = await ballotsStorage.minThresholdOfVoters();
      minThresholdOfVoters.should.be.bignumber.equal(3);

    });

    it('should change to proposedValue when quorum is reached', async () => {
      let proposedValue = 5;
      votingId = await voting.nextBallotId();
      await voting.createBallotToChangeThreshold(VOTING_START_DATE, VOTING_END_DATE, proposedValue, {from: votingKey});
      await voting.setTime(VOTING_START_DATE);
      await voting.vote(votingId, choice.accept, {from: votingKey}).should.be.fulfilled;
      await voting.vote(votingId, choice.accept, {from: votingKey}).should.be.rejectedWith(ERROR_MSG);
      await voting.vote(votingId, choice.accept, {from: votingKey2}).should.be.fulfilled;
      await voting.vote(votingId, choice.reject, {from: votingKey3}).should.be.fulfilled;
      await voting.setTime(VOTING_END_DATE + 1);
      const {logs} = await voting.finalize(votingId, {from: votingKey}).should.be.fulfilled;

      activeBallotsLength = await voting.activeBallotsLength();
      activeBallotsLength.should.be.bignumber.equal(0);
      true.should.be.equal(await voting.getIsFinalized(votingId));
      // Finalized(msg.sender);
      logs[0].event.should.be.equal("BallotFinalized");
      logs[0].args.voter.should.be.equal(votingKey);

      const votingState = await voting.votingState(votingId);
      votingState.should.be.deep.equal(
        [
          new web3.BigNumber(VOTING_START_DATE), //uint256 startTime;
          new web3.BigNumber(VOTING_END_DATE), //uint256 endTime
          new web3.BigNumber(3),  //uint256 totalVoters
          new web3.BigNumber(1), //int progress
          true,                   //bool isFinalized
          new web3.BigNumber(2),  //uint8 quorumState
          new web3.BigNumber(0),  //uint256 index
          new web3.BigNumber(3),   //uint256 minThresholdOfVoters
          new web3.BigNumber(proposedValue) // uint256 proposedValue

        ]
      )
      true.should.be.equal(
        await voting.hasAlreadyVoted(votingId, votingKey)
      );
      true.should.be.equal(
        await voting.hasAlreadyVoted(votingId, votingKey2)
      );
      true.should.be.equal(
        await voting.hasAlreadyVoted(votingId, votingKey3)
      );

      const minThresholdOfVoters = await ballotsStorage.minThresholdOfVoters();
      minThresholdOfVoters.should.be.bignumber.equal(proposedValue);
      let votingForKeys = await VotingForKeys.new(keysManager.address, ballotsStorage.address);
      let nextId = await votingForKeys.nextBallotId();
      await votingForKeys.createVotingForKeys(VOTING_START_DATE, VOTING_END_DATE, accounts[5], 3, accounts[1], 1, {from: votingKey});
      const minThresholdVotingForKeys = await votingForKeys.getMinThresholdOfVoters(nextId);
      minThresholdVotingForKeys.should.be.bignumber.equal(proposedValue);
    })

  })
})