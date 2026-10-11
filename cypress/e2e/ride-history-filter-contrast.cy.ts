const themes = ['light', 'dark', 'system'] as const;
const filters = [
  { value: 'solo', label: 'Solo' },
  { value: 'group', label: 'Group' },
] as const;

const relativeLuminance = (color: string) => {
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Could not parse rendered color: ${color}`);
  const linear = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrastRatio = (foreground: string, background: string) => {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
};

describe('Ride History filter contrast', () => {
  themes.forEach((theme) => {
    it(`keeps Solo and Group labels legible in ${theme} theme`, () => {
      cy.viewport(384, 824);
      cy.visit('/ride-history', {
        onBeforeLoad(win) {
          win.localStorage.setItem('roadtrip:theme-preference', theme);
        },
      });

      cy.get('ion-segment[aria-label="Filter ride history"]').should('be.visible');
      cy.document().its('documentElement.dataset.themePreference').should('equal', theme);

      filters.forEach(({ value, label }) => {
        cy.get(`ion-segment-button[value="${value}"]`).click().should(($button) => {
          expect($button.text().trim().toLowerCase(), `${label} remains present`).to.equal(label.toLowerCase());
          expect($button.hasClass('segment-button-checked'), `${label} is the active filter`).to.equal(true);
        }).then(($button) => {
          const button = $button[0];
          const document = button.ownerDocument;
          const foreground = getComputedStyle(button).color;
          let ancestor: HTMLElement | null = button;
          let background = '';

          while (ancestor && !background) {
            const candidate = getComputedStyle(ancestor).backgroundColor;
            const alpha = candidate.match(/rgba?\([^)]*[,/]\s*([\d.]+)\s*\)$/)?.[1];
            if (!candidate.includes('rgba') || (alpha !== undefined && Number(alpha) > 0)) {
              background = candidate;
            }
            ancestor = ancestor.parentElement;
          }

          if (!background) background = getComputedStyle(document.documentElement).backgroundColor;
          expect(foreground, `${theme} ${label} rendered text color`).not.to.equal(background);
          expect(
            contrastRatio(foreground, background),
            `${theme} ${label} contrast (${foreground} on ${background})`,
          ).to.be.at.least(4.5);
        });
      });
    });
  });
});
