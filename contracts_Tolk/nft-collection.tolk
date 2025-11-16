import "@stdlib/tvm-dicts"
import "dns-utils"
import "messages"
import "storage"

fun saveData(content: cell, nftItemCode: cell) {
    contract.setData(beginCell().storeRef(content).storeRef(nftItemCode).endCell());
}

fun deployNftItem(itemIndex: uint256, nftItemCode: cell, nftContent: Cell<ContentNFT>) {
    val deployMsg = createMessage({
        bounce: true,
        dest: calcDeployedNftItem(itemIndex, contract.getAddress(), nftItemCode),
        value: 0,
        body: nftContent,
    });
    deployMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

type AllowedMessageToDNS = DeployNftMsg | JustFillUp

fun onInternalMessage(in: InMessage) {
    assert (!in.body.isEmpty()) throw 0xFFFF;

    val msg = lazy AllowedMessageToDNS.fromSlice(in.body);
    match (msg) {
        JustFillUp => {
            return;
        }

        DeployNftMsg => {
            val now_time = blockchain.now();
            assert (now_time > AUCTION_START_TIME) throw 199;

            val storage = DeployNft.load(in.body);
            val len: int = storage.domain.remainingBitsCount();

            assert (len > 3 * 8) throw 200; // minimum 4 characters
            assert (len <= 126 * 8) throw 201; // maximum 126 characters
            assert (mod(len, 8) == 0) throw 202;
            assert (checkDomainString(storage.domain)) throw 203;
            assert (msg_value >= minPrice(len, now_time)) throw 204;
            val itemIndex: uint256 = storage.domain.hash();

            val config: cell? = blockchain.configParam(DNS_CONFIG_ID);
            if (config != null) {
                val element = config.beginParse().loadDict().uDictGet(256, itemIndex);
                assert (!element.1) throw 205;
            }

            val nftStorage = lazy NftCollectionStorage.load();
            val nftContent = ContentNFT {
                sender: in.senderAddress,
                domain: beginCell().storeSlice(storage.domain).endCell(),
            };
            // beginCell().storeAddress(in.senderAddress).storeRef(beginCell().storeSlice(storage
            //     .domain)
            //     .endCell())
            //     .endCell();
            deployNftItem(itemIndex, nftStorage.nftItemCode, nftContent.toCell());
        }

        else => {
            throw 0xffff;
        }
    }
}

struct CollectionDataReply {
    nextItemIndex: int
    collectionMetadata: cell
    adminAddress: address
}

get fun get_collection_data(): CollectionDataReply {
    val storage = lazy NftCollectionStorage.load();

    return {
        nextItemIndex: -1,
        collectionMetadata: storage.content,
        adminAddress: createAddressNone(),
    };
}

get fun get_nft_address_by_index(itemIndex: int): address {
    val storage = lazy NftCollectionStorage.load();
    val nftDeployed = calcDeployedNftItem(itemIndex, contract.getAddress(), storage.nftItemCode);
    return address.fromValidBuilder(nftDeployed.buildAddress()); //beginCell().storeAddress(contract.getAddress()));
}

get fun get_nft_content(itemIndex: int, individualNftContent: cell): cell {
    return individualNftContent;
}

get fun dnsresolve(subdomain: slice, category: int): (int, cell) {
    val subdomainLen = subdomain.remainingBitsCount();

    assert (mod(subdomainLen, 8) == 0) throw 70;

    val startsWithZeroByte: bool = subdomain.preloadInt(8) == 0;

    if (startsWithZeroByte && subdomainLen == 8) {
        return (8, nullCell());
    }

    if (startsWithZeroByte) {
        subdomain.loadUint(8);
    }

    val topSubdomainBits: int = topDomainBits(subdomain);
    val item_index = subdomain.loadBits(topSubdomainBits).hash();

    // return (topSubdomainBits, beginCell().endCell());
    return (
        topSubdomainBits + (startsWithZeroByte ? 8 : 0),
        beginCell().storeUint(DNS_NEXT_RESOLVER_PREFIX, 16).storeAddress(get_nft_address_by_index(item_index))
            .endCell()
    );
}
