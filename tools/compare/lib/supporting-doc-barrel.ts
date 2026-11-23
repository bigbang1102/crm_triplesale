// What the comparison harness needs of the supporting-document screens, as ONE module (tools/compare/lib/load-ts.mjs mirrors a module and everything
// it reaches into a fresh folder per call: one entry = one instance of the mock, the service and the beans).
export * from '../../../src/app/features/supporting-docs/supporting-doc-types';
export * from '../../../src/app/features/supporting-docs/supporting-doc.logic';
export * from '../../../src/app/features/supporting-docs/supporting-doc.service';
export * from '../../../src/app/features/supporting-docs/supporting-doc.bean';
export * from '../../../src/app/features/supporting-docs/supporting-doc.mock';
