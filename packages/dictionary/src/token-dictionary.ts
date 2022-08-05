import { TokenError } from '@css-panda/error';
import { Tokens, TSemanticTokens } from '@css-panda/types';
import { match, P } from 'ts-pattern';
import { assignSemanticTokens, assignTokens } from './assign-token';
import { TokenData } from './get-token-data';

type VarData = Record<'type' | 'value', string>;

/**
 * The token dictionary is a map of tokens to values
 * - stores the css variable name and the value of the token
 * - serves as the interface to other systems
 * - supports semantic tokens
 */
export class Dictionary {
  /**
   * The original token definitions
   */
  #tokens: Partial<Tokens>;
  #semanticTokens: TSemanticTokens;

  constructor({ tokens, semanticTokens = {} }: { tokens: Partial<Tokens>; semanticTokens?: TSemanticTokens }) {
    this.#tokens = tokens;
    this.#semanticTokens = semanticTokens;
    this.registerTokens();
    this.registerSemanticTokens();
    return this;
  }

  registerTokens() {
    assignTokens(this.#tokens, (data) => {
      this.values.set(data.prop, data);
      this.vars.set(data.var, {
        type: data.type,
        value: data.value,
      });
    });
  }

  registerSemanticTokens() {
    assignSemanticTokens(this.#semanticTokens, (data, condition) => {
      const value = this.getRef(data.type, data.value);

      match([condition, data.negative])
        .with(['raw', true], () => {
          data.value = data.varRef;
          this.values.set(data.prop, data);
        })
        .with(['raw', false], () => {
          data.value = data.varRef;
          this.values.set(data.prop, data);
          this.vars.set(data.var, { type: data.type, value });
        })
        .with([P.string, false], () => {
          if (!this.conditionVars.get(condition)) {
            this.conditionVars.set(condition, new Map());
          }
          this.conditionVars.get(condition)!.set(data.var, { type: data.type, value });
        })
        .otherwise(() => {});
    });
  }

  /**
   * The map of token 'dot path' to the token details
   */
  values = new Map<string, TokenData>();

  /**
   * The map of token to the css variable data
   */
  vars = new Map<string, VarData>();

  /**
   * Used for semantic tokens. It is a map of the condition to the token maps
   */
  conditionVars = new Map<string, Map<string, VarData>>();

  /**
   * Regex to check if a value is a ref token
   */
  static REF_REGEX = /^(-?)\$(.+)/;

  /**
   * Whether a ref token if it starts with $ or -$ (regex)
   */
  static isRefToken(value: string) {
    return Dictionary.REF_REGEX.test(value);
  }

  /**
   * Get the raw value of a token even if it's a ref token
   */
  normalize(value: string) {
    return Dictionary.isRefToken(value) ? value.replace('$', '') : value;
  }

  /**
   * Extract meaningful information from a token
   */
  info(category: string, value: string) {
    const isRef = Dictionary.isRefToken(value);
    const raw = this.values.get(`${category}.${this.normalize(value)}`);
    return { isRef, raw, value: this.normalize(value) };
  }

  /**
   * Assert that a semantic token value exists if it's a ref token.
   * It throws an error if it doesn't exist
   */
  assert(category: string, value: string) {
    const info = this.info(category, value);
    if (info.isRef && !info.raw) {
      throw new TokenError(`${category}.${info.value} is not defined`);
    }
    return info.raw;
  }

  /**
   * Get the css variable reference of a value
   */
  getRef(category: string, value: string) {
    const item = this.assert(category, value);
    return item?.varRef ?? value;
  }
}
