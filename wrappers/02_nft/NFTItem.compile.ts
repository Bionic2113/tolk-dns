import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'func',
    // targets: ['nft-item.fc']
    targets: [
        'stdlib.fc',
        'params.fc',
        'op-codes.fc',
        'dns-utils.fc',
        'nft-item.fc',
        // 'contracts_Func/nft-collection.fc',
    ],
    // lang: 'tolk',
    // entrypoint: 'nft-item-contract.tolk',
    // withSrcLineComments: true,
    // withStackComments: true,
};
