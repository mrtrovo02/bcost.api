declare module 'ms' {
  export type StringValue = string;
}

declare module 'ofx-js' {
  export function parse(input: string): unknown;
}