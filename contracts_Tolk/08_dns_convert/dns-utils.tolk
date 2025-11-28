const one_month = 2592000 // 1 month in seconds = 60 * 60 * 24 * 30
const one_year = 31622400 // 1 year in seconds = 60 * 60 * 24 * 366
const auction_start_time = 1659171600 // GMT: Monday, 30 July 2022 г., 09:00:00
const one_ton = 1000000000
const dns_next_resolver_prefix = 0xba93 // dns_next_resolver prefix - https://github.com/ton-blockchain/ton/blob/7e3df93ca2ab336716a230fceb1726d81bac0a06/crypto/block/block.tlb#L819

const dns_config_id = 80 // dns black list config param; in testnet -80

const OP_FILL_UP = 0x370fec51
const OP_OUTBID_NOTIFICATION = 0x557cea20
const OP_CHANGE_DNS_RECORD = 0x4eb1f0f9
const OP_PROCESS_GOVERNANCE_DECISION = 0x44beae41
const OP_DNS_BALANCE_RELEASE = 0x4ed14b65

@pure
fun mod(x: int, y: int): int
    asm "MOD"

fun zeroAddress(): address {
    return beginCell().storeUint(0, 2).endCell().beginParse();
}

// "ton\0test\0" -> "ton"
fun getTopDomainBits(domain: slice): int {
    var i: int = 0;
    var needBreak: int = 0;
    do {
        var char: int = domain.loadUint(8); // we do not check domain.length because it MUST contains \0 character
        needBreak = char == 0;
        if (~needBreak) {
            i += 8;
        }
    } while (!needBreak);
    assert (!(i == 0)) throw 201; // starts with \0
    return i;
}

fun readDomainFromComment(inMsgBody: slice): slice {
    var needBreak: bool = false;
    var result: builder = beginCell();
    do {
        result = result.storeSlice(inMsgBody.loadBits(inMsgBody.remainingBitsCount()));
        var refsLen: int = inMsgBody.remainingRefsCount();
        needBreak = refsLen == 0;
        if (!needBreak) {
            assert (refsLen == 1) throw 202;
            inMsgBody = inMsgBody.loadRef().beginParse();
        }
    } while (!needBreak);
    return result.endCell().beginParse();
}

fun checkDomainString(domain: slice): bool {
    var i: int = 0;
    var len: int = domain.remainingBitsCount();
    var needBreak: bool = false;
    do {
        needBreak = i == len;
        if (!needBreak) {
            var char: int = domain.loadUint(8);
            // we can do it because additional UTF-8 character's octets >= 128 -- https://www.ietf.org/rfc/rfc3629.txt
            var isHyphen: bool = (char == 45);
            var validChar: bool = (isHyphen & (i > 0) & (i < len - 8)) |
            ((char >= 48) & (char <= 57)) |
            ((char >= 97) & (char <= 122)); // '-' or 0-9 or a-z

            needBreak = !validChar;
            if (!needBreak) {
                i += 8;
            }
        }
    } while (!needBreak);
    return i == len;
}

fun getMinPriceConfig(domainCharCount: int): (int, int) {
    if (domainCharCount == 4) {
        return (1000, 100);
    }
    if (domainCharCount == 5) {
        return (500, 50);
    }
    if (domainCharCount == 6) {
        return (400, 40);
    }
    if (domainCharCount == 7) {
        return (300, 30);
    }
    if (domainCharCount == 8) {
        return (200, 20);
    }
    if (domainCharCount == 9) {
        return (100, 10);
    }
    if (domainCharCount == 10) {
        return (50, 5);
    }
    return (10, 1);
}

fun getMinPrice(domainBitsLength: int, nowTime: int): int {
    var (startMinPrice: int, endMinPrice: int) = getMinPriceConfig(domainBitsLength / 8);
    startMinPrice *= one_ton;
    endMinPrice *= one_ton;
    var seconds: int = nowTime - auction_start_time;
    var months: int = seconds / one_month;
    if (months > 21) {
        return endMinPrice;
    }
    repeat (months) {
        startMinPrice = startMinPrice * 90 / 100;
    }
    return startMinPrice;
}
