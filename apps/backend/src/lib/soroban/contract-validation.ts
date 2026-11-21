/**
 * Contract address validation utilities for Soroban.
 */

export type ContractValidationErrorCode =
  | 'CONTRACT_ADDRESS_REQUIRED'
  | 'CONTRACT_ADDRESS_INVALID_TYPE'
  | 'CONTRACT_ADDRESS_WHITESPACE'
  | 'CONTRACT_ADDRESS_INVALID_LENGTH'
  | 'CONTRACT_ADDRESS_INVALID_FORMAT';

export interface ContractValidationResult {
  valid: boolean;
  code?: ContractValidationErrorCode;
  message?: string;
}

const CONTRACT_ADDRESS_LENGTH = 56;
const CONTRACT_ADDRESS_REGEX = /^C[A-Z2-7]{55}$/;

/**
 * Validates a Soroban contract address.
 *
 * The input is treated as untrusted (e.g. parsed from user JSON), so the
 * runtime type is checked before any string operations are performed.
 *
 * @param address - Untrusted contract address value of unknown type.
 * @returns A validation result describing whether the address is valid.
 */
export function validateContractAddress(address: unknown): ContractValidationResult {
  if (typeof address !== 'string') {
    return {
      valid: false,
      code: 'CONTRACT_ADDRESS_INVALID_TYPE',
      message: `Contract address must be a string, got ${address === null ? 'null' : typeof address}`,
    };
  }

  if (address.length === 0) {
    return {
      valid: false,
      code: 'CONTRACT_ADDRESS_REQUIRED',
      message: 'Contract address is required',
    };
  }

  if (/\s/.test(address)) {
    return {
      valid: false,
      code: 'CONTRACT_ADDRESS_WHITESPACE',
      message: 'Contract address must not contain whitespace',
    };
  }

  if (address.length !== CONTRACT_ADDRESS_LENGTH) {
    return {
      valid: false,
      code: 'CONTRACT_ADDRESS_INVALID_LENGTH',
      message: `Contract address must be ${CONTRACT_ADDRESS_LENGTH} characters, got ${address.length}`,
    };
  }

  if (!CONTRACT_ADDRESS_REGEX.test(address)) {
    return {
      valid: false,
      code: 'CONTRACT_ADDRESS_INVALID_FORMAT',
      message: 'Contract address must start with "C" and contain only base32 characters',
    };
  }

  return { valid: true };
}
