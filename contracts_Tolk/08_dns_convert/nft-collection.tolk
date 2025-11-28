import "@stdlib/tvm-dicts"
// DNS resolver smart contract (implements NFT Collection interface)

// storage scheme
// storage#_ collection_content:^Cell
//           nft_item_code:^Cell
//           = Storage;

@inline
fun loadData(): (cell, cell) {
    var ds = contract.getData().beginParse();
    return (
            ds.loadRef(), // content
            ds.loadRef() // nft_item_code
    );
}

@inline
fun saveData(content: cell, nftItemCode: cell) {
    contract.setData(beginCell()
            .storeRef(content)
            .storeRef(nftItemCode)
            .endCell());
}

fun calculateNftItemStateInit(itemIndex: int, nftItemCode: cell): cell {
    var data: cell = beginCell().storeUint(itemIndex, 256).storeAddress(contract.getAddress()).endCell();
    return beginCell().storeUint(0, 2).storeDict(nftItemCode).storeDict(data).storeUint(0, 1).endCell();
}

fun calculateNftItemAddress(wc: int, stateInit: cell): address {
    return beginCell()
            .storeUint(4, 3)
            .storeInt(wc, 8)
            .storeUint(stateInit.hash(), 256)
            .endCell()
            .beginParse();
}

fun deployNftItem(itemIndex: int, nftItemCode: cell, nftContent: cell) {
    var stateInit: cell = calculateNftItemStateInit(itemIndex, nftItemCode);
    var nftAddress: address = calculateNftItemAddress(workchain(), stateInit);
    var msg = beginCell()
            .storeUint(0x18, 6)
            .storeAddress(nftAddress)
            .storeCoins(0)
            .storeUint(4 + 2 + 1, 1 + 4 + 4 + 64 + 32 + 1 + 1 + 1)
            .storeRef(stateInit)
            .storeRef(nftContent);
    sendRawMessage(msg.endCell(), 64); // carry all the remaining value of the inbound message, fee deducted from amount
}

// in the future, use: fun onInternalMessage(in: InMessage) {
fun onInternalMessage(msgValue: int, inMsgFull: cell, inMsgBody: slice) {
    if (inMsgBody.isEmpty()) { // bounce back empty messages
        throw 0xffff;
    }
    var cs: slice = inMsgFull.beginParse();
    var flags: int = cs.loadUint(4);

    if (flags & 1) { // ignore all bounced messages
        return;
    }
    var senderAddress: address = cs.loadAddress();

    var op: int = inMsgBody.loadUint(32);

    var (content, nftItemCode) = loadData();

    if (op == 0) { // deploy new nft
        var nowTime: int = blockchain.now();
        assert(nowTime > auction_start_time) throw 199; // start of auction
        var domain: slice = readDomainFromComment(inMsgBody);
        var len: int = domain.remainingBitsCount();
        assert(len > 3 * 8) throw 200; // minimum 4 characters
        assert(len <= 126 * 8) throw 201; // maxmimum 126 characters
        assert(mod(len, 8) == 0) throw 202;
        assert(checkDomainString(domain)) throw 203;
        var minPrice: int = getMinPrice(len, nowTime);
        assert(msgValue >= minPrice) throw 204;

        var itemIndex: int = domain.hash();

        var configCell: cell = blockchain.configParam(dns_config_id);
        if (~ (configCell == null)) {
            var configCs: slice = configCell.beginParse();
            var config: cell = configCs.loadDict();
            var (configValue: slice, found: int) = config.uDictGet(256, itemIndex);
            assert(!(found)) throw 205;
        }

        var nftContent: cell = beginCell()
                .storeAddress(senderAddress)
                .storeRef(beginCell().storeSlice(domain).endCell())
                .endCell();
        deployNftItem(itemIndex, nftItemCode, nftContent);
        return;
    }

    if (op == OP_FILL_UP) { // just fill-up balance
        return;
    }
    throw 0xffff;
}

// Get methods

get fun get_collection_data(): (int, cell, slice) {
    var (content, nftItemCode) = loadData();
    return (-1, content, zeroAddress());
}

get fun get_nft_address_by_index(index: int): address {
    var (content, nftItemCode) = loadData();
    var stateInit: cell = calculateNftItemStateInit(index, nftItemCode);
    return calculateNftItemAddress(workchain(), stateInit);
}

get fun get_nft_content(index: int, individualNftContent: cell): cell {
    return individualNftContent;
}

get fun dnsresolve(subdomain: slice, category: int): (int, cell) {
    assert(mod(subdomain.remainingBitsCount(), 8) == 0) throw 70;

    var startsWithZeroByte: int = subdomain.preloadInt(8) == 0;

    if (startsWithZeroByte & (subdomain.remainingBitsCount() == 8)) { // "." requested
        return (8, null);  // resolved but no dns-records
    }
    if (startsWithZeroByte) {
        subdomain.loadUint(8);
    }

    var topSubdomainBits: int = getTopDomainBits(subdomain);
    var topSubdomain: slice = subdomain.loadBits(topSubdomainBits);
    var itemIndex: int = topSubdomain.hash();
    var result: cell = beginCell()
            .storeUint(dns_next_resolver_prefix, 16)
            .storeAddress(get_nft_address_by_index(itemIndex))
            .endCell();
    return (topSubdomainBits + (startsWithZeroByte ? 8 : 0), result);
}
