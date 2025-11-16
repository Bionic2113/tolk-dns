import "dns-utils"

struct DomainStorage {
    ton: address
    tme: address
    tonWWW: address
}

fun DomainStorage.load() {
    return DomainStorage.fromCell(contract.getData());
}

fun onInternalMessage(in: InMessage) {
    // contract.setData(DomainStorage.fromSlice(in.body).toCell());
    contract.setData(DomainStorage {
        tonWWW: address("EQC3dNlesgVD8YbAazcauIrXBPfiVhMMr5YYk2in0Mtsz0Bz"),
        ton: address("EQC3dNlesgVD8YbAazcauIrXBPfiVhMMr5YYk2in0Mtsz0Bz"),
        tme: address("EQC3dNlesgVD8YbAazcauIrXBPfiVhMMr5YYk2in0Mtsz0Bz"),
    }.toCell());
}

get fun dnsResolve(subdomain: slice, category: int): (int, cell) {
    val subdomainLen = subdomain.remainingBitsCount();

    assert (mod(subdomainLen, 8) == 0) throw 70;

    val startsWithZeroByte: bool = subdomain.preloadInt(8) == 0;

    if (startsWithZeroByte && subdomainLen == 8) {
        return (8, nullCell());
    }

    if (startsWithZeroByte) {
        subdomain.loadUint(8);
    }

    val domainStorage = lazy DomainStorage.load();
    val ton_www_domain: slice = "ton\0www\0";

    if (subdomainLen >= 8 * 8 && subdomain.preloadBits(8 * 8).bitsEqual(ton_www_domain)) {
        val result: cell = beginCell().storeUint(dns_next_resolver_prefix, 16).storeAddress(domainStorage
            .tonWWW)
            .endCell();
        return (7 * 8 + (startsWithZeroByte ? 8 : 0), result);
    }

    val ton: slice = beginCell().storeSlice("ton").storeUint(0, 8).endCell().beginParse(); // "ton."; // "ton\0";
    if (subdomainLen >= 4 * 8 && subdomain.preloadBits(4 * 8).bitsEqual(ton)) {
        val result: cell = beginCell().storeUint(dns_next_resolver_prefix, 16).storeAddress(domainStorage
            .ton)
            .endCell();
        return (3 * 8 + (startsWithZeroByte ? 8 : 0), result);
    }

    val tme: slice = "me\0t\0";
    if (subdomainLen >= 5 * 8 && subdomain.preloadBits(5 * 8).bitsEqual(tme)) {
        val result: cell = beginCell().storeUint(dns_next_resolver_prefix, 16).storeAddress(domainStorage
            .tme)
            .endCell();
        return (4 * 8 + (startsWithZeroByte ? 8 : 0), result);
    }

    return (0, nullCell());
}
