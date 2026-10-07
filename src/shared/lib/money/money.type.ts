declare const senBrand: unique symbol;

export type Sen = number & { readonly [senBrand]: true };

export type Money = { minor: Sen; currency: "MYR" };

export type WireMoney = { minor: number; currency: "MYR" };
