// What the comparison harness needs of the prospect form, as ONE module (tools/compare/lib/load-ts.mjs mirrors a module and everything it reaches
// into a fresh folder per call: one entry = one instance of the mock, the service and the bean).
export * from '../../../src/app/features/prospects/form/prospect-form.logic';
export * from '../../../src/app/features/prospects/form/prospect-form.service';
export * from '../../../src/app/features/prospects/form/prospect-form.bean';
export * from '../../../src/app/features/prospects/form/prospect-form.mock';
