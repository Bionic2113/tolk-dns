import {
    Address,
    beginCell,
    Builder,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Dictionary,
    DictionaryValue,
    Sender,
    SendMode,
    Slice,
    StateInit,
    toNano,
    TupleBuilder,
} from '@ton/core';
import { NFTItem, NFTItemConfig } from './NFTItem';

export type RoyaltyParams = { numerator: number; denominator: number; royaltyAddress: Address };

export type NftCollectionConfig = {
    content: Cell;
    nftItemCode: Cell;
};

export const aliceIndex: bigint = BigInt(
    '38930916800118655128984401856443062677799436388671332167772672007419684920584',
);

export class NFTCollection implements Contract {
    static readonly OPCODES = {
        GET_ROYALTY_PARAMS: 0x693d3950,
        DEPLOY_NFT: 0,
        BATCH_DEPLOY_NFT: 2,
        CHANGE_OWNER: 3,
    };

    static configToCell(config: NftCollectionConfig): Cell {
        return beginCell().storeRef(config.content).storeRef(config.nftItemCode).endCell();
    }

    static createFromAddress(address: Address) {
        return new NFTCollection(address);
    }

    static buildRoyaltyParams(opts: RoyaltyParams) {
        return beginCell()
            .storeUint(opts.numerator, 16)
            .storeUint(opts.denominator, 16)
            .storeAddress(opts.royaltyAddress)
            .endCell();
    }

    static createFromConfig(config: NftCollectionConfig, code: Cell, workchain = 0) {
        const data = NFTCollection.configToCell(config);
        const init = { code, data };
        return new NFTCollection(contractAddress(workchain, init), init);
    }

    constructor(
        readonly address: Address,
        readonly init?: StateInit,
    ) {}

    async sendDeploy(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId?: number;
            name?: string;
            name_2?: string;
            uint?: number;
        },
    ) {
        const body = beginCell();

        if (opts.queryId) {
            body.storeUint(opts.queryId, 32);
        }

        if (opts.name) {
            body.storeStringTail(opts.name);
        }

        if (opts.name_2) {
            body.storeRef(beginCell().storeStringTail(opts.name_2).endCell());
        }

        if (opts.uint) {
            body.storeUint(opts.uint, 1);
        }

        await provider.internal(via, {
            value: opts.value,
            body: body.endCell(),
        });
    }

    async sendDeployNft(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            body: Cell;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: opts.body,
        });
    }

    async sendBatchDeployNFT(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId?: number;
            items: {
                to: Address;
                index: number;
                itemValue?: bigint;
                content?: Cell;
            }[];
        },
    ) {
        const sliceValue: DictionaryValue<Slice> = {
            serialize(src, builder) {
                return builder.storeSlice(src);
            },
            parse(src: Slice): Slice {
                return src;
            },
        };

        const deployList = Dictionary.empty(Dictionary.Keys.Uint(64), sliceValue);
        for (const item of opts.items) {
            deployList.set(
                item.index,
                beginCell()
                    .storeCoins(10000000n)
                    .storeRef(
                        beginCell()
                            .storeAddress(item.to)
                            .storeRef(item.content ?? Cell.EMPTY),
                    )
                    .endCell()
                    .beginParse(),
            );
        }

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(NFTCollection.OPCODES.BATCH_DEPLOY_NFT, 32)
                .storeUint(opts.queryId ?? 0, 64)
                .storeDict(deployList)
                .endCell(),
        });
    }

    async getCollectionData(provider: ContractProvider): Promise<{
        nextItemIndex: number;
        collectionContent: Cell;
        ownerAddress: Address | null;
    }> {
        const { stack } = await provider.get('get_collection_data', []);
        return {
            nextItemIndex: stack.readNumber(),
            collectionContent: stack.readCell(),
            ownerAddress: stack.readAddressOpt(),
        };
    }

    async getNftAddressByIndex(provider: ContractProvider, index: bigint): Promise<Address> {
        const builder = new TupleBuilder();
        builder.writeNumber(index);

        const { stack } = await provider.get('get_nft_address_by_index', builder.build());

        return stack.readAddress();
    }

    async getNftContent(
        provider: ContractProvider,
        index: number,
        individualContent: Cell,
    ): Promise<{
        individualContent: Cell | null;
    }> {
        const builder = new TupleBuilder();
        builder.writeNumber(index);
        builder.writeCell(individualContent);

        const { stack } = await provider.get('get_nft_data', builder.build());

        return {
            individualContent: stack.readCellOpt(),
        };
    }

    async getResolveDNS(
        provider: ContractProvider,
        subdomain: Slice,
        category: bigint,
    ): Promise<{
        index: number;
        domain: Cell | null;
    }> {
        const builder = new TupleBuilder();
        builder.writeSlice(subdomain);
        builder.writeNumber(category);

        const { stack } = await provider.get('dnsresolve', builder.build());

        return {
            index: stack.readNumber(),
            domain: stack.readCellOpt(),
        };
    }
}
