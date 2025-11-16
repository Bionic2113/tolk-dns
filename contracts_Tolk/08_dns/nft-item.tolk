// import "@stdlib/gas-payments"
import "@stdlib/tvm-dicts"
import "dns-utils"
import "errors"
import "messages"
import "storage"

fun min_tons_for_storage(): int
    asm "1000000000 PUSHINT" // 1 TON

const AUCTION_START_DURATION = 604800 // 1 week = 60 * 60 * 24 * 7; in testnet 5 min
const AUCTION_END_DURATION = 3600 // 1 hour = 60 * 60; in testnet 1 min
const AUCTION_PROLONGATION = 3600 // 1 hour = 60 * 60; in testnet 1 min
/*
;;
;;  Storage
;;
;;  uint64 index
;;  MsgAddressInt collection_address
;;  MsgAddressInt owner_address
;;  cell content
;;
struct NftItemStorage {
    itemIndex: uint64
    collectionAddress: address
    ownerAddress: address
    content: cell //Cell<SnakeString>
    domain: cell
    auction: cell
    lastFillUpTime: uint64
}

(int, int, slice, slice, cell) load_data() {
    slice ds = get_data().begin_parse();
    var (index, collection_address) = (ds~load_uint(64), ds~load_msg_addr());
    if (ds.slice_bits() > 0) {
      return (-1, index, collection_address, ds~load_msg_addr(), ds~load_ref());
    } else {
      return (0, index, collection_address, null(), null()); ;; nft not initialized yet
    }
}

() store_data(int index, slice collection_address, slice owner_address, cell content) impure {
    set_data(
        begin_cell()
            .store_uint(index, 64)
            .store_slice(collection_address)
            .store_slice(owner_address)
            .store_ref(content)
            .end_cell()
    );
}
*/
fun packAuction(maxBidAddress: address, maxBidAmount: coins, auctionEndTime: int): cell {
    return beginCell().storeAddress(maxBidAddress).storeCoins(maxBidAmount).storeUint(
        auctionEndTime,
        64
    )
        .endCell();
}

fun unpackAuction(auction: cell?): (address, coins, uint64) {
    if (auction != null) {
        var ds: slice = auction.beginParse();
        return (ds.loadAddress(), ds.loadCoins(), ds.loadUint(64));
    }

    return (createAddressNone(), 0, 0); // return (null, 0, 0);
}

fun auctionCheck(storage: NftItemStorage, msgBalance: coins, auctionComplete: bool) {
    if (!auctionComplete || storage.auction == null) {
        return;
    }

    val auction = unpackAuction(storage.auction);

    var myBalance = contract.getOriginalBalance();
    val balanceWithoutMsg = myBalance - msgBalance;
    val amountToSend: coins = (auction.1 > balanceWithoutMsg - min_tons_for_storage())
         ? (balanceWithoutMsg - min_tons_for_storage())
         : auction.1;

    if (amountToSend > 0) {
        val msg = createMessage({
            bounce: false,
            dest: auction.0,
            value: amountToSend,
            body: JustFillUp { queryID: blockchain.logicalTime() },
        });

        msg.send(SEND_MODE_PAY_FEES_SEPARATELY);
        myBalance -= amountToSend;
    }

    storage.ownerAddress = auction.0;
    storage.auction = createEmptyCell();
    storage.save();
}

fun transwerOwnership(
    originalForwardFee: coins,
    forwardTonAmount: coins,
    newOwnerAddress: address,
    sendExcessesTo: address,
    queryId: uint64,
    forwardPayload: RemainingBitsAndRefs,
    storage: NftItemStorage,
) {
    assert (newOwnerAddress.getWorkchain() == BASECHAIN) throw ERROR_INVALID_WORKCHAIN;

    val fwdFee = originalForwardFee;
    var restAmount = contract.getOriginalBalance() - min_tons_for_storage();
    if (forwardTonAmount) {
        restAmount -= (forwardTonAmount + fwdFee);
    }
    var needResponse = sendExcessesTo.isInternal();
    if (needResponse) {
        assert (sendExcessesTo.getWorkchain() == BASECHAIN) throw ERROR_INVALID_WORKCHAIN;
        restAmount -= fwdFee;
    }

    assert (
        restAmount >= 0
    ) throw ERROR_TOO_SMALL_REST_AMOUNT; // base nft spends fixed amount of gas, will not check for response

    if (forwardTonAmount) {
        val ownershipMsg = createMessage({
            bounce: false,
            dest: newOwnerAddress,
            value: forwardTonAmount,
            body: NotificationForNewOwner {
                queryID: queryId,
                oldOwnerAddress: storage.ownerAddress,
                payload: forwardPayload,
            },
        });
        ownershipMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
    }

    if (needResponse) {
        val excessesMsg = createMessage({
            bounce: false,
            dest: sendExcessesTo,
            value: restAmount,
            body: ReturnExcessesBack { queryID: queryId },
        });
        excessesMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
    }

    storage.ownerAddress = newOwnerAddress;
    storage.save();
}

type AllowedMessageToNftItem =
    | AuctionCheck
    | AskToChangeOwnership
    | EditContent
    | ChangeDNSRecord
    | ProcessGovernanceDecision
    | DNSBalanceRelease
    | RequestStaticData

// Тут не все. Надо проверить и дописать
fun onInternalMessage(in: InMessage) {
    var loadingStorage = startLoadingNftItemStorage();
    if (!loadingStorage.isInitialized()) {
        val uninitedSt = loadingStorage.parseNotInitialized();
        assert (in.senderAddress == uninitedSt.collectionAddress) throw ERROR_NOT_FROM_COLLECTION;

        val seconds: int = blockchain.now() - AUCTION_START_TIME;
        var months = seconds / ONE_MONTH;
        if (months > 12) {
            months = 12;
        }

        val duration = AUCTION_START_DURATION -
        (AUCTION_START_DURATION - AUCTION_END_DURATION) * months / 12;
        val auctionEndTime = blockchain.now() + duration;

        val storage = NftItemStorage {
            itemIndex: uninitedSt.itemIndex,
            collectionAddress: uninitedSt.collectionAddress,
            ownerAddress: createAddressNone(),
            content: beginCell().storeUint(0, 8).storeDict(createEmptyDict()).endCell(),
            domain: in.body.loadRef(),
            auction: packAuction(in.senderAddress, in.valueCoins, auctionEndTime),
            lastFillUpTime: blockchain.now(),
        };

        storage.save();
        return;
    }

    var storage = loadingStorage.parseInitialized();

    if (storage.collectionAddress == in.senderAddress) {
        val respMsg = createMessage({
            bounce: false,
            dest: in.senderAddress,
            value: 0,
            body: CreaterResponse { queryID: blockchain.logicalTime() },
        });

        respMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        return;
    }

    var auction = unpackAuction(storage.auction);

    val auctionComplete: bool = blockchain.now() > auction.2;

    var msg = lazy AllowedMessageToNftItem.fromSlice(in.body);

    match (msg) {
        AuctionCheck => {
            if (auctionComplete) {
                assert (
                    in.senderAddress == storage.ownerAddress
                ) throw 406; // only owner can fill-up balance, prevent coins lost right after the auction
                // if owner send bid right after auction he can restore it by transfer resonse message
                storage.lastFillUpTime = blockchain.now();
                storage.save();

                return;
            }

            assert (
                in.valueCoins >= mulDivFloor(auction.1, 105, 100)
            ) throw 407; //  5% greater then previous bid

            val myBalance = contract.getOriginalBalance();
            val amountToSend: coins = (auction.1 > myBalance - min_tons_for_storage())
                 ? (myBalance - min_tons_for_storage())
                 : auction.1;

            if (amountToSend > 0) {
                val msg = createMessage({
                    bounce: false,
                    dest: auction.0,
                    value: amountToSend,
                    body: Refund { queryID: blockchain.logicalTime() },
                });

                msg.send(SEND_MODE_PAY_FEES_SEPARATELY);
            }

            auction.0 = in.senderAddress;
            auction.1 = in.valueCoins;

            val deltaTime = AUCTION_PROLONGATION - (auction.2 - blockchain.now());
            if (deltaTime > 0) {
                auction.2 += deltaTime;
            }

            storage.auction = auction.toCell();
            storage.lastFillUpTime = blockchain.now();
            storage.save();

            return;
        }

        AskToChangeOwnership => {
            auctionCheck(storage, in.valueCoins, auctionComplete);

            assert (in.senderAddress == storage.ownerAddress) throw ERROR_NOT_FROM_OWNER;

            // assert (msg.forwardPayload.remainingBitsCount()) throw ERROR_INCORRECT_FORWARD_PAYLOAD;
            transwerOwnership(
                in.originalForwardFee,
                msg.forwardTonAmount,
                msg.newOwnerAddress,
                msg.sendExcessesTo,
                msg.queryId,
                msg.forwardPayload,
                storage
            );
        }

        EditContent => {
            auctionCheck(storage, in.valueCoins, auctionComplete);

            assert (in.senderAddress == storage.ownerAddress) throw 410;

            storage.content = msg.ref;
            storage.lastFillUpTime = blockchain.now();
            storage.save();
        }

        ChangeDNSRecord => {
            auctionCheck(storage, in.valueCoins, auctionComplete);

            assert (in.senderAddress == storage.ownerAddress) throw 411;

            var cs = storage.content.beginParse();

            assert (cs.loadUint(8) == 0) throw 412;

            var map = cs.loadDict();

            if (msg.refs.remainingRefsCount() > 0) {
                map.uDictSetRef(256, msg.key, msg.refs.loadRef());
            } else {
                map.uDictDelete(256, msg.key);
            }

            storage.content = beginCell().storeUint(0, 8).storeDict(map).endCell();
            storage.save();
        }

        ProcessGovernanceDecision => {
            auctionCheck(storage, in.valueCoins, auctionComplete);

            assert (storage.auction == null) throw 413;

            var cs = blockchain.configParam(DNS_CONFIG_ID)!.beginParse();
            val config = cs.loadDict();

            var cfg = config.uDictGet(256, storage.itemIndex);

            assert (cfg.1) throw 415;

            val cfg_op = cfg.0!.loadUint(8);

            assert (cfg_op == 0 || cfg_op == 1) throw 416;

            if (cfg_op == 0) {
                // transfer
                transwerOwnership(
                    in.originalForwardFee,
                    msg.forwardTonAmount,
                    msg.newOwnerAddress,
                    msg.sendExcessesTo,
                    msg.queryID,
                    msg.forwardPayload,
                    storage
                );
            }

            if (cfg_op == 1) {
                // destroy
                val respondMsg = createMessage({
                    bounce: false,
                    dest: storage.collectionAddress,
                    value: 0,
                    body: JustFillUp { queryID: msg.queryID },
                });

                respondMsg.send(SEND_MODE_CARRY_ALL_BALANCE + SEND_MODE_DESTROY);
            }
        }

        DNSBalanceRelease => {
            auctionCheck(storage, in.valueCoins, auctionComplete);

            assert (
                (blockchain.now() - storage.lastFillUpTime > ONE_YEAR) && (storage.auction == null)
            ) throw 414;

            val minPrice = minPrice(
                storage.domain.beginParse().remainingBitsCount(),
                blockchain.now()
            );

            assert (in.valueCoins >= minPrice) throw 407;

            val balanceWithoutMsg = contract.getOriginalBalance() - in.valueCoins;
            val amountToSend = balanceWithoutMsg - min_tons_for_storage();

            if (amountToSend > 0) {
                val respMsg = createMessage({
                    bounce: false,
                    dest: storage.ownerAddress,
                    value: amountToSend,
                    body: msg,
                });

                respMsg.send(SEND_MODE_IGNORE_ERRORS);
            }

            val auctionEndTime = blockchain.now() + AUCTION_START_DURATION; // always 1 week
            storage.ownerAddress = createAddressNone();
            storage.auction = packAuction(in.senderAddress, in.valueCoins, auctionEndTime);

            storage.save();
            return;
        }

        RequestStaticData => {
            val respondMsg = createMessage({
                bounce: false,
                dest: in.senderAddress,
                value: 0,
                // why ever, in FunC implementation, item index was encoded as 256-bit (not 64-bit),
                // do the same here to pass FunC tests;
                // but since a response becomes too long (64 + 256 + address), the compiler will create a ref;
                // force the compiler not to create a ref, because it's guaranteed that with
                // value (coins) = 0 it will nevertheless fit into a message cell directly
                body: UnsafeBodyNoRef {
                    forceInline: ResponseStaticData {
                        queryId: msg.queryId,
                        itemIndex: storage.itemIndex as uint256,
                        collectionAddress: storage.collectionAddress,
                    },
                },
            });
            respondMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }

        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

struct NftDataReply {
    isInitialized: bool
    itemIndex: int
    collectionAddress: address
    ownerAddress: address? = null
    content: cell? = null // Cell<SnakeString>? = null
}

get fun get_nft_data(): NftDataReply {
    var loadingStorage = startLoadingNftItemStorage();
    if (!loadingStorage.isInitialized()) {
        val uninitedSt = loadingStorage.parseNotInitialized();
        return {
            isInitialized: false,
            itemIndex: uninitedSt.itemIndex,
            collectionAddress: uninitedSt.collectionAddress,
        };
    }

    val storage = loadingStorage.parseInitialized();
    return {
        isInitialized: true,
        itemIndex: storage.itemIndex,
        collectionAddress: storage.collectionAddress,
        ownerAddress: storage.ownerAddress,
        content: storage.content,
    };
}
