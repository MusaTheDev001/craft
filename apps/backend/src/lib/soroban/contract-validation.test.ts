import { describe, it, expect } from 'vitest';
import { validateContractAddress } from './contract-validation';

type ErrorCode =
  | 'WHITESPACE'
  | 'EMPTY'
  | 'LENGTH'
  | 'PREFIX'
  | 'CHARSET'
  | 'CHECKSUM'
  | 'VERSION_BYTE';

const VALID_ADDRESS =
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

describe('validateContractAddress', () => {
  const cases: Array<[string, string, ErrorCode]> = [
    ['whitespace', ' CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4', 'WHITESPACE'],
    ['empty', '', 'EMPTY'],
    ['length', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC', 'LENGTH'],
    ['prefix', 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4', 'PREFIX'],
    ['charset', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC!', 'CHARSET'],
    ['checksum', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC5', 'CHECKSUM'],
    ['version byte', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4', 'VERSION_BYTE'],
  ];

  it.each(cases)('rejects %s input with %s', (_name, input, expectedCode) => {
    const result = validateContractAddress(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(expectedCode);
    }
  });

  it('accepts a valid contract address', () => {
    const result = validateContractAddress(VALID_ADDRESS);
    expect(result.ok).toBe(true);
  });
});
