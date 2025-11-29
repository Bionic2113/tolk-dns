import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    // lang: 'func',
    // targets: ['stdlib.fc', 'params.fc', 'op-codes.fc', 'dns-utils.fc', 'nft-item.fc'],
    // debugInfo: true,
    lang: 'tolk',
    entrypoint: 'nft-item.tolk',
    withSrcLineComments: true,
    withStackComments: true,
};
