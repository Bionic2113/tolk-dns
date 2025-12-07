struct (0x370fec51) JustFillUp {
    queryID: uint64
}

type DomainSlice = slice

struct (0x00000000) DeployNft {
    domain: DomainSlice
}

fun DomainSlice.unpackFromSlice(mutate comment: slice) {
    var needBreak: bool = false;
    var domain: builder = beginCell();

    do {
        domain.storeSlice(comment.loadBits(comment.remainingBitsCount()));

        val refsLen = comment.remainingRefsCount();
        needBreak = refsLen == 0;

        if (!needBreak) {
            assert (refsLen == 1) throw 202;
            comment = comment.loadRef().beginParse();
        }
    } while (!needBreak);

    return domain.toSlice();
}

struct (0x00000000) AuctionCheck {}

struct (0x05138d91) NotificationForNewOwner {
    queryID: uint64
    oldOwnerAddress: address
    payload: RemainingBitsAndRefs
}

struct (0x1a0b9d51) EditContent {
    queryID: uint64
    ref: cell
}

struct (0xd53276db) ReturnExcessesBack {
    queryID: uint64
}

struct (0x557cea20) Refund {
    queryID: uint64
}

struct (0x5fcc3d14) Transfer {
    queryID: uint64
    newOwnerAddress: address
    sendExcessesTo: address?
    dontUseCustomPayload: int1
    forwardTonAmount: coins
    forwardPayload: RemainingBitsAndRefs
}

struct (0x4eb1f0f9) ChangeDNSRecord {
    queryID: uint64
    key: uint256
    refs: RemainingBitsAndRefs
}

struct (0x44beae41) ProcessGovernanceDecision {
    queryID: uint64
}

struct (0x4ed14b65) DNSBalanceRelease {
    queryID: uint64
}

struct (0x2fcb26a2) StaticDataRequest {
    queryID: uint64
}

struct (0x8b771735) StaticDataResponse {
    queryID: uint64
    itemIndex: uint256
    collectionAddress: address
}

struct (0xba93) ResolveResponse {
    next: address
}
