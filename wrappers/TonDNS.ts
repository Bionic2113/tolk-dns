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
} from '@ton/core';

export type TonDNSConfig = {
    body: string;
};
const COLLECTION_ADDRESS = '348bcf827469c5fc38541c77fdd91d4e347eac200f6f2d9fd62dc08885f0415f';
const OWNER_ADDRESS = '448bcf827469c5fc38541c77fdd91d4e347eac200f6f2d9fd62dc08885f0415f';
const TON = 1e9;
// export function tonDNSConfigToCell(config: TonDNSConfig): Cell {
//     const content = beginCell().storeStringTail('i am content').endCell();
//     const nftItemCode = beginCell()
//         .storeStringTail(
//             'te6ccgEBBQEA0wAC1V4yKsonGN4Yl/wfnPt8O0QcvnNOhRn6A7VNeSNXJ9l+gBbumyvWQKh+MNgNZuNXEVrgnvxKwmGV8sMSbRT6GW2Z8AGPWy6fM7HrPMDevF8H5zIhc4/Fjk0yKWXELb1YsBpO4AAAAADRBEphAQIBAwDAAwAiYnJhc3NpYy1kZXZlbG9wZXIBQ6AdGogKEOe3UMtU+C4VaZnMmyEHNGm5+tnuOinAQKiHY3AEAEmf04AMetl0+Z2PWeYG9eL4PzmRC5x+LHJpkUsuIW3qxYDSdwAQ',
//         )
//         .endCell();
//     return (
//         beginCell()
//             // .storeUint(1, 4)
//             // .storeUint(0x370fec51, 32)
//             .storeStringTail(config.body)
//             .storeRef(content)
//             .storeRef(nftItemCode)
//             .endCell()
//     );
// }
export function tonDNSConfigToCell(config: TonDNSConfig): Cell {
    const builder = beginCell()
        .storeUint(12, 256)
        .storeAddress(address('0:' + COLLECTION_ADDRESS))
        .storeAddress(address('0:' + OWNER_ADDRESS)) //  owner_address
        .storeRef(beginCell().endCell()) // content
        .storeRef(beginCell().storeStringTail('alice').endCell()) // domain
        .storeUint(0, 1) // auction maybe
        .storeUint(1659171600, 64); // start auction

    return builder.endCell();

    // return beginCell().endCell();

    // const content = beginCell().storeStringTail('i am content').endCell();
    // const nftItemCode = beginCell()
    //     .storeStringTail(
    //         'te6ccgEBBQEA0wAC1V4yKsonGN4Yl/wfnPt8O0QcvnNOhRn6A7VNeSNXJ9l+gBbumyvWQKh+MNgNZuNXEVrgnvxKwmGV8sMSbRT6GW2Z8AGPWy6fM7HrPMDevF8H5zIhc4/Fjk0yKWXELb1YsBpO4AAAAADRBEphAQIBAwDAAwAiYnJhc3NpYy1kZXZlbG9wZXIBQ6AdGogKEOe3UMtU+C4VaZnMmyEHNGm5+tnuOinAQKiHY3AEAEmf04AMetl0+Z2PWeYG9eL4PzmRC5x+LHJpkUsuIW3qxYDSdwAQ',
    //     )
    //     .endCell();
    // return beginCell()
    //     .storeUint(1, 256)
    //     .storeStringTail('collection_address')
    //     .storeStringTail('owner_address')
    //     .storeRef(content)
    //     .storeRef(nftItemCode)
    //     .storeDict()
    //     .storeUint(1, 64)
    //     .endCell();
}

export class TonDNS implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new TonDNS(address);
    }

    static createFromConfig(config: TonDNSConfig, code: Cell, workchain = 0) {
        const data = tonDNSConfigToCell(config);
        const init = { code, data };
        return new TonDNS(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint, op: number) {
        // await provider.internal(via, {
        //     value,
        //     sendMode: SendMode.PAY_GAS_SEPARATELY,
        //     body: beginCell()
        //         .storeSlice(beginCell().storeUint(op, 32).storeStringTail('gram').endCell().beginParse())
        //         .endCell(),
        // });

        // nft ITEM check
        const content = beginCell().storeStringTail('i am content').endCell();
        const nftItemCode = beginCell()
            .storeStringTail(
                'te6ccgEBBQEA0wAC1V4yKsonGN4Yl/wfnPt8O0QcvnNOhRn6A7VNeSNXJ9l+gBbumyvWQKh+MNgNZuNXEVrgnvxKwmGV8sMSbRT6GW2Z8AGPWy6fM7HrPMDevF8H5zIhc4/Fjk0yKWXELb1YsBpO4AAAAADRBEphAQIBAwDAAwAiYnJhc3NpYy1kZXZlbG9wZXIBQ6AdGogKEOe3UMtU+C4VaZnMmyEHNGm5+tnuOinAQKiHY3AEAEmf04AMetl0+Z2PWeYG9eL4PzmRC5x+LHJpkUsuIW3qxYDSdwAQ',
            )
            .endCell();
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(op, 32)
                .storeUint(1, 256)
                .storeStringTail('collection_address')
                .storeStringTail('owner_address')
                .storeRef(content)
                .storeRef(nftItemCode)
                .storeDict()
                .storeUint(1, 64)
                .endCell(),
            // body: beginCell()
            //     .storeSlice(beginCell().storeUint(op, 32).storeStringTail('gram').endCell().beginParse())
            //     .endCell(),
        });
    }

    async getResolveDNS(provider: ContractProvider, subdomain: Slice, category: bigint) {
        const result = await provider.get('dnsresolve', [
            { type: 'slice', cell: beginCell().storeSlice(subdomain).endCell() },
            { type: 'int', value: category },
        ]);

        return result.stack.readNumber(); //, result.stack.readCell()
    }
}
