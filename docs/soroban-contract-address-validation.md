# Soroban Contract Address Validation

This document describes how Soroban contract addresses (`C...` StrKey values) are
validated by `apps/backend/src/lib/soroban/contract-validation.ts` via the
`validateContractAddress` function, and the error codes it can return.

## Overview

A Soroban contract address is a 56-character StrKey string that starts with `C`.
It is base32-encoded (RFC 4648 alphabet `A-Z` and `2-7`) and carries a SEP-0023
version byte plus a CRC16 checksum. Validation is performed in a fixed order;
the **first** failing check determines the returned error code.

## Validation Steps

The checks run in the following order:

1. **Type check** — the input must be a string. Non-string input returns `EMPTY`
   with the message `Address must be a string`.
2. **Whitespace check** — the input must not contain any whitespace characters
   (`\s`). Failing returns `WHITESPACE`.
3. **Empty check** — the input must not be empty. Failing returns `EMPTY`.
4. **Length check** — the input must be exactly 56 characters. Failing returns
   `LENGTH`.
5. **Prefix check** — the input must start with `C`. Failing returns `PREFIX`.
6. **Charset check** — the input must be valid base32 (`A-Z`, `2-7`). Failing
   returns `CHARSET`.
7. **Checksum check** — `StrKey.isValidContract` must succeed, verifying the
   CRC16 checksum. Failing returns `CHECKSUM`.
8. **Version byte check** — the decoded version byte must equal the StrKey
   version byte for the `C` prefix. Failing returns `VERSION_BYTE`.

> **Security note:** the checksum and version-byte checks are **not optional**.
> They are what distinguish a genuine contract address from an arbitrary
> 56-character base32 string. Never skip or reorder them, and never treat a
> `CHECKSUM` or `VERSION_BYTE` failure as a warning.

## Error Codes

| Code           | Message                                    | Cause                                                        |
| -------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `EMPTY`        | `Address must be a string`                 | Input is not a string.                                       |
| `WHITESPACE`   | `Address must not contain whitespace`      | Input contains whitespace.                                   |
| `EMPTY`        | `Address must not be empty`                | Input is an empty string.                                    |
| `LENGTH`       | `Address must be 56 characters`            | Input length is not 56.                                      |
| `PREFIX`       | `Address must start with 'C'`              | Input does not begin with `C`.                               |
| `CHARSET`      | `Address must be valid base32 (A-Z, 2-7)`  | Input contains characters outside the base32 alphabet.       |
| `CHECKSUM`     | `Address checksum is invalid`              | CRC16 checksum verification failed.                          |
| `VERSION_BYTE` | `Address version byte is invalid`          | Decoded version byte does not match the `C` prefix.          |

## SEP-0023 Version Byte

Soroban contract addresses follow [SEP-0023](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0023.md).
The first byte of the decoded payload is the **version byte**, which identifies
what kind of StrKey the value is. For contract addresses this version byte is
`0x10` (decimal 16).

The version byte is what `StrKey.getVersionByteForPrefix('C')` returns, and the
`VERSION_BYTE` check confirms the decoded value carries `0x10` before the
address is accepted.

## Examples

### Valid

```
CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM
```

A well-formed 56-character `C...` address with a valid base32 body, correct
CRC16 checksum, and the `0x10` version byte.

### Invalid

| Input                                                      | Error code     | Reason                                   |
| ---------------------------------------------------------- | -------------- | ---------------------------------------- |
| `" CAAAA..."` (leading space)                              | `WHITESPACE`   | Contains whitespace.                     |
| `""`                                                       | `EMPTY`        | Empty string.                            |
| `"CABC"`                                                   | `LENGTH`       | Not 56 characters.                       |
| `"GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"` | `PREFIX`     | Does not start with `C`.                 |
| `"C0000000000000000000000000000000000000000000000000000000"` | `CHARSET`    | Contains `0`, outside base32 alphabet.   |
| `"CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"`  | `CHECKSUM`   | Checksum does not verify.                |
| A valid `G...` account address                             | `PREFIX`       | Account addresses are not contracts.     |

## Related

- Source: `apps/backend/src/lib/soroban/contract-validation.ts`
- Tests: `apps/backend/src/lib/soroban/contract-validation.test.ts`
