export type ScopeSelector = number[] | 'all';

export interface MetricScope {
    businessUnit: ScopeSelector;
    department: ScopeSelector;
}


interface MetricBase {
    id: string;
    code: string;
    scope: MetricScope;
}

export interface BaseMetric extends MetricBase {
    type: 'base';
    //BaseMetric no tiene expresión
}

export interface NestedMetric extends MetricBase {
    type: 'nested';
    expression: string;
}

export type Metric = BaseMetric | NestedMetric;