import { keepLicenceWhole } from './keep-licence-whole';

describe('keepLicenceWhole', () => {
  it('wraps the licence so it cannot break at its hyphen', () => {
    expect(keepLicenceWhole('Under the AGPL-3.0, free')).toBe(
      'Under the <span class="whitespace-nowrap">AGPL-3.0</span>, free',
    );
  });

  it('escapes the rest of the text', () => {
    expect(keepLicenceWhole('<b>AGPL-3.0</b>')).toBe(
      '&lt;b&gt;<span class="whitespace-nowrap">AGPL-3.0</span>&lt;/b&gt;',
    );
  });
});
