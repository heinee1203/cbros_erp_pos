export type DiscountRuleQuery = {
  isActive?: string;
  type?: string;
  scope?: string;
};

export type DiscountCalculationBody = {
  items: any[];
  customerId?: string;
};

export function parseDiscountRuleFilters(query: DiscountRuleQuery) {
  return {
    isActive:
      query.isActive === "true"
        ? true
        : query.isActive === "false"
          ? false
          : undefined,
    type: query.type,
    scope: query.scope,
  };
}
