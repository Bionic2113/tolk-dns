import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'func',
    targets: ['stdlib.fc', 'params.fc', 'op-codes.fc', 'dns-utils.fc', 'nft-collection.fc'],
    debugInfo: true,
    // lang: 'tolk',
    // entrypoint: 'nft-collection.tolk',
    // withSrcLineComments: true,
    // withStackComments: true,
};
