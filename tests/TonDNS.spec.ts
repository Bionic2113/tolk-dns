import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { TonDNS } from '../wrappers/TonDNS';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('TonDNS', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('TonDNS');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let tonDNS: SandboxContract<TonDNS>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        tonDNS = blockchain.openContract(
            TonDNS.createFromConfig(
                {
                    body: 'gram',
                },
                code,
            ),
        );
        // blockchain = await Blockchain.create();
        // tonDNS = blockchain.openContract(
        //     TonDNS.createFromConfig(
        //         {
        //             body: 'gram',
        //         },
        //         code,
        //     ),
        // );
        // deployer = await blockchain.treasury('deployer');
    });
    const deploy = async (op: number) => {
        blockchain.debug = true;
        deployer = await blockchain.treasury('deployer');

        const deployResult = await tonDNS.sendDeploy(deployer.getSender(), toNano('0.05'), op);

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: tonDNS.address,
            deploy: true,
            success: true,
        });
    };

    it('should deploy', async () => {
        blockchain.debug = true;
        await deploy(0x370fec51);
        // deployer = await blockchain.treasury('deployer');
        // const deployResult = await tonDNS.sendDeploy(deployer.getSender(), toNano('0.05'), 0x370fec51);
        // expect(deployResult.transactions).toHaveTransaction({
        //     from: deployer.address,
        //     to: tonDNS.address,
        //     deploy: true,
        //     success: true,
        // });
        // the check is done inside beforeEach
        // blockchain and tonDNS are ready to use
    }, 15000);

    // it('ton simple dns', async () => {
    //     const i = await tonDNS.getResolveDNS('ton\0utils', BigInt(1));
    //     console.log('int: ', i);
    //     // console.log('cell: ', c);
    //     expect(i).toBe(24);
    // });
    // it('ton simple dns 2', async () => {
    //     const i = await tonDNS.getResolveDNS('\0ton\0utils', BigInt(1));
    //     console.log('int: ', i);
    //     // console.log('cell: ', c);
    //     expect(i).toBe(32);
    // });

    /*
    it('resolve utils = 40', async () => {
        await deploy(0x370fec51);
        const addr = beginCell().storeStringTail('utils').storeUint(0, 8).storeStringTail('ton').endCell().beginParse();
        const i = await tonDNS.getResolveDNS(addr, BigInt(1));
        console.log('int: ', i);
        // console.log('cell: ', c);
        expect(i).toBe(40);
    });
    it('resolve utils = 40 second', async () => {
        await deploy(0x370fec51);
        const addr = beginCell()
            .storeUint(0, 8)
            .storeStringTail('utils')
            .storeUint(0, 8)
            .storeStringTail('ton')
            .endCell()
            .beginParse();
        const i = await tonDNS.getResolveDNS(addr, BigInt(1));
        console.log('int: ', i);
        // console.log('cell: ', c);
        expect(i).toBe(40);
    });
 */
});
