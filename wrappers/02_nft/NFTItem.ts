import {
    address,
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Slice,
    StateInit,
} from '@ton/core';

const OWNER_ADDRESS = '448bcf827469c5fc38541c77fdd91d4e347eac200f6f2d9fd62dc08885f0415f';
const TON = 1e9;

export type NFTItemConfig = {
    itemIndex: number;
    collectionAddress: Address;
    ownerAddress?: Address;
    content?: Cell;
};

export class NFTItem implements Contract {
    static readonly OPCODES = {
        TRANSFER: 0x5fcc3d14,
        GET_STATIC_DATA: 0x2fcb26a2,
    };

    constructor(
        readonly address: Address,
        readonly init?: StateInit,
    ) {}

    static createFromAddress(address: Address) {
        return new NFTItem(address);
    }

    static createFromConfig(config: NFTItemConfig, code: Cell, workchain = 0) {
        const data = NFTItem.configToCell(config);
        const init = { code, data };
        return new NFTItem(contractAddress(workchain, init), init);
    }

    /*
    const makeStorageItem = ({auctionEndTime, lastFillUpTime}) => {
        return [
            "uint256", '38930916800118655128984401856443062677799436388671332167772672007419684920584', // index
            "Address", '0:' + COLLECTION_ADDRESS, // collection_address
            "uint2", '0', // owner_address - zero address
            'cell', CONTENT_EMPTY,
            'cell', [ // domain
                'string', 'alice',
            ],
            'uint1', 1, // auction maybe
            'cell', [ // auction
                'Address', '0:' + OWNER_ADDRESS, // max_bid_address
                'coins', 1000 * TON, // max_bid_amount
                'uint64', auctionEndTime || (AUCTION_START_TIME + AUCTION_START_DURATION) // auction_end_time
            ],
            'uint64', lastFillUpTime || AUCTION_START_TIME // last_fill_up_time
        ];
    }


    const builder = beginCell()
        .storeUint(config.itemIndex, 256)
        .storeAddress(config.collectionAddress)
        .storeUint(0, 2) //  owner_address - zero address
        .storeRef(beginCell().endCell()) // content
        .storeRef(beginCell().storeStringTail('alice').endCell()) // domain
        .storeUint(1, 1) // auction maybe
        .storeRef(
            // auction
            beginCell()
                .storeAddress(address('0:' + OWNER_ADDRESS))
                .storeCoins(1000 * TON)
                .storeUint(1659171600 + 604800, 64) // end auction
                .endCell(),
        )
        .storeUint(1659171600, 64); // start auction


        ------------------------------------------------
        const makeStorageItemComplete = ({auctionEndTime, lastFillUpTime}) => {
            return [
                "uint256", '38930916800118655128984401856443062677799436388671332167772672007419684920584', // index,
                "Address", '0:' + COLLECTION_ADDRESS, // collection_address
                "Address", '0:' + OWNER_ADDRESS, // owner_address
                'cell', CONTENT_EMPTY,
                'cell', [ // domain
                    'string', 'alice',
                ],
                'uint1', 0, // auction maybe
                'uint64', lastFillUpTime || AUCTION_START_TIME // last_fill_up_time
            ];
        }
    */

    static configToCell(config: NFTItemConfig): Cell {
        const builder = beginCell()
            .storeUint(config.itemIndex, 256)
            .storeAddress(config.collectionAddress)
            .storeAddress(address('0:' + OWNER_ADDRESS)) //  owner_address
            .storeRef(beginCell().endCell()) // content
            .storeRef(beginCell().storeStringTail('alice').endCell()) // domain
            .storeUint(0, 1) // auction maybe
            .storeUint(1659171600, 64); // start auction

        return builder.endCell();
        // const builder = beginCell().storeUint(config.itemIndex, 64).storeAddress(config.collectionAddress);

        // if (config.ownerAddress) {
        //     builder.storeAddress(config.ownerAddress);
        // }
        // if (config.content) {
        //     builder.storeRef(config.content);
        // }

        // return builder.endCell();
    }

    async sendDeploy(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            ownerAddress: Address;
            content: Cell;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeAddress(opts.ownerAddress).storeRef(opts.content).endCell(),
        });
    }

    async sendTransferOwnership(
        provider: ContractProvider,
        via: Sender,
        opts: {
            queryId?: number;
            value: bigint;
            to: Address;
            responseTo?: Address;
            forwardAmount?: bigint;
            forwardBody?: Cell | Slice;
        },
    ) {
        const body = beginCell()
            .storeUint(NFTItem.OPCODES.TRANSFER, 32)
            .storeUint(opts.queryId ?? 0, 64)
            .storeAddress(opts.to)
            .storeAddress(opts.responseTo)
            .storeMaybeRef(null)
            .storeCoins(opts.forwardAmount ?? 0);

        if (opts.forwardBody instanceof Cell) {
            body.storeBit(1).storeRef(opts.forwardBody);
        } else {
            body.storeBit(0).storeSlice(opts.forwardBody ?? Cell.EMPTY.beginParse());
        }
        await provider.internal(via, {
            value: opts.value,
            body: body.endCell(),
        });
    }

    async sendGetStaticData(
        provider: ContractProvider,
        via: Sender,
        opts: {
            queryId?: number;
            value: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(NFTItem.OPCODES.GET_STATIC_DATA, 32)
                .storeUint(opts.queryId ?? 0, 64)
                .endCell(),
        });
    }

    async getNftData(provider: ContractProvider): Promise<{
        init: boolean;
        index: number;
        collectionAddress: Address;
        ownerAddress: Address | null;
        individualContent: Cell | null;
    }> {
        const { stack } = await provider.get('get_nft_data', []);

        return {
            init: stack.readBoolean(),
            index: stack.readNumber(),
            collectionAddress: stack.readAddress(),
            ownerAddress: stack.readAddressOpt(),
            individualContent: stack.readCellOpt(),
        };
    }
}
