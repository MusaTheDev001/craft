import { StrKey } from '@stellar/stellar-sdk';

export type ContractAddressErrorCode =
  | 'WHITESPACE'
  | 'EMPTY'
  | 'LENGTH'
  | 'PREFIX'
  | 'CHARSET'
  | 'CHECKSUM'
  | 'VERSION_BYTE';

export type ContractAddressValidationResult =
  | { valid: true; address: string }
  | { valid: false; code: ContractAddressErrorCode; message: string };

const CONTRACT_ADDRESS_LENGTH = 56;
const CONTRACT_ADDRESS_PREFIX = 'C';
const BASE32_CHARSET = /^[A-Z2-7]+$/;

/**
 * Validates a Soroban contract address (StrKey `C...`).
 *
 * Checks are ordered and strict; the first failing check determines the
 * returned error code.
 */
export function validateContractAddress(
  input: unknown,
): ContractAddressValidationResult {
  if (typeof input !== 'string') {
    return { valid: false, code: 'EMPTY', message: 'Address must be a string' };
  }

  if (/\s/.test(input)) {
    return {
      valid: false,
      code: 'WHITESPACE',
      message: 'Address must not contain whitespace',
    };
  }

  if (input.length === 0) {
    return { valid: false, code: 'EMPTY', message: 'Address must not be empty' };
  }

  if (input.length !== CONTRACT_ADDRESS_LENGTH) {
    return {
      valid: false,
      code: 'LENGTH',
      message: `Address must be ${CONTRACT_ADDRESS_LENGTH} characters`,
    };
  }

  if (!input.startsWith(CONTRACT_ADDRESS_PREFIX)) {
    return {
      valid: false,
      code: 'PREFIX',
      message: `Address must start with '${CONTRACT_ADDRESS_PREFIX}'`,
    };
  }

  if (!BASE32_CHARSET.test(input)) {
    return {
      valid: false,
      code: 'CHARSET',
      message: 'Address must be valid base32 (A-Z, 2-7)',
    };
  }

  if (!StrKey.isValidContract(input)) {
    return {
      valid: false,
      code: 'CHECKSUM',
      message: 'Address checksum is invalid',
    };
  }

  const versionByte = StrKey.decodeContract(input)[0];
  if (versionByte !== StrKey.getVersionByteForPrefix('C')) {
    return {
      valid: false,
      code: 'VERSION_BYTE',
      message: 'Address version byte is invalid',
    };
  }

  return { valid: true, address: input };
}
