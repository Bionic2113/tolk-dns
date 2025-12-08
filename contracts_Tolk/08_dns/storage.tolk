struct NftCollectionStorage {
    content: cell
    nftItemCode: cell
}

// actual storage of an NFT item is tricky: it's either initialized or not;
// after NFT has been inited, it's represented as `NftItemStorage`;
// before initialization, it has only itemIndex and collectionAddress: `NftItemStorageNotInitialized`;
// hence, we start parsing it, that then we detect, whether it's inited or not
struct NftItemStorageMaybeNotInitialized {
    contractData: slice
}

// how do we detect whether it's initialized or not?
// the answer: when "inited", we store `content` (cell),
// so, we have a ref, and for uninited, we don't have a ref
fun NftItemStorageMaybeNotInitialized.isInitialized(self) {
    val hasContent = self.contractData.remainingRefsCount();
    return hasContent;
}

fun NftItemStorageMaybeNotInitialized.parseNotInitialized(self) {
    return NftItemStorageNotInitialized.fromSlice(self.contractData);
}

fun NftItemStorageMaybeNotInitialized.parseInitialized(self) {
    return NftItemStorage.fromSlice(self.contractData);
}

fun startLoadingNftItemStorage(): NftItemStorageMaybeNotInitialized {
    return { contractData: contract.getData().beginParse() };
}

struct NftItemStorage {
    itemIndex: uint256
    collectionAddress: address
    ownerAddress: address?
    content: cell
    domain: cell
    auction: cell?
    lastFillUpTime: uint64
}

fun NftItemStorage.save(self) {
    contract.setData(self.toCell());
}

struct NftItemStorageNotInitialized {
    itemIndex: uint256
    collectionAddress: address
}

fun NftCollectionStorage.load() {
    return NftCollectionStorage.fromCell(contract.getData());
}

fun NftCollectionStorage.save(self) {
    contract.setData(self.toCell());
}

fun calcDeployedNftItem(itemIndex: uint256, collectionAddress: address, nftItemCode: cell): AutoDeployAddress {
    val emptyNftItemStorage: NftItemStorageNotInitialized = { itemIndex, collectionAddress };

    return { stateInit: { code: nftItemCode, data: emptyNftItemStorage.toCell() } };
}

struct NftDataReply {
    isInitialized: bool
    itemIndex: int
    collectionAddress: address
    ownerAddress: address? = null
    content: cell? = null
}

struct ContentNFT {
    sender: address
    domain: Cell<Domain>
}

struct Domain {
    domain: slice
}

struct ConfigValue {
    newOwnerAddress: address
    sendExcessesTo: address?
    dontUseCustomPayload: int1
    forwardTonAmount: coins
    forwardPayload: RemainingBitsAndRefs
}
