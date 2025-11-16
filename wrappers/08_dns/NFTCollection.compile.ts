import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'func',
    // targets: ['nft-collection.fc']
    targets: [
        'stdlib.fc',
        'params.fc',
        'op-codes.fc',
        'dns-utils.fc',
        'nft-collection.fc',
        // 'contracts_Func/nft-collection.fc',
    ],
    debugInfo: true,
    // lang: 'tolk',
    // entrypoint: 'nft-collection-contract.tolk',
    // withSrcLineComments: true,
    // withStackComments: true,
};
