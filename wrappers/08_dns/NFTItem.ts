import { NumberBase } from '@tact-lang/compiler';
import {
    address,
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Dictionary,
    Sender,
    SendMode,
    Slice,
    StateInit,
} from '@ton/core';

export const CONTENT = () => {
    const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
    dict.set(
        BigInt('0x82a3537ff0dbce7eec35d69edc3a189ee6f17d82f353a553f9aa96cb0be3ce89'),
        beginCell().storeUint(0, 8).storeStringTail('alice.ton').endCell(),
    );
    dict.set(
        BigInt('0xc9046f7a37ad0ea7cee73355984fa5428982f8b37c8f7bcec91f7ac71a7cd104'),
        beginCell().storeUint(0, 8).storeStringTail('TON Domain').endCell(),
    );
    dict.set(
        BigInt('0x6105d6cc76af400325e94d588ce511be5bfdbb73b437dc51eca43917d7a43e3d'),
        beginCell().storeUint(0, 8).storeStringTail('https://dns.ton.org/icon.png#alice').endCell(),
    );

    return beginCell().storeUint(0, 8).storeDict(dict).endCell();
};

export const EDITED_CONTENT = () => {
    const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
    dict.set(
        BigInt('0x82a3537ff0dbce7eec35d69edc3a189ee6f17d82f353a553f9aa96cb0be3ce89'),
        beginCell().storeUint(0, 8).storeStringTail('EDITED alice.ton').endCell(),
    );
    dict.set(
        BigInt('0xc9046f7a37ad0ea7cee73355984fa5428982f8b37c8f7bcec91f7ac71a7cd104'),
        beginCell().storeUint(0, 8).storeStringTail('EDITED TON Domain').endCell(),
    );
    dict.set(
        BigInt('0x6105d6cc76af400325e94d588ce511be5bfdbb73b437dc51eca43917d7a43e3d'),
        beginCell().storeUint(0, 8).storeStringTail('EDITED https://dns.ton.org/icon.png#alice').endCell(),
    );

    return beginCell().storeUint(0, 8).storeDict(dict).endCell();
};

export const CONTENT_WITH_WALLET = () => {
    const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
    dict.set(
        BigInt('0x82a3537ff0dbce7eec35d69edc3a189ee6f17d82f353a553f9aa96cb0be3ce89'),
        beginCell().storeUint(0, 8).storeStringTail('alice.ton').endCell(),
    );
    dict.set(
        BigInt('0xc9046f7a37ad0ea7cee73355984fa5428982f8b37c8f7bcec91f7ac71a7cd104'),
        beginCell().storeUint(0, 8).storeStringTail('TON Domain').endCell(),
    );
    dict.set(
        BigInt('0x6105d6cc76af400325e94d588ce511be5bfdbb73b437dc51eca43917d7a43e3d'),
        beginCell().storeUint(0, 8).storeStringTail('https://dns.ton.org/icon.png#alice').endCell(),
    );
    dict.set(
        BigInt('0xe8d44050873dba865aa7c170ab4cce64d90839a34dcfd6cf71d14e0205443b1b'),
        beginCell()
            .storeUint(0x9fd3, 16)
            .storeAddress(Address.parse('EQA0i8-CdGnF_DhUHHf92R1ONH6sIA9vLZ_WLcCIhfBBXwtG'))
            .storeUint(0, 1)
            .endCell(),
    );

    return beginCell().storeUint(0, 8).storeDict(dict).endCell();
};

export type NFTItemConfig = {
    itemIndex: bigint;
    collectionAddress: Address;
    ownerAddress?: Address;
    content?: Cell;
    domain?: string;
    auction?: Cell;
    lastFillUpTime?: bigint;
};

export class NFTItem implements Contract {
    static readonly OPCODES = {
        TRANSFER: 0x5fcc3d14,
        GET_STATIC_DATA: 0x2fcb26a2,
        DEPLOY: 0,
        OWNERSHIP_ASSIGNED: 0x05138d91,
        DNS_BALANCE_RELEASE: 0x4ed14b65,
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

    static configToCell(config: NFTItemConfig): Cell {
        const builder = beginCell().storeUint(config.itemIndex, 256).storeAddress(config.collectionAddress);

        config.ownerAddress ? builder.storeAddress(config.ownerAddress) : builder.storeUint(0, 2);

        config.content ? builder.storeRef(config.content) : builder.storeRef(beginCell().storeUint(0, 8).endCell());

        if (!config.domain) {
            return builder.endCell();
        }

        builder.storeRef(beginCell().storeStringTail(config.domain)).endCell();

        config.auction ? builder.storeUint(1, 1).storeRef(config.auction) : builder.storeUint(0, 1);

        config.lastFillUpTime ? builder.storeUint(config.lastFillUpTime, 64) : builder.storeUint(Date.now(), 64);

        return builder.endCell();
    }

    async sendDeploy(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            ownerAddress?: Address;
            content?: Cell;
            op?: number;
            queryId?: bigint;
            bounce?: boolean;
        },
    ) {
        const body = beginCell().storeUint(opts.op ?? NFTItem.OPCODES.DEPLOY, 32);

        if (opts.queryId) {
            body.storeUint(opts.queryId, 64);
        }

        if (opts.ownerAddress) {
            body.storeAddress(opts.ownerAddress);
        }

        if (opts.content) {
            body.storeRef(opts.content);
        }

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: body.endCell(),
            bounce: opts.bounce,
        });
    }

    async sendAnyBody(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
        await provider.internal(via, {
            value: value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: body,
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
            // forwardBody?: Cell | Slice;
        },
    ) {
        const body = beginCell()
            .storeUint(NFTItem.OPCODES.TRANSFER, 32)
            .storeUint(opts.queryId ?? 0, 64)
            .storeAddress(opts.to);

        opts.responseTo ? body.storeAddress(opts.responseTo) : body.storeUint(0, 2);

        body.storeUint(0, 1) // this nft don't use custom_payload
            .storeCoins(opts.forwardAmount ?? 0)
            .storeUint(0, 1); // forward payload
        //     .storeMaybeRef(null)
        //     .storeCoins(opts.forwardAmount ?? 0);

        // if (opts.forwardBody instanceof Cell) {
        //     body.storeBit(1).storeRef(opts.forwardBody);
        // } else {
        //     body.storeBit(0).storeSlice(opts.forwardBody ?? Cell.EMPTY.beginParse());
        // }
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

    async getResolveDNS(
        provider: ContractProvider,
        subdomain: Slice,
        category: bigint,
    ): Promise<{
        index: number;
        domain: Cell | null;
    }> {
        const { stack } = await provider.get('dnsresolve', [
            { type: 'slice', cell: beginCell().storeSlice(subdomain).endCell() },
            { type: 'int', value: category },
        ]);

        return {
            index: stack.readNumber(),
            domain: stack.readCell(),
        };
    }
}
