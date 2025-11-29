const DNS_NEXT_RESOLVER_PREFIX = 0xba93 // dns_next_resolver prefix - https://github.com/ton-blockchain/ton/blob/7e3df93ca2ab336716a230fceb1726d81bac0a06/crypto/block/block.tlb#L819
const AUCTION_START_TIME = 1659171600 // GMT: Monday, 30 July 2022 г., 09:00:00
const ONE_TON = 1000000000
const ONE_MONTH = 2592000
const ONE_YEAR = 31622400

const DNS_CONFIG_ID = 80 // dns black list config param; in testnet -80

const OP_FILL_UP = 0x370fec51
const OP_OUTBID_NOTIFICATION = 0x557cea20
const OP_CHANGE_DNS_RECORD = 0x4eb1f0f9
const OP_PROCESS_GOVERNANCE_DECISION = 0x44beae41

@pure
fun mod(x: int, y: int): int
    asm "MOD"

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

// fun checkDomainString(domain: slice): bool {
//     var i: int = 0;
//     val len: int = domain.remainingBitsCount();
//     var needBreak: bool = false;
//     do {
//         needBreak = i == len;
//         if (!needBreak) {
//             val char = domain.loadUint(8);
//             // we can do it because additional UTF-8 character's octets >= 128 -- https://www.ietf.org/rfc/rfc3629.txt
//             var is_hypen = (char == 45);
//             var validChar = (is_hypen && (i > 0) && (i < len - 8)) || ((char >= 48) && (char <= 57)) ||
//             ((char >= 97) && (char <= 122));
//             // (char == 45 && (i > 0) && (i < len - 8)) ||
//             // ((char >= 48) && (char <= 57)) ||
//             // ((char >= 97) && (char <= 122)); // '-' or 0-9 or a-z
//             needBreak = !validChar;
//             if (!needBreak) {
//                 i += 8;
//             }
//         }
//     } while (!needBreak);
//     return i == len;
// }
fun topDomainBits(domain: slice): int {
    var i: int = 0;
    var needBreak: bool = false;

    do {
        needBreak = domain.loadUint(8) == 0;
        if (!needBreak) {
            i += 8;
        }
    } while (!needBreak);

    assert (i != 0) throw 201;
    return i;
}

fun minPriceConfig(domainCharCount: int): (int, int) {
    return match (domainCharCount) {
        4 => (1000, 100),
        5 => (500, 50),
        6 => (400, 40),
        7 => (300, 30),
        8 => (200, 20),
        9 => (100, 10),
        10 => (50, 5),
        else => (10, 1),
    };
}

fun minPrice(domainBitsLength: int, nowTime: int): int {
    var minPrice = minPriceConfig(domainBitsLength / 8);

    minPrice.0 *= ONE_TON;
    minPrice.1 *= ONE_TON;

    val seconds = nowTime - AUCTION_START_TIME;
    val months = seconds / ONE_MONTH;
    if (months > 21) {
        return minPrice.1;
    }

    repeat (months) {
        minPrice.0 = minPrice.0 * 90 / 100;
    }

    return minPrice.0;
}
