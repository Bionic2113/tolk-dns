import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    // lang: 'func',
    // targets: [
    //     'contracts_FunC/stdlib.fc',
    //     'contracts_FunC/params.fc',
    //     'contracts_FunC/op-codes.fc',
    //     'contracts_FunC/dns-utils.fc',
    //     'contracts_FunC/nft-item.fc',
    //     // 'contracts_Func/nft-collection.fc',
    // ],
    // debugInfo: true,

    lang: 'tolk',
    // entrypoint: 'contracts_Tolk/nft-collection.tolk', //'contracts/ton_dns.tolk',
    entrypoint: 'contracts_Tolk/nft-item.tolk',
    withStackComments: true, // Fift output will contain comments, if you wish to debug its output
    withSrcLineComments: true, // Fift output will contain .tolk lines as comments
    experimentalOptions: '', // you can pass experimental compiler options here
};
