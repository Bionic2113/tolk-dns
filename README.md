# "Tolk vs FunC" gas benchmarks

This repository demonstrates how real smart contracts look in **Tolk** — and how efficient they can be.

I took several standard contracts from the TON ecosystem (Jetton, NFT, Wallet, etc.) and migrated them **from FunC to Tolk**:
- preserving the original logic and behavior,
- **passing the same test suites** as the FunC versions,
- but written in **idiomatic, expressive Tolk style**,
- with **significantly reduced gas costs**.

**The goal is to show that Tolk can replace FunC** not just in theory — but in production, today.


## 📊 Benchmarks!

In gas units, plus code side (bits / cells).

### 08 — dns

| Operation                       | FunC       | Tolk       | **Gas savings** |
|---------------------------------|------------|------------|-----------------|
| DEPLOY nft                      | 23504      | 15153      | **-35.53%**     |
| TRANSFER nft                    | 8814       | 7361       | **-16.49%**     |
| GET static data                 | 6731       | 4908       | **-27.08%**     |
| AUCTION change content          | 10356      | 7886       | **-23.85%**     |
| FILL UP item                    | 4953       | 3156       | **-36.28%**     |
| CHANGE record                   | 9619       | 8066       | **-16.15%**     |
| CONFIG fill up                  | 8923       | 6506       | **-27.09%**     |
| CONFIG transfer item            | 10824      | 9144       | **-15.52%**     |
| BID item                        | 8777       | 6368       | **-27.45%**     |
| BID item prolong                | 8813       | 6404       | **-27.33%**     |
| DEPLOY nft config               | 24943      | 16661      | **-33.20%**     |
| code size: nft-item             | 12490 / 43 | 13055 / 35 |                 |
| code size: nft-collection       | 4863 / 29  | 4568 / 17  |                 |

<br>

## How does Tolk achieve these numbers?

#### 1. Language design and type system

Tolk code is closer to business logic — and still maps cleanly to the TVM's stack model.

This is not "compiler magic" — it's a result of language design. Just writing straightforward code is often more efficient than manual stack juggling in FunC.

For instance, universal `createMessage`, based on unions, is more lightweight than hand-crafted message cell composition. It also handles `StateInit` and deployment without creating extra cells.

#### 2. The `lazy` keyword

The compiler decides when and where to load data from slices. It enables:
- prefix-based lazy matching without creating unions on a stack,
- loading only the fields you actually use,
- skipping over unused fields or references,
- computing immutable sub-slices for serializing back.

#### 3. Optimizing compiler

Inlining, constant condition folding, grouping of sequential `storeInt`, peephole optimizations, stack reordering — all applied automatically.

#### 4. TVM-11 and TVM-12 instructions

TVM 11 allows accessing incoming message data without parsing `msg_cell`.
TVM 12 has `BTOS` ("builder-to-slice" without intermediate cell creation).
Combined, they contribute ~30% of the savings.
Most of the gain comes from the language itself.

#### 5. Fixing inefficiencies in original FunC code

In some cases, the FunC versions had suboptimal logic. The Tolk versions improve it — while preserving behavior.


## Not just about gas — readability comes first

Tolk is built for **readability**. These contracts aren't "just cleaner" than their FunC equivalents — they're **elegant**.
No magic. No stack tricks. Just clean, consistent logic — whether it's a Jetton or a Wallet.

Take Jettons as an example. Compare these three files:

- a standard jetton config: [01/jetton_utils.tolk](contracts_Tolk/01_jetton/jetton-utils.tolk)
- Notcoin — supports masterchain: [03/jetton_utils.tolk](contracts_Tolk/03_notcoin/jetton-utils.tolk)
- tgBTC — supports sharding: [04/jetton_utils.tolk](contracts_Tolk/04_sharded_tgbtc/jetton-utils.tolk)

They are **remarkably similar**.
Start with a simple Jetton. Want masterchain support? Add a line — and you have Notcoin.
Want sharding? Set the desired `SHARD_DEPTH` — and you get a sharded Jetton.
Message sending and address composition are encapsulated cleanly and declaratively.

And gas savings? They're a **consequence**.
I didn't micro-optimize. Each contract was rewritten in about a day — just focusing on clarity.
If the code is readable, it's probably already efficient.
If the logic is hard to follow — that's where the inefficiency hides.

The compiler and stdlib will keep improving.
But the core principle remains: **if you write code the way the language encourages — gas will take care of itself.**


## Correctness and test coverage

All Tolk contracts here **pass the same test suites** as their FunC originals.

In a few cases, tests were **slightly modified** — but only those that assert specific `exit codes`.

The reason: Tolk fails more gracefully on corrupted input. For example:
- FunC might crash with `exit code 9` ("cell underflow"),
- while Tolk returns `0xFFFF` ("invalid opcode").

So, I updated a few `expect(exit_code)` values — to match the actual (and now more meaningful) behavior.


## How to run and verify

```bash
npm run test:all
```

All tests are executed on Tolk contracts, using the same inputs as the original FunC versions.

The `bench-snapshots/` folder contains gas snapshots for each contract at different stages of rewriting.

You can also follow the Git history to see how each contract evolved — from raw auto-conversion to clean, idiomatic Tolk.


## Want to migrate your own contract from FunC to Tolk?

Start with the [FunC-to-Tolk converter](https://github.com/ton-blockchain/convert-func-to-tolk).
It's a syntax-level tool that preserves 1:1 semantics — giving you a working Tolk version in "FunC-style," ready to be gradually modernized.

Then check out the guide [Tolk vs FunC](https://docs.ton.org/v3/documentation/smart-contracts/tolk/tolk-vs-func/in-short).
It focuses on syntax differences — but keep in mind: **Tolk is more than just new syntax**.
The language encourages a different mindset — one that puts data structures and types at the center, rather than imperative flow.
This philosophy isn't always spelled out in docs — but you'll feel it as you work with the code.

Use the contracts in this repository as a reference — especially the ones you're already familiar with.

Finally, Tolk is supported in blueprint. Run `npm create ton@latest`, and start experimenting!
