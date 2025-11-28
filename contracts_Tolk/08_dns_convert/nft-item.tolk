import "@stdlib/tvm-dicts"

// Domain smart contract (implement NFT item interface)
@pure
fun minTonsForStorage(): int
    asm "1000000000 PUSHINT" // 1 TON

const auction_start_duration = 604800 // 1 week = 60 * 60 * 24 * 7; in testnet 5 min
const auction_end_duration = 3600 // 1 hour = 60 * 60; in testnet 1 min
const auction_prolongation = 3600 // 1 hour = 60 * 60; in testnet 1 min

//  MsgAddressInt max_bid_address
//  Coins max_bid_amount
//  int auction_end_time
fun unpackAuction(auction: cell): (slice, int, int) {
    if ((auction == null)) {
        return (null, 0, 0);
    } else {
        var ds: slice = auction.beginParse();
        return (ds.loadAddress(), ds.loadCoins(), ds.loadUint(64));
    }
}

fun packAuction(maxBidAddress: address, maxBidAmount: int, auctionEndTime: int): cell {
    return beginCell().storeAddress(maxBidAddress).storeCoins(maxBidAmount).storeUint(
        auctionEndTime,
        64
    )
        .endCell();
}

//
//  Storage
//
//  uint256 index
//  MsgAddressInt collection_address
//  MsgAddressInt owner_address
//  cell content
//  cell domain - e.g contains "alice" (without ending \0) for "alice.ton" domain
//  cell auction - auction info
//  int last_fill_up_time
fun loadData(): (int, int, slice, slice, cell, cell, cell, int) {
    var ds: slice = contract.getData().beginParse();
    var (index, collectionAddress) = (ds.loadUint(256), ds.loadAddress());
    if (ds.remainingBitsCount() > 0) {
        return (
            -1,
            index,
            collectionAddress,
            ds.loadAddress(),
            ds.loadRef(),
            ds.loadRef(),
            ds.loadDict(),
            ds.loadUint(64)
        );
    } else {
        return (0, index, collectionAddress, null, null, null, null, 0); // nft not initialized yet
    }
}

fun storeData(
    index: int,
    collectionAddress: address,
    ownerAddress: address,
    content: cell,
    domain: cell,
    auction: cell,
    lastFillUpTime: int,
) {
    contract.setData(beginCell().storeUint(index, 256).storeAddress(collectionAddress).storeAddress(ownerAddress)
        .storeRef(content)
        .storeRef(domain)
        .storeDict(auction)
        .storeUint(lastFillUpTime, 64)
        .endCell());
}

@inline
fun sendMsg(toAddress: address, amount: int, op: int, queryId: int, payload: builder, sendMode: int) {
    var msg = beginCell().storeUint(0x10, 6) // nobounce - int_msg_info$0 ihr_disabled:Bool bounce:Bool bounced:Bool src:MsgAddress -> 010000
        .storeAddress(toAddress)
        .storeCoins(amount)
        .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
        .storeUint(op, 32)
        .storeUint(queryId, 64);

    if (~(payload == null)) {
        msg = msg.storeBuilder(payload);
    }

    sendRawMessage(msg.endCell(), sendMode);
}

@inline
fun transferOwnership(
    myBalance: int,
    index: int,
    collectionAddress: address,
    ownerAddress: address,
    content: cell,
    senderAddress: address,
    queryId: int,
    inMsgBody: slice,
    fwdFees: int,
    domain: cell,
    auction: cell,
) {
    var newOwnerAddress: address = inMsgBody.loadAddress();
    forceChain(newOwnerAddress);
    var responseDestination: slice = inMsgBody.loadAddress();
    inMsgBody.loadInt(1); // this nft don't use custom_payload
    var forwardAmount: int = inMsgBody.loadCoins();

    var restAmount: int = myBalance - minTonsForStorage();
    if (forwardAmount) {
        restAmount -= (forwardAmount + fwdFees);
    }
    var needResponse: int = responseDestination.preloadUint(2) != 0; // if NOT addr_none: 00
    if (needResponse) {
        restAmount -= fwdFees;
    }

    assert (
        restAmount >= 0
    ) throw 402; // base nft spends fixed amount of gas, will not check for response

    if (forwardAmount) {
        sendMsg(
            newOwnerAddress,
            forwardAmount,
            OP_OWNERSHIP_ASSIGNED(),
            queryId,
            beginCell().storeAddress(ownerAddress).storeSlice(inMsgBody),
            1
        ); // paying fees, revert on errors
    }
    if (needResponse) {
        forceChain(responseDestination);
        sendMsg(responseDestination, restAmount, OP_EXCESSES(), queryId, null, 1); // paying fees, revert on errors
    }

    storeData(index, collectionAddress, newOwnerAddress, content, domain, auction, blockchain.now());
}

// in the future, use: fun onInternalMessage(in: InMessage) {
fun onInternalMessage(msgValue: int, inMsgFull: cell, inMsgBody: slice) {
    var myBalance: int = contract.getOriginalBalance();
    var cs: slice = inMsgFull.beginParse();
    var flags: int = cs.loadUint(4);

    if (flags & 1) {
        // ignore all bounced messages
        return;
    }
    var senderAddress: address = cs.loadAddress();

    cs.loadAddress(); // skip dst
    cs.loadCoins(); // skip value
    cs.skipBits(1); // skip extracurrency collection
    cs.loadCoins(); // skip ihr_fee
    var fwdFee: int = cs.loadCoins(); // we use message fwd_fee for estimation of forward_payload costs

    var (
        isInit: int, index: int, collectionAddress: address, ownerAddress: address, content: cell, domain: cell, auction: cell, lastFillUpTime: int
    ) = loadData();
    if (~isInit) {
        assert (collectionAddress.bitsEqual(senderAddress)) throw 405;
        var fromAddress: address = inMsgBody.loadAddress();
        var domain: cell = inMsgBody.loadRef();

        var content: cell = beginCell().storeUint(0, 8).storeDict(createEmptyDict()).endCell();

        var seconds: int = blockchain.now() - auction_start_time;
        var months: int = seconds / one_month;
        if (months > 12) {
            months = 12;
        }
        var duration: int = auction_start_duration -
        (auction_start_duration - auction_end_duration) * months / 12;

        var auctionEndTime: int = blockchain.now() + duration;
        storeData(
            index,
            collectionAddress,
            zeroAddress(),
            content,
            domain,
            packAuction(fromAddress, msgValue, auctionEndTime),
            blockchain.now()
        );
        return;
    }

    if (isInit & collectionAddress.bitsEqual(senderAddress)) {
        var fromAddress: address = inMsgBody.loadAddress();
        sendMsg(fromAddress, 0, 0, blockchain.logicalTime(), null, 64); // carry all the remaining value of the inbound message
        return;
    }

    var op: int = inMsgBody.isEmpty() ? 0 : inMsgBody.loadUint(32);

    var (maxBidAddress: address, maxBidAmount: int, auctionEndTime: int) = unpackAuction(auction);

    var auctionComplete: int = blockchain.now() > auctionEndTime;

    if (op == 0) {
        if (auctionComplete) {
            assert (
                senderAddress.bitsEqual(ownerAddress)
            ) throw 406; // only owner can fill-up balance, prevent coins lost right after the auction
            // if owner send bid right after auction he can restore it by transfer resonse message
            storeData(
                index,
                collectionAddress,
                ownerAddress,
                content,
                domain,
                auction,
                blockchain.now()
            );
        } else {
            assert (
                msgValue >= mulDivFloor(maxBidAmount, 105, 100)
            ) throw 407; // 5% greater then previous bid
            var amountToSend: int = (maxBidAmount > myBalance - minTonsForStorage())
                ? (myBalance - minTonsForStorage())
                : maxBidAmount;
            if (amountToSend > 0) {
                sendMsg(
                    maxBidAddress,
                    amountToSend,
                    OP_OUTBID_NOTIFICATION,
                    blockchain.logicalTime(),
                    null,
                    1
                ); // pay transfer fees separately
            }
            maxBidAmount = msgValue;
            maxBidAddress = senderAddress;
            var deltaTime: int = auction_prolongation - (auctionEndTime - blockchain.now());
            if (deltaTime > 0) {
                auctionEndTime += deltaTime;
            }
            storeData(
                index,
                collectionAddress,
                ownerAddress,
                content,
                domain,
                packAuction(maxBidAddress, maxBidAmount, auctionEndTime),
                blockchain.now()
            );
        }

        return;
    }

    var queryId: int = inMsgBody.loadUint(64);

    if ((auctionComplete) & (~(auction == null))) {
        // take domain after auction
        var balanceWithoutMsg: int = myBalance - msgValue;
        var amountToSend: int = (maxBidAmount > balanceWithoutMsg - minTonsForStorage())
            ? (balanceWithoutMsg - minTonsForStorage())
            : maxBidAmount;
        if (amountToSend > 0) {
            sendMsg(collectionAddress, amountToSend, OP_FILL_UP, queryId, null, 2); // ignore errors
            myBalance -= amountToSend;
        }
        ownerAddress = maxBidAddress;
        auction = null;
        storeData(index, collectionAddress, ownerAddress, content, domain, auction, lastFillUpTime);
    }

    if (op == OP_TRANSFER()) {
        assert (senderAddress.bitsEqual(ownerAddress)) throw 401;
        transferOwnership(
            myBalance,
            index,
            collectionAddress,
            ownerAddress,
            content,
            senderAddress,
            queryId,
            inMsgBody,
            fwdFee,
            domain,
            auction
        );
        return;
    }
    if (op == OP_EDIT_CONTENT()) {
        // owner can change content and dns records
        assert (senderAddress.bitsEqual(ownerAddress)) throw 410;
        storeData(
            index,
            collectionAddress,
            ownerAddress,
            inMsgBody.loadRef(),
            domain,
            auction,
            blockchain.now()
        );
        return;
    }
    if (op == OP_CHANGE_DNS_RECORD) {
        // change dns record
        assert (senderAddress.bitsEqual(ownerAddress)) throw 411;
        var key: int = inMsgBody.loadUint(256);
        var hasValue: int = inMsgBody.remainingRefsCount() > 0;

        var cs: slice = content.beginParse();
        assert (cs.loadUint(8) == 0) throw 412; // data onchain tag
        var keyvalueMap: cell = cs.loadDict();

        if (hasValue) {
            var value: cell = inMsgBody.loadRef();

            keyvalueMap.uDictSetRef(256, key, value);
        } else {
            keyvalueMap.uDictDelete(256, key);
        }

        content = beginCell().storeUint(0, 8).storeDict(keyvalueMap).endCell();

        storeData(
            index,
            collectionAddress,
            ownerAddress,
            content,
            domain,
            auction,
            blockchain.now()
        );
        return;
    }
    if (op == OP_PROCESS_GOVERNANCE_DECISION) {
        // governance
        assert ((auction == null)) throw 413;
        var cs: slice = blockchain.configParam(dns_config_id).beginParse();
        var config: cell = cs.loadDict();
        var (configValue: slice, found: int) = config.uDictGet(256, index);
        assert (found) throw 415;
        var configOp: int = configValue.loadUint(8);
        assert ((configOp == 0) | (configOp == 1)) throw 416;
        if (configOp == 0) {
            // transfer
            transferOwnership(
                myBalance,
                index,
                collectionAddress,
                ownerAddress,
                content,
                senderAddress,
                queryId,
                configValue,
                fwdFee,
                domain,
                auction
            );
        }
        if (configOp == 1) {
            // destroy
            sendMsg(collectionAddress, 0, OP_FILL_UP, queryId, null, 128 + 32); // carry all the remaining balance + destroy
        }
        return;
    }
    if (op == OP_DNS_BALANCE_RELEASE) {
        // release domain
        assert ((blockchain.now() - lastFillUpTime > one_year) & ((auction == null))) throw 414;
        var minPrice: int = getMinPrice(domain.beginParse().remainingBitsCount(), blockchain.now());
        assert (msgValue >= minPrice) throw 407;
        var balanceWithoutMsg: int = myBalance - msgValue;
        var amountToSend: int = balanceWithoutMsg - minTonsForStorage();
        if (amountToSend > 0) {
            sendMsg(ownerAddress, amountToSend, OP_DNS_BALANCE_RELEASE, queryId, null, 2); // ignore errors
        }
        maxBidAmount = msgValue;
        maxBidAddress = senderAddress;
        auctionEndTime = blockchain.now() + auction_start_duration; // always 1 week
        ownerAddress = zeroAddress();
        auction = packAuction(maxBidAddress, maxBidAmount, auctionEndTime);
        storeData(
            index,
            collectionAddress,
            ownerAddress,
            content,
            domain,
            auction,
            blockchain.now()
        );
        return;
    }
    if (op == OP_GET_STATIC_DATA()) {
        sendMsg(
            senderAddress,
            0,
            OP_REPORT_STATIC_DATA(),
            queryId,
            beginCell().storeUint(index, 256).storeAddress(collectionAddress),
            64
        ); // carry all the remaining value of the inbound message
        return;
    }
    throw 0xffff;
}

//
//  GET Methods
//
get fun get_nft_data(): (int, int, slice, slice, cell) {
    var (
        isInit: int, index: int, collectionAddress: address, ownerAddress: address, content: cell, domain: cell, auction: cell, lastFillUpTime: int
    ) = loadData();
    return (isInit, index, collectionAddress, ownerAddress, content);
}

get fun get_editor(): slice {
    var (
        isInit: int, index: int, collectionAddress: address, ownerAddress: address, content: cell, domain: cell, auction: cell, lastFillUpTime: int
    ) = loadData();
    return ownerAddress;
}

get fun get_domain(): slice {
    var (
        isInit: int, index: int, collectionAddress: address, ownerAddress: address, content: cell, domain: cell, auction: cell, lastFillUpTime: int
    ) = loadData();
    return domain.beginParse();
}

get fun get_auction_info(): (slice, int, int) {
    var (
        isInit: int, index: int, collectionAddress: address, ownerAddress: address, content: cell, domain: cell, auction: cell, lastFillUpTime: int
    ) = loadData();
    return unpackAuction(auction);
}

get fun get_last_fill_up_time(): int {
    var (
        isInit: int, index: int, collectionAddress: address, ownerAddress: address, content: cell, domain: cell, auction: cell, lastFillUpTime: int
    ) = loadData();
    return lastFillUpTime;
}

get fun dnsresolve(subdomain: slice, category: int): (int, cell) {
    var subdomainBits: int = subdomain.remainingBitsCount();

    assert (mod(subdomainBits, 8) == 0) throw 70;

    var (
        isInit: int, index: int, collectionAddress: address, ownerAddress: address, content: cell, myDomainCell: cell, auction: cell, lastFillUpTime: int
    ) = loadData();

    var cs: slice = content.beginParse();
    assert (cs.loadUint(8) == 0) throw 412; // data onchain tag
    var keyvalueMap: cell = cs.loadDict();

    var startsWithZeroByte: int = subdomain.preloadInt(8) == 0;
    assert (startsWithZeroByte) throw 413;

    if (subdomainBits > 8) {
        // more than "." requested
        category = stringSha256("dns_next_resolver");
    }

    if (category == 0) {
        //  all categories are requested
        return (8, keyvalueMap);
    }

    var (value: cell, found: int) = keyvalueMap.uDictGetRef(256, category);
    return (8, value);
}
