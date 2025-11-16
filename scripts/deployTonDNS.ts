import { toNano } from '@ton/core';
import { TonDNS } from '../wrappers/TonDNS';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const tonDNS = provider.open(TonDNS.createFromConfig({ body: 'gram' }, await compile('TonDNS')));

    await tonDNS.sendDeploy(provider.sender(), toNano('0.05'), 0x370fec51);

    await provider.waitForDeploy(tonDNS.address);

    // run methods on `tonDNS`
}
