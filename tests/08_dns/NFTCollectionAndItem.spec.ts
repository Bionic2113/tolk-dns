import { Blockchain, SandboxContract, TreasuryContract, Treasury, loadConfig, updateConfig } from '@ton/sandbox';
import {
    Address,
    beginCell,
    Cell,
    comment,
    SendMode,
    toNano,
    Dictionary,
    Slice,
    DictionaryValue,
    contractAddress,
    StateInit,
} from '@ton/core';
import { NFTCollection, aliceIndex } from '../../wrappers/08_dns/NFTCollection';
import { NFTItem, CONTENT, EDITED_CONTENT, CONTENT_WITH_WALLET } from '../../wrappers/08_dns/NFTItem';
import '@ton/test-utils';
import { randomAddress } from '@ton/test-utils';
import { activateTVM11, myCompile } from '../my-compile';
import { GasLogAndSave } from '../gas-logger';
import { userInfo } from 'node:os';

const numericFolder = '08_dns';
const MONTH = 2592000;

describe(numericFolder, () => {
    let GAS_LOG = new GasLogAndSave(numericFolder);
    let nftItemCode: Cell;
    let nftCollectionCode: Cell;

    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let nftCollection: SandboxContract<NFTCollection>;

    const royaltyParams = {
        numerator: 16,
        denominator: 2,
        royaltyAddress: randomAddress(),
    };

    async function nftFixture(nftOwner: Treasury, itemBody: Cell) {
        const nftDeployResult = await nftCollection.sendDeployNft(nftOwner, {
            body: itemBody,
            value: toNano('1000'),
        });

        expect(nftDeployResult.transactions).toHaveTransaction({
            from: nftOwner.address,
            to: nftCollection.address,
            success: true,
        });

        const nftAddress = await nftCollection.getNftAddressByIndex(aliceIndex);

        expect(nftDeployResult.transactions).toHaveTransaction({
            from: nftCollection.address,
            to: nftAddress,
            deploy: true,
            success: true,
        });

        return blockchain.openContract(NFTItem.createFromAddress(nftAddress));
    }

    beforeAll(async () => {
        nftItemCode = await myCompile(numericFolder, 'NFTItem');
        nftCollectionCode = await myCompile(numericFolder, 'NFTCollection');
        GAS_LOG.rememberBocSize('nft-item', nftItemCode);
        GAS_LOG.rememberBocSize('nft-collection', nftCollectionCode);
    });

    afterAll(() => {
        GAS_LOG.saveCurrentRunAfterAll();
    });

    describe('NFTItem', () => {
        beforeEach(async () => {
            blockchain = await Blockchain.create();
            activateTVM11(blockchain);
            blockchain.now = 1659171600 + 1;

            owner = await blockchain.treasury('owner');

            nftCollection = blockchain.openContract(
                NFTCollection.createFromConfig(
                    {
                        nftItemCode: nftItemCode,
                        content: beginCell()
                            .storeUint(1, 8)
                            .storeStringTail('https://ton.org/collection.json')
                            .endCell(),
                    },
                    nftCollectionCode,
                ),
            );

            const deployResult = await nftCollection.sendDeploy(owner.getSender(), {
                value: toNano('1000'),
                queryId: 0,
                name: 'gram',
            });

            expect(deployResult.transactions).toHaveTransaction({
                from: owner.address,
                to: nftCollection.address,
                deploy: true,
                success: true,
            });
        });

        it('should deploy', async () => {
            const nftOwner = await blockchain.treasury('nft-owner');
            await nftFixture(
                nftOwner.getSender(),
                beginCell().storeUint(NFTCollection.OPCODES.DEPLOY_NFT, 32).storeStringTail('alice').endCell(),
            );
        });

        it('should transfer ownership', async () => {
            const nftOwner = await blockchain.treasury('nft-owner');
            const nftReceiverAddress = randomAddress();

            const nftItem = blockchain.openContract(
                NFTItem.createFromConfig(
                    {
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        ownerAddress: nftOwner.address,
                        domain: 'alice',
                        lastFillUpTime: BigInt(blockchain.now!),
                    },
                    nftItemCode,
                ),
            );

            await nftItem.sendDeploy(nftOwner.getSender(), {
                value: toNano('1000'),
            });

            const { ownerAddress: ownerBeforeTransfer } = await nftItem.getNftData();

            expect(ownerBeforeTransfer).toEqualAddress(nftOwner.address);

            const forwardAmount = toNano('0.5');
            const queryId = 123;

            const result = await nftItem.sendTransferOwnership(nftOwner.getSender(), {
                value: toNano('0.05'),
                to: nftReceiverAddress,
                queryId: queryId,
                forwardAmount: forwardAmount,
            });

            expect(result.transactions).toHaveTransaction({
                from: ownerBeforeTransfer!,
                to: nftItem.address,
                op: NFTItem.OPCODES.TRANSFER,
                success: true,
            });

            expect(result.transactions).toHaveTransaction({
                from: nftItem.address,
                to: nftReceiverAddress,
                value: forwardAmount,
                mode: SendMode.PAY_GAS_SEPARATELY,
                body: beginCell()
                    .storeUint(NFTItem.OPCODES.OWNERSHIP_ASSIGNED, 32)
                    .storeUint(queryId, 64)
                    .storeAddress(nftOwner.address)
                    .storeUint(0, 1)
                    .endCell(),
            });

            const { ownerAddress: ownerAfterTransfer } = await nftItem.getNftData();

            expect(ownerAfterTransfer).toEqualAddress(nftReceiverAddress);
        });

        it('should item loss', async () => {
            // blockchain.now = 1659171600;
            const nftOwner = await blockchain.treasury('nft-owner');

            const nftItem = blockchain.openContract(
                NFTItem.createFromConfig(
                    {
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        ownerAddress: nftOwner.address,
                        domain: 'alice',
                        lastFillUpTime: BigInt(blockchain.now!) - BigInt('31622400') - BigInt(1),
                    },
                    nftItemCode,
                ),
            );

            await nftItem.sendDeploy(nftOwner.getSender(), {
                value: toNano('1000'),
            });

            blockchain.now! += 31622400 + 1;
            const queryId = BigInt(123);
            const op = 0x4ed14b65;

            const result = await nftItem.sendDeploy(nftOwner.getSender(), {
                value: toNano('20000'),
                op: op,
                queryId: queryId,
            });

            expect(result.transactions).toHaveTransaction({
                from: nftItem.address,
                to: nftOwner.address,
                value: (x) => {
                    return x ? toNano('1000') > x && x > toNano('998') : false;
                },
                mode: SendMode.IGNORE_ERRORS,
                body: beginCell().storeUint(op, 32).storeUint(queryId, 64).endCell(),
            });
        });

        it('should item get', async () => {
            const nftOwner = await blockchain.treasury('nft-owner');

            const nftItem = blockchain.openContract(
                NFTItem.createFromConfig(
                    {
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        ownerAddress: nftOwner.address,
                        content: CONTENT(),
                        domain: 'alice',
                        lastFillUpTime: BigInt(blockchain.now!) + BigInt(1),
                    },
                    nftItemCode,
                ),
            );

            await nftItem.sendDeploy(nftOwner.getSender(), {
                value: toNano('1000'),
            });

            const result = await nftItem.getResolveDNS(
                beginCell().storeUint(0, 8).endCell().beginParse(),
                BigInt('0x82a3537ff0dbce7eec35d69edc3a189ee6f17d82f353a553f9aa96cb0be3ce89'),
            );

            expect(result.index).toEqual(8);
            expect(result.domain).toEqualCell(beginCell().storeUint(0, 8).storeStringTail('alice.ton').endCell());
        });

        it('should get static data', async () => {
            const nftOwner = await blockchain.treasury('nft-owner');
            const someUser = await blockchain.treasury('some-user');

            const nftItem = blockchain.openContract(
                NFTItem.createFromConfig(
                    {
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        ownerAddress: nftOwner.address,
                        domain: 'alice',
                        lastFillUpTime: BigInt(blockchain.now!),
                    },
                    nftItemCode,
                ),
            );

            await nftItem.sendDeploy(nftOwner.getSender(), {
                value: toNano('1000'),
            });

            const result = await nftItem.sendDeploy(someUser.getSender(), {
                value: toNano('1'),
                op: NFTItem.OPCODES.GET_STATIC_DATA,
                queryId: BigInt(123),
            });

            expect(result.transactions).toHaveTransaction({
                to: someUser.address,
                from: nftItem.address,
                mode: 64,
                body: beginCell()
                    .storeUint(0x8b771735, 32)
                    .storeUint(123, 64)
                    .storeUint(aliceIndex, 256)
                    .storeAddress(nftCollection.address)
                    .endCell(),
            });
        });

        it('should item finish auction change content', async () => {
            const nftOwner = await blockchain.treasury('nft-owner');
            const someUser = await blockchain.treasury('some-user');

            const nftItem = blockchain.openContract(
                NFTItem.createFromConfig(
                    {
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        domain: 'alice',
                        auction: beginCell()
                            .storeAddress(nftOwner.address)
                            .storeCoins(toNano('1000'))
                            .storeUint(blockchain.now!, 64)
                            .endCell(),
                        lastFillUpTime: BigInt(blockchain.now!),
                    },
                    nftItemCode,
                ),
            );

            await nftItem.sendDeploy(nftOwner.getSender(), {
                value: toNano('1000'),
                op: 1,
                bounce: false,
            });

            blockchain.now! += 1;

            const result = await nftItem.sendDeploy(nftOwner.getSender(), {
                value: toNano('1'),
                op: 0x1a0b9d51,
                queryId: BigInt(1),
                content: EDITED_CONTENT(),
            });

            expect(result.transactions).toHaveTransaction({
                to: nftCollection.address,
                from: nftItem.address,
                mode: 2,
                body: beginCell().storeUint(0x370fec51, 32).storeUint(1, 64).endCell(),
            });

            const result_2 = await nftItem.sendDeploy(someUser.getSender(), {
                value: toNano('1'),
                op: 0x1a0b9d51,
                queryId: BigInt(1),
                content: EDITED_CONTENT(),
            });

            expect(result_2.transactions).toHaveTransaction({
                exitCode: 410,
            });
        });

        it('should item fill up', async () => {
            const nftOwner = await blockchain.treasury('nft-owner');
            const someUser = await blockchain.treasury('some-user');

            const nftItem = blockchain.openContract(
                NFTItem.createFromConfig(
                    {
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        ownerAddress: nftOwner.address,
                        domain: 'alice',
                        lastFillUpTime: BigInt(blockchain.now!),
                    },
                    nftItemCode,
                ),
            );

            blockchain.now! += 123000;

            const result = await nftItem.sendDeploy(nftOwner.getSender(), {
                value: toNano('1000'),
            });

            const contract = await blockchain.getContract(nftItem.address);
            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(
                    NFTItem.configToCell({
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        ownerAddress: nftOwner.address,
                        domain: 'alice',
                        lastFillUpTime: BigInt(blockchain.now!),
                    }),
                );
            }

            expect(result.transactions).toHaveTransaction({
                to: nftItem.address,
                from: nftOwner.address,
                success: true,
            });

            const result_2 = await nftItem.sendDeploy(someUser.getSender(), {
                value: toNano('1000'),
            });

            expect(result_2.transactions).toHaveTransaction({
                exitCode: 406,
            });
        });

        it('should item edit record', async () => {
            const nftOwner = await blockchain.treasury('nft-owner');
            const someUser = await blockchain.treasury('some-user');

            const nftItem = blockchain.openContract(
                NFTItem.createFromConfig(
                    {
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        ownerAddress: nftOwner.address,
                        domain: 'alice',
                        content: CONTENT(),
                        lastFillUpTime: BigInt(blockchain.now!),
                    },
                    nftItemCode,
                ),
            );

            await nftItem.sendDeploy(nftOwner.getSender(), {
                value: toNano('1000'),
                op: 1,
                bounce: false,
            });

            const body = beginCell()
                .storeUint(0x4eb1f0f9, 32)
                .storeUint(123, 64)
                .storeUint(BigInt('0xe8d44050873dba865aa7c170ab4cce64d90839a34dcfd6cf71d14e0205443b1b'), 256)
                .storeRef(
                    beginCell()
                        .storeUint(0x9fd3, 16)
                        .storeAddress(Address.parse('EQA0i8-CdGnF_DhUHHf92R1ONH6sIA9vLZ_WLcCIhfBBXwtG'))
                        .storeUint(0, 1)
                        .endCell(),
                )
                .endCell();

            const result = await nftItem.sendAnyBody(nftOwner.getSender(), toNano('1'), body);

            const contract = await blockchain.getContract(nftItem.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(
                    NFTItem.configToCell({
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        ownerAddress: nftOwner.address,
                        domain: 'alice',
                        content: CONTENT_WITH_WALLET(),
                        lastFillUpTime: BigInt(blockchain.now!),
                    }),
                );
            }

            expect(result.transactions).toHaveTransaction({
                to: nftItem.address,
                from: nftOwner.address,
                success: true,
            });

            const result_2 = await nftItem.sendAnyBody(someUser.getSender(), toNano('1000'), body);

            expect(result_2.transactions).toHaveTransaction({
                exitCode: 411,
            });
        });

        it('should item delete record', async () => {
            const nftOwner = await blockchain.treasury('nft-owner');

            const nftItem = blockchain.openContract(
                NFTItem.createFromConfig(
                    {
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        ownerAddress: nftOwner.address,
                        domain: 'alice',
                        content: CONTENT_WITH_WALLET(),
                        lastFillUpTime: BigInt(blockchain.now!),
                    },
                    nftItemCode,
                ),
            );

            await nftItem.sendDeploy(nftOwner.getSender(), {
                value: toNano('1000'),
                op: 1,
                bounce: false,
            });

            const body = beginCell()
                .storeUint(0x4eb1f0f9, 32)
                .storeUint(123, 64)
                .storeUint(BigInt('0xe8d44050873dba865aa7c170ab4cce64d90839a34dcfd6cf71d14e0205443b1b'), 256)
                .endCell();

            const result = await nftItem.sendAnyBody(nftOwner.getSender(), toNano('1'), body);

            const contract = await blockchain.getContract(nftItem.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(
                    NFTItem.configToCell({
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        ownerAddress: nftOwner.address,
                        domain: 'alice',
                        content: CONTENT(),
                        lastFillUpTime: BigInt(blockchain.now!),
                    }),
                );
            }

            expect(result.transactions).toHaveTransaction({
                to: nftItem.address,
                from: nftOwner.address,
                success: true,
            });
        });

        it('item config', async () => {
            const configDict = Dictionary.loadDirect(
                Dictionary.Keys.Int(32),
                Dictionary.Values.Cell(),
                blockchain.config,
            );

            const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Uint(8));
            dict.set(aliceIndex, 1);

            configDict.set(80, beginCell().storeDict(dict).endCell());

            blockchain.setConfig(beginCell().storeDictDirect(configDict).endCell());

            const nftOwner = await blockchain.treasury('nft-owner');
            const someUser = await blockchain.treasury('some-user');

            const nftItem = blockchain.openContract(
                NFTItem.createFromConfig(
                    {
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        ownerAddress: nftOwner.address,
                        domain: 'alice',
                        lastFillUpTime: BigInt(blockchain.now!),
                    },
                    nftItemCode,
                ),
            );

            await nftItem.sendDeploy(nftOwner.getSender(), {
                value: toNano('1000'),
                op: 1,
                bounce: false,
            });

            const result = await nftItem.sendDeploy(someUser.getSender(), {
                value: toNano('1'),
                op: 0x44beae41,
                queryId: BigInt(123),
            });

            expect(result.transactions).toHaveTransaction({
                to: nftCollection.address,
                from: nftItem.address,
                mode: 128 + 32,
                body: beginCell().storeUint(0x370fec51, 32).storeUint(123, 64).endCell(),
            });

            let contract = await blockchain.getContract(nftItem.address);

            expect(contract.accountState?.type).not.toBe('active');

            await nftItem.sendDeploy(nftOwner.getSender(), {
                value: toNano('1000'),
                op: 1,
                bounce: false,
            });

            contract = await blockchain.getContract(nftItem.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(
                    NFTItem.configToCell({
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        ownerAddress: nftOwner.address,
                        domain: 'alice',
                        lastFillUpTime: BigInt(blockchain.now!),
                    }),
                );
            }
        });

        it('item config transfer', async () => {
            const nftOwner = await blockchain.treasury('nft-owner');
            const someUser = await blockchain.treasury('some-user');

            const configDict = Dictionary.loadDirect(
                Dictionary.Keys.Int(32),
                Dictionary.Values.Cell(),
                blockchain.config,
            );

            const sliceValue: DictionaryValue<Slice> = {
                serialize(src, builder) {
                    return builder.storeSlice(src);
                },
                parse(src: Slice): Slice {
                    return src;
                },
            };

            const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), sliceValue);

            dict.set(
                aliceIndex,
                beginCell()
                    .storeUint(0, 8)
                    .storeAddress(someUser.address)
                    .storeUint(0, 2)
                    .storeUint(0, 1)
                    .storeCoins(toNano('0.5'))
                    .storeUint(0, 1)
                    .endCell()
                    .beginParse(),
            );

            configDict.set(80, beginCell().storeDict(dict).endCell());

            blockchain.setConfig(beginCell().storeDictDirect(configDict).endCell());

            const nftItem = blockchain.openContract(
                NFTItem.createFromConfig(
                    {
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        ownerAddress: nftOwner.address,
                        domain: 'alice',
                        lastFillUpTime: BigInt(blockchain.now!),
                    },
                    nftItemCode,
                ),
            );

            await nftItem.sendDeploy(someUser.getSender(), {
                value: toNano('1000'),
                op: 1,
                bounce: false,
            });

            blockchain.now! += 1000;

            const result = await nftItem.sendDeploy(someUser.getSender(), {
                value: toNano('1'),
                op: 0x44beae41,
                queryId: BigInt(123),
            });

            expect(result.transactions).toHaveTransaction({
                to: someUser.address,
                from: nftItem.address,
                mode: 1,
                body: beginCell()
                    .storeUint(0x05138d91, 32)
                    .storeUint(123, 64)
                    .storeAddress(nftOwner.address)
                    .storeUint(0, 1)
                    .endCell(),
            });

            const contract = await blockchain.getContract(nftItem.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(
                    NFTItem.configToCell({
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        ownerAddress: someUser.address,
                        domain: 'alice',
                        lastFillUpTime: BigInt(blockchain.now!),
                    }),
                );
            }
        });
        it('item bid', async () => {
            const nftOwner = await blockchain.treasury('nft-owner');
            const someUser = await blockchain.treasury('some-user');

            const nftItem = blockchain.openContract(
                NFTItem.createFromConfig(
                    {
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        domain: 'alice',
                        auction: beginCell()
                            .storeAddress(nftOwner.address)
                            .storeCoins(toNano('1000'))
                            .storeUint(blockchain.now! + 604800, 64)
                            .endCell(),
                        lastFillUpTime: BigInt(blockchain.now!),
                    },
                    nftItemCode,
                ),
            );

            await nftItem.sendDeploy(someUser.getSender(), {
                value: toNano('1000'),
                op: 1,
                bounce: false,
            });

            let result = await nftItem.sendDeploy(someUser.getSender(), {
                value: toNano('1000'),
            });

            expect(result.transactions).toHaveTransaction({
                from: someUser.address,
                to: nftItem.address,
                exitCode: 407,
            });

            result = await nftItem.sendDeploy(someUser.getSender(), {
                value: toNano('2000'),
            });

            expect(result.transactions).toHaveTransaction({
                to: nftOwner.address,
                from: nftItem.address,
                mode: 1,
                body: beginCell()
                    .storeUint(0x557cea20, 32)
                    .storeUint(13000000, 64) // cur_lt, but blockchain.lt = 14000000 🤯
                    .endCell(),
                value: (x) => {
                    return x ? toNano('1000') >= x && x > toNano('998') : false;
                },
            });

            const contract = await blockchain.getContract(nftItem.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(
                    NFTItem.configToCell({
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        domain: 'alice',
                        auction: beginCell()
                            .storeAddress(someUser.address)
                            .storeCoins(toNano('2000'))
                            .storeUint(blockchain.now! + 604800, 64)
                            .endCell(),
                        lastFillUpTime: BigInt(blockchain.now!),
                    }),
                );
            }
        });
        it('item bid prolong', async () => {
            const nftOwner = await blockchain.treasury('nft-owner');
            const someUser = await blockchain.treasury('some-user');

            const nftItem = blockchain.openContract(
                NFTItem.createFromConfig(
                    {
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        domain: 'alice',
                        auction: beginCell()
                            .storeAddress(nftOwner.address)
                            .storeCoins(toNano('1000'))
                            .storeUint(blockchain.now! + 3600 / 2, 64)
                            .endCell(),
                        lastFillUpTime: BigInt(blockchain.now!),
                    },
                    nftItemCode,
                ),
            );

            await nftItem.sendDeploy(someUser.getSender(), {
                value: toNano('1000'),
                op: 1,
                bounce: false,
            });

            let result = await nftItem.sendDeploy(someUser.getSender(), {
                value: toNano('1000'),
            });

            expect(result.transactions).toHaveTransaction({
                from: someUser.address,
                to: nftItem.address,
                exitCode: 407,
            });

            result = await nftItem.sendDeploy(someUser.getSender(), {
                value: toNano('2000'),
            });

            expect(result.transactions).toHaveTransaction({
                to: nftOwner.address,
                from: nftItem.address,
                mode: 1,
                body: beginCell()
                    .storeUint(0x557cea20, 32)
                    .storeUint(13000000, 64) // cur_lt, but blockchain.lt = 14000000 🤯
                    .endCell(),
                value: (x) => {
                    return x ? toNano('1000') >= x && x > toNano('998') : false;
                },
            });

            const contract = await blockchain.getContract(nftItem.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(
                    NFTItem.configToCell({
                        itemIndex: aliceIndex,
                        collectionAddress: nftCollection.address,
                        domain: 'alice',
                        auction: beginCell()
                            .storeAddress(someUser.address)
                            .storeCoins(toNano('2000'))
                            .storeUint(blockchain.now! + 3600, 64)
                            .endCell(),
                        lastFillUpTime: BigInt(blockchain.now!),
                    }),
                );
            }
        });

        it('should item already init', async () => {
            const nftOwner = await blockchain.treasury('nft-owner');
            const someUser = await blockchain.treasury('some-user');

            const nftItem = await nftFixture(
                nftOwner.getSender(),
                beginCell().storeUint(NFTCollection.OPCODES.DEPLOY_NFT, 32).storeStringTail('alice').endCell(),
            );

            let contract = await blockchain.getContract(nftItem.address);

            expect(contract.accountState?.type).toBe('active');

            let initState: Cell = beginCell().endCell();

            if (contract.accountState?.type == 'active') {
                initState = contract.accountState.state.data!;
            }

            blockchain.now! += 1;
            const result = await nftCollection.sendDeployNft(someUser.getSender(), {
                value: toNano('1000'),
                body: beginCell().storeUint(NFTCollection.OPCODES.DEPLOY_NFT, 32).storeStringTail('alice').endCell(),
            });

            expect(result.transactions).toHaveTransaction({
                from: nftItem.address,
                to: someUser.address,
                mode: SendMode.CARRY_ALL_REMAINING_INCOMING_VALUE,
                // 12000000 - B71B00
                // 13000000 - C65D40
                body: beginCell().storeUint(0, 32).storeUint(12000000, 64).endCell(),
            });

            contract = await blockchain.getContract(nftItem.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(initState);
            }
        });
    });

    describe('NFTCollection', () => {
        let initState: Cell;

        beforeEach(async () => {
            blockchain = await Blockchain.create();
            activateTVM11(blockchain);
            blockchain.now = 1659171600 - 1;

            initState = NFTCollection.configToCell({
                nftItemCode: nftItemCode,
                content: beginCell().storeUint(1, 8).storeStringTail('https://ton.org/collection.json').endCell(),
            });

            owner = await blockchain.treasury('owner');
            const init: StateInit = { code: nftCollectionCode, data: initState };

            nftCollection = blockchain.openContract(new NFTCollection(contractAddress(0, init), init));
        });

        it('auction not begin yet', async () => {
            const deployResult = await nftCollection.sendDeploy(owner.getSender(), {
                value: toNano('1000'),
                queryId: 0,
                name: 'alice',
            });

            expect(deployResult.transactions).toHaveTransaction({
                from: owner.address,
                to: nftCollection.address,
                exitCode: 199,
            });

            const contract = await blockchain.getContract(nftCollection.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(initState!);
            }
        });

        it('mod(len, 8) == 0', async () => {
            blockchain.now = 1659171600 + 1;

            const deployResult = await nftCollection.sendDeploy(owner.getSender(), {
                value: toNano('1000'),
                queryId: 0,
                name: 'alice',
                uint: 1,
            });

            expect(deployResult.transactions).toHaveTransaction({
                from: owner.address,
                to: nftCollection.address,
                exitCode: 202,
            });

            const contract = await blockchain.getContract(nftCollection.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(initState!);
            }
        });

        it('invalid chars - \0 char', async () => {
            blockchain.now = 1659171600 + 1;

            const deployResult = await nftCollection.sendDeploy(owner.getSender(), {
                queryId: 0,
                value: toNano('1000'),
                name: 'al\0ice',
            });

            expect(deployResult.transactions).toHaveTransaction({
                from: owner.address,
                to: nftCollection.address,
                exitCode: 203,
            });

            const contract = await blockchain.getContract(nftCollection.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(initState!);
            }
        });

        it.each([
            // < 4 chars
            ['', 200],
            ['a', 200],
            ['yo', 200],
            ['bob', 200],
            // 4 chars
            ['appl', 0],
            // 123 chars
            [
                'alicealicealicealicealicealicealicealicealicealialicealicealicealicealicsealicelialiclicealealicealiceicealicealicealiceali',
                0,
            ],
            // invalid chars - hyphen at end
            ['-alice', 203],
            // invalid chars - uppercase
            ['aLice', 203],
            // valid chars
            ['abcdefghijklmnopqrstuvwxyz', 0],
        ])('makeChars', async (text, exitCode) => {
            blockchain.now = 1659171600 + 1;

            const deployResult = await nftCollection.sendDeploy(owner.getSender(), {
                value: toNano('1000'),
                queryId: 0,
                name: text,
            });

            expect(deployResult.transactions).toHaveTransaction({
                from: owner.address,
                to: nftCollection.address,
                exitCode: exitCode,
            });

            const contract = await blockchain.getContract(nftCollection.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(initState!);
            }
        });

        it.each([
            // 127 chars
            [
                'alicealicealicealicealicealicealicealicealiceali',
                'cealicealicealicealicealicealicealicealicealicealicealicealicealicealicealiceal',
                201,
            ],
            // 126 chars
            [
                'alicealicealicealicealicealicealicealicealiceali',
                'cealicealicealicealicealicealicealicealicealicealicealicealicealicealicealicea',
                0,
            ],
            [
                'alicealicealicealicealicealicealicealicealicealialicealicealicealicealicsealicelialiclicealealicealiceicealicealicealiceali',
                'a',
                0,
            ],
            // invalid chars
            [
                'alicealicealicealicealicealicealicealicealiceali',
                'cealicealicealicealicealicea$liceaealicealicealicealicealicealicealicealiceal',
                203,
            ],
            // invalid chars - hyphen at begin
            [
                'alicealicealicealicealicealicealicealicealiceali',
                'cealicealicealicealicealicealiceaealicealicealicealicealicealicealicealiceal-',
                203,
            ],
        ])('makeChars2', async (text1, text2, exitCode) => {
            blockchain.now = 1659171600 + 1;

            const deployResult = await nftCollection.sendDeploy(owner.getSender(), {
                value: toNano('1000'),
                queryId: 0,
                name: text1,
                name_2: text2,
            });

            expect(deployResult.transactions).toHaveTransaction({
                from: owner.address,
                to: nftCollection.address,
                exitCode: exitCode,
            });

            const contract = await blockchain.getContract(nftCollection.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(initState!);
            }
        });

        it.each([
            [4, 0, 1000],
            [4, 1 * MONTH, Math.ceil(1000 * Math.pow(0.9, 1))],
            [4, 12 * MONTH, Math.ceil(1000 * Math.pow(0.9, 12))],
            [4, 24 * MONTH, 100],
            [5, 0, 500],
            [5, 6 * MONTH, Math.ceil(500 * Math.pow(0.9, 6))],
            [5, 24 * MONTH, 50],
            [6, 0, 400],
            [6, 24 * MONTH, 40],
            [7, 0, 300],
            [7, 24 * MONTH, 30],
            [8, 0, 200],
            [8, 24 * MONTH, 20],
            [9, 0, 100],
            [9, 24 * MONTH, 10],
            [10, 0, 50],
            [10, 24 * MONTH, 5],
            [11, 0, 10],
            [11, 24 * MONTH, 1.1],
            [12, 0, 10],
            [12, 24 * MONTH, 1.1],
        ])('makePrice', async (symbolsCount, addTime, price) => {
            blockchain.now = 1659171600 + 1 + addTime;

            let s = '';
            for (let i = 0; i < symbolsCount; i++) {
                s += 'a';
            }

            let deployResult = await nftCollection.sendDeploy(owner.getSender(), {
                value: toNano(price),
                queryId: 0,
                name: s,
            });

            expect(deployResult.transactions).toHaveTransaction({
                from: owner.address,
                to: nftCollection.address,
                exitCode: 0,
            });

            let contract = await blockchain.getContract(nftCollection.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(initState!);
            }

            deployResult = await nftCollection.sendDeploy(owner.getSender(), {
                value: toNano(price - 1),
                queryId: 0,
                name: s,
            });

            expect(deployResult.transactions).toHaveTransaction({
                from: owner.address,
                to: nftCollection.address,
                exitCode: 204,
            });

            contract = await blockchain.getContract(nftCollection.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(initState!);
            }
        });

        it('colection get', async () => {
            blockchain.now = 1659171600;

            let deployResult = await nftCollection.sendDeploy(owner.getSender(), {
                value: toNano(10),
            });

            expect(deployResult.transactions).toHaveTransaction({
                from: owner.address,
                to: nftCollection.address,
                exitCode: 0xffff,
            });

            let contract = await blockchain.getContract(nftCollection.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(initState!);
            }

            deployResult = await nftCollection.sendDeploy(owner.getSender(), {
                value: toNano(10),
                queryId: 1,
            });

            expect(deployResult.transactions).toHaveTransaction({
                from: owner.address,
                to: nftCollection.address,
                exitCode: 0xffff,
            });

            contract = await blockchain.getContract(nftCollection.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(initState!);
            }

            deployResult = await nftCollection.sendDeploy(owner.getSender(), {
                value: toNano(10),
                queryId: 0x370fec51,
            });

            expect(deployResult.transactions).toHaveTransaction({
                from: owner.address,
                to: nftCollection.address,
                exitCode: 0,
            });

            contract = await blockchain.getContract(nftCollection.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(initState!);
            }

            const contentData = await nftCollection.getCollectionData();
            expect(contentData.nextItemIndex).toEqual(-1);
            expect(contentData.collectionContent).toEqualCell(
                beginCell().storeUint(1, 8).storeStringTail('https://ton.org/collection.json').endCell(),
            );
            expect(contentData.ownerAddress).toBeNull();

            let dns = await nftCollection.getResolveDNS(
                beginCell().storeStringTail('\0').endCell().beginParse(),
                BigInt(0),
            );
            expect(dns.index).toEqual(8);
            expect(dns.domain).toBeNull();

            dns = await nftCollection.getResolveDNS(
                beginCell().storeStringTail('alice\0').endCell().beginParse(),
                BigInt(0),
            );
            expect(dns.index).toEqual(5 * 8);

            blockchain.now += 1;

            const nftItem = await nftFixture(
                owner.getSender(),
                beginCell().storeUint(NFTCollection.OPCODES.DEPLOY_NFT, 32).storeStringTail('alice').endCell(),
            );

            expect(dns.domain).toEqualCell(beginCell().storeUint(0xba93, 16).storeAddress(nftItem.address).endCell());

            dns = await nftCollection.getResolveDNS(
                beginCell().storeStringTail('alice\0sub\0').endCell().beginParse(),
                BigInt(0),
            );
            expect(dns.index).toEqual(5 * 8);
            expect(dns.domain).toEqualCell(beginCell().storeUint(0xba93, 16).storeAddress(nftItem.address).endCell());

            dns = await nftCollection.getResolveDNS(
                beginCell().storeStringTail('\0alice\0').endCell().beginParse(),
                BigInt(0),
            );
            expect(dns.index).toEqual(6 * 8);
            expect(dns.domain).toEqualCell(beginCell().storeUint(0xba93, 16).storeAddress(nftItem.address).endCell());
        });

        it('collection config', async () => {
            const configDict = Dictionary.loadDirect(
                Dictionary.Keys.Int(32),
                Dictionary.Values.Cell(),
                blockchain.config,
            );

            const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Uint(8));
            dict.set(aliceIndex, 1);

            configDict.set(80, beginCell().storeDict(dict).endCell());

            blockchain.setConfig(beginCell().storeDictDirect(configDict).endCell());

            blockchain.now = 1659171600 + 1;

            let deployResult = await nftCollection.sendDeploy(owner.getSender(), {
                value: toNano('1000'),
                queryId: 0,
                name: 'alice',
            });

            expect(deployResult.transactions).toHaveTransaction({
                from: owner.address,
                to: nftCollection.address,
                exitCode: 205,
            });

            let contract = await blockchain.getContract(nftCollection.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(initState!);
            }

            deployResult = await nftCollection.sendDeploy(owner.getSender(), {
                value: toNano('1000'),
                queryId: 0,
                name: 'alice2',
            });

            expect(deployResult.transactions).toHaveTransaction({
                from: owner.address,
                to: nftCollection.address,
                exitCode: 0,
            });

            contract = await blockchain.getContract(nftCollection.address);

            expect(contract.accountState?.type).toBe('active');

            if (contract.accountState?.type == 'active') {
                expect(contract.accountState.state.data).toEqualCell(initState!);
            }
        });
    });
});
