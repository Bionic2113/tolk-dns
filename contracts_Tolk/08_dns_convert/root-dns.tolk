// Root DNS resolver 2.0 in masterchain
// Added support for ".t.me" domain zone (https://t.me/tonblockchain/167), in addition to ".ton" domain zone.
// Added redirect from short "www.ton" to "foundation.ton" domain
// compiled by FunC https://github.com/ton-blockchain/ton/tree/20758d6bdd0c1327091287e8a620f660d1a9f4da

@inline
fun loadData(): (slice, slice, slice) {
    var ds: slice = contract.getData().beginParse();
    return (
            ds.loadAddress(), // address of ".ton" dns resolver smart contract in basechain
            ds.loadAddress(), // address of ".t.me" dns resolver smart contract in basechain
            ds.loadAddress() // address of "www.ton" dns resolver smart contract in basechain
    );
}

get fun dnsresolve(subdomain: slice, category: int): (int, cell) {
    assert(mod(subdomain.remainingBitsCount(), 8) == 0) throw 70;

    var startsWithZeroByte: int = subdomain.preloadInt(8) == 0;

    var subdomainLen: int = subdomain.remainingBitsCount();

    if (startsWithZeroByte & (subdomainLen == 8)) { // "." requested
        return (8, null); // resolved but no dns-records
    }
    if (startsWithZeroByte) {
        subdomain.loadUint(8);
    }

    var (tonAddress: address, tMeAddress: address, tonWwwAddress: address) = loadData();

    var tonWwwDomain: slice = beginCell().storeSlice("ton").storeUint(0, 8).storeSlice("www").storeUint(0, 8).endCell().beginParse();

    if (subdomainLen >= 8 * 8) {
        if (subdomain.preloadBits(8 * 8).bitsEqual(tonWwwDomain)) {

            var result: cell = beginCell()
                    .storeUint(dns_next_resolver_prefix, 16)
                    .storeAddress(tonWwwAddress)
                    .endCell();

            return (7 * 8 + (startsWithZeroByte ? 8 : 0), result);

        }
    }

    var tonDomain: slice = beginCell().storeSlice("ton").storeUint(0, 8).endCell().beginParse();

    if (subdomainLen >= 4 * 8) {
        if (subdomain.preloadBits(4 * 8).bitsEqual(tonDomain)) {

            var result: cell = beginCell()
                    .storeUint(dns_next_resolver_prefix, 16)
                    .storeAddress(tonAddress)
                    .endCell();

            return (3 * 8 + (startsWithZeroByte ? 8 : 0), result);

        }
    }

    var tMeDomain: slice = beginCell().storeSlice("me").storeUint(0, 8).storeSlice("t").storeUint(0, 8).endCell().beginParse();

    if (subdomainLen >= 5 * 8) {
        if (subdomain.preloadBits(5 * 8).bitsEqual(tMeDomain)) {

            var result: cell = beginCell()
                    .storeUint(dns_next_resolver_prefix, 16)
                    .storeAddress(tMeAddress)
                    .endCell();

            return (4 * 8 + (startsWithZeroByte ? 8 : 0), result);

        }
    }

    return (0, null); // domain cannot be resolved
}

// in the future, use: fun onInternalMessage(in: InMessage) {
fun onInternalMessage(msgValue: int, inMsgFull: cell, inMsgBody: slice) {
}
